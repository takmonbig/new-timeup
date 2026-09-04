import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Wallet, Info, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Global helper: showPopup({ title, message, type, actionLabel, onAction })
export function showPopup(detail) {
  window.dispatchEvent(new CustomEvent("pazer:popup", { detail }));
}

const ICONS = { warning: AlertTriangle, wallet: Wallet, info: Info };

export function CenterPopupHost() {
  const [popup, setPopup] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      setPopup(e.detail);
      if (!e.detail?.sticky) {
        clearTimeout(window.__pzPopupT);
        window.__pzPopupT = setTimeout(() => setPopup(null), e.detail?.duration || 2600);
      }
    };
    window.addEventListener("pazer:popup", handler);
    return () => window.removeEventListener("pazer:popup", handler);
  }, []);

  const Icon = ICONS[popup?.type] || AlertTriangle;

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
            className="relative w-full max-w-sm rounded-3xl pz-glass border border-pazer-red/40 p-7 text-center pz-glow-box">
            <button onClick={() => setPopup(null)} className="absolute top-4 right-4 text-white/40 hover:text-white">
              <X className="h-4 w-4" />
            </button>
            <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-pazer-red/15 flex items-center justify-center">
              <Icon className="h-8 w-8 text-pazer-red" />
            </div>
            <h3 className="font-display font-bold text-xl mb-1">{popup.title}</h3>
            <p className="text-white/60 text-sm">{popup.message}</p>
            <div className="mt-6 flex flex-col gap-2">
              {popup.actionLabel && (
                <button data-testid="popup-action"
                  onClick={() => { setPopup(null); popup.onAction ? popup.onAction() : (popup.actionTo && nav(popup.actionTo)); }}
                  className="w-full py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors">
                  {popup.actionLabel}
                </button>
              )}
              {popup.type === "wallet" && !popup.actionLabel && (
                <button onClick={() => { setPopup(null); nav("/wallet"); }}
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
