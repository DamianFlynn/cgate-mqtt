
//cbus ip address
exports.cbusip = '127.0.0.1';


//cbus project name
exports.cbusname = "HOME";

//mqtt server ip:port
exports.mqtt = '127.0.0.1:1883';

exports.topicPrefix = "homeassistant"
exports.enableHassDiscovery = true;
//username and password (unncomment to use)
exports.mqttusername = 'cbus';
exports.mqttpassword = 'P@ssw0rd!';

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