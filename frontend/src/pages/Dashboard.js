import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Wallet, Gamepad2, Users, Trophy, TrendingUp, Target, ArrowUpRight, Percent } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const stagger = { show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

export default function Dashboard() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [stats, setStats] = useState(null);
  const [games, setGames] = useState([]);

  useEffect(() => {
    api.get("/wallet").then(({ data }) => setWallet(data)).catch(() => {});
    api.get("/stats").then(({ data }) => setStats(data)).catch(() => {});
    api.get("/games/history").then(({ data }) => setGames(data.slice(0, 6))).catch(() => {});
  }, []);

  const statCards = [
    { label: "Games Played", value: stats?.games_played ?? 0, icon: Gamepad2 },
    { label: "Games Won", value: stats?.games_won ?? 0, icon: Trophy },
    { label: "Win Rate", value: `${stats?.win_rate ?? 0}%`, icon: Percent },
    { label: "Total Prizes", value: (stats?.total_prizes ?? 0).toLocaleString(), icon: TrendingUp },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-8 py-10">
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-display font-bold text-3xl md:text-4xl tracking-tight">
        Welcome, <span className="text-pazer-red">{user?.display_name || user?.username}</span>
      </motion.h1>
      <p className="text-white/50 mt-2 mb-8">Your arena at a glance.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Wallet card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 relative overflow-hidden rounded-2xl bg-pazer-red p-8">
          <div className="absolute -right-8 -bottom-8 opacity-20"><Wallet className="h-48 w-48" /></div>
          <div className="relative">
            <div className="text-white/80 text-sm uppercase tracking-widest mb-2">Available Balance</div>
            <div className="font-mono-pz font-extrabold text-5xl md:text-6xl" data-testid="dashboard-balance">
              {wallet ? wallet.total_balance.toLocaleString() : "…"}
            </div>
            <div className="text-white/70 text-sm mt-1">
              Main {wallet?.main_balance?.toLocaleString() ?? 0} · Bonus {wallet?.bonus_balance?.toLocaleString() ?? 0} coins
            </div>
            <div className="flex gap-3 mt-6">
              <Link to="/wallet" data-testid="dashboard-deposit" className="px-6 py-2.5 rounded-full bg-black text-white font-bold text-sm hover:bg-black/80 transition-colors">Deposit</Link>
              <Link to="/wallet" data-testid="dashboard-withdraw" className="px-6 py-2.5 rounded-full bg-black/20 border border-black/30 text-white font-bold text-sm hover:bg-black/30 transition-colors">Withdraw</Link>
            </div>
          </div>
        </motion.div>

        {/* Quick play */}
        <div className="grid grid-rows-2 gap-4">
          <Link to="/play" data-testid="dashboard-play-fixed" className="group rounded-2xl pz-glass p-6 flex items-center justify-between hover:border-pazer-red/50 transition-colors">
            <div>
              <Target className="h-6 w-6 text-pazer-red mb-2" />
              <div className="font-display font-bold text-lg">Fixed Challenge</div>
              <div className="text-white/50 text-sm">Solo precision run</div>
            </div>
            <ArrowUpRight className="h-5 w-5 text-white/30 group-hover:text-pazer-red group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
          </Link>
          <Link to="/rooms" data-testid="dashboard-play-rooms" className="group rounded-2xl pz-glass p-6 flex items-center justify-between hover:border-pazer-red/50 transition-colors">
            <div>
              <Users className="h-6 w-6 text-pazer-red mb-2" />
              <div className="font-display font-bold text-lg">Multiplayer Rooms</div>
              <div className="text-white/50 text-sm">Beat the room</div>
            </div>
            <ArrowUpRight className="h-5 w-5 text-white/30 group-hover:text-pazer-red group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
          </Link>
        </div>
      </div>

      {/* Stats */}
      <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {statCards.map((s) => (
          <motion.div key={s.label} variants={item} className="rounded-2xl pz-glass p-5">
            <s.icon className="h-5 w-5 text-pazer-red mb-3" />
            <div className="font-mono-pz text-2xl font-bold">{s.value}</div>
            <div className="text-xs text-white/40 uppercase tracking-wider mt-1">{s.label}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* Recent games */}
      <div className="rounded-2xl pz-glass p-6">
        <h2 className="font-display font-bold text-xl mb-4">Recent Games</h2>
        {games.length === 0 ? (
          <p className="text-white/40 text-sm py-6 text-center">No games yet. Start your first challenge!</p>
        ) : (
          <div className="space-y-2">
            {games.map((g) => (
              <div key={g.id} data-testid="recent-game-row" className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`h-2 w-2 rounded-full ${g.result === "won" ? "bg-green-400" : "bg-white/20"}`} />
                  <div>
                    <div className="font-medium text-sm capitalize">{g.mode} · {g.target}s</div>
                    <div className="text-xs text-white/40 font-mono-pz">
                      {g.recorded != null ? `Stopped ${g.recorded}s · Δ${g.diff}s` : "Not recorded"}
                    </div>
                  </div>
                </div>
                <div className={`font-mono-pz font-bold text-sm ${g.result === "won" ? "text-green-400" : "text-white/40"}`}>
                  {g.result === "won" ? `+${g.prize}` : `-${g.entry_fee}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
