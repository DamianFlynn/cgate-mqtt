# eDLT (Electronic Dynamic Labelling Technology) Support

This document describes the eDLT label support added to the cgate-mqtt bridge, allowing you to dynamically update labels on Clipsal C-Bus DLT wall switches.

## Overview

The eDLT feature allows you to:
- Set custom text labels on DLT switch displays
- Update labels dynamically via MQTT
- Automatically sync time/date to DLT units
- Support templating for dynamic content (future enhancement)

## Configuration

Add the following settings to your `settings.js` file:

```javascript
// eDLT (Dynamic Labelling Technology) Support
exports.enableDltSupport = true;
exports.enableDltTemplating = false;

// Update DLT time/date on startup and periodically
exports.updateDltTimeOnStart = true;
exports.updateDltTimePeriod = 60*60; // Update every hour (in seconds)
```

### Configuration Options

- **enableDltSupport**: Enable or disable DLT functionality (default: true)
- **enableDltTemplating**: Enable template processing in labels (default: false)
- **updateDltTimeOnStart**: Update time/date on all DLT units when bridge starts (default: true)
- **updateDltTimePeriod**: How often to update time/date on DLT units in seconds (default: 3600 = 1 hour)

## MQTT Topics

### Setting DLT Labels

To set a label on a DLT unit, publish to:

```
cbus/dlt/{network}_{application}_{group}/{line}/set
```

**Parameters:**
- `network`: C-Bus network address (typically 254)
- `application`: C-Bus application (typically 56 for lighting)
- `group`: Group address of the DLT unit
- `line`: Display line number (1-8, depending on DLT model)

**Example:**

Set line 1 of DLT unit at address 254/56/10:

```bash
mosquitto_pub -h localhost -t "cbus/dlt/254_56_10/1/set" -m "Living Room"
```

Set line 2 with temperature information:

```bash
mosquitto_pub -h localhost -t "cbus/dlt/254_56_10/2/set" -m "Temp: 22°C"
```

### Label State

When a label is set, the bridge publishes a confirmation to:

```
cbus/dlt/{network}_{application}_{group}/{line}/state
```

You can subscribe to this topic to monitor label changes.

## DLT Unit Discovery

The bridge automatically discovers DLT units from your C-Bus project XML file. DLT units are identified by catalog numbers that:
- Start with "L51" (e.g., L5104DLP)
- Contain "DLT" in the catalog number
- Contain "DLP" in the catalog number

When the bridge starts, it will log discovered DLT units:

```
DLT Unit found: Kitchen DLT (L5104DLP) at address 254/56/15
DLT Unit found: Bedroom DLT (L5104DLT) at address 254/56/16
Found 2 DLT units
```

## Time/Date Updates

The bridge can automatically update the time and date on all discovered DLT units. This uses the C-Gate server's current time.

Time updates are sent:
- On startup (if `updateDltTimeOnStart` is true)
- Periodically based on `updateDltTimePeriod` setting

Manual time update via MQTT is not currently supported but can be added if needed.

## Usage Examples

### Home Assistant Automation

Update a DLT label when temperature changes:

```yaml
automation:
  - alias: "Update DLT Temperature Display"
    trigger:
      - platform: state
        entity_id: sensor.living_room_temperature
    action:
      - service: mqtt.publish
        data:
          topic: "cbus/dlt/254_56_10/2/set"
          payload: "Temp: {{ states('sensor.living_room_temperature') }}°C"
```

### Node-RED Flow

Create a flow to update DLT labels based on various conditions:

```json
[
    {
        "id": "inject_node",
        "type": "inject",
        "name": "Update Label",
        "topic": "",
        "payload": "Welcome Home!",
        "payloadType": "str",
        "repeat": "",
        "crontab": "",
        "once": false,
        "onceDelay": 0.1,
        "wires": [["mqtt_out"]]
    },
    {
        "id": "mqtt_out",
        "type": "mqtt out",
        "name": "DLT Label",
        "topic": "cbus/dlt/254_56_10/1/set",
        "qos": "0",
        "retain": "false",
        "broker": "mqtt_broker",
        "wires": []
    }
]
```

### Python Script

```python
import paho.mqtt.client as mqtt

client = mqtt.Client()
client.connect("localhost", 1883, 60)

# Set multiple lines on a DLT unit
dlt_address = "254_56_10"
labels = {
    1: "Kitchen",
    2: "Temp: 22°C",
    3: "Status: OK",
    4: ""  # Clear line 4
}

for line, text in labels.items():
    topic = f"cbus/dlt/{dlt_address}/{line}/set"
    client.publish(topic, text)

client.disconnect()
```

## Template Support (Future Enhancement)

When `enableDltTemplating` is enabled, you can use template syntax in labels:

```
Temp: ${cbus/sensor/temperature}
```

The bridge will substitute the current value from the specified MQTT topic. This feature requires further implementation.

## Limitations

1. **Line Count**: DLT displays typically have 4-8 lines depending on the model
2. **Character Limit**: Each line typically supports 16-20 characters
3. **Update Rate**: To avoid overwhelming the C-Bus network, use the built-in message queueing (controlled by `messageinterval` setting)
4. **Unicode Support**: Limited to characters supported by the DLT display

## Troubleshooting

### Labels Not Updating

1. Check that `enableDltSupport` is set to `true` in settings.js
2. Verify the DLT unit address is correct
3. Enable logging (`exports.logging = true`) to see command output
4. Check that your DLT unit supports dynamic labelling

### DLT Units Not Discovered

1. Ensure your C-Bus project XML file is correctly mounted
2. Check that DLT units are properly configured in C-Bus Toolkit
3. Enable logging to see parsed XML output

### Time Not Updating

1. Verify `updateDltTimeOnStart` and `updateDltTimePeriod` are configured
2. Check C-Gate server time is correct
3. Ensure DLT units support time/date display

## C-Gate Commands

The bridge uses the following C-Gate commands for DLT functionality:

### Set Label

Saturn eDLT requires the `lighting label` command with hex-encoded text and 0-based button indexing:

```
lighting label {network}/56 1 {group} - {button} {hex-encoded-text}
```

Example (sets button 0 / MQTT line 1 to "Kitchen Lights"):
```
lighting label 254/56 1 10 - 0 4b69746368656e204c6967687473
```

### Update Time/Date
```
time //{project}/{network}/{application}/{group}
```

Example:
```
time //HOME/254/56/10
```

## References

- [C-Bus DLT Product Information](https://www.clipsal.com/products/cbus)
- [C-Gate Server Documentation](https://updates.clipsal.com/ClipsalSoftwareDownload/DL/downloads/OpenCBus/OpenCBusProtocolDownloads.html)
- Original inspiration: [C-Bus Indigo Plugin](https://github.com/KieranBroadfoot/C-Bus.indigoPlugin)

## Contributing

If you have suggestions or improvements for DLT support, please open an issue or pull request on GitHub.

