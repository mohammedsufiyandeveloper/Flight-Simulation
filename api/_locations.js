/**
 * Every place the weather scene's location picker is allowed to query
 * WeatherAPI for. An allowlist, not a passthrough — the client sends an id,
 * never a raw query string, so a request to /api/wind can't be turned into
 * an open relay for arbitrary WeatherAPI lookups against our key. Mirrors
 * VIDEO_KEYS's role in _r2.js.
 *
 * The browser-side half of this table is WEATHER_LOCATIONS in main.js; ids
 * must match, and its order there is what the dropdown shows.
 */
const LOCATIONS = {
  bengaluru: { label: 'Bengaluru, India', query: 'Bengaluru' },
  reykjavik: { label: 'Reykjavik, Iceland', query: 'Reykjavik' },
  oslo: { label: 'Oslo, Norway', query: 'Oslo' },
  london: { label: 'London, United Kingdom', query: 'London' },
  newyork: { label: 'New York, United States', query: 'New York' },
  tokyo: { label: 'Tokyo, Japan', query: 'Tokyo' },
  dubai: { label: 'Dubai, UAE', query: 'Dubai' },
  cairo: { label: 'Cairo, Egypt', query: 'Cairo' },
  sydney: { label: 'Sydney, Australia', query: 'Sydney' },
  riodejaneiro: { label: 'Rio de Janeiro, Brazil', query: 'Rio de Janeiro' },
};

const DEFAULT_LOCATION_ID = 'bengaluru';

/** Resolves a request's ?location= to a WeatherAPI query, or null if it is not allowlisted. */
function resolveLocation(id) {
  if (!id) return LOCATIONS[DEFAULT_LOCATION_ID];
  return Object.prototype.hasOwnProperty.call(LOCATIONS, id) ? LOCATIONS[id] : null;
}

module.exports = { LOCATIONS, DEFAULT_LOCATION_ID, resolveLocation };
