/**
 * Vercel serverless function for the attendance scene's live headcounts (see
 * the `attendance` entry in SCENES, main.js). Proxies trava-app's backend so
 * its API key never reaches the browser — same pattern as api/wind.js hides
 * WEATHERAPI_KEY.
 *
 * TRAVA_ATTENDANCE_API_URL, TRAVA_ATTENDANCE_API_KEY and
 * TRAVA_ATTENDANCE_WORKSPACE_ID are read from Vercel's project environment
 * variables (set in the dashboard, not from .env — .env never gets
 * deployed). The workspace id is required by trava-app's endpoint and isn't
 * a secret, but it's still kept server-side to match the rest of this file
 * rather than exposed as a query param callers could override.
 */
module.exports = async (req, res) => {
  const base = process.env.TRAVA_ATTENDANCE_API_URL;
  const workspaceId = process.env.TRAVA_ATTENDANCE_WORKSPACE_ID;
  if (!base || !workspaceId) {
    res.status(500).json({
      error: "TRAVA_ATTENDANCE_API_URL / TRAVA_ATTENDANCE_WORKSPACE_ID not configured"
    });
    return;
  }

  const key = process.env.TRAVA_ATTENDANCE_API_KEY;

  try {
    const url = `${base}?workspaceId=${encodeURIComponent(workspaceId)}`;
    const apiRes = await fetch(url, {
      headers: key ? { Authorization: `Bearer ${key}` } : undefined
    });
    const body = await apiRes.json();
    if (!apiRes.ok || !body.success) {
      throw new Error(body.error || `trava-app → HTTP ${apiRes.status}`);
    }
    res.setHeader("Cache-Control", "no-store");

    // trava-app nests the counts under `data`; halfDay/onLeave count toward
    // neither present, absent nor late, so they're left out of this reading.
    res.status(200).json({
      present: body.data.present,
      absent: body.data.absent,
      late: body.data.late
    });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
};
