import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, Loader2, Trophy, XCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import Stopwatch from "@/components/Stopwatch";

export default function PlayFixed() {
  const [challenges, setChallenges] = useState([]);
  const [selected, setSelected] = useState(null);
  const [phase, setPhase] = useState("select"); // select, confirm, countdown, running, result
  const [count, setCount] = useState(3);
  const [session, setSession] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const swRef = useRef(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    api.get("/config/public").then(({ data }) => setChallenges(data.fixed_challenges || [])).catch(() => {});
  }, []);

  const startGame = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/games/fixed/start", { target: selected.target });
      setSession(data);
      setPhase("countdown");
      setCount(3);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (phase !== "countdown") return;
    if (count === 0) {
      setPhase("running");
      setTimeout(() => swRef.current?.start(), 50);
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 700);
    return () => clearTimeout(t);
  }, [phase, count]);

  const stop = async () => {
    if (busy) return;
    const elapsed = swRef.current?.stop() ?? elapsedRef.current;
    setBusy(true);
    try {
      const { data } = await api.post("/games/fixed/stop", {
        session_id: session.session_id, elapsed, nonce: session.nonce,
      });
      setResult(data);
      setPhase("result");
      if (data.won) toast.success(`You won ${data.prize} coins!`);
      else toast(data.flagged ? "Result flagged by anti-cheat" : "Missed the window — try again");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
      setPhase("select");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    swRef.current?.reset();
    setSession(null);
    setResult(null);
    setSelected(null);
    setPhase("select");
  };

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-8 py-10">
      <div className="flex items-center gap-3 mb-2">
        <Target className="h-6 w-6 text-pazer-red" />
        <h1 className="font-display font-bold text-3xl tracking-tight">Fixed-Time Challenge</h1>
      </div>
      <p className="text-white/50 mb-8">Stop the clock within the accuracy window to win.</p>

      <AnimatePresence mode="wait">
        {phase === "select" && (
          <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {challenges.map((c) => (
              <motion.button key={c.target} whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}
                data-testid={`challenge-slot-${c.target}`}
                onClick={() => { setSelected(c); setPhase("confirm"); }}
                className="group rounded-2xl pz-glass p-6 text-left hover:border-pazer-red/50 transition-colors">
                <div className="font-mono-pz font-extrabold text-4xl text-pazer-red pz-glow">{c.target}<span className="text-lg text-white/40">s</span></div>
                <div className="mt-4 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-white/40">Entry</span><span className="font-mono-pz">{c.entry_fee}</span></div>
                  <div className="flex justify-between"><span className="text-white/40">Prize</span><span className="font-mono-pz text-green-400">{c.prize}</span></div>
                  <div className="flex justify-between"><span className="text-white/40">±</span><span className="font-mono-pz">{c.tolerance}s</span></div>
                </div>
              </motion.button>
            ))}
            {challenges.length === 0 && <p className="text-white/40 col-span-full text-center py-10">No challenges available.</p>}
          </motion.div>
        )}

        {phase === "confirm" && selected && (
          <motion.div key="confirm" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="max-w-md mx-auto rounded-2xl pz-glass p-8 text-center">
            <div className="font-mono-pz font-extrabold text-6xl text-pazer-red pz-glow mb-4">{selected.target}s</div>
            <div className="space-y-2 mb-6 text-left bg-black/40 rounded-xl p-4">
              <div className="flex justify-between"><span className="text-white/50">Entry fee</span><span className="font-mono-pz">{selected.entry_fee} coins</span></div>
              <div className="flex justify-between"><span className="text-white/50">Prize</span><span className="font-mono-pz text-green-400">{selected.prize} coins</span></div>
              <div className="flex justify-between"><span className="text-white/50">Accuracy window</span><span className="font-mono-pz">± {selected.tolerance}s</span></div>
            </div>
            <div className="flex gap-3">
              <button onClick={reset} className="flex-1 py-3 rounded-full border border-white/15 hover:border-white/40 transition-colors">Cancel</button>
              <button onClick={startGame} disabled={busy} data-testid="confirm-start-btn"
                className="flex-1 py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Pay & Start
              </button>
            </div>
          </motion.div>
        )}

        {(phase === "countdown" || phase === "running") && (
          <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center py-8">
            <div className="relative">
              <Stopwatch ref={swRef} target={selected?.target} running={phase === "running"}
                onTick={(e) => (elapsedRef.current = e)} />
              {phase === "countdown" && (
                <motion.div key={count} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="absolute inset-0 flex items-center justify-center font-display font-extrabold text-8xl text-pazer-red pz-glow">
                  {count === 0 ? "GO" : count}
                </motion.div>
              )}
            </div>
            <motion.button whileTap={{ scale: 0.94 }} onClick={stop} disabled={phase !== "running" || busy}
              data-testid="stopwatch-stop-button"
              className="mt-10 h-24 w-24 md:h-28 md:w-28 rounded-full bg-pazer-red font-display font-extrabold text-2xl pz-glow-box disabled:opacity-40 hover:bg-pazer-redhover transition-colors">
              STOP
            </motion.button>
            <p className="text-white/40 text-sm mt-4">Tap STOP as close to {selected?.target}s as you can</p>
          </motion.div>
        )}

        {phase === "result" && result && (
          <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto rounded-2xl pz-glass p-8 text-center">
            {result.won ? <Trophy className="h-14 w-14 text-green-400 mx-auto mb-4" /> : <XCircle className="h-14 w-14 text-white/30 mx-auto mb-4" />}
            <h2 className="font-display font-bold text-2xl mb-1" data-testid="result-status">{result.won ? "You Won!" : "So close!"}</h2>
            {result.flagged && <p className="text-pazer-red text-xs mb-2">Result flagged by anti-cheat.</p>}
            <div className="grid grid-cols-3 gap-3 my-6">
              <div className="bg-black/40 rounded-xl p-4"><div className="text-xs text-white/40 mb-1">Your time</div><div className="font-mono-pz text-xl font-bold" data-testid="result-time">{result.recorded}s</div></div>
              <div className="bg-black/40 rounded-xl p-4"><div className="text-xs text-white/40 mb-1">Target</div><div className="font-mono-pz text-xl font-bold">{result.target}s</div></div>
              <div className="bg-black/40 rounded-xl p-4"><div className="text-xs text-white/40 mb-1">Diff</div><div className="font-mono-pz text-xl font-bold text-pazer-red">{result.diff}s</div></div>
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
