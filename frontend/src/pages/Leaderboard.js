import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Trophy, Crown, Medal, Flame } from "lucide-react";
import api from "@/lib/api";

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/leaderboard/weekly").then(({ data }) => setRows(data)).catch(() => {}); }, []);

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean); // 2,1,3

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center gap-2 mb-1">
        <Trophy className="h-5 w-5 text-pazer-red" />
        <h1 className="font-display font-bold text-2xl tracking-tight">Weekly Ranks</h1>
      </div>
      <p className="text-white/50 text-sm mb-6">Top timing masters this week. <span className="text-pazer-red">Fresh every day.</span></p>

      {/* Podium */}
      <div className="grid grid-cols-3 gap-3 items-end mb-6">
        {podiumOrder.map((p, idx) => {
          const rank = p.rank;
          const h = rank === 1 ? "h-32" : rank === 2 ? "h-24" : "h-20";
          const color = rank === 1 ? "bg-pazer-red" : "bg-white/10";
          return (
            <motion.div key={p.name + rank} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}
              className="flex flex-col items-center">
              {rank === 1 ? <Crown className="h-6 w-6 text-pazer-red mb-1" /> : <Medal className="h-5 w-5 text-white/40 mb-1" />}
              <div className="font-semibold text-sm text-center truncate w-full">{p.name}</div>
              <div className="font-mono-pz text-green-400 text-sm mb-2">{p.coins.toLocaleString()}</div>
              <div className={`w-full ${h} ${color} rounded-t-xl flex items-start justify-center pt-2 font-display font-extrabold text-2xl`}>{rank}</div>
            </motion.div>
          );
        })}
      </div>

      {/* Rest */}
      <div className="rounded-2xl pz-glass p-2" data-testid="leaderboard-list">
        {rest.map((p, i) => (
          <motion.div key={p.rank} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
            className={`flex items-center justify-between px-4 py-3 rounded-xl ${p.is_you ? "bg-pazer-red/15 border border-pazer-red/30" : ""}`}>
            <div className="flex items-center gap-3">
              <span className="font-mono-pz font-bold text-white/40 w-6">#{p.rank}</span>
              <span className={p.is_you ? "text-pazer-red font-semibold" : ""}>{p.name}{p.is_you ? " (You)" : ""}</span>
            </div>
            <span className="font-mono-pz font-bold text-green-400 text-sm flex items-center gap-1">
              {p.coins.toLocaleString()} <Flame className="h-3.5 w-3.5" />
            </span>
          </motion.div>
        ))}
        {rows.length === 0 && <p className="text-center py-10 text-white/40">No rankings yet.</p>}
      </div>
    </div>
  );
}
