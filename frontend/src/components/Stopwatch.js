import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { motion } from "framer-motion";

function fmt(ms) {
  return (Math.max(0, ms) / 1000).toFixed(2);
}

const SIZE = 280;
const R = 120;
const C = 2 * Math.PI * R;

const Stopwatch = forwardRef(function Stopwatch({ target, running, onTick }, ref) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(null);
  const rafRef = useRef(null);
  const runningRef = useRef(false);

  const loop = () => {
    if (!runningRef.current) return;
    const e = performance.now() - startRef.current;
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
      if (!runningRef.current) return elapsed / 1000;
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
  const progress = target ? Math.min(1, elapsed / 1000 / target) : 0;

  return (
    <div className="relative flex items-center justify-center pointer-events-none select-none"
      style={{ width: SIZE, height: SIZE, maxWidth: "82vw", maxHeight: "82vw" }}>
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        <motion.circle
          cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
          stroke="#ff2a2a" strokeWidth="4" strokeLinecap="round" strokeDasharray={C}
          animate={{
            strokeDashoffset: running ? C * (1 - progress) : C,
            filter: running ? "drop-shadow(0 0 10px rgba(255,42,42,0.75))" : "none",
          }}
          transition={{ duration: 0.08, ease: "linear" }}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <div className="relative flex flex-col items-center pointer-events-none">
        <motion.div
          animate={{ scale: running ? [1, 1.02, 1] : 1 }}
          transition={{ duration: 0.8, repeat: running ? Infinity : 0 }}
          className={`font-mono-pz font-extrabold tracking-tighter tabular-nums ${running ? "text-pazer-red pz-glow" : "text-white"}`}
          style={{ fontSize: "clamp(3rem, 15vw, 5rem)", lineHeight: 1 }}
          data-testid="stopwatch-display"
        >
          {value}
        </motion.div>
        {target ? (
          <div className="mt-2 font-mono-pz text-xs text-white/50 uppercase tracking-widest">
            Target · {Number(target).toFixed(2)}s
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default Stopwatch;
