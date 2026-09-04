import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Navbar } from "@/components/Navbar";
import { BottomNav } from "@/components/BottomNav";
import { WinTicker } from "@/components/WinTicker";
import { Timer } from "lucide-react";

function Loader() {
  return (
    <div className="min-h-screen flex items-center justify-center pz-radial">
      <Timer className="h-10 w-10 text-pazer-red animate-spin" />
    </div>
  );
}

export function ProtectedRoute({ adminOnly }) {
  const { user, loading } = useAuth();
  if (loading || user === null) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/home" replace />;
  return (
    <div className="min-h-screen pz-radial pz-grain pb-24">
      <Navbar />
      <Outlet />
      {!adminOnly && <><WinTicker /><BottomNav /></>}
    </div>
  );
}

export function PublicLayout() {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  return (
    <div className="min-h-screen pz-radial pz-grain">
      <Navbar />
      <Outlet />
    </div>
  );
}
