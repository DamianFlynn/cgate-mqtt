# Pull Request: Add eDLT (Electronic Dynamic Labelling) Support

## Description

This PR implements support for **Clipsal C-Bus eDLT (electronic Dynamic Labelling Technology)** in response to issue #12.

eDLT allows real-time updates of text labels on compatible C-Bus wall switches (such as Saturn eDLT switches) via MQTT, enabling dynamic display of information like room names, music sources, temperature readings, and more.

## Fixes

Closes #12

## Changes

### Core Functionality

1. **DLT Label Updates via MQTT**
   - New MQTT topics: `cbus/dlt/{network}_{app}_{group}/{line}/set` and `.../state`
   - Real-time label updates on physical DLT switches
   - Support for multiple lines/buttons per switch
   - Proper hex-encoding of text for C-Bus protocol compliance

2. **Automatic Time/Date Synchronization**
   - Optional automatic time/date updates for DLT units
   - Configurable update intervals
   - Keeps DLT displays synchronized with system time

3. **Configuration Options** (added to `settings.js`)
   ```javascript
   exports.enableDltSupport = true;          // Enable/disable DLT
   exports.enableDltTemplating = false;      // Template support framework
   exports.updateDltTimeOnStart = true;      // Update time on startup
   exports.updateDltTimePeriod = 60*60;      // Update interval (seconds)
   ```

### Technical Implementation

- **Command Format**: Implements C-Bus `lighting label` command with hex-encoded text
  ```
  lighting label <network>/56 1 <group> - <button> <hex-text>\r\n
  ```
- **Protocol Compliance**: 
  - Text is UTF-8 to hex encoded before sending
  - Button indexing is 0-based (MQTT line 1 = button 0)
  - Uses application 56 (lighting) for Saturn eDLT compatibility
- **Message Queueing**: Maintains network stability with existing message handling
- **Non-Breaking**: All changes are additive and backwards compatible

### Files Modified

- `src/index.js`: Added DLT message handling, label setting, and time synchronization functions
- `src/settings.js`: Added DLT configuration options with sensible defaults
- `src/package.json`: Version bump to 0.4.0
- `README.md`: Added eDLT documentation and usage examples
- `CHANGELOG.md`: Documented new features

### Files Added

- `DLT-SUPPORT.md`: Comprehensive user guide for eDLT features
- `QUICK-REFERENCE.md`: Quick command reference
- `examples/dlt-example.js`: Node.js example
- `examples/dlt-example.py`: Python example
- `examples/home-assistant-dlt.yaml`: Home Assistant automation examples
- `examples/README.md`: Documentation for examples

## Testing

Tested with:
- **Hardware**: Clipsal Saturn 5085EDLW-PW eDLT switch
- **C-Gate**: Version 3.2.3 (build 1760)
- **Scenarios**:
  - Single line label updates ✅
  - Multiple lines on same switch ✅
  - Rapid label changes ✅
  - Special characters and spaces ✅
  - Empty labels ✅
  - Long text (truncation handled by switch) ✅

## Usage Example

### MQTT Command Line
```bash
mosquitto_pub -h mqtt.example.com -u user -P password \
  -t "cbus/dlt/254_56_129/1/set" \
  -m "Kitchen"
```

### Home Assistant
```yaml
automation:
  - alias: "Update Music Display"
    trigger:
      - platform: state
        entity_id: media_player.garage
    action:
      - service: mqtt.publish
        data:
          topic: "cbus/dlt/254_56_129/1/set"
          payload: "{{ states('media_player.garage') }}"
```

### Node.js
```javascript
const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://broker:1883');

client.on('connect', () => {
  client.publish('cbus/dlt/254_56_129/1/set', 'Living Room');
});
```

## Documentation

- Full user guide in `DLT-SUPPORT.md` with:
  - Feature overview
  - Setup instructions
  - MQTT topic format
  - Configuration options
  - Troubleshooting guide
- Working examples in `examples/` directory
- Updated main README with DLT section

## Breaking Changes

None. All changes are backwards compatible. Existing functionality is unaffected.

## Checklist

- [x] Code follows project style guidelines
- [x] All console.log statements respect the `logging` flag
- [x] Changes are backwards compatible
- [x] Documentation has been updated
- [x] Examples have been provided
- [x] Testing has been performed on real hardware
- [x] CHANGELOG has been updated
- [x] Version has been bumped appropriately

## Additional Notes

This implementation is based on the reference implementation in [KieranBroadfoot/C-Bus.indigoPlugin](https://github.com/KieranBroadfoot/C-Bus.indigoPlugin) (as suggested by @tomtokic in issue #12) but has been adapted for Node.js and the cgate-mqtt architecture.

The key discovery was that Saturn eDLT switches require:
1. The `lighting label` command (not the generic `label` command)
2. Hex-encoded text for proper character handling
3. 0-based button indexing
4. Specific address format: `network/56 1 group - button`

Special thanks to @tomtokic for reporting this issue and providing the reference implementation!

## Screenshots/Logs

Example log output showing successful label update:
```
Setting DLT label: 254/56/129 button 0 to "Kitchen"
Command data: 200 OK.
Event data: lighting label //PROJECT/254/56  1 129 - F0 0 4b69746368656e
```

## Future Enhancements

Potential future additions (not in this PR):
- DLT button press event handling
- Advanced template engine with MQTT topic substitution
- DLT backlight control
- Label presets and scenes
- Multi-line atomic updates

---

This PR represents a significant enhancement to cgate-mqtt, adding long-requested eDLT functionality while maintaining full backwards compatibility with existing installations.

