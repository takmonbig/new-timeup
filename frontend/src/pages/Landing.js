import { Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Zap, Trophy, Users, ShieldCheck, ArrowRight, Target, Gauge, Swords } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { LOGO_URL } from "@/lib/brand";

const HERO = "https://images.unsplash.com/photo-1542751371-adc38448a05e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHwxfHxlc3BvcnRzJTIwZ2FtZXIlMjBkYXJrJTIwYmFja2dyb3VuZHxlbnwwfHx8fDE3ODg0MjMzMjR8MA&ixlib=rb-4.1.0&q=85";
const ARENA = "https://images.unsplash.com/photo-1676746424139-77f8bd8922a8?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzl8MHwxfHNlYXJjaHw0fHxzdGFkaXVtJTIwYXJlbmElMjBsaWdodHMlMjBkYXJrfGVufDB8fHx8MTc4ODQyMzMyNHww&ixlib=rb-4.1.0&q=85";

const fadeUp = { hidden: { opacity: 0, y: 30 }, show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5 } }) };

export default function Landing() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/home" replace />;

  return (
    <div className="relative">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={HERO} alt="" className="w-full h-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-[#050505]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 md:px-8 pt-16 pb-24 md:pt-24 md:pb-32">
          <motion.div initial="hidden" animate="show" className="max-w-3xl">
            <motion.img variants={fadeUp} src={LOGO_URL} alt="TIMEUP" className="h-12 md:h-14 w-auto mb-6" style={{ filter: "drop-shadow(0 0 14px rgba(255,42,42,0.4))" }} />
            <motion.div variants={fadeUp} custom={0} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-pazer-red/40 bg-pazer-red/10 mb-6">
              <span className="h-2 w-2 rounded-full bg-pazer-red pz-live-dot" />
              <span className="text-xs font-mono-pz uppercase tracking-widest text-pazer-red">Skill-based · Live rooms</span>
            </motion.div>
            <motion.h1 variants={fadeUp} custom={1} className="font-display font-extrabold leading-[0.95] tracking-tight text-5xl sm:text-6xl lg:text-7xl">
              Stop the clock. <span className="text-pazer-red pz-glow">Win it.</span>
            </motion.h1>
            <motion.p variants={fadeUp} custom={2} className="mt-6 text-lg text-white/60 max-w-xl">
              TIMEUP is a precision timing game. Choose your bet, hit the exact target time, and win up to 5×. Your timing is your skill.
            </motion.p>
            <motion.div variants={fadeUp} custom={3} className="mt-9 flex flex-wrap items-center gap-4">
              <Link to="/register" data-testid="hero-cta"
                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors pz-glow-box">
                Master Your Timing <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/support" className="px-6 py-3.5 rounded-full border border-white/15 hover:border-white/40 font-medium transition-colors text-white/80">How it works</Link>
            </motion.div>
            <motion.div variants={fadeUp} custom={4} className="mt-12 grid grid-cols-3 gap-6 max-w-md">
              {[["5×", "Fixed payout"], ["1.5×", "1v1 duel"], ["Live", "Multiplayer"]].map(([a, b]) => (
                <div key={b}><div className="font-mono-pz text-2xl font-bold text-pazer-red">{a}</div><div className="text-xs text-white/40 uppercase tracking-wider mt-1">{b}</div></div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 md:px-8 py-16">
        <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight mb-3">Three ways to compete</h2>
        <p className="text-white/50 mb-10 max-w-xl">Solo precision, head-to-head duels, or live multiplayer showdowns.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: Target, t: "Fixed Challenge", d: "Pick your bet, stop exactly at the target. Win 5×.", tag: "5× payout" },
            { icon: Swords, t: "1v1 Duel", d: "Two players, 50 coins. Closest to target wins 1.5×.", tag: "Head to head" },
            { icon: Users, t: "Multiplayer", d: "Up to 25 players per room. Closest wins the pool.", tag: "Live rooms" },
          ].map((f, i) => (
            <motion.div key={f.t} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
              className="rounded-2xl pz-glass p-6">
              <f.icon className="h-7 w-7 text-pazer-red mb-4" />
              <div className="text-[10px] font-mono-pz uppercase tracking-widest text-pazer-red/70 mb-1">{f.tag}</div>
              <h3 className="font-semibold text-lg mb-1">{f.t}</h3>
              <p className="text-white/50 text-sm">{f.d}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {[
            { icon: Zap, t: "High-res timing", d: "Millisecond precision from the browser performance clock." },
            { icon: ShieldCheck, t: "Server-verified", d: "Every result validated server-side. No cheating." },
            { icon: Trophy, t: "Instant payouts", d: "Prizes hit your wallet the moment you win." },
          ].map((f, i) => (
            <motion.div key={f.t} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
              className="rounded-2xl pz-glass p-6 flex items-center gap-4">
              <f.icon className="h-6 w-6 text-pazer-red shrink-0" />
              <div><h3 className="font-semibold">{f.t}</h3><p className="text-white/50 text-sm">{f.d}</p></div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 md:px-8 py-12 pb-24">
        <div className="relative rounded-3xl overflow-hidden bg-pazer-red p-10 md:p-16 text-center">
          <img src={ARENA} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
          <div className="relative">
            <h2 className="font-display font-extrabold text-3xl md:text-5xl tracking-tight mb-4">Ready to test your timing?</h2>
            <p className="text-white/80 mb-8 max-w-lg mx-auto">Join TIMEUP and turn milliseconds into wins.</p>
            <Link to="/register" className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-black text-white font-bold hover:bg-black/80 transition-colors">
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-center text-white/40 text-sm">
        <img src={LOGO_URL} alt="TIMEUP" className="h-6 w-auto mx-auto mb-2 opacity-80" />
        <p>Skill-based timing game · Play responsibly · 18+</p>
      </footer>
    </div>
  );
}
