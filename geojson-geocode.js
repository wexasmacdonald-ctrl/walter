const fetch = global.fetch;
const stops = [
  '1304 Arba Court, Cornwall, ON, Canada',
  '1305 Arba Court, Cornwall, ON, Canada',
  '1309 Arba Court, Cornwall, ON, Canada',
  '1321 Arba Court, Cornwall, ON, Canada',
  '1336 Arba Court, Cornwall, ON, Canada',
  '1337 Arba Court, Cornwall, ON, Canada',
  '1342 Arba Court, Cornwall, ON, Canada',
  '1348 Arba Court, Cornwall, ON, Canada',
  '1349 Arba Court, Cornwall, ON, Canada',
  '1356 Arba Court, Cornwall, ON, Canada',
  '1380 Arba Court, Cornwall, ON, Canada',
  '1390 Arba Court, Cornwall, ON, Canada',
  '1392 Arba Court, Cornwall, ON, Canada',
  '1394 Arba Court, Cornwall, ON, Canada',
  '1400 Arba Court, Cornwall, ON, Canada',
  '1370-1372 Arba Court, Cornwall, ON, Canada',
  '109 Bellwood Dr., Cornwall, ON, Canada',
  '113 Bellwood Dr., Cornwall, ON, Canada',
  '176 Bellwood Dr., Cornwall, ON, Canada',
  '184 Bellwood Dr., Cornwall, ON, Canada',
  '206 Bellwood Dr., Cornwall, ON, Canada',
  '215 Bellwood Dr., Cornwall, ON, Canada',
  '238 Bellwood Dr., Cornwall, ON, Canada',
  '244 Bellwood Dr., Cornwall, ON, Canada',
  '37 Blackburn Dr., Cornwall, ON, Canada',
  '98 Butternut Dr., Cornwall, ON, Canada',
  '209 Eastport Dr., Cornwall, ON, Canada',
  '228 Eastport Dr., Cornwall, ON, Canada',
  '233 Eastport Dr., Cornwall, ON, Canada',
  '234 Eastport Dr., Cornwall, ON, Canada',
  '235 Eastport Dr., Cornwall, ON, Canada',
  '241 Eastport Dr., Cornwall, ON, Canada',
  '252 Eastport Dr., Cornwall, ON, Canada',
];

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocode(address) {
  const url = 'https://geocode.maps.co/search?q=' + encodeURIComponent(address);
  const res = await fetch(url, { headers: { 'User-Agent': 'codex-cli/1.0' }});
  if (!res.ok) {
    throw new Error(`Request failed ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }
  const { lat, lon, display_name } = data[0];
  return {
    lat: parseFloat(lat),
    lon: parseFloat(lon),
    display_name,
  };
}

(async () => {
  const features = [];
  for (const stop of stops) {
    try {
      const result = await geocode(stop);
      if (result) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [result.lon, result.lat],
          },
          properties: {
            address: stop,
            providerDisplayName: result.display_name,
          },
        });
        console.log(`? ${stop} => ${result.lat}, ${result.lon}`);
      } else {
        features.push({
          type: 'Feature',
          geometry: null,
          properties: {
            address: stop,
            error: 'No result',
          },
        });
        console.log(`? ${stop} => no result`);
      }
    } catch (error) {
      features.push({
        type: 'Feature',
        geometry: null,
        properties: {
          address: stop,
          error: error.message,
        },
      });
      console.log(`? ${stop} => ${error.message}`);
    }
    await delay(1100);
  }
  const geojson = {
    type: 'FeatureCollection',
    features,
  };
  require('fs').writeFileSync('geojson-output.json', JSON.stringify(geojson, null, 2));
})();
