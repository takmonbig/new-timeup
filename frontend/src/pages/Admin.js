import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Shield, Settings, Users, Banknote, ScrollText, Loader2, Save, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

const TABS = [
  { id: "overview", label: "Overview", icon: Shield },
  { id: "config", label: "Game Config", icon: Settings },
  { id: "users", label: "Users", icon: Users },
  { id: "withdrawals", label: "Withdrawals", icon: Banknote },
  { id: "logs", label: "Audit Logs", icon: ScrollText },
];

function Field({ label, value, onChange, type = "number" }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-white/40">{label}</label>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(type === "number" ? parseFloat(e.target.value) : e.target.value)}
        className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-pazer-red outline-none font-mono-pz transition-colors" />
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [users, setUsers] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [logs, setLogs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const loadAll = useCallback(() => {
    api.get("/admin/stats").then(({ data }) => setStats(data)).catch(() => {});
    api.get("/admin/config").then(({ data }) => setCfg(data)).catch(() => {});
    api.get("/admin/users").then(({ data }) => setUsers(data)).catch(() => {});
    api.get("/admin/withdrawals").then(({ data }) => setWithdrawals(data)).catch(() => {});
    api.get("/admin/audit-logs").then(({ data }) => setLogs(data)).catch(() => {});
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/admin/config", { data: cfg });
      setCfg(data);
      toast.success("Configuration saved");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setSaving(false); }
  };

  const userAction = async (uid, action) => {
    try {
      await api.post(`/admin/users/${uid}/action`, { action });
      toast.success(`${action} applied`);
      api.get("/admin/users", { params: { search } }).then(({ data }) => setUsers(data));
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const withdrawalAction = async (txnId, action) => {
    try {
      await api.post(`/admin/withdrawals/${txnId}/action`, { action });
      toast.success(`Withdrawal ${action}d`);
      loadAll();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const searchUsers = () => api.get("/admin/users", { params: { search } }).then(({ data }) => setUsers(data));

  const updWallet = (k, v) => setCfg((c) => ({ ...c, wallet: { ...c.wallet, [k]: v } }));
  const updRoom = (k, v) => setCfg((c) => ({ ...c, room_config: { ...c.room_config, [k]: v } }));
  const updFixed = (k, v) => setCfg((c) => ({ ...c, fixed_config: { ...c.fixed_config, [k]: v } }));
  const updV1 = (k, v) => setCfg((c) => ({ ...c, room_1v1_config: { ...c.room_1v1_config, [k]: v } }));
  const csv = (v) => String(v).split(",").map((x) => parseFloat(x.trim())).filter((x) => !isNaN(x));

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-8 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-6 w-6 text-pazer-red" />
        <h1 className="font-display font-bold text-3xl tracking-tight">Admin Panel</h1>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-black/40 border border-white/10 flex-wrap h-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} data-testid={`admin-tab-${t.id}`} className="data-[state=active]:bg-pazer-red data-[state=active]:text-white gap-2">
              <t.icon className="h-4 w-4" /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {stats && [
              ["Total Users", stats.total_users], ["Total Games", stats.total_games], ["Active Rooms", stats.active_rooms],
              ["Deposits", stats.total_deposits], ["Prizes Paid", stats.total_prizes_paid],
            ].map(([l, v]) => (
              <motion.div key={l} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl pz-glass p-5">
                <div className="font-mono-pz text-3xl font-bold text-pazer-red">{v?.toLocaleString?.() ?? v}</div>
                <div className="text-xs text-white/40 uppercase tracking-wider mt-1">{l}</div>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        {/* CONFIG */}
        <TabsContent value="config" className="mt-6">
          {cfg && (
            <div className="space-y-6">
              <div className="rounded-2xl pz-glass p-6 flex flex-wrap items-center gap-6">
                <ToggleRow label="Games Enabled" checked={cfg.game_enabled} onChange={(v) => setCfg({ ...cfg, game_enabled: v })} testid="toggle-game" />
                <ToggleRow label="Real Money" checked={cfg.real_money_enabled} onChange={(v) => setCfg({ ...cfg, real_money_enabled: v })} testid="toggle-realmoney" />
                <ToggleRow label="Deposit Bonus" checked={cfg.wallet.bonus_enabled} onChange={(v) => updWallet("bonus_enabled", v)} testid="toggle-bonus" />
              </div>

              <div className="rounded-2xl pz-glass p-6">
                <h3 className="font-display font-bold text-lg mb-4">Wallet Settings</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Field label="Min Deposit" value={cfg.wallet.min_deposit} onChange={(v) => updWallet("min_deposit", v)} />
                  <Field label="Max Deposit" value={cfg.wallet.max_deposit} onChange={(v) => updWallet("max_deposit", v)} />
                  <Field label="Bonus %" value={cfg.wallet.bonus_percentage} onChange={(v) => updWallet("bonus_percentage", v)} />
                  <Field label="Max Bonus" value={cfg.wallet.max_bonus} onChange={(v) => updWallet("max_bonus", v)} />
                  <Field label="Min Withdrawal" value={cfg.wallet.min_withdrawal} onChange={(v) => updWallet("min_withdrawal", v)} />
                  <Field label="Max Withdrawal" value={cfg.wallet.max_withdrawal} onChange={(v) => updWallet("max_withdrawal", v)} />
                </div>
              </div>

              <div className="rounded-2xl pz-glass p-6">
                <h3 className="font-display font-bold text-lg mb-4">Fixed Challenge (Home)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="Min Bet" value={cfg.fixed_config.min_bet} onChange={(v) => updFixed("min_bet", v)} />
                  <Field label="Max Bet" value={cfg.fixed_config.max_bet} onChange={(v) => updFixed("max_bet", v)} />
                  <Field label="Win Multiplier" value={cfg.fixed_config.win_multiplier} onChange={(v) => updFixed("win_multiplier", v)} />
                  <div className="flex items-end"><ToggleRow label="Enabled" checked={cfg.fixed_config.enabled} onChange={(v) => updFixed("enabled", v)} /></div>
                  <div className="col-span-2 md:col-span-4">
                    <Field label="Target Times (CSV seconds)" type="text" value={(cfg.fixed_config.targets || []).join(",")} onChange={(v) => updFixed("targets", csv(v))} />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl pz-glass p-6">
                <h3 className="font-display font-bold text-lg mb-4">1v1 Duel Settings</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="Entry Fee" value={cfg.room_1v1_config.entry_fee} onChange={(v) => updV1("entry_fee", v)} />
                  <Field label="Win Multiplier" value={cfg.room_1v1_config.win_multiplier} onChange={(v) => updV1("win_multiplier", v)} />
                  <Field label="Duration (min)" value={cfg.room_1v1_config.room_duration_minutes} onChange={(v) => updV1("room_duration_minutes", v)} />
                  <div className="flex items-end"><ToggleRow label="Enabled" checked={cfg.room_1v1_config.enabled} onChange={(v) => updV1("enabled", v)} /></div>
                  <div className="col-span-2 md:col-span-4">
                    <Field label="Target Times (CSV seconds)" type="text" value={(cfg.room_1v1_config.targets || []).join(",")} onChange={(v) => updV1("targets", csv(v))} />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl pz-glass p-6">
                <h3 className="font-display font-bold text-lg mb-4">Room Settings</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="Entry Fee" value={cfg.room_config.entry_fee} onChange={(v) => updRoom("entry_fee", v)} />
                  <Field label="Min Players" value={cfg.room_config.min_players} onChange={(v) => updRoom("min_players", v)} />
                  <Field label="Max Players" value={cfg.room_config.max_players} onChange={(v) => updRoom("max_players", v)} />
                  <Field label="Duration (min)" value={cfg.room_config.room_duration_minutes} onChange={(v) => updRoom("room_duration_minutes", v)} />
                  <Field label="Platform Fee %" value={cfg.room_config.platform_fee_percent} onChange={(v) => updRoom("platform_fee_percent", v)} />
                  <Field label="Num Winners" value={cfg.room_config.num_winners} onChange={(v) => updRoom("num_winners", v)} />
                  <Field label="Auto Rooms" value={cfg.room_config.auto_room_count} onChange={(v) => updRoom("auto_room_count", v)} />
                  <Field label="Targets (CSV)" type="text" value={(cfg.room_config.room_targets || []).join(",")}
                    onChange={(v) => updRoom("room_targets", String(v).split(",").map((x) => parseFloat(x.trim())).filter((x) => !isNaN(x)))} />
                </div>
              </div>

              <button onClick={saveConfig} disabled={saving} data-testid="save-config-btn"
                className="flex items-center gap-2 px-8 py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Configuration
              </button>
            </div>
          )}
        </TabsContent>

        {/* USERS */}
        <TabsContent value="users" className="mt-6">
          <div className="flex gap-2 mb-4">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search username or mobile" data-testid="user-search"
              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:border-pazer-red outline-none transition-colors" />
            <button onClick={searchUsers} className="px-5 py-2.5 rounded-lg bg-pazer-red hover:bg-pazer-redhover font-bold text-sm transition-colors">Search</button>
          </div>
          <div className="rounded-2xl pz-glass p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-white/40 text-xs uppercase border-b border-white/10">
                <th className="text-left py-3">User</th><th className="text-left py-3">Balance</th><th className="text-left py-3">KYC</th><th className="text-left py-3">Status</th><th className="text-right py-3">Actions</th>
              </tr></thead>
              <tbody>
                {users.filter((u) => u.role !== "admin").map((u) => (
                  <tr key={u.id} className="border-b border-white/5" data-testid="admin-user-row">
                    <td className="py-3"><div className="font-medium">{u.username}</div><div className="text-xs text-white/40">{u.email}</div></td>
                    <td className="py-3 font-mono-pz">{((u.main_balance || 0) + (u.bonus_balance || 0)).toLocaleString()}</td>
                    <td className="py-3 capitalize text-white/60">{(u.kyc_status || "").replace("_", " ")}</td>
                    <td className="py-3"><span className={u.status === "suspended" ? "text-pazer-red" : "text-green-400"}>{u.status}</span></td>
                    <td className="py-3">
                      <div className="flex gap-1.5 justify-end flex-wrap">
                        {u.status === "suspended"
                          ? <button onClick={() => userAction(u.id, "reactivate")} className="text-xs px-2 py-1 rounded bg-green-400/10 text-green-400 hover:bg-green-400/20 transition-colors">Reactivate</button>
                          : <button onClick={() => userAction(u.id, "suspend")} data-testid={`suspend-${u.id}`} className="text-xs px-2 py-1 rounded bg-pazer-red/10 text-pazer-red hover:bg-pazer-red/20 transition-colors">Suspend</button>}
                        {u.kyc_status !== "verified" && <button onClick={() => userAction(u.id, "verify_kyc")} className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors">Verify KYC</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {users.filter((u) => u.role !== "admin").length === 0 && <tr><td colSpan={5} className="text-center py-10 text-white/40">No users.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* WITHDRAWALS */}
        <TabsContent value="withdrawals" className="mt-6">
          <div className="rounded-2xl pz-glass p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-white/40 text-xs uppercase border-b border-white/10">
                <th className="text-left py-3">Txn ID</th><th className="text-left py-3">User</th><th className="text-right py-3">Amount</th><th className="text-left py-3">Status</th><th className="text-right py-3">Action</th>
              </tr></thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id} className="border-b border-white/5">
                    <td className="py-3 font-mono-pz text-xs">{w.txn_id}</td>
                    <td className="py-3 text-xs text-white/50">{w.user_id.slice(0, 8)}…</td>
                    <td className="py-3 text-right font-mono-pz">{Math.abs(w.amount)}</td>
                    <td className="py-3"><span className={w.status === "pending" ? "text-yellow-400" : w.status === "success" ? "text-green-400" : "text-white/40"}>{w.status}</span></td>
                    <td className="py-3 text-right">
                      {w.status === "pending" ? (
                        <div className="flex gap-1.5 justify-end">
                          <button onClick={() => withdrawalAction(w.txn_id, "approve")} className="text-xs px-2 py-1 rounded bg-green-400/10 text-green-400 hover:bg-green-400/20 transition-colors">Approve</button>
                          <button onClick={() => withdrawalAction(w.txn_id, "reject")} className="text-xs px-2 py-1 rounded bg-pazer-red/10 text-pazer-red hover:bg-pazer-red/20 transition-colors">Reject</button>
                        </div>
                      ) : <span className="text-white/30 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
                {withdrawals.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-white/40">No withdrawals.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* LOGS */}
        <TabsContent value="logs" className="mt-6">
          <div className="rounded-2xl pz-glass p-4">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center justify-between py-2.5 border-b border-white/5 text-sm">
                <span className="font-mono-pz text-pazer-red">{l.action}</span>
                <span className="text-white/40 text-xs">{new Date(l.created_at).toLocaleString()}</span>
              </div>
            ))}
            {logs.length === 0 && <p className="text-center py-10 text-white/40">No logs.</p>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ToggleRow({ label, checked, onChange, testid }) {
  return (
    <div className="flex items-center gap-3">
      <Switch checked={!!checked} onCheckedChange={onChange} data-testid={testid} className="data-[state=checked]:bg-pazer-red" />
      <span className="text-sm text-white/70">{label}</span>
    </div>
  );
}
