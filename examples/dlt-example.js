#!/usr/bin/env node

/**
 * DLT Label Example Script
 * 
 * This example demonstrates how to use the eDLT (Dynamic Labelling Technology)
 * feature to update labels on C-Bus DLT wall switches via MQTT.
 * 
 * Prerequisites:
 * - cgate-mqtt bridge running and connected
 * - MQTT broker accessible
 * - DLT units configured in your C-Bus system
 * 
 * Usage:
 *   node dlt-example.js
 */

const mqtt = require('mqtt');

// Configuration
const MQTT_BROKER = 'mqtt://localhost:1883';
const MQTT_USERNAME = 'your_username'; // Optional
const MQTT_PASSWORD = 'your_password'; // Optional

// DLT unit address (format: network_application_group)
// Example: 254_56_10 means network 254, application 56 (lighting), group 10
const DLT_ADDRESS = '254_56_10';

// Connect to MQTT broker
const client = mqtt.connect(MQTT_BROKER, {
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD
});

client.on('connect', () => {
  console.log('Connected to MQTT broker');
  
  // Subscribe to DLT state topics to monitor changes
  client.subscribe(`cbus/dlt/${DLT_ADDRESS}/+/state`, (err) => {
    if (err) {
      console.error('Failed to subscribe:', err);
      return;
    }
    console.log(`Subscribed to DLT state updates for ${DLT_ADDRESS}`);
  });
  
  // Example 1: Set static labels
  console.log('\n=== Example 1: Setting static labels ===');
  setStaticLabels();
  
  // Example 2: Update labels with dynamic content
  setTimeout(() => {
    console.log('\n=== Example 2: Updating with dynamic content ===');
    updateDynamicLabels();
  }, 2000);
  
  // Example 3: Display time
  setTimeout(() => {
    console.log('\n=== Example 3: Displaying current time ===');
    displayTime();
  }, 4000);
  
  // Example 4: Clear all labels
  setTimeout(() => {
    console.log('\n=== Example 4: Clearing all labels ===');
    clearLabels();
    
    // Disconnect after completing examples
    setTimeout(() => {
      console.log('\nAll examples completed. Disconnecting...');
      client.end();
      process.exit(0);
    }, 2000);
  }, 6000);
});

client.on('message', (topic, message) => {
  console.log(`Label updated: ${topic} = "${message.toString()}"`);
});

client.on('error', (error) => {
  console.error('MQTT Error:', error);
});

/**
 * Example 1: Set static labels on multiple lines
 */
function setStaticLabels() {
  const labels = {
    1: 'Living Room',
    2: 'Main Lights',
    3: 'Status: OK',
    4: '------------'
  };
  
  Object.entries(labels).forEach(([line, text]) => {
    const topic = `cbus/dlt/${DLT_ADDRESS}/${line}/set`;
    console.log(`Setting line ${line}: "${text}"`);
    client.publish(topic, text);
  });
}

/**
 * Example 2: Update labels with dynamic content
 */
function updateDynamicLabels() {
  // Simulate sensor data
  const temperature = 22.5;
  const humidity = 65;
  const motion = 'Detected';
  
  const labels = {
    1: 'Environment',
    2: `Temp: ${temperature}°C`,
    3: `Humidity: ${humidity}%`,
    4: `Motion: ${motion}`
  };
  
  Object.entries(labels).forEach(([line, text]) => {
    const topic = `cbus/dlt/${DLT_ADDRESS}/${line}/set`;
    console.log(`Updating line ${line}: "${text}"`);
    client.publish(topic, text);
  });
}

/**
 * Example 3: Display current time and date
 */
function displayTime() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-AU', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  const dateStr = now.toLocaleDateString('en-AU', { 
    day: '2-digit', 
    month: 'short' 
  });
  const dayStr = now.toLocaleDateString('en-AU', { 
    weekday: 'long' 
  });
  
  const labels = {
    1: dayStr,
    2: dateStr,
    3: timeStr,
    4: ''
  };
  
  Object.entries(labels).forEach(([line, text]) => {
    const topic = `cbus/dlt/${DLT_ADDRESS}/${line}/set`;
    console.log(`Setting line ${line}: "${text}"`);
    client.publish(topic, text);
  });
}

/**
 * Example 4: Clear all labels (set to empty string)
 */
function clearLabels() {
  // Clear lines 1-4 (adjust based on your DLT model)
  for (let line = 1; line <= 4; line++) {
    const topic = `cbus/dlt/${DLT_ADDRESS}/${line}/set`;
    console.log(`Clearing line ${line}`);
    client.publish(topic, '');
  }
}

/**
 * Advanced: Create a real-time clock display
 * This function updates the DLT display every second with the current time
 */
function startRealtimeClock() {
  console.log('\n=== Starting real-time clock ===');
  
  const updateClock = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-AU', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
    
    client.publish(`cbus/dlt/${DLT_ADDRESS}/1/set`, 'Current Time');
    client.publish(`cbus/dlt/${DLT_ADDRESS}/2/set`, timeStr);
  };
  
  // Update immediately, then every second
  updateClock();
  const clockInterval = setInterval(updateClock, 1000);
  
  // Stop after 10 seconds
  setTimeout(() => {
    clearInterval(clockInterval);
    console.log('Real-time clock stopped');
  }, 10000);
}

// Uncomment to test the real-time clock feature
// setTimeout(startRealtimeClock, 8000);

