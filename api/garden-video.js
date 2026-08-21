/**
 * Vercel serverless function that hands the browser the garden render (see
 * GARDEN_VIDEO_URL in main.js). server.js's /api/garden-video route is the
 * local `npm start` equivalent — Vercel serves this project as static files
 * and never executes server.js, so this file is the production half.
 *
 * The video is not in the repo and not in the deploy bundle: at 1.2 GB it
 * belongs in object storage, so it lives in Cloudflare R2 and this endpoint
 * 302s to a short-lived presigned URL for it. The bucket therefore stays
 * private and the R2 credentials never reach the browser, the same division
 * of labour /api/wind uses for WEATHERAPI_KEY.
 *
 * The redirect target carries R2's CORS headers and supports Range requests,
 * which is what lets a cross-origin <video> both stream and seek. The
 * signature outlives any single playthrough, and the browser is told it may
 * reuse the redirect for an hour so seeking doesn't re-sign on every range.
 *
 * R2 credentials come from Vercel's project environment variables (set in
 * the dashboard — .env is never deployed).
 */

const { presignR2Get, GARDEN_VIDEO_KEY } = require('./_r2.js');

module.exports = async (req, res) => {
  try {
    const url = presignR2Get(process.env, GARDEN_VIDEO_KEY, 6 * 60 * 60);
    res.setHeader('Location', url);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.statusCode = 302;
    res.end();
  } catch (err) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(err) }));
  }
};
