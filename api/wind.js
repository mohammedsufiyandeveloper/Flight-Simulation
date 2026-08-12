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
module.exports = async (req, res) => {
  const key = process.env.WEATHERAPI_KEY;
  if (!key) {
    res.status(500).json({ error: "WEATHERAPI_KEY not configured" });
    return;
  }

  try {
    const url = `https://api.weatherapi.com/v1/current.json?key=${key}&q=Bengaluru&_=${Date.now()}`;
    const apiRes = await fetch(url);
    if (!apiRes.ok) throw new Error(`weatherapi → HTTP ${apiRes.status}`);
    const data = await apiRes.json();
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ kph: data.current.wind_kph });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
};
