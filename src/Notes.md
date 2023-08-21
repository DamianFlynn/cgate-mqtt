# Payload Considerations

## Base Topic - Autodiscovery

Topic: `homeassistant/binary_sensor/cbus_cmqttd/config`

Payload:
```json
{
    "~": "homeassistant/binary_sensor/cbus_cmqttd", 
    "name": "cmqttd", 
    "unique_id": "cmqttd", 
    "stat_t": "~/state", 
    "device": {
        "identifiers": ["cmqttd"], 
        "sw_version": "cmqttd https://github.com/micolous/cbus", 
        "name": "cmqttd", 
        "manufacturer": "micolous", 
        "model": "libcbus"
    }
}
```

Subscribed topics:
`homeassistant/binary_sensor/cbus_cmqttd/state`

### State Information

Topic: `homeassistant/binary_sensor/cbus_cmqttd/state`

Payload:
```json
```

## Light (Sensor) - Autodiscovery


Topic: `homeassistant/binary_sensor/cbus_16/config`

payload:
```json
{
    "name": "C-Bus Light 016 (as binary sensor)", 
    "unique_id": "cbus_bin_sensor_16", 
    "stat_t": "homeassistant/binary_sensor/cbus_16/state", 
    "device": {
        "identifiers": ["cbus_bin_sensor_16"], 
        "connections": [["cbus_group_address", "16"]], 
        "sw_version": "cmqttd https://github.com/micolous/cbus", 
        "name": "C-Bus Light 016", 
        "manufacturer": "Clipsal", 
        "model": "C-Bus Lighting Application", 
        "via_device": "cmqttd"
    }
}
```

Topic: `homeassistant/binary_sensor/cbus_16/state`

payload:
```json
ON
```

## Light

Topic: `homeassistant/light/cbus_16/config`

Payload:
```json
{
    "name": "C-Bus Light 016", 
    "unique_id": "cbus_light_16", 
    "cmd_t": "homeassistant/light/cbus_16/set", 
    "stat_t": "homeassistant/light/cbus_16/state", 
    "schema": "json", 
    "brightness": true, 
    "device": {
        "identifiers": ["cbus_light_16"], 
        "connections": [["cbus_group_address", "16"]], 
        "sw_version": "cmqttd https://github.com/micolous/cbus", 
        "name": "C-Bus Light 016", 
        "manufacturer": "Clipsal", 
        "model": "C-Bus Lighting Application", 
        "via_device": "cmqttd"
    }
}
```

Topic: `homeassistant/light/cbus_16/state`

Payload:
```json
{
    "state": "ON", 
    "brightness": 255, 
    "transition": 0, 
    "cbus_source_addr": 1
}
```

Set Off -  Sending `homeassistant/light/cbus_16/set`

Payloads:
```json
{"state":"OFF"} 
// 39%
{"state":"ON","brightness":99}
```
