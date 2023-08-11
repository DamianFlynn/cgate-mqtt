#!/usr/bin/env node
var mqtt = require('mqtt'), url = require('url');
var net = require('net');
var events = require('events');
var settings = require('./settings.js');
const { connect } = require('http2');
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

var topicRoot = 'cbus'
var topicDiscovery = 'homeassistant'
var topicProject = 'home'
var topicMeta = 'cbus-mqtt'
var topicConfig = 'config'
var topicState = 'state'
var topicSet = 'set'

var tree = '';
var treenet = 0;

var interval = {};
var commandInterval = {};
var eventInterval = {};
var clientConnected = false;
var commandConnected = false;
var eventConnected = false;
var buffer = "";
var eventEmitter = new events.EventEmitter();
var messageinterval = settings.messageinterval || 200;

var discoverySent = [];
var HASS_DEVICE_CLASSES = {
  LIGHT: "light",
  SWITCH: "switch",
  BUTTON: "button",
  DEVICE: "device"
};

// MQTT URL
var mqtt_url = url.parse('mqtt://' + settings.mqtt);

// Username and password
var OPTIONS = {};
if (settings.mqttusername && settings.mqttpassword) {
  OPTIONS.username = settings.mqttusername;
  OPTIONS.password = settings.mqttpassword;
}

// Create an MQTT client connection
var client = mqtt.createClient(mqtt_url.port, mqtt_url.hostname, OPTIONS);
var command = new net.Socket();
var event = new net.Socket();

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
      client.publish(msg.topic, msg.payload)
    }
  },
  interval: null,
  queue: []
}

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
      command.write(cgateCommand.queue.shift())
    }
  },
  interval: null,
  queue: []
}


var HOST = settings.cbusip;
var COMPORT = 20023;
var EVENTPORT = 20025;

var logging = settings.logging;
var isRamping = false;

// Figure out the topic structure

readXmlFile('HOME.xml');

// Connect to cgate via telnet
command.connect(COMPORT, HOST);


// Connect to cgate event port via telnet
event.connect(EVENTPORT, HOST);

function ramping() {
  isRamping = false;
}

function started() {
  if (commandConnected && eventConnected && client.connected) {
    console.log('ALL CONNECTED');
    sendDiscoveryMessage(HASS_DEVICE_CLASSES.DEVICE);   
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

client.on('disconnect', function () {
  clientConnected = false;
})

client.on('connect', function () { // When connected
  clientConnected = true;
  console.log('CONNECTED TO MQTT: ' + settings.mqtt);
  started()

  // Subscribe to MQTT
  client.subscribe(topicPrefix + 'cbus/write/#', function () {

    // when a message arrives, do something with it
    client.on('message', function (topicArg, message, packet) {
      if (logging == true) { console.log('Message received on ' + topicArg + ' : ' + message); }

      let topic = topicArg;
      if (topicPrefix)
        topic = topic.replace(topicPrefix, "");
      parts = topic.split("/");
      if (parts.length > 5)

        switch (parts[5].toLowerCase()) {

          // Get updates from all groups
          case "gettree":
            treenet = parts[2];
            cgateCommand.write('TREEXML ' + parts[2] + '\n');
            break;

          // Get updates from all groups
          case "discovery":
            discoverySent = [];
            cgateCommand.write('GET //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/* level\n');
            break;

          // Get updates from all groups
          case "getall":
            cgateCommand.write('GET //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/* level\n');
            break;

          // On/Off control
          case "switch":

            if (message == "ON") {
              if (logging == true) console.log(`ON Command, ramping: ${isRamping}`);
              if (!isRamping)
                cgateCommand.write('ON //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + '\n')
            };
            if (message == "OFF") { cgateCommand.write('OFF //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + '\n') };
            break;

          // Ramp, increase/decrease, on/off control
          case "ramp":
            isRamping = true;
            if (logging == true) console.log('Ramping');
            setTimeout(ramping, 1000);
            switch (message.toUpperCase()) {
              case "INCREASE":
                eventEmitter.on('level', function increaseLevel(address, level) {
                  if (address == parts[2] + '/' + parts[3] + '/' + parts[4]) {
                    cgateCommand.write('RAMP //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + ' ' + Math.min((level + 26), 255) + ' ' + '\n');
                    eventEmitter.removeListener('level', increaseLevel);
                  }
                });
                cgateCommand.write('GET //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + ' level\n');

                break;

              case "DECREASE":
                eventEmitter.on('level', function decreaseLevel(address, level) {
                  if (address == parts[2] + '/' + parts[3] + '/' + parts[4]) {
                    cgateCommand.write('RAMP //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + ' ' + Math.max((level - 26), 0) + ' ' + '\n');
                    eventEmitter.removeListener('level', decreaseLevel);
                  }
                });
                cgateCommand.write('GET //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + ' level\n');

                break;

              case "ON":
                cgateCommand.write('ON //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + '\n');
                break;
              case "OFF":
                cgateCommand.write('OFF //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + '\n');
                break;
              default:
                var ramp = message.split(",");
                var num = Math.round(parseInt(ramp[0]) * 255 / 100)
                if (!isNaN(num) && num < 256) {

                  if (ramp.length > 1) {
                    cgateCommand.write('RAMP //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + ' ' + num + ' ' + ramp[1] + '\n');
                  } else {
                    cgateCommand.write('RAMP //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + ' ' + num + '\n');
                  }
                }
            }
            break;
          default:
        }
    });
  });

  // publish a message to a topic

  mqttMessage.publish(topicRoot + '/' + topicProject + '/' + topicMeta + '/' + topicState, "online", options, function () { });
});

command.on('error', function (err) {
  console.log('COMMAND ERROR:' + JSON.stringify(err))
})

event.on('error', function (err) {
  console.log('EVENT ERROR:' + JSON.stringify(err))
})

command.on('connect', function (err) {
  commandConnected = true;
  console.log('CONNECTED TO C-GATE COMMAND PORT: ' + HOST + ':' + COMPORT);
  cgateCommand.write('EVENT ON\n');
  started()
  clearInterval(commandInterval);
})

event.on('connect', function (err) {
  eventConnected = true;
  console.log('CONNECTED TO C-GATE EVENT PORT: ' + HOST + ':' + EVENTPORT);
  started()
  clearInterval(eventInterval);
})


command.on('close', function () {
  commandConnected = false;
  console.log('COMMAND PORT DISCONNECTED')
  commandInterval = setTimeout(function () {
    console.log('COMMAND PORT RECONNECTING...')
    command.connect(COMPORT, HOST)
  }, 10000)
})

event.on('close', function () {
  eventConnected = false;
  console.log('EVENT PORT DISCONNECTED')
  eventInterval = setTimeout(function () {
    console.log('EVENT PORT RECONNECTING...')
    event.connect(EVENTPORT, HOST)
  }, 10000)
})

command.on('data', function (data) {
  // if (logging == true) {console.log('Command data: ' + data);}
  var lines = (buffer + data.toString()).split("\n");
  buffer = lines[lines.length - 1];
  if (lines.length > 1) {
    for (i = 0; i < lines.length - 1; i++) {
      var parts1 = lines[i].toString().split("-");
      if (parts1.length > 1 && parts1[0] == "300") {
        var parts2 = parts1[1].toString().split(" ");

        address = (parts2[0].substring(0, parts2[0].length - 1)).split("/");
        if (settings.enableHassDiscovery)
          sendDiscoveryMessage(HASS_DEVICE_CLASSES.LIGHT, address[3], address[4], address[5]);

        var level = parts2[1].split("=");
        if (parseInt(level[1]) == 0) {
          if (logging == true) { console.log('C-Bus status received: ' + address[3] + '/' + address[4] + '/' + address[5] + ' OFF'); }
          if (logging == true) { console.log('C-Bus status received: ' + address[3] + '/' + address[4] + '/' + address[5] + ' 0%'); }
          mqttMessage.publish(topicPrefix + 'cbus/read/' + address[3] + '/' + address[4] + '/' + address[5] + '/state', 'OFF', options, function () { });
          mqttMessage.publish(topicPrefix + 'cbus/read/' + address[3] + '/' + address[4] + '/' + address[5] + '/level', '0', options, function () { });
          eventEmitter.emit('level', address[3] + '/' + address[4] + '/' + address[5], 0);
        } else {
          if (logging == true) { console.log('C-Bus status received: ' + address[3] + '/' + address[4] + '/' + address[5] + ' ON'); }
          if (logging == true) { console.log('C-Bus status received: ' + address[3] + '/' + address[4] + '/' + address[5] + ' ' + Math.round(parseInt(level[1]) * 100 / 255).toString() + '%'); }
          mqttMessage.publish(topicPrefix + 'cbus/read/' + address[3] + '/' + address[4] + '/' + address[5] + '/state', 'ON', options, function () { });
          mqttMessage.publish(topicPrefix + 'cbus/read/' + address[3] + '/' + address[4] + '/' + address[5] + '/level', Math.round(parseInt(level[1]) * 100 / 255).toString(), options, function () { });
          eventEmitter.emit('level', address[3] + '/' + address[4] + '/' + address[5], Math.round(parseInt(level[1])));

        }
      } else if (parts1[0] == "347") {
        tree += parts1[1] + '\n';
      } else if (parts1[0] == "343") {
        tree = '';
      } else if (parts1[0].split(" ")[0] == "344") {
        parseString(tree, function (err, result) {
          try {
            if (logging === true) { console.log("C-Bus tree received:" + JSON.stringify(result)) }
            mqttMessage.publish(topicPrefix + 'cbus/read/' + treenet + '///tree', JSON.stringify(result))
          } catch (err) {
            console.log(err)
          }
          tree = '';
        });
      } else {
        var parts2 = parts1[0].toString().split(" ");
        if (parts2[0] == "300") {
          address = (parts2[1].substring(0, parts2[1].length - 1)).split("/");
          var level = parts2[2].split("=");
          if (parseInt(level[1]) == 0) {
            if (logging == true) { console.log('C-Bus status received: ' + address[3] + '/' + address[4] + '/' + address[5] + ' OFF'); }
            if (logging == true) { console.log('C-Bus status received: ' + address[3] + '/' + address[4] + '/' + address[5] + ' 0%'); }
            mqttMessage.publish(topicPrefix + 'cbus/read/' + address[3] + '/' + address[4] + '/' + address[5] + '/state', 'OFF', options, function () { });
            mqttMessage.publish(topicPrefix + 'cbus/read/' + address[3] + '/' + address[4] + '/' + address[5] + '/level', '0', options, function () { });
            eventEmitter.emit('level', address[3] + '/' + address[4] + '/' + address[5], 0);
          } else {
            if (logging == true) { console.log('C-Bus status received: ' + address[3] + '/' + address[4] + '/' + address[5] + ' ON'); }
            if (logging == true) { console.log('C-Bus status received: ' + address[3] + '/' + address[4] + '/' + address[5] + ' ' + Math.round(parseInt(level[1]) * 100 / 255).toString() + '%'); }
            mqttMessage.publish(topicPrefix + 'cbus/read/' + address[3] + '/' + address[4] + '/' + address[5] + '/state', 'ON', options, function () { });
            mqttMessage.publish(topicPrefix + 'cbus/read/' + address[3] + '/' + address[4] + '/' + address[5] + '/level', Math.round(parseInt(level[1]) * 100 / 255).toString(), options, function () { });
            eventEmitter.emit('level', address[3] + '/' + address[4] + '/' + address[5], Math.round(parseInt(level[1])));

          }

        }
      }
    }
  }
});


// Add a 'data' event handler for the client socket
// data is what the server sent to this socket
event.on('data', function (data) {
  // if (logging == true) {console.log('Event data: ' + data);}
  var parts = data.toString().split(" ");
  let address = parts[2].split("/");
  let uniqueId = `cbus_${address[3]}_${address[4]}_${address[5]}`;

  switch (parts[0]) {
    case "trigger":
      
      if (settings.enableHassDiscovery)
        sendDiscoveryMessage(HASS_DEVICE_CLASSES.BUTTON, address[3], address[4], address[5]);
      if (logging == true) { console.log('C-Bus trigger received: ' + uniqueId ); }
      
      //mqttMessage.publish('cbus/read/' + address[3] + '/' + address[4] + '/' + address[5] + '/state', '{"event_type": "hold"}', options, function () { });   
      //${topicRoot}/${deviceClass}/${uniqueId}/${topicState}
      payload = {
        event_type: "hold"
      }
      mqttMessage.publish(topicRoot + '/' + topicProject + '/' + uniqueId + '/' + topicState, JSON.stringify(payload), options, function () { });   
      break;
    
    
    // mqtt: cbus/avaialble=online
    // mqtt: cbus/device/entity/available=online
    // mqtt: cbus/device/entity/state=ON
    // mqtt: cbus/device/entity/level=100
    case "lighting":

      if (settings.enableHassDiscovery)
        sendDiscoveryMessage(HASS_DEVICE_CLASSES.LIGHT, address[3], address[4], address[5]);
    
      switch (parts[1]) {
        case "on":
          if (logging == true) { console.log('C-Bus status received: ' + address[3] + '/' + address[4] + '/' + address[5] + ' ON'); }
          if (logging == true) { console.log('C-Bus status received: ' + address[3] + '/' + address[4] + '/' + address[5] + ' 100%'); }
          //mqttMessage.publish(topicPrefix + 'cbus/read/' + address[3] + '/' + address[4] + '/' + address[5] + '/state', 'ON', options, function () { });
          //mqttMessage.publish(topicPrefix + 'cbus/read/' + address[3] + '/' + address[4] + '/' + address[5] + '/level', '100', options, function () { });

          payload = {
            state: "ON",
            brightness: Math.round(parseInt(parts[3]) * 100 / 255).toString(),
            transition: 0,
            cbus_source_addreess: parts[2],
          }

          mqttMessage.publish(topicRoot + '/' + topicProject + '/' + uniqueId + '/' + topicState, JSON.stringify(payload), options, function () { });   
          break;

        case "off":
          if (logging == true) { console.log('C-Bus status received: ' + address[3] + '/' + address[4] + '/' + address[5] + ' OFF'); }
          if (logging == true) { console.log('C-Bus status received: ' + address[3] + '/' + address[4] + '/' + address[5] + ' 0%'); }
          //mqttMessage.publish(topicPrefix + 'cbus/read/' + address[3] + '/' + address[4] + '/' + address[5] + '/state', 'OFF', options, function () { });
          //mqttMessage.publish(topicPrefix + 'cbus/read/' + address[3] + '/' + address[4] + '/' + address[5] + '/level', '0', options, function () { });

          payload = {
            state: "OFF",
            brightness: 0,
            transition: 0,
            cbus_source_addreess: parts[2],
          }

          mqttMessage.publish(topicRoot + '/' + topicProject + '/' + uniqueId + '/' + topicState, JSON.stringify(payload), options, function () { });   
          break;

        case "ramp":
          if (parseInt(parts[3]) > 0) {
            if (logging == true) { console.log('C-Bus status received: ' + address[3] + '/' + address[4] + '/' + address[5] + ' ON'); }
            if (logging == true) { console.log('C-Bus status received: ' + address[3] + '/' + address[4] + '/' + address[5] + ' ' + Math.round(parseInt(parts[3]) * 100 / 255).toString() + '%'); }
            //mqttMessage.publish(topicPrefix + 'cbus/read/' + address[3] + '/' + address[4] + '/' + address[5] + '/state', 'ON', options, function () { });
            //mqttMessage.publish(topicPrefix + 'cbus/read/' + address[3] + '/' + address[4] + '/' + address[5] + '/level', Math.round(parseInt(parts[3]) * 100 / 255).toString(), options, function () { });

            payload = {
              state: "ON",
              brightness: Math.round(parseInt(parts[3]) * 100 / 255).toString(),
              transition: 0,
              cbus_source_addreess: parts[2],
            }
  
            mqttMessage.publish(topicRoot + '/' + topicProject + '/' + uniqueId + '/' + topicState, JSON.stringify(payload), options, function () { });   
  

          } else {
            if (logging == true) { console.log('C-Bus status received: ' + address[3] + '/' + address[4] + '/' + address[5] + ' OFF'); }
            if (logging == true) { console.log('C-Bus status received: ' + address[3] + '/' + address[4] + '/' + address[5] + ' 0%'); }
            //mqttMessage.publish(topicPrefix + 'cbus/read/' + address[3] + '/' + address[4] + '/' + address[5] + '/state', 'OFF', options, function () { });
            //mqttMessage.publish(topicPrefix + 'cbus/read/' + address[3] + '/' + address[4] + '/' + address[5] + '/level', '0', options, function () { });

            payload = {
              state: "OFF",
              brightness: 0,
              transition: 0,
              cbus_source_addreess: parts[2],
            }
  
            mqttMessage.publish(topicRoot + '/' + topicProject + '/' + uniqueId + '/' + topicState, JSON.stringify(payload), options, function () { });   
  
          }
          break;
        default:
      }
    default:
  }

});


function sendDiscoveryMessage(deviceClass, networkId, serviceId, unitId) {
  //https://www.home-assistant.io/integrations/event.mqtt/

  //https://github.com/home-assistant/core/issues/97678

  //Discovery topic

  // <discovery_prefix>/<component>/[<node_id>/]<object_id>/config
  //
  //  <discovery_prefix>: The Discovery Prefix defaults to homeassistant. This prefix can be changed.
  //  <component>: One of the supported MQTT integrations, eg. binary_sensor.
  //  <node_id> (Optional): ID of the node providing the topic, this is not used by Home Assistant but may be used to structure the MQTT topic. The ID of the node must only consist of characters from the character class [a-zA-Z0-9_-] (alphanumerics, underscore and hyphen).
  //  <object_id>: The ID of the device. This is only to allow for separate topics for each device and is not used for the entity_id. The ID of the device must only consist of characters from the character class [a-zA-Z0-9_-] (alphanumerics, underscore and hyphen).


  let uniqueId = `cbus_${networkId}_${serviceId}_${unitId}`;
  if (discoverySent.includes(uniqueId)) return;
  if (logging == true) console.log('Sending Hass discovery message');
  let payload = {};
  let mqttTopic = "";
  switch (deviceClass) {
    case "device":
      payload = {
        //~: `${topicMeta}`,
        name: 'cbus-mqtt',
        unique_id: 'cbus-mqtt',
        state_topic: `${topicRoot}/${topicProject}/${topicMeta}/${topicState}`, // [cbus][/home][/binary_sensor/cbus-mqtt][/state]
        device: {
          identifiers: ['cbus-mqtt'],
          name: 'cbus-mqtt',
          manufacturer: 'DamianFlynn.com',
          model: 'cbus-mqtt',
          sw_version: '0.1',
        }
      };
      // [homeassistant][/binary_sensor/cbus-mqtt][/config]
      mqttTopic = `${topicDiscovery}/binary_sensor/${topicMeta}/${topicConfig}`;      
      break;
    
    case "light":
      payload = {
        name: `${uniqueId}`,
        unique_id: `${uniqueId}`,
        state_topic: `${topicRoot}/${deviceClass}/${uniqueId}/${topicState}`, // [cbus]/[light]/[cbus_254_54_01]/[state]
        //state_topic: `homeassistant/cbus/read/${networkId}/${serviceId}/${unitId}/state`,
        command_topic: `${topicRoot}/${deviceClass}/${uniqueId}/${topicSet}`, // [cbus]/[light]/[cbus_254_54_01]/[set]
        //command_topic: `homeassistant/cbus/write/${networkId}/${serviceId}/${unitId}/switch`,
        brightness_state_topic: `${topicRoot}/${deviceClass}/${uniqueId}/${topicState}`, // [cbus]/[light]/[cbus_254_54_01]/[state]
        //brightness_state_topic: `homeassistant/cbus/read/${networkId}/${serviceId}/${unitId}/level`,
        brightness_command_topic: `${topicRoot}/${deviceClass}/${uniqueId}/${topicSet}`, // [cbus]/[light]/[cbus_254_54_01]/[set]
        //brightness_command_topic: `homeassistant/cbus/write/${networkId}/${serviceId}/${unitId}/ramp`,
        brightness_scale: 100,
        qos: 0,
        payload_on: "ON",
        payload_off: "OFF",
        optimistic: false,
        icon: "mdi:lightbulb-on-50",
        device: {
          identifiers: [uniqueId],
          name: uniqueId,
          manufacturer: "Clipsal",
          model: "C-Bus Lighting Application",
          connections: ['cbus_address', `${networkId}/${serviceId}/${unitId}`],
          via_device: 'cbus-mqtt'
        }
      }
      // [homeassistant]/[light]/[cbus-mqtt]/[cbus_254_54_01]/[config]
      mqttTopic = `${topicDiscovery}/${deviceClass}/${topicMeta}/${uniqueId}/${topicConfig}`;  

      break;

    case "switch":
      payload = {
        name: `${uniqueId}`,
        unique_id: `${uniqueId}`,
        state_topic: `homeassistant/cbus/read/${networkId}/${serviceId}/${unitId}/state`,
        command_topic: `homeassistant/cbus/write/${networkId}/${serviceId}/${unitId}/switch`,
        qos: 0,
        payload_on: "ON",
        payload_off: "OFF",
        optimistic: false,
        icon: "mdi:lightbulb-on",
        device: {
          identifiers: [uniqueId],
          name: uniqueId,
          manufacturer: "Clipsal",
          model: "C-Bus Lighting Application",
          connections: ['cbus_address', `${networkId}/${serviceId}/${unitId}`],
          via_device: 'cbus-mqtt'  
        }
      }
      homeassistant/light/cbus_groupaddress/config
      mqttTopic = `${topicDiscovery}${topicMeta}${topicConfig}`;  // [homeassistant][/light/cbus-mqtt][/state]
    
      break;

    case "button":
      payload = {
        name: `${uniqueId}`,
        unique_id: `${uniqueId}`,
        availability_topic: "cbus/PLC/House/availability",
        payload_available: "online",
        payload_not_available: "offline",
        device: {
          identifiers: [uniqueId],
          name: uniqueId,
          manufacturer: "Clipsal",
          model: "C-Bus Trigger Application",
          connections: ['cbus_address', `${networkId}/${serviceId}/${unitId}`],
          via_device: 'cbus-mqtt'
        },
        device_class: "button",
        event_types: [
          "SINGLE",
          "DOUBLE",
          "LONG"
        ],
        //state_topic: "Devices/PLC/House/Out/DigitalInputs/Pushbuttons/FB_DI_PB_001"
        state_topic: `cbus/read/${networkId}/${serviceId}/${unitId}/state`,
        //The JSON payload should contain the event_type element. 
        icon: "mdi:gesture-double-tap",
        qos: 2
      }
      
      break;
  
    default:
  }

  // Event Payload

  // "~": "homeassistant/test1234/"
  // Current: //homeassistant/light/cbus_254_56_1/cbus_254_56_1_light/config
  // Should be: //homeassistant/{light}/{device}/{entity cbus_254_56_1}/config
  //mqttMessage.publish(`${topicPrefix}${deviceClass}/${uniqueId}/${uniqueId}_light/config`, JSON.stringify(payload));
  mqttMessage.publish(`${mqttTopic}`, JSON.stringify(payload));
  
  discoverySent.push(uniqueId);
}




function readXmlFile(filePath) {
  filePath = path.join(__dirname, filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.error(err);
      if (logging == true) { console.log('C-Bus Project File not found: ' + filePath); }
      return;
    }
    const parser = new xml2js.Parser();
    parser.parseString(data, (err, result) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log(result);
      const units = result.Installation.Project[0].Network[0].Unit?.filter(unit => unit.CatalogNumber[0].startsWith('L55')) || [];
      const groupElements = [];

      units.forEach(unit => {
        console.log(`Unit: ${JSON.stringify(unit)}`);
        const catalogNumber = unit.CatalogNumber[0];
        const numGroups = parseInt(catalogNumber.substr(3, 2), 10);
        const groupAddressObj = unit.PP.find(pp => pp.$.Name === 'GroupAddress');
        const unitAddressObj = unit.PP.find(pp => pp.$.Name === 'UnitAddress');
        const unitAddress = unitAddressObj?.$?.Value;
        const unitNameObj = unit.PP.find(pp => pp.$.Name === 'UnitName');
        const unitName = unitNameObj?.$?.Value;
        const groupAddress = groupAddressObj?.$?.Value;
        const groups = groupAddress?.split(' ').map(hex => parseInt(hex, 16).toString()).join(' ').match(/.{2}/g).slice(0, numGroups) || [];
        groups.forEach(group => {
          const groupNumber = parseInt(group, 10);
          groupElements[groupNumber] = {
            isDimmer: catalogNumber[5] === 'D',
            unitName: unitName,
            unitAddress: unitAddress
          };
        });
      });
      console.log(`Group Elements: ${JSON.stringify(groupElements)}`);

      const appGroups = result.Installation.Project[0].Network[0].Application.find(app => app.Address[0] === '56').Group;

      appGroups.forEach(group => {
        const groupAddress = parseInt(group.Address[0], 10);
        const groupElement = groupElements[groupAddress];
        if (groupElement) {
          groupElement.tagName = group.TagName[0];
          console.log(`Group Name: ${group.TagName[0]}, Address: ${groupAddress}, Type: ${groupElement.isDimmer ? 'Dimmer' : 'Relay'}`);
        }
      });

      console.log(`Group Elements: ${JSON.stringify(groupElements)}`);
      // Now Publish the MQTT Discovery Messages

    });
  });
}

