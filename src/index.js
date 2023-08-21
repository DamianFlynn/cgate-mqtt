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


//var topicDiscovery = 'homeassistant'
var topicProject = 'home'


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

var discoverySent = [];
var HASS_DEVICE_CLASSES = {
  LIGHT: "light",
  RELAY: "switch",
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
var mqttChannel = mqtt.createClient(mqtt_url.port, mqtt_url.hostname, OPTIONS);
var cbusCmdChannel = new net.Socket();
var cbusEventChannel = new net.Socket();

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
      mqttChannel.publish(msg.topic, msg.payload)
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
      cbusCmdChannel.write(cgateCommand.queue.shift())
    }
  },
  interval: null,
  queue: []
}


var HOST = settings.cbusip;
var cbusCmdPort = 20023;
var cbusEventPort = 20025;

var logging = settings.logging;
var isRamping = false;



// Connect to cgate via telnet
cbusCmdChannel.connect(cbusCmdPort, HOST);


// Connect to cgate event port via telnet
cbusEventChannel.connect(cbusEventPort, HOST);

function ramping() {
  isRamping = false;
}

function started() {
  if (cbusCmdConnected && cbusEventConnected && mqttChannel.connected) {
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

mqttChannel.on('disconnect', function () {
  mqttConnected = false;
})

mqttChannel.on('connect', function () { // When connected
  mqttConnected = true;
  console.log('CONNECTED TO MQTT: ' + settings.mqtt);
  started()

  // Subscribe to MQTT
  mqttChannel.subscribe('cbus/#', function () {
    // when a message arrives, do something with it
    mqttChannel.on('message', function (topicArg, message, packet) {
      if (logging == true) { console.log('Message received on ' + topicArg + ' : ' + message); }

      let topic = topicArg;
      if (topicPrefix)
        topic = topic.replace(topicPrefix, "");
      parts = topic.split("/");

      cbusAddress = parts[3].split("_").slice(1).join("/");
      switch (parts[parts.length -1].toLowerCase())  {
        
          case "set":
            console.log(`Set Command :: [${parts[parts.length -2].toLowerCase()}] ${message} for ${cbusAddress} received`);
            switch (parts[parts.length -2].toLowerCase()) {
              case "brightness":
                // The message is for the groups brightness
                var level = Math.round(parseInt(message) * 255 / 100)
                if (!isNaN(level) && level < 256) {
                  cgateCommand.write('RAMP //' + settings.cbusname + '/' + cbusAddress + ' ' + level + '\n');
                }
                break;

              default:
                // Assume the message is for the group topic
                if (message === "ON") {
                  // execute logic for state ON
                  cgateCommand.write('ON //' + settings.cbusname + '/' + cbusAddress + '\n')
                } else if (message === "OFF") {
                  // execute logic for state OFF
                  cgateCommand.write('OFF //' + settings.cbusname + '/' + cbusAddress + '\n');
                }              
            }
            break;


          case "transition":
            // execute logic for transition
            console.log(`[${parts[4].toLowerCase()}] message for ${cbusAddress} received: ${message}`);
            break;
          default:
            // handle unknown key
            console.log(`Ignoring [${parts[parts.length -1].toLowerCase()}] "${message}" message for ${topic}`);
      }


   
        // switch (parts[5].toLowerCase()) {

        //   // Get updates from all groups
        //   case "gettree":
        //     treenet = parts[2];
        //     cgateCommand.write('TREEXML ' + parts[2] + '\n');
        //     break;

        //   // Get updates from all groups
        //   case "discovery":
        //     discoverySent = [];
        //     cgateCommand.write('GET //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/* level\n');
        //     break;

        //   // Get updates from all groups
        //   case "getall":
        //     cgateCommand.write('GET //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/* level\n');
        //     break;

        //   // On/Off control
        //   case "switch":

        //     if (message == "ON") {
        //       if (logging == true) console.log(`ON Command, ramping: ${isRamping}`);
        //       if (!isRamping)
        //         cgateCommand.write('ON //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + '\n')
        //     };
        //     if (message == "OFF") { cgateCommand.write('OFF //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + '\n') };
        //     break;

        //   // Ramp, increase/decrease, on/off control
        //   case "ramp":
        //     isRamping = true;
        //     if (logging == true) console.log('Ramping');
        //     setTimeout(ramping, 1000);
        //     switch (message.toUpperCase()) {
        //       case "INCREASE":
        //         eventEmitter.on('level', function increaseLevel(address, level) {
        //           if (address == parts[2] + '/' + parts[3] + '/' + parts[4]) {
        //             cgateCommand.write('RAMP //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + ' ' + Math.min((level + 26), 255) + ' ' + '\n');
        //             eventEmitter.removeListener('level', increaseLevel);
        //           }
        //         });
        //         cgateCommand.write('GET //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + ' level\n');

        //         break;

        //       case "DECREASE":
        //         eventEmitter.on('level', function decreaseLevel(address, level) {
        //           if (address == parts[2] + '/' + parts[3] + '/' + parts[4]) {
        //             cgateCommand.write('RAMP //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + ' ' + Math.max((level - 26), 0) + ' ' + '\n');
        //             eventEmitter.removeListener('level', decreaseLevel);
        //           }
        //         });
        //         cgateCommand.write('GET //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + ' level\n');

        //         break;

        //       case "ON":
        //         cgateCommand.write('ON //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + '\n');
        //         break;
        //       case "OFF":
        //         cgateCommand.write('OFF //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + '\n');
        //         break;
        //       default:
        //         var ramp = message.split(",");
        //         var num = Math.round(parseInt(ramp[0]) * 255 / 100)
        //         if (!isNaN(num) && num < 256) {

        //           if (ramp.length > 1) {
        //             cgateCommand.write('RAMP //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + ' ' + num + ' ' + ramp[1] + '\n');
        //           } else {
        //             cgateCommand.write('RAMP //' + settings.cbusname + '/' + parts[2] + '/' + parts[3] + '/' + parts[4] + ' ' + num + '\n');
        //           }
        //         }
        //     }
        //     break;
        //   default:
        // }
    });
  });

  // publish a message to a topic  
  mqttMessage.publish('cbus/bridge/cbus2-mqtt/state', "online", options, function () { });
});

cbusCmdChannel.on('error', function (err) {
  console.log('COMMAND ERROR:' + JSON.stringify(err))
})

cbusEventChannel.on('error', function (err) {
  console.log('EVENT ERROR:' + JSON.stringify(err))
})

cbusCmdChannel.on('connect', function (err) {
  cbusCmdConnected = true;
  console.log('CONNECTED TO C-GATE COMMAND PORT: ' + HOST + ':' + cbusCmdPort);
  cgateCommand.write('EVENT ON\n');
  started()
  clearInterval(commandInterval);
})

cbusEventChannel.on('connect', function (err) {
  cbusEventConnected = true;
  console.log('CONNECTED TO C-GATE EVENT PORT: ' + HOST + ':' + cbusEventPort);
  started()
  clearInterval(eventInterval);
})


cbusCmdChannel.on('close', function () {
  cbusCmdConnected = false;
  console.log('COMMAND PORT DISCONNECTED')
  commandInterval = setTimeout(function () {
    console.log('COMMAND PORT RECONNECTING...')
    cbusCmdChannel.connect(cbusCmdPort, HOST)
  }, 10000)
})

cbusEventChannel.on('close', function () {
  cbusEventConnected = false;
  console.log('EVENT PORT DISCONNECTED')
  eventInterval = setTimeout(function () {
    console.log('EVENT PORT RECONNECTING...')
    cbusEventChannel.connect(cbusEventPort, HOST)
  }, 10000)
})

cbusCmdChannel.on('data', function (data) {
  if (logging == true) {console.log('Command data: ' + data);}
  var lines = (buffer + data.toString()).split("\n");
  buffer = lines[lines.length - 1];
  if (lines.length > 1) {
    for (i = 0; i < lines.length - 1; i++) {
      var parts1 = lines[i].toString().split("-");
      if (parts1.length > 1 && parts1[0] == "300") {
        var parts2 = parts1[1].toString().split(" ");

        address = (parts2[0].substring(0, parts2[0].length - 1)).split("/");
        let uniqueId = `cbus_${address[3]}_${address[4]}_${address[5]}`;

        var level = parts2[1].split("=");
        if (parseInt(level[1]) == 0) {
          // Light is 'Off'
          eventEmitter.emit('level', address[3] + '/' + address[4] + '/' + address[5], 0);
          mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/state`, "OFF", options, function () { });
        } else {
          // Light is 'On' (Dimmer) 
          eventEmitter.emit('level', address[3] + '/' + address[4] + '/' + address[5], Math.round(parseInt(level[1])));
          mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/brightness`, Math.round(parseInt(level[1]) * 100 / 255).toString(), options, function () { });
          mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/state`, "ON", options, function () { });
        }
      } else if (parts1[0] == "347") {
        tree += parts1[1] + '\n';
      } else if (parts1[0] == "343") {
        tree = '';
      } else if (parts1[0].split(" ")[0] == "344") {
        parseString(tree, function (err, result) {
          try {
            if (logging === true) { console.log("C-Bus tree received:" + JSON.stringify(result)) }
            mqttMessage.publish('cbus/bridge/cbus2-mqtt/tree/' + treenet, JSON.stringify(result), options, function () { });
          } catch (err) {
            console.log(err)
          }
          tree = '';
        });
      } else {
        var parts2 = parts1[0].toString().split(" ");
        if (parts2[0] == "300") {
          address = (parts2[1].substring(0, parts2[1].length - 1)).split("/");
          let uniqueId = `cbus_${address[3]}_${address[4]}_${address[5]}`;
          var level = parts2[2].split("=");
          if (parseInt(level[1]) == 0) {
            // Light is 'Off'
            eventEmitter.emit('level', address[3] + '/' + address[4] + '/' + address[5], 0);
            mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/state`, "OFF", options, function () { });
          } else {

            eventEmitter.emit('level', address[3] + '/' + address[4] + '/' + address[5], Math.round(parseInt(level[1])));
            mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/brightness`, Math.round(parseInt(level[1]) * 100 / 255).toString(), options, function () { });
          }

        }
      }
    }
  }
});


// Add a 'data' event handler for the client socket
// data is what the server sent to this socket
cbusEventChannel.on('data', function (data) {
  if (logging == true) {console.log('Event data: ' + data);}
  var parts = data.toString().split(" ");
  let address = parts[2].split("/");
  let uniqueId = `cbus_${address[3]}_${address[4]}_${address[5]}`;

  switch (parts[0]) {
    case "trigger":
      
      if (settings.enableHassDiscovery)
        sendDiscoveryMessage(HASS_DEVICE_CLASSES.BUTTON, address[3], address[4], address[5]);
      if (logging == true) { console.log('C-Bus trigger received: ' + uniqueId ); }
      
      payload=  {
        event_type: "hold"
      }

      mqttMessage.publish(`cbus/sensor/cbus2-mqtt/${uniqueId}/state`, JSON.stringify(payload), options, function () { });   
      break;
    
    case "lighting":
    
      switch (parts[1]) {
        case "on":
          mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/state`, "ON", options, function () { });
          break;

        case "off":
          mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/state`, "OFF", options, function () { });
          break;

        case "ramp":
          if (parseInt(parts[3]) > 0) {
            mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/brightness`, Math.round(parseInt(parts[3]) * 100 / 255).toString(), options, function () { });
            mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/state`, "ON", options, function () { });
          } else {
            mqttMessage.publish(`cbus/light/cbus2-mqtt/${uniqueId}/state`, "OFF", options, function () { });
          }
    
          break;
        default:
          console.log (`Ignoring [cbus] C-Bus message for ${uniqueId}` )
      }
      break;

    default:
  }
});


function sendDiscoveryMessage(deviceClass, networkId, serviceId, groupId, TagName, outputChannel, unitName, unitAddress, outputType, unitCatalogNumber) {
  //https://www.home-assistant.io/integrations/event.mqtt/

  //https://github.com/home-assistant/core/issues/97678

  //Discovery topic

  // <discovery_prefix>/<component>/[<node_id>/]<object_id>/config
  //
  //  <discovery_prefix>: The Discovery Prefix defaults to homeassistant. This prefix can be changed.
  //  <component>: One of the supported MQTT integrations, eg. binary_sensor.
  //  <node_id> (Optional): ID of the node providing the topic, this is not used by Home Assistant but may be used to structure the MQTT topic. The ID of the node must only consist of characters from the character class [a-zA-Z0-9_-] (alphanumerics, underscore and hyphen).
  //  <object_id>: The ID of the device. This is only to allow for separate topics for each device and is not used for the entity_id. The ID of the device must only consist of characters from the character class [a-zA-Z0-9_-] (alphanumerics, underscore and hyphen).


  let uniqueId = `cbus_${networkId}_${serviceId}_${groupId}`;
  if (discoverySent.includes(uniqueId)) return;
  if (logging == true) console.log('Sending Hass discovery message');
  let payload = {};
  let mqttTopic = "";
  switch (deviceClass) {
    case "device":
      console.log('Sending HASS Discovery message for CBUS-MQTT');
      payload = {
        // '~': `cbus2-mqtt`,
        name: 'Bridge Status',
        unique_id: `cbus2-mqtt`,
        state_topic: `cbus/bridge/cbus2-mqtt/state`, 
        device: {
          identifiers: [`cbus2-mqtt`],
          name: 'CBus',
          sw_version: "https://github.com/DamianFlynn/cgate-mqtt", 
          manufacturer: 'DamianFlynn.com',
          model: 'C-Bus C-Gate MQTT Bridge',
          sw_version: '0.3',
        }
      };
         
      mqttTopic = `homeassistant/binary_sensor/cbus2-mqtt/config`; 
      break;
    
    case "light":

      payload = {
        name: `${TagName}`,
        unique_id: `${uniqueId}`,
        object_id: `${uniqueId}`,
        state_topic: `cbus/${deviceClass}/cbus2-mqtt/${uniqueId}/state`, 
        command_topic: `cbus/${deviceClass}/cbus2-mqtt/${uniqueId}/set`, 
        json_attributes_topic: `cbus/${deviceClass}/cbus2-mqtt/${uniqueId}/attributes`, 
        //qos: 0,
        //optimistic: false,
        brightness: false,
        icon: "mdi:lightbulb-on",
        device: {
          identifiers: [`cbus2-mqtt`],
          name: 'CBus',
          connections: [["cbus_network_address", `//HOME/${networkId}/${serviceId}/${groupId}`]],
          manufacturer: 'DamianFlynn.com',
          model: 'C-Bus C-Gate MQTT Bridge',
          sw_version: '0.3',
          via_device: `cbus2-mqtt`
        }
      }
      if (outputType == "Dimmer") {
        payload.brightness_state_topic = `cbus/${deviceClass}/cbus2-mqtt/${uniqueId}/brightness`; 
        payload.brightness_command_topic = `cbus/${deviceClass}/cbus2-mqtt/${uniqueId}/brightness/set`;
        payload.brightness_scale = 100;
        payload.brightness = true;
        payload.on_command_type = "brightness"
        payload.icon = "mdi:lightbulb-on-50";
      }
      attributes = {
        cbus_address: `${networkId}/${serviceId}/${groupId}`,
        unit_name: `${unitName}`,
        unit_address: `${unitAddress}`,
        unit_type: `${outputType}`,
        unit_model: `${unitCatalogNumber}`,
        output_channel: `${outputChannel}`
      }
      mqttMessage.publish(`cbus/${deviceClass}/cbus2-mqtt/${uniqueId}/attributes`, JSON.stringify(attributes));
      mqttTopic = `homeassistant/light/cbus2-mqtt/${uniqueId}/config`;
      break;

    // case "switch":
    //   payload = {
    //     name: `${uniqueId}`,
    //     unique_id: `${uniqueId}`,
    //     state_topic: `cbus/${deviceClass}/cbus2-mqtt/${uniqueId}`, // [cbus]/[light]/[cbus_254_54_01]/[state]
    //     command_topic: `cbus/${deviceClass}/cbus2-mqtt/${uniqueId}`, // [cbus]/[light]/[cbus_254_54_01]/[set]
    //     qos: 0,
    //     payload_on: "ON",
    //     payload_off: "OFF",
    //     optimistic: false,
        
    //     device: {
    //       identifiers: [uniqueId],
    //       name: uniqueId,
    //       manufacturer: "Clipsal",
    //       model: "C-Bus Lighting Application",
    //       connections: ['cbus_address', `${networkId}/${serviceId}/${groupId}`],
    //       via_device: `cbus2-mqtt` 
    //     }
    //   }
    //   // [homeassistant]/[light]/[cbus-mqtt]/[cbus_254_54_01]/[config]
    //   mqttTopic = `homeassistant/${deviceClass}/cbus2-mqtt/${uniqueId}/config`;  

    //   break;

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
          connections: ['cbus_address', `${networkId}/${serviceId}/${groupId}`],
          via_device: `cbus2-mqtt`
        },
        device_class: "button",
        event_types: [
          "SINGLE",
          "DOUBLE",
          "LONG"
        ],
        state_topic: `cbus/read/${networkId}/${serviceId}/${groupId}/state`,
        //The JSON payload should contain the event_type element. 
        icon: "mdi:gesture-double-tap",
        qos: 2
      }
      
      break;
  
    default:
  }

  // Event Payload
  mqttMessage.publish(`${mqttTopic}`, JSON.stringify(payload));
  
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
        //const groups = groupAddress?.split(' ').map(hex => parseInt(hex, 16).toString())//.join('').match(/.{2} /g).slice(0, numGroups).map(group => group.trim()) || [];
        
        //const groups = groupAddress?.split(' ').map(hex => parseInt(hex, 16).toString()).join('').match(/.{2} /g).slice(0, numGroups).map(group => group.trim()) || [];
        //const groups = groupAddress?.split(' ').map(hex => parseInt(hex, 16).toString()).join(' ').match(/.{2}/g).slice(0, numGroups) || [];
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

