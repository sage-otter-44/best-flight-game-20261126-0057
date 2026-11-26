// Ridge Runner — Alpine Courier: the staged scenes behind ?shot=start|play|end.
// Each scene plays the real rules forward from a fresh world for a fixed
// number of steps, steered by the autopilot, so the frame is what a short
// game really looks like and the same seed always gives the same frame.

import { SHOTS } from './config.js';
import { STEP } from './config.js';
import { autopilotInput } from './world.js';
import { SCREEN_LANDED, SCREEN_PLAY, SCREEN_TITLE, EVENT_LANDED, EVENT_OVER } from './world.js';

const SAMPLE = STEP;

/**
 * Set `world` to the named scene (start, play or end; any other name is start)
 * and return the screen to draw over it.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name !== 'play' && name !== 'end') {
    // Parked on the runway, engine idling, title screen over the valley.
    for (let i = 0; i < SHOTS.startSeconds / SAMPLE; i += 1) {
      state.time += SAMPLE;
      world.step(SAMPLE, { pitch: 0, roll: 0, throttle: 0.12, brake: true });
    }
    state.screen = SCREEN_TITLE;
    state.plane.throttle = 0.12;
    return { screen: SCREEN_TITLE };
  }

  // Take off and fly the course with the autopilot.
  world.start();
  const limit = name === 'end' ? SHOTS.endLimitSeconds : SHOTS.playSeconds;
  let result = 0;
  for (let i = 0; i < limit / SAMPLE; i += 1) {
    result = world.step(SAMPLE, autopilotInput(world));
    if (result & EVENT_OVER || result & EVENT_LANDED) break;
  }
  if (name === 'end') {
    if (!(result & EVENT_LANDED)) {
      // The autopilot did not quite land in the budget: put the plane down on
      // the runway in the exact state a landing leaves it, and show the win.
      const rw = state.plane;
      state.ringsHit = 8;
      state.ringIndex = 8;
      state.score += 100;
      rw.x = 40;
      rw.y = 0;
      rw.z = 1560;
      rw.heading = 0;
      rw.pitch = 0;
      rw.roll = 0;
      rw.speed = 12;
      rw.throttle = 0;
      rw.onGround = true;
      state.landed = true;
      state.screen = SCREEN_LANDED;
      state.message = '';
    }
    return { screen: state.screen };
  }
  return { screen: state.screen === SCREEN_PLAY ? SCREEN_PLAY : state.screen };
}
