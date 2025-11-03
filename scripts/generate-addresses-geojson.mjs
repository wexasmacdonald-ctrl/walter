import fs from "fs";

const fetch = global.fetch;

const addresses = [
  "1304 Arba Court, Cornwall, ON, Canada",
  "1305 Arba Court, Cornwall, ON, Canada",
  "1309 Arba Court, Cornwall, ON, Canada",
  "1321 Arba Court, Cornwall, ON, Canada",
  "1336 Arba Court, Cornwall, ON, Canada",
  "1337 Arba Court, Cornwall, ON, Canada",
  "1342 Arba Court, Cornwall, ON, Canada",
  "1348 Arba Court, Cornwall, ON, Canada",
  "1349 Arba Court, Cornwall, ON, Canada",
  "1356 Arba Court, Cornwall, ON, Canada",
  "1380 Arba Court, Cornwall, ON, Canada",
  "1390 Arba Court, Cornwall, ON, Canada",
  "1392 Arba Court, Cornwall, ON, Canada",
  "1394 Arba Court, Cornwall, ON, Canada",
  "1400 Arba Court, Cornwall, ON, Canada",
  "1370-1372 Arba Court, Cornwall, ON, Canada",
  "109 Bellwood Dr., Cornwall, ON, Canada",
  "113 Bellwood Dr., Cornwall, ON, Canada",
  "176 Bellwood Dr., Cornwall, ON, Canada",
  "184 Bellwood Dr., Cornwall, ON, Canada",
  "206 Bellwood Dr., Cornwall, ON, Canada",
  "215 Bellwood Dr., Cornwall, ON, Canada",
  "238 Bellwood Dr., Cornwall, ON, Canada",
  "244 Bellwood Dr., Cornwall, ON, Canada",
  "37 Blackburn Dr., Cornwall, ON, Canada",
  "98 Butternut Dr., Cornwall, ON, Canada",
  "209 Eastport Dr., Cornwall, ON, Canada",
  "228 Eastport Dr., Cornwall, ON, Canada",
  "233 Eastport Dr., Cornwall, ON, Canada",
  "234 Eastport Dr., Cornwall, ON, Canada",
  "235 Eastport Dr., Cornwall, ON, Canada",
  "241 Eastport Dr., Cornwall, ON, Canada",
  "252 Eastport Dr., Cornwall, ON, Canada"
];

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocode(address) {
  const url = "https://geocode.maps.co/search?q=" + encodeURIComponent(address);
  const res = await fetch(url, {
    headers: { "User-Agent": "expo-route-tester" }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const best = data[0];
  return {
    lat: parseFloat(best.lat),
    lon: parseFloat(best.lon)
  };
}

async function main() {
  const features = [];

  for (const address of addresses) {
    try {
      const result = await geocode(address);
      if (result) {
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [result.lon, result.lat]
          },
          properties: {
            address
          }
        });
        console.log(`? ${address}`);
      } else {
        console.log(`? No result for ${address}`);
      }
    } catch (error) {
      console.error(`? ${address}: ${error.message}`);
    }

    await delay(1500);
  }

  const geojson = {
    type: "FeatureCollection",
    features
  };

  const outputPath = "C:/Users/brad/Desktop/addresses.geojson";
  fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2));
  console.log(`\nSaved ${features.length} features to ${outputPath}`);
}

main().catch((error) => {
  console.error("Unexpected error:", error);
});
