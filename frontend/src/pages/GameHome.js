import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, Loader2, Trophy, XCircle, RotateCcw, Coins } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import Stopwatch from "@/components/Stopwatch";

const QUICK_BETS = [20, 50, 100, 200, 500];

export default function GameHome() {
  const [cfg, setCfg] = useState(null);
  const [target, setTarget] = useState(null);
  const [bet, setBet] = useState(20);
  const [phase, setPhase] = useState("select"); // select, countdown, running, result
  const [count, setCount] = useState(3);
  const [session, setSession] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const swRef = useRef(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    api.get("/config/public").then(({ data }) => {
      setCfg(data.fixed_config);
      setBet(data.fixed_config.min_bet);
      setTarget(data.fixed_config.targets[0]);
    }).catch(() => {});
  }, []);

  const start = async () => {
    if (bet < (cfg?.min_bet || 20)) return toast.error(`Minimum bet is ${cfg.min_bet} coins`);
    setBusy(true);
    try {
      const { data } = await api.post("/games/fixed/start", { target, bet });
      setSession(data);
      setPhase("countdown"); setCount(3);
      window.dispatchEvent(new Event("wallet:refresh"));
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (phase !== "countdown") return;
    if (count === 0) { setPhase("running"); setTimeout(() => swRef.current?.start(), 50); return; }
    const t = setTimeout(() => setCount((c) => c - 1), 700);
    return () => clearTimeout(t);
  }, [phase, count]);

  const stop = async () => {
    if (busy) return;
    const elapsed = swRef.current?.stop() ?? elapsedRef.current;
    setBusy(true);
    try {
      const { data } = await api.post("/games/fixed/stop", { session_id: session.session_id, elapsed, nonce: session.nonce });
      setResult(data);
      setPhase("result");
      window.dispatchEvent(new Event("wallet:refresh"));
      if (data.won) toast.success(`Bullseye! You won ${data.prize} coins!`);
      else toast(data.flagged ? "Result flagged by anti-cheat" : "Not exact — try again!");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
      setPhase("select");
    } finally { setBusy(false); }
  };

  const reset = () => { swRef.current?.reset(); setSession(null); setResult(null); setPhase("select"); };

  const potential = Math.round(bet * (cfg?.win_multiplier || 5));

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center gap-2 mb-1">
        <Target className="h-5 w-5 text-pazer-red" />
        <h1 className="font-display font-bold text-2xl tracking-tight">Fixed Challenge</h1>
      </div>
      <p className="text-white/50 text-sm mb-6">Stop the clock <span className="text-pazer-red font-semibold">exactly</span> at the target to win {cfg?.win_multiplier || 5}×.</p>

      <AnimatePresence mode="wait">
        {phase === "select" && cfg && (
          <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            <div>
              <div className="text-xs uppercase tracking-wider text-white/50 mb-2">Target Time</div>
              <div className="grid grid-cols-4 gap-2">
                {cfg.targets.map((t) => (
                  <button key={t} onClick={() => setTarget(t)} data-testid={`target-${t}`}
                    className={`py-3 rounded-xl font-mono-pz font-bold text-lg transition-colors ${
                      target === t ? "bg-pazer-red text-white pz-glow-box" : "bg-white/5 text-white/70 hover:bg-white/10"
                    }`}>{t}<span className="text-xs opacity-60">s</span></button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-white/50 mb-2">Your Bet (min {cfg.min_bet})</div>
              <div className="flex items-center bg-black/40 border border-white/10 rounded-xl focus-within:border-pazer-red transition-colors mb-2">
                <Coins className="h-5 w-5 text-pazer-red ml-4" />
                <input data-testid="bet-input" type="number" min={cfg.min_bet} value={bet}
                  onChange={(e) => setBet(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-transparent px-3 py-3.5 outline-none font-mono-pz text-xl font-bold" />
              </div>
              <div className="flex gap-2">
                {QUICK_BETS.map((v) => (
                  <button key={v} onClick={() => setBet(v)} data-testid={`quickbet-${v}`}
                    className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-mono-pz transition-colors">{v}</button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl pz-glass p-5 flex items-center justify-between">
              <div>
                <div className="text-xs text-white/40 uppercase tracking-wider">Win Payout</div>
                <div className="font-mono-pz font-extrabold text-3xl text-green-400">{potential.toLocaleString()}</div>
              </div>
              <div className="text-right text-sm text-white/50">
                <div>Bet <span className="font-mono-pz text-white">{bet}</span></div>
                <div>Target <span className="font-mono-pz text-white">{target}s</span></div>
              </div>
            </div>

            <button onClick={start} disabled={busy} data-testid="start-challenge-btn"
              className="w-full py-4 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold text-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader2 className="h-5 w-5 animate-spin" />} Pay {bet} & Start
            </button>
          </motion.div>
        )}

        {(phase === "countdown" || phase === "running") && (
          <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center py-4">
            <div className="relative">
              <Stopwatch ref={swRef} target={target} running={phase === "running"} onTick={(e) => (elapsedRef.current = e)} />
              {phase === "countdown" && (
                <motion.div key={count} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="absolute inset-0 flex items-center justify-center font-display font-extrabold text-7xl text-pazer-red pz-glow">
                  {count === 0 ? "GO" : count}
                </motion.div>
              )}
            </div>
            <motion.button whileTap={{ scale: 0.94 }} onClick={stop} disabled={phase !== "running" || busy}
              data-testid="stopwatch-stop-button"
              className="mt-8 h-28 w-28 rounded-full bg-pazer-red font-display font-extrabold text-2xl pz-glow-box disabled:opacity-40 hover:bg-pazer-redhover transition-colors">
              STOP
            </motion.button>
            <p className="text-white/40 text-sm mt-4">Tap STOP exactly at {target}.00</p>
          </motion.div>
        )}

        {phase === "result" && result && (
          <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl pz-glass p-8 text-center">
            {result.won ? <Trophy className="h-14 w-14 text-green-400 mx-auto mb-4" /> : <XCircle className="h-14 w-14 text-white/30 mx-auto mb-4" />}
            <h2 className="font-display font-bold text-2xl mb-1" data-testid="result-status">{result.won ? "Bullseye!" : "So close!"}</h2>
            {result.flagged && <p className="text-pazer-red text-xs mb-2">Result flagged by anti-cheat.</p>}
            <div className="grid grid-cols-3 gap-3 my-6">
              <div className="bg-black/40 rounded-xl p-4"><div className="text-xs text-white/40 mb-1">Your time</div><div className="font-mono-pz text-xl font-bold" data-testid="result-time">{result.recorded?.toFixed(2)}s</div></div>
              <div className="bg-black/40 rounded-xl p-4"><div className="text-xs text-white/40 mb-1">Target</div><div className="font-mono-pz text-xl font-bold">{result.target}s</div></div>
              <div className="bg-black/40 rounded-xl p-4"><div className="text-xs text-white/40 mb-1">Off by</div><div className="font-mono-pz text-xl font-bold text-pazer-red">{result.diff?.toFixed(2)}s</div></div>
            </div>
            <div className={`font-mono-pz font-bold text-lg mb-6 ${result.won ? "text-green-400" : "text-white/50"}`}>
              {result.won ? `+${result.prize} coins` : "No prize this round"}
            </div>
            <button onClick={reset} data-testid="play-again-btn"
              className="w-full py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors flex items-center justify-center gap-2">
              <RotateCcw className="h-4 w-4" /> Play Again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
