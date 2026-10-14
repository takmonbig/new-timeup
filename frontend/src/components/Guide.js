import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Gamepad2, Plane, Castle, Swords, Users, Trophy } from "lucide-react";

const STEPS = [
  { icon: Gamepad2, title: "Games Hub", text: "Stopwatch: stop the clock EXACTLY at the target to win 5×." },
  { icon: Plane, title: "Aviator", text: "Watch the multiplier climb and cash out before the plane flies away." },
  { icon: Castle, title: "Tower", text: "Pick safe tiles row by row, dodge the bombs and cash out anytime." },
  { icon: Swords, title: "1v1 Duels", text: "Face one opponent for 50 coins. Closest to the target wins 1.5×." },
  { icon: Users, title: "Multiplayer Rooms", text: "Up to 25 players. The closest timing takes the prize pool." },
  { icon: Trophy, title: "Ranks & Rewards", text: "Climb the weekly leaderboard and claim your daily login bonus." },
];

export function Guide() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem("timeup_guide_done")) setOpen(true);
  }, []);

  const close = () => { localStorage.setItem("timeup_guide_done", "1"); setOpen(false); };
  const next = () => (i < STEPS.length - 1 ? setI(i + 1) : close());

  if (!open) return null;
  const s = STEPS[i];
  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-[90] flex items-center justify-center px-6"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="onboarding-guide">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={close} />
        <motion.div key={i} initial={{ scale: 0.8, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
          className="relative w-full max-w-sm rounded-3xl pz-glass border border-pazer-red/40 p-7 text-center">
          <button onClick={close} className="absolute top-4 right-4 text-white/40 hover:text-white"><X className="h-4 w-4" /></button>
          <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-pazer-red/15 flex items-center justify-center">
            <s.icon className="h-8 w-8 text-pazer-red" />
          </div>
          <h3 className="font-display font-bold text-xl mb-1">{s.title}</h3>
          <p className="text-white/60 text-sm">{s.text}</p>
          <div className="flex justify-center gap-1.5 my-5">
            {STEPS.map((_, idx) => (
              <span key={idx} className={`h-1.5 rounded-full transition-all ${idx === i ? "w-6 bg-pazer-red" : "w-1.5 bg-white/20"}`} />
            ))}
          </div>
          <button onClick={next} data-testid="guide-next"
            className="w-full py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors">
            {i < STEPS.length - 1 ? "Next" : "Let's Play"}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
