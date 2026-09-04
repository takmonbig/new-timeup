import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Wallet, Info, X, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Global helper: showPopup({ title, message, type, actionLabel, onAction, sticky })
export function showPopup(detail) {
  window.dispatchEvent(new CustomEvent("pazer:popup", { detail }));
}

const ICONS = { warning: AlertTriangle, wallet: Wallet, info: Info, success: CheckCircle2 };
const ICON_COLORS = {
  warning: "text-pazer-red bg-pazer-red/15",
  wallet: "text-pazer-red bg-pazer-red/15",
  info: "text-blue-400 bg-blue-400/15",
  success: "text-green-400 bg-green-400/15",
};
const QUICK_RECHARGE = [100, 500, 1000];

export function CenterPopupHost() {
  const [popup, setPopup] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      setPopup(e.detail);
      clearTimeout(window.__pzPopupT);
      if (!e.detail?.sticky && e.detail?.type !== "wallet") {
        window.__pzPopupT = setTimeout(() => setPopup(null), e.detail?.duration || 2600);
      }
    };
    window.addEventListener("pazer:popup", handler);
    return () => window.removeEventListener("pazer:popup", handler);
  }, []);

  const Icon = ICONS[popup?.type] || AlertTriangle;
  const iconColor = ICON_COLORS[popup?.type] || ICON_COLORS.warning;
  const borderColor = popup?.type === "success" ? "border-green-400/40" : "border-pazer-red/40";

  const goRecharge = (amt) => { setPopup(null); nav(amt ? `/wallet?deposit=${amt}` : "/wallet"); };

  return (
    <AnimatePresence>
      {popup && (
        <motion.div className="fixed inset-0 z-[100] flex items-center justify-center px-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => setPopup(null)} data-testid="center-popup">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.7, y: 10, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }} transition={{ type: "spring", stiffness: 320, damping: 22 }}
            className={`relative w-full max-w-sm rounded-3xl pz-glass border ${borderColor} p-7 text-center pz-glow-box`}>
            <button onClick={() => setPopup(null)} className="absolute top-4 right-4 text-white/40 hover:text-white" data-testid="popup-close">
              <X className="h-4 w-4" />
            </button>
            <div className={`mx-auto mb-4 h-16 w-16 rounded-2xl flex items-center justify-center ${iconColor}`}>
              <Icon className="h-8 w-8" />
            </div>
            <h3 className="font-display font-bold text-xl mb-1" data-testid="popup-title">{popup.title}</h3>
            <p className="text-white/60 text-sm whitespace-pre-line" data-testid="popup-message">{popup.message}</p>

            {popup.type === "wallet" && (
              <div className="mt-5">
                <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Quick recharge</div>
                <div className="grid grid-cols-3 gap-2">
                  {QUICK_RECHARGE.map((v) => (
                    <button key={v} data-testid={`quick-recharge-${v}`} onClick={() => goRecharge(v)}
                      className="py-2.5 rounded-xl bg-white/5 hover:bg-pazer-red hover:text-white font-mono-pz font-bold transition-colors">
                      ₹{v}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2">
              {popup.actionLabel && (
                <button data-testid="popup-action"
                  onClick={() => { setPopup(null); popup.onAction ? popup.onAction() : (popup.actionTo && nav(popup.actionTo)); }}
                  className="w-full py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors">
                  {popup.actionLabel}
                </button>
              )}
              {popup.type === "wallet" && !popup.actionLabel && (
                <button onClick={() => goRecharge()} data-testid="popup-add-coins"
                  className="w-full py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors">
                  Add Coins
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
