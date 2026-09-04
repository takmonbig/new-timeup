import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Navbar } from "@/components/Navbar";
import { BottomNav } from "@/components/BottomNav";
import { WinTicker } from "@/components/WinTicker";
import { SciFiBackground } from "@/components/SciFiBackground";
import { CenterPopupHost } from "@/components/CenterPopup";
import { WinCelebrationHost } from "@/components/WinCelebration";
import { QuickActions } from "@/components/QuickActions";
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
    <div className="min-h-screen pb-28">
      <SciFiBackground />
      <CenterPopupHost />
      <WinCelebrationHost />
      <div className="pz-content">
        <Navbar />
        <Outlet />
        {!adminOnly && <><WinTicker /><QuickActions /><BottomNav /></>}
      </div>
    </div>
  );
}

export function PublicLayout() {
  const { loading } = useAuth();
  if (loading) return <Loader />;
  return (
    <div className="min-h-screen">
      <SciFiBackground />
      <CenterPopupHost />
      <div className="pz-content">
        <Navbar />
        <Outlet />
      </div>
    </div>
  );
}
