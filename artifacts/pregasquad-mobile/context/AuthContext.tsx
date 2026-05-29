import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiFetch } from "@/lib/api";

export interface AdminRole {
  id: number;
  name: string;
  role: string;
  permissions: string[];
  photoUrl?: string;
}

interface AuthState {
  userName: string;
  role: string;
  permissions: string[];
  roleId?: number;
}

interface AuthContextType {
  user: AuthState | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (name: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
}

const STORAGE_KEY = "@pregasquad_auth";

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const restore = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as AuthState;
          // Verify session is still valid
          const session = await apiFetch<{ authenticated: boolean }>(
            "/api/auth/session"
          ).catch(() => null);
          if (session?.authenticated) {
            setUser(parsed);
          } else {
            await AsyncStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch {}
      setIsLoading(false);
    };
    restore();
  }, []);

  const login = useCallback(async (name: string, pin: string) => {
    const result = await apiFetch<{
      success: boolean;
      role?: string;
      permissions?: string[];
      message?: string;
    }>("/api/admin-roles/verify-pin", {
      method: "POST",
      body: JSON.stringify({ name, pin }),
    });
    if (!result.success) {
      throw new Error(result.message ?? "Invalid PIN");
    }
    const state: AuthState = {
      userName: name,
      role: result.role ?? "staff",
      permissions: result.permissions ?? [],
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setUser(state);
  }, []);

  const logout = useCallback(async () => {
    await apiFetch("/api/auth/pin-logout", { method: "POST" }).catch(() => {});
    await AsyncStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
