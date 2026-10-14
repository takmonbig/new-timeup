import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Castle, Coins, Loader2, ArrowLeft, Gem, Bomb, HandCoins } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { showPopup } from "@/components/CenterPopup";
import { showWin } from "@/components/WinCelebration";
import { fbTrack } from "@/lib/siteConfig";

const QUICK = [20, 50, 100, 200, 500];
const DIFFS = ["easy", "medium", "hard"];

const calcMults = (cols, bombs, rows, he) => {
  const step = cols / Math.max(1, cols - bombs), k = 1 - Math.min(0.5, he / 100);
  let cur = 1; return Array.from({ length: rows }, () => { cur *= step; return Math.round(cur * k * 100) / 100; });
};

function Tile({ state, onClick, active, testid }) {
  const base = "relative h-12 sm:h-14 rounded-xl border flex items-center justify-center transition-colors";
  const look = {
    gem: "bg-gradient-to-b from-emerald-400/40 to-emerald-700/30 border-emerald-400/60",
    bomb: "bg-gradient-to-b from-pazer-red/60 to-red-900/60 border-pazer-red",
    ghost: "bg-black/40 border-pazer-red/30 opacity-70",
    idle: active ? "bg-gradient-to-b from-white/15 to-white/5 border-orange-400/60 hover:from-orange-400/40 cursor-pointer" : "bg-white/[0.04] border-white/10",
  }[state];
  return (
    <motion.button whileTap={active ? { scale: 0.9 } : {}} disabled={!active} onClick={onClick} data-testid={testid}
      className={`${base} ${look}`} style={active ? { boxShadow: "0 0 18px rgba(255,120,40,0.25)" } : {}}>
      {state === "gem" && <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}><Gem className="h-6 w-6 text-emerald-300" /></motion.span>}
      {(state === "bomb" || state === "ghost") && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}><Bomb className="h-6 w-6 text-white" /></motion.span>}
    </motion.button>
  );
}

function TowerGrid({ rows, cols, mults, game, bombs, picks, onPick }) {
  return (
    <div className="space-y-2" data-testid="tower-grid">
      {Array.from({ length: rows }, (_, i) => rows - 1 - i).map((r) => {
        const active = game?.status === "active" && game.row === r;
        const passed = game && r < game.row;
        return (
          <div key={r} className={`flex items-center gap-2 rounded-2xl p-1.5 transition-colors ${active ? "bg-orange-500/10 ring-1 ring-orange-400/40" : ""}`} data-testid={`tower-row-${r}`}>
            <div className={`w-16 shrink-0 text-right font-mono-pz text-sm font-bold ${passed ? "text-emerald-300" : active ? "text-orange-300" : "text-white/35"}`}>{mults[r]?.toFixed(2)}x</div>
            <div className="flex-1 grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
              {Array.from({ length: cols }, (_, c) => {
                const picked = picks[r] === c;
                const isBomb = bombs?.[r]?.includes(c);
                const state = picked ? (isBomb ? "bomb" : "gem") : isBomb ? "ghost" : "idle";
                return <Tile key={c} state={state} active={active} onClick={() => onPick(c)} testid={`tower-tile-${r}-${c}`} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Tower() {
  const [cfg, setCfg] = useState(null);
  const [diff, setDiff] = useState("easy");
  const [bet, setBet] = useState(20);
  const [game, setGame] = useState(null);
  const [picks, setPicks] = useState({});
  const [bombs, setBombs] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get("/config/public").then(({ data }) => { setCfg(data.tower_config); setBet(data.tower_config.min_bet || 20); }).catch(() => {}); }, []);
  const active = game?.status === "active";
  useEffect(() => { window.dispatchEvent(new CustomEvent("game:active", { detail: active })); }, [active]);
  useEffect(() => () => window.dispatchEvent(new CustomEvent("game:active", { detail: false })), []);

  const d = cfg?.difficulties?.[diff] || { cols: 4, bombs: 1 };
  const rows = game?.rows || cfg?.rows || 8;
  const cols = game?.cols || d.cols;
  const mults = useMemo(() => game?.multipliers || calcMults(d.cols, d.bombs, rows, cfg?.house_edge_percent ?? 5), [game, d.cols, d.bombs, rows, cfg]);
  const cashValue = game && game.row > 0 ? (game.entry_fee * mults[game.row - 1]).toFixed(2) : "0.00";

  const start = async () => {
    if (bet < (cfg?.min_bet || 20)) return showPopup({ type: "warning", title: "Bet too low", message: `Minimum bet is ${cfg?.min_bet || 20} coins.` });
    setBusy(true);
    try {
      const { data } = await api.post("/games/tower/start", { bet, difficulty: diff });
      setGame({ ...data, row: 0, status: "active" }); setPicks({}); setBombs(null);
      fbTrack("game_play", { value: bet, currency: "INR" });
      window.dispatchEvent(new Event("wallet:refresh"));
    } catch (e) {
      const m = formatApiError(e.response?.data?.detail);
      if (/insufficient/i.test(m)) showPopup({ type: "wallet", title: "Insufficient balance", message: "Add coins to your wallet to keep playing." });
      else showPopup({ type: "warning", title: "Can't start", message: m });
    } finally { setBusy(false); }
  };

  const pick = async (col) => {
    if (busy || !active) return;
    setBusy(true);
    const r = game.row;
    try {
      const { data } = await api.post("/games/tower/pick", { session_id: game.session_id, nonce: game.nonce, col });
      setPicks((p) => ({ ...p, [r]: col }));
      if (!data.safe) {
        setBombs(data.bombs_layout); setGame((g) => ({ ...g, status: "lost" }));
        window.dispatchEvent(new Event("wallet:refresh"));
        setTimeout(() => showPopup({ type: "warning", title: "Boom! Tower collapsed", message: "Play again and climb higher." }), 700);
      } else if (data.finished) {
        setBombs(data.bombs_layout); setGame((g) => ({ ...g, row: data.row, status: "won" }));
        window.dispatchEvent(new Event("wallet:refresh")); showWin(data.prize);
      } else setGame((g) => ({ ...g, row: data.row }));
    } catch (e) { showPopup({ type: "warning", title: "Something went wrong", message: formatApiError(e.response?.data?.detail) }); }
    finally { setBusy(false); }
  };

  const cashout = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/games/tower/cashout", { session_id: game.session_id, nonce: game.nonce });
      setBombs(data.bombs_layout); setGame((g) => ({ ...g, status: "won" }));
      window.dispatchEvent(new Event("wallet:refresh")); showWin(data.prize);
    } catch (e) { showPopup({ type: "warning", title: "Can't cash out", message: formatApiError(e.response?.data?.detail) }); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 pb-40" data-testid="tower-page">
      <div className="flex items-center gap-3 mb-4">
        <Link to="/home" data-testid="tower-back" className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></Link>
        <Castle className="h-5 w-5 text-pazer-red" />
        <h1 className="font-display font-bold text-2xl tracking-tight">Tower</h1>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {DIFFS.map((k) => (
          <button key={k} disabled={active} onClick={() => { setDiff(k); setGame(null); setPicks({}); setBombs(null); }} data-testid={`tower-diff-${k}`}
            className={`py-2.5 rounded-xl text-sm font-bold capitalize transition-colors disabled:opacity-50 ${diff === k ? "bg-pazer-red text-white pz-glow-box" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
            {k}<span className="block text-[10px] font-normal opacity-70">{cfg?.difficulties?.[k]?.cols || "-"} tiles · {cfg?.difficulties?.[k]?.bombs || 1} bomb</span>
          </button>
        ))}
      </div>

      <div className="rounded-3xl border border-pazer-red/25 bg-gradient-to-b from-[#1a0508] to-black/60 p-3 sm:p-4">
        <TowerGrid rows={rows} cols={cols} mults={mults} game={game} bombs={bombs} picks={picks} onPick={pick} />
      </div>

      <div className="mt-5 rounded-3xl pz-glass p-5 space-y-4">
        {active ? (
          <button onClick={cashout} disabled={busy || game.row === 0} data-testid="tower-cashout-btn"
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 font-extrabold text-lg flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <HandCoins className="h-5 w-5" />}
            {game.row === 0 ? "Pick a tile to start climbing" : <>CASH OUT <span className="font-mono-pz">{cashValue}</span></>}
          </button>
        ) : (
          <>
            <div>
              <div className="text-xs uppercase tracking-wider text-white/50 mb-2">Bet (min {cfg?.min_bet || 20})</div>
              <div className="flex items-center bg-black/40 border border-white/10 rounded-xl focus-within:border-pazer-red transition-colors mb-2">
                <Coins className="h-5 w-5 text-pazer-red ml-4" />
                <input data-testid="tower-bet-input" type="number" value={bet || ""} placeholder="Enter amount"
                  onChange={(e) => setBet(Math.max(0, parseInt(e.target.value) || 0))} onFocus={(e) => e.target.select()}
                  className="w-full bg-transparent px-3 py-3 outline-none font-mono-pz text-xl font-bold" />
              </div>
              <div className="flex gap-2">
                {QUICK.map((v) => (
                  <button key={v} onClick={() => setBet(v)} data-testid={`tower-quickbet-${v}`}
                    className={`flex-1 py-2 rounded-lg text-sm font-mono-pz transition-colors ${bet === v ? "bg-pazer-red/30" : "bg-white/5 hover:bg-white/10"}`}>{v}</button>
                ))}
              </div>
            </div>
            <div className="flex justify-between text-sm text-white/50">
              <span>Top prize</span><span className="font-mono-pz text-green-400 font-bold" data-testid="tower-top-prize">{(bet * (mults[rows - 1] || 0)).toFixed(2)}</span>
            </div>
            <button onClick={start} disabled={busy} data-testid="tower-start-btn"
              className="w-full py-4 rounded-2xl bg-pazer-red hover:bg-pazer-redhover font-extrabold text-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {busy && <Loader2 className="h-5 w-5 animate-spin" />} {game ? "Play Again" : "Start"} · {bet}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
