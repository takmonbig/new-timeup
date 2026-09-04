import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LOGO_URL } from "@/lib/brand";

export default function Splash() {
  const nav = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => nav("/home", { replace: true }), 2600);
    return () => clearTimeout(t);
  }, [nav]);

  const R = 120;
  return (
    <div className="min-h-screen pz-radial flex flex-col items-center justify-center overflow-hidden" data-testid="splash-screen">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative flex items-center justify-center">
        <svg width="300" height="300" viewBox="0 0 300 300" className="max-w-[80vw]">
          <circle cx="150" cy="150" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
          <motion.circle cx="150" cy="150" r={R} fill="none" stroke="#ff2a2a" strokeWidth="5" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * R} initial={{ strokeDashoffset: 2 * Math.PI * R }}
            animate={{ strokeDashoffset: 0 }} transition={{ duration: 2.2, ease: "easeInOut" }}
            transform="rotate(-90 150 150)" style={{ filter: "drop-shadow(0 0 14px rgba(255,42,42,0.8))" }} />
        </svg>
        <motion.img src={LOGO_URL} alt="TIMEUP" className="absolute w-40 max-w-[45vw]"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6 }} />
      </motion.div>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
        className="mt-8 font-mono-pz text-sm uppercase tracking-[0.35em] text-white/50">
        Master Your Timing
      </motion.p>
    </div>
  );
}
