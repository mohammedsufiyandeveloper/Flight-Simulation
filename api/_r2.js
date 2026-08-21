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

/** The garden render's key in R2 — see GARDEN_VIDEO_URL in main.js. */
const GARDEN_VIDEO_KEY = 'flight-simulation/4k_render_final_001.mp4';

module.exports = { presignR2Get, GARDEN_VIDEO_KEY };
