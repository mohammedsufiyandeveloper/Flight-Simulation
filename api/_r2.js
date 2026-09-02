/**
 * Minimal AWS SigV4 query-string signer for Cloudflare R2 — no aws-sdk
 * dependency, in the same spirit as server.js's hand-rolled .env loader.
 * The SDK would pull ~20 MB into a project that otherwise has no
 * dependencies at all, to produce a URL that is ~40 lines of crypto.
 *
 * Files under api/ prefixed with _ are treated by Vercel as shared helpers
 * rather than as their own serverless routes.
 */

const crypto = require('crypto');

const sha256hex = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => crypto.createHmac('sha256', key).update(value).digest();

/**
 * Presigns a GET for one object and returns a plain HTTPS URL that anyone
 * holding it can read until it expires — which is the point: it lets the
 * browser stream straight from R2 without the bucket ever being public and
 * without the R2 credentials leaving the server, exactly as /api/wind keeps
 * WEATHERAPI_KEY server-side.
 *
 * Range requests work against the returned URL (the browser needs 206s to
 * seek and to stream a large file), and R2 applies the bucket's CORS policy
 * to it, so the app's origin must be allowed there or the WebGL texture
 * upload in main.js will taint the canvas and throw.
 */
function presignR2Get(env, key, expiresInSeconds = 6 * 60 * 60) {
  const accessKeyId = env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
  const bucket = env.S3_BUCKET_NAME;
  const endpoint = env.S3_ENDPOINT;

  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) {
    throw new Error('R2 credentials are not configured (need AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME, S3_ENDPOINT)');
  }

  // S3_ENDPOINT carries the bucket as a path suffix; only its host is wanted
  // here because the canonical path below is built as /<bucket>/<key>.
  const host = new URL(endpoint).host;
  const region = env.AWS_REGION || 'auto';

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/s3/aws4_request`;

  const canonicalPath = `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': 'host',
    // S3's response-header override: forces this GET's response to carry a
    // real Cache-Control regardless of what's stored on the object, so the
    // browser can actually reuse a scene's video from its HTTP cache on a
    // later switch back — see prefetchOtherScenes in main.js, which is the
    // thing that makes that reuse actually happen instead of just possible.
    // Matches this endpoint's own 1-hour presign lifetime (see
    // api/garden-video.js) so a cached video never outlives the URL that
    // fetched it.
    // No space after the comma: URLSearchParams encodes spaces as "+", but
    // SigV4's canonical query string requires strict %20 — the mismatch
    // between what gets signed and what R2 re-derives fails as
    // SignatureDoesNotMatch. Comma-separated with no space is still valid
    // HTTP header syntax, so this sidesteps the encoding gap entirely.
    'response-cache-control': 'public,max-age=3600',
  });
  params.sort(); // SigV4 requires the canonical query sorted by parameter name
  const canonicalQuery = params.toString();

  const canonicalRequest = [
    'GET',
    canonicalPath,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256hex(canonicalRequest),
  ].join('\n');

  let signingKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  signingKey = hmac(signingKey, region);
  signingKey = hmac(signingKey, 's3');
  signingKey = hmac(signingKey, 'aws4_request');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return `https://${host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/**
 * Every video the app is allowed to stream, keyed by the short id the browser
 * asks for (/api/garden-video?id=<id>).
 *
 * This is an allowlist, not a lookup convenience. The endpoint signs whatever
 * key it is handed, so accepting an arbitrary key straight off the query
 * string would let anyone holding the URL mint a signed link to *any* object
 * in the bucket. Ids come in, keys go out — never the other way round.
 *
 * The browser-side half of this table is ART_OPTIONS in main.js; the ids
 * must match.
 */
const VIDEO_KEYS = {
  // Fixed to the Flight data source — nothing else ever requests this id.
  art1: 'flight-simulation/4k_render_final_001.mp4',

  // The general-purpose pool Weather/Attendance pick from. art2's key keeps
  // its original upload name (2kwithoutflowers.mp4) rather than being
  // re-uploaded under a new one — same bytes, just a different id pointing
  // at them.
  art2: 'flight-simulation/2kwithoutflowers.mp4',
  art3: 'flight-simulation/ART3.mp4',
  art4: 'flight-simulation/weather_warm.mp4',
};

const DEFAULT_VIDEO_ID = 'art1';

/** Resolves a request's ?id= to an R2 key, or null if it is not allowlisted. */
function resolveVideoKey(id) {
  if (!id) return VIDEO_KEYS[DEFAULT_VIDEO_ID];
  return Object.prototype.hasOwnProperty.call(VIDEO_KEYS, id) ? VIDEO_KEYS[id] : null;
}

/** The flight render's key — kept for anything still asking for it by name. */
const GARDEN_VIDEO_KEY = VIDEO_KEYS[DEFAULT_VIDEO_ID];

module.exports = {
  presignR2Get,
  resolveVideoKey,
  VIDEO_KEYS,
  DEFAULT_VIDEO_ID,
  GARDEN_VIDEO_KEY,
};
