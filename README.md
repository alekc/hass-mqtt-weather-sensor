# Weather Sensor MQTT Bridge

This project is a Node.js application that fetches current weather observation data from the Weather.com API (PWS) and publishes it to an MQTT broker in a format compatible with Home Assistant autodiscovery. It supports multiple weather stations, retries, and flexible scheduling. Each available weather metric is published as a separate Home Assistant sensor.

## Features
- Fetches weather data from Weather.com PWS API for one or more stations
- Publishes all available metrics (temperature, humidity, wind, pressure, etc.) to MQTT
- Home Assistant autodiscovery support for all sensors
- Configurable via environment variables
- Docker and Kubernetes ready

## Configuration
All configuration is done via environment variables:

| Variable         | Description                                                      | Required | Example                  |
|------------------|------------------------------------------------------------------|----------|--------------------------|
| `SENSOR_NAME`    | Unique name for this sensor set (used in MQTT topics)            | Yes      | `weather_london`     |
| `API_KEY`        | Weather.com API key                                              | Yes      | `your_api_key`           |
| `STATION_ID`     | Comma-separated list of station IDs to try                       | Yes      | `ILONDON712,ILONDON857`      |
| `RETRIES`        | Number of retries per station (default: 5)                       | No       | `3`                      |
| `MQTT_HOST`      | MQTT broker host or IP                                           | Yes      | `10.19.80.14`            |
| `MQTT_PORT`      | MQTT broker port                                                 | Yes      | `1883`                   |
| `MQTT_CLIENT_ID` | MQTT client ID (default: mqtt-weather-sensor)                   | No       | `mqtt-weather-sensor`    |
| `MQTT_TLS`       | Use TLS for MQTT connection (`true` or `false`)                  | No       | `false`                  |
| `MQTT_USERNAME`  | MQTT username (optional)                                         | No       | `user`                   |
| `MQTT_PASSWORD`  | MQTT password (optional)                                         | No       | `pass`                   |
| `EXEC_EVERY`     | How often to fetch/publish (e.g. `5m`, `2m30s`, `1h`)            | No       | `1m`                     |

## Example `.env` file
```
SENSOR_NAME=weather_london
API_KEY=your_api_key
STATION_ID=ILONDON712,ILONDON857
RETRIES=5
MQTT_HOST=mqtt.endpoint.com
MQTT_PORT=1883
MQTT_CLIENT_ID=mqtt-weather-sensor
MQTT_TLS=false
MQTT_USERNAME=
MQTT_PASSWORD=
EXEC_EVERY=1m
```

## Running with Docker Compose
```yaml
version: '3.8'
services:
  weather-sensor:
    image: ghcr.io/alekc/hass-mqtt-weather-sensor
    env_file:
      - .env
    restart: unless-stopped
```

## Running on Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: weather-sensor
spec:
  replicas: 1
  selector:
    matchLabels:
      app: weather-sensor
  template:
    metadata:
      labels:
        app: weather-sensor
    spec:
      containers:
      - name: weather-sensor
        image: ghcr.io/alekc/hass-mqtt-weather-sensor
        env:
        - name: SENSOR_NAME
          value: "weather_london"
        - name: API_KEY
          value: "your_api_key"
        - name: STATION_ID
          value: "ILONDON712,ILONDON857"
        - name: RETRIES
          value: "5"
        - name: MQTT_HOST
          value: "mqtt.endpoint.com"
        - name: MQTT_PORT
          value: "1883"
        - name: EXEC_EVERY
          value: "1m"
        # Add MQTT_USERNAME and MQTT_PASSWORD if needed
```

## Home Assistant Integration
After running, sensors will be auto-discovered by Home Assistant under the device name you set in `SENSOR_NAME`. Each available metric (temperature, humidity, wind, etc.) will appear as a separate sensor entity.

## Exit Codes
- 2: Missing required environment variables/config
- 3: Invalid EXEC_EVERY value
- 4: Invalid SENSOR_NAME
- 5: MQTT connection closed or offline
- 6: MQTT error
- 7: Failed to fetch data from all stations

## License
MIT 