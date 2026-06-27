import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';

interface AuthUser {
  id: string;
  username: string;
  customEmail: string;
  role: string;
}
interface AuthState {
  user: AuthUser | null;
  token: string | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('guardmail_token'));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem('guardmail_user');
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (token) localStorage.setItem('guardmail_token', token);
    else localStorage.removeItem('guardmail_token');
    if (user) localStorage.setItem('guardmail_user', JSON.stringify(user));
    else localStorage.removeItem('guardmail_user');
    setReady(true);
  }, [token, user]);

  // NOTE: we write the token to localStorage *imperatively* here, not
  // via the useEffect below. The effect only runs after React commits
  // the render, but callers (e.g. RegisterPage/LoginPage) invoke
  // api.startCheckout() on the very next line after `await login()` /
  // `await register()`. The api client reads the JWT from localStorage
  // synchronously, so the deferred effect would be too late — for a
  // brand-new user localStorage would still be empty and the checkout
  // request would go out unauthenticated (401), dropping the Stripe
  // redirect. Writing here makes the token available immediately.
  const login = async (username: string, password: string) => {
    const res = await api.login({ username, password });
    const u: AuthUser = { id: res.user.id, username: res.user.username, customEmail: res.user.customEmail, role: res.user.role };
    localStorage.setItem('guardmail_token', res.token);
    localStorage.setItem('guardmail_user', JSON.stringify(u));
    setToken(res.token);
    setUser(u);
  };

  const register = async (username: string, email: string, password: string) => {
    const res = await api.register({ username, email, password });
    const u: AuthUser = { id: res.user.id, username: res.user.username, customEmail: res.customEmail, role: res.user.role };
    localStorage.setItem('guardmail_token', res.token);
    localStorage.setItem('guardmail_user', JSON.stringify(u));
    setToken(res.token);
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem('guardmail_token');
    localStorage.removeItem('guardmail_user');
    setToken(null);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, token, ready, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
