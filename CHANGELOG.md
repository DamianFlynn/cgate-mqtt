# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **eDLT (Electronic Dynamic Labelling Technology) Support** (#12)
  - Set custom text labels on Clipsal Saturn eDLT wall switches via MQTT
  - Dynamic label updates in real-time using C-Bus `lighting label` command
  - Automatic hex encoding of label text for proper character support
  - Support for multiple lines/buttons per DLT switch
  - New MQTT topics: `cbus/dlt/{network}_{app}_{group}/{line}/set` and `cbus/dlt/{network}_{app}_{group}/{line}/state`
  - Automatic time/date synchronization for DLT units (configurable)
  - Template support framework for future dynamic content
  
- **Configuration Options** for eDLT
  - `enableDltSupport`: Enable/disable DLT functionality
  - `enableDltTemplating`: Enable template processing in labels  
  - `updateDltTimeOnStart`: Update DLT time/date on startup
  - `updateDltTimePeriod`: Periodic time/date update interval

- **Documentation**
  - Comprehensive DLT-SUPPORT.md guide
  - Example scripts in Node.js (examples/dlt-example.js)
  - Example scripts in Python (examples/dlt-example.py)
  - Home Assistant automation examples (examples/home-assistant-dlt.yaml)
  - Examples README with quick start guide
  - QUICK-REFERENCE.md with command examples

### Changed
- Enhanced MQTT message handling to route DLT label commands
- Version bumped to 0.4.0

### Technical Details
- Implements C-Bus `lighting label` command with hex-encoded text
- Command format: `lighting label <network>/56 1 <group> - <button> <hex-text>\r\n`
- Button indexing is 0-based for proper Saturn eDLT compatibility
- Message queueing maintains network stability
- Compatible with existing lighting and trigger functionality

## [0.3.1] - Previous Release

### Features
- C-Gate to MQTT bridge functionality
- Home Assistant MQTT Discovery support
- Lighting application support (Application 56)
- Trigger application support (Application 202)
- Auto-discovery of lighting devices from XML project file
- Support for dimmers and relays
- Automatic reconnection for MQTT and C-Gate connections

---

## Credits

- Base project: cgate-mqtt by Damian Flynn
- eDLT implementation reference: [C-Bus.indigoPlugin](https://github.com/KieranBroadfoot/C-Bus.indigoPlugin) by Kieran Broadfoot
- Issue reporter: [@tomtokic](https://github.com/tomtokic) - Thanks for reporting issue #12!

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

