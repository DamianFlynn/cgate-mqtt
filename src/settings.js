
//cbus ip address
exports.cbusip = '172.16.1.128';


//cbus project name
exports.cbusname = "HOME";

//mqtt server ip:port
exports.mqtt = '172.16.1.70:1883';

exports.topicPrefix = "homeassistant"
exports.enableHassDiscovery = true;
//username and password (unncomment to use)
exports.mqttusername = 'hass';
exports.mqttpassword = 'Prax1an!';

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