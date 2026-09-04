import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Users, Trophy, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError, WS_BASE } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Stopwatch from "@/components/Stopwatch";

export default function RoomGame() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [room, setRoom] = useState(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const swRef = useRef(null);
  const elapsedRef = useRef(0);
  const startedRef = useRef(false);

  const applyRoom = (r) => {
    setRoom(r);
    const me = r.players?.find((p) => p.user_id === user.id);
    if (me?.submitted) setSubmitted(true);
    if (r.status === "LIVE" && me && !me.submitted && !startedRef.current) {
      startedRef.current = true;
      setTimeout(() => swRef.current?.start(), 100);
    }
  };

  useEffect(() => {
    api.get(`/rooms/${id}`).then(({ data }) => applyRoom(data)).catch(() => {});
    let ws;
    try {
      ws = new WebSocket(`${WS_BASE}/ws/rooms/${id}`);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.room) applyRoom(msg.room);
        if (msg.event === "started") toast.info("Game started! Stop the clock!");
        if (msg.event === "cancelled") toast.error("Room cancelled — you were refunded.");
      };
    } catch {}
    const poll = setInterval(() => api.get(`/rooms/${id}`).then(({ data }) => applyRoom(data)).catch(() => {}), 3000);
    return () => { ws && ws.close(); clearInterval(poll); };
    // eslint-disable-next-line
  }, [id]);

  const stop = async () => {
    if (busy || submitted) return;
    const elapsed = swRef.current?.stop() ?? elapsedRef.current;
    setBusy(true);
    try {
      const { data } = await api.post(`/rooms/${id}/stop`, { elapsed });
      setSubmitted(true);
      toast.success(`Locked in at ${data.recorded}s (Δ${data.diff}s)`);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const backTo = room?.mode === "1v1" ? "/1v1" : "/multiplayer";
  if (!room) return <div className="flex justify-center py-32"><Loader2 className="h-8 w-8 animate-spin text-pazer-red" /></div>;

  const me = room.players?.find((p) => p.user_id === user.id);
  const inRoom = !!me;
  const ranked = [...(room.players || [])].filter((p) => p.rank).sort((a, b) => a.rank - b.rank);

  return (
    <div className="mx-auto max-w-4xl px-4 md:px-8 py-8">
      <button onClick={() => nav(backTo)} className="flex items-center gap-2 text-white/50 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to rooms
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="font-mono-pz font-extrabold text-4xl text-pazer-red pz-glow">{room.target}s {room.mode === "1v1" ? "Duel" : "Room"}</div>
          <div className="text-white/40 text-sm">{room.room_code} · {room.status}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-white/40 uppercase tracking-wider">{room.mode === "1v1" ? "Winner Gets" : "Prize Pool"}</div>
          <div className="font-mono-pz font-bold text-2xl text-green-400">{room.mode === "1v1" ? Math.round(room.entry_fee * (room.win_multiplier || 1.5)) : room.prize_pool}</div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* WAITING */}
        {(room.status === "OPEN" || room.status === "FULL") && (
          <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="rounded-2xl pz-glass p-8 text-center">
            <div className="pz-live-dot inline-block h-3 w-3 rounded-full bg-pazer-red mb-4" />
            <h2 className="font-display font-bold text-xl mb-2">Waiting for players…</h2>
            <p className="text-white/50 text-sm mb-6">Needs {room.min_players} to start · {room.current_players}/{room.max_players} joined</p>
            <div className="w-full max-w-md mx-auto h-2 bg-black/40 rounded-full overflow-hidden mb-6">
              <div className="h-full bg-pazer-red transition-all" style={{ width: `${Math.min(100, (room.current_players / room.max_players) * 100)}%` }} />
            </div>
            <PlayerChips players={room.players} meId={user.id} />
            {!inRoom && <p className="text-pazer-red text-sm mt-4">You are viewing — join from the rooms list.</p>}
          </motion.div>
        )}

        {/* LIVE */}
        {room.status === "LIVE" && inRoom && !submitted && (
          <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center py-6">
            <Stopwatch ref={swRef} target={room.target} running onTick={(e) => (elapsedRef.current = e)} />
            <motion.button whileTap={{ scale: 0.94 }} onClick={stop} disabled={busy} data-testid="room-stop-button"
              className="mt-10 h-24 w-24 md:h-28 md:w-28 rounded-full bg-pazer-red font-display font-extrabold text-2xl pz-glow-box hover:bg-pazer-redhover transition-colors disabled:opacity-50">
              STOP
            </motion.button>
            <p className="text-white/40 text-sm mt-4">Stop closest to {room.target}s to win the pool</p>
          </motion.div>
        )}

        {room.status === "LIVE" && (!inRoom || submitted) && (
          <motion.div key="livewait" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-2xl pz-glass p-8 text-center">
            <Clock className="h-10 w-10 text-pazer-red mx-auto mb-4 animate-pulse" />
            <h2 className="font-display font-bold text-xl mb-2">{submitted ? "Locked in!" : "Game in progress"}</h2>
            <p className="text-white/50 text-sm mb-6">Waiting for other players to stop…</p>
            <div className="space-y-2 max-w-md mx-auto">
              {room.players?.map((p) => (
                <div key={p.user_id} className="flex justify-between items-center bg-black/40 rounded-lg px-4 py-2.5 text-sm">
                  <span className={p.user_id === user.id ? "text-pazer-red font-semibold" : ""}>{p.username}</span>
                  <span className="font-mono-pz text-white/60">{p.submitted ? `${p.recorded}s` : "…"}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* COMPLETED */}
        {room.status === "COMPLETED" && (
          <motion.div key="done" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl pz-glass p-8">
            <div className="text-center mb-6">
              <Trophy className="h-12 w-12 text-green-400 mx-auto mb-3" />
              <h2 className="font-display font-bold text-2xl">Winner: <span className="text-pazer-red">{room.winner}</span></h2>
            </div>
            <div className="space-y-2" data-testid="room-rankings">
              {ranked.map((p) => (
                <div key={p.user_id} className={`flex items-center justify-between rounded-xl px-4 py-3 ${p.rank === 1 ? "bg-pazer-red/15 border border-pazer-red/30" : "bg-black/40"}`}>
                  <div className="flex items-center gap-3">
                    <span className="font-mono-pz font-bold text-lg w-6 text-white/50">#{p.rank}</span>
                    <span className={p.user_id === user.id ? "text-pazer-red font-semibold" : ""}>{p.username}</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className="font-mono-pz text-sm text-white/60">{p.recorded}s · Δ{p.diff}</span>
                    <span className={`font-mono-pz font-bold text-sm ${p.prize > 0 ? "text-green-400" : "text-white/30"}`}>{p.prize > 0 ? `+${p.prize}` : "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {(room.status === "REFUNDED" || room.status === "CANCELLED") && (
          <motion.div key="ref" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl pz-glass p-10 text-center">
            <h2 className="font-display font-bold text-xl mb-2">Room Cancelled</h2>
            <p className="text-white/50">Minimum players not reached. Entry fees were fully refunded to your wallet.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PlayerChips({ players, meId }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {players?.map((p) => (
        <span key={p.user_id} className={`px-3 py-1.5 rounded-full text-sm ${p.user_id === meId ? "bg-pazer-red text-white" : "bg-black/40 text-white/70"}`}>
          {p.username}
        </span>
      ))}
    </div>
  );
}
