/** Smooth interpolation of remote player transforms. */

export interface Sample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  at: number;
}

export interface InterpState {
  from: Sample;
  to: Sample;
  pose: string;
  place: string;
  equip: string | null;
}

const TAU = Math.PI * 2;

export function shortestAngle(from: number, to: number): number {
  let d = ((to - from) % TAU + TAU) % TAU;
  if (d > Math.PI) d -= TAU;
  return d;
}

export function lerpAngle(from: number, to: number, t: number): number {
  return from + shortestAngle(from, to) * t;
}

export function pushSample(state: InterpState | null, next: Omit<Sample, 'at'> & { at?: number; pose: string; place: string; equip: string | null }, now = performance.now()): InterpState {
  const sample: Sample = { x: next.x, y: next.y, z: next.z, yaw: next.yaw, speed: next.speed, at: next.at ?? now };
  if (!state) {
    return { from: sample, to: sample, pose: next.pose, place: next.place, equip: next.equip };
  }
  const cur = sampleAt(state, now);
  // Ensure a positive span so the next render tick can interpolate
  if (sample.at <= cur.at) sample.at = cur.at + 100;
  return {
    from: { ...cur, at: now },
    to: sample,
    pose: next.pose,
    place: next.place,
    equip: next.equip,
  };
}

export function sampleAt(state: InterpState, now = performance.now()): Sample {
  const span = Math.max(1, state.to.at - state.from.at);
  // Render ~1 network tick behind the newest sample for smoothness
  const renderAt = now - 100;
  const t = Math.max(0, Math.min(1.25, (renderAt - state.from.at) / span));
  const u = Math.min(1, t);
  return {
    x: state.from.x + (state.to.x - state.from.x) * u,
    y: state.from.y + (state.to.y - state.from.y) * u,
    z: state.from.z + (state.to.z - state.from.z) * u,
    yaw: lerpAngle(state.from.yaw, state.to.yaw, u),
    speed: state.from.speed + (state.to.speed - state.from.speed) * u,
    at: now,
  };
}
