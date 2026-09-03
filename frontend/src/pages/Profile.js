import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { User, ShieldCheck, BadgeCheck, Loader2, Copy } from "lucide-react";
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
  const [kyc, setKyc] = useState({ full_name: "", document_type: "aadhaar", document_number: "", dob: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get("/stats").then(({ data }) => setStats(data)).catch(() => {}); }, []);

  const submitKyc = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/kyc", kyc);
      toast.success("KYC submitted for review");
      refreshUser();
    } catch (e2) {
      toast.error(formatApiError(e2.response?.data?.detail));
    } finally { setBusy(false); }
  };

  const badge = KYC_BADGE[user?.kyc_status] || KYC_BADGE.not_submitted;

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-8 py-10">
      <div className="flex items-center gap-3 mb-6">
        <User className="h-6 w-6 text-pazer-red" />
        <h1 className="font-display font-bold text-3xl tracking-tight">Profile</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl pz-glass p-6">
          <div className="h-16 w-16 rounded-full bg-pazer-red flex items-center justify-center font-display font-extrabold text-2xl mb-4">
            {(user?.display_name || user?.username || "?")[0].toUpperCase()}
          </div>
          <h2 className="font-display font-bold text-xl">{user?.display_name}</h2>
          <p className="text-white/50 text-sm">@{user?.username}</p>
          <p className="text-white/50 text-sm mt-1">{user?.email}</p>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-white/40">User ID</span>
              <button onClick={() => { navigator.clipboard.writeText(user?.id); toast("Copied"); }} className="font-mono-pz text-xs flex items-center gap-1 hover:text-pazer-red transition-colors">
                {user?.id?.slice(0, 10)}… <Copy className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center justify-between"><span className="text-white/40">Status</span><span className="text-green-400 capitalize">{user?.status}</span></div>
            <div className="flex items-center justify-between"><span className="text-white/40">KYC</span><span className={`text-xs px-2 py-0.5 rounded-full ${badge.c}`}>{badge.t}</span></div>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-2xl pz-glass p-6">
          <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2"><BadgeCheck className="h-5 w-5 text-pazer-red" />Game Statistics</h3>
          <div className="grid grid-cols-2 gap-4">
            {[["Played", stats?.games_played], ["Won", stats?.games_won], ["Win Rate", `${stats?.win_rate ?? 0}%`], ["Lost", stats?.games_lost], ["Entries", stats?.total_entries], ["Prizes", stats?.total_prizes]].map(([l, v]) => (
              <div key={l}><div className="font-mono-pz text-2xl font-bold">{v ?? 0}</div><div className="text-xs text-white/40 uppercase tracking-wider">{l}</div></div>
            ))}
          </div>
        </motion.div>

        {/* KYC */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-2xl pz-glass p-6">
          <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-pazer-red" />KYC Verification</h3>
          {user?.kyc_status === "verified" ? (
            <div className="text-center py-6">
              <BadgeCheck className="h-12 w-12 text-green-400 mx-auto mb-2" />
              <p className="text-white/60 text-sm">Your identity is verified. Withdrawals enabled.</p>
            </div>
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
    </div>
  );
}
