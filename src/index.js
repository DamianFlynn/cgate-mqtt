#!/usr/bin/env node
var mqtt = require('mqtt');
var net = require('net');
var events = require('events');
var settings = require('./settings.js');
// const { connect } = require('http2');
var parseString = require('xml2js').parseString;
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

var options = {};
if (settings.retainreads === true) {
  options.retain = true;
}

var topicPrefix = "";
if (settings.topicPrefix) {
  topicPrefix = `${settings.topicPrefix}/`;
}


var tree = '';
var treenet = 0;

var interval = {};
var commandInterval = {};
var eventInterval = {};
var mqttConnected = false;
var cbusCmdConnected = false;
var cbusEventConnected = false;
var buffer = "";
var eventEmitter = new events.EventEmitter();
var messageinterval = settings.messageinterval || 200;
var logging = settings.logging;
var isRamping = false;


var discoverySent = [];
var HASS_DEVICE_CLASSES = {
  LIGHT: "light",
  RELAY: "switch",
  BUTTON: "button",
  DEVICE: "device"
};


// Connect to MQTT Broker
var mqttClient = mqtt.connect(`mqtt://${settings.mqtt}`, settings.mqttusername && settings.mqttpassword ? { username: settings.mqttusername, password: settings.mqttpassword } : {});


var cbusCmdChannel = new net.Socket();
var cbusEventChannel = new net.Socket();
var cgateIpAddr = settings.cbusip;
var cbusCmdPort = 20023;
var cbusEventPort = 20025;


// Connect to cgate via telnet
cbusCmdChannel.connect(cbusCmdPort, cgateIpAddr);

// Connect to cgate event port via telnet
cbusEventChannel.connect(cbusEventPort, cgateIpAddr);



var cgateCommand = {
  write: function (value) {
    cgateCommand.queue.push(value)
    if (cgateCommand.interval === null) {
      cgateCommand.interval = setInterval(cgateCommand.process, messageinterval)
      cgateCommand.process()
    }
  },
  process: function () {
    if (cgateCommand.queue.length === 0) {
      clearInterval(cgateCommand.interval)
      cgateCommand.interval = null
    } else {
      cbusCmdChannel.write(cgateCommand.queue.shift())
    }
  },
  interval: null,
  queue: []
}

var mqttMessage = {
  publish: function (topic, payload) {
    mqttMessage.queue.push({ topic: topic, payload: payload })
    if (mqttMessage.interval === null) {
      mqttMessage.interval = setInterval(mqttMessage.process, messageinterval)
      mqttMessage.process()
    }
  },
  process: function () {
    if (mqttMessage.queue.length === 0) {
      clearInterval(mqttMessage.interval)
      mqttMessage.interval = null
    } else {
      var msg = mqttMessage.queue.shift()
      mqttClient.publish(msg.topic, msg.payload, { retain: true }, (err) => {
        if (err) {
          console.error('Failed to publish message:', err);
        } else {
          console.log('Message published with retain flag set to true');
        }
      });
    }
  },
  interval: null,
  queue: []
}




// 
// MQTT Processing
// 

mqttClient.on('disconnect', () => {
  mqttConnected = false;
});


mqttClient.on('connect', () => {
  mqttConnected = true;
  console.log(`CONNECTED TO MQTT: ${settings.mqtt}`);
  started();
  mqttClient.subscribe('cbus/#', (err) => {
    if (err) {
      console.error(`Error subscribing to cbus/#: ${err}`);
      return;
    }
    mqttClient.on('message', (topicArg, message, packet) => {
      handleMessage(topicArg, message);
    });
  });
  mqttClient.publish('cbus/bridge/cbus2-mqtt/state', 'online', options, (err) => {
    if (err) {
      console.error(`Error publishing cbus/bridge/cbus2-mqtt/state: ${err}`);
      return;
    }
  });
});


// 
// C-Bus Commands
// 

cbusCmdChannel.on('error', function (err) {
  console.log('COMMAND ERROR:' + JSON.stringify(err))
})

cbusCmdChannel.on('connect', function (err) {
  cbusCmdConnected = true;
  console.log('CONNECTED TO C-GATE COMMAND PORT: ' + cgateIpAddr + ':' + cbusCmdPort);
  cgateCommand.write('EVENT ON\n');
  started()
  clearInterval(commandInterval);
})

cbusCmdChannel.on('close', function () {
  cbusCmdConnected = false;
  console.log('COMMAND PORT DISCONNECTED')
  commandInterval = setTimeout(function () {
    console.log('COMMAND PORT RECONNECTING...')
    cbusCmdChannel.connect(cbusCmdPort, cgateIpAddr)
  }, 10000)
})

cbusCmdChannel.on('data', function (data) {
  if (logging == true) {console.log('Command data: ' + data);}
  const lines = (buffer + data.toString()).split("\n");
  buffer = lines[lines.length - 1];

  if (lines.length > 1) {
    for (let i = 0; i < lines.length - 1; i++) {
      const parts1 = lines[i].toString().split("-");

      if (parts1.length > 1 && parts1[0] == "300") {
        const parts2 = parts1[1].toString().split(" ");
        handleLightData(parts2);
      } else if (parts1[0] == "347") {
        handleTreeData(parts1[1]);
      } else if (parts1[0] == "343") {
        tree = '';
      } else if (parts1[0].split(" ")[0] == "344") {
        parseString(tree, handleParsedTree);
      } else if (parts1[0] == "300") {
        const parts2 = parts1[0].toString().split(" ");
        handleLightData(parts2);
      }
    }
  }
});




// 
// C-Bus Events
// 

cbusEventChannel.on('error', function (err) {
  console.log('EVENT ERROR:' + JSON.stringify(err))
})

cbusEventChannel.on('connect', function (err) {
  cbusEventConnected = true;
  console.log('CONNECTED TO C-GATE EVENT PORT: ' + cgateIpAddr + ':' + cbusEventPort);
  started()
  clearInterval(eventInterval);
})

cbusEventChannel.on('close', function () {
  cbusEventConnected = false;
  console.log('EVENT PORT DISCONNECTED')
  eventInterval = setTimeout(function () {
    console.log('EVENT PORT RECONNECTING...')
    cbusEventChannel.connect(cbusEventPort, cgateIpAddr)
  }, 10000)
})



cbusEventChannel.on('data', function (data) {
  if (logging === true) {
    console.log(`Event data: ${data}`);
  }
  const parts = data.toString().split(" ");
  const address = parts[2].split("/");
  const uniqueId = `cbus_${address[3]}_${address[4]}_${address[5]}`;

  switch (parts[0]) {
    case "trigger":
      handleTriggerEvent(parts, uniqueId);
      break;
    case "lighting":
      handleLightingEvent(parts, uniqueId);
      break;
    default:
  }
});



function ramping() {
  isRamping = false;
}

function started() {
  if (cbusCmdConnected && cbusEventConnected && mqttClient.connected) {
    console.log('ALL CONNECTED');
    // Figure out the topic structure
    sendDiscoveryMessage(HASS_DEVICE_CLASSES.DEVICE);   
    readXmlFile('HOME.xml');

    if (settings.getallnetapp && settings.getallonstart) {
      console.log('Getting all values');
      cgateCommand.write('GET //' + settings.cbusname + '/' + settings.getallnetapp + '/* level\n');
    }
    if (settings.getallnetapp && settings.getallperiod) {
      clearInterval(interval);
      setInterval(function () {
        console.log('Getting all values');
        cgateCommand.write('GET //' + settings.cbusname + '/' + settings.getallnetapp + '/* level\n');
      }, settings.getallperiod * 1000);
    }
  }

}


function handleMessage(topicArg, message) {
  if (logging === true) {
    console.log(`Message received on ${topicArg}: ${message}`);
  }
  let topic = topicArg;
  if (topicPrefix) {
    topic = topic.replace(topicPrefix, "");
  }
  const parts = topic.split("/");
  const cbusAddress = parts[3].split("_").slice(1).join("/");
  switch (parts[parts.length - 1].toLowerCase()) {
    case "set":
      console.log(`Set Command :: [${parts[parts.length - 2].toLowerCase()}] ${message} for ${cbusAddress} received`);
      switch (parts[parts.length - 2].toLowerCase()) {
        case "brightness":
          const level = Math.round(parseInt(message) * 255 / 100);
          if (!isNaN(level) && level < 256) {
            cgateCommand.write(`RAMP //${settings.cbusname}/${cbusAddress} ${level}\n`);
          }
          break;
        default:
          if (message.toString() === "ON") {
            cgateCommand.write(`ON //${settings.cbusname}/${cbusAddress}\n`);
          } else if (message.toString() === "OFF") {
            cgateCommand.write(`OFF //${settings.cbusname}/${cbusAddress}\n`);
          }
      }
      break;
    case "transition":
      console.log(`[${parts[4].toLowerCase()}] message for ${cbusAddress} received: ${message}`);
      break;
    default:
      console.log(`Ignoring [${parts[parts.length - 1].toLowerCase()}] "${message}" message for ${topic}`);
  }
}



function handleTriggerEvent(parts, uniqueId) {
  if (settings.enableHassDiscovery) {
    sendDiscoveryMessage(HASS_DEVICE_CLASSES.BUTTON, parts[2], parts[3], parts[4]);
  }
  if (logging === true) {
    console.log(`C-Bus trigger received: ${uniqueId}`);
  }
  const payload = {
    event_type: "hold"
  };
  mqttMessage.publish(`cbus/sensor/cbus2-mqtt/${uniqueId}/state`, JSON.stringify(payload), options, function () { });
}

function handleLightingEvent(parts, uniqueId) {
  switch (parts[1]) {
    case "on":
      mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/state`, "ON", options, function () { });
      break;
    case "off":
      mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/state`, "OFF", options, function () { });
      break;
    case "ramp":
      if (parseInt(parts[3]) > 0) {
        const brightness = Math.round(parseInt(parts[3]) * 100 / 255).toString();
        mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/brightness`, brightness, options, function () { });
        mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/state`, "ON", options, function () { });
      } else {
        mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/state`, "OFF", options, function () { });
      }
      break;
    default:
      console.log(`Ignoring [cbus] C-Bus message for ${uniqueId}`);
  }
}


function handleLightData(parts) {
  const address = parts[0].split("/");
  const uniqueId = `cbus_${address[3]}_${address[4]}_${address[5]}`;
  const level = parseInt(parts[1].split("=")[1]);

  if (level === 0) {
    // Light is 'Off'
    eventEmitter.emit('level', address.slice(3).join('/'), 0);
    mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/state`, "OFF", options, function () { });
  } else {
    // Light is 'On' (Dimmer) 
    eventEmitter.emit('level', address.slice(3).join('/'), Math.round(level));
    mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/brightness`, Math.round(level * 100 / 255).toString(), options, function () { });
    mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/state`, "ON", options, function () { });
  }
}

function handleTreeData(data) {
  tree += data.split("-")[1] + '\n';
}

function handleParsedTree(result) {
  try {
    if (logging === true) { console.log("C-Bus tree received:" + JSON.stringify(result)) }
    mqttMessage.publish('cbus/bridge/cbus2-mqtt/tree/' + treenet, JSON.stringify(result), options, function () { });
  } catch (err) {
    console.log(err)
  }
  tree = '';
}

function sendDiscoveryMessage(deviceClass, networkId, serviceId, groupId, tagName, outputChannel, unitName, unitAddress, outputType, unitCatalogNumber) {
  const uniqueId = `cbus_${networkId}_${serviceId}_${groupId}`;
  if (discoverySent.includes(uniqueId)) {
    return;
  }
  if (logging) {
    console.log('Sending Hass discovery message');
  }
  const mqttTopicPrefix = 'homeassistant';
  const mqttTopicSuffix = 'cbus2-mqtt';
  const mqttTopic = `${mqttTopicPrefix}/${deviceClass}/${mqttTopicSuffix}/${uniqueId}/config`;
  const device = {
    identifiers: [`cbus2-mqtt`],
    name: 'CBus',
    manufacturer: 'DamianFlynn.com',
    model: 'C-Bus C-Gate MQTT Bridge',
    sw_version: '0.3',
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
        object_id: `${uniqueId}`,
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
        name: `${uniqueId}`,
        unique_id: `${uniqueId}`,
        availability_topic: "cbus/PLC/House/availability",
        payload_available: "online",
        payload_not_available: "offline",
        device,
        device_class: "button",
        event_types: [
          "SINGLE",
          "DOUBLE",
          "LONG"
        ],
        state_topic: `cbus/read/${networkId}/${serviceId}/${groupId}/state`,
        icon: "mdi:gesture-double-tap",
        qos: 2
      };
      break;
    default:
      return;
  }
  mqttMessage.publish(mqttTopic, JSON.stringify(payload));
  discoverySent.push(uniqueId);
}



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
      const units = result.Installation.Project[0].Network[0].Unit?.filter(unit => unit.CatalogNumber[0].startsWith('L55')) || [];
      const groupElements = [];

      units.forEach(unit => {
        if (logging == true) { console.log(`Unit: ${JSON.stringify(unit)}`) };
        const catalogNumber = unit.CatalogNumber[0];
        const numGroups = parseInt(catalogNumber.substr(3, 2), 10);
        const groupAddressObj = unit.PP.find(pp => pp.$.Name === 'GroupAddress');
        const unitAddressObj = unit.PP.find(pp => pp.$.Name === 'UnitAddress');
        const unitAddress = unitAddressObj?.$?.Value;
        const unitNameObj = unit.PP.find(pp => pp.$.Name === 'UnitName');
        const unitName = unitNameObj?.$?.Value;
        const groupAddress = groupAddressObj?.$?.Value;
        let output = 1;
        const groups = groupAddress?.split(' ').map(hex => parseInt(hex, 16).toString()).slice(0, numGroups)

        groups.forEach(group => {
          const groupNumber = parseInt(group, 10);
          groupElements[groupNumber] = {
            isDimmer: catalogNumber[5] === 'D',
            unitCatalogNumber: catalogNumber,
            unitName: unitName,
            unitAddress: unitAddress,
            groupNumber: groupNumber,
            output: output++
          };
          console.log(`Pack ${unitAddress} [ ${unitName} ] Channel [ ${output}] -> Light Group [ ${groupNumber} ] `)
        });
      });
      if (logging == true) { console.log(`Group Elements: ${JSON.stringify(groupElements)}`) };
      console.log(`Found ${units.length} Light Channel Packs, configured for ${groupElements.length} Group Elements: `);
      
      const appGroups = result.Installation.Project[0].Network[0].Application.find(app => app.Address[0] === '56').Group;

      appGroups.forEach(group => {
        const groupAddress = parseInt(group.Address[0], 10);
        const groupElement = groupElements[groupAddress];
        if (groupElement) {
          groupElement.tagName = group.TagName[0];
          console.log(`TagName: Pack (${groupElement.unitAddress}) ${groupElement.unitName} [${groupElement.output}], Type: ${groupElement.isDimmer ? 'Dimmer' : 'Relay'} -> ${group.TagName[0]}`);
          if (settings.enableHassDiscovery) {
            // Now Publish the MQTT Discovery Messages
            sendDiscoveryMessage(HASS_DEVICE_CLASSES.LIGHT, '254', "56", groupAddress, group.TagName[0], groupElement.output, groupElement.unitName, groupElement.unitAddress, groupElement.isDimmer ? 'Dimmer' : 'Relay', groupElement.unitCatalogNumber);
          }
        } else {
          console.log(`!!! Group [${groupAddress}] tagged as '${group.TagName[0]}'  was not found in list of Group Elements`);
        }
      });

      if (logging == true) { console.log(`Group Elements: ${JSON.stringify(groupElements)}`) };
    });
  });
}

