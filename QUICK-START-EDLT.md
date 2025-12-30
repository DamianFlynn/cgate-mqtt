# eDLT Quick Start Guide

## ✅ Working Now!

Your cgate-mqtt bridge now supports eDLT labels on Clipsal Saturn switches (5085EDLW-PW).

## Test It Right Now

```bash
# Set button 1 on Garage Audio Source (254/56/129)
mosquitto_pub -h 10.100.100.83 -u mqttpool -P mqttpoolpwd \
  -t "cbus/dlt/254_56_129/1/set" \
  -m "New Label!"

# Set button 2
mosquitto_pub -h 10.100.100.83 -u mqttpool -P mqttpoolpwd \
  -t "cbus/dlt/254_56_129/2/set" \
  -m "Line 2 Text"

# Set button 3
mosquitto_pub -h 10.100.100.83 -u mqttpool -P mqttpoolpwd \
  -t "cbus/dlt/254_56_129/3/set" \
  -m "Line 3 Text"
```

## Find Your DLT Addresses

Your DLT switches use the format: `254_56_{group}`

Replace `{group}` with your C-Bus group address:
- Garage Audio Source: `254_56_129` ✅ (tested and working!)
- Other switches: `254_56_XXX` (replace XXX with your group number)

## Container Management

```bash
# Check status
ssh humpty@10.100.100.88 "docker ps -f name=cgate-mqtt"

# View logs
ssh humpty@10.100.100.88 "docker logs --tail=50 cgate-mqtt"

# Restart if needed
ssh humpty@10.100.100.88 "docker restart cgate-mqtt"

# Stop
ssh humpty@10.100.100.88 "docker stop cgate-mqtt"

# Start
ssh humpty@10.100.100.88 "docker start cgate-mqtt"
```

## Monitor DLT Activity

```bash
# Subscribe to all DLT messages
mosquitto_sub -h 10.100.100.83 -u mqttpool -P mqttpoolpwd -t "cbus/dlt/#" -v
```

## Production Tips

1. **Disable logging** for production (edit `/home/humpty/docker/cbus/settings.js`):
   ```javascript
   exports.logging = false;
   ```
   Then restart: `docker restart cgate-mqtt`

2. **Backup your settings**:
   ```bash
   ssh humpty@10.100.100.88 "cp /home/humpty/docker/cbus/settings.js ~/settings.js.backup"
   ```

3. **Test all your DLT switches** - Use the same format as Garage Audio Source

## Documentation

- **Full guide**: `EDLT-SUCCESS.md`
- **DLT reference**: `DLT-SUPPORT.md`
- **Examples**: `examples/` directory
- **Quick commands**: `QUICK-REFERENCE.md`

## Your Setup

- Container: `cgate-mqtt:0.4.0-final` (running)
- MQTT: 10.100.100.83:1883
- C-Gate: 10.100.100.88:20023
- Project: TURNER
- eDLT: ✅ ENABLED

**Enjoy your dynamic labels!** 🎉

