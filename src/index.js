#!/usr/bin/env node
/**
 * cgate-mqtt — Clipsal C-Gate to MQTT bridge
 *
 * Architecture overview:
 *   - Two persistent TCP connections to the C-Gate server:
 *       • Command port (20023): sends C-Bus commands (ON, OFF, RAMP, GET)
 *       • Event  port (20025): receives unsolicited C-Bus lighting/trigger events
 *   - One MQTT connection to the broker for:
 *       • Subscribing to  cbus/#  (Home Assistant / user commands)
 *       • Publishing state, brightness, discovery, and DLT messages
 *
 *   All three connections are independent; the bridge only considers itself
 *   "started" once ALL three are simultaneously connected (see started()).
 *
 *   Two rate-limited message queues (cgateCommand, mqttMessage) prevent
 *   flooding either the C-Gate server or the MQTT broker.
 */

var mqtt    = require('mqtt');          // MQTT client library
var net     = require('net');           // Node.js TCP socket
var events  = require('events');        // EventEmitter (used for internal level events)
var settings = require('./settings.js'); // User configuration (IPs, credentials, flags)
// const { connect } = require('http2');
var parseString = require('xml2js').parseString; // Used for legacy tree parsing via handleParsedTree
const fs    = require('fs');            // File system — reads HOME.xml C-Bus project file
const path  = require('path');          // Path helpers for locating HOME.xml
const xml2js = require('xml2js');       // Full XML parser used in readXmlFile()

// Import package.json so version/name can be referenced at runtime
var package = require('./package.json');

// Print startup banner so the container log makes the version immediately visible
console.log(`Starting ${package.name} ... Version: ${package.version}`);

// MQTT publish options — if retainreads is set, all state messages are retained
// on the broker so Home Assistant gets current state immediately on reconnect.
var options = {};
if (settings.retainreads === true) {
  options.retain = true;
}

// var topicPrefix = "";
// if (settings.topicPrefix) {
//   topicPrefix = `${settings.topicPrefix}/`;
// }


// Accumulated XML fragment from multi-line C-Gate tree responses (codes 347/343/344)
var tree = '';
var treenet = 0;

// Timer handles — stored so they can be cleared on reconnect to avoid leaking.
// commandInterval / eventInterval: reconnect-delay timers (setTimeout) for each TCP socket.
// getallInterval: periodic GET all-levels timer (setInterval) controlled by settings.getallperiod.
// dltInterval:    periodic DLT time-sync timer  (setInterval) controlled by settings.updateDltTimePeriod.
var interval = {};
var commandInterval = {};
var eventInterval = {};
var dltInterval = null;
var getallInterval = null;

// Connection-state flags — started() checks all three before doing any initialisation work.
var mqttConnected     = false;
var cbusCmdConnected  = false;
var cbusEventConnected = false;

// Line-buffer for the C-Gate command port data handler.
// TCP data arrives in arbitrary chunks; we accumulate here and split on newlines.
var buffer = "";

var eventEmitter = new events.EventEmitter(); // Internal bus — used to forward level values
var messageinterval = settings.messageinterval || 200; // ms between queued messages
var logging = settings.logging;  // Convenience alias
var isRamping = false;           // Debounce flag used during RAMP events

// discoverySent tracks unique IDs already announced to Home Assistant via MQTT discovery,
// preventing duplicate config payloads on every reconnect.
var discoverySent = [];

// triggerActions is a sparse array indexed by the C-Bus trigger level address.
// Populated by readXmlFile() from the project Trigger Application (app 202).
// Used in handleTriggerEvent() to resolve a level index to a human-readable tag name.
var triggerActions = [];

// Device class constants that map to Home Assistant MQTT discovery component types.
var HASS_DEVICE_CLASSES = {
  LIGHT:  "light",
  RELAY:  "switch",
  BUTTON: "button",
  DEVICE: "device"
};

// dltUnits holds metadata for each DLT (Electronic Dynamic Labelling) wall switch
// discovered from HOME.xml. Keyed by C-Bus address string "network/app/group".
// Used by updateAllDltTime() to push time/date synchronisation to each unit.
var dltUnits = {};


// ---------------------------------------------------------------------------
// MQTT connection
// The mqtt library handles reconnection automatically (reconnectPeriod: 1000).
// We do NOT set the will/LWT here; the bridge publishes its own online/offline
// status from the connect / disconnect handlers below.
// ---------------------------------------------------------------------------
var mqttClient = mqtt.connect(`mqtt://${settings.mqtt}`, {
  username: settings.mqttusername,
  password: settings.mqttpassword,
  reconnect: true, // Enable automatic reconnection
  reconnectPeriod: 1000 // Reconnect every 1 second
});

// ---------------------------------------------------------------------------
// C-Gate TCP sockets
//
// C-Gate exposes two plain-text (telnet-style) TCP ports:
//   20023 — Command port: we WRITE commands here (ON, OFF, RAMP, GET, EVENT ON)
//            and READ acknowledgement / response data (codes 300, 343, 344, 347)
//   20025 — Event  port: READ-ONLY stream of unsolicited lighting and trigger events
//            emitted by C-Gate whenever physical switches are operated.
// Both sockets reconnect automatically via their 'close' handlers below.
// ---------------------------------------------------------------------------
var cbusCmdChannel  = new net.Socket();
var cbusEventChannel = new net.Socket();
var cgateIpAddr  = settings.cbusip;
var cbusCmdPort  = 20023;  // C-Gate command/query port
var cbusEventPort = 20025; // C-Gate event monitor port

// Initiate the TCP connections; reconnection is handled in each socket's 'close' handler.
cbusCmdChannel.connect(cbusCmdPort, cgateIpAddr);
cbusEventChannel.connect(cbusEventPort, cgateIpAddr);



// ---------------------------------------------------------------------------
// cgateCommand — rate-limited write queue for the C-Gate command port
//
// C-Gate can be overwhelmed if many commands arrive simultaneously (e.g. during
// startup GET all-levels).  This queue drains at settings.messageinterval ms per
// message.  The setInterval is only active while there are pending messages;
// it stops itself when the queue empties to avoid unnecessary CPU wake-ups.
//
// Usage:  cgateCommand.write('ON //HOME/254/56/10\n');
// ---------------------------------------------------------------------------
var cgateCommand = {
  // Enqueue a raw C-Gate command string and kick the drain loop if idle.
  write: function (value) {
    cgateCommand.queue.push(value);
    if (cgateCommand.interval === null) {
      cgateCommand.interval = setInterval(cgateCommand.process, messageinterval);
      cgateCommand.process(); // process first item immediately, don't wait one interval
    }
  },
  // Drain one item per tick; stop the timer when the queue is empty.
  process: function () {
    if (cgateCommand.queue.length === 0) {
      clearInterval(cgateCommand.interval);
      cgateCommand.interval = null;
    } else {
      cbusCmdChannel.write(cgateCommand.queue.shift());
    }
  },
  interval: null, // setInterval handle — null means the drain loop is not running
  queue: []       // pending command strings
}

// ---------------------------------------------------------------------------
// mqttMessage — rate-limited publish queue for the MQTT broker
//
// Mirrors the cgateCommand queue pattern.  All outbound MQTT publishes go
// through this queue so rapid bursts (e.g. full level poll on startup) don't
// overwhelm the broker or cause packet loss.
//
// All messages are published with retain:true so Home Assistant receives the
// last-known state immediately after a restart or reconnect.
//
// Usage:  mqttMessage.publish('cbus/light/cbus2-mqtt/cbus_254_56_1/state', 'ON');
// ---------------------------------------------------------------------------
var mqttMessage = {
  // Enqueue a {topic, payload} object and kick the drain loop if idle.
  publish: function (topic, payload) {
    mqttMessage.queue.push({ topic: topic, payload: payload });
    if (mqttMessage.interval === null) {
      mqttMessage.interval = setInterval(mqttMessage.process, messageinterval);
      mqttMessage.process(); // send first item immediately
    }
  },
  // Drain one item per tick; stop the timer when the queue is empty.
  process: function () {
    if (mqttMessage.queue.length === 0) {
      clearInterval(mqttMessage.interval);
      mqttMessage.interval = null;
    } else {
      var msg = mqttMessage.queue.shift();
      mqttClient.publish(msg.topic, msg.payload, { retain: true }, (err) => {
        if (err) {
          console.error('Failed to publish message:', err);
        }
      });
    }
  },
  interval: null, // setInterval handle — null means the drain loop is not running
  queue: []       // pending {topic, payload} objects
}




// ===========================================================================
// MQTT event handlers
// ===========================================================================

// Mark disconnected — started() will not proceed until this is true again.
mqttClient.on('disconnect', () => {
  mqttConnected = false;
});

mqttClient.on('offline', () => {
  console.log('MQTT client is offline. Attempting to reconnect...');
});

mqttClient.on('reconnect', () => {
  console.log('MQTT client is reconnecting...');
});

mqttClient.on('connect', () => {
  mqttConnected = true;
  console.log(`CONNECTED TO MQTT: ${settings.mqtt}`);

  // Attempt startup — will no-op unless C-Gate ports are also connected.
  started();

  // Subscribe to the entire cbus/ namespace.  All command topics from Home
  // Assistant land here (e.g. cbus/light/cbus2-mqtt/<id>/set).
  mqttClient.subscribe('cbus/#', (err) => {
    if (err) {
      console.error(`Error subscribing to cbus/#: ${err}`);
      return;
    }
    // Route every inbound message to the central MQTT handler.
    mqttClient.on('message', (topicArg, message, packet) => {
      handleMqttMessage(topicArg, message);
    });
  });

  // Announce bridge presence — retained so HA shows the bridge as available
  // even if it subscribes after this publish.
  mqttClient.publish('cbus/bridge/cbus2-mqtt/state', 'online', options, (err) => {
    if (err) {
      console.error(`Error publishing cbus/bridge/cbus2-mqtt/state: ${err}`);
      return;
    }
  });
});


// ===========================================================================
// C-Gate command port (TCP 20023) event handlers
// ===========================================================================

cbusCmdChannel.on('error', function (err) {
  console.log('COMMAND ERROR:' + JSON.stringify(err));
});

cbusCmdChannel.on('connect', function (err) {
  cbusCmdConnected = true;
  console.log('CONNECTED TO C-GATE COMMAND PORT: ' + cgateIpAddr + ':' + cbusCmdPort);
  // Tell C-Gate to forward events on this connection too (belt-and-braces).
  cgateCommand.write('EVENT ON\n');
  // Attempt startup — will no-op unless MQTT and event port are also up.
  started();
  // Cancel any pending reconnect timer now that we're connected.
  clearInterval(commandInterval);
});

cbusCmdChannel.on('close', function () {
  cbusCmdConnected = false;
  console.log('COMMAND PORT DISCONNECTED');
  // Schedule a reconnect attempt after 10 s.  The handle is stored so we can
  // cancel it if the socket reconnects before the timer fires.
  commandInterval = setTimeout(function () {
    console.log('COMMAND PORT RECONNECTING...');
    cbusCmdChannel.connect(cbusCmdPort, cgateIpAddr);
  }, 10000);
});

// C-Gate command-port response parser.
//
// C-Gate responses follow a multi-digit numeric code scheme:
//   300-xxx  — level report: current group light level (response to GET)
//   343      — begin of network tree listing
//   347-xxx  — one line of network tree XML data
//   344 xxx  — end of network tree listing (triggers XML parse)
//
// TCP data arrives in variable-length chunks so we use a line buffer:
//   - Prepend leftover from previous chunk, split on newlines.
//   - Process all complete lines (0 .. len-2); keep the trailing partial
//     line (which may be empty) for the next chunk.
cbusCmdChannel.on('data', function (data) {
  if (logging == true) { console.log('Command data: ' + data); }

  // Combine any partial line left over from the previous data event with
  // the new chunk, then split into candidate lines.
  const lines = (buffer + data.toString()).split("\n");

  // The last element is either empty (chunk ended on \n) or an incomplete
  // line that must be held until the next chunk arrives.
  buffer = lines[lines.length - 1];

  // Process every complete line (all but the final held fragment).
  if (lines.length > 1) {
    for (let i = 0; i < lines.length - 1; i++) {
      // C-Gate uses a hyphen to separate the response code from its payload.
      const parts1 = lines[i].toString().split("-");

      if (parts1.length > 1 && parts1[0] == "300") {
        // 300-<address> <level>  — level report with hyphen separator
        const parts2 = parts1[1].toString().split(" ");
        handleLightData(parts2);
      } else if (parts1[0] == "347") {
        // 347-<xml fragment>  — accumulate XML tree data
        handleTreeData(parts1[1]);
      } else if (parts1[0] == "343") {
        // 343  — tree listing starting; reset accumulator
        tree = '';
      } else if (parts1[0].split(" ")[0] == "344") {
        // 344 ...  — tree listing complete; parse accumulated XML
        parseString(tree, handleParsedTree);
      } else if (parts1[0] == "300") {
        // 300 <address> <level>  — level report without hyphen separator
        const parts2 = parts1[0].toString().split(" ");
        handleLightData(parts2);
      }
    }
  }
});




// ===========================================================================
// C-Gate event port (TCP 20025) event handlers
// ===========================================================================

cbusEventChannel.on('error', function (err) {
  console.log('EVENT ERROR:' + JSON.stringify(err));
});

cbusEventChannel.on('connect', function (err) {
  cbusEventConnected = true;
  console.log('CONNECTED TO C-GATE EVENT PORT: ' + cgateIpAddr + ':' + cbusEventPort);
  // Attempt startup — will no-op unless MQTT and command port are also up.
  started();
  // Cancel any pending reconnect timer.
  clearInterval(eventInterval);
});

cbusEventChannel.on('close', function () {
  cbusEventConnected = false;
  console.log('EVENT PORT DISCONNECTED');
  // Schedule reconnect after 10 s.
  eventInterval = setTimeout(function () {
    console.log('EVENT PORT RECONNECTING...');
    cbusEventChannel.connect(cbusEventPort, cgateIpAddr);
  }, 10000);
});

// C-Gate event port data handler.
//
// C-Gate emits one event per line, space-delimited.  Common formats:
//
//   lighting on  //HOME/254/56/10
//   lighting off //HOME/254/56/10
//   lighting ramp //HOME/254/56/10 255 04:00
//   lighting label //HOME/254/56  1 129 - 0 48656C6C6F   (DLT label echo)
//   trigger event //HOME/254/202/1 1 #sourceunit=5
//
// The address field (parts[2]) is always "//NETWORK/net/app/group".
// We split on "/" and take indices [3..5] to build the uniqueId used for
// MQTT topics and Home Assistant discovery.
cbusEventChannel.on('data', function (data) {
  if (logging === true) {
    console.log(`Event data: ${data}`);
  }

  // Split the event line on spaces to get the type, sub-type, address, etc.
  const parts = data.toString().split(" ");

  // Extract the network/app/group segments from the address field.
  // Address format: //CBUSNAME/network/application/group
  let address = parts[2].split("/");

  // DLT label events use a double-space before the group number, so a naive
  // split produces an empty-string element that shifts all subsequent indices.
  // Compact away empty strings for label events only so other event types
  // keep their original index positions.
  if (parts[0] === "lighting" && parts[1] === "label") {
    const filteredParts = parts.filter(p => p !== "");
    const groupAddress = filteredParts[4];
    // Append the group segment so indices [3..5] remain consistent.
    address.push(groupAddress);
  }

  // Build the stable unique identifier used across MQTT topics:
  //   cbus_<network>_<application>_<group>  e.g. cbus_254_56_10
  const uniqueId = `cbus_${address[3]}_${address[4]}_${address[5]}`;

  // Route to the appropriate handler based on the C-Bus application type.
  switch (parts[0]) {
    case "trigger":
      handleTriggerEvent(parts, uniqueId);
      break;
    case "lighting":
      handleLightingEvent(parts, uniqueId);
      break;
    default:
      // Silently ignore unknown event types (e.g. temperature, security)
  }
});



// Placeholder debounce callback — currently unused but reserved for future
// ramp-complete detection logic.
function ramping() {
  isRamping = false;
}

/**
 * started() — one-time initialisation that runs when ALL three connections are up.
 *
 * Called from the 'connect' handler of each of the three connections (MQTT,
 * command port, event port).  The guard at the top means only the LAST of the
 * three connections to come up will actually execute the body; the first two
 * calls are no-ops.
 *
 * What it does:
 *   1. Sends the bridge device discovery message to Home Assistant.
 *   2. Parses HOME.xml to discover lighting groups, trigger actions, and DLT
 *      units, then sends per-device discovery messages.
 *   3. Optionally issues a GET all-levels command on startup to prime state.
 *   4. Optionally starts a periodic GET all-levels timer (getallInterval).
 *   5. Optionally starts DLT time-sync on startup and/or periodically.
 */
function started() {
  if (cbusCmdConnected && cbusEventConnected && mqttClient.connected) {
    console.log('ALL CONNECTED');

    // Announce the bridge itself to Home Assistant as a sensor/device.
    sendDiscoveryMessage(HASS_DEVICE_CLASSES.DEVICE);

    // Parse the C-Bus project XML to build the group/trigger/DLT maps and
    // send individual Home Assistant discovery messages for each entity.
    readXmlFile('HOME.xml');

    // Immediately poll all group levels so MQTT state reflects physical reality
    // without waiting for the first lighting event.  Useful after a restart.
    if (settings.getallnetapp && settings.getallonstart) {
      console.log('Getting all values');
      cgateCommand.write('GET //' + settings.cbusname + '/' + settings.getallnetapp + '/* level\n');
    }

    // Start a recurring poll if configured.  Guard-clear ensures we don't
    // accumulate timers across multiple reconnect cycles (fixes issue #21).
    if (settings.getallnetapp && settings.getallperiod) {
      if (getallInterval) { clearInterval(getallInterval); }
      getallInterval = setInterval(function () {
        console.log('Getting all values');
        cgateCommand.write('GET //' + settings.cbusname + '/' + settings.getallnetapp + '/* level\n');
      }, settings.getallperiod * 1000);
    }

    // DLT (Electronic Dynamic Labelling) startup logic.
    if (settings.enableDltSupport) {
      if (settings.updateDltTimeOnStart) {
        // Defer the initial time push by 5 s so readXmlFile() above has time
        // to finish parsing and populate the dltUnits map before we iterate it.
        setTimeout(function () {
          if (logging) { console.log('Updating DLT time/date after discovery'); }
          updateAllDltTime();
        }, 5000);
      }
      // Start periodic time-sync timer.  Guard-clear prevents timer leaks on
      // reconnect (same pattern as getallInterval above).
      if (settings.updateDltTimePeriod) {
        if (dltInterval) { clearInterval(dltInterval); }
        dltInterval = setInterval(function () {
          if (logging) { console.log('Updating DLT time/date'); }
          updateAllDltTime();
        }, settings.updateDltTimePeriod * 1000);
      }
    }
  }
}


/**
 * handleMqttMessage — central router for all inbound MQTT messages.
 *
 * All messages matching the cbus/# subscription arrive here.  The topic
 * structure determines the action:
 *
 *   cbus/dlt/<unit>/<line>/set        → DLT label update (handleDltLabelMessage)
 *   cbus/<class>/cbus2-mqtt/<id>/set  → turn a light ON or OFF
 *   cbus/<class>/cbus2-mqtt/<id>/brightness/set → dim to a percentage (0-100)
 *   cbus/<class>/cbus2-mqtt/<id>/state          → ignored (we publish this ourselves)
 *   cbus/<class>/cbus2-mqtt/<id>/attributes     → ignored (read-only metadata)
 *
 * Topic parts breakdown (split on "/"):
 *   parts[0] = "cbus"
 *   parts[1] = application class ("light", "event", "dlt", etc.)
 *   parts[2] = bridge ID ("cbus2-mqtt")
 *   parts[3] = uniqueId ("cbus_254_56_10") — underscore-separated address
 *   parts[4..] = sub-topic ("set", "brightness", "state", etc.)
 *
 * The C-Bus address is recovered from the uniqueId by stripping the "cbus_"
 * prefix and replacing underscores with slashes: "254/56/10".
 */
function handleMqttMessage(topicArg, message) {
  if (logging === true) {
    console.log(`Message received on ${topicArg}: ${message}`);
  }
  let topic = topicArg;
  const parts = topic.split("/");

  // DLT label-set messages have a different topic shape (cbus/dlt/...)
  // so handle them first before trying to extract a standard uniqueId.
  if (parts[1] === "dlt" && parts[parts.length - 1] === "set") {
    handleDltLabelMessage(parts, message);
    return;
  }

  // Guard: a valid cbus control topic needs at least 4 parts (cbus/<class>/<bridge>/<id>).
  // Topics shorter than this cannot carry a uniqueId and would crash on parts[3].
  if (parts.length < 4) {
    console.log(`Ignoring malformed topic (too few segments): ${topicArg}`);
    return;
  }

  // Recover C-Bus address from the uniqueId segment.
  // uniqueId format: "cbus_<net>_<app>_<group>"  →  "<net>/<app>/<group>"
  const cbusAddress = parts[3].split("_").slice(1).join("/");

  // Dispatch on the final topic segment (the "verb").
  switch (parts[parts.length - 1].toLowerCase()) {
    case "set":
      console.log(`Set Command :: [${parts[parts.length - 2].toLowerCase()}] ${message} for ${cbusAddress} received`);
      switch (parts[parts.length - 2].toLowerCase()) {
        case "brightness":
          // Home Assistant sends brightness as a percentage (0-100).
          // C-Gate expects a raw level (0-255), so scale accordingly.
          const level = Math.round(parseInt(message) * 255 / 100);
          if (!isNaN(level) && level < 256) {
            cgateCommand.write(`RAMP //${settings.cbusname}/${cbusAddress} ${level}\n`);
          }
          break;
        default:
          // Plain on/off command from the light's command_topic.
          if (message.toString() === "ON") {
            cgateCommand.write(`ON //${settings.cbusname}/${cbusAddress}\n`);
          } else if (message.toString() === "OFF") {
            cgateCommand.write(`OFF //${settings.cbusname}/${cbusAddress}\n`);
          }
      }
      break;
    case "state":
      // The bridge itself publishes to state topics — ignore our own echoes.
      break;
    case "attributes":
      // Read-only JSON metadata published by the bridge — ignore.
      break;
    default:
      console.log(`Ignoring [${parts[parts.length - 1].toLowerCase()}] "${message}" message for ${topic}`);
  }
}



function handleDltLabelMessage(parts, message) {
  if (!settings.enableDltSupport) { return; }
  // Topic format: cbus/dlt/{unit_address}/{line}/set
  // Example: cbus/dlt/254_56_10/1/set
  const unitId = parts[2]; // e.g., "254_56_10"
  const line = parseInt(parts[3], 10); // line number (1-8 typically)
  if (!unitId || isNaN(line) || line < 1) {
    console.log(`DLT: invalid topic format, ignoring`);
    return;
  }
  const text = message.toString();
  
  // Convert unit_address format to C-Bus address format
  const cbusAddress = unitId.split("_").join("/");
  
  // For Saturn eDLT, extract just network/group (remove application)
  const addressParts = cbusAddress.split("/");
  const network = addressParts[0];
  const group = addressParts[2];
  const shortAddress = `${network}/${group}`;
  
  // Saturn buttons are 0-indexed, so subtract 1
  const buttonIndex = line - 1;
  
  // Process template if enabled
  const processedText = settings.enableDltTemplating ? processTemplate(text) : text;
  
  setDltLabel(shortAddress, buttonIndex, processedText);
}

function setDltLabel(address, line, text) {
  // Saturn eDLT uses: lighting label <network>/<app> 1 <group> - <button> <hex-encoded-text>\r\n
  // Example: lighting label 254/56 1 129 - 0 48656C6C6F\r\n
  
  // Extract network and group from address (address is like "254/129")
  const parts = address.split('/');
  const network = parts[0];
  const group = parts[1];
  
  // Hex encode the text
  const hexText = Buffer.from(text, 'utf8').toString('hex');
  
  // Build command
  const command = `lighting label ${network}/56 1 ${group} - ${line} ${hexText}\r\n`;
  if (logging) {
    console.log(`Setting DLT label: ${network}/56/${group} button ${line} to "${text}"`);
  }
  cgateCommand.write(command);
  
  // Publish confirmation back to MQTT using the full 3-part address to mirror the inbound topic
  const unitId = `${network}_56_${group}`;
  mqttMessage.publish(`cbus/dlt/${unitId}/${line + 1}/state`, text);
}

function processTemplate(template) {
  // Simple template engine to support dynamic content
  // Supports ${variable} syntax for MQTT topic references
  // Example: "Temp: ${cbus/sensor/temp}" will substitute the value from that topic
  
  if (!template.includes('${')) {
    return template;
  }
  
  // For now, return the template as-is
  // Advanced implementation would cache MQTT values and substitute them
  // This can be expanded based on specific requirements
  return template;
}

function updateAllDltTime() {
  // Update time/date for all registered DLT units
  if (Object.keys(dltUnits).length === 0) {
    if (logging) {
      console.log('No DLT units registered for time update');
    }
    return;
  }
  
  Object.keys(dltUnits).forEach(unitAddress => {
    updateDltTime(unitAddress);
  });
}

function updateDltTime(address) {
  // C-Gate command to update time/date on DLT unit
  // Uses the C-Gate server's current time
  const command = `time //${settings.cbusname}/${address}\n`;
  if (logging) {
    console.log(`Updating DLT time for unit: ${address}`);
  }
  cgateCommand.write(command);
}

/**
 * handleTriggerEvent — processes a C-Bus Trigger Application event.
 *
 * Trigger event format from the event port:
 *   trigger event //HOME/254/202/<triggerAddress> <levelAddress> #sourceunit=<unit>
 *
 * parts[3] is the level address within the trigger group.  The triggerActions
 * sparse array (built by readXmlFile) maps level addresses to human-readable
 * tag names defined in C-Bus Toolkit.
 *
 * The resolved event is published as a JSON payload to:
 *   cbus/event/cbus2-mqtt/<uniqueId>/state
 * Home Assistant listens here via the MQTT EventEntity configured in discovery.
 */
function handleTriggerEvent(parts, uniqueId) {
  if (logging === true) {
    console.log(`C-Bus trigger received: ${uniqueId}`);
  }

  // Level index — which trigger level within this trigger group was activated.
  const levelIdx = parseInt(parts[3], 10);

  // sourceunit identifies the physical C-Bus unit (wall plate) that fired the trigger.
  const sourceunit = (parts.find(p => p.startsWith('#sourceunit=')) || '').split('=')[1] || 'unknown';

  // Guard: if the level index has no matching entry in triggerActions the event
  // is either from an unconfigured group or a label-echo — skip it.
  if (!triggerActions[levelIdx]) {
    if (logging === true) {
      console.warn(`Skipping trigger event for ${uniqueId}: no triggerAction at index ${levelIdx}`);
    }
    return;
  }

  // Publish a structured JSON payload so Home Assistant automations can branch
  // on event_type (maps to the Toolkit tag name, e.g. "SINGLE", "DOUBLE", "LONG").
  const payload = {
    event_type: triggerActions[levelIdx].tagName,
    trigger_unit: sourceunit
  };

  mqttMessage.publish(`cbus/event/cbus2-mqtt/${uniqueId}/state`, JSON.stringify(payload), options, function () { });
}

/**
 * handleLightingEvent — processes a C-Bus Lighting Application event.
 *
 * Lighting event formats from the event port:
 *   lighting on   //HOME/254/56/<group>
 *   lighting off  //HOME/254/56/<group>
 *   lighting ramp //HOME/254/56/<group> <level_0-255> <rate>
 *   lighting label //HOME/254/56  1 <group> - <button> <hex-encoded-text>
 *
 * For on/off/ramp we publish to the Home Assistant light topics.
 * For ramp, parts[3] is the raw C-Bus level (0-255); we convert to
 * percentage (0-100) for the brightness topic.
 * For label (DLT echo) we only log — we don't publish, as the state was
 * already set by the original setDltLabel() call.
 */
function handleLightingEvent(parts, uniqueId) {
  switch (parts[1]) {
    case "on":
      mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/state`, "ON", options, function () { });
      break;
    case "off":
      mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/state`, "OFF", options, function () { });
      break;
    case "ramp":
      // parts[3] = raw C-Bus level 0-255.  A level > 0 means the light is on.
      if (parseInt(parts[3]) > 0) {
        // Convert 0-255 to 0-100 percentage for the HA brightness topic.
        const brightness = Math.round(parseInt(parts[3]) * 100 / 255).toString();
        mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/brightness`, brightness, options, function () { });
        mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/state`, "ON",  options, function () { });
      } else {
        // Level 0 — the ramp ended at off.
        mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/state`, "OFF", options, function () { });
      }
      break;
    case "label":
      // DLT label-echo events are informational only.  C-Gate reflects our own
      // outbound label commands back as events; we log them when verbose logging
      // is on but do NOT re-publish to MQTT (setDltLabel already did that).
      // Format: lighting label //NETWORK/254/56  1 <group> - <button> <hex-text>
      if (logging === true) {
        try {
          const labelParts = parts.filter(p => p !== "");
          const hexText     = labelParts[8];
          const labelText   = Buffer.from(hexText, 'hex').toString('utf8');
          const groupAddress = labelParts[4];
          const lineNumber  = labelParts[3];
          console.log(`Label update for ${uniqueId} (group ${groupAddress}, button ${lineNumber}): "${labelText}"`);
        } catch (err) {
          console.log(`Label update received for ${uniqueId} (decode error: ${err.message})`);
        }
      }
      break;
    default:
      console.log(`Ignoring [cbus] C-Bus message for ${uniqueId}`);
  }
}


/**
 * handleLightData — processes a 300 GET response from the command port.
 *
 * Called when C-Gate responds to our GET //* level command.  One response
 * line is emitted per group, in the form:
 *   300-//HOME/254/56/10 level=128
 * or (without hyphen):
 *   300 //HOME/254/56/10 level=128
 *
 * parts[0] = "//HOME/254/56/10"  (with leading "//" stripped by slice(2))
 * parts[1] = "level=128"
 *
 * The raw level (0-255) is published as a percentage brightness and as
 * an ON/OFF state.  An internal EventEmitter event is also fired for any
 * future subscribers (currently unused).
 */
function handleLightData(parts) {
  // Strip the leading "//" and take three path segments: net/app/group.
  const address  = parts[0].slice(2).split('/').slice(1, 4).map(str => str.replace(':', ''));
  const uniqueId = `cbus_${address[0]}_${address[1]}_${address[2]}`;

  // Parse the "level=NNN" value field.
  const level = parseInt(parts[1].split("=")[1]);

  if (level === 0) {
    eventEmitter.emit('level', address.join('/'), 0);
    mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/state`, "OFF", options, function () { });
  } else {
    // Convert 0-255 raw level to 0-100 percentage for HA brightness.
    eventEmitter.emit('level', address.join('/'), Math.round(level));
    mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/brightness`, Math.round(level * 100 / 255).toString(), options, function () { });
    mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/state`, "ON", options, function () { });
  }
}

/**
 * handleTreeData — accumulates XML fragments from C-Gate tree responses (code 347).
 *
 * C-Gate emits a network tree listing in response to a TREE command as a
 * sequence of lines prefixed "347-".  Each call appends the payload (after
 * the hyphen) to the global `tree` accumulator.  Code 344 signals the end
 * of the listing and triggers handleParsedTree().
 */
function handleTreeData(data) {
  tree += data.split("-")[1] + '\n';
}

/**
 * handleParsedTree — callback invoked when the accumulated tree XML has been parsed.
 *
 * Publishes the JSON representation of the C-Bus network tree to:
 *   cbus/bridge/cbus2-mqtt/tree/<network>
 * Resets the accumulator so the next TREE response starts clean.
 */
function handleParsedTree(result) {
  try {
    if (logging === true) { console.log("C-Bus tree received:" + JSON.stringify(result)); }
    mqttMessage.publish('cbus/bridge/cbus2-mqtt/tree/' + treenet, JSON.stringify(result), options, function () { });
  } catch (err) {
    console.log(err);
  }
  tree = '';
}

/**
 * getTagNamesByTriggerAddress — helper to get all level tag names for a trigger group.
 *
 * Used during readXmlFile() to build the eventTypes array for the Home Assistant
 * button entity discovery payload.  Returns an array of strings such as
 * ["SINGLE", "DOUBLE", "LONG"] which HA displays as selectable event types.
 */
function getTagNamesByTriggerAddress(triggerActions, triggerAddress) {
  const filteredActions = triggerActions.filter(action => action.triggerAddress === triggerAddress);
  const tagNames = filteredActions.map(action => action.tagName);
  return tagNames;
}


/**
 * sendDiscoveryMessage — publishes a Home Assistant MQTT discovery config payload.
 *
 * MQTT discovery allows HA to automatically create entities without manual YAML.
 * We publish to:  homeassistant/<component>/cbus2-mqtt/<uniqueId>/config
 *
 * Called with deviceClass = HASS_DEVICE_CLASSES.DEVICE once to register the
 * bridge itself, then once per light group, and once per trigger group.
 *
 * discoverySent guards against re-publishing the same uniqueId on reconnect.
 *
 * Parameters:
 *   deviceClass      — "device" | "light" | "button"
 *   networkId        — C-Bus network number (e.g. "254")
 *   serviceId        — C-Bus application number (e.g. "56" for lighting)
 *   groupId          — C-Bus group address
 *   tagName          — Human-readable name from C-Bus Toolkit
 *   outputChannel    — Physical output number on the DIN pack
 *   unitName         — Unit name from C-Bus Toolkit
 *   unitAddress      — Hex unit address
 *   outputType       — "Dimmer" | "Relay" | "Phantom"
 *   unitCatalogNumber — Catalogue number string (e.g. "L5508D1A")
 *   eventTypes       — Array of trigger level names for button entities
 */
function sendDiscoveryMessage(deviceClass, networkId, serviceId, groupId, tagName, outputChannel, unitName, unitAddress, outputType, unitCatalogNumber, eventTypes) {
  const uniqueId = deviceClass === 'device' ? `cbus_${settings.cbusname}` : `cbus_${networkId}_${serviceId}_${groupId}`;

  // Skip if we already sent discovery for this entity in this session.
  if (discoverySent.includes(uniqueId)) {
    return;
  }
  if (logging) {
    console.log('Sending Hass discovery message');
  }
  const mqttTopicPrefix = 'homeassistant';
  const mqttTopicSuffix = 'cbus2-mqtt';
  var mqttTopic = `${mqttTopicPrefix}/${deviceClass}/${mqttTopicSuffix}/${uniqueId}/config`;
  const device = {
    identifiers: [`cbus2-mqtt`],
    name: 'C-Bus ',
    manufacturer: 'DamianFlynn.com',
    model: 'C-Bus C-Gate MQTT Bridge',
    sw_version: '0.5',
    via_device: `cbus2-mqtt`
  };
  let payload = {};
  switch (deviceClass) {
    case "device":
      console.log('Sending HASS Discovery message for CBUS-MQTT');
      payload = {
        name: 'Bridge Status',
        unique_id: `cbus2-mqtt`,
        state_topic: `cbus/bridge/cbus2-mqtt/state`,
        device
      };
      break;
    case "light":
      payload = {
        name: `${tagName}`,
        unique_id: `${uniqueId}`,
        default_entity_id: `light.${uniqueId}`,
        state_topic: `cbus/${deviceClass}/${mqttTopicSuffix}/${uniqueId}/state`,
        command_topic: `cbus/${deviceClass}/${mqttTopicSuffix}/${uniqueId}/set`,
        json_attributes_topic: `cbus/${deviceClass}/${mqttTopicSuffix}/${uniqueId}/attributes`,
        brightness: false,
        icon: "mdi:lightbulb-on",
        device
      };
      if (outputType == "Dimmer") {
        payload.brightness_state_topic = `cbus/${deviceClass}/${mqttTopicSuffix}/${uniqueId}/brightness`;
        payload.brightness_command_topic = `cbus/${deviceClass}/${mqttTopicSuffix}/${uniqueId}/brightness/set`;
        payload.brightness_scale = 100;
        payload.brightness = true;
        payload.on_command_type = "brightness";
        payload.icon = "mdi:lightbulb-on-50";
      }
      const attributes = {
        cbus_address: `${networkId}/${serviceId}/${groupId}`,
        unit_name: `${unitName}`,
        unit_address: `${unitAddress}`,
        unit_type: `${outputType}`,
        unit_model: `${unitCatalogNumber}`,
        output_channel: `${outputChannel}`
      };
      mqttMessage.publish(`cbus/${deviceClass}/${mqttTopicSuffix}/${uniqueId}/attributes`, JSON.stringify(attributes));
      break;
    case "button":
      payload = {
        name: `${tagName}`,
        unique_id: `${uniqueId}`,
        default_entity_id: `event.${uniqueId}`,
        availability_topic: "cbus/bridge/cbus2-mqtt/state",
        payload_available: "online",
        payload_not_available: "offline",
        device,
        device_class: "button",
        event_types: eventTypes || ["SINGLE", "DOUBLE", "LONG"], // use default value if eventTypes is null
        state_topic: `cbus/event/${mqttTopicSuffix}/${uniqueId}/state`,
        icon: eventTypes ? "mdi:gesture-double-tap" : "mdi:gesture-tap"
      };
      mqttTopic = `${mqttTopicPrefix}/event/${mqttTopicSuffix}/${uniqueId}/config`;
      break;
    default:
      return;
  }
  mqttMessage.publish(mqttTopic, JSON.stringify(payload));
  discoverySent.push(uniqueId);
}



/**
 * readXmlFile — parses the C-Bus project file (HOME.xml) exported from C-Bus Toolkit.
 *
 * HOME.xml describes the entire C-Bus installation: every DIN-rail unit, its
 * group address assignments, tag names, and application configuration.
 *
 * This function performs three passes over the XML:
 *
 *   Pass 1 — Lighting units (catalogue numbers starting "L55")
 *     Builds groupElements[], a sparse array keyed by group address, with the
 *     dimmer/relay type, unit metadata, and output channel for each group.
 *
 *   Pass 2 — DLT units (catalogue numbers starting "L51", or containing "DLT"/"DLP")
 *     Populates the dltUnits map used by updateAllDltTime() for periodic time sync.
 *
 *   Pass 3 — Lighting Application groups (application address 56)
 *     Iterates every Group element, looks up the matching groupElement, and calls
 *     sendDiscoveryMessage() for each HA light entity.
 *     Groups with no matching unit are treated as "Phantom" (virtual) groups.
 *
 *   Pass 4 — Trigger Application groups (application address 202)
 *     Populates triggerActions[] and calls sendDiscoveryMessage() for each HA
 *     button entity, with the level tag names as the eventTypes list.
 */
function readXmlFile(filePath) {
  filePath = path.join(__dirname, filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.log('C-Bus Project File not found: ' + filePath);
      console.error(err);
      return;
    }
    const parser = new xml2js.Parser();
    parser.parseString(data, (err, result) => {
      if (err) {
        console.error(err);
        return;
      }

      // --- Pass 1: Lighting DIN-rail units ---
      // Filter to units whose catalogue number starts with "L55" — these are
      // Clipsal 5-series DIN lighting channel packs (dimmers and relays).
      const units = result.Installation.Project[0].Network[0].Unit?.filter(unit => unit.CatalogNumber[0].startsWith('L55')) || [];
      const groupElements = [];

      units.forEach(unit => {
        if (logging == true) { console.log(`Unit: ${JSON.stringify(unit)}`); }
        const catalogNumber = unit.CatalogNumber[0];

        // Catalogue number encodes the channel count: e.g. "L5508D1A"
        //   chars [3..4] = "08" => 8 output channels
        //   char  [5]    = "D" => Dimmer, "R" => Relay
        const numGroups = parseInt(catalogNumber.substr(3, 2), 10);

        // PP (Parameter Property) elements hold key/value pairs for each unit.
        const groupAddressObj = unit.PP.find(pp => pp.$.Name === 'GroupAddress');
        const unitAddressObj  = unit.PP.find(pp => pp.$.Name === 'UnitAddress');
        const unitAddress     = unitAddressObj?.$?.Value;
        const unitNameObj     = unit.PP.find(pp => pp.$.Name === 'UnitName');
        const unitName        = unitNameObj?.$?.Value;

        // GroupAddress is a space-separated list of hex group numbers, one per output channel.
        // e.g. "0A 0B 0C ..."  =>  ["10", "11", "12", ...] (decimal)
        const groupAddress = groupAddressObj?.$?.Value;
        let output = 1; // 1-based output channel counter
        const groups = groupAddress?.split(' ').map(hex => parseInt(hex, 16).toString()).slice(0, numGroups);

        // Map each group address to the metadata for that output channel.
        groups.forEach(group => {
          const groupNumber = parseInt(group, 10);
          groupElements[groupNumber] = {
            isDimmer: catalogNumber[5] === 'D',   // true = dimmer, false = relay
            unitCatalogNumber: catalogNumber,
            unitName:    unitName,
            unitAddress: unitAddress,
            groupNumber: groupNumber,
            output: output++              // which physical output on this pack
          };
          console.log(`Pack ${unitAddress} [ ${unitName} ] Channel [ ${output}] -> Light Group [ ${groupNumber} ] `);
        });
      });
      if (logging == true) { console.log(`Group Elements: ${JSON.stringify(groupElements)}`); }
      console.log(`Found ${units.length} Light Channel Packs, configured for ${groupElements.length} Group Elements: `);

      // --- Pass 2: DLT (Electronic Dynamic Labelling) units ---
      // DLT wall switches have catalogue numbers starting "L51" or containing
      // "DLT" / "DLP".  We record their addresses for periodic time sync.
      if (settings.enableDltSupport) {
        const dltUnitsList = result.Installation.Project[0].Network[0].Unit?.filter(unit =>
          unit.CatalogNumber[0].startsWith('L51') ||
          unit.CatalogNumber[0].includes('DLT') ||
          unit.CatalogNumber[0].includes('DLP')
        ) || [];

        dltUnitsList.forEach(unit => {
          const catalogNumber  = unit.CatalogNumber[0];
          const unitAddressObj = unit.PP.find(pp => pp.$.Name === 'UnitAddress');
          const unitAddress    = unitAddressObj?.$?.Value;
          const unitNameObj    = unit.PP.find(pp => pp.$.Name === 'UnitName');
          const unitName       = unitNameObj?.$?.Value;

          if (unitAddress) {
            // Unit addresses in HOME.xml are hex; convert to decimal for the
            // C-Gate address string "network/application/group".
            const address = `254/56/${parseInt(unitAddress, 16)}`;
            dltUnits[address] = {
              catalogNumber: catalogNumber,
              unitName:    unitName,
              unitAddress: unitAddress
            };
            if (logging) {
              console.log(`DLT Unit found: ${unitName} (${catalogNumber}) at address ${address}`);
            }
          }
        });

        if (dltUnitsList.length > 0 && logging) {
          console.log(`Found ${dltUnitsList.length} DLT units`);
        }
      }

      // --- Pass 3: Lighting Application groups (application 56) ---
      // Every Group element defines one controllable lighting circuit.  We match
      // it to the groupElements map by address to get unit metadata, then publish
      // an HA discovery message.  Groups with no unit mapping are "Phantom" groups
      // (virtual circuits with no physical load — used for scene control etc.).
      const appGroups = result.Installation.Project[0].Network[0].Application.find(app => app.Address[0] === '56').Group;

      appGroups.forEach(group => {
        const groupAddress  = parseInt(group.Address[0], 10);
        const groupElement  = groupElements[groupAddress];
        if (groupElement) {
          groupElement.tagName = group.TagName[0]; // human-readable name from Toolkit
          console.log(`Group Tag [${group.TagName[0]}] -> ${groupElement.isDimmer ? 'Dimmer' : 'Relay'} pack (${groupElement.unitAddress}) ${groupElement.unitName} [${groupElement.output}]`);
          if (settings.enableHassDiscovery) {
            sendDiscoveryMessage(HASS_DEVICE_CLASSES.LIGHT, '254', "56", groupAddress, group.TagName[0], groupElement.output, groupElement.unitName, groupElement.unitAddress, groupElement.isDimmer ? 'Dimmer' : 'Relay', groupElement.unitCatalogNumber);
          }
        } else {
          // Phantom group — no physical unit; publish as a relay with placeholder metadata.
          console.log(`Group Tag [${group.TagName[0]}] -> 'Relay' pack (Phantom]`);
          if (settings.enableHassDiscovery) {
            sendDiscoveryMessage(HASS_DEVICE_CLASSES.LIGHT, '254', "56", groupAddress, group.TagName[0], "Phantom", "Phantom", "Phantom", 'Relay', "Phantom");
          }
        }
      });

      // --- Pass 4: Trigger Application groups (application 202) ---
      // Trigger Application groups map to Home Assistant EventEntities.
      // Each group can have multiple Level children, each representing a different
      // trigger action (e.g. SINGLE press, DOUBLE press, LONG hold).
      // triggerActions[] is indexed by level address for O(1) lookup in handleTriggerEvent().
      const triggerGroups = result.Installation.Project[0].Network[0].Application.find(app => app.Address[0] === '202').Group;
      if (triggerGroups) {
        triggerGroups.forEach(trigger => {
          const triggerAddress = parseInt(trigger.Address[0], 10);
          const triggerTagName = trigger.TagName[0];
          if (trigger.Level) {
            // Populate the sparse triggerActions array with one entry per level.
            trigger.Level.forEach(level => {
              const levelAddress = parseInt(level.Address[0], 10);
              triggerActions[levelAddress] = {
                tagName:        level.TagName[0],    // e.g. "SINGLE", "DOUBLE", "LONG"
                triggerName:    triggerTagName,      // parent group name
                triggerAddress: triggerAddress       // parent group address
              };
            });

            
            const tagNames = getTagNamesByTriggerAddress(triggerActions, triggerAddress).map(tagName => `${tagName}`);

            console.log(`Trigger (${triggerAddress}) ${triggerTagName} has ${tagNames.length} levels ${JSON.stringify(tagNames)}`);
            if (settings.enableHassDiscovery) {
              sendDiscoveryMessage(HASS_DEVICE_CLASSES.BUTTON, '254', "202", triggerAddress, triggerTagName,null ,null,null ,null ,null, tagNames );
            }
          } else {
            console.log(`Trigger (${triggerAddress}) ${triggerTagName} does not have any levels`);
          }
        });
      } else {
        console.log('triggerGroups is undefined');
      }
      
      if (logging == true) { console.log(`Group Elements: ${JSON.stringify(groupElements)}`) };
    });
  });
}

