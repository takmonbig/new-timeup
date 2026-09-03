import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { motion } from "framer-motion";

function fmt(ms) {
  const total = Math.max(0, ms);
  const secs = total / 1000;
  return secs.toFixed(2);
}

/**
 * High-resolution stopwatch. Exposes start/stop/reset via ref.
 * onStop(elapsedSeconds) fires when stopped.
 */
const Stopwatch = forwardRef(function Stopwatch({ target, running, onTick }, ref) {
  const [elapsed, setElapsed] = useState(0); // ms
  const startRef = useRef(null);
  const rafRef = useRef(null);
  const runningRef = useRef(false);

  const loop = () => {
    if (!runningRef.current) return;
    const now = performance.now();
    const e = now - startRef.current;
    setElapsed(e);
    if (onTick) onTick(e / 1000);
    rafRef.current = requestAnimationFrame(loop);
  };

  useImperativeHandle(ref, () => ({
    start() {
      setElapsed(0);
      startRef.current = performance.now();
      runningRef.current = true;
      rafRef.current = requestAnimationFrame(loop);
    },
    stop() {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const finalMs = performance.now() - startRef.current;
      setElapsed(finalMs);
      return finalMs / 1000;
    },
    reset() {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setElapsed(0);
    },
  }));

  useEffect(() => () => rafRef.current && cancelAnimationFrame(rafRef.current), []);

  const value = fmt(elapsed);
  const nearTarget = target && Math.abs(elapsed / 1000 - target) < 0.5;

  return (
    <div className="relative flex flex-col items-center justify-center select-none">
      <svg className="absolute" width="360" height="360" viewBox="0 0 360 360" style={{ maxWidth: "90vw" }}>
        <circle cx="180" cy="180" r="150" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
        <motion.circle
          cx="180" cy="180" r="150" fill="none"
          stroke="#ff2a2a" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={2 * Math.PI * 150}
          animate={{
            strokeDashoffset: running
              ? 2 * Math.PI * 150 * (1 - Math.min(1, (elapsed / 1000) / (target || 10)))
              : 2 * Math.PI * 150,
            filter: running ? "drop-shadow(0 0 12px rgba(255,42,42,0.7))" : "none",
          }}
          transition={{ duration: 0.1, ease: "linear" }}
          transform="rotate(-90 180 180)"
        />
      </svg>
      <motion.div
        animate={{ scale: running ? [1, 1.015, 1] : 1 }}
        transition={{ duration: 0.8, repeat: running ? Infinity : 0 }}
        className={`font-mono-pz font-extrabold tracking-tighter tabular-nums z-10 ${
          running || nearTarget ? "text-pazer-red pz-glow" : "text-white"
        }`}
        style={{ fontSize: "clamp(3.5rem, 16vw, 6.5rem)" }}
        data-testid="stopwatch-display"
      >
        {value}
      </motion.div>
      {target ? (
        <div className="z-10 mt-2 font-mono-pz text-sm text-white/50 uppercase tracking-widest">
          Target · {Number(target).toFixed(2)}s
        </div>
      ) : null}
    </div>
  );
});

export default Stopwatch;
