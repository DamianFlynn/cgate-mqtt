# C-Gate to MQTT

## Base Topic - Autodiscovery

Topic: `homeassistant/binary_sensor/cbus2-mqtt/config`

Payload:
```json
{
   "name": 'Bridge Status',
        unique_id: `${topicMeta}`,
        state_topic: `${topicRoot}/bridge/${topicMeta}/${topicState}`, 
        device: {
          identifiers: [`${topicMeta}`],
          name: 'CBus',
          //sw_version: "https://github.com/damianflynn/cgate-mqtt", 
          manufacturer: 'DamianFlynn.com',
          model: 'C-Bus C-Gate MQTT Bridge',
          sw_version: '0.3',
        }
      }
```

Subscribed topics:
`cbus/bridge/cbus2-mqtt/state`

### State Information

Topic: `cbus/bridge/cbus2-mqtt/state`

Payload:
```json
```

## Light

Topic: `homeassistant/light/cbus2-mqtt/cbus_254_56_16/config`

Payload:
```json
{
    "name":"Office Roof",
    "unique_id":"cbus_254_56_16",
    "state_topic":"cbus/light/cbus2-mqtt/cbus_254_56_16",
    "command_topic":"cbus/light/cbus2-mqtt/cbus_254_56_16/set",
    "qos":0,
    "payload_on":"ON",
    "payload_off":"OFF",
    "optimistic":false,
    "icon":"mdi:lightbulb-on-50",
    "device":{
        "identifiers":["cbus2-mqtt"],
        "name":"CBus",
        "manufacturer":"DamianFlynn.com",
        "model":"C-Bus C-Gate MQTT Bridge",
        "sw_version":"0.3",
        "via_device":"cbus2-mqtt"
    },
    "brightness_state_topic":"cbus/light/cbus_254_56_16/brightness",
    "brightness_command_topic":"cbus/light/cbus_254_56_16/brightness/set",
    "brightness_scale":100}
```
