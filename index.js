// index.js
require('dotenv').config();
const axios = require('axios');
const mqtt = require('mqtt');
const parseDuration = require('parse-duration');

const {
    SENSOR_NAME,
    API_KEY,
    STATION_ID,
    RETRIES = 5,
    MQTT_HOST,
    MQTT_PORT,
    MQTT_CLIENT_ID = 'mqtt-weather-sensor',
    MQTT_TLS = false,
    MQTT_USERNAME,
    MQTT_PASSWORD,
    EXEC_EVERY = '1m',
} = process.env;

if (!SENSOR_NAME || !API_KEY || !STATION_ID || !MQTT_HOST || !MQTT_PORT) {
    console.error('Missing required environment variables.');
    process.exit(2); // Exit code 2: missing env/config
}

function isValidMqttTopic(str) {
    // MQTT topics must not contain +, #, or null char, and not be empty
    return typeof str === 'string' && str.length > 0 && !/[+#\u0000]/.test(str);
}

if (!isValidMqttTopic(SENSOR_NAME)) {
    console.error('SENSOR_NAME is not a valid MQTT topic string. It must not be empty and cannot contain +, #, or null characters.');
    process.exit(4); // Exit code 4: invalid SENSOR_NAME
}

const stationIds = STATION_ID.split(',').map(s => s.trim());
const retries = parseInt(RETRIES, 10);
const mqttOptions = {
    host: MQTT_HOST,
    port: parseInt(MQTT_PORT, 10),
    protocol: MQTT_TLS === 'true' ? 'mqtts' : 'mqtt',
    clientId: MQTT_CLIENT_ID,
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
};
const client = mqtt.connect(mqttOptions);

client.on('connect', () => {
    console.log('Connected to MQTT broker');
    if (EXEC_EVERY) {
        const interval = parseDuration(EXEC_EVERY);
        if (!interval || interval < 1) {
            console.error('Invalid EXEC_EVERY value. Use formats like 5s, 10m, 1h, 2m30s.');
            process.exit(3); // Exit code 3: invalid EXEC_EVERY
        }
        fetchAndPublish();
        setInterval(fetchAndPublish, interval);
    } else {
        fetchAndPublish().then(success => {
            if (!success) process.exit(7); // Exit code 7: failed to fetch data
        });
    }
});

client.on('close', () => {
    console.error('MQTT connection closed. Exiting.');
    process.exit(5); // Exit code 5: MQTT connection closed
});

client.on('offline', () => {
    console.error('MQTT client went offline. Exiting.');
    process.exit(5); // Exit code 5: MQTT connection closed/offline
});

client.on('error', (err) => {
    if (err.message) {
        console.error('MQTT error:', err.message);
    } else {
        console.error('MQTT error:', err.errors?.[0]?.message);
    }
    process.exit(6); // Exit code 6: MQTT error
});

async function fetchWeather(stationId) {
    const url = `https://api.weather.com/v2/pws/observations/current?apiKey=${API_KEY}&stationId=${stationId}&numericPrecision=decimal&format=json&units=m`;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-GB,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Referer': 'https://www.wunderground.com',
        'Origin': 'https://www.wunderground.com',
        'DNT': '1',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-Mode': 'cors',
    };
    return axios.get(url, { headers });
}

async function fetchAndPublish() {
    for (const stationId of stationIds) {
        let attempt = 0;
        while (attempt < retries) {
            try {
                const response = await fetchWeather(stationId);
                if (response.data && response.data.observations && response.data.observations.length > 0) {
                    const obs = response.data.observations[0];
                    publishToMqtt(obs);
                    return true;
                }
            } catch (err) {
                console.error(`Error fetching data for ${stationId} (attempt ${attempt + 1}):`, err.message);
            }
            attempt++;
            await new Promise(res => setTimeout(res, 2000));
        }
        console.log(`Exhausted retries for station ${stationId}, moving to next.`);
    }
    console.error('Failed to fetch data from all stations. Exiting.');
    process.exit(7); // Exit code 7: failed to fetch data
    return false;
}

function publishToMqtt(obs) {
    const base = `homeassistant/sensor/${SENSOR_NAME}`;
    const device = {
        identifiers: [`${SENSOR_NAME}`],
        name: `Weather Station ${SENSOR_NAME}`,
        manufacturer: 'Weather.com',
    };

    // Map of fields to Home Assistant config
    const sensors = [
        {
            key: 'obsTimeUtc',
            name: 'Observation Time',
            device_class: undefined,
            unit: undefined,
            value: obs.obsTimeUtc,
            state_transform: v => v,
        },
        {
            key: 'solarRadiation',
            name: 'Solar Radiation',
            device_class: undefined,
            unit: 'W/m²',
            value: obs.solarRadiation,
        },
        {
            key: 'winddir',
            name: 'Wind Direction',
            device_class: undefined,
            unit: '°',
            value: obs.winddir,
        },
        {
            key: 'humidity',
            name: 'Humidity',
            device_class: 'humidity',
            unit: '%',
            value: obs.humidity,
        },
    ];

    // Add all metric fields
    if (obs.metric && typeof obs.metric === 'object') {
        const metricMap = {
            temp: { name: 'Temperature', device_class: 'temperature', unit: '°C' },
            heatIndex: { name: 'Heat Index', device_class: 'temperature', unit: '°C' },
            dewpt: { name: 'Dew Point', device_class: 'temperature', unit: '°C' },
            windChill: { name: 'Wind Chill', device_class: 'temperature', unit: '°C' },
            windSpeed: { name: 'Wind Speed', device_class: 'wind_speed', unit: 'km/h' },
            windGust: { name: 'Wind Gust', device_class: 'wind_speed', unit: 'km/h' },
            pressure: { name: 'Pressure', device_class: 'pressure', unit: 'hPa' },
            precipRate: { name: 'Precipitation Rate', device_class: undefined, unit: 'mm/h' },
            precipTotal: { name: 'Precipitation Total', device_class: undefined, unit: 'mm' },
            elev: { name: 'Elevation', device_class: undefined, unit: 'm' },
        };
        for (const [key, meta] of Object.entries(metricMap)) {
            if (obs.metric[key] !== undefined && obs.metric[key] !== null) {
                sensors.push({
                    key,
                    name: meta.name,
                    device_class: meta.device_class,
                    unit: meta.unit,
                    value: obs.metric[key],
                });
            }
        }
    }

    for (const sensor of sensors) {
        if (sensor.value === undefined || sensor.value === null) continue;
        const configTopic = `${base}/${sensor.key}/config`;
        const stateTopic = `${base}/${sensor.key}/state`;
        const configPayload = {
            name: `Weather ${SENSOR_NAME} ${sensor.name}`,
            state_topic: stateTopic,
            unique_id: `${SENSOR_NAME}_${sensor.key}`,
            device,
        };
        if (sensor.device_class) configPayload.device_class = sensor.device_class;
        if (sensor.unit) configPayload.unit_of_measurement = sensor.unit;
        client.publish(configTopic, JSON.stringify(configPayload), { retain: true });
        client.publish(stateTopic, String(sensor.value), { retain: true });
        console.log(`Published ${sensor.key} to MQTT.`);
    }
} 