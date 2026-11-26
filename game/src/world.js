// Ridge Runner — Alpine Courier: the valley, the course and the flight model.
// Terrain is a heightfield over (x, z): rolling hills on a flat valley floor,
// mountain ridges either side, a river winding down the west side, a road,
// and a flattened strip where the runway sits. The plane flies the ring course
// and then lands on that runway.

import { COURSE, PLANE, RING_RADIUS, STEP, WORLD } from './config.js';
import { makeNoise2D, mulberry32 } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CRASHED = 'crashed';
export const SCREEN_LANDED = 'landed';
export const SCREEN_TIMEOUT = 'timeout';

export const EVENT_NONE = 0;
export const EVENT_RING = 1;
export const EVENT_OVER = 2;
export const EVENT_LANDED = 4;

const groundNoise = makeNoise2D(WORLD.seed);
const fieldNoise = makeNoise2D(WORLD.seed + 101);

/** The river's centreline x at a given z (a slow sine wander). */
export function riverCentre(z) {
  return WORLD.riverX + Math.sin(z * 0.0016) * 38 + Math.sin(z * 0.00043 + 2.1) * 22;
}

/** Height of the ground at (x, z), in metres. */
export function terrainHeight(x, z) {
  const rw = WORLD.runway;
  // The runway strip and its apron are graded flat.
  if (x > rw.x - rw.width / 2 - 40 && x < rw.x + rw.width / 2 + 40 && z > rw.z0 - 60 && z < rw.z1 + 60) {
    return 0;
  }
  const ax = Math.abs(x);
  const valley = Math.max(0, (ax - WORLD.valleyHalfWidth) / 160);
  // Capped: the quadratic would otherwise grow to 1.5 km peaks at the
  // edges of the drawn grid, and those project as giant white sails across
  // the sides of the frame. 220 m still towers over the valley floor.
  const ridge = Math.min(valley * valley * WORLD.ridgeHeight, 220);
  const hills = groundNoise.fbm(x * 0.006, z * 0.006) * WORLD.hillHeight;
  const detail = groundNoise.noise(x * 0.03, z * 0.03) * 2.2;
  // The river carves a channel where it runs.
  const riverDip = Math.max(0, 1 - Math.abs(x - riverCentre(z)) / 26) * -7;
  // A gentle rise as the valley climbs north toward the airfield.
  const climb = Math.max(0, z - 900) * 0.008;
  let height = Math.max(-6, ridge + hills + detail + riverDip + climb);
  // The approach corridor on the runway centreline is graded nearly flat, so
  // a landing approach never has to thread between hilltops.
  const corridor = z > 1250 && z < 2950 ? Math.max(0, 1 - Math.abs(x - rw.x) / 110) : 0;
  height *= 1 - corridor * 0.9;
  return height;
}

/** Which field patch (for the patchwork colouring) covers (x, z). */
export function fieldPatch(x, z) {
  const n = fieldNoise.fbm(x * 0.012 + 40, z * 0.012 + 9);
  if (n < -0.45) return 0; // meadow
  if (n < -0.05) return 1; // wheat
  if (n < 0.3) return 2; // pasture
  if (n < 0.55) return 3; // ploughed
  return 4; // orchard
}

/** Is (x, z) on the river? */
export function isRiver(x, z) {
  return Math.abs(x - riverCentre(z)) < 7 && terrainHeight(x, z) < 1.5;
}

/** Is (x, z) on the valley road? The road runs down the east side. */
export function isRoad(x, z) {
  const roadX = 150 + Math.sin(z * 0.0011 + 0.7) * 30;
  return Math.abs(x - roadX) < 4.5;
}

/** Is (x, z) on the runway asphalt? */
export function isRunway(x, z) {
  const rw = WORLD.runway;
  return x > rw.x - rw.width / 2 && x < rw.x + rw.width / 2 && z > rw.z0 && z < rw.z1;
}

// The graded strip beside the runway: a bush plane can put down on the
// grass, so a touchdown counts anywhere on the strip, not just the paving.
export function isLandable(x, z) {
  const rw = WORLD.runway;
  return x > rw.x - 40 && x < rw.x + 40 && z > rw.z0 - 40 && z < rw.z1 + 40;
}

function ringAt(index) {
  const c = COURSE[index % COURSE.length];
  return { x: c.x, y: c.y, z: c.z, radius: RING_RADIUS };
}

/** A fresh game state. */
export function freshState() {
  const rw = WORLD.runway;
  return {
    screen: SCREEN_TITLE,
    time: 0,
    timeLeft: WORLD.timeLimit,
    score: 0,
    best: 0,
    ringsHit: 0,
    ringIndex: 0,
    finalApproach: false, // latched once the plane reaches the landing base point
    rings: COURSE.map((_, i) => ringAt(i)),
    message: '',
    messageUntil: 0,
    warn: '',
    plane: {
      x: rw.x, y: 0, z: rw.z0 + 40, // parked on the runway, strip ahead
      heading: 0, pitch: 0, roll: 0,
      speed: 0, throttle: 0, onGround: true, gearDown: true,
    },
    started: false,
    landed: false,
    crashReason: '',
    flash: 0,
  };
}

export class World {
  constructor() {
    this.state = freshState();
    this.rand = mulberry32(WORLD.seed + 7);
  }

  reset() {
    this.state = freshState();
  }

  get nextRing() {
    return this.state.rings[this.state.ringIndex] ?? null;
  }

  /** Start the flight: throttle up on the runway. */
  start() {
    const s = this.state;
    if (s.screen !== SCREEN_TITLE) return;
    s.screen = SCREEN_PLAY;
    s.started = true;
    s.plane.throttle = 0.85;
    s.message = 'FULL THROTTLE — ROTATE AT 110 KT';
    s.messageUntil = s.time + 4;
  }

  /** One physics step. `input` is { pitch, roll, throttle, brake }. */
  step(dt, input) {
    const s = this.state;
    const p = s.plane;
    if (s.screen !== SCREEN_PLAY) return EVENT_NONE;
    s.time += dt;
    s.timeLeft -= dt;
    if (s.timeLeft <= 0) {
      s.timeLeft = 0;
      s.screen = SCREEN_TIMEOUT;
      s.crashReason = 'Out of time — the mail is late.';
      return EVENT_OVER;
    }

    // --- controls ---
    const targetThrottle = input.throttle == null ? p.throttle : input.throttle;
    p.throttle += (targetThrottle - p.throttle) * Math.min(1, dt * 2.2);
    const rollTarget = (input.roll ?? 0) * PLANE.maxBank;
    p.roll += (rollTarget - p.roll) * Math.min(1, dt * 3.2);
    const pitchTarget = (input.pitch ?? 0) * (input.pitch > 0 ? PLANE.maxPitchUp : -PLANE.maxPitchDown);
    p.pitch += (pitchTarget - p.pitch) * Math.min(1, dt * 2.6);

    // --- speed: throttle pushes, drag and climb pull back ---
    const levelSpeed = PLANE.minSpeed + p.throttle * (PLANE.cruiseSpeed - PLANE.minSpeed);
    const climbPenalty = Math.max(0, Math.sin(p.pitch)) * 26;
    const targetSpeed = Math.max(PLANE.minSpeed, levelSpeed - climbPenalty);
    p.speed += (targetSpeed - p.speed) * Math.min(1, dt * (p.speed < targetSpeed ? 0.55 : 0.9));
    if (p.onGround) p.speed = Math.min(p.speed, PLANE.maxSpeed);

    // --- turning follows the bank; pitch changes altitude ---
    const turnRate = Math.sin(p.roll) * PLANE.turnAuthority * (p.speed / PLANE.cruiseSpeed);
    p.heading += turnRate * dt;
    const verticalSpeed = Math.sin(p.pitch) * p.speed * 0.9
      - (p.speed < PLANE.minSpeed + 6 ? PLANE.sinkRate * (1 - p.speed / (PLANE.minSpeed + 6)) : 0);
    const forward = { x: Math.sin(p.heading), z: Math.cos(p.heading) };
    p.x += forward.x * p.speed * Math.cos(p.pitch) * dt;
    p.z += forward.z * p.speed * Math.cos(p.pitch) * dt;
    p.y += verticalSpeed * dt;

    // --- ground ---
    const ground = terrainHeight(p.x, p.z);
    const rw = WORLD.runway;
    const overRunway = isRunway(p.x, p.z);
    if (p.onGround) {
      p.y = ground;
      if (p.speed > PLANE.takeoffSpeed && p.pitch > 0.05) {
        p.onGround = false;
        s.message = 'AIRBORNE — GEAR UP';
        s.messageUntil = s.time + 2.5;
      }
      // Rolling resistance at idle: the plane coasts to a stop instead of
      // taxiing forever at flight speed. (Takeoff roll keeps full throttle,
      // so this never blocks getting airborne.)
      if (p.throttle < 0.25) p.speed = Math.max(0, p.speed - 6 * dt);
      if (input.brake) p.speed = Math.max(0, p.speed - 26 * dt);
    } else if (p.y <= ground + 0.4) {
      // Climbing away from a dip: skim, don't crash or land.
      if (verticalSpeed > 0.5) {
        p.y = ground + 0.5;
      } else {
        // Aligned with the runway axis in either direction (it is usable both
        // ways: northbound after takeoff, southbound for the landing).
        const wrapped = ((p.heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        const offAxis = Math.min(Math.abs(wrapped), Math.PI - Math.abs(wrapped));
        if (isLandable(p.x, p.z) && offAxis < 0.35 && p.speed < PLANE.landingSpeedMax && verticalSpeed > -6) {
        // Touchdown: roll out on the runway.
        p.onGround = true;
        p.y = ground;
        p.pitch = 0;
        p.roll = 0;
        p.speed = Math.max(0, p.speed - 14 * dt);
        if (s.ringsHit >= WORLD.rings && !s.landed) {
          s.landed = true;
          const timeBonus = Math.round(s.timeLeft) * 2;
          s.score += timeBonus;
          s.screen = SCREEN_LANDED;
          return EVENT_LANDED;
        }
      } else {
        s.screen = SCREEN_CRASHED;
        s.crashReason = p.speed < PLANE.minSpeed + 4
          ? 'Stalled into the hillside — keep the speed up.'
          : 'Flew into the terrain — watch the ridge line.';
        return EVENT_OVER;
      }
      }
    }

    // --- warnings ---
    const clearance = p.y - ground;
    s.warn = '';
    if (!p.onGround && clearance < 22 && verticalSpeed < -1) s.warn = 'PULL UP';
    else if (!p.onGround && p.speed < PLANE.minSpeed + 5) s.warn = 'STALL — NOSE DOWN';

    // --- rings ---
    const ring = this.nextRing;
    if (ring) {
      const dx = p.x - ring.x;
      const dy = p.y - ring.y;
      const dz = p.z - ring.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < ring.radius) {
        s.ringsHit += 1;
        s.score += 100;
        s.ringIndex += 1;
        s.flash = 0.35;
        if (s.ringsHit >= WORLD.rings) {
          s.message = 'ALL RINGS — LAND ON THE RUNWAY';
          s.messageUntil = s.time + 5;
        } else {
          s.message = `RING ${s.ringsHit}/${WORLD.rings}  +100`;
          s.messageUntil = s.time + 2;
        }
        return EVENT_RING;
      }
      // A ring missed far behind is simply left behind; the next one counts.
      if (p.z > ring.z + 60) {
        s.ringIndex += 1;
        s.message = `MISSED RING ${s.ringsHit + 1} — NEXT ONE`;
        s.messageUntil = s.time + 2;
      }
    }
    if (s.flash > 0) s.flash -= dt;
    return EVENT_NONE;
  }
}

/**
 * The autopilot the staged screenshots use: it flies the real rules, aiming for
 * the next ring, then lines up on the runway and lands. It returns the input
 * for one step, given the world.
 */
export function autopilotInput(world) {
  const s = world.state;
  const p = s.plane;
  let target;
  let wantThrottle = 0.8;
  if (s.ringIndex < WORLD.rings) {
    const ring = world.nextRing;
    target = { x: ring.x, y: ring.y, z: ring.z };
  } else {
    // Landing pattern, southbound down the runway. First fly to a point on
    // the centreline 800 m north of the threshold at 100 m — the valley
    // hills punish a low, off-centre approach — then come down the final
    // glide, which only descends once the plane is on the centreline.
    const rw = WORLD.runway;
    const base = { x: rw.x, z: rw.z1 + 800 };
    const distToBase = Math.hypot(p.x - base.x, p.z - base.z);
    const distToRunway = Math.hypot(p.x - rw.x, p.z - (rw.z1 - 40));
    // Latch the final approach: once the plane reaches the base point it
    // commits to the runway, instead of flip-flopping back to the base
    // every time it drifts 160 m away again.
    if (distToBase < 160) s.finalApproach = true;
    if (!s.finalApproach) {
      target = { x: base.x, y: 100, z: base.z };
      wantThrottle = 0.6;
    } else {
      // Final: line up and glide down the centreline. Once the plane is
      // past the threshold, low and aligned, stop aiming at the threshold
      // point — aiming at a point behind the plane would turn it around —
      // and aim down the runway instead, so it touches down and rolls out.
      const aligned = Math.abs(p.x - rw.x) < 60;
      const pastThreshold = p.z < rw.z1 - 20;
      if (aligned && pastThreshold && p.y < 50) {
        // Flare: aim at a point that always stays ahead of the plane down
        // the runway, never at a fixed spot it can fly past and turn back
        // for. A gentle descent — the touchdown check only forgives a
        // sink rate under 6 m/s.
        target = { x: rw.x, y: 0, z: p.z - 120 };
        wantThrottle = 0.1;
      } else {
        let glide = Math.max(8, Math.min(70, distToRunway * 0.12));
        if (!aligned || distToRunway > 500) glide = Math.max(glide, 70);
        target = { x: rw.x, y: glide, z: rw.z1 - 40 };
        wantThrottle = distToRunway > 500 ? 0.5 : 0.3;
      }
    }
  }
  const dx = target.x - p.x;
  const dz = target.z - p.z;
  const dy = target.y - p.y;
  const desiredHeading = Math.atan2(dx, dz);
  let headingError = desiredHeading - p.heading;
  while (headingError > Math.PI) headingError -= Math.PI * 2;
  while (headingError < -Math.PI) headingError += Math.PI * 2;
  const dist = Math.hypot(dx, dz);
  // Close in, aim precisely and gently: a ring is only 17 m across, so the
  // last 300 m are flown straight at its centre with small banks.
  const closeIn = dist < 320;
  const bankCap = closeIn ? 0.7 : 1.0;
  const desiredBank = Math.max(-bankCap, Math.min(bankCap, headingError * 1.4));
  const roll = Math.max(-1, Math.min(1, (desiredBank - p.roll) * 4.0));
  const desiredPitch = Math.max(-0.32, Math.min(0.34, Math.atan2(dy, Math.max(40, dist)) * 1.1));
  let pitch = Math.max(-1, Math.min(1, (desiredPitch - p.pitch) * (closeIn ? 3.2 : 2.4)));
  // Climb out after takeoff and whenever the ground is close, but only while
  // far from the next ring: close in, the ring itself is the target, and the
  // climb would carry the plane over it. The climb floor follows the ring's
  // own altitude, so a low ring never strands the plane above it.
  const clearance = p.y - terrainHeight(p.x, p.z);
  const ring = s.ringIndex < WORLD.rings ? world.nextRing : null;
  if (!p.onGround && ring && dist > 320) {
    const climbFloor = Math.max(55, ring.y + 15);
    if (p.y < climbFloor || clearance < 30) {
      pitch = Math.max(pitch, 0.8);
      wantThrottle = 0.96;
    }
  }
  if (p.onGround) {
    // On the runway: keep the nose up gently once fast, steer straight
    // toward the target heading (positive roll banks toward it).
    return { pitch: p.speed > PLANE.takeoffSpeed ? 0.5 : 0.12, roll: Math.max(-0.4, Math.min(0.4, headingError * 2)), throttle: 0.95, brake: false };
  }
  return { pitch, roll, throttle: wantThrottle, brake: false };
}
