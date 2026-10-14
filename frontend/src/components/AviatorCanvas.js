import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

const rand = (a, b) => a + Math.random() * (b - a);
const STARS = Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random() * 0.8, r: rand(0.4, 1.8), l: Math.floor(rand(0, 3)), p: rand(0, 6.28) }));
const SPEED = [8, 22, 48];
const ridge = (n, amp, seed) => Array.from({ length: n }, (_, i) => Math.sin(i * 0.9 + seed) * amp * 0.5 + Math.sin(i * 2.3 + seed * 3) * amp * 0.3 + amp);

const M1 = ridge(24, 40, 1), M2 = ridge(24, 26, 4);

function drawBackground(ctx, w, h, scroll, now) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#07020a"); g.addColorStop(0.55, "#1a0509"); g.addColorStop(1, "#3a0a0a");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const sun = ctx.createRadialGradient(w * 0.78, h * 0.78, 0, w * 0.78, h * 0.78, h * 0.6);
  sun.addColorStop(0, "rgba(255,120,40,0.55)"); sun.addColorStop(0.35, "rgba(255,42,42,0.18)"); sun.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h);
  for (const s of STARS) {
    const x = (((s.x * w - scroll * SPEED[s.l]) % w) + w) % w;
    ctx.globalAlpha = (0.35 + s.l * 0.2) * (0.6 + 0.4 * Math.sin(now / 500 + s.p));
    ctx.fillStyle = s.l === 2 ? "#ffd2b0" : "#ffffff";
    ctx.beginPath(); ctx.arc(x, s.y * h, s.r * (0.6 + s.l * 0.3), 0, 6.28); ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawRidge(ctx, w, h, M1, scroll * 14, h * 0.78, "rgba(60,8,12,0.9)");
  drawRidge(ctx, w, h, M2, scroll * 34, h * 0.86, "rgba(25,3,6,0.95)");
  drawGrid(ctx, w, h, scroll);
}

function drawRidge(ctx, w, h, pts, off, base, color) {
  const seg = w / (pts.length - 2);
  const o = off % seg, idx = Math.floor(off / seg);
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, h);
  for (let i = 0; i < pts.length; i++) ctx.lineTo(i * seg - o, base - pts[(i + idx) % pts.length]);
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
}

function drawGrid(ctx, w, h, scroll) {
  const top = h * 0.88;
  ctx.strokeStyle = "rgba(255,60,40,0.18)"; ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const t = ((i + (scroll * 0.8) % 1) / 7);
    const y = top + (h - top) * t * t;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  for (let i = -8; i <= 8; i++) {
    ctx.beginPath(); ctx.moveTo(w / 2 + i * 30, top); ctx.lineTo(w / 2 + i * 160, h); ctx.stroke();
  }
}

function drawPlane(ctx, x, y, ang, now, s) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
  const glow = ctx.createRadialGradient(-6, 4, 0, -6, 4, 46);
  glow.addColorStop(0, "rgba(255,90,40,0.45)"); glow.addColorStop(1, "rgba(255,42,42,0)");
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(-6, 4, 46, 0, 6.28); ctx.fill();
  ctx.fillStyle = "#7a0c0c";
  ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(-18, -20); ctx.lineTo(-10, -20); ctx.lineTo(8, -2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-26, -2); ctx.lineTo(-36, -16); ctx.lineTo(-30, -16); ctx.lineTo(-20, -3); ctx.closePath(); ctx.fill();
  const body = ctx.createLinearGradient(0, -10, 0, 10);
  body.addColorStop(0, "#ffd0b8"); body.addColorStop(0.3, "#ff4a2a"); body.addColorStop(0.75, "#c41212"); body.addColorStop(1, "#5a0606");
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.moveTo(26, 0); ctx.bezierCurveTo(24, -9, 8, -10, -6, -7); ctx.lineTo(-32, -3); ctx.lineTo(-34, 2);
  ctx.lineTo(-6, 7); ctx.bezierCurveTo(10, 10, 24, 8, 26, 0); ctx.closePath(); ctx.fill();
  const glass = ctx.createLinearGradient(4, -10, 12, -2);
  glass.addColorStop(0, "#ffffff"); glass.addColorStop(1, "#3b0f1a");
  ctx.fillStyle = glass; ctx.beginPath(); ctx.ellipse(9, -6, 7, 3.5, -0.15, 0, 6.28); ctx.fill();
  const wing = ctx.createLinearGradient(0, 0, 0, 22);
  wing.addColorStop(0, "#ff6a3a"); wing.addColorStop(1, "#8a0e0e");
  ctx.fillStyle = wing;
  ctx.beginPath(); ctx.moveTo(6, 2); ctx.lineTo(-14, 24); ctx.lineTo(-4, 24); ctx.lineTo(14, 3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#2a0a0a"; ctx.beginPath(); ctx.arc(26, 0, 3.2, 0, 6.28); ctx.fill();
  const spin = Math.abs(Math.sin(now / 18));
  ctx.fillStyle = "rgba(255,230,210,0.55)";
  ctx.beginPath(); ctx.ellipse(28, 0, 1.6, 4 + 12 * spin, 0, 0, 6.28); ctx.fill();
  ctx.restore();
}

function drawCurve(ctx, pts, ox, oy) {
  if (pts.length < 2) return;
  const last = pts[pts.length - 1];
  const fill = ctx.createLinearGradient(0, last[1], 0, oy);
  fill.addColorStop(0, "rgba(255,60,30,0.45)"); fill.addColorStop(1, "rgba(255,42,42,0.02)");
  ctx.beginPath(); ctx.moveTo(ox, oy);
  pts.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(last[0], oy); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  ctx.save(); ctx.shadowColor = "#ff4a1f"; ctx.shadowBlur = 22; ctx.lineWidth = 4; ctx.lineCap = "round";
  const st = ctx.createLinearGradient(ox, 0, last[0], 0);
  st.addColorStop(0, "#ff2a2a"); st.addColorStop(1, "#ffb347");
  ctx.strokeStyle = st; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.restore();
}

function drawParticles(ctx, parts, dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt;
    const a = p.life / p.max;
    ctx.globalAlpha = a; ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.4 + a), 0, 6.28); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export const AviatorCanvas = forwardRef(function AviatorCanvas({ onTick, onCrash }, ref) {
  const cvs = useRef(null);
  const st = useRef({ mode: "idle", k: 0.12, crash: 1, t0: 0, scroll: 0, parts: [], crashT: 0, endT: 0, ring: 0 });
  const cb = useRef({ onTick, onCrash });
  cb.current = { onTick, onCrash };

  useImperativeHandle(ref, () => ({
    fly(k, crash) { Object.assign(st.current, { mode: "fly", k, crash, t0: performance.now(), parts: [], ring: 0 }); },
    reset() { Object.assign(st.current, { mode: "idle", parts: [], ring: 0 }); },
  }));

  useEffect(() => {
    const c = cvs.current, ctx = c.getContext("2d");
    let raf, last = performance.now(), w = 0, h = 0;
    const fit = () => {
      const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      w = r.width; h = r.height; c.width = w * d; c.height = h * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(c);
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const s = st.current;
      let t = 0, m = 1;
      if (s.mode === "fly") {
        t = (now - s.t0) / 1000; m = Math.exp(s.k * t);
        if (m >= s.crash) {
          m = s.crash; t = Math.log(Math.max(1, s.crash)) / s.k;
          s.mode = "crash"; s.endT = t; s.ring = 0.01;
          cb.current.onCrash?.(s.crash);
        } else cb.current.onTick?.(m);
        s.scroll += dt * (1 + t * 0.15);
      } else if (s.mode === "crash") { t = s.endT; m = s.crash; }
      else s.scroll += dt * 0.15;

      drawBackground(ctx, w, h, s.scroll, now);
      const ox = 34, oy = h - 34;
      const tMax = Math.max(8, t * 1.18), mMax = Math.max(2, m * 1.25);
      const X = (tt) => ox + (tt / tMax) * (w - ox - 70);
      const Y = (mm) => oy - ((mm - 1) / (mMax - 1)) * (oy - 70);
      ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.font = "10px JetBrains Mono, monospace";
      for (let i = 0; i <= 3; i++) { const mm = 1 + ((mMax - 1) * i) / 3; ctx.fillText(mm.toFixed(1) + "x", 2, Y(mm) + 3); }
      const pts = [];
      if (s.mode !== "idle") for (let i = 0; i <= 60; i++) { const tt = (t * i) / 60; pts.push([X(tt), Y(Math.exp(s.k * tt))]); }
      drawCurve(ctx, pts, ox, oy);
      const [px, py] = pts.length ? pts[pts.length - 1] : [ox + 10, oy - 6 + Math.sin(now / 400) * 4];
      if (s.mode === "fly") {
        const p2 = pts[Math.max(0, pts.length - 4)];
        const ang = Math.max(-0.9, Math.atan2(py - p2[1], px - p2[0] || 1));
        s.parts.push({ x: px - 30, y: py + 4, vx: rand(-90, -40), vy: rand(-12, 12), r: rand(2, 4), life: 0.6, max: 0.6, c: Math.random() > 0.5 ? "#ff7a2a" : "#ff2a2a" });
        drawParticles(ctx, s.parts, dt);
        drawPlane(ctx, px, py + Math.sin(now / 160) * 1.5, ang, now, 1.15);
      } else if (s.mode === "crash") {
        if (s.ring > 0 && s.ring < 1.2) {
          if (s.ring === 0.01) for (let i = 0; i < 70; i++) {
            const a = rand(0, 6.28), v = rand(60, 320);
            s.parts.push({ x: px, y: py, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 260, r: rand(2, 5), life: rand(0.6, 1.4), max: 1.4, c: ["#ffdd55", "#ff7a2a", "#ff2a2a", "#ffffff"][i % 4] });
          }
          s.ring += dt;
          ctx.save(); ctx.globalAlpha = Math.max(0, 1 - s.ring); ctx.strokeStyle = "#ffb347"; ctx.lineWidth = 3;
          ctx.shadowColor = "#ff4a1f"; ctx.shadowBlur = 24;
          ctx.beginPath(); ctx.arc(px, py, s.ring * 140, 0, 6.28); ctx.stroke(); ctx.restore();
        }
        drawParticles(ctx, s.parts, dt);
      } else drawPlane(ctx, px, py, -0.1, now, 1.15);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={cvs} className="absolute inset-0 h-full w-full" data-testid="aviator-canvas" />;
});
