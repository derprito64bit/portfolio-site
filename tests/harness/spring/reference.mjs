// Reference spring integrator for the spring instrument: the exact closed-form damped step (W-D010, ion-spring).
// Ported after a read of the w-motion Wave 1b lab (ion-spring.js stepExact); only the underdamped, critical and
// overdamped closed forms are kept. This is the oracle W-C3's src/motion/spring is measured against.

/** Advance state {x, v} toward target over dt seconds, exactly. */
export function stepExact(s, target, hz, zeta, dt) {
  if (dt <= 0) return s;
  const w = 2 * Math.PI * Math.max(0.01, hz);
  const y0 = s.x - target;
  const v0 = s.v;
  if (zeta < 1) {
    const wd = w * Math.sqrt(1 - zeta * zeta);
    const e = Math.exp(-zeta * w * dt);
    const co = Math.cos(wd * dt);
    const si = Math.sin(wd * dt);
    const B = (v0 + zeta * w * y0) / wd;
    s.x = target + e * (y0 * co + B * si);
    s.v = e * ((-zeta * w * y0 + wd * B) * co + (-zeta * w * B - wd * y0) * si);
  } else if (zeta === 1) {
    const e = Math.exp(-w * dt);
    const B = v0 + w * y0;
    s.x = target + (y0 + B * dt) * e;
    s.v = (B - w * (y0 + B * dt)) * e;
  } else {
    const r = w * Math.sqrt(zeta * zeta - 1);
    const r1 = -zeta * w + r;
    const r2 = -zeta * w - r;
    const C1 = (v0 - r2 * y0) / (r1 - r2);
    const C2 = y0 - C1;
    s.x = target + C1 * Math.exp(r1 * dt) + C2 * Math.exp(r2 * dt);
    s.v = C1 * r1 * Math.exp(r1 * dt) + C2 * r2 * Math.exp(r2 * dt);
  }
  return s;
}

/** Analytic unit step response (0 -> 1), underdamped. */
export function analytic(hz, zeta, t) {
  const w = 2 * Math.PI * hz;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
}
