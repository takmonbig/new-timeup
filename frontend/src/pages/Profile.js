import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { User, ShieldCheck, BadgeCheck, Loader2, Copy, Wallet as WalletIcon, Trophy, Target, TrendingUp, Flame, Phone } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const KYC_BADGE = {
  not_submitted: { t: "Not Submitted", c: "bg-white/10 text-white/60" },
  pending: { t: "Under Review", c: "bg-yellow-400/10 text-yellow-400" },
  verified: { t: "Verified", c: "bg-green-400/10 text-green-400" },
  rejected: { t: "Rejected", c: "bg-pazer-red/10 text-pazer-red" },
};

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [kyc, setKyc] = useState({ full_name: "", document_type: "aadhaar", document_number: "", dob: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/stats").then(({ data }) => setStats(data)).catch(() => {});
    api.get("/wallet").then(({ data }) => setWallet(data)).catch(() => {});
  }, []);

  const submitKyc = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await api.post("/kyc", kyc);
      toast.success("KYC submitted for review"); refreshUser();
    } catch (e2) { toast.error(formatApiError(e2.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const badge = KYC_BADGE[user?.kyc_status] || KYC_BADGE.not_submitted;
  const played = stats?.games_played ?? 0;
  const won = stats?.games_won ?? 0;
  const lost = stats?.games_lost ?? 0;
  const winRate = stats?.win_rate ?? 0;
  const lossRate = played ? Math.round((lost / played) * 100) : 0;

  const bigStats = [
    { icon: WalletIcon, label: "Balance", value: (wallet?.total_balance ?? 0).toLocaleString(), color: "text-pazer-red" },
    { icon: Target, label: "Games Played", value: played, color: "text-white" },
    { icon: Trophy, label: "Games Won", value: won, color: "text-green-400" },
    { icon: TrendingUp, label: "Total Prizes", value: (stats?.total_prizes ?? 0).toLocaleString(), color: "text-green-400" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Identity card */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl pz-glass p-6 flex items-center gap-4 mb-4">
        <div className="h-16 w-16 rounded-2xl bg-pazer-red flex items-center justify-center font-display font-extrabold text-2xl shrink-0">
          {(user?.display_name || "?")[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="font-display font-bold text-xl truncate">{user?.display_name}</h1>
          <button onClick={() => { navigator.clipboard.writeText(user?.username); toast("Username copied"); }}
            className="text-sm text-white/50 flex items-center gap-1 hover:text-pazer-red transition-colors" data-testid="profile-username">
            @{user?.username} <Copy className="h-3 w-3" />
          </button>
          <div className="flex items-center gap-3 mt-1 text-xs text-white/40">
            <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{user?.mobile}</span>
            <span className={`px-2 py-0.5 rounded-full ${badge.c}`}>KYC · {badge.t}</span>
          </div>
        </div>
      </motion.div>

      {/* Motivational banner */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="rounded-2xl bg-pazer-red p-5 mb-4 flex items-center gap-3">
        <Flame className="h-8 w-8 shrink-0" />
        <div>
          <div className="font-display font-bold text-lg leading-tight">
            {winRate >= 50 ? "You're on fire! Keep the streak going." : played === 0 ? "Play your first game to build your streak!" : "Sharpen your timing — your next win is close!"}
          </div>
          <div className="text-white/80 text-sm">Win rate {winRate}% · {won} wins from {played} games</div>
        </div>
      </motion.div>

      {/* Big stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {bigStats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.04 }}
            className="rounded-2xl pz-glass p-4">
            <s.icon className={`h-5 w-5 mb-2 ${s.color}`} />
            <div className={`font-mono-pz text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-white/40 uppercase tracking-wider mt-0.5">{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Win/Loss ratio bars */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-2xl pz-glass p-6 mb-4">
        <h3 className="font-display font-bold text-lg mb-4">Performance</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1"><span className="text-green-400">Win ratio</span><span className="font-mono-pz">{winRate}%</span></div>
            <div className="h-2.5 bg-black/40 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${winRate}%` }} transition={{ duration: 0.8 }} className="h-full bg-green-400 rounded-full" /></div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1"><span className="text-pazer-red">Loss ratio</span><span className="font-mono-pz">{lossRate}%</span></div>
            <div className="h-2.5 bg-black/40 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${lossRate}%` }} transition={{ duration: 0.8 }} className="h-full bg-pazer-red rounded-full" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div><div className="font-mono-pz text-lg font-bold">{lost}</div><div className="text-xs text-white/40">Losses</div></div>
            <div><div className="font-mono-pz text-lg font-bold">{(stats?.total_entries ?? 0).toLocaleString()}</div><div className="text-xs text-white/40">Total Entries</div></div>
            <div><div className="font-mono-pz text-lg font-bold text-green-400">{wallet?.bonus_balance?.toLocaleString() ?? 0}</div><div className="text-xs text-white/40">Bonus Coins</div></div>
          </div>
        </div>
      </motion.div>

      {/* KYC */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="rounded-2xl pz-glass p-6">
        <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-pazer-red" />KYC Verification</h3>
        {user?.kyc_status === "verified" ? (
          <div className="text-center py-4"><BadgeCheck className="h-12 w-12 text-green-400 mx-auto mb-2" /><p className="text-white/60 text-sm">Verified. Withdrawals enabled.</p></div>
        ) : (
          <form onSubmit={submitKyc} className="space-y-3">
            <input required placeholder="Full legal name" value={kyc.full_name} onChange={(e) => setKyc({ ...kyc, full_name: e.target.value })} data-testid="kyc-name"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:border-pazer-red outline-none transition-colors" />
            <select value={kyc.document_type} onChange={(e) => setKyc({ ...kyc, document_type: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:border-pazer-red outline-none">
              <option value="aadhaar">Aadhaar</option><option value="pan">PAN</option><option value="passport">Passport</option>
            </select>
            <input required placeholder="Document number" value={kyc.document_number} onChange={(e) => setKyc({ ...kyc, document_number: e.target.value })} data-testid="kyc-docnum"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:border-pazer-red outline-none transition-colors" />
            <button disabled={busy} data-testid="kyc-submit" className="w-full py-2.5 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit KYC
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
