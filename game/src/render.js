// Ridge Runner — Alpine Courier: everything the player sees.
// A canvas 2D chase camera over the heightfield valley: sky, sun, ridges,
// projected terrain with fields, river, road and runway, glowing ring gates,
// clouds, the bush plane drawn from behind, and a full glass HUD with an
// artificial horizon, speed and altitude tapes and a heading compass.

import { COURSE, RING_RADIUS, VIEW, WORLD } from './config.js';
import { fieldPatch, isRiver, isRoad, isRunway, riverCentre, terrainHeight } from './world.js';
import { makeNoise2D, mulberry32 } from './random.js';

const { width: W, height: H } = VIEW;
const FOCAL = (H / 2) / Math.tan((68 * Math.PI) / 360); // ~68 degree vertical field
const skyNoise = makeNoise2D(WORLD.seed + 55);

// Clouds placed once, in world space, so they never jump between frames.
const CLOUDS = (() => {
  const rand = mulberry32(WORLD.seed + 313);
  const list = [];
  for (let i = 0; i < 16; i += 1) {
    list.push({
      x: (rand() - 0.5) * 1400,
      y: 190 + rand() * 110,
      z: 120 + rand() * 1800,
      s: 60 + rand() * 110,
    });
  }
  return list;
})();

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function mixColor(c1, c2, t) {
  return [lerp(c1[0], c2[0], t) | 0, lerp(c1[1], c2[1], t) | 0, lerp(c1[2], c2[2], t) | 0];
}
function css(c, a = 1) {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

// Terrain palette (RGB).
const PALETTE = {
  meadow: [96, 154, 72],
  wheat: [198, 168, 92],
  pasture: [126, 178, 92],
  ploughed: [122, 88, 58],
  orchard: [62, 118, 66],
  rock: [128, 124, 116],
  snow: [238, 240, 244],
  river: [64, 132, 188],
  road: [92, 92, 96],
  runway: [52, 54, 58],
  sand: [196, 178, 128],
};
const HAZE = [178, 198, 220];

function groundColor(x, z, h) {
  if (isRiver(x, z)) return PALETTE.river;
  if (isRoad(x, z)) return PALETTE.road;
  if (isRunway(x, z)) return PALETTE.runway;
  if (h > 150) return PALETTE.snow;
  if (h > 92) return mixColor(PALETTE.rock, PALETTE.snow, (h - 92) / 58);
  if (h > 70) return mixColor(PALETTE.meadow, PALETTE.rock, (h - 70) / 22);
  const patch = fieldPatch(x, z);
  const base = [PALETTE.meadow, PALETTE.wheat, PALETTE.pasture, PALETTE.ploughed, PALETTE.orchard][patch];
  const shade = 0.92 + 0.16 * ((Math.sin(x * 0.11 + z * 0.13) + 1) / 2);
  return [base[0] * shade | 0, base[1] * shade | 0, base[2] * shade | 0];
}

/** Camera: chase view behind the plane, looking along its heading. */
function cameraFor(state) {
  const p = state.plane;
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const back = p.onGround ? 11 : 15;
  const up = p.onGround ? 3.2 : 4.6;
  return {
    x: p.x - fx * back,
    y: Math.max(p.y + up, terrainHeight(p.x - fx * back, p.z - fz * back) + 2.2),
    z: p.z - fz * back,
    yaw: p.heading,
    pitch: p.pitch * 0.55 + 0.015,
    roll: p.roll * 0.55,
  };
}

/** Project a world point to screen space; null when behind the camera. */
function makeProjector(cam) {
  const cosY = Math.cos(cam.yaw);
  const sinY = Math.sin(cam.yaw);
  const cosP = Math.cos(cam.pitch);
  const sinP = Math.sin(cam.pitch);
  const cosR = Math.cos(cam.roll);
  const sinR = Math.sin(cam.roll);
  return function project(x, y, z) {
    const dx = x - cam.x;
    const dy = y - cam.y;
    const dz = z - cam.z;
    // Yaw: forward is (sin yaw, 0, cos yaw); right is (cos yaw, 0, -sin yaw).
    const cx = dx * cosY - dz * sinY;
    let cy = dy;
    let cz = dx * sinY + dz * cosY;
    // Pitch about the right axis.
    const cy2 = cy * cosP - cz * sinP;
    const cz2 = cy * sinP + cz * cosP;
    cy = cy2;
    cz = cz2;
    // Roll about the forward axis.
    const cx2 = cx * cosR - cy * sinR;
    const cy3 = cx * sinR + cy * cosR;
    if (cz < 1.5) return null;
    return { x: W / 2 + (cx2 * FOCAL) / cz, y: H / 2 - (cy3 * FOCAL) / cz, d: cz };
  };
}

function drawSky(ctx, cam) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2f6fc4');
  g.addColorStop(0.45, '#7fb2e2');
  g.addColorStop(0.62, '#cfe3f2');
  g.addColorStop(1, '#dcebf5');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Sun, fixed in the west-northwest so it lights the valley in the play shot.
  const sunAz = -2.1;
  const sunDir = { x: Math.sin(sunAz), z: Math.cos(sunAz) };
  const ahead = sunDir.x * Math.sin(cam.yaw) + sunDir.z * Math.cos(cam.yaw);
  if (ahead > 0.05) {
    const sx = W / 2 + (sunDir.x * Math.cos(cam.yaw) - sunDir.z * Math.sin(cam.yaw)) * FOCAL * 1.6;
    const sy = H * 0.2 - Math.tan(cam.pitch) * FOCAL;
    if (sx > -80 && sx < W + 80 && sy > -80 && sy < H * 0.7) {
      const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 130);
      glow.addColorStop(0, 'rgba(255,244,200,0.95)');
      glow.addColorStop(0.25, 'rgba(255,236,170,0.55)');
      glow.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 140, sy - 140, 280, 280);
      ctx.fillStyle = '#fff7d6';
      ctx.beginPath();
      ctx.arc(sx, sy, 26, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Two far ridge silhouettes, hung on the horizon line so they track pitch/roll.
  // Each is a band, not a slab: its base sits just below the horizon, so the
  // terrain — drawn over it — owns everything below.
  const horizonY = H / 2 - Math.tan(cam.pitch) * FOCAL;
  const rollSlope = Math.tan(cam.roll);
  for (let layer = 0; layer < 2; layer += 1) {
    const base = horizonY + (layer === 0 ? 34 : 66);
    const amp = layer === 0 ? 42 : 26;
    const col = layer === 0 ? [122, 148, 178] : [96, 124, 158];
    ctx.fillStyle = css(col, layer === 0 ? 0.85 : 0.95);
    ctx.beginPath();
    ctx.moveTo(-4, base + 130);
    for (let sx = -4; sx <= W + 4; sx += 16) {
      const n = skyNoise.fbm(sx * 0.004 + layer * 31.7, layer * 7.7);
      const y = base + n * amp + (sx - W / 2) * rollSlope;
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(W + 4, base + 130);
    ctx.closePath();
    ctx.fill();
  }
}

function drawTerrain(ctx, project) {
  const COLS = 26;
  // Depth rows: dense near the camera so the ground fills the bottom of the
  // frame, then stretching out to ~720 m at the horizon.
  const depths = [4, 7, 11, 16, 23, 32, 44, 60, 80, 106, 138, 178, 228, 290, 366, 460, 576, 720];
  const ROWS = depths.length;
  // Build the grid of projected vertices, far row first.
  const grid = [];
  for (let r = 0; r < ROWS; r += 1) {
    const depth = depths[r];
    // The spread is capped: beyond ~380 m the grid would climb the ridge
    // walls, and snow-white quads up there project as giant pale sails
    // across the sides of the frame. The valley walls still show — they are
    // the near and mid rows — but the far row stays on the valley floor.
    const spread = Math.min(depth * 0.78 + 22, 380);
    const row = [];
    for (let c = 0; c <= COLS; c += 1) {
      const lateral = -spread + (2 * spread * c) / COLS;
      // Recover world x/z from camera-relative forward/lateral (heading 0 frame
      // is rotated by the projector, so invert here with the camera yaw).
      row.push({ depth, lateral });
    }
    grid.push(row);
  }
  // Project in camera space: lateral -> x, depth -> z relative to the camera.
  // We project via a local frame: point = cam + forward*depth + right*lateral.
  const cam = project.cam;
  const fx = Math.sin(cam.yaw);
  const fz = Math.cos(cam.yaw);
  const rx = Math.cos(cam.yaw);
  const rz = -Math.sin(cam.yaw);
  for (let r = ROWS - 1; r >= 0; r -= 1) {
    const depth = depths[r];
    for (let c = 0; c < COLS; c += 1) {
      const a = grid[r][c];
      const b = grid[r][c + 1];
      const a2 = r + 1 < ROWS ? grid[r + 1][c] : null;
      const b2 = r + 1 < ROWS ? grid[r + 1][c + 1] : null;
      const quad = [];
      const pts = a2 ? [a, b, b2, a2] : [a, b];
      let ok = true;
      let cx = 0;
      let cz = 0;
      let ch = 0;
      for (const pt of pts) {
        const wx = cam.x + fx * pt.depth + rx * pt.lateral;
        const wz = cam.z + fz * pt.depth + rz * pt.lateral;
        const wy = terrainHeight(wx, wz);
        const s = project(wx, wy, wz);
        if (!s) { ok = false; break; }
        quad.push(s);
        cx += wx;
        cz += wz;
        ch += wy;
      }
      if (!ok) continue;
      const n = pts.length;
      const mx = cx / n;
      const mz = cz / n;
      const mh = ch / n;
      let col = groundColor(mx, mz, mh);
      // Runway paint: centreline dashes and threshold bars.
      if (isRunway(mx, mz)) {
        const rw = WORLD.runway;
        const along = mz - rw.z0;
        if (Math.abs(mx - rw.x) < 1.4 && Math.floor(along / 18) % 2 === 0) col = [235, 235, 230];
        else if ((along < 26 || along > rw.z1 - rw.z0 - 26) && Math.abs(mx - rw.x) < 9) col = [225, 225, 220];
        else if (Math.abs(Math.abs(mx - rw.x) - 11) < 1) col = [220, 220, 215];
      }
      // Distance haze.
      const haze = clamp((depth - 180) / 620, 0, 0.4);
      col = mixColor(col, HAZE, haze);
      ctx.fillStyle = css(col);
      ctx.beginPath();
      ctx.moveTo(quad[0].x, quad[0].y);
      for (let i = 1; i < quad.length; i += 1) ctx.lineTo(quad[i].x, quad[i].y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawClouds(ctx, project) {
  for (const cloud of CLOUDS) {
    const s = project(cloud.x, cloud.y, cloud.z);
    if (!s || s.x < -200 || s.x > W + 200 || s.y < -120 || s.y > H * 0.75) continue;
    const scale = (FOCAL * cloud.s) / s.d / 60;
    const alpha = clamp(1.1 - s.d / 1600, 0.15, 0.75);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    for (const [ox, oy, r] of [[-0.9, 0.15, 0.55], [0, 0, 0.8], [0.9, 0.2, 0.5], [0.4, -0.35, 0.5], [-0.5, -0.3, 0.45]]) {
      ctx.beginPath();
      ctx.ellipse(s.x + ox * scale * 40, s.y + oy * scale * 22, r * scale * 40, r * scale * 20, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRings(ctx, project, state) {
  const p = state.plane;
  for (let i = 0; i < state.rings.length; i += 1) {
    if (i < state.ringIndex) continue;
    const ring = state.rings[i];
    const s = project(ring.x, ring.y, ring.z);
    if (!s) continue;
    const radiusPx = (ring.radius * FOCAL) / s.d;
    if (radiusPx < 3 || s.x < -radiusPx || s.x > W + radiusPx) continue;
    const isNext = i === state.ringIndex;
    const pulse = isNext ? 0.75 + 0.25 * Math.sin(state.time * 5) : 0.55;
    const col = isNext ? [255, 190, 60] : [90, 170, 255];
    // Beam down to the ground so the ring reads in depth.
    const g = project(ring.x, terrainHeight(ring.x, ring.z), ring.z);
    if (g) {
      ctx.strokeStyle = css(col, 0.3 * pulse);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(g.x, g.y);
      ctx.stroke();
    }
    ctx.save();
    ctx.shadowColor = css(col, 0.9);
    ctx.shadowBlur = 22 * pulse;
    ctx.strokeStyle = css(col, 0.95 * pulse + 0.05);
    ctx.lineWidth = Math.max(2, radiusPx * 0.09);
    ctx.beginPath();
    ctx.arc(s.x, s.y, radiusPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = css(col, 0.1);
    ctx.beginPath();
    ctx.arc(s.x, s.y, radiusPx, 0, Math.PI * 2);
    ctx.fill();
    if (radiusPx > 14 && state.screen !== 'title') {
      // No labels on the title screen: ring 1 sits behind the subtitle and
      // its label prints straight through the text.
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(11, Math.min(20, radiusPx * 0.34))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const distM = Math.round(Math.hypot(ring.x - p.x, ring.y - p.y, ring.z - p.z));
      ctx.fillText(isNext ? `RING ${i + 1}` : `${i + 1}`, s.x, s.y - radiusPx - 14);
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(`${distM} m`, s.x, s.y + radiusPx + 13);
    }
  }
}

/** The bush plane, drawn from behind and slightly above, banked with the roll. */
function drawPlane(ctx, state) {
  const p = state.plane;
  const cx = W / 2;
  const cy = H * 0.66 + Math.sin(p.pitch) * 46;
  const bank = p.roll;
  // Ground shadow.
  const cam = cameraFor(state);
  const project = makeProjector(cam);
  const sh = project(p.x, terrainHeight(p.x, p.z) + 0.5, p.z);
  if (sh && sh.d > 0) {
    const sw = clamp(2600 / sh.d, 18, 90);
    ctx.fillStyle = 'rgba(20,30,20,0.18)';
    ctx.beginPath();
    ctx.ellipse(sh.x, sh.y, sw, sw * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(bank);
  const S = 0.85; // overall plane scale
  ctx.scale(S, S);
  // Prop blur disc at the nose (top of the sprite, away from the camera).
  ctx.fillStyle = 'rgba(220,228,235,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, -76, 26, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,130,140,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, -76, 26, 8, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Main wing (high wing, spans wide) across the middle of the sprite.
  ctx.fillStyle = '#e8b23a';
  ctx.strokeStyle = '#8a6414';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-118, -34);
  ctx.lineTo(118, -34);
  ctx.lineTo(104, -16);
  ctx.lineTo(-104, -16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Wing walkway stripes.
  ctx.fillStyle = '#c98f1d';
  ctx.fillRect(-104, -32, 208, 5);
  // Fuselage: a short, wide body seen from behind — tail at the bottom
  // (nearest the camera), nose foreshortened toward the top.
  const body = ctx.createLinearGradient(-16, 46, 16, -74);
  body.addColorStop(0, '#f4f6f8');
  body.addColorStop(0.55, '#dfe6ec');
  body.addColorStop(1, '#b9c6d2');
  ctx.fillStyle = body;
  ctx.strokeStyle = '#5d6b78';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-19, 44);
  ctx.quadraticCurveTo(-22, -16, -12, -66);
  ctx.quadraticCurveTo(0, -76, 12, -66);
  ctx.quadraticCurveTo(22, -16, 19, 44);
  ctx.quadraticCurveTo(0, 54, -19, 44);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Cheatline stripe down the fuselage.
  ctx.fillStyle = '#2f6fc4';
  ctx.beginPath();
  ctx.moveTo(-17, 34);
  ctx.quadraticCurveTo(-19, -16, -11, -60);
  ctx.lineTo(-5, -60);
  ctx.quadraticCurveTo(-12, -16, -10, 34);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(17, 34);
  ctx.quadraticCurveTo(19, -16, 11, -60);
  ctx.lineTo(5, -60);
  ctx.quadraticCurveTo(12, -16, 10, 34);
  ctx.closePath();
  ctx.fill();
  // Windows: two lit cockpit panes.
  ctx.fillStyle = '#1d3a5f';
  ctx.beginPath();
  ctx.ellipse(-6, -50, 5.5, 8, -0.15, 0, Math.PI * 2);
  ctx.ellipse(6, -50, 5.5, 8, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,210,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(-7, -52, 2.5, 4, -0.15, 0, Math.PI * 2);
  ctx.ellipse(5, -52, 2.5, 4, 0.15, 0, Math.PI * 2);
  ctx.fill();
  // Tailplane and fin (nearest the camera, at the bottom of the sprite).
  ctx.fillStyle = '#e8b23a';
  ctx.strokeStyle = '#8a6414';
  ctx.beginPath();
  ctx.moveTo(-52, 32);
  ctx.lineTo(52, 32);
  ctx.lineTo(40, 46);
  ctx.lineTo(-40, 46);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2f6fc4';
  ctx.beginPath();
  ctx.moveTo(-7, 46);
  ctx.lineTo(-9, 6);
  ctx.lineTo(9, 6);
  ctx.lineTo(7, 46);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#1d3a5f';
  ctx.stroke();
  // Registration on the fin.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('RR-26', 0, 28);
  // Wingtip navigation lights, lit.
  ctx.save();
  ctx.shadowColor = '#ff3b30';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(-118, -25, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = '#34c759';
  ctx.fillStyle = '#34c759';
  ctx.beginPath();
  ctx.arc(118, -25, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Tail strobe.
  if (Math.floor(state.time * 2) % 2 === 0) {
    ctx.save();
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 50, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawTape(ctx, x, y, h, value, step, unit, format, accent) {
  ctx.save();
  ctx.fillStyle = 'rgba(10,18,28,0.55)';
  ctx.fillRect(x - 34, y - h / 2, 68, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.strokeRect(x - 34, y - h / 2, 68, h);
  ctx.beginPath();
  ctx.rect(x - 34, y - h / 2, 68, h);
  ctx.clip();
  const pxPerUnit = (h / 2 / (step * 4)) * step;
  const top = value + step * 4;
  const bottom = value - step * 4;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let v = Math.ceil(bottom / step) * step; v <= top; v += step) {
    const yy = y + (value - v) * pxPerUnit;
    const major = v % (step * 2) === 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x + 22, yy);
    ctx.lineTo(x + (major ? 32 : 28), yy);
    ctx.stroke();
    if (major) {
      ctx.fillStyle = '#e8f1f8';
      ctx.fillText(format(v), x - 30, yy);
    }
  }
  ctx.restore();
  // Current value box.
  ctx.fillStyle = accent;
  ctx.fillRect(x - 34, y - 13, 68, 26);
  ctx.fillStyle = '#0a1220';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${format(value)} ${unit}`, x, y + 1);
}

function drawAttitude(ctx, cx, cy, r, pitch, roll) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  const pitchPx = clamp(pitch, -0.6, 0.6) * r * 1.6;
  ctx.fillStyle = '#3f8fd2';
  ctx.fillRect(-r, -r + pitchPx, r * 2, r - pitchPx);
  ctx.fillStyle = '#8a6b46';
  ctx.fillRect(-r, pitchPx, r * 2, r - pitchPx + 1);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, pitchPx);
  ctx.lineTo(r, pitchPx);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  for (const off of [-r * 0.5, r * 0.5]) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, pitchPx + off);
    ctx.lineTo(r * 0.45, pitchPx + off);
    ctx.stroke();
  }
  ctx.restore();
  // Fixed wings marker and bezel.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, 0);
  ctx.lineTo(-r * 0.18, 0);
  ctx.moveTo(r * 0.18, 0);
  ctx.lineTo(r * 0.55, 0);
  ctx.stroke();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#dfe8f0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#dfe8f0';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATT', cx, cy + r + 14);
}

function drawCompass(ctx, heading) {
  const cx = W / 2;
  const cy = 30;
  ctx.fillStyle = 'rgba(10,18,28,0.55)';
  ctx.fillRect(cx - 170, 10, 340, 40);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.strokeRect(cx - 170, 10, 340, 40);
  const deg = ((heading * 180) / Math.PI % 360 + 360) % 360;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 170, 10, 340, 40);
  ctx.clip();
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const pxPerDeg = 340 / 90;
  for (let d = Math.floor((deg - 45) / 15) * 15; d <= deg + 45; d += 15) {
    const dd = ((d % 360) + 360) % 360;
    const x = cx + (d - deg) * pxPerDeg;
    const major = dd % 45 === 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 44);
    ctx.lineTo(x, major ? 30 : 36);
    ctx.stroke();
    if (major) {
      const label = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[dd] ?? String(dd);
      ctx.fillStyle = '#e8f1f8';
      ctx.fillText(label, x, 22);
    }
  }
  ctx.restore();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(cx - 7, 10);
  ctx.lineTo(cx + 7, 10);
  ctx.lineTo(cx, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#0a1220';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(String(Math.round(deg)).padStart(3, '0'), cx, 62);
}

function drawHUD(ctx, state) {
  const p = state.plane;
  const knots = Math.round((p.speed * 1.944).toFixed(0));
  const feet = Math.round(p.y * 3.281);
  drawCompass(ctx, p.heading);
  drawTape(ctx, 62, H / 2, 300, knots, 10, 'KT', (v) => String(Math.round(v)), '#ffd166');
  ctx.fillStyle = '#dfe8f0';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AIRSPEED', 62, H / 2 - 168);
  drawTape(ctx, W - 62, H / 2, 300, feet, 100, 'FT', (v) => String(Math.round(v)), '#7fd0ff');
  ctx.fillStyle = '#dfe8f0';
  ctx.fillText('ALTITUDE', W - 62, H / 2 - 168);
  drawAttitude(ctx, W / 2, H - 92, 62, p.pitch, p.roll);

  // Throttle bar, bottom right.
  const bx = W - 150;
  const by = H - 118;
  ctx.fillStyle = 'rgba(10,18,28,0.55)';
  ctx.fillRect(bx, by, 120, 16);
  ctx.fillStyle = p.throttle > 0.85 ? '#ff9f43' : '#34c759';
  ctx.fillRect(bx + 2, by + 2, 116 * p.throttle, 12);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.strokeRect(bx, by, 120, 16);
  ctx.fillStyle = '#dfe8f0';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`THR ${Math.round(p.throttle * 100)}%`, bx, by - 8);
  ctx.fillText(p.onGround ? 'GEAR DOWN' : 'GEAR UP', bx, by + 32);

  // Score, rings, time — top left.
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(`SCORE ${state.score}`, 18, 34);
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillStyle = '#ffd166';
  ctx.fillText(`RINGS ${state.ringsHit}/${WORLD.rings}`, 18, 60);
  const mm = Math.floor(state.timeLeft / 60);
  const ss = Math.floor(state.timeLeft % 60);
  ctx.fillStyle = state.timeLeft < 30 ? '#ff6b5e' : '#e8f1f8';
  ctx.fillText(`TIME ${mm}:${String(ss).padStart(2, '0')}`, 18, 84);
  ctx.fillStyle = '#dfe8f0';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('NEXT: ' + (state.ringIndex < WORLD.rings ? `RING ${state.ringIndex + 1}` : 'RUNWAY — LAND IT'), 18, 106);

  // Centre message.
  if (state.message && state.time < state.messageUntil) {
    const alpha = clamp((state.messageUntil - state.time) / 0.6, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.fillText(state.message, W / 2, 130);
    ctx.restore();
  }
  // Warnings.
  if (state.warn) {
    const blink = Math.floor(state.time * 4) % 2 === 0;
    if (blink) {
      ctx.fillStyle = '#ff5148';
      ctx.font = 'bold 34px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 10;
      ctx.fillText(`⚠ ${state.warn}`, W / 2, H - 190);
      ctx.shadowBlur = 0;
    }
  }
  // Ring flash.
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,200,80,${state.flash * 0.5})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawTitle(ctx, state) {
  ctx.fillStyle = 'rgba(8,16,28,0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 16;
  ctx.fillText('RIDGE RUNNER', W / 2, 210);
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillStyle = '#ffd166';
  ctx.fillText('— ALPINE COURIER —', W / 2, 252);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#e8f1f8';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText('Fly the 8 glowing rings down the valley, then land on the runway.', W / 2, 300);
  ctx.fillText('A complete flight game: rings, runway, live instruments — fly it.', W / 2, 328);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#c8d8e8';
  ctx.fillText('↑ ↓ pitch      ← → bank & turn      Shift / Ctrl throttle      Mouse steers too', W / 2, 392);
  ctx.fillText('B brake on the ground      P pause      R restart', W / 2, 420);
  const blink = Math.floor(state.time * 1.6) % 2 === 0;
  if (blink) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('PRESS ENTER OR CLICK TO FLY', W / 2, 486);
  }
  if (state.best > 0) {
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(`BEST SCORE ${state.best}`, W / 2, 528);
  }
}

function drawEnd(ctx, state) {
  ctx.fillStyle = 'rgba(8,16,28,0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  if (state.screen === 'landed') {
    ctx.fillStyle = '#7be495';
    ctx.font = 'bold 58px system-ui, sans-serif';
    ctx.fillText('DELIVERED!', W / 2, 250);
    ctx.fillStyle = '#ffffff';
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText('The mail is on the runway. All 8 rings, wheels down, in one piece.', W / 2, 300);
  } else if (state.screen === 'timeout') {
    ctx.fillStyle = '#ff9f43';
    ctx.font = 'bold 58px system-ui, sans-serif';
    ctx.fillText("OUT OF TIME", W / 2, 250);
    ctx.fillStyle = '#ffffff';
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText(state.crashReason, W / 2, 300);
  } else {
    ctx.fillStyle = '#ff6b5e';
    ctx.font = 'bold 58px system-ui, sans-serif';
    ctx.fillText('CRASHED', W / 2, 250);
    ctx.fillStyle = '#ffffff';
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText(state.crashReason, W / 2, 300);
  }
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText(`SCORE ${state.score}   •   RINGS ${state.ringsHit}/${WORLD.rings}`, W / 2, 360);
  if (state.best > 0) {
    ctx.fillStyle = '#e8f1f8';
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText(`BEST ${state.best}`, W / 2, 396);
  }
  const blink = Math.floor(state.time * 1.6) % 2 === 0;
  if (blink) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('PRESS R TO FLY AGAIN', W / 2, 460);
  }
}

function drawPaused(ctx) {
  ctx.fillStyle = 'rgba(8,16,28,0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', W / 2, H / 2 - 10);
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText('Press P to keep flying', W / 2, H / 2 + 30);
}

/** Draw one frame of the game. */
export function render(ctx, state) {
  const cam = cameraFor(state);
  const project = makeProjector(cam);
  project.cam = cam;
  drawSky(ctx, cam);
  drawTerrain(ctx, project);
  drawClouds(ctx, project);
  drawRings(ctx, project, state);
  if (state.screen !== 'title') drawPlane(ctx, state);
  else {
    // Parked on the runway: show the plane from behind on the title screen.
    drawPlane(ctx, state);
  }
  if (state.screen === 'play' || state.screen === 'paused') drawHUD(ctx, state);
  if (state.screen === 'title') drawTitle(ctx, state);
  else if (state.screen === 'paused') drawPaused(ctx);
  else if (state.screen === 'crashed' || state.screen === 'landed' || state.screen === 'timeout') drawEnd(ctx, state);
  // Soft vignette so the HUD reads at a glance.
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,20,0.22)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}
