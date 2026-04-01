// Production settings for cgate-mqtt with eDLT support
// Copy this file to src/settings.js and update with your configuration

// C-Gate server IP address
exports.cbusip = 'CGATE_IP_HERE';  // e.g., '10.100.100.88' or your C-Gate server IP

// C-Bus project name
exports.cbusname = "HOME";  // Update to match your C-Bus project name

// MQTT broker (running on 10.100.100.83)
exports.mqtt = '10.100.100.83:1883';

// MQTT credentials
exports.mqttusername = 'MQTT_USERNAME_HERE';
exports.mqttpassword = 'MQTT_PASSWORD_HERE';

// Home Assistant MQTT Discovery
exports.topicPrefix = "homeassistant";
exports.enableHassDiscovery = true;

// Automatically request values from C-Bus
exports.getallnetapp = '254/56';  // Network 254, Application 56 (lighting)

// Request all values on startup
exports.getallonstart = true;

// Request all values periodically (every 15 minutes)
exports.getallperiod = 60*15;

// Retain MQTT messages for read requests
exports.retainreads = true;

// Message interval (milliseconds between commands)
exports.messageinterval = 200;

// eDLT (Dynamic Labelling Technology) Support
exports.enableDltSupport = true;
exports.enableDltTemplating = false;

// Update DLT time/date on startup and periodically
exports.updateDltTimeOnStart = true;
exports.updateDltTimePeriod = 60*60; // Update every hour (in seconds)

// Enable detailed logging (set to false for production)
exports.logging = false;

