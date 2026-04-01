# Deployment Guide for cgate-mqtt with eDLT Support

This guide will help you deploy the cgate-mqtt bridge as a Docker container with the new eDLT functionality.

## Prerequisites

- Docker installed
- Docker Compose installed
- Access to C-Gate server
- Access to MQTT broker
- C-Bus project XML file

## Network Configuration

Based on your setup:
- **Container Host**: 10.100.100.88 (where cgate-mqtt will run)
- **MQTT Broker**: 10.100.100.83:1883
- **C-Gate Server**: (Please specify - may be same as container host)

## Quick Start

### 1. Configure Settings

Edit `src/settings.js` with your configuration:

```bash
# If src/settings.js doesn't exist, copy from template
cp settings.production.js src/settings.js

# Edit with your credentials
nano src/settings.js  # or your preferred editor
```

**Required settings:**
```javascript
exports.cbusip = 'YOUR_CGATE_IP';           // C-Gate server IP
exports.cbusname = "HOME";                  // Your C-Bus project name
exports.mqtt = '10.100.100.83:1883';        // MQTT broker
exports.mqttusername = 'YOUR_MQTT_USER';    // MQTT username
exports.mqttpassword = 'YOUR_MQTT_PASS';    // MQTT password
```

### 2. Add C-Bus Project File

Place your C-Bus project XML file:

```bash
cp /path/to/your/project.xml src/HOME.xml
```

This is needed for:
- Lighting device discovery
- Trigger application discovery
- **DLT unit auto-discovery** (new!)

### 3. Deploy

Use the deployment script:

```bash
# Build and deploy in one command
./deploy.sh deploy

# Or step by step:
./deploy.sh build    # Build Docker image
./deploy.sh start    # Start container
./deploy.sh status   # Check status
./deploy.sh logs     # View logs
```

## Deployment Script Commands

```bash
./deploy.sh build     # Build Docker image
./deploy.sh start     # Start the container
./deploy.sh stop      # Stop the container
./deploy.sh restart   # Restart the container
./deploy.sh logs      # Show live logs (Ctrl+C to exit)
./deploy.sh status    # Show container status
./deploy.sh test      # Test connections to MQTT and C-Gate
./deploy.sh help      # Show help
```

## Manual Deployment (Alternative)

If you prefer to use docker-compose directly:

```bash
# Build
docker-compose build

# Start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down

# Restart
docker-compose restart
```

## Verifying Deployment

### 1. Check Container Status

```bash
./deploy.sh status
```

You should see:
- Status: RUNNING
- Container uptime
- Recent log entries showing:
  - "CONNECTED TO MQTT"
  - "CONNECTED TO C-GATE COMMAND PORT"
  - "CONNECTED TO C-GATE EVENT PORT"
  - "ALL CONNECTED"
  - Discovered lighting devices
  - Discovered DLT units (if any)

### 2. Test MQTT Connection

```bash
# On any machine with mosquitto-clients installed
mosquitto_sub -h 10.100.100.83 -t "cbus/bridge/cbus2-mqtt/state"
```

Should output: `online`

### 3. Test DLT Functionality

```bash
# Set a DLT label (replace address with your DLT unit)
mosquitto_pub -h 10.100.100.83 \
  -t "cbus/dlt/254_56_10/1/set" \
  -m "Hello from eDLT!"

# Monitor DLT state changes
mosquitto_sub -h 10.100.100.83 -t "cbus/dlt/#" -v
```

## Network Mode

The docker-compose.yml uses `network_mode: host` which means:
- Container uses host network directly
- No port mapping needed
- Container can access services on host network

If you need to use bridge networking instead:

```yaml
# docker-compose.yml
services:
  cgate-mqtt:
    # Remove: network_mode: host
    # Add:
    ports:
      - "8080:8080"  # If needed for future web interface
    networks:
      - cbus-network

networks:
  cbus-network:
    driver: bridge
```

## Troubleshooting

### Container Won't Start

```bash
# Check configuration
./deploy.sh status

# View detailed logs
docker-compose logs --tail=100

# Check if ports are already in use
netstat -tulpn | grep -E '(1883|20023|20025)'
```

### Cannot Connect to MQTT

```bash
# Test MQTT connection from host
./deploy.sh test

# Or manually:
telnet 10.100.100.83 1883

# Check MQTT credentials in src/settings.js
grep -E "mqtt|username|password" src/settings.js
```

### Cannot Connect to C-Gate

```bash
# Test C-Gate connection
telnet YOUR_CGATE_IP 20023

# Check C-Gate is running
ssh user@YOUR_CGATE_IP
systemctl status cgate  # or ps aux | grep cgate
```

### DLT Units Not Discovered

```bash
# Check if HOME.xml is present
ls -lh src/HOME.xml

# Check logs for DLT discovery messages
docker-compose logs | grep -i dlt

# Enable detailed logging in src/settings.js
exports.logging = true;

# Restart container
./deploy.sh restart
```

### View Live Logs

```bash
./deploy.sh logs
# Press Ctrl+C to exit
```

## Remote Deployment

To deploy on the remote server (10.100.100.88):

### Option 1: SSH and Deploy

```bash
# Copy files to server
scp -r cgate-mqtt/ user@10.100.100.88:/opt/

# SSH to server
ssh user@10.100.100.88

# Navigate and deploy
cd /opt/cgate-mqtt
./deploy.sh deploy
```

### Option 2: Use Docker Context (Advanced)

```bash
# Create Docker context for remote server
docker context create remote-cbus \
  --docker "host=ssh://user@10.100.100.88"

# Use remote context
docker context use remote-cbus

# Deploy (runs on remote server)
./deploy.sh deploy

# Switch back to local
docker context use default
```

## Updating

To update the container with new code:

```bash
# Pull latest code (if using git)
git pull

# Rebuild and restart
./deploy.sh stop
./deploy.sh build
./deploy.sh start
```

## Production Considerations

### 1. Logging

The docker-compose.yml includes log rotation:
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

Logs are limited to 3 files of 10MB each (30MB total).

### 2. Auto-Start on Boot

The `restart: unless-stopped` policy ensures the container starts on boot.

### 3. Monitoring

Consider adding monitoring:
```bash
# Check container health
docker inspect cgate-mqtt | grep -A 5 Health

# Set up alerting for container down
# (use your monitoring system)
```

### 4. Backups

Back up these files regularly:
- `src/settings.js` (configuration)
- `src/HOME.xml` (C-Bus project)

```bash
# Backup script example
tar -czf cgate-mqtt-backup-$(date +%Y%m%d).tar.gz \
  src/settings.js src/HOME.xml
```

## Environment Variables (Alternative Configuration)

You can also use environment variables instead of editing settings.js:

```yaml
# docker-compose.yml
environment:
  - CBUS_IP=10.100.100.88
  - CBUS_NAME=HOME
  - MQTT_HOST=10.100.100.83
  - MQTT_PORT=1883
  - MQTT_USERNAME=your_user
  - MQTT_PASSWORD=your_pass
```

Then modify `src/index.js` to read from `process.env`.

## Security Notes

1. **Protect settings.js** - Contains credentials
   ```bash
   chmod 600 src/settings.js
   ```

2. **Use .gitignore** - Don't commit credentials
   ```bash
   echo "src/settings.js" >> .gitignore
   ```

3. **Consider Docker secrets** - For production
   ```yaml
   secrets:
     mqtt_password:
       file: ./secrets/mqtt_password.txt
   ```

## Support

- Documentation: [DLT-SUPPORT.md](DLT-SUPPORT.md)
- Quick Reference: [QUICK-REFERENCE.md](QUICK-REFERENCE.md)
- Examples: [examples/](examples/)
- Issues: Open a GitHub issue

## Next Steps

After successful deployment:

1. **Test lighting control**
   ```bash
   mosquitto_pub -h 10.100.100.83 -t "cbus/light/cbus2-mqtt/cbus_254_56_1/set" -m "ON"
   ```

2. **Configure Home Assistant**
   - See [examples/home-assistant-dlt.yaml](examples/home-assistant-dlt.yaml)
   - MQTT Discovery should auto-configure devices

3. **Set up DLT labels**
   - See [QUICK-REFERENCE.md](QUICK-REFERENCE.md)
   - Try example scripts in [examples/](examples/)

4. **Monitor logs**
   ```bash
   ./deploy.sh logs
   ```

---

**Ready to deploy!** 🚀

Run `./deploy.sh deploy` to build and start the container.

