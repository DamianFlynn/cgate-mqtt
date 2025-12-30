# DLT Examples

This directory contains example scripts and configurations demonstrating how to use the eDLT (Electronic Dynamic Labelling Technology) feature of the cgate-mqtt bridge.

## Files

### 1. `dlt-example.js`
Node.js example script demonstrating various DLT label operations.

**Features:**
- Setting static labels
- Updating labels with dynamic content
- Displaying time and date
- Clearing labels
- Real-time clock example

**Prerequisites:**
```bash
npm install mqtt
```

**Usage:**
```bash
# Edit the configuration section in the file first
node dlt-example.js
```

### 2. `dlt-example.py`
Python example script with the same features as the Node.js version.

**Prerequisites:**
```bash
pip install paho-mqtt
```

**Usage:**
```bash
# Edit the configuration section in the file first
python3 dlt-example.py
```

### 3. `home-assistant-dlt.yaml`
Comprehensive Home Assistant configuration examples including:
- MQTT sensors for monitoring DLT state
- Scripts for setting and clearing labels
- Automations for dynamic updates based on:
  - Temperature sensors
  - Motion detection
  - Light state changes
  - Energy monitoring
  - Weather updates
  - Security alerts
- Lovelace dashboard card configuration
- Node-RED flow example

**Usage:**
1. Copy relevant sections to your Home Assistant configuration
2. Update DLT addresses to match your setup
3. Adjust entity IDs to match your sensors and devices
4. Restart Home Assistant

## Quick Start

### Basic Label Setting

Using mosquitto_pub command line tool:

```bash
# Set line 1
mosquitto_pub -h localhost -t "cbus/dlt/254_56_10/1/set" -m "Living Room"

# Set line 2
mosquitto_pub -h localhost -t "cbus/dlt/254_56_10/2/set" -m "Main Lights"

# Clear line 1
mosquitto_pub -h localhost -t "cbus/dlt/254_56_10/1/set" -m ""
```

### Using curl with MQTT HTTP bridge (if available)

```bash
curl -X POST http://localhost:8080/api/mqtt/publish \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "cbus/dlt/254_56_10/1/set",
    "message": "Hello World"
  }'
```

## DLT Address Format

DLT addresses follow the format: `{network}_{application}_{group}`

Example: `254_56_10`
- Network: 254
- Application: 56 (lighting)
- Group: 10

## Common Use Cases

### 1. Room Labels
Display room names and current status:
```
Line 1: "Kitchen"
Line 2: "Status: Active"
Line 3: "Temp: 22°C"
Line 4: ""
```

### 2. Time Display
Show current time and date:
```
Line 1: "Tuesday"
Line 2: "30 Dec"
Line 3: "14:30"
Line 4: "2025"
```

### 3. Sensor Dashboard
Display multiple sensor readings:
```
Line 1: "Environment"
Line 2: "Temp: 22.5°C"
Line 3: "Humidity: 65%"
Line 4: "Light: 450 lux"
```

### 4. Status Indicators
Show system status:
```
Line 1: "System Status"
Line 2: "Power: OK"
Line 3: "Network: OK"
Line 4: "Alarm: Armed"
```

### 5. Welcome Messages
Display dynamic messages:
```
Line 1: "Welcome Home!"
Line 2: "John Smith"
Line 3: "17:45"
Line 4: ""
```

## Tips and Best Practices

1. **Character Limits**: Most DLT displays support 16-20 characters per line
2. **Line Count**: Typical DLT units have 4-8 lines depending on model
3. **Update Rate**: Use the bridge's message queuing to avoid overwhelming the C-Bus network
4. **Special Characters**: Test special characters (degree symbols, etc.) on your specific DLT model
5. **Persistence**: Labels persist until explicitly changed or unit is power cycled
6. **Time Sync**: Enable automatic time updates in settings.js for time/date displays

## Testing Your Setup

1. **Verify Bridge Connection**
   ```bash
   mosquitto_sub -h localhost -t "cbus/bridge/cbus2-mqtt/state"
   ```
   Should show: `online`

2. **Monitor DLT State Changes**
   ```bash
   mosquitto_sub -h localhost -t "cbus/dlt/#"
   ```

3. **Test Single Label**
   ```bash
   mosquitto_pub -h localhost -t "cbus/dlt/254_56_10/1/set" -m "Test"
   ```

## Troubleshooting

### Labels Not Appearing
- Verify DLT address is correct
- Check that `enableDltSupport` is true in settings.js
- Enable logging in settings.js and check for errors
- Verify your DLT unit supports dynamic labelling

### Incorrect Characters
- Some DLT models have limited character sets
- Test special characters individually
- Use ASCII characters when possible

### Slow Updates
- Check `messageinterval` setting in settings.js
- Reduce update frequency for real-time displays
- Monitor C-Bus network load

## Additional Resources

- [Main DLT Documentation](../DLT-SUPPORT.md)
- [C-Gate Server Documentation](https://updates.clipsal.com/ClipsalSoftwareDownload/DL/downloads/OpenCBus/OpenCBusProtocolDownloads.html)
- [MQTT Documentation](https://mqtt.org/)
- [Home Assistant MQTT Integration](https://www.home-assistant.io/integrations/mqtt/)

## Contributing

Have an interesting use case or example? Feel free to contribute by submitting a pull request!

