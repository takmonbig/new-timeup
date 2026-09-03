import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Timer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const u = await login(email, password);
      toast.success("Welcome back!");
      nav(u.role === "admin" ? "/admin" : "/dashboard");
    } catch (e2) {
      setErr(formatApiError(e2.response?.data?.detail) || e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen pz-radial pz-grain flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <Timer className="h-8 w-8 text-pazer-red" strokeWidth={2.5} />
          <span className="font-display font-extrabold text-2xl">PAZER</span>
        </Link>
        <div className="pz-glass rounded-2xl p-8">
          <h1 className="font-display font-bold text-2xl mb-1">Log in</h1>
          <p className="text-white/50 text-sm mb-6">Master your timing.</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Email</label>
              <input data-testid="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 focus:border-pazer-red outline-none transition-colors" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Password</label>
              <input data-testid="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 focus:border-pazer-red outline-none transition-colors" />
            </div>
            {err && <p data-testid="login-error" className="text-sm text-pazer-red">{err}</p>}
            <button data-testid="login-submit" disabled={busy}
              className="w-full py-3 rounded-full bg-pazer-red hover:bg-pazer-redhover font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Log in
            </button>
          </form>
          <p className="text-center text-sm text-white/50 mt-6">
            No account? <Link to="/register" className="text-pazer-red hover:underline">Create one</Link>
          </p>
          <div className="mt-4 text-center text-xs text-white/30">
            Admin demo: admin@pazer.com / Admin@123
          </div>
        </div>
      </motion.div>
    </div>
  );
}
