import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Timer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "", display_name: "", mobile: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await register(form);
      toast.success("Account created! Welcome to PAZER.");
      nav("/dashboard");
    } catch (e2) {
      setErr(formatApiError(e2.response?.data?.detail) || e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen pz-radial pz-grain flex items-center justify-center px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <Timer className="h-8 w-8 text-pazer-red" strokeWidth={2.5} />
          <span className="font-display font-extrabold text-2xl">PAZER</span>
        </Link>
        <div className="pz-glass rounded-2xl p-8">
          <h1 className="font-display font-bold text-2xl mb-1">Create account</h1>
          <p className="text-white/50 text-sm mb-6">Join the timing masters.</p>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs uppercase tracking-wider text-white/50">Username</label>
                <input data-testid="register-username" required value={form.username} onChange={upd("username")}
                  className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 focus:border-pazer-red outline-none transition-colors" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-white/50">Display name</label>
                <input data-testid="register-displayname" value={form.display_name} onChange={upd("display_name")}
                  className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 focus:border-pazer-red outline-none transition-colors" />
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Email</label>
              <input data-testid="register-email" type="email" required value={form.email} onChange={upd("email")}
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 focus:border-pazer-red outline-none transition-colors" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Mobile (optional)</label>
              <input data-testid="register-mobile" value={form.mobile} onChange={upd("mobile")}
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 focus:border-pazer-red outline-none transition-colors" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Password</label>
              <input data-testid="register-password" type="password" required value={form.password} onChange={upd("password")}
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 focus:border-pazer-red outline-none transition-colors" />
            </div>
            {err && <p data-testid="register-error" className="text-sm text-pazer-red">{err}</p>}
            <button data-testid="register-submit" disabled={busy}
              className="w-full py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create account
            </button>
          </form>
          <p className="text-center text-sm text-white/50 mt-6">
            Already have an account? <Link to="/login" className="text-pazer-red hover:underline">Log in</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
