# eDLT Quick Start Guide

## ✅ Working Now!

Your cgate-mqtt bridge now supports eDLT labels on Clipsal Saturn switches (5085EDLW-PW).

## Test It Right Now

```bash
# Set button 1 on a DLT switch at group address 129
mosquitto_pub -h YOUR_MQTT_HOST \
  -t "cbus/dlt/254_56_129/1/set" \
  -m "New Label!"

# Set button 2
mosquitto_pub -h YOUR_MQTT_HOST \
  -t "cbus/dlt/254_56_129/2/set" \
  -m "Line 2 Text"

# Set button 3
mosquitto_pub -h YOUR_MQTT_HOST \
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
docker ps -f name=cgate-mqtt

# View logs
docker logs --tail=50 cgate-mqtt

# Restart if needed
docker restart cgate-mqtt

# Stop
docker stop cgate-mqtt

# Start
docker start cgate-mqtt
```

## Monitor DLT Activity

```bash
# Subscribe to all DLT messages
mosquitto_sub -h YOUR_MQTT_HOST -t "cbus/dlt/#" -v
```

## Production Tips

1. **Disable logging** for production (edit `src/settings.js`):
   ```javascript
   exports.logging = false;
   ```
   Then restart: `docker restart cgate-mqtt`

2. **Backup your settings**:
   ```bash
   cp src/settings.js src/settings.js.backup
   ```

3. **Test all your DLT switches** - Use the same format as Garage Audio Source

## Documentation

- **Full guide**: `DLT-SUPPORT.md`
- **DLT reference**: `DLT-SUPPORT.md`
- **Examples**: `examples/` directory
- **Quick commands**: `QUICK-REFERENCE.md`

## Your Setup

- MQTT: configure in `src/settings.js`
- C-Gate: configure in `src/settings.js`
- eDLT: ✅ ENABLED

**Enjoy your dynamic labels!** 🎉

