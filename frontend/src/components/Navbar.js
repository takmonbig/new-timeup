import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Timer, Wallet, LayoutDashboard, Gamepad2, Users, User, LifeBuoy, LogOut, Shield, Menu, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

const links = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/play", label: "Play", icon: Gamepad2 },
  { to: "/rooms", label: "Rooms", icon: Users },
  { to: "/wallet", label: "Wallet", icon: Wallet },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/support", label: "Support", icon: LifeBuoy },
];

export function Navbar() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [balance, setBalance] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (user) {
      api.get("/wallet").then(({ data }) => setBalance(data.total_balance)).catch(() => {});
    }
  }, [user, loc.pathname]);

  const doLogout = async () => {
    await logout();
    nav("/");
  };

  return (
    <header className="sticky top-0 z-50 pz-glass">
      <div className="mx-auto max-w-7xl px-4 md:px-8 h-16 flex items-center justify-between gap-4">
        <Link to={user ? "/dashboard" : "/"} className="flex items-center gap-2 group" data-testid="nav-logo">
          <motion.div whileHover={{ rotate: 90 }} transition={{ type: "spring", stiffness: 200 }}>
            <Timer className="h-7 w-7 text-pazer-red" strokeWidth={2.5} />
          </motion.div>
          <span className="font-display font-extrabold text-xl tracking-tight">PAZER</span>
        </Link>

        {user && (
          <nav className="hidden lg:flex items-center gap-1">
            {links.map((l) => {
              const active = loc.pathname.startsWith(l.to);
              return (
                <Link key={l.to} to={l.to} data-testid={`nav-${l.label.toLowerCase()}`}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                    active ? "text-pazer-red bg-pazer-red/10" : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}>
                  {l.label}
                </Link>
              );
            })}
            {user.role === "admin" && (
              <Link to="/admin" data-testid="nav-admin"
                className={`px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1 transition-colors ${
                  loc.pathname.startsWith("/admin") ? "text-pazer-red bg-pazer-red/10" : "text-white/60 hover:text-white"
                }`}>
                <Shield className="h-4 w-4" /> Admin
              </Link>
            )}
          </nav>
        )}

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link to="/wallet" data-testid="nav-balance"
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 border border-white/10 hover:border-pazer-red/50 transition-colors">
                <span className="h-2 w-2 rounded-full bg-pazer-red" />
                <span className="font-mono-pz text-sm font-bold">{balance != null ? balance.toLocaleString() : "…"}</span>
                <span className="text-xs text-white/40">coins</span>
              </Link>
              <button onClick={doLogout} data-testid="nav-logout"
                className="hidden lg:flex items-center justify-center h-9 w-9 rounded-lg text-white/50 hover:text-pazer-red hover:bg-white/5 transition-colors">
                <LogOut className="h-4 w-4" />
              </button>
              <button onClick={() => setOpen((o) => !o)} className="lg:hidden text-white" data-testid="nav-menu-toggle">
                {open ? <X /> : <Menu />}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" data-testid="nav-login"
                className="px-4 py-2 text-sm font-medium text-white/70 hover:text-white transition-colors">Log in</Link>
              <Link to="/register" data-testid="nav-signup"
                className="px-4 py-2 text-sm font-bold rounded-full bg-pazer-red hover:bg-pazer-redhover transition-colors">
                Get Started
              </Link>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {open && user && (
          <motion.nav initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="lg:hidden overflow-hidden border-t border-white/10 bg-black/80">
            <div className="px-4 py-3 flex flex-col gap-1">
              {links.map((l) => (
                <Link key={l.to} to={l.to} onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/70 hover:bg-white/5">
                  <l.icon className="h-4 w-4" /> {l.label}
                </Link>
              ))}
              {user.role === "admin" && (
                <Link to="/admin" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-pazer-red">
                  <Shield className="h-4 w-4" /> Admin
                </Link>
              )}
              <button onClick={doLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/70 text-left">
                <LogOut className="h-4 w-4" /> Log out
              </button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
