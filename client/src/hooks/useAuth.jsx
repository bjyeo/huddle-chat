import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .getMe()
      .then(({ user }) => active && setUser(user))
      .catch(() => {}) // 401 simply means "not logged in"
      .finally(() => active && setLoading(false));
    api.setUnauthorizedHandler(() => setUser(null));
    return () => {
      active = false;
      api.setUnauthorizedHandler(null);
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const { user } = await api.login(credentials);
    setUser(user);
    return user;
  }, []);

  const register = useCallback(async (fields) => {
    const { user } = await api.register(fields);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  /** Re-checks the session with the server; resolves false (and logs out) if it has ended. */
  const revalidate = useCallback(async () => {
    try {
      const { user } = await api.getMe();
      setUser(user);
      return true;
    } catch (err) {
      if (err.status === 401) setUser(null);
      return false;
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, revalidate }),
    [user, loading, login, register, logout, revalidate],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = use(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
