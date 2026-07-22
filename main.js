/* =================================================================
   FLIGHT GARDEN
   An airport operations visualization disguised as a living garden.

   Metaphor map
     garden           → the airport
     butterflies      → flights
     the blue bloom   → Terminal Bloom (gates G1–G6)
     cyan corridors   → arrival approach paths
     amber trails     → departure climb-out paths
     white arcs       → the holding pattern stack
   ================================================================= */

import * as THREE from "three";

/* =================================================================
   1 · WORLD CONFIG
   Everything is expressed in the coordinate space of the garden
   plane so the metaphor stays anchored to the artwork.
   ================================================================= */

const GARDEN = {
  width: 7.06,          // world-space plane size — independent of texture source
  height: 6.0,
  // The frame's inner opening measures ≈ ±2.16 x, ±2.12 y in world units.
  innerX: 1.98,         // playable area inside the white shadow box
  innerY: 1.95,
  // Spawn ring sits on the foliage, inside the opening. Everything — corridors,
  // trails, holding stack — must live on the garden; the white frame is the
  // edge of the world, and anything past it reads as floating in the void.
  edgeX: 2.02,
  edgeY: 1.98
};

/** Centre of the blue bloom in the artwork — our terminal. */
const TERMINAL = new THREE.Vector3(-0.35, -0.31, 0.30);

/**
 * The garden video (gardenanimation.mp4) doesn't share the plane's aspect —
 * these control how its UVs are fitted onto the plane in the shader (see
 * fitContainUv in GARDEN_FRAG) without touching any world coordinate above.
 *
 * The MP4 is 3840×2160, but that resolution controls only texture sampling
 * (the contain-fit and the sharpen kernel below) — the Three.js world above
 * keeps its original dimensions so routes, gates and labels stay aligned.
 */
const GARDEN_VIDEO = {
  width: 3840,
  height: 2160,
  aspect: 3840 / 2160,
  scale: 1.0,
  offsetX: 0.0,
  offsetY: 0.0,
  sharpenDesktop: 0.28,
  sharpenMobile: 0.0
};

const VIDEO_RENDER_QUALITY = {
  desktopDpr: 2.5,
  mobileDpr: 1.75,
  bloomStrength: 0.18,
  bloomRadius: 0.25,
  bloomThreshold: 1.0
};

const ALT = {
  ground: 0.30,         // z of a butterfly resting on a flower
  cruise: 0.92,         // z of a butterfly at corridor altitude
  ceiling: 31000        // ft, for the readout only
};

// The bloom is left-of-centre in the artwork, so the stack has to stay tight
// enough to leave the Arrival Meadow room for a real approach corridor.
const HOLD_RADIUS = 1.20;
const GATE_COUNT = 6;
const GATE_RADIUS = 0.46;

const MAX_DT = 1 / 24;  // clamp so tab-switches never teleport flights

const COLOR = {
  arrival:   new THREE.Color("#62dcff"),
  departure: new THREE.Color("#ffc46b"),
  holding:   new THREE.Color("#ffffff"),
  terminal:  new THREE.Color("#9fe6b8")
};

/** Golden fairy dust, sprinkled behind moving butterflies. */
const FAIRY_DUST_COLOR = new THREE.Color("#ffd27a");

/* =================================================================
   2 · AIRLINE + AIRPORT DATA
   ================================================================= */

const AIRLINES = {
  AI: { name: "Air India",       color: "#e05a45", range: [100, 899] },
  "6E": { name: "IndiGo",        color: "#4f7cf5", range: [2000, 2999] },
  UK: { name: "Vistara",         color: "#b487f0", range: [800, 999] },
  EK: { name: "Emirates",        color: "#e8b44c", range: [500, 599] },
  QR: { name: "Qatar Airways",   color: "#c8577f", range: [500, 699] },
  LH: { name: "Lufthansa",       color: "#e9d16a", range: [750, 799] },
  BA: { name: "British Airways", color: "#7fa8e8", range: [100, 299] }
};

const AIRLINE_CODES = Object.keys(AIRLINES);

const CITIES = {
  BLR: "Bengaluru", DEL: "Delhi", BOM: "Mumbai", MAA: "Chennai",
  HYD: "Hyderabad", LHR: "London", DXB: "Dubai", DOH: "Doha",
  SIN: "Singapore", FRA: "Frankfurt", CCU: "Kolkata", GOI: "Goa",
  JFK: "New York", AMS: "Amsterdam", HKG: "Hong Kong", BKK: "Bangkok",
  CDG: "Paris", SYD: "Sydney"
};

const AIRPORTS = {
  BLR: { tower: "BLR Garden Tower",  full: "Kempegowda Intl",       intensity: 1.00,
         routes: ["DEL", "BOM", "DXB", "SIN", "MAA", "HYD", "LHR", "DOH"] },
  DEL: { tower: "DEL Garden Tower",  full: "Indira Gandhi Intl",    intensity: 1.35,
         routes: ["BLR", "BOM", "DXB", "FRA", "LHR", "CCU", "MAA", "JFK"] },
  BOM: { tower: "BOM Garden Tower",  full: "Chhatrapati Shivaji",   intensity: 1.20,
         routes: ["DEL", "BLR", "GOI", "DXB", "DOH", "LHR", "SIN", "AMS"] },
  MAA: { tower: "MAA Garden Tower",  full: "Chennai Intl",          intensity: 0.85,
         routes: ["BLR", "HYD", "CCU", "SIN", "DXB", "BKK", "DEL"] },
  HYD: { tower: "HYD Garden Tower",  full: "Rajiv Gandhi Intl",     intensity: 0.90,
         routes: ["BLR", "DEL", "BOM", "DXB", "DOH", "MAA", "SIN"] },
  LHR: { tower: "LHR Garden Tower",  full: "London Heathrow",       intensity: 1.50,
         routes: ["JFK", "CDG", "AMS", "FRA", "DXB", "HKG", "DEL", "SYD"] }
};

const STATUS_LABEL = {
  inbound:  "Arriving",
  holding:  "Holding",
  final:    "Landing",
  parked:   "At Gate",
  boarding: "Boarding",
  climb:    "Departing",
  gone:     "Departed"
};

const ZONE_LABEL = {
  inbound:  "Arrival Meadow",
  holding:  "Holding Pattern",
  final:    "Final Approach",
  parked:   "Terminal Bloom",
  boarding: "Terminal Bloom",
  climb:    "Departure Trail",
  gone:     "—"
};

/* =================================================================
   3 · SMALL MATH / RANDOM HELPERS
   ================================================================= */

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

/** Shortest signed angular difference, wrapped to (-π, π]. */
function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Point on the holding ring at a given angle. */
function ringPoint(angle, radius = HOLD_RADIUS, z = ALT.cruise) {
  return new THREE.Vector3(
    TERMINAL.x + Math.cos(angle) * radius,
    TERMINAL.y + Math.sin(angle) * radius,
    z
  );
}

/* =================================================================
   4 · RENDERER · SCENE · CAMERA
   ================================================================= */

const canvas = document.getElementById("scene");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Pure black: the bloom pass encodes the clear colour on its way out, so any
// non-zero value would be lifted into a washed-out grey. Black round-trips.
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 0, 9);

/* --- optional bloom; the piece degrades gracefully without it ---- */
let composer = null;

async function initPostProcessing() {
  // Post-processing bloom is disabled to prevent quality loss and glare on the background video animation.
  composer = null;
}

/* =================================================================
   5 · SHARED TEXTURES + GEOMETRY (created once, reused everywhere)
   ================================================================= */

/** Soft radial falloff used by every glow sprite and particle. */
function makeGlowTexture(size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.00, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,255,255,0.72)");
  g.addColorStop(0.45, "rgba(255,255,255,0.18)");
  g.addColorStop(1.00, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const GLOW_TEX = makeGlowTexture();

const SHARED = {
  wingGeo: new THREE.PlaneGeometry(0.28, 0.28),
  bodyGeo: new THREE.SphereGeometry(0.014, 8, 6),
  headGeo: new THREE.SphereGeometry(0.013, 8, 6),
  antennaGeo: (() => {
    const g = new THREE.CylinderGeometry(0.0012, 0.0004, 0.05, 3);
    g.translate(0, 0.025, 0);   // pivot at the base
    return g;
  })(),
  tipGeo: new THREE.SphereGeometry(0.0035, 4, 3)
};

SHARED.bodyGeo.scale(0.8, 3.4, 0.8);

/* =================================================================
   6 · BUTTERFLY WING SHADER
   The wing silhouette is a polar rose; colour is driven by the
   airline, and uHighlight lets a departing flight "brighten before
   takeoff" the way an aircraft lights up on pushback.
   ================================================================= */

const WING_VERT = /* glsl */`
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WING_FRAG = /* glsl */`
  precision highp float;

  uniform float uTime;
  uniform vec2  uResolution;
  uniform float uOpacity;
  uniform float uSide;        // -1 = left half, +1 = right half
  uniform vec3  uColor;       // airline livery
  uniform float uHighlight;   // 0..1 pre-departure brightening
  uniform float uSeed;        // per-flight speckle + shimmer offset
  uniform float uTint;        // how much livery survives the luminous base

  varying vec2 vUv;

  const float SCALE = 22.8;

  // The luminous palette. Every butterfly is glass lit from within; the airline
  // colour is a tint through that glass, never a replacement for it.
  const vec3 DEEP = vec3(0.05, 0.16, 0.72);   // sapphire, wing edges
  const vec3 CYAN = vec3(0.22, 0.80, 1.00);   // electric core, near the body
  const vec3 GOLD = vec3(1.00, 0.80, 0.38);   // warm fairy-light at the thorax

  // Polar silhouette of a butterfly wing pair.
  float wingField(float r, float t){
    return 7.2 - 0.5*sin(t) + 2.5*sin(3.0*t) + 2.0*sin(5.0*t) - 1.7*sin(7.0*t)
         + 3.0*cos(2.0*t) - 2.0*cos(4.0*t) - 0.4*cos(16.0*t) - r;
  }

  float hash21(vec2 p){
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main(){
    vec2 fragCoord = vUv * uResolution;
    vec2 uv = (2.0 * fragCoord - uResolution.xy) / uResolution.y * 0.7;

    // Each mesh renders exactly one half so the two can flap independently.
    if (uSide < 0.0 && uv.x > 0.0) discard;
    if (uSide > 0.0 && uv.x < 0.0) discard;

    float r = length(uv * SCALE);
    float t = atan(uv.y, uv.x);
    float d = wingField(r, t);
    if (d < 0.0) discard;

    // A tight rim: the pale edge must hug the silhouette, otherwise it floods
    // the whole wing and bloom turns every butterfly into a white smudge.
    float inside = smoothstep(0.0, 1.2, d);          // 0 at the rim
    float rim    = 1.0 - inside;
    float radial = clamp(r / 13.0, 0.0, 1.0);        // 0 at the body

    // sapphire at the edges, electric cyan toward the body
    vec3 color = mix(CYAN, DEEP, smoothstep(0.15, 0.95, radial));

    // livery tint, strongest out on the wing where it reads against the foliage
    color = mix(color, uColor, uTint * (0.26 + 0.34 * radial));

    // inner glow — the light source lives at the thorax; a warm gold core
    // sits under the electric cyan so the wing reads as lit from within,
    // closer to a firefly than a neon sign.
    color += CYAN * 0.42 * pow(1.0 - radial, 3.0);
    color += GOLD * 0.38 * pow(1.0 - radial, 5.0);

    // radiating veins, darkened glass between the ribs
    float vein = smoothstep(0.86, 1.0, abs(sin(t * 7.0 + 0.4)));
    color = mix(color, color * 0.55 + CYAN * 0.10, vein * 0.30 * inside);

    // star speckles, scattered and biased toward the wing edges — warm
    // white/gold so they read as fairy dust rather than frost
    vec2 grid  = uv * 26.0 + uSeed * 13.0;
    vec2 cell  = floor(grid);
    float h    = hash21(cell);
    vec2 jitter = vec2(hash21(cell + 1.7), hash21(cell + 3.1)) - 0.5;
    float star = smoothstep(0.17, 0.0, length(fract(grid) - 0.5 - jitter * 0.6))
               * step(0.83, h);
    float twinkle = 0.55 + 0.45 * sin(uTime * 2.6 + h * 30.0);
    vec3 speckle = mix(vec3(1.0, 0.86, 0.55), vec3(1.0, 1.0, 1.0), h);
    color += speckle * star * twinkle * smoothstep(0.25, 0.95, radial) * 1.4;

    // tiny shimmering dots hugging the wing border — small, fast, gold
    vec2 grid2 = uv * 44.0 + uSeed * 27.0;
    vec2 cell2 = floor(grid2);
    float h2   = hash21(cell2 + 9.2);
    float star2 = smoothstep(0.14, 0.0, length(fract(grid2) - 0.5)) * step(0.90, h2);
    float twinkle2 = 0.5 + 0.5 * sin(uTime * 3.4 + h2 * 40.0);
    color += vec3(1.0, 0.88, 0.55) * star2 * twinkle2 * pow(rim, 1.3) * 1.5;

    // bright rim light hugging the silhouette, warmed with gold
    color += mix(mix(CYAN, GOLD, 0.5), vec3(1.0), 0.4) * pow(rim, 1.6) * 1.05;

    // slow iridescent shimmer
    float sh = uTime * 0.9 + radial * 5.0 + uSeed * 6.0;
    color += 0.055 * vec3(sin(sh), sin(sh + 2.1), sin(sh + 4.2));

    // pre-departure warm-up
    color += uHighlight * vec3(1.0, 0.72, 0.32) * 0.62;

    // glass: translucent through the middle, solid along the rim
    float alpha = uOpacity * smoothstep(0.0, 0.35, d) * (0.66 + 0.34 * pow(rim, 1.2));
    gl_FragColor = vec4(color, alpha);
  }
`;

function makeWingMaterial(side, color, seed, tint) {
  return new THREE.ShaderMaterial({
    vertexShader: WING_VERT,
    fragmentShader: WING_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: Math.random() * 10 },
      uResolution: { value: new THREE.Vector2(512, 512) },
      uOpacity: { value: 1 },
      uSide: { value: side },
      uColor: { value: color.clone() },
      uHighlight: { value: 0 },
      uSeed: { value: seed },
      uTint: { value: tint }
    }
  });
}

/* =================================================================
   7 · LIVING GARDEN — the base plate, alive
   The artwork is never distorted, only *lit*. A whole-image wobble
   reads as cheap; a breathing luminance and a sub-pixel shimmer read
   as a garden at night. Gate auras brighten the actual petals of the
   bloom rather than floating a sprite above them.
   ================================================================= */

let livingGarden = null;

const GARDEN_VERT = /* glsl */`
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GARDEN_FRAG = /* glsl */`
  precision highp float;

  uniform sampler2D uMap;
  uniform vec2  uSize;            // plane size in world units
  uniform float uTime;
  uniform float uMaster;          // global intro reveal
  uniform float uBreath;          // 0..1 organic swell
  uniform float uActivity;        // 0..1 how busy the airport is
  uniform float uGlowMotion;      // 0..1 — brightness/glow breathing amplitude (stays on, just gentler)

  // uMap's own aspect ratio rarely matches the plane's (7.06:6.0) — these fit
  // it into the plane letterboxed/pillarboxed ("contain"), with no stretch and
  // no change to any world coordinate. mediaAspect == planeAspect (the PNG
  // fallback case) makes fitContainUv the identity.
  uniform float uMediaAspect;
  uniform float uPlaneAspect;
  uniform float uVideoScale;
  uniform vec2  uVideoOffset;
  uniform vec2  uVideoResolution;  // native media px size, for the sharpen kernel's texel step
  uniform float uSharpenAmount;    // 0 off (mobile) .. ~0.3 (desktop) — counters bilinear softening

  uniform vec2  uTerminal;
  uniform vec2  uGatePos[6];
  uniform vec3  uGateColor[6];
  uniform vec2  uGateFx[6];       // x = sustained aura, y = transient flash

  varying vec2 vUv;

  const vec3 GOLD = vec3(1.00, 0.82, 0.45);

  // cheap hash, used only to stagger clump timing — never to distort geometry
  float hash21(vec2 p){
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // Maps a plane UV onto uMap's own UV space so the media is fully visible,
  // centred, and undistorted — never cropped, never stretched. Whichever axis
  // the media is proportionally narrower on gets letterboxed: that axis's
  // valid range shrinks to less than 0..1, and callers must mask the rest out
  // rather than sample it (clamping would smear the edge pixel into the bars).
  vec2 fitContainUv(vec2 uv){
    vec2 p = uv - 0.5;
    if (uMediaAspect > uPlaneAspect) {
      p.y *= uMediaAspect / uPlaneAspect;   // media wider than plane: letterbox top/bottom
    } else {
      p.x *= uPlaneAspect / uMediaAspect;   // media taller than plane: pillarbox left/right
    }
    p = p / uVideoScale - uVideoOffset;
    return p + 0.5;
  }

  // Unsharp-mask style 5-tap kernel: video played back through bilinear
  // filtering at less-than-native size reads soft on a bright 4K display, so
  // this counters it with a cheap high-pass boost. Weights sum to 1.0 so flat
  // regions are untouched; only edges gain contrast.
  vec3 sampleSharp(sampler2D tex, vec2 uv, vec2 texel){
    vec3 c = texture2D(tex, uv).rgb;
    vec3 n = texture2D(tex, uv + vec2(0.0, texel.y)).rgb;
    vec3 s = texture2D(tex, uv - vec2(0.0, texel.y)).rgb;
    vec3 e = texture2D(tex, uv + vec2(texel.x, 0.0)).rgb;
    vec3 w = texture2D(tex, uv - vec2(texel.x, 0.0)).rgb;
    return c * 1.35 - (n + s + e + w) * 0.0875;
  }

  void main(){
    vec2 mediaUv = fitContainUv(vUv);
    float mediaValid = step(0.0, mediaUv.x) * step(0.0, mediaUv.y)
                      * step(mediaUv.x, 1.0) * step(mediaUv.y, 1.0);

    vec2 safeUv = clamp(mediaUv, 0.0, 1.0);
    vec3 normalCol = texture2D(uMap, safeUv).rgb;
    vec3 rawCol = normalCol * mediaValid;

    gl_FragColor = vec4(rawCol, 1.0);
  }
`;

/**
 * Owns the garden plane and the uniforms that make it feel alive. Gate state is
 * pushed in once per frame; nothing here allocates after construction.
 */
class LivingGarden {
  /**
   * mediaAspect defaults to the plane's own aspect (an identity fit) — the
   * PNG fallback case, where the texture was already baked to fill the
   * plane. Pass the video's real videoWidth/videoHeight ratio to letterbox
   * or pillarbox it cleanly instead.
   */
  constructor(texture, mediaAspect = GARDEN.width / GARDEN.height, mediaResolution = [GARDEN_VIDEO.width, GARDEN_VIDEO.height]) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: GARDEN_VERT,
      fragmentShader: GARDEN_FRAG,
      uniforms: {
        uMap: { value: texture },
        uSize: { value: new THREE.Vector2(GARDEN.width, GARDEN.height) },
        uTime: { value: 0 },
        uMaster: { value: 0 },
        uBreath: { value: 0 },
        uActivity: { value: 0 },
        uGlowMotion: { value: REDUCED_MOTION ? 0.35 : 1 },
        uMediaAspect: { value: mediaAspect },
        uPlaneAspect: { value: GARDEN.width / GARDEN.height },
        uVideoScale: { value: GARDEN_VIDEO.scale },
        uVideoOffset: { value: new THREE.Vector2(GARDEN_VIDEO.offsetX, GARDEN_VIDEO.offsetY) },
        uVideoResolution: { value: new THREE.Vector2(mediaResolution[0], mediaResolution[1]) },
        uSharpenAmount: {
          value: window.innerWidth < 720 ? GARDEN_VIDEO.sharpenMobile : GARDEN_VIDEO.sharpenDesktop
        },
        uTerminal: { value: new THREE.Vector2(TERMINAL.x, TERMINAL.y) },
        uGatePos: { value: gates.map((g) => new THREE.Vector2(g.position.x, g.position.y)) },
        uGateColor: { value: gates.map(() => new THREE.Color(0, 0, 0)) },
        uGateFx: { value: gates.map(() => new THREE.Vector2(0, 0)) }
      }
    });

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(GARDEN.width, GARDEN.height),
      this.material
    );
    this.mesh.renderOrder = 0;
    scene.add(this.mesh);
  }

  /**
   * Organic timing: three incommensurate sines never repeat on a beat, so the
   * swell never feels like a metronome the way a single sin(t) does.
   */
  static breath(t) {
    const s = 0.55 * Math.sin(t * 0.31)
            + 0.30 * Math.sin(t * 0.47 + 1.3)
            + 0.15 * Math.sin(t * 0.83 + 2.1);
    return 0.5 + 0.5 * s;
  }

  update(elapsed, master, activity) {
    const u = this.material.uniforms;
    u.uTime.value = elapsed;
    u.uMaster.value = master;
    u.uBreath.value = LivingGarden.breath(elapsed);
    u.uActivity.value = activity;

    for (let i = 0; i < gates.length; i++) {
      const gate = gates[i];
      u.uGateColor.value[i].copy(gate.auraColor);
      u.uGateFx.value[i].set(gate.aura, gate.flash);
    }

    // Manually update video texture only when it has valid data and is not seeking.
    // This freezes the texture on the last frame during video loop seek and prevents blurry keyframe flashes.
    const texture = u.uMap.value;
    if (texture && texture.image && texture.image.tagName === "VIDEO") {
      const video = texture.image;
      if (video.readyState >= video.HAVE_CURRENT_DATA && !video.seeking) {
        texture.needsUpdate = true;
      }
    }
  }

  dispose() {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/** Read a PNG's dimensions from its IHDR chunk without decoding the pixels. */
async function readPngSize(blob) {
  const head = new DataView(await blob.slice(0, 24).arrayBuffer());
  if (head.byteLength < 24 || head.getUint32(0) !== 0x89504e47) return null;
  return { width: head.getUint32(16), height: head.getUint32(20) };
}

/**
 * Fallback path only — used when the garden video can't load. garden.png is
 * 7805×6640, 207 MB of decoded RGBA and wider than the 4096 MAX_TEXTURE_SIZE
 * that plenty of mobile GPUs report. Uploaded as-is it costs a quarter-
 * gigabyte of VRAM on desktop and fails outright on a phone, leaving a black
 * garden. The plane is never drawn wider than ~1300 CSS px, so we decode
 * straight to a GPU-safe size and upload that instead.
 */
async function loadGardenTexture(url) {
  const limit = Math.min(
    renderer.capabilities.maxTextureSize,
    window.innerWidth < 720 ? 1600 : 2560
  );

  const response = await fetch(url);
  if (!response.ok) throw new Error(`garden.png → HTTP ${response.status}`);
  const blob = await response.blob();

  // Read the header first so we can ask the decoder for a small bitmap directly,
  // instead of materialising all 207 MB and shrinking it afterwards.
  const size = await readPngSize(blob);
  const scale = size ? Math.min(1, limit / Math.max(size.width, size.height)) : 1;

  let source;
  if (size && scale < 1) {
    const opts = {
      resizeWidth: Math.round(size.width * scale),
      resizeHeight: Math.round(size.height * scale),
      resizeQuality: "high"
    };
    // Older Safari ignores or rejects the resize options; the drawImage below
    // still scales correctly, it just pays for the full decode first.
    source = await createImageBitmap(blob, opts).catch(() => createImageBitmap(blob));
  } else {
    source = await createImageBitmap(blob);
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((size?.width ?? source.width) * scale));
  canvas.height = Math.max(1, Math.round((size?.height ?? source.height) * scale));

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

/**
 * Loads assets/gardenanimation.mp4 as a looping, muted THREE.VideoTexture —
 * the primary garden source. garden.png stays as the poster/fallback for
 * browsers that block autoplay or when the video fails to load.
 */
async function loadGardenVideoTexture(url) {
  const video = document.createElement("video");
  video.src = url;
  video.loop = true;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.preload = "auto";

  await new Promise((resolve, reject) => {
    video.addEventListener("loadeddata", resolve, { once: true });
    video.addEventListener("error", () => reject(video.error ?? new Error("video load error")), { once: true });
  });

  try {
    await video.play();
  } catch (err) {
    // Autoplay blocked — the texture is still valid, just paused on the
    // first frame. Retry once the user interacts with the page.
    const resume = () => video.play().catch(() => {});
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("touchstart", resume, { once: true });
  }

  const texture = new THREE.Texture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  const mediaAspect = video.videoWidth / video.videoHeight;
  const mediaResolution = [video.videoWidth, video.videoHeight];
  return { texture, video, mediaAspect, mediaResolution };
}

loadGardenVideoTexture("assets/gardenanimation.mp4")
  .then(({ texture, mediaAspect, mediaResolution }) => {
    livingGarden = new LivingGarden(texture, mediaAspect, mediaResolution);
    resize();
  })
  .catch(async (err) => {
    console.warn("[Flight Garden] Garden video unavailable, falling back to garden.png.", err);
    const texture = await loadGardenTexture("assets/garden.png");
    livingGarden = new LivingGarden(texture);
    resize();
  })
  .catch((err) => {
    // file:// or a missing asset — still reveal the airspace rather than a void
    console.warn("[Flight Garden] Garden texture unavailable.", err);
  })
  .finally(beginIntro);

/* =================================================================
   8 · ROUTE + ZONE SYSTEM
   Corridors are drawn as additive gradient lines: bright where the
   traffic matters (near the terminal), dissolving into the dark at
   the garden edge. Nothing reads as a UI stroke.
   ================================================================= */

const routeLayer = new THREE.Group();
routeLayer.renderOrder = 1;
scene.add(routeLayer);

/** Edge anchors — arrivals come in low over the left/lower meadow. */
const ARRIVAL_ANCHORS = [
  new THREE.Vector3(-GARDEN.edgeX, -1.30, ALT.cruise),
  new THREE.Vector3(-1.65, -GARDEN.edgeY, ALT.cruise),
  new THREE.Vector3(-GARDEN.edgeX, 0.55, ALT.cruise),
  new THREE.Vector3(0.50, -GARDEN.edgeY, ALT.cruise)
];

/** Departures climb out across the right/upper trail. */
const DEPARTURE_ANCHORS = [
  new THREE.Vector3(GARDEN.edgeX, 0.30, ALT.cruise),
  new THREE.Vector3(1.65, GARDEN.edgeY, ALT.cruise),
  new THREE.Vector3(GARDEN.edgeX, -0.75, ALT.cruise),
  new THREE.Vector3(-0.40, GARDEN.edgeY, ALT.cruise)
];

/**
 * Corridor between an edge anchor and the holding ring.
 *
 * Cubic Bézier, not Catmull-Rom: a Bézier is guaranteed to stay inside the
 * hull of its control points, so a corridor can never bow out past the
 * garden frame the way an interpolating spline does.
 */
function corridorCurve(anchor, inbound) {
  const angle = Math.atan2(anchor.y - TERMINAL.y, anchor.x - TERMINAL.x);
  const join = ringPoint(angle);

  const dir = new THREE.Vector3().subVectors(join, anchor);
  const perp = new THREE.Vector3(-dir.y, dir.x, 0)
    .normalize()
    .multiplyScalar(inbound ? 0.12 : -0.12);

  const c1 = anchor.clone().addScaledVector(dir, 0.32).add(perp);
  const c2 = anchor.clone().addScaledVector(dir, 0.72).addScaledVector(perp, 0.35);
  c1.z = c2.z = ALT.cruise + 0.04;

  return inbound
    ? new THREE.CubicBezierCurve3(anchor.clone(), c1, c2, join)
    : new THREE.CubicBezierCurve3(join, c2, c1, anchor.clone());
}

/**
 * The corridors are shared: the same curve that is drawn as a glowing route
 * is the curve the butterflies actually fly. That is what makes the overlay
 * explanatory rather than decorative.
 */
const ARRIVAL_CORRIDORS = [];
const DEPARTURE_CORRIDORS = [];

/**
 * Additive line whose colour fades to black (= invisible) at the
 * outer end, so corridors melt into the night instead of stopping.
 */
function buildCorridorLine(curve, color, { fadeHead = 0.06, fadeTail = 0.55, peak = 0.85 } = {}) {
  const N = 140;
  const pts = curve.getPoints(N);
  const positions = new Float32Array((N + 1) * 3);
  const colors = new Float32Array((N + 1) * 3);

  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts[i].toArray(positions, i * 3);

    // bright at the start (terminal side), dissolving outward
    const a = Math.min(
      smooth(t / fadeHead),
      smooth((1 - t) / fadeTail)
    ) * peak;

    colors[i * 3 + 0] = color.r * a;
    colors[i * 3 + 1] = color.g * a;
    colors[i * 3 + 2] = color.b * a;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,               // faded in by the intro
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  line.renderOrder = 2;
  return line;

  function smooth(x) { return clamp(x, 0, 1) ** 0.8; }
}

/** A pulse of light travelling along a corridor. */
class RoutePulse {
  constructor(curve, color, speed, offset, size = 0.13) {
    this.curve = curve;
    this.speed = speed;
    this.t = offset;

    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW_TEX,
      color: color.clone(),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    this.sprite.scale.setScalar(size);
    this.sprite.renderOrder = 3;
    routeLayer.add(this.sprite);
  }

  update(dt, master) {
    this.t = (this.t + dt * this.speed) % 1;
    this.curve.getPointAt(this.t, this.sprite.position);

    // fade in on entry, out on exit — no hard pops at the frame edge
    const edge = Math.min(this.t / 0.30, (1 - this.t) / 0.30, 1);
    this.sprite.material.opacity = clamp(edge, 0, 1) * 0.40 * master;
  }
}

/** Sequenced "runway lights" strobing outward along a departure trail. */
class RunwayLights {
  constructor(curve, count = 9) {
    this.count = count;
    this.sprites = [];
    this.positions = [];

    for (let i = 0; i < count; i++) {
      const t = 0.06 + (i / (count - 1)) * 0.62;
      this.positions.push(t);

      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: GLOW_TEX,
        color: COLOR.departure.clone(),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      s.scale.setScalar(0.075);
      curve.getPointAt(t, s.position);
      s.renderOrder = 3;
      routeLayer.add(s);
      this.sprites.push(s);
    }
  }

  update(elapsed, master) {
    for (let i = 0; i < this.count; i++) {
      // travelling wave, sharpened so each lamp reads as a discrete blink
      const phase = Math.sin(elapsed * 2.6 - i * 0.55);
      const strobe = Math.pow(clamp(phase, 0, 1), 3);
      this.sprites[i].material.opacity = (0.05 + strobe * 0.40) * master;
      this.sprites[i].scale.setScalar(0.065 + strobe * 0.045);
    }
  }
}

const routePulses = [];
const runwayLights = [];
const routeLines = [];
const holdingRings = [];

function buildRouteSystem() {
  // --- arrival corridors (cool cyan, flowing inward) ---
  ARRIVAL_ANCHORS.forEach((anchor, i) => {
    const curve = corridorCurve(anchor, true);
    const angle = Math.atan2(anchor.y - TERMINAL.y, anchor.x - TERMINAL.x);
    ARRIVAL_CORRIDORS.push({ anchor, curve, angle });

    const line = buildCorridorLine(curve, COLOR.arrival, { fadeHead: 0.34, fadeTail: 0.12, peak: 0.90 });
    routeLayer.add(line);
    routeLines.push(line);

    for (let p = 0; p < 2; p++) {
      routePulses.push(new RoutePulse(curve, COLOR.arrival, rand(0.10, 0.14), (i * 0.23 + p * 0.5) % 1));
    }
  });

  // --- departure trails (warm amber, flowing outward) ---
  DEPARTURE_ANCHORS.forEach((anchor, i) => {
    const curve = corridorCurve(anchor, false);
    const angle = Math.atan2(anchor.y - TERMINAL.y, anchor.x - TERMINAL.x);
    DEPARTURE_CORRIDORS.push({ anchor, curve, angle });

    const line = buildCorridorLine(curve, COLOR.departure, { fadeHead: 0.12, fadeTail: 0.36, peak: 0.75 });
    routeLayer.add(line);
    routeLines.push(line);

    routePulses.push(new RoutePulse(curve, COLOR.departure, rand(0.11, 0.15), (i * 0.27) % 1));
    runwayLights.push(new RunwayLights(curve));
  });

  // --- final approach + initial climb, linking ring to terminal ---
  addSpoke(Math.PI * 1.20, COLOR.arrival);
  addSpoke(Math.PI * 1.42, COLOR.arrival);
  addSpoke(Math.PI * 0.14, COLOR.departure);
  addSpoke(Math.PI * 0.40, COLOR.departure);

  function addSpoke(angle, color) {
    const outer = ringPoint(angle);
    const curve = new THREE.CubicBezierCurve3(
      outer,
      ringPoint(angle + 0.30, HOLD_RADIUS * 0.72, lerp(ALT.cruise, ALT.ground, 0.35)),
      ringPoint(angle + 0.10, HOLD_RADIUS * 0.34, lerp(ALT.cruise, ALT.ground, 0.78)),
      TERMINAL.clone()
    );
    const line = buildCorridorLine(curve, color, { fadeHead: 0.55, fadeTail: 0.10, peak: 0.42 });
    routeLayer.add(line);
    routeLines.push(line);
  }

  // --- holding pattern arcs (soft white, slowly counter-rotating) ---
  [HOLD_RADIUS, HOLD_RADIUS + 0.18].forEach((radius, i) => {
    const ring = buildHoldingRing(radius, i === 0 ? 0.30 : 0.16);
    ring.userData.spin = i === 0 ? 0.020 : -0.014;
    routeLayer.add(ring);
    holdingRings.push(ring);
  });
}

/** Dashed circle rendered as short additive segments. */
function buildHoldingRing(radius, brightness) {
  const dashes = 96;
  const positions = [];
  const colors = [];

  for (let i = 0; i < dashes; i++) {
    const a0 = (i / dashes) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2 / dashes) * 0.45;

    // let the ring breathe: brighter in the holding quadrants
    const w = 0.55 + 0.45 * Math.abs(Math.sin(a0 * 2));

    for (const a of [a0, a1]) {
      positions.push(Math.cos(a) * radius, Math.sin(a) * radius, ALT.cruise - 0.02);
      colors.push(brightness * w, brightness * w, brightness * w);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const ring = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  ring.position.set(TERMINAL.x, TERMINAL.y, 0);
  ring.renderOrder = 2;
  return ring;
}

buildRouteSystem();

/* =================================================================
   9 · GATES
   Six gate markers sit on the petals of the bloom.
   ================================================================= */

const gateLayer = new THREE.Group();
scene.add(gateLayer);

const gates = [];

function buildGates() {
  const ringGeo = new THREE.RingGeometry(0.052, 0.068, 40);

  for (let i = 0; i < GATE_COUNT; i++) {
    const angle = -Math.PI * 0.55 + (i / GATE_COUNT) * Math.PI * 2;
    const position = new THREE.Vector3(
      TERMINAL.x + Math.cos(angle) * GATE_RADIUS,
      TERMINAL.y + Math.sin(angle) * GATE_RADIUS,
      ALT.ground
    );

    const marker = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    }));
    marker.position.copy(position);
    marker.renderOrder = 4;
    gateLayer.add(marker);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: GLOW_TEX,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    glow.scale.setScalar(0.20);
    glow.position.copy(position);
    glow.renderOrder = 4;
    gateLayer.add(glow);

    const label = document.createElement("div");
    label.className = "gate-label";
    label.textContent = `G${i + 1}`;
    labelLayer.appendChild(label);

    // nudge the caption outward so it never covers its own ring
    const labelPos = position.clone().add(
      new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(0.115)
    );

    gates.push({
      id: `G${i + 1}`,
      position,
      labelPos,
      angle,
      marker,
      glow,
      label,
      occupant: null,   // butterfly currently parked
      reserved: null,   // butterfly inbound to this gate

      // --- living state, consumed by LivingGarden's shader ---
      aura: 0,                            // sustained glow, 0..1
      flash: 0,                           // transient burst, decays fast
      auraColor: new THREE.Color().copy(COLOR.terminal),
      phase: Math.random() * Math.PI * 2
    });
  }
}

const isGateFree = (g) => !g.occupant && !g.reserved;
const freeGates = () => gates.filter(isGateFree);

/* ---------------- gate reactions to flight events ---------------- */

const _gateEventColor = new THREE.Color();
const WHITE = new THREE.Color(0xffffff);

/**
 * Called from Butterfly state transitions. The gate is the garden's way of
 * showing that it noticed — a landing blooms it, a takeoff releases it.
 */
function gateEvent(gate, type) {
  if (!gate) return;

  switch (type) {
    case "land":
      gate.flash = 1;
      _gateEventColor.copy(COLOR.arrival).lerp(WHITE, 0.18);
      spawnGatePulse(gate.position, _gateEventColor);
      emitSparkles(gate.position, _gateEventColor, 18, 0.06, 0.30);
      break;

    case "takeoff":
      gate.flash = 1;
      spawnGatePulse(gate.position, COLOR.departure);
      emitSparkles(gate.position, COLOR.departure, 22, 0.07, 0.44);
      break;
  }
}

/* ---------------- pooled expanding pulse rings ---------------- */

const PULSE_MAX = 6;
const pulseRings = [];

function buildPulseRings() {
  const geo = new THREE.RingGeometry(0.055, 0.072, 44);
  for (let i = 0; i < PULSE_MAX; i++) {
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    }));
    mesh.visible = false;
    mesh.renderOrder = 4;
    gateLayer.add(mesh);
    pulseRings.push({ mesh, life: 0 });
  }
}

let pulseCursor = 0;

function spawnGatePulse(position, color) {
  // reuse the deadest ring rather than allocating; six is plenty for six gates
  let slot = pulseRings.find((p) => p.life <= 0);
  if (!slot) { slot = pulseRings[pulseCursor]; pulseCursor = (pulseCursor + 1) % PULSE_MAX; }

  slot.life = 1;
  slot.mesh.position.copy(position);
  slot.mesh.material.color.copy(color);
  slot.mesh.visible = true;
}

function updateGatePulses(dt, master) {
  for (const p of pulseRings) {
    if (p.life <= 0) continue;

    p.life -= dt * 1.5;
    if (p.life <= 0) { p.mesh.visible = false; p.life = 0; continue; }

    const t = 1 - p.life;                       // 0 → 1 as it expands
    p.mesh.scale.setScalar(1 + t * 4.2);
    p.mesh.material.opacity = Math.pow(p.life, 1.4) * 0.55 * master;
  }
}

/* ---------------- per-frame gate aura ---------------- */

const _gateTarget = new THREE.Color();

function updateGates(dt, elapsed, master) {
  for (const gate of gates) {
    const occupant = gate.occupant;
    const reserved = gate.reserved;
    const busy = !!occupant;
    const inbound = !!reserved;

    // Each state gets its own light. This is the whole reactive contract:
    // approach → cool build, parked → the flight's own livery breathing,
    // boarding → amber warm-up, empty → a barely-there pilot light.
    // Boarding stays well under 1: the gate aura, the butterfly's halo sprite,
    // its wing highlight and the bloom pass all stack on the same few pixels,
    // and a "warm amber" that saturates to white hides the aircraft entirely.
    let target;
    if (occupant && occupant.state === "boarding") {
      _gateTarget.copy(COLOR.departure);
      target = 0.62;
    } else if (occupant) {
      _gateTarget.copy(occupant.airline.threeColor);
      target = 0.46;
    } else if (reserved && reserved.state === "final") {
      _gateTarget.copy(COLOR.arrival);
      target = 0.80;
    } else if (reserved) {
      _gateTarget.copy(COLOR.arrival);
      target = 0.30;
    } else {
      _gateTarget.copy(COLOR.terminal);
      target = 0.09;
    }

    // Breathe: fast and shallow when a flight is on final, slow and deep when
    // an aircraft is simply resting on the petal.
    const restRate = busy ? 0.9 : inbound ? 3.2 : 1.4;
    const restDepth = busy ? 0.20 : inbound ? 0.28 : 0.16;
    const breath = 1 - restDepth + restDepth * (0.5 + 0.5 * Math.sin(elapsed * restRate + gate.phase));

    gate.aura += (target * breath - gate.aura) * Math.min(1, dt * 2.6);
    gate.flash = Math.max(0, gate.flash - dt * 1.9);
    gate.auraColor.lerp(_gateTarget, Math.min(1, dt * 4));

    const lit = gate.aura + gate.flash * 0.8;

    gate.marker.material.color.copy(gate.auraColor);
    gate.glow.material.color.copy(gate.auraColor);
    gate.marker.material.opacity = (0.12 + lit * 0.38) * master;
    gate.glow.material.opacity = (0.04 + lit * 0.19) * master;
    gate.marker.scale.setScalar(1 + lit * 0.18);

    // a parked flight rests in its own soft, breathing pool of light
    gate.glow.scale.setScalar(0.20 + lit * 0.14);

    gate.label.classList.toggle("occupied", busy);
    gate.label.classList.toggle("inbound", inbound && !busy);
  }
}

/* =================================================================
   10 · ZONE LABELS (projected DOM — crisp type, no texture atlas)
   ================================================================= */

const labelLayer = document.getElementById("labelLayer");

const ZONES = [
  { kind: "terminal",  name: "Terminal Bloom",  note: "Gates G1–G6",     pos: new THREE.Vector3(TERMINAL.x, TERMINAL.y + 0.98, ALT.ground) },
  { kind: "arrival",   name: "Arrival Meadow",  note: "Inbound traffic", pos: new THREE.Vector3(-1.62, -1.66, ALT.ground) },
  { kind: "departure", name: "Departure Trail", note: "Outbound climb",  pos: new THREE.Vector3(1.28, 1.56, ALT.ground) },
  { kind: "holding",   name: "Holding Pattern", note: "Stacked, waiting", pos: new THREE.Vector3(0.68, -1.54, ALT.ground) }
];

function buildZoneLabels() {
  for (const zone of ZONES) {
    const el = document.createElement("div");
    el.className = "zone-label";
    el.dataset.kind = zone.kind;
    el.innerHTML =
      `<span class="zl-name">${zone.name}</span>` +
      `<span class="zl-note">${zone.note}</span>`;
    labelLayer.appendChild(el);
    zone.el = el;
  }
}

const _proj = new THREE.Vector3();

/** Cached label half-widths; invalidated on resize (breakpoints change type size). */
let labelMetricsDirty = true;

function projectLabel(el, worldPos, visible) {
  if (!visible) { el.style.opacity = "0"; return; }

  _proj.copy(worldPos).project(camera);
  if (_proj.z > 1) { el.style.opacity = "0"; return; }

  const vw = canvas.clientWidth;
  const vh = canvas.clientHeight;

  if (labelMetricsDirty || el._halfWidth === undefined) el._halfWidth = el.offsetWidth / 2;

  // Captions name regions, not points, so keep them fully on screen rather than
  // letting a portrait crop slice "Arrival Meadow" in half at the edge.
  const marginX = el._halfWidth + 10;
  const x = clamp((_proj.x * 0.5 + 0.5) * vw, marginX, vw - marginX);
  const y = clamp((-_proj.y * 0.5 + 0.5) * vh, 18, vh - 18);

  el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  el.style.opacity = "1";
}

/**
 * The title card names the metaphor first; the in-world captions take over once
 * it has faded. Revealing both at once stacks three layers of type on the same
 * pixels — the one thing this piece cannot afford.
 */
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const ZONE_REVEAL_AT = REDUCED_MOTION ? 0.2 : 4.2;
const GATE_REVEAL_AT = REDUCED_MOTION ? 0.3 : 4.6;

function updateLabels() {
  for (const zone of ZONES) projectLabel(zone.el, zone.pos, introTime > ZONE_REVEAL_AT);
  for (const gate of gates) projectLabel(gate.label, gate.labelPos, introTime > GATE_REVEAL_AT);
  labelMetricsDirty = false;
}

buildGates();
buildPulseRings();
buildZoneLabels();

/* =================================================================
   11 · AMBIENT MOTES — pollen + fireflies (GPU-driven)
   Slow, weightless drift. This is the "alive" layer that plays
   even when the airport is quiet.
   ================================================================= */

const MOTE_COUNT = 660;
const FIREFLY_SHARE = 0.14;

/**
 * Drift, wrap and twinkle all happen in the vertex shader, so this layer costs
 * one uniform write per frame no matter how many motes there are. The old CPU
 * loop rewrote a 520-element position buffer every frame for the same effect.
 */
const MOTE_VERT = /* glsl */`
  attribute float aSeed;
  attribute float aKind;      // 0 = pollen, 1 = firefly
  attribute vec2  aDrift;

  uniform float uTime;
  uniform float uScale;       // drawing-buffer height * 0.5 (size attenuation)
  uniform float uBoundY;

  varying vec3  vColor;
  varying float vAlpha;

  void main(){
    vec3 p = position;

    // sideways sway is bounded, so only the rise needs wrapping
    p.x += sin(uTime * 0.28 + aSeed * 6.2) * 0.09 + aDrift.x;
    p.y  = mod(p.y + aDrift.y * uTime + uBoundY, 2.0 * uBoundY) - uBoundY;
    p.z += sin(uTime * 0.42 + aSeed * 3.1) * 0.04;

    float firefly = step(0.5, aKind);

    // fireflies blink; pollen simply shimmers
    float s = sin(uTime * (0.9 + aSeed * 0.8) + aSeed * 20.0);
    float blink = pow(max(s, 0.0), 5.0);
    float shimmer = 0.35 + 0.30 * sin(uTime * 0.7 + aSeed * 12.0);

    vAlpha = mix(shimmer, blink, firefly);
    vColor = mix(
      mix(vec3(1.0, 0.85, 0.62), vec3(0.62, 0.90, 1.0), step(0.6, aSeed)),  // pollen
      vec3(0.55, 0.92, 1.0),                                                // firefly
      firefly
    );

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = mix(0.042, 0.075, firefly) * (uScale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const MOTE_FRAG = /* glsl */`
  precision mediump float;

  uniform float uMaster;
  varying vec3  vColor;
  varying float vAlpha;

  void main(){
    // procedural radial falloff — no texture fetch, no atlas
    float d = length(gl_PointCoord - 0.5);
    float a = pow(smoothstep(0.5, 0.0, d), 2.2) * vAlpha * uMaster;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

const motes = (() => {
  const positions = new Float32Array(MOTE_COUNT * 3);
  const seeds = new Float32Array(MOTE_COUNT);
  const kinds = new Float32Array(MOTE_COUNT);
  const drift = new Float32Array(MOTE_COUNT * 2);

  // a share of the field clusters near the flower instead of scattering
  // uniformly — the "tiny golden dust motes near the garden centre" the
  // living-garden brief asks for, reusing this pooled system rather than
  // standing up a second particle system.
  const TERMINAL_MOTE_SHARE = 0.22;
  const terminalCount = Math.round(MOTE_COUNT * TERMINAL_MOTE_SHARE);

  for (let i = 0; i < MOTE_COUNT; i++) {
    const nearTerminal = i < terminalCount;

    if (nearTerminal) {
      const a = rand(0, Math.PI * 2);
      const r = Math.pow(Math.random(), 0.5) * 0.62;   // denser toward the centre
      positions[i * 3 + 0] = TERMINAL.x + Math.cos(a) * r;
      positions[i * 3 + 1] = TERMINAL.y + Math.sin(a) * r;
      positions[i * 3 + 2] = rand(0.30, 0.70);
    } else {
      // keep the sway inside the frame's inner opening
      positions[i * 3 + 0] = rand(-GARDEN.innerX + 0.12, GARDEN.innerX - 0.12);
      positions[i * 3 + 1] = rand(-GARDEN.innerY, GARDEN.innerY);
      positions[i * 3 + 2] = rand(0.32, 1.05);
    }

    // seeds below 0.6 read as the warm/gold pollen colour in MOTE_VERT, so
    // pinning the terminal cluster below that keeps it reliably golden
    seeds[i] = nearTerminal ? rand(0, 0.55) : Math.random();
    kinds[i] = nearTerminal ? 0 : (Math.random() < FIREFLY_SHARE ? 1 : 0);

    drift[i * 2 + 0] = rand(-0.05, 0.05);
    drift[i * 2 + 1] = kinds[i] ? rand(0.004, 0.016) : rand(0.010, 0.048);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geo.setAttribute("aKind", new THREE.BufferAttribute(kinds, 1));
  geo.setAttribute("aDrift", new THREE.BufferAttribute(drift, 2));

  const mat = new THREE.ShaderMaterial({
    vertexShader: MOTE_VERT,
    fragmentShader: MOTE_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uMaster: { value: 0 },
      uScale: { value: 450 },
      uBoundY: { value: GARDEN.innerY }
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  scene.add(points);

  return { points, geo, mat };
})();

function updateMotes(elapsed, master) {
  motes.mat.uniforms.uTime.value = elapsed;
  motes.mat.uniforms.uMaster.value = 0.62 * master;
}

/* =================================================================
   12 · SPARKLE FIELD (pooled)
   Fires on touchdown and on rotation — the little "puff" that sells
   contact with a flower.
   ================================================================= */

const SPARKLE_MAX = 320;

const sparkles = (() => {
  const positions = new Float32Array(SPARKLE_MAX * 3);
  const colors = new Float32Array(SPARKLE_MAX * 3);
  const base = new Float32Array(SPARKLE_MAX * 3);
  const vel = new Float32Array(SPARKLE_MAX * 3);
  const life = new Float32Array(SPARKLE_MAX);
  const maxLife = new Float32Array(SPARKLE_MAX);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    map: GLOW_TEX,
    size: 0.055,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 6;
  scene.add(points);

  let cursor = 0;

  return {
    geo, mat, points, positions, colors, base, vel, life, maxLife,
    next() { const i = cursor; cursor = (cursor + 1) % SPARKLE_MAX; return i; }
  };
})();

function emitSparkles(position, color, count = 14, spread = 0.10, speed = 0.28) {
  for (let n = 0; n < count; n++) {
    const i = sparkles.next();
    const ix = i * 3;

    sparkles.positions[ix + 0] = position.x + rand(-spread, spread);
    sparkles.positions[ix + 1] = position.y + rand(-spread, spread);
    sparkles.positions[ix + 2] = position.z + rand(-0.02, 0.06);

    const a = rand(0, Math.PI * 2);
    const s = rand(0.25, 1) * speed;
    sparkles.vel[ix + 0] = Math.cos(a) * s;
    sparkles.vel[ix + 1] = Math.sin(a) * s + 0.12;
    sparkles.vel[ix + 2] = rand(0.02, 0.14);

    sparkles.base[ix + 0] = color.r;
    sparkles.base[ix + 1] = color.g;
    sparkles.base[ix + 2] = color.b;

    sparkles.maxLife[i] = rand(0.5, 1.1);
    sparkles.life[i] = sparkles.maxLife[i];
  }
}

function updateSparkles(dt, master) {
  const { positions, colors, base, vel, life, maxLife } = sparkles;

  for (let i = 0; i < SPARKLE_MAX; i++) {
    if (life[i] <= 0) continue;
    const ix = i * 3;

    life[i] -= dt;
    if (life[i] <= 0) {
      colors[ix] = colors[ix + 1] = colors[ix + 2] = 0;  // additive black = gone
      continue;
    }

    positions[ix + 0] += vel[ix + 0] * dt;
    positions[ix + 1] += vel[ix + 1] * dt;
    positions[ix + 2] += vel[ix + 2] * dt;

    vel[ix + 0] *= 0.94;
    vel[ix + 1] *= 0.94;
    vel[ix + 2] *= 0.94;

    const k = (life[i] / maxLife[i]) ** 1.6 * master;
    colors[ix + 0] = base[ix + 0] * k;
    colors[ix + 1] = base[ix + 1] * k;
    colors[ix + 2] = base[ix + 2] * k;
  }

  sparkles.geo.attributes.position.needsUpdate = true;
  sparkles.geo.attributes.color.needsUpdate = true;
}

/* =================================================================
   13 · TRAIL RIBBON
   A tapered, additive ribbon of recent positions. Because the
   blending is additive, fading the vertex colour to black *is*
   fading to transparent — no per-vertex alpha needed.
   ================================================================= */

const TRAIL_POINTS = 52;

/**
 * Trail palettes. The head is always the brighter, cooler end — that is the
 * cue that tells you which way a flight is travelling without reading a label.
 */
const TRAIL_STYLE = {
  inbound:  { head: "#5ad2ff", tail: "#1030c8", width: 1.00, gain: 0.90 },
  final:    { head: "#7ee0ff", tail: "#1642dc", width: 0.90, gain: 0.90 },
  holding:  { head: "#8fc8ff", tail: "#2a4f9e", width: 0.62, gain: 0.46 },
  boarding: { head: "#ffd79a", tail: "#e07a20", width: 0.70, gain: 0.50 },
  climb:    { head: "#6cc4ff", tail: "#ff9d38", width: 1.00, gain: 1.00 },
  gone:     { head: "#6cc4ff", tail: "#ff9d38", width: 1.00, gain: 1.00 }
};

/**
 * A luminous silk ribbon. Three vertices per sample — a bright core flanked by
 * two dark edges — so additive blending produces a soft-shouldered band of
 * light rather than the flat strip a two-vertex ribbon gives you.
 */
class TrailRibbon {
  constructor() {
    this.points = [];
    this.baseWidth = 0.014;
    this.widthScale = 1;
    this.gain = 1;
    this.intensity = 0;

    this.head = new THREE.Color("#d3f4ff");
    this.tail = new THREE.Color("#1746e0");
    this._c = new THREE.Color();

    const verts = TRAIL_POINTS * 3;
    this.positions = new Float32Array(verts * 3);
    this.colors = new Float32Array(verts * 3);

    // two quads per segment: left→core and core→right
    const indices = new Uint16Array((TRAIL_POINTS - 1) * 12);
    for (let i = 0; i < TRAIL_POINTS - 1; i++) {
      const a = i * 3;
      const b = a + 3;
      indices.set([
        a, a + 1, b,     a + 1, b + 1, b,        // left half
        a + 1, a + 2, b + 1, a + 2, b + 2, b + 1 // right half
      ], i * 12);
    }

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.geo.setIndex(new THREE.BufferAttribute(indices, 1));

    this.mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
    scene.add(this.mesh);

    this._perp = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  /** Re-tint the ribbon for a flight state, blending the livery into the tail. */
  setStyle(state, liveryColor) {
    const s = TRAIL_STYLE[state];
    if (!s) return;

    this.head.set(s.head);
    this.tail.set(s.tail).lerp(liveryColor, 0.30);
    this.widthScale = s.width;
    this.gain = s.gain;
  }

  /** `emit` false lets an idle (parked) trail drain away gracefully. */
  update(position, emit, master) {
    const pts = this.points;

    if (emit) {
      if (!pts.length || pts[0].distanceToSquared(position) > 0.0004) {
        pts.unshift(position.clone());
      } else {
        pts[0].copy(position);
      }
      while (pts.length > TRAIL_POINTS) pts.pop();
      this.intensity = Math.min(1, this.intensity + 0.05);
    } else {
      if (pts.length) pts.pop();
      this.intensity = Math.max(0, this.intensity - 0.03);
    }

    if (pts.length < 3 || this.intensity <= 0.001) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;

    const n = pts.length;
    const width = this.baseWidth * this.widthScale;

    for (let i = 0; i < TRAIL_POINTS; i++) {
      const j = Math.min(i, n - 1);
      const p = pts[j];                    // collapse the unused tail
      const prev = pts[Math.max(0, j - 1)];
      const next = pts[Math.min(j + 1, n - 1)];

      this._dir.subVectors(next, prev);
      if (this._dir.lengthSq() < 1e-8) this._dir.set(1, 0, 0);
      this._perp.set(-this._dir.y, this._dir.x, 0).normalize();

      const life = i / (TRAIL_POINTS - 1);

      // taper: narrow at the butterfly, swelling just behind it, gone at the tail
      const w = width * Math.pow(1 - life, 0.70) * (i === 0 ? 0.45 : 1);
      const fade = Math.pow(1 - life, 1.85) * this.intensity * this.gain * 0.84 * master;

      // turn blue fast: the near-white head must be a glint, not the whole ribbon
      this._c.copy(this.head).lerp(this.tail, Math.pow(life, 0.40));

      const ix = i * 9;
      // left edge · bright core · right edge
      this.positions[ix + 0] = p.x + this._perp.x * w;
      this.positions[ix + 1] = p.y + this._perp.y * w;
      this.positions[ix + 2] = p.z;
      this.positions[ix + 3] = p.x;
      this.positions[ix + 4] = p.y;
      this.positions[ix + 5] = p.z;
      this.positions[ix + 6] = p.x - this._perp.x * w;
      this.positions[ix + 7] = p.y - this._perp.y * w;
      this.positions[ix + 8] = p.z;

      const edge = fade * 0.10;
      const core = fade;

      this.colors[ix + 0] = this._c.r * edge;
      this.colors[ix + 1] = this._c.g * edge;
      this.colors[ix + 2] = this._c.b * edge;
      this.colors[ix + 3] = this._c.r * core;
      this.colors[ix + 4] = this._c.g * core;
      this.colors[ix + 5] = this._c.b * core;
      this.colors[ix + 6] = this._c.r * edge;
      this.colors[ix + 7] = this._c.g * edge;
      this.colors[ix + 8] = this._c.b * edge;
    }

    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  dispose() {
    scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
    this.points.length = 0;
  }
}

/* =================================================================
   14 · FLIGHT MODEL
   ================================================================= */

let flightSeq = 0;

/** `airlineCode` pins the carrier — a parked aircraft keeps its livery when it
 *  turns around into a departure, so the flight number must match it too. */
function makeFlight(kind, airportCode, airlineCode) {
  const code = airlineCode ?? pick(AIRLINE_CODES);
  const spec = AIRLINES[code];
  const airport = AIRPORTS[airportCode];
  const other = pick(airport.routes);

  flightSeq++;

  const number = randInt(spec.range[0], spec.range[1]);

  return {
    airline: {
      code,
      name: spec.name,
      color: spec.color,
      threeColor: new THREE.Color(spec.color)
    },
    number,
    id: `${code} ${number}`,
    kind,                                     // "arrival" | "departure"
    origin: kind === "arrival" ? other : airportCode,
    destination: kind === "arrival" ? airportCode : other,
    uid: flightSeq
  };
}

const routeText = (f) => `${f.origin} → ${f.destination}`;
const routeLong = (f) => `${CITIES[f.origin] ?? f.origin} → ${CITIES[f.destination] ?? f.destination}`;

/* =================================================================
   15 · BUTTERFLY — a flight with wings
   States: inbound → (holding) → final → parked → boarding → climb → gone
   ================================================================= */

const butterflies = [];

class Butterfly {
  constructor(flight, gate, opts = {}) {
    this.flight = flight;
    this.airline = flight.airline;
    this.gate = gate;

    this.position = new THREE.Vector3();
    this.heading = 0;
    this.bank = 0;
    this.speed = 0;
    this.dead = false;
    this.opacity = 0;
    this.highlight = 0;

    // personality — small variances so no two flights read identically
    this.flutter = rand(0.85, 1.25);
    this.wanderSeed = rand(0, Math.PI * 2);
    this.wanderAmp = rand(0.012, 0.030);
    this.lane = rand(-0.09, 0.09);   // lateral offset so shared corridors spread

    // wing character: a unique speckle field, and how much livery shows through
    this.seed = Math.random();
    this.tint = rand(0.28, 0.46);
    this._styledState = null;

    this.curve = null;
    this.curveLen = 1;
    this.u = 0;

    this.holdAngle = 0;
    this.holdTimer = 0;
    this.dwellTimer = 0;
    this.boardTimer = 0;
    this.dustTimer = rand(0, 0.15);

    this._tangent = new THREE.Vector3(1, 0, 0);
    this._prevAngle = 0;
    this._tmp = new THREE.Vector3();

    this.buildMesh();
    this.trail = new TrailRibbon();

    if (opts.spawnParked) this.enterParked(true);
    else if (flight.kind === "arrival") this.enterInbound(opts.forceHold);
    else this.enterBoarding();
  }

  /* ---------------- construction ---------------- */

  buildMesh() {
    const color = this.airline.threeColor;

    this.mesh = new THREE.Group();
    this.mesh.rotation.order = "ZYX";   // heading → bank → pitch
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);

    // wings: two half-planes sharing a centreline, each on its own pivot
    this.leftPivot = new THREE.Group();
    this.rightPivot = new THREE.Group();
    this.mesh.add(this.leftPivot, this.rightPivot);

    this.leftMat = makeWingMaterial(-1, color, this.seed, this.tint);
    this.rightMat = makeWingMaterial(1, color, this.seed, this.tint);

    this.leftWing = new THREE.Mesh(SHARED.wingGeo, this.leftMat);
    this.rightWing = new THREE.Mesh(SHARED.wingGeo, this.rightMat);
    this.leftWing.renderOrder = 10;
    this.rightWing.renderOrder = 10;
    this.leftPivot.add(this.leftWing);
    this.rightPivot.add(this.rightWing);

    // The body must fade with the wings, so it owns its own material rather
    // than sharing one — otherwise a dark speck pops in before the flight does.
    // Deep navy, not black: against luminous glass wings a neutral-dark body
    // reads as a hole punched through the butterfly.
    this.bodyMat = new THREE.MeshBasicMaterial({
      color: 0x1b2a4d,
      transparent: true,
      opacity: 1,
      depthWrite: false
    });

    // body sits just in front of the wings so it always reads
    const body = new THREE.Mesh(SHARED.bodyGeo, this.bodyMat);
    body.position.z = 0.012;
    body.renderOrder = 11;

    const head = new THREE.Mesh(SHARED.headGeo, this.bodyMat);
    head.position.set(0, 0.052, 0.013);
    head.renderOrder = 11;

    this.mesh.add(body, head);

    for (const side of [-1, 1]) {
      const antenna = new THREE.Mesh(SHARED.antennaGeo, this.bodyMat);
      antenna.position.set(side * 0.008, 0.060, 0.013);
      antenna.rotation.z = -side * 0.5;
      antenna.renderOrder = 11;

      const tip = new THREE.Mesh(SHARED.tipGeo, this.bodyMat);
      tip.position.y = 0.05;
      antenna.add(tip);

      this.mesh.add(antenna);
    }

    // soft airline-coloured halo
    this.glowMat = new THREE.SpriteMaterial({
      map: GLOW_TEX,
      color: color.clone(),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.glow = new THREE.Sprite(this.glowMat);
    this.glow.scale.setScalar(0.42);
    this.glow.position.z = -0.01;
    this.glow.renderOrder = 9;
    this.mesh.add(this.glow);

    // warm golden core glow at the thorax — the "magic" that reads even when
    // the butterfly is small on screen, layered in front of the airline halo
    this.coreGlowMat = new THREE.SpriteMaterial({
      map: GLOW_TEX,
      color: new THREE.Color(0xffd27a),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.coreGlow = new THREE.Sprite(this.coreGlowMat);
    this.coreGlow.scale.setScalar(0.15);
    this.coreGlow.position.z = 0.015;
    this.coreGlow.renderOrder = 12;
    this.mesh.add(this.coreGlow);

    // invisible, generously sized hit target for hover / tap
    this.pickMat = new THREE.SpriteMaterial({ opacity: 0, transparent: true, depthWrite: false });
    this.pick = new THREE.Sprite(this.pickMat);
    this.pick.scale.setScalar(0.26);
    this.pick.userData.butterfly = this;
    this.mesh.add(this.pick);
  }

  /* ---------------- state entry ---------------- */

  setCurve(curve) {
    this.curve = curve;
    this.curveLen = Math.max(0.001, curve.getLength());
    this.u = 0;
  }

  /** Ride one of the four drawn arrival corridors down to the ring. */
  enterInbound(forceHold) {
    this.state = "inbound";

    const corridor = pick(ARRIVAL_CORRIDORS);
    this.willHold = forceHold ?? Math.random() < 0.35;
    this.holdAngle = corridor.angle;
    this.holdTimer = rand(7, 15);

    this.setCurve(corridor.curve);

    this.curve.getPointAt(0, this.position);
    this.mesh.position.copy(this.position);
    this.opacity = 0;
  }

  /** Ring → gate: a descending, tightening arc onto the petal. */
  approachCurve(from, entryAngle) {
    const outward = new THREE.Vector3(
      Math.cos(this.gate.angle),
      Math.sin(this.gate.angle),
      0
    ).multiplyScalar(0.42);

    // Lead with the flight's *current* heading, not the ring's tangent, so the
    // join is C1-continuous. Otherwise the turn onto final is a hard elbow and
    // the trail creases visibly behind it.
    const lead = new THREE.Vector3(this._tangent.x, this._tangent.y, 0);
    if (lead.lengthSq() < 1e-8) lead.set(-Math.sin(entryAngle), Math.cos(entryAngle), 0);
    lead.normalize().multiplyScalar(0.5);

    const c1 = from.clone().add(lead);
    const c2 = ringPoint(entryAngle + 0.25, HOLD_RADIUS * 0.45, lerp(ALT.cruise, ALT.ground, 0.7));

    return new THREE.CubicBezierCurve3(
      from.clone(),
      c1,
      c2.add(outward),
      this.gate.position.clone()
    );
  }

  enterHolding() {
    this.state = "holding";
    this.holdAngle = Math.atan2(
      this.position.y - TERMINAL.y,
      this.position.x - TERMINAL.x
    );
    this.holdRadius = HOLD_RADIUS + rand(-0.05, 0.14);
  }

  enterFinal() {
    this.state = "final";
    this.setCurve(this.approachCurve(this.position.clone(), this.holdAngle));
  }

  enterParked(instant = false) {
    this.state = "parked";
    this.gate.reserved = null;
    this.gate.occupant = this;
    this.flight.kind = "arrival";

    this.position.copy(this.gate.position);
    this.mesh.position.copy(this.position);
    this.speed = 0;
    this.dwellTimer = rand(11, 22) / sim.intensity;

    if (instant) {
      this.opacity = 1;
      this.heading = this.gate.angle + Math.PI / 2;
    } else {
      // touchdown: the flower blooms brighter for a moment
      gateEvent(this.gate, "land");
    }
  }

  /** A parked flight becomes a departure: new flight number, new route. */
  enterBoarding() {
    this.state = "boarding";
    this.gate.occupant = this;
    this.gate.reserved = null;

    // Same aircraft, same livery — so the same carrier, and a flight number
    // drawn from that carrier's range rather than a random one.
    this.flight = makeFlight("departure", sim.code, this.airline.code);

    this.position.copy(this.gate.position);
    this.mesh.position.copy(this.position);
    this.boardTimer = rand(2.4, 3.8);
    this.opacity = Math.max(this.opacity, 0.001);
  }

  enterClimb() {
    this.state = "climb";

    // rotation: the gate releases a pulse of light as the stand frees up
    gateEvent(this.gate, "takeoff");
    this.gate.occupant = null;
    this.gate = null;

    const corridor = pick(DEPARTURE_CORRIDORS);
    const exitAngle = corridor.angle;

    // Climb-out spoke: gate → the ring, gaining altitude the whole way.
    const c1 = this.position.clone().add(new THREE.Vector3(
      Math.cos(exitAngle) * 0.5,
      Math.sin(exitAngle) * 0.5,
      0.16
    ));
    const c2 = ringPoint(exitAngle - 0.30, HOLD_RADIUS * 0.70, lerp(ALT.ground, ALT.cruise, 0.75));

    const spoke = new THREE.CubicBezierCurve3(
      this.position.clone(), c1, c2, ringPoint(exitAngle)
    );

    // Then hand off to the drawn departure trail and ride it out of frame.
    const path = new THREE.CurvePath();
    path.add(spoke);
    path.add(corridor.curve);
    this.setCurve(path);
  }

  enterGone() {
    this.state = "gone";
    this.releaseGate();
  }

  releaseGate() {
    if (!this.gate) return;
    if (this.gate.occupant === this) this.gate.occupant = null;
    if (this.gate.reserved === this) this.gate.reserved = null;
    this.gate = null;
  }

  /* ---------------- per-frame ---------------- */

  update(dt, elapsed, master) {
    // One place owns the trail palette: whenever the flight changes state the
    // ribbon re-tints, so an arrival's cool silk warms to amber on climb-out.
    if (this._styledState !== this.state) {
      this.trail.setStyle(this.state, this.airline.threeColor);
      this._styledState = this.state;
    }

    switch (this.state) {
      case "inbound":  this.updateInbound(dt); break;
      case "holding":  this.updateHolding(dt); break;
      case "final":    this.updateFinal(dt); break;
      case "parked":   this.updateParked(dt); break;
      case "boarding": this.updateBoarding(dt); break;
      case "climb":    this.updateClimb(dt); break;
      case "gone":     this.updateGone(dt); break;
    }

    this.applyBreeze(dt, elapsed);
    this.applyPose(dt);
    this.applyWings(dt, elapsed);
    this.applyMaterials(elapsed, master);

    const moving = this.speed > 0.05;
    this.trail.update(this.position, moving && this.opacity > 0.2, master);

    // golden fairy dust, sprinkled sparingly along the flight path — skipped
    // under reduced motion, which keeps the glow but drops the extra particles
    if (!REDUCED_MOTION && moving && this.opacity > 0.3) {
      this.dustTimer -= dt;
      if (this.dustTimer <= 0) {
        this.dustTimer = rand(0.10, 0.18);
        emitSparkles(this.position, FAIRY_DUST_COLOR, 2, 0.05, 0.10);
      }
    }
  }

  /** Advance along the active curve; returns true when the curve ends. */
  advance(dt, speed) {
    this.speed = speed;
    this.u = Math.min(1, this.u + (speed * dt) / this.curveLen);

    this.curve.getPointAt(this.u, this.position);
    this.curve.getTangentAt(Math.min(0.999, this.u), this._tangent);

    // Flights share four corridors; nudge each one sideways, most at mid-path,
    // so they read as a stream of individual aircraft rather than a queue.
    const spread = Math.sin(Math.PI * this.u) * this.lane;
    this.position.x -= this._tangent.y * spread;
    this.position.y += this._tangent.x * spread;

    return this.u >= 1;
  }

  updateInbound(dt) {
    // Fade against path progress, not wall time: corridors differ in length,
    // and a flight must be fully solid by the time it reaches the stack.
    this.opacity = clamp(this.u / 0.20, 0, 1);

    // decelerate down the corridor — arrivals *arrive*
    const speed = lerp(1.20, 0.78, easeInOutSine(this.u));

    if (this.advance(dt, speed)) {
      if (this.willHold) this.enterHolding();
      else this.enterFinal();
    }
  }

  updateHolding(dt) {
    this.opacity = Math.min(1, this.opacity + dt * 1.1);
    this.holdTimer -= dt;

    const angularSpeed = 0.72 / this.holdRadius;
    this.holdAngle += angularSpeed * dt;

    this.position.set(
      TERMINAL.x + Math.cos(this.holdAngle) * this.holdRadius,
      TERMINAL.y + Math.sin(this.holdAngle) * this.holdRadius,
      ALT.cruise + Math.sin(this.holdAngle * 3) * 0.03
    );

    this._tangent.set(-Math.sin(this.holdAngle), Math.cos(this.holdAngle), 0);
    this.speed = 0.72;

    // only leave the stack once the gate is genuinely ours
    if (this.holdTimer <= 0 && this.gate && this.gate.reserved === this) {
      this.enterFinal();
    }
  }

  updateFinal(dt) {
    const speed = lerp(0.72, 0.14, easeOutCubic(this.u));
    if (this.advance(dt, speed)) this.enterParked();
  }

  updateParked(dt) {
    this.speed = 0;
    this.dwellTimer -= dt;
    this.position.copy(this.gate.position);
    if (this.dwellTimer <= 0) this.enterBoarding();
  }

  updateBoarding(dt) {
    this.speed = 0;
    this.opacity = Math.min(1, this.opacity + dt * 1.1);
    this.boardTimer -= dt;

    // brighten toward the moment of release, then let go
    const t = 1 - clamp(this.boardTimer / 3.0, 0, 1);
    this.highlight = Math.sin(t * Math.PI) * 0.55 + easeInCubic(t) * 0.35;

    this.position.copy(this.gate.position);
    if (this.boardTimer <= 0) this.enterClimb();
  }

  updateClimb(dt) {
    this.highlight = Math.max(0, this.highlight - dt * 0.9);

    // dissolve into the edge of the garden rather than crossing the frame
    this.opacity = Math.min(1, (1 - this.u) / 0.16);

    const speed = lerp(0.22, 1.55, easeInCubic(this.u));
    if (this.advance(dt, speed)) this.enterGone();
  }

  updateGone(dt) {
    this.opacity -= dt * 2.5;
    this.speed = Math.max(0, this.speed - dt * 0.4);
    this._tmp.copy(this._tangent).multiplyScalar(this.speed * dt);
    this.position.add(this._tmp);

    if (this.opacity <= 0) this.dead = true;
  }

  /** Weightless drift, applied on top of the flight path. */
  applyBreeze(dt, elapsed) {
    if (this.state === "parked") return;
    const amp = this.state === "boarding" ? this.wanderAmp * 0.3 : this.wanderAmp;
    this.position.x += Math.sin(elapsed * 1.4 + this.wanderSeed) * amp * dt;
    this.position.y += Math.cos(elapsed * 1.1 + this.wanderSeed * 1.7) * amp * dt;
  }

  /** Heading from the tangent, bank from the rate of turn. */
  applyPose(dt) {
    const grounded = this.state === "parked" || this.state === "boarding";

    if (!grounded) {
      const angle = Math.atan2(this._tangent.y, this._tangent.x);
      const turn = angleDelta(this._prevAngle, angle);
      this._prevAngle = angle;

      // shortest-path heading interpolation, so it never spins the long way
      this.heading += angleDelta(this.heading, angle) * Math.min(1, dt * 7);

      const targetBank = clamp((turn / Math.max(dt, 1e-4)) * 0.30, -0.85, 0.85);
      this.bank += (targetBank - this.bank) * Math.min(1, dt * 3.5);
    } else {
      const rest = this.gate ? this.gate.angle + Math.PI / 2 : this.heading;
      this.heading += angleDelta(this.heading, rest) * Math.min(1, dt * 2);
      this.bank += (0 - this.bank) * Math.min(1, dt * 3);
    }

    this.mesh.position.copy(this.position);

    // altitude reads as scale: higher flights sit smaller against the garden
    const altitude = clamp((this.position.z - ALT.ground) / (ALT.cruise - ALT.ground), 0, 1);
    this.mesh.scale.setScalar(1 - altitude * 0.22);

    this.mesh.rotation.z = this.heading - Math.PI / 2;
    this.mesh.rotation.y = this.bank;
    this.mesh.rotation.x = grounded ? -0.26 : -0.30 + Math.abs(this.bank) * 0.12;
  }

  applyWings(dt, elapsed) {
    let rate, amplitude;

    if (this.state === "parked") {
      rate = 1.7 * this.flutter;
      amplitude = 0.30;
    } else if (this.state === "boarding") {
      rate = 3.2 * this.flutter;
      amplitude = 0.40;
    } else {
      rate = (7.0 + this.speed * 4.5) * this.flutter;
      amplitude = 0.62 + Math.min(this.speed, 1.2) * 0.28;
    }

    this.flapPhase = (this.flapPhase ?? rand(0, 6.28)) + rate * dt;

    // sharpen the stroke: fast down, slow up — that's what reads as "alive"
    const raw = Math.sin(this.flapPhase);
    const shaped = Math.sign(raw) * Math.pow(Math.abs(raw), 0.62);
    const angle = shaped * amplitude;

    this.leftPivot.rotation.y = angle;
    this.rightPivot.rotation.y = -angle;
  }

  applyMaterials(elapsed, master) {
    const o = clamp(this.opacity, 0, 1) * master;

    this.leftMat.uniforms.uTime.value = elapsed;
    this.rightMat.uniforms.uTime.value = elapsed;
    this.leftMat.uniforms.uOpacity.value = o;
    this.rightMat.uniforms.uOpacity.value = o;
    this.leftMat.uniforms.uHighlight.value = this.highlight;
    this.rightMat.uniforms.uHighlight.value = this.highlight;

    this.bodyMat.opacity = o;

    const selected = this === pinned || this === hovered;
    const base = this.state === "boarding" ? 0.24 + this.highlight * 0.30 : 0.16;
    this.glowMat.opacity = (base + (selected ? 0.30 : 0)) * o;
    this.glow.scale.setScalar(0.42 + this.highlight * 0.16 + (selected ? 0.14 : 0));

    this.glowMat.color.copy(this.airline.threeColor);
    if (this.highlight > 0.01) {
      this.glowMat.color.lerp(COLOR.departure, this.highlight * 0.6);
    }

    // warm core glow: a slow, per-flight breath so a field of parked
    // butterflies never pulses in lockstep
    const breathe = 0.82 + 0.18 * Math.sin(elapsed * 2.4 + this.seed * 12.0);
    this.coreGlowMat.opacity = (0.55 + this.highlight * 0.25) * breathe * o;
    this.coreGlow.scale.setScalar(0.14 + this.highlight * 0.05);
  }

  /* ---------------- teardown ---------------- */

  dispose() {
    this.releaseGate();
    scene.remove(this.mesh);

    this.leftMat.dispose();
    this.rightMat.dispose();
    this.bodyMat.dispose();
    this.glowMat.dispose();
    this.coreGlowMat.dispose();
    this.pickMat.dispose();
    this.trail.dispose();

    this.mesh.clear();
  }

  /* ---------------- readouts ---------------- */

  get statusLabel() { return STATUS_LABEL[this.state] ?? "—"; }
  get zoneLabel() { return ZONE_LABEL[this.state] ?? "—"; }

  get gateLabel() {
    if (this.gate) return this.gate.id;
    if (this.state === "climb" || this.state === "gone") return "Released";
    return "—";
  }

  get altitudeLabel() {
    if (this.state === "parked" || this.state === "boarding") return "On stand";
    const t = clamp((this.position.z - ALT.ground) / (ALT.cruise - ALT.ground), 0, 1);
    return `${(Math.round(t * ALT.ceiling / 500) * 500).toLocaleString()} ft`;
  }
}

/* =================================================================
   16 · SIMULATION
   Gate-driven: a flight only launches an approach when a stand is
   reserved for it, so the metaphor never contradicts itself.
   ================================================================= */

const sim = {
  code: "BLR",
  intensity: 1,
  maxInAir: 8,
  arrivalTimer: 0
};

const inAirCount = () =>
  butterflies.filter((b) => b.state === "inbound" || b.state === "holding" || b.state === "final").length;

/**
 * `forceHold` must stay undefined when unspecified — Butterfly#enterInbound
 * falls back to a random 35% hold via `??`, and a `= false` default would
 * swallow that, so no organic arrival would ever enter the stack.
 */
function spawnArrival(forceHold) {
  const free = freeGates();
  if (!free.length || inAirCount() >= sim.maxInAir) return null;

  const gate = pick(free);
  const flight = makeFlight("arrival", sim.code);
  const b = new Butterfly(flight, gate, { forceHold });

  gate.reserved = b;
  butterflies.push(b);
  return b;
}

function spawnParked(gate) {
  const flight = makeFlight("arrival", sim.code);
  const b = new Butterfly(flight, gate, { spawnParked: true });
  butterflies.push(b);
  return b;
}

function nextArrivalDelay() {
  return rand(2.2, 4.6) / sim.intensity;
}

function updateSimulation(dt) {
  sim.arrivalTimer -= dt;
  if (sim.arrivalTimer <= 0) {
    spawnArrival();
    sim.arrivalTimer = nextArrivalDelay();
  }

  // reverse iteration: safe removal while stepping the array
  for (let i = butterflies.length - 1; i >= 0; i--) {
    const b = butterflies[i];
    b.update(dt, elapsed, master);

    if (b.dead) {
      if (b === hovered) setHovered(null);
      if (b === pinned) setPinned(null);
      b.dispose();
      butterflies.splice(i, 1);
    }
  }
}

/** Drop a flight straight into a climb-out, already partway up its trail. */
function seedDeparture() {
  const free = freeGates();
  if (!free.length) return;

  const b = new Butterfly(makeFlight("arrival", sim.code), pick(free), { spawnParked: true });
  butterflies.push(b);

  b.enterBoarding();
  b.enterClimb();
  b.u = 0.30;
  b.opacity = 1;
  b.curve.getPointAt(b.u, b.position);
  b.mesh.position.copy(b.position);
}

function seedAirport(code) {
  sim.code = code;
  sim.intensity = AIRPORTS[code].intensity;
  sim.maxInAir = 4 + Math.round(sim.intensity * 4);
  sim.arrivalTimer = 1.4;

  // occupy roughly half the gates so the terminal never looks abandoned
  const seedGates = [...gates].sort(() => Math.random() - 0.5).slice(0, Math.ceil(GATE_COUNT * 0.5));
  const parked = seedGates.map(spawnParked);

  // The whole metaphor — arrive, hold, park, board, depart — has to be legible
  // in the first three seconds, so every state is on screen from frame one.
  parked[0].dwellTimer = rand(1.8, 3.0);   // will start boarding almost at once
  seedDeparture();
  spawnArrival(true);                      // one already in the stack
  spawnArrival(false);
}

function clearAirport() {
  for (const b of butterflies) b.dispose();
  butterflies.length = 0;

  for (const gate of gates) {
    gate.occupant = null;
    gate.reserved = null;
  }

  setHovered(null);
  setPinned(null);
}

/* =================================================================
   17 · UI — glass dashboard
   ================================================================= */

const ui = {
  select: document.getElementById("airportSelect"),
  towerTitle: document.getElementById("towerTitle"),
  towerSub: document.getElementById("towerSub"),

  arrivals: document.getElementById("statArrivals"),
  departures: document.getElementById("statDepartures"),
  parked: document.getElementById("statParked"),
  active: document.getElementById("statActive"),

  airlineKey: document.getElementById("airlineKey"),

  detailEmpty: document.getElementById("detailEmpty"),
  detailBody: document.getElementById("detailBody"),
  unpinBtn: document.getElementById("unpinBtn"),
  dSwatch: document.getElementById("dSwatch"),
  dFlight: document.getElementById("dFlight"),
  dAirline: document.getElementById("dAirline"),
  dStatus: document.getElementById("dStatus"),
  dRoute: document.getElementById("dRoute"),
  dGate: document.getElementById("dGate"),
  dZone: document.getElementById("dZone"),
  dAlt: document.getElementById("dAlt"),

  tooltip: document.getElementById("tooltip"),
  veil: document.getElementById("veil")
};

/* --- airport selector --- */
for (const [code, meta] of Object.entries(AIRPORTS)) {
  const option = document.createElement("option");
  option.value = code;
  option.textContent = `${CITIES[code]} · ${code}`;
  option.title = meta.full;
  ui.select.appendChild(option);
}

/* --- airline legend: fixed roster, counts fade in and out --- */
const airlineRows = new Map();

(function buildAirlineKey() {
  for (const code of AIRLINE_CODES) {
    const spec = AIRLINES[code];

    const li = document.createElement("li");
    li.className = "idle";
    li.innerHTML =
      `<span class="ak-left">` +
      `<span class="dot" style="background:${spec.color};color:${spec.color}"></span>` +
      `<span class="ak-name">${spec.name}</span></span>` +
      `<span class="ak-count">0</span>`;

    ui.airlineKey.appendChild(li);
    airlineRows.set(code, { li, count: li.querySelector(".ak-count") });
  }
})();

/* --- counters are derived from live state every tick, never incremented --- */
let hudTimer = 0;

function updateHUD(dt) {
  hudTimer -= dt;
  if (hudTimer > 0) return;
  hudTimer = 0.2;

  let arrivals = 0, departures = 0, parked = 0;
  const perAirline = new Map();

  for (const b of butterflies) {
    if (b.state === "inbound" || b.state === "holding" || b.state === "final") arrivals++;
    else if (b.state === "boarding" || b.state === "climb") departures++;
    else if (b.state === "parked") parked++;

    perAirline.set(b.airline.code, (perAirline.get(b.airline.code) ?? 0) + 1);
  }

  ui.arrivals.textContent = arrivals;
  ui.departures.textContent = departures;
  ui.parked.textContent = `${parked}/${GATE_COUNT}`;
  ui.active.textContent = butterflies.length;

  for (const [code, row] of airlineRows) {
    const n = perAirline.get(code) ?? 0;
    row.count.textContent = n;
    row.li.classList.toggle("idle", n === 0);
  }

  if (pinned) renderDetail(pinned);
  else if (hovered) renderDetail(hovered);

  // a hovered flight can change state mid-hover — keep the tooltip honest
  if (hovered) writeTooltip(hovered);
}

/* --- detail panel --- */

function renderDetail(b) {
  ui.detailEmpty.hidden = true;
  ui.detailBody.hidden = false;
  ui.unpinBtn.hidden = b !== pinned;

  ui.dSwatch.style.background = b.airline.color;
  ui.dSwatch.style.color = b.airline.color;

  ui.dFlight.textContent = b.flight.id;
  ui.dAirline.textContent = `${b.airline.name} · ${routeLong(b.flight)}`;

  ui.dStatus.textContent = b.statusLabel;
  ui.dStatus.dataset.state = b.state;

  ui.dRoute.textContent = routeText(b.flight);
  ui.dGate.textContent = b.gateLabel;
  ui.dZone.textContent = b.zoneLabel;
  ui.dAlt.textContent = b.altitudeLabel;
}

function clearDetail() {
  ui.detailEmpty.hidden = false;
  ui.detailBody.hidden = true;
  ui.unpinBtn.hidden = true;
}

/* --- hover / pick --- */

let hovered = null;
let pinned = null;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

/** e.g. "AI 204 · Arriving · Gate G3" */
function writeTooltip(b) {
  ui.tooltip.innerHTML =
    `<span class="tt-accent">${b.flight.id}</span> · ${b.statusLabel}` +
    (b.gate ? ` · Gate ${b.gate.id}` : "");
}

function setHovered(b) {
  hovered = b;

  if (b) {
    writeTooltip(b);
    ui.tooltip.classList.add("visible");
    if (!pinned) renderDetail(b);
  } else {
    ui.tooltip.classList.remove("visible");
    if (!pinned) clearDetail();
  }

  canvas.style.cursor = b ? "pointer" : "default";
}

function setPinned(b) {
  pinned = b;
  if (b) renderDetail(b);
  else if (hovered) renderDetail(hovered);
  else clearDetail();
}

function pickAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  pointer.x = (x / rect.width) * 2 - 1;
  pointer.y = -(y / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const targets = butterflies.filter((b) => b.opacity > 0.25).map((b) => b.pick);
  const hits = raycaster.intersectObjects(targets, false);
  return hits.length ? hits[0].object.userData.butterfly : null;
}

canvas.addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse") setParallaxTarget(e.clientX, e.clientY);

  ui.tooltip.style.transform =
    `translate(-50%, -160%) translate(${e.clientX}px, ${e.clientY}px)`;

  const hit = pickAt(e.clientX, e.clientY);
  if (hit !== hovered) setHovered(hit);
});

canvas.addEventListener("pointerleave", () => setHovered(null));

canvas.addEventListener("pointerdown", (e) => {
  const hit = pickAt(e.clientX, e.clientY);
  setPinned(hit && hit === pinned ? null : hit);

  // on touch there is no hover, so drive the tooltip from the tap
  if (e.pointerType !== "mouse") {
    ui.tooltip.style.transform =
      `translate(-50%, -160%) translate(${e.clientX}px, ${e.clientY}px)`;
    setHovered(hit);
  }
});

ui.unpinBtn.addEventListener("click", () => setPinned(null));

/* --- airport switching --- */

function loadAirport(code) {
  const meta = AIRPORTS[code];
  ui.towerTitle.textContent = meta.tower;
  ui.towerSub.textContent = `Live Traffic · ${meta.full}`;

  clearAirport();
  seedAirport(code);
  hudTimer = 0;
}

ui.select.addEventListener("change", (e) => {
  const code = e.target.value;

  // a breath of darkness, then the new field of traffic
  ui.veil.classList.add("switching");
  ui.veil.classList.remove("lifted");

  setTimeout(() => {
    loadAirport(code);
    ui.veil.classList.remove("switching");
    ui.veil.classList.add("lifted");
  }, 300);
});

/* =================================================================
   18 · CINEMATIC INTRO
   ================================================================= */

let master = 0;              // global 0→1 reveal, multiplies every opacity
let introStarted = false;
let introTime = 0;
let introStartedAt = 0;
let cameraStart = 0;
let cameraEnd = 0;

function beginIntro() {
  if (introStarted) return;
  introStarted = true;
  introStartedAt = performance.now();
  requestAnimationFrame(() => ui.veil.classList.add("lifted"));
}

/**
 * The intro runs on wall-clock time, deliberately *not* on the simulation's
 * clamped dt. The veil and title card are CSS animations; if the reveal rode
 * the sim clock it would drift out of step with them on any machine that
 * renders below 24fps — the card would finish explaining the metaphor long
 * before the captions that replace it ever appeared.
 */
function updateIntro() {
  if (!introStarted) return;

  introTime = (performance.now() - introStartedAt) / 1000;
  master = easeOutCubic(clamp((introTime - 0.35) / 2.0, 0, 1));

  // slow dolly-in: the garden settles into frame rather than snapping
  const t = easeOutCubic(clamp(introTime / 2.6, 0, 1));
  camera.position.z = lerp(cameraStart, cameraEnd, t);
}

/* =================================================================
   18b · PARALLAX DEPTH
   The layers already sit at different z — garden 0, routes and motes
   mid-air, butterflies up to cruise. Translating the camera by a
   hair's breadth turns that separation into real parallax without
   touching the framing (the offset is ~1% of the focus box).
   ================================================================= */

const PARALLAX_X = REDUCED_MOTION ? 0 : 0.062;
const PARALLAX_Y = REDUCED_MOTION ? 0 : 0.046;

const parallax = { x: 0, y: 0, tx: 0, ty: 0, hasPointer: false };

function setParallaxTarget(clientX, clientY) {
  parallax.hasPointer = true;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  parallax.tx = (x / rect.width - 0.5) * 2;
  parallax.ty = (y / rect.height - 0.5) * 2;
}

function updateParallax(dt, elapsed) {
  // No pointer, no motion: the frame must never drift on its own, only ever
  // respond to a real hover/touch target.
  if (!parallax.hasPointer) {
    parallax.tx = 0;
    parallax.ty = 0;
  }

  const k = Math.min(1, dt * 2.2);
  parallax.x += (parallax.tx - parallax.x) * k;
  parallax.y += (parallax.ty - parallax.y) * k;

  camera.position.x = parallax.x * PARALLAX_X;
  camera.position.y = -parallax.y * PARALLAX_Y;
}

/* =================================================================
   19 · RESIZE — frames the garden on any aspect ratio
   ================================================================= */

/**
 * Frame the *garden*, not the plane.
 *
 * Most of garden.png is black margin around the white shadow box. Fitting the
 * whole plane wastes the viewport — badly so on a phone. Instead we contain a
 * focus box drawn around the artwork and let the dead margin crop off-screen;
 * since the margin is black and so is the clear colour, the seam is invisible.
 *
 * On portrait the box tightens to the frame's inner opening, so the foliage
 * bleeds to the screen edges instead of floating in a sea of black.
 */
function fitCamera() {
  const focusWidth = GARDEN.width;
  const focusHeight = GARDEN.height;

  const fovY = THREE.MathUtils.degToRad(camera.fov);
  const distForHeight = (focusHeight / 2) / Math.tan(fovY / 2);

  const fovX = 2 * Math.atan(Math.tan(fovY / 2) * camera.aspect);
  const distForWidth = (focusWidth / 2) / Math.tan(fovX / 2);

  cameraEnd = Math.max(distForHeight, distForWidth);
  cameraStart = cameraEnd * 1.28;

  if (!introStarted || introTime > 2.6) camera.position.z = cameraEnd;
}

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  // Disable resolution cap for 100% native quality
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(w, h, false);
  if (composer) composer.setSize(w, h);

  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  fitCamera();

  // point size attenuation matches three's own: drawing-buffer height / 2
  motes.mat.uniforms.uScale.value = renderer.getDrawingBufferSize(_bufferSize).y * 0.5;

  if (livingGarden) {
    livingGarden.material.uniforms.uSharpenAmount.value =
      canvas.clientWidth < 720 ? GARDEN_VIDEO.sharpenMobile : GARDEN_VIDEO.sharpenDesktop;
  }

  labelMetricsDirty = true;   // type size changes across breakpoints
}

const _bufferSize = new THREE.Vector2();

window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 120));
if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);

resize();

/* =================================================================
   20 · MAIN LOOP
   ================================================================= */

const clock = new THREE.Clock();
let elapsed = 0;

function render() {
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), MAX_DT);
  elapsed += dt;

  updateIntro();
  updateParallax(dt, elapsed);
  updateSimulation(dt);

  // Gate auras must settle before the garden samples them, or the foliage
  // lights one frame behind the ring markers sitting on top of it.
  updateGates(dt, elapsed, master);
  updateGatePulses(dt, master);

  const activity = clamp(butterflies.length / 14, 0, 1);
  livingGarden?.update(elapsed, master, activity);

  updateMotes(elapsed, master);
  updateSparkles(dt, master);
  updateLabels();

  for (const p of routePulses) p.update(dt, master);
  for (const r of runwayLights) r.update(elapsed, master);
  for (const line of routeLines) line.material.opacity = master;
  for (const ring of holdingRings) {
    ring.rotation.z += ring.userData.spin * dt;
    ring.material.opacity = master * 0.9;
  }

  updateHUD(dt);
  render();
}

/* =================================================================
   21 · BOOT
   ================================================================= */

ui.select.value = "BLR";
loadAirport("BLR");
clearDetail();

initPostProcessing();
animate();

// If the texture is slow (or blocked by file:// CORS), still reveal the piece.
setTimeout(beginIntro, 2500);
