// Ridge Runner — Alpine Courier: tuning constants for the whole game.
// One place for every number a designer would want to change.
export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;

export const PLANE = {
  // Speeds in metres per second; altitudes in metres; angles in radians.
  minSpeed: 24, // below this the wing stops flying and the plane sinks
  maxSpeed: 82, // flat out, throttle full, nose level
  cruiseSpeed: 52, // the speed the throttle aims for at full power, level
  climbRate: 9, // m/s gained at full power, nose up
  sinkRate: 7, // m/s lost gliding with the throttle shut
  rollRate: 1.9, // rad/s of bank for a full stick deflection
  maxBank: 1.25, // rad of bank; turning follows the bank
  pitchRate: 0.85, // rad/s of pitch for a full stick deflection
  maxPitchUp: 0.42,
  maxPitchDown: -0.5,
  turnAuthority: 0.9, // how much of the bank becomes a turn
  takeoffSpeed: 30, // rolling on the runway above this, the plane lifts
  landingSpeedMax: 46, // faster than this on touchdown and the gear folds
};

export const WORLD = {
  seed: 20261126,
  // The valley runs north (positive z). The airfield sits near z = 1500.
  valleyHalfWidth: 300, // the flat valley floor, |x| below this stays low
  ridgeHeight: 140, // the mountains either side of the valley
  hillHeight: 34, // rolling hills on the valley floor
  riverX: -95, // the river winds around this x
  runway: { x: 40, z0: 1380, z1: 1820, width: 26, heading: 0 },
  rings: 8, // rings to fly through before the runway opens
  timeLimit: 360, // seconds for the whole course
};

// The course: rings weave north from the airfield, climbing gently, and the
// last ring lines the plane up for a southbound landing on the same runway.
// Rings sit ~300 m apart with gentle weaves, so a 130 m turn radius can
// line each one up; a tighter course would be unmissable only on paper.
export const COURSE = [
  { x: -40, y: 70, z: 2050 },
  { x: 60, y: 90, z: 2350 },
  { x: -60, y: 110, z: 2650 },
  { x: 50, y: 125, z: 2950 },
  { x: -50, y: 120, z: 3250 },
  { x: 60, y: 140, z: 3550 },
  { x: -20, y: 115, z: 3850 },
  { x: 40, y: 80, z: 4100 },
];
export const RING_RADIUS = 17;

export const SHOTS = { startSeconds: 5, playSeconds: 26, endLimitSeconds: 600 };
