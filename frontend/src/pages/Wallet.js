import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Wallet as WalletIcon, ArrowDownToLine, ArrowUpFromLine, Loader2, Copy, Check, Upload, Clock, XCircle, CheckCircle2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { showPopup } from "@/components/CenterPopup";

const TYPE_LABEL = {
  deposit: "Deposit", bonus: "Bonus", game_entry: "Game Entry", prize: "Prize",
  refund: "Refund", withdrawal: "Withdrawal", referral: "Referral", admin_credit: "Admin Credit", admin_debit: "Admin Debit",
};

function CopyField({ label, value }) {
  const [c, setC] = useState(false);
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-black/40 rounded-lg px-3 py-2.5 font-mono-pz text-sm break-all">{value}</div>
        <button onClick={() => { navigator.clipboard.writeText(value); setC(true); setTimeout(() => setC(false), 1200); }}
          className="h-10 w-10 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
          {c ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function Wallet() {
  const [params, setParams] = useSearchParams();
  const [wallet, setWallet] = useState(null);
  const [pay, setPay] = useState(null);
  const [txns, setTxns] = useState([]);
  const [requests, setRequests] = useState([]);
  const [modal, setModal] = useState(null); // 'deposit' | 'withdraw'
  const [method, setMethod] = useState("upi");
  const [amount, setAmount] = useState("");
  const [proof, setProof] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resubmitFor, setResubmitFor] = useState(null);

  const load = useCallback(() => {
    api.get("/wallet").then(({ data }) => setWallet(data)).catch(() => {});
    api.get("/wallet/transactions").then(({ data }) => setTxns(data)).catch(() => {});
    api.get("/wallet/deposit-requests").then(({ data }) => setRequests(data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    api.get("/payment-info").then(({ data }) => setPay(data)).catch(() => {});
  }, [load]);

  useEffect(() => {
    if (params.get("deposit")) {
      setModal("deposit"); setMethod("upi"); setAmount(params.get("deposit"));
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line
  }, [params]);

  const uploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "payment_proof");
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setProof(data.url);
    } catch (e) {
      showPopup({ type: "warning", title: "Upload failed", message: formatApiError(e.response?.data?.detail) });
    } finally { setUploading(false); }
  };

  const submitDeposit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return showPopup({ type: "warning", title: "Enter amount", message: "Please enter a valid amount." });
    if (!proof) return showPopup({ type: "warning", title: "Screenshot required", message: "Upload your payment screenshot to continue." });
    setBusy(true);
    try {
      if (resubmitFor) {
        await api.post(`/wallet/deposit-requests/${resubmitFor}/resubmit`, { screenshot_url: proof });
      } else {
        await api.post("/wallet/deposit", { method, amount: amt, screenshot_url: proof });
      }
      showPopup({ type: "success", title: "Payment submitted", message: "Our team will verify and credit your wallet shortly (usually within 30 seconds)." });
      closeDeposit();
      load();
    } catch (e) {
      showPopup({ type: "warning", title: "Couldn't submit", message: formatApiError(e.response?.data?.detail) });
    } finally { setBusy(false); }
  };

  const submitWithdraw = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return showPopup({ type: "warning", title: "Enter amount", message: "Please enter a valid amount." });
    setBusy(true);
    try {
      await api.post("/wallet/withdraw", { amount: amt });
      showPopup({ type: "success", title: "Request submitted", message: "Your withdrawal is under review." });
      setModal(null); setAmount(""); load();
      window.dispatchEvent(new Event("wallet:refresh"));
    } catch (e) {
      showPopup({ type: "warning", title: "Couldn't submit", message: formatApiError(e.response?.data?.detail) });
    } finally { setBusy(false); }
  };

  const openDeposit = (m = "upi") => { setModal("deposit"); setMethod(m); setAmount(""); setProof(""); setResubmitFor(null); };
  const closeDeposit = () => { setModal(null); setAmount(""); setProof(""); setResubmitFor(null); };
  const startResubmit = (req) => { setModal("deposit"); setMethod(req.method); setAmount(String(req.amount)); setProof(""); setResubmitFor(req.req_id); };

  const cfgM = pay?.[method] || {};
  const coins = method === "usdt" ? (parseFloat(amount) || 0) * (pay?.usdt?.rate || 100) : (parseFloat(amount) || 0) * (pay?.inr_rate || 1);
  const showUpiId = method === "upi" && (parseFloat(amount) || 0) > (pay?.upi?.upi_id_threshold || 1999);

  const REQ_STATUS = {
    pending: { c: "bg-yellow-400/10 text-yellow-400", Icon: Clock, t: "Verifying" },
    approved: { c: "bg-green-400/10 text-green-400", Icon: CheckCircle2, t: "Approved" },
    rejected: { c: "bg-pazer-red/10 text-pazer-red", Icon: XCircle, t: "Problem" },
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
          <button onClick={() => openDeposit("upi")} data-testid="open-deposit"
            className="rounded-2xl pz-glass p-6 flex items-center gap-4 hover:border-pazer-red/50 transition-colors">
            <ArrowDownToLine className="h-6 w-6 text-green-400" />
            <div className="text-left"><div className="font-bold">Recharge</div><div className="text-white/40 text-xs">UPI / USDT (TRC20)</div></div>
          </button>
          <button onClick={() => { setModal("withdraw"); setAmount(""); }} data-testid="open-withdraw"
            className="rounded-2xl pz-glass p-6 flex items-center gap-4 hover:border-pazer-red/50 transition-colors">
            <ArrowUpFromLine className="h-6 w-6 text-pazer-red" />
            <div className="text-left"><div className="font-bold">Withdraw</div><div className="text-white/40 text-xs">Requires KYC</div></div>
          </button>
        </div>
      </div>

      {/* Deposit requests */}
      {requests.length > 0 && (
        <div className="rounded-2xl pz-glass p-6 mb-6">
          <h2 className="font-display font-bold text-xl mb-4">Recharge Requests</h2>
          <div className="space-y-2" data-testid="deposit-requests">
            {requests.map((r) => {
              const s = REQ_STATUS[r.status] || REQ_STATUS.pending;
              return (
                <div key={r.req_id} className="flex items-center justify-between bg-black/40 rounded-xl px-4 py-3 gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">{r.amount_label} <span className="text-white/40">· {r.method.toUpperCase()}</span></div>
                    <div className="text-xs text-white/40 font-mono-pz">{r.req_id} · +{r.coins} coins</div>
                    {r.status === "rejected" && r.problem && <div className="text-xs text-pazer-red mt-1 max-w-md">{r.problem}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2.5 py-1 rounded-full flex items-center gap-1 ${s.c}`}><s.Icon className="h-3 w-3" />{s.t}</span>
                    {r.status === "rejected" && (
                      <button onClick={() => startResubmit(r)} data-testid={`resubmit-${r.req_id}`}
                        className="text-xs px-3 py-1.5 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors">Upload again</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Transaction history */}
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

      {/* DEPOSIT MODAL */}
      <Dialog open={modal === "deposit"} onOpenChange={(o) => !o && closeDeposit()}>
        <DialogContent className="bg-pazer-card border-white/10 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">{resubmitFor ? "Re-upload Payment" : "Recharge Wallet"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {!resubmitFor && (
              <div className="flex gap-2">
                {["upi", "usdt"].map((m) => (
                  (pay?.[m]?.enabled !== false) && (
                    <button key={m} data-testid={`deposit-method-${m}`} onClick={() => { setMethod(m); setAmount(""); }}
                      className={`flex-1 py-2.5 rounded-full text-sm font-bold uppercase transition-colors ${method === m ? "bg-pazer-red text-white" : "bg-white/5 text-white/60"}`}>
                      {m === "upi" ? "UPI (₹)" : "USDT (TRC20)"}
                    </button>
                  )
                ))}
              </div>
            )}

            {/* Payment target details */}
            <div className="rounded-xl bg-black/40 p-4 space-y-3">
              {cfgM.name && method === "upi" && <div className="text-center text-sm font-semibold text-white/80">Pay to: {cfgM.name}</div>}
              {cfgM.qr_url ? (
                <div className="flex flex-col items-center gap-2">
                  <img src={cfgM.qr_url} alt="Payment QR" className="h-44 w-44 rounded-xl object-contain bg-white p-2" data-testid="payment-qr" />
                  <a href={cfgM.qr_url} download target="_blank" rel="noreferrer" className="text-xs text-pazer-red hover:underline">Download QR</a>
                </div>
              ) : (
                <p className="text-xs text-white/40 text-center py-4">QR not configured yet. Use the {method === "upi" ? "UPI ID" : "wallet address"} below or contact support.</p>
              )}
              {method === "upi" ? (
                <>
                  <CopyField label="UPI ID" value={cfgM.upi_id} />
                  {showUpiId && <p className="text-xs text-yellow-400">Amount above ₹{cfgM.upi_id_threshold} — please pay using the UPI ID above.</p>}
                </>
              ) : (
                <>
                  <CopyField label={`Wallet Address (${cfgM.network || "TRC20"})`} value={cfgM.wallet_address} />
                  <p className="text-xs text-white/50">Rate: 1 USDT = {cfgM.rate || 100} coins · Min {pay?.min_usdt_deposit || 10} USDT</p>
                </>
              )}
              {cfgM.note && <p className="text-[11px] text-white/40">⚠️ {cfgM.note}</p>}
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">{method === "usdt" ? "Amount (USDT)" : "Amount (₹)"}</label>
              <input data-testid="deposit-amount" type="number" value={amount} disabled={!!resubmitFor} onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 focus:border-pazer-red outline-none font-mono-pz text-lg disabled:opacity-60" />
              {coins > 0 && <div className="text-xs text-green-400 mt-1">You'll receive <span className="font-bold">{Math.round(coins).toLocaleString()} coins</span></div>}
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Payment Screenshot</label>
              <label data-testid="proof-upload-label" className="mt-1 flex items-center justify-center gap-2 w-full py-4 rounded-lg border border-dashed border-white/20 hover:border-pazer-red cursor-pointer transition-colors">
                {uploading ? <Loader2 className="h-5 w-5 animate-spin text-pazer-red" /> : proof ? <Check className="h-5 w-5 text-green-400" /> : <Upload className="h-5 w-5 text-white/50" />}
                <span className="text-sm text-white/60">{uploading ? "Uploading…" : proof ? "Screenshot uploaded" : "Tap to upload screenshot"}</span>
                <input type="file" accept="image/*" data-testid="proof-upload-input" className="hidden" onChange={(e) => uploadFile(e.target.files?.[0])} />
              </label>
              {proof && <img src={proof} alt="proof" className="mt-2 h-24 rounded-lg object-cover" />}
            </div>

            <button onClick={submitDeposit} disabled={busy || uploading} data-testid="submit-deposit"
              className="w-full py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit for Verification
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* WITHDRAW MODAL */}
      <Dialog open={modal === "withdraw"} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="bg-pazer-card border-white/10 text-white">
          <DialogHeader><DialogTitle className="font-display">Withdraw</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Amount (coins)</label>
              <input data-testid="amount-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 focus:border-pazer-red outline-none font-mono-pz text-lg" />
            </div>
            <p className="text-xs text-white/40">Requires verified KYC. Reviewed by admin. Payout to your saved UPI/Bank/USDT.</p>
            <button onClick={submitWithdraw} disabled={busy} data-testid="submit-txn"
              className="w-full py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Request Withdrawal
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
