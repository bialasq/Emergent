import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, formatApiError, setAccessToken } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = unknown (loading), false = guest, object = auth'd
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (err) {
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    const cleanEmail = String(email || "").trim().toLowerCase();
    const { data } = await api.post("/auth/login", { email: cleanEmail, password });
    if (data?.access_token) setAccessToken(data.access_token);
    const me = await api.get("/auth/me");
    setUser(me.data);
    return me.data;
  };

  const register = async (email, password, username) => {
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanName = String(username || "").trim();
    const { data } = await api.post("/auth/register", {
      email: cleanEmail,
      password,
      username: cleanName,
    });
    if (data?.access_token) setAccessToken(data.access_token);
    const me = await api.get("/auth/me");
    setUser(me.data);
    return me.data;
  };

  const logout = async () => {
    setAccessToken("");
    setUser(false);
  };

  const isAuthed = !!(user && typeof user === "object" && user.id);

  return (
    <AuthContext.Provider
      value={{ user, loading, isAuthed, login, register, logout, refresh, formatApiError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
