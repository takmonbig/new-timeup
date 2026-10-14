import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Timer, Plane, Castle, ChevronRight, Gamepad2 } from "lucide-react";
import { DailyReward } from "@/components/DailyReward";

const IMG = "https://static.prod-images.emergentagent.com/jobs/670c5923-c1f4-4298-9135-36fea583d12c/images/";
const GAMES = [
  { id: "stopwatch", to: "/games/stopwatch", title: "Stopwatch", tag: "Win 5×", desc: "Stop the clock exactly on target.", icon: Timer,
    img: IMG + "3e91b1e43f580947843cce37c5bd3b2f78409a9a5bd0c0b6760c17c331142988.jpeg" },
  { id: "aviator", to: "/games/aviator", title: "Aviator", tag: "Up to 100×", desc: "Cash out before the plane flies away.", icon: Plane,
    img: IMG + "717f36ec2192ac9731af75616c523b892cbceddb3b3b474e1298b63f7f9224ec.jpeg" },
  { id: "tower", to: "/games/tower", title: "Tower", tag: "Climb & win", desc: "Pick safe tiles, dodge the bombs.", icon: Castle,
    img: IMG + "ac37d044145e261752683c651aedb3895405c487573fd4143c78f26f1d74dc0e.jpeg" },
];

function GameCard({ g, i }) {
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i, duration: 0.45 }}>
      <Link to={g.to} data-testid={`hub-card-${g.id}`}
        className="group relative block h-44 overflow-hidden rounded-3xl border border-white/10 hover:border-pazer-red/60 transition-colors">
        <img src={g.img} alt={g.title} className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent" />
        <div className="relative h-full flex flex-col justify-between p-5">
          <span className="self-start rounded-full bg-pazer-red/90 px-3 py-1 text-[11px] font-bold tracking-wide uppercase">{g.tag}</span>
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-2"><g.icon className="h-5 w-5 text-pazer-red" />
                <h2 className="font-display font-extrabold text-2xl tracking-tight">{g.title}</h2></div>
              <p className="text-white/60 text-sm mt-1">{g.desc}</p>
            </div>
            <span className="h-11 w-11 shrink-0 rounded-full bg-white/10 group-hover:bg-pazer-red flex items-center justify-center transition-colors">
              <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export default function GamesHub() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-40" data-testid="games-hub">
      <DailyReward />
      <div className="flex items-center gap-2 mb-1">
        <Gamepad2 className="h-5 w-5 text-pazer-red" />
        <h1 className="font-display font-bold text-2xl tracking-tight">Games</h1>
      </div>
      <p className="text-white/50 text-sm mb-6">Pick your game. Skill, nerve and timing win coins.</p>
      <div className="space-y-4">{GAMES.map((g, i) => <GameCard key={g.id} g={g} i={i} />)}</div>
    </div>
  );
}
