#!/usr/bin/env python3
"""
DLT Label Example Script (Python)

This example demonstrates how to use the eDLT (Dynamic Labelling Technology)
feature to update labels on C-Bus DLT wall switches via MQTT using Python.

Prerequisites:
- cgate-mqtt bridge running and connected
- MQTT broker accessible
- DLT units configured in your C-Bus system
- paho-mqtt library installed: pip install paho-mqtt

Usage:
    python3 dlt-example.py
"""

import time
from datetime import datetime
import paho.mqtt.client as mqtt

# Configuration
MQTT_BROKER = 'localhost'
MQTT_PORT = 1883
MQTT_USERNAME = 'your_username'  # Optional
MQTT_PASSWORD = 'your_password'  # Optional

# DLT unit address (format: network_application_group)
# Example: 254_56_10 means network 254, application 56 (lighting), group 10
DLT_ADDRESS = '254_56_10'


class DLTController:
    """Helper class to control DLT labels"""
    
    def __init__(self, client, dlt_address):
        self.client = client
        self.dlt_address = dlt_address
    
    def set_label(self, line, text):
        """Set a label on a specific line"""
        topic = f'cbus/dlt/{self.dlt_address}/{line}/set'
        print(f'Setting line {line}: "{text}"')
        self.client.publish(topic, text)
    
    def set_labels(self, labels):
        """Set multiple labels at once"""
        for line, text in labels.items():
            self.set_label(line, text)
    
    def clear_line(self, line):
        """Clear a specific line"""
        self.set_label(line, '')
    
    def clear_all(self, max_lines=8):
        """Clear all lines"""
        for line in range(1, max_lines + 1):
            self.clear_line(line)


def on_connect(client, userdata, flags, rc):
    """Callback when connected to MQTT broker"""
    if rc == 0:
        print('Connected to MQTT broker')
        
        # Subscribe to DLT state topics
        client.subscribe(f'cbus/dlt/{DLT_ADDRESS}/+/state')
        print(f'Subscribed to DLT state updates for {DLT_ADDRESS}')
        
        # Create DLT controller
        dlt = DLTController(client, DLT_ADDRESS)
        
        # Run examples
        run_examples(dlt)
    else:
        print(f'Connection failed with code {rc}')


def on_message(client, userdata, msg):
    """Callback when a message is received"""
    print(f'Label updated: {msg.topic} = "{msg.payload.decode()}"')


def run_examples(dlt):
    """Run all DLT examples"""
    
    # Example 1: Set static labels
    print('\n=== Example 1: Setting static labels ===')
    example_static_labels(dlt)
    time.sleep(2)
    
    # Example 2: Dynamic content
    print('\n=== Example 2: Updating with dynamic content ===')
    example_dynamic_labels(dlt)
    time.sleep(2)
    
    # Example 3: Display time
    print('\n=== Example 3: Displaying current time ===')
    example_display_time(dlt)
    time.sleep(2)
    
    # Example 4: Sensor data
    print('\n=== Example 4: Displaying sensor data ===')
    example_sensor_data(dlt)
    time.sleep(2)
    
    # Example 5: Clear labels
    print('\n=== Example 5: Clearing all labels ===')
    dlt.clear_all(4)
    
    print('\nAll examples completed. Disconnecting...')
    time.sleep(1)
    client.disconnect()


def example_static_labels(dlt):
    """Example 1: Set static labels on multiple lines"""
    labels = {
        1: 'Living Room',
        2: 'Main Lights',
        3: 'Status: OK',
        4: '------------'
    }
    dlt.set_labels(labels)


def example_dynamic_labels(dlt):
    """Example 2: Update labels with dynamic content"""
    # Simulate sensor data
    temperature = 22.5
    humidity = 65
    motion = 'Detected'
    
    labels = {
        1: 'Environment',
        2: f'Temp: {temperature}°C',
        3: f'Humidity: {humidity}%',
        4: f'Motion: {motion}'
    }
    dlt.set_labels(labels)


def example_display_time(dlt):
    """Example 3: Display current time and date"""
    now = datetime.now()
    
    labels = {
        1: now.strftime('%A'),      # Day name
        2: now.strftime('%d %b'),   # Date
        3: now.strftime('%H:%M'),   # Time
        4: ''
    }
    dlt.set_labels(labels)


def example_sensor_data(dlt):
    """Example 4: Display sensor data with progress bar"""
    # Simulate a sensor reading with a simple progress bar
    sensor_value = 75  # Percentage
    bar_length = 10
    filled = int(bar_length * sensor_value / 100)
    bar = '█' * filled + '░' * (bar_length - filled)
    
    labels = {
        1: 'Power Usage',
        2: f'{sensor_value}%',
        3: bar,
        4: f'{sensor_value * 24 / 100:.1f}kWh/day'
    }
    dlt.set_labels(labels)


def example_realtime_clock(dlt):
    """Advanced: Create a real-time clock display"""
    print('\n=== Starting real-time clock (10 seconds) ===')
    
    start_time = time.time()
    while time.time() - start_time < 10:
        now = datetime.now()
        dlt.set_labels({
            1: 'Current Time',
            2: now.strftime('%H:%M:%S'),
            3: now.strftime('%d %B'),
            4: now.strftime('%Y')
        })
        time.sleep(1)
    
    print('Real-time clock stopped')


if __name__ == '__main__':
    # Create MQTT client
    client = mqtt.Client()
    client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
    client.on_connect = on_connect
    client.on_message = on_message
    
    try:
        # Connect to broker
        print(f'Connecting to MQTT broker at {MQTT_BROKER}:{MQTT_PORT}...')
        client.connect(MQTT_BROKER, MQTT_PORT, 60)
        
        # Start the loop
        client.loop_forever()
    
    except KeyboardInterrupt:
        print('\nInterrupted by user')
        client.disconnect()
    
    except Exception as e:
        print(f'Error: {e}')

