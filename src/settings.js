
//cbus ip address
exports.cbusip = '172.16.1.128';


//cbus project name
exports.cbusname = "HOME";

//mqtt server ip:port
exports.mqtt = '172.16.1.70:1883';

exports.topicPrefix = "homeassistant"
exports.enableHassDiscovery = true;
//username and password (leave null for anonymous MQTT brokers; set in settings.production.js for auth)
exports.mqttusername = null;
exports.mqttpassword = null;

// net and app for automatically requesting values
exports.getallnetapp = '254/56';

// whether to request on start (requires getallnetapp set as well)
exports.getallonstart = true;

// how often to request after start (in seconds), (requires getallnetapp set as well)
exports.getallperiod = 60*60;

// Sets MQTT retain flag for values coming from cgate
exports.retainreads = true;

exports.messageinterval = 200;

//logging
exports.logging = false;

// eDLT (Dynamic Labelling Technology) Support
exports.enableDltSupport = true;
exports.enableDltTemplating = false;

// Update DLT time/date on startup and periodically
exports.updateDltTimeOnStart = true;
exports.updateDltTimePeriod = 60*60; // Update every hour (in seconds)