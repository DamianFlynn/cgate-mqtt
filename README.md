

# C-Bus to MQTT Bridge

The C-Bus to MQTT Bridge is a Node.js application that allows you to bridge C-Bus lighting control data to MQTT messages. This enables seamless integration of C-Bus lighting control with home automation systems that support MQTT communication.

Based on the original fork [the1laz](https://github.com/the1laz/cgateweb)

## Installation

1. Clone this repository to your local machine.
2. Navigate to the project directory.

### Docker

The included `Dockerfile` can be used to create a container for the project

```bash
docker build -t cgate-mqtt:latest .
```

```bash
docker create \
    --name cgate-mqtt \
    -v path/to/settings.js:/usr/src/settings.js \
    --restart unless-stopped \
    cgate-mqtt:latest
```

### Docker Compose
```yaml
---
version: '3.8'

x-disabled:

services:

  # CNI Serial port (RS232 to USB) to TCP 10001
  ser2sock:
    hostname: "ser2sock"
    image: ser2sock:latest
    container_name: ser2sock
    restart: unless-stopped
    networks:
      - proxy
    ports:
        - 10001:10001
    environment:
      - "SERIAL_DEVICE=/dev/ttyUSB0"
    volumes:
      - /dev/ttyUSB0:/dev/ttyUSB0
    devices:
      - /dev/serial/by-id/usb-Prolific_Technology_Inc._USB-Serial_Controller_D-if00-port0:/dev/ttyUSB0
    privileged: true

  # Clipsal C-Bus C-Gate Server
  cgate-server:
    hostname: "cgate-server"
    image: cgate-server:latest
    container_name: cgate-server
    depends_on:
      - ser2sock
    networks:
      - proxy
    ports:
        - 20023:20023
        - 20024:20024
        - 20025:20025
        - 20026:20026
        - 20123:20123
    volumes:
        - /opt/appdata/cbus/config:/config
        - /opt/appdata/cbus/tags:/tag
        - /opt/appdata/cbus/logs:/logs
    restart: unless-stopped

  # C-Gate to MQTT Bridge
  cgate-mqtt:
    hostname: "cgate-mqtt"
    image: cgate-mqtt:latest
    container_name: cgate-mqtt
    restart: unless-stopped
    networks:
      - proxy
    depends_on:
      - cgate-server
    volumes:
      - /opt/appdata/cbus/settings.js:/usr/src/app/settings.js


networks:
  proxy:
    driver: bridge
    external: true
```

### Local Installation

Install the required Node.js packages using the following command:

```bash
npm install
```

Configure the settings in the `settings.js` file to match your environment.
Run the application using the following command:

```bash
node <path-to-your-app>/app.js
```

## Dependencies

The following Node.js packages are used in this project:

- `mqtt`: MQTT client library for Node.js.
- `net`: Provides networking functionality.
- `events`: Provides event handling capabilities.
- `xml2js`: XML to JavaScript object converter.
- `fs`: Provides file system-related functionality.
- `path`: Provides utilities for working with file and directory paths.

## Configuration

Modify the `settings.js` file to configure the following options:

- `mqtt`: MQTT broker connection settings.
- `cbusip`: IP address of the C-Bus system.
- `cgateCmdPort`: Port for C-Gate command channel.
- `cgateEventPort`: Port for C-Gate event channel.
- `logging`: Enable/disable console logging.
- `messageinterval`: Interval for processing MQTT messages.
- `enableHassDiscovery`: Enable Home Assistant MQTT discovery.
- `topicPrefix`: MQTT topic prefix.
- `retainreads`: Retain MQTT messages for read requests.
- `getallnetapp`: Network application for getting all values.
- `getallonstart`: Get all values on startup.
- `getallperiod`: Period for getting all values.

## Features

- [-] Connects to MQTT broker and C-Gate system.
- [-] Handles C-Bus commands and events.
- [-] Supports MQTT topics for lighting control and status.
- [-] Provides Home Assistant MQTT discovery for easy integration.
- [ ] HVAC, I haven't try it but have a look at this fork: https://github.com/mminehanNZ/cgateweb)

## MQTT Topics

The application uses MQTT topics for communication. The topics are structured as follows:

- `cbus/bridge/cbus2-mqtt/state`: Bridge online/offline status.
- `cbus/light/cbus2-mqtt/<unique_id>/state`: Light state (ON/OFF).
- `cbus/light/cbus2-mqtt/<unique_id>/brightness`: Light brightness (0-100).
- `cbus/light/cbus2-mqtt/<unique_id>/set`: Set light state or brightness.
- `cbus/sensor/cbus2-mqtt/<unique_id>/state`: Sensor state (hold event).

## C-Bus Project Configuration

The application supports parsing C-Bus project configuration from XML files. Use the `readXmlFile` function in `app.js` to read the project configuration. Configure the `HOME.xml` file path in the `readXmlFile` function.

## Troubleshooting

- If you encounter any issues, refer to the console logs for more information.
- Check the configuration settings in `settings.js`.

## Contributions

Contributions to this project are welcome! If you have suggestions, bug reports, or feature requests, please open an issue or submit a pull request on GitHub.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.