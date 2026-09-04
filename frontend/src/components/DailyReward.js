import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, Flame, Loader2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { showPopup } from "@/components/CenterPopup";

export function DailyReward() {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  const load = () => api.get("/streak").then(({ data }) => setInfo(data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const claim = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/streak/claim");
      showPopup({ type: "success", title: "Reward claimed!", message: `+${data.bonus} coins · ${data.streak}-day streak!` });
      window.dispatchEvent(new Event("wallet:refresh"));
      setInfo({ ...info, can_claim: false, streak: data.streak });
    } catch (e) { showPopup({ type: "warning", title: "Can't claim", message: formatApiError(e.response?.data?.detail) }); }
    finally { setBusy(false); }
  };

  if (!info || !info.enabled || hidden) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
        className="rounded-2xl pz-glass p-4 mb-5 flex items-center gap-3" data-testid="daily-reward">
        <div className="h-11 w-11 rounded-xl bg-pazer-red/15 flex items-center justify-center shrink-0">
          {info.can_claim ? <Gift className="h-5 w-5 text-pazer-red" /> : <Flame className="h-5 w-5 text-pazer-red" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm">
            {info.can_claim ? `Daily reward: +${info.daily_bonus} coins` : `You're on a ${info.streak}-day streak!`}
          </div>
          <div className="text-white/45 text-xs">{info.can_claim ? "Claim your bonus and keep the streak alive" : "Come back tomorrow for more"}</div>
        </div>
        {info.can_claim ? (
          <button onClick={claim} disabled={busy} data-testid="claim-streak-btn"
            className="px-4 py-2 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold text-sm transition-colors flex items-center gap-1.5 shrink-0">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Claim
          </button>
        ) : (
          <div className="font-mono-pz font-bold text-pazer-red flex items-center gap-1 shrink-0"><Flame className="h-4 w-4" />{info.streak}</div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
