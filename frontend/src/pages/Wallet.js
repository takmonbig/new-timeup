import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Wallet as WalletIcon, ArrowDownToLine, ArrowUpFromLine, Loader2, Gift } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const TYPE_LABEL = {
  deposit: "Deposit", bonus: "Bonus", game_entry: "Game Entry",
  prize: "Prize", refund: "Refund", withdrawal: "Withdrawal",
};

export default function Wallet() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [txns, setTxns] = useState([]);
  const [modal, setModal] = useState(null); // 'deposit' | 'withdraw'
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/wallet").then(({ data }) => setWallet(data)).catch(() => {});
    api.get("/wallet/transactions").then(({ data }) => setTxns(data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    api.get("/config/public").then(({ data }) => setCfg(data)).catch(() => {});
  }, [load]);

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    setBusy(true);
    try {
      if (modal === "deposit") {
        const { data } = await api.post("/wallet/deposit", { amount: amt });
        toast.success(`Deposited ${data.coins} coins${data.bonus ? ` + ${data.bonus} bonus` : ""}!`);
      } else {
        await api.post("/wallet/withdraw", { amount: amt });
        toast.success("Withdrawal request submitted for review");
      }
      setModal(null);
      setAmount("");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const bonusPreview = () => {
    if (modal !== "deposit" || !cfg?.wallet?.bonus_enabled) return 0;
    const amt = parseFloat(amount) || 0;
    return Math.min(amt * cfg.wallet.bonus_percentage / 100, cfg.wallet.max_bonus);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-8 py-10">
      <div className="flex items-center gap-3 mb-6">
        <WalletIcon className="h-6 w-6 text-pazer-red" />
        <h1 className="font-display font-bold text-3xl tracking-tight">Wallet</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="md:col-span-2 rounded-2xl bg-pazer-red p-8 relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 opacity-20"><WalletIcon className="h-40 w-40" /></div>
          <div className="relative">
            <div className="text-white/80 text-sm uppercase tracking-widest">Total Balance</div>
            <div className="font-mono-pz font-extrabold text-5xl mt-1" data-testid="wallet-total">{wallet ? wallet.total_balance.toLocaleString() : "…"}</div>
            <div className="flex gap-6 mt-4 text-sm text-white/80">
              <div>Main <span className="font-mono-pz font-bold text-white">{wallet?.main_balance?.toLocaleString() ?? 0}</span></div>
              <div>Bonus <span className="font-mono-pz font-bold text-white">{wallet?.bonus_balance?.toLocaleString() ?? 0}</span></div>
            </div>
          </div>
        </motion.div>
        <div className="grid grid-rows-2 gap-4">
          <button onClick={() => setModal("deposit")} data-testid="open-deposit"
            className="rounded-2xl pz-glass p-6 flex items-center gap-4 hover:border-pazer-red/50 transition-colors">
            <ArrowDownToLine className="h-6 w-6 text-green-400" />
            <div className="text-left"><div className="font-bold">Deposit</div><div className="text-white/40 text-xs">Add coins + bonus</div></div>
          </button>
          <button onClick={() => setModal("withdraw")} data-testid="open-withdraw"
            className="rounded-2xl pz-glass p-6 flex items-center gap-4 hover:border-pazer-red/50 transition-colors">
            <ArrowUpFromLine className="h-6 w-6 text-pazer-red" />
            <div className="text-left"><div className="font-bold">Withdraw</div><div className="text-white/40 text-xs">Requires KYC</div></div>
          </button>
        </div>
      </div>

      <div className="rounded-2xl pz-glass p-6">
        <h2 className="font-display font-bold text-xl mb-4">Transaction History</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-white/40 text-xs uppercase tracking-wider border-b border-white/10">
              <th className="text-left py-3 font-medium">Date</th>
              <th className="text-left py-3 font-medium">Type</th>
              <th className="text-left py-3 font-medium">Txn ID</th>
              <th className="text-right py-3 font-medium">Amount</th>
              <th className="text-right py-3 font-medium">Status</th>
            </tr></thead>
            <tbody data-testid="txn-table">
              {txns.map((t) => (
                <tr key={t.id} className="border-b border-white/5 last:border-0">
                  <td className="py-3 text-white/60">{new Date(t.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                  <td className="py-3">{TYPE_LABEL[t.type] || t.type}</td>
                  <td className="py-3 font-mono-pz text-xs text-white/40">{t.txn_id}</td>
                  <td className={`py-3 text-right font-mono-pz font-bold ${t.amount >= 0 ? "text-green-400" : "text-white/70"}`}>{t.amount >= 0 ? "+" : ""}{t.amount}</td>
                  <td className="py-3 text-right"><span className={`text-xs px-2 py-0.5 rounded-full ${t.status === "success" ? "bg-green-400/10 text-green-400" : t.status === "pending" ? "bg-yellow-400/10 text-yellow-400" : t.status === "refunded" ? "bg-blue-400/10 text-blue-400" : "bg-white/5 text-white/50"}`}>{t.status}</span></td>
                </tr>
              ))}
              {txns.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-white/40">No transactions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!modal} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="bg-pazer-card border-white/10 text-white">
          <DialogHeader><DialogTitle className="font-display capitalize">{modal}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Amount (₹ / coins)</label>
              <input data-testid="amount-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 focus:border-pazer-red outline-none font-mono-pz text-lg" />
            </div>
            {modal === "deposit" && (
              <>
                <div className="flex gap-2">
                  {[100, 500, 1000, 2000].map((v) => (
                    <button key={v} onClick={() => setAmount(String(v))} className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-mono-pz transition-colors">{v}</button>
                  ))}
                </div>
                {bonusPreview() > 0 && (
                  <div className="flex items-center gap-2 text-green-400 text-sm bg-green-400/10 rounded-lg px-4 py-3">
                    <Gift className="h-4 w-4" /> +{bonusPreview().toFixed(0)} bonus coins ({cfg?.wallet?.bonus_percentage}%)
                  </div>
                )}
                <p className="text-xs text-white/40">Demo gateway · Min ₹{cfg?.wallet?.min_deposit}. No real money is charged.</p>
              </>
            )}
            {modal === "withdraw" && (
              <p className="text-xs text-white/40">Min {cfg?.wallet?.min_withdrawal} coins. Requires verified KYC. Reviewed by admin.</p>
            )}
            <button onClick={submit} disabled={busy} data-testid="submit-txn"
              className="w-full py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirm {modal}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
