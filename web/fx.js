// Hero background: ~56 pointed spikes at one diagonal (Canvas 2D). Each spike has a crisp lower edge, a slanted upper
// edge into a tip, a shadow on its upper side and a colour gradient sampled from a wandering "hot core".
// Port of meme-coin/vivid-hero/main.js; knobs below. ?t=3.5 freezes time (screenshots).
(() => {
  const C = {
    angle: 40, count: 56, edge: 0.26, teeth: 0.09, taper: 0.18, hot: 0.75, shade: 0.7,
    blur: 0.9, speed: 1.0, mouse: 0.6, dpr: 2, res: 1.0,
  };
  const cv = document.getElementById("fx"), box = document.querySelector(".fxbox");
  if (!cv || !box) return;
  const ctx = cv.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const q = new URLSearchParams(location.search).get("t");
  const frozen = q != null ? Number(q) : reduce ? 3.5 : null;
  const rad = (C.angle * Math.PI) / 180, D = [Math.cos(rad), Math.sin(rad)], N = [-Math.sin(rad), Math.cos(rad)];

  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const spikes = [];
  for (let i = 0; i < C.count; i++) {
    const v = -0.64 + rnd() * 0.94, deep = rnd();
    spikes.push({
      v, w: 0.045 + rnd() * 0.05,
      tip: C.edge - 0.7 * v + (rnd() - 0.5) * 2 * C.teeth + (deep < 0.45 ? deep * 0.9 : 0),
      taper: C.taper * (0.6 + rnd() * 0.9),
      len: v > 0.14 ? 0.2 + rnd() * 0.2 : 0.35 + rnd() * 0.75 + (v < 0.05 && v > -0.3 ? 0.4 : 0),
      hue: rnd(), ph: rnd() * 6.28, sp: 0.4 + rnd() * 0.8, z: rnd(),
    });
  }
  spikes.sort((a, b) => a.z - b.z);

  const PAL = [[43, 69, 255], [133, 77, 255], [255, 51, 184], [255, 133, 92], [255, 204, 66], [77, 230, 191]];
  const pal = (x) => { x = ((x % 1) + 1) % 1 * 6; const i = Math.floor(x), f = x - i, a = PAL[i], b = PAL[(i + 1) % 6]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; };
  const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  function fieldColor(s, u, t, mouse) {
    const cv0 = -0.08 + 0.11 * Math.sin(t * 0.45), cu0 = 0.6 + 0.14 * Math.sin(t * 0.33 + 1.3);
    const core = Math.exp(-(((s.v - cv0) / 0.25) ** 2)) * Math.exp(-(((u - cu0) / 0.36) ** 2)) * (0.75 + 0.25 * Math.sin(t * 0.6 + s.ph));
    const wob = 0.5 + 0.5 * Math.sin(u * 5 + s.ph + t * 1.6 * s.sp);
    let hot = Math.min(1, Math.max(0, (core * (0.55 + 0.75 * wob) * C.hot * 1.5 - 0.12) / 0.5));
    if (mouse.k > 0.01) { const du = u - mouse.u, dv = s.v - mouse.v; hot = Math.min(1, hot + mouse.k * C.mouse * Math.exp(-(du * du + dv * dv) / 0.02)); }
    const base = mixc([40, 72, 255], [118, 72, 255], 0.5 + 0.5 * Math.sin(s.ph + u * 3 + t * 0.2));
    let hue = 0.47 + (s.hue - 0.5) * 0.42 + Math.sin(u * 2.2 - t * 0.9 + s.ph) * 0.16 + Math.sin(t * 0.4) * 0.08;
    if (s.hue > 0.9) hue = 0.86;   // a rare mint spike
    return mixc(base, pal(hue), hot);
  }

  let W = 1, H = 1, F = [0, 0, 1, 1];
  function resize() {
    const k = Math.min(devicePixelRatio || 1, C.dpr) * C.res;
    W = cv.width = Math.round(cv.clientWidth * k); H = cv.height = Math.round(cv.clientHeight * k);
    const r = box.getBoundingClientRect(), c = cv.getBoundingClientRect();
    F = [(r.left - c.left) * k, (r.top - c.top) * k, r.width * k, r.height * k];
    if (frozen != null) draw(frozen);
  }
  const P = (u, v) => { const x = u * D[0] + v * N[0], y = u * D[1] + v * N[1]; return [F[0] + x * F[2], F[1] + (F[3] / F[2] - y) * F[2]]; };

  const m = { u: 0.6, v: 0, tu: 0.6, tv: 0, k: 0, tk: 0 };
  cv.parentElement.addEventListener("pointermove", (e) => {
    const r = box.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = r.height / r.width - (e.clientY - r.top) / r.width;
    m.tu = x * D[0] + y * D[1]; m.tv = x * N[0] + y * N[1]; m.tk = 1;
  });
  cv.parentElement.addEventListener("pointerleave", () => (m.tk = 0));

  function draw(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = "none"; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    ctx.save();
    const a = [F[0], F[1] + 0.25 * F[2]], b = [F[0] + 0.46 * F[2], F[1]];
    const ext = (pt, k) => [pt[0] + (b[0] - a[0]) * k, pt[1] + (b[1] - a[1]) * k];
    ctx.beginPath(); ctx.moveTo(...ext(a, -3)); ctx.lineTo(...ext(b, 3)); ctx.lineTo(W * 3, H * 3); ctx.lineTo(-W * 3, H * 3); ctx.closePath(); ctx.clip();
    ctx.filter = `blur(${(C.blur * F[2]) / 645}px)`;
    for (const s of spikes) {
      const breathe = Math.sin(t * 0.9 * s.sp + s.ph) * 0.06 + Math.sin(t * 0.37 + s.v * 9) * 0.03;
      const tip = s.tip + breathe, lo = s.v - s.w / 2, hi = s.v + s.w / 2, end = tip + s.len;
      ctx.beginPath();
      ctx.moveTo(...P(tip, lo)); ctx.lineTo(...P(end, lo)); ctx.lineTo(...P(end, hi)); ctx.lineTo(...P(tip + s.taper, hi)); ctx.closePath();
      const g = ctx.createLinearGradient(...P(tip, s.v), ...P(end, s.v));
      for (let k = 0; k <= 7; k++) {
        const f = k / 7, u = tip + f * s.len, c = fieldColor(s, u, t, m);
        const alpha = Math.min(1, f / (0.08 / s.len), (1 - f) / 0.3);
        const cc = mixc(c, [40, 70, 255], Math.max(0, 1 - f * s.len / 0.18) * 0.8);
        g.addColorStop(f, `rgba(${cc[0] | 0},${cc[1] | 0},${cc[2] | 0},${alpha})`);
      }
      ctx.fillStyle = g; ctx.fill();
      const sg = ctx.createLinearGradient(...P(tip + 0.3, lo), ...P(tip + 0.3, hi));
      sg.addColorStop(0, "rgba(0,0,0,0)"); sg.addColorStop(0.45, "rgba(0,0,0,0.05)"); sg.addColorStop(1, `rgba(0,0,0,${C.shade})`);
      ctx.fillStyle = sg; ctx.fill();
    }
    ctx.restore();
  }

  addEventListener("resize", resize); resize();
  if (frozen != null) return;
  // only animate while the hero is on screen
  let visible = true, raf = 0;
  const t0 = performance.now();
  function loop(now) {
    m.u += (m.tu - m.u) * 0.06; m.v += (m.tv - m.v) * 0.06; m.k += (m.tk - m.k) * 0.04;
    draw(((now - t0) / 1000) * C.speed);
    raf = visible ? requestAnimationFrame(loop) : 0;
  }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(loop); }).observe(cv);
  raf = requestAnimationFrame(loop);
})();
