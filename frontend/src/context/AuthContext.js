import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = guest, object = auth
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    if (!localStorage.getItem("pazer_token")) {
      setUser(false);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (mobile, password) => {
    const { data } = await api.post("/auth/login", { mobile, password });
    if (data.token) localStorage.setItem("pazer_token", data.token);
    setUser(data.user);
    window.dispatchEvent(new Event("wallet:refresh"));
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    if (data.token) localStorage.setItem("pazer_token", data.token);
    setUser(data.user);
    window.dispatchEvent(new Event("wallet:refresh"));
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    localStorage.removeItem("pazer_token");
    setUser(false);
  };

  const refreshUser = fetchMe;

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser, formatApiError }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
