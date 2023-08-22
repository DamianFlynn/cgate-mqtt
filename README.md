
# C-Gate to MQTT Bridge for CBUS Integration

The C-Gate to MQTT Bridge project offers a powerful solution for seamlessly integrating Clipsal CBUS PLCs with MQTT-enabled IoT devices and services. This repository provides the necessary code and comprehensive instructions to deploy and configure the C-Gate to MQTT Bridge. The application goes beyond basic integration by incorporating MQTT Discovery for Home Assistant, enabling automatic device recognition and configuration.

The code is based on the original fork [the1laz](https://github.com/the1laz/cgateweb)
## Purpose

This project aims to establish a bridge between the Clipsal C-Gate Server and MQTT, unlocking the potential for real-time, bi-directional communication between CBUS PLCs and various IoT platforms. By supporting MQTT Discovery for Home Assistant, the project simplifies the process of integrating CBUS devices into Home Assistant's ecosystem, enhancing automation and control capabilities.

## Features

- **Seamless CBUS Integration:** The C-Gate to MQTT Bridge connects CBUS PLCs with MQTT brokers, facilitating real-time communication and control.
- **MQTT Discovery for Home Assistant:** The application supports MQTT Discovery, automatically configuring CBUS devices within Home Assistant as Dimmers, Switches, or Phantoms.
- **Trigger Application Support:** The project includes support for CBUS Trigger applications, enabling Home Assistant to identify and respond to triggered events.
- **Flexible Configuration:** Users can customize the application's settings to align with their specific CBUS setup and MQTT broker.


### CBUS Lighting and Trigger Applications

1. Configure CBUS Toolkit with MQTT Discovery information for lighting devices.
1. Run the C-Gate to MQTT Bridge, connecting it to your C-Gate Server and MQTT broker.
1. Home Assistant will automatically recognize lighting devices and configure them as Dimmers, Switches, or Phantoms.
1. When CBUS trigger applications are fired, Home Assistant will receive MQTT Events and can respond accordingly.
1. Use Home Assistant to control CBUS lighting devices.


## Usage

You can easily and quickly get your C-Bus connected to MQTT, by implementing the following stack.

* [ser2sock](https://github.com/DamianFlynn/ser2sock): Serial Port to TCP Socket proxy, Optional to implement, supports USB to Serial Adaptors
* [cgate-server](https://github.com/DamianFlynn/cgate-server): Clipsal C-Gate server, can be configured to connect directly to CNI or via `ser2sock`. Recommended as this allows for the C-Bus toolkit to be used remotely in parallel
* cgate-mqtt: Bridge C-Bus Applications to MQTT. MQTT can be integrated into many platforms including Home Assistant

The following `docker-compose.yaml` file will load and run the complete stack. You just need to configure each application as directed.

```yaml
version: '3.8'

x-disabled:

services:

  # CNI Serial port (RS232 to USB) to TCP 10001
  ser2sock:
    hostname: "ser2sock"
    image: ghcr.io/damianflynn/ser2sock:latest
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
    image: ghcr.io/damianflynn/cgate-server:latest
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
    image: ghcr.io/damianflynn/cgate-mqtt:latest
    container_name: cgate-mqtt
    restart: unless-stopped
    networks:
      - proxy
    depends_on:
      - cgate-server
    volumes:
      - /opt/appdata/cbus/settings.js:/usr/src/app/settings.js
      - /opt/appdata/cbus/tags/CBUS-PROJECT.xml:/usr/src/app/HOME.xml


networks:
  proxy:
    driver: bridge
    external: true
```


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

This is my current `settings.js` 

```js
//Ser2Sock IP Address
exports.cbusip = '172.100.10.100';

//cbus project name
exports.cbusname = "HOME";

//mqtt server ip:port (my Home Assistant MQTT Broker)
exports.mqtt = '172.100.10.110:1883';
exports.mqttusername = 'cbus';
exports.mqttpassword = 'Password!';

// Map the C-Bus project information to Home Assistant Discovery Messages
exports.enableHassDiscovery = true;

// These should not need to be changed
exports.getallonstart = true;
exports.getallnetapp = '254/56';
exports.getallperiod = 60*15;
exports.retainreads = true;
exports.messageinterval = 200;

//logging
exports.logging = false;
```

### C-Bus Project Configuration

The application supports parsing C-Bus project configuration from XML files. 
The C-Bus Project file (XML only currently) should be mapped to the container as follows

```yaml
    volumes:
      - /opt/appdata/cbus/tags/CBUS-PROJECT.xml:/usr/src/app/HOME.xml
```

In this case, my project file is stored on the disk as `/opt/appdata/cbus/tags/CBUS-PROJECT.xml` and is mapped into the container. You should edit this to match your own project file.
Note: The suffix  `:/usr/src/app/HOME.xml`  should not be changed currently for the application to correctly locate the project


## Building

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

#### Dependencies

The following Node.js packages are used in this project:

- `mqtt`: MQTT client library for Node.js.
- `net`: Provides networking functionality.
- `events`: Provides event handling capabilities.
- `xml2js`: XML to JavaScript object converter.
- `fs`: Provides file system-related functionality.
- `path`: Provides utilities for working with file and directory paths.


## Features

- [-] Connects to MQTT broker and C-Gate system.
- [-] Handles C-Bus commands and events.
- [-] Supports MQTT topics for lighting control and status.
- [-] Provides Home Assistant MQTT discovery for easy integration.
- [ ] HVAC, I haven't try it but have a look at this fork: https://github.com/mminehanNZ/cgateweb)

## MQTT Topics

The application uses MQTT topics for communication. The topics are structured as follows:

- `cbus/bridge/cbus2-mqtt/state`: Bridge online/offline status.
- `cbus/event/cbus2-mqtt/<unique_id>/state`: Trigger Events.
- `cbus/light/cbus2-mqtt/<unique_id>/state`: Light state (ON/OFF).
- `cbus/light/cbus2-mqtt/<unique_id>/set`: Set light state.
- `cbus/light/cbus2-mqtt/<unique_id>/brightness`: Light brightness (0-100).
- `cbus/light/cbus2-mqtt/<unique_id>/brightness/set`: Set Light brightness (0-100).
- `cbus/light/cbus2-mqtt/<unique_id>/attributes`: C-Bus attributes for the group in JSON package, can also be seen in Home Assistant
  `{"cbus_address":"254/56/3","unit_name":"DIM1A-01","unit_address":"0x3","unit_type":"Dimmer","unit_model":"L5508D1A","output_channel":"3"}`


## Troubleshooting

- If you encounter any issues, enable detail logging and refer to the console logs for more information.
- Check the configuration settings in `settings.js`.

## Conclusion

The C-Gate to MQTT Bridge project is a comprehensive solution for seamlessly integrating Clipsal CBUS PLCs with MQTT-enabled IoT devices and services. By facilitating real-time communication, MQTT Discovery, and support for trigger applications, this application enhances the automation and control capabilities of CBUS systems within the larger IoT ecosystem. Through this bridge, users can unlock new possibilities for managing their CBUS lighting and trigger applications.

## Contributions

Contributions to this project are welcome! If you have suggestions, bug reports, or feature requests, please open an issue or submit a pull request on GitHub.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.