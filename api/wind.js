/**
 * Vercel serverless function for the garden video's wind-speed control (see
 * WIND_API in main.js). server.js's /api/wind route only runs during local
 * `npm start` — Vercel serves this project as static files and never
 * executes server.js, so this file is the production equivalent: Vercel
 * auto-detects any file under api/ as its own serverless function.
 *
 * WEATHERAPI_KEY is read from Vercel's project environment variables (set
 * in the dashboard, not from .env — .env never gets deployed).
 */
const { resolveLocation } = require('./_locations.js');

module.exports = async (req, res) => {
  const key = process.env.WEATHERAPI_KEY;
  if (!key) {
    res.status(500).json({ error: "WEATHERAPI_KEY not configured" });
    return;
  }

  // ?location= selects which place the weather scene's picker asked for
  // (see WEATHER_LOCATIONS in main.js); omitted or unrecognised falls back
  // to the default rather than being sent to WeatherAPI unchecked.
  const locationId = new URL(req.url, "http://localhost").searchParams.get("location");
  const location = resolveLocation(locationId);
  if (!location) {
    res.status(400).json({ error: `unknown location: ${locationId}` });
    return;
  }

  try {
    const url = `https://api.weatherapi.com/v1/current.json?key=${key}&q=${encodeURIComponent(location.query)}&_=${Date.now()}`;
    const apiRes = await fetch(url);
    if (!apiRes.ok) throw new Error(`weatherapi → HTTP ${apiRes.status}`);
    const data = await apiRes.json();
    res.setHeader("Cache-Control", "no-store");

    // kph drives video playback speed in every scene; temp_c additionally
    // tints the weather scene's render. Both come from one call, so the
    // second scene costs no extra rate limit.
    res.status(200).json({
      kph: data.current.wind_kph,
      tempC: data.current.temp_c,
      condition: data.current.condition?.text ?? null,
    });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
};
