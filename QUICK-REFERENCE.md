# eDLT Quick Reference Card

Quick reference for using eDLT (Electronic Dynamic Labelling Technology) with cgate-mqtt.

## MQTT Topics

### Set a Label
```
Topic:   cbus/dlt/{network}_{app}_{group}/{line}/set
Payload: Your text here
Example: cbus/dlt/254_56_10/1/set
         "Living Room"
```

### Monitor Label State
```
Topic:   cbus/dlt/{network}_{app}_{group}/{line}/state
Example: cbus/dlt/254_56_10/1/state
```

## Command Line Examples

### Using mosquitto_pub
```bash
# Set label on line 1
mosquitto_pub -h localhost -t "cbus/dlt/254_56_10/1/set" -m "Kitchen"

# Set label on line 2
mosquitto_pub -h localhost -t "cbus/dlt/254_56_10/2/set" -m "Temp: 22°C"

# Clear label on line 1
mosquitto_pub -h localhost -t "cbus/dlt/254_56_10/1/set" -m ""

# Monitor all DLT changes
mosquitto_sub -h localhost -t "cbus/dlt/#"
```

### Using Node.js
```javascript
const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://localhost:1883');

client.on('connect', () => {
  // Set a label
  client.publish('cbus/dlt/254_56_10/1/set', 'Hello World');
  
  // Monitor changes
  client.subscribe('cbus/dlt/254_56_10/+/state');
});
```

### Using Python
```python
import paho.mqtt.client as mqtt

client = mqtt.Client()
client.connect('localhost', 1883, 60)

# Set a label
client.publish('cbus/dlt/254_56_10/1/set', 'Hello World')

# Monitor changes
client.subscribe('cbus/dlt/254_56_10/+/state')
client.loop_forever()
```

## Configuration (settings.js)

```javascript
// Enable DLT support
exports.enableDltSupport = true;

// Enable template processing (future feature)
exports.enableDltTemplating = false;

// Update time/date on startup
exports.updateDltTimeOnStart = true;

// Update time/date every hour
exports.updateDltTimePeriod = 60*60;
```

## Address Format

```
Format: {network}_{application}_{group}

Example: 254_56_10
  Network:     254
  Application: 56 (lighting)
  Group:       10 (DLT unit address)
```

## Common Patterns

### Room Label with Status
```
Line 1: "Living Room"
Line 2: "Main Lights"
Line 3: "Status: ON"
Line 4: ""
```

### Time Display
```javascript
const now = new Date();
client.publish('cbus/dlt/254_56_10/1/set', now.toLocaleString('en-AU', { weekday: 'long' }));
client.publish('cbus/dlt/254_56_10/2/set', now.toLocaleString('en-AU', { day: '2-digit', month: 'short' }));
client.publish('cbus/dlt/254_56_10/3/set', now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }));
```

### Sensor Dashboard
```bash
mosquitto_pub -t "cbus/dlt/254_56_10/1/set" -m "Environment"
mosquitto_pub -t "cbus/dlt/254_56_10/2/set" -m "Temp: 22.5°C"
mosquitto_pub -t "cbus/dlt/254_56_10/3/set" -m "Humidity: 65%"
mosquitto_pub -t "cbus/dlt/254_56_10/4/set" -m "Light: 450lux"
```

## Home Assistant

### Script
```yaml
script:
  set_kitchen_label:
    sequence:
      - service: mqtt.publish
        data:
          topic: "cbus/dlt/254_56_10/1/set"
          payload: "{{ states('sensor.kitchen_temp') }}°C"
```

### Automation
```yaml
automation:
  - alias: "Update DLT Temperature"
    trigger:
      - platform: state
        entity_id: sensor.kitchen_temperature
    action:
      - service: mqtt.publish
        data:
          topic: "cbus/dlt/254_56_10/2/set"
          payload: "Temp: {{ trigger.to_state.state }}°C"
```

## Limitations

| Item              | Typical Value    | Notes                          |
|-------------------|------------------|--------------------------------|
| Lines per DLT     | 4-8              | Depends on model               |
| Characters/line   | 16-20            | Depends on model               |
| Update rate       | 200ms interval   | Set by messageinterval         |
| Character set     | ASCII + extended | Test special chars on device   |

## Troubleshooting

### Problem: Labels not updating
```bash
# 1. Check bridge status
mosquitto_sub -t "cbus/bridge/cbus2-mqtt/state"
# Should show: online

# 2. Enable logging in settings.js
exports.logging = true;

# 3. Verify DLT address
# Check your C-Bus Toolkit project for correct addressing
```

### Problem: Characters display incorrectly
```
Solution: Use standard ASCII characters
Avoid: Extended Unicode, emojis
Test: Special characters individually on your specific DLT model
```

### Problem: DLT not discovered
```
1. Check C-Bus project XML file is mounted correctly
2. Verify DLT catalog number starts with L51, contains DLT, or contains DLP
3. Enable logging to see discovered units
```

## C-Gate Commands (FYI)

The bridge automatically sends these commands to C-Gate:

```
# Set label (hex-encoded text, 0-based button index)
lighting label 254/56 1 10 - 0 4b69746368656e204c6967687473

# Update time/date
time //HOME/254/56/10
```

## Links

- [Full Documentation](DLT-SUPPORT.md)
- [Examples](examples/)
- [Main README](README.md)
- [Changelog](CHANGELOG.md)

---

**Quick Start**: Set your first label!

```bash
mosquitto_pub -h localhost \
  -t "cbus/dlt/254_56_10/1/set" \
  -m "Hello DLT!"
```

