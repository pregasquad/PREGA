import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, User, Settings, ArrowLeft, Phone, KeyRound, Sparkles, WifiOff, Wifi, CloudOff, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + "pregasquad_salt_2024");
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getOfflineCredentials(): Record<string, { hash: string; role: string; permissions: string[] }> {
  try {
    const stored = localStorage.getItem("offline_credentials");
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveOfflineCredential(name: string, pinHash: string, role: string, permissions: string[]) {
  const credentials = getOfflineCredentials();
  credentials[name] = { hash: pinHash, role, permissions };
  localStorage.setItem("offline_credentials", JSON.stringify(credentials));
}

function getOfflineUsersAsAdminRoles(): AdminRole[] {
  const credentials = getOfflineCredentials();
  return Object.entries(credentials).map(([name, data], index) => ({
    id: -(index + 1),
    name,
    role: data.role,
    pin: null,
    photoUrl: null,
    isOffline: true
  }));
}

interface AdminRole {
  id: number;
  name: string;
  role: string;
  pin: string | null;
  photoUrl: string | null;
  isOffline?: boolean;
}

interface DatabaseStatus {
  online: boolean;
  mode: "online" | "offline";
  hasPendingSync: boolean;
}

interface FirstLoginProps {
  children: React.ReactNode;
}

const ROLE_COLORS: Record<string, string> = {
  owner: "from-rose-400 via-pink-500 to-purple-500",
  manager: "from-orange-400 via-amber-500 to-yellow-500",
  receptionist: "from-emerald-400 via-green-500 to-teal-500"
};

const ROLE_GLOW: Record<string, string> = {
  owner: "shadow-rose-500/30",
  manager: "shadow-orange-500/30",
  receptionist: "shadow-emerald-500/30"
};

export function FirstLogin({ children }: FirstLoginProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [location] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window !== 'undefined') {
      const wasLoggedOut = sessionStorage.getItem("explicit_logout") === "true" ||
                           localStorage.getItem("explicit_logout") === "true";
      if (wasLoggedOut) return false;
      
      const sessionAuth = sessionStorage.getItem("user_authenticated") === "true";
      if (sessionAuth) return true;
      
      const localAuth = localStorage.getItem("user_authenticated") === "true";
      if (localAuth) {
        sessionStorage.setItem("user_authenticated", "true");
        sessionStorage.setItem("current_user", localStorage.getItem("current_user") || "");
        sessionStorage.setItem("current_user_role", localStorage.getItem("current_user_role") || "");
        sessionStorage.setItem("current_user_permissions", localStorage.getItem("current_user_permissions") || "[]");
        return true;
      }
    }
    return false;
  });

  const isPublicRoute = location === "/booking";
  const [selectedUser, setSelectedUser] = useState<AdminRole | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [showForgotPin, setShowForgotPin] = useState(false);
  const [businessPhone, setBusinessPhone] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    const wasLoggedOut = sessionStorage.getItem("explicit_logout") === "true" ||
                         localStorage.getItem("explicit_logout") === "true";
    
    if (typeof window !== 'undefined' && !isAuthenticated && !wasLoggedOut) {
      const localAuth = localStorage.getItem("user_authenticated") === "true";
      if (localAuth) {
        const user = localStorage.getItem("current_user");
        const role = localStorage.getItem("current_user_role");
        const perms = localStorage.getItem("current_user_permissions");
        
        if (user && role && perms) {
          sessionStorage.setItem("user_authenticated", "true");
          sessionStorage.setItem("current_user", user);
          sessionStorage.setItem("current_user_role", role);
          sessionStorage.setItem("current_user_permissions", perms);
          setIsAuthenticated(true);
        }
      }
    }
  }, [isAuthenticated]);

  const { data: dbStatus } = useQuery<DatabaseStatus>({
    queryKey: ["/api/status/database"],
    queryFn: async () => {
      const res = await fetch("/api/status/database");
      if (!res.ok) return { online: true, mode: "online" as const, hasPendingSync: false };
      return res.json();
    },
    refetchInterval: 30000,
    enabled: !isAuthenticated,
  });

  const isOfflineMode = dbStatus?.mode === "offline" || !navigator.onLine;

  const { data: serverAdminRoles = [] } = useQuery<AdminRole[]>({
    queryKey: ["/api/admin-roles"],
    queryFn: async () => {
      const res = await fetch("/api/admin-roles");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !isAuthenticated,
  });

  const offlineUsers = getOfflineUsersAsAdminRoles();
  const adminRoles = serverAdminRoles.length > 0 ? serverAdminRoles : offlineUsers;
  const hasNoUsersAnywhere = serverAdminRoles.length === 0 && offlineUsers.length === 0;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!selectedUser) {
      setError(t("auth.selectUser"));
      return;
    }

    setIsLoading(true);

    const isOffline = !navigator.onLine;
    
    if (isOffline) {
      const credentials = getOfflineCredentials();
      const userCreds = credentials[selectedUser.name];
      
      if (!userCreds) {
        setError(t("auth.offlineNoCredentials"));
        setPin("");
        setIsLoading(false);
        return;
      }
      
      const enteredHash = await hashPin(pin);
      
      if (enteredHash === userCreds.hash) {
        sessionStorage.removeItem("explicit_logout");
        localStorage.removeItem("explicit_logout");
        
        const perms = JSON.stringify(userCreds.permissions || []);
        sessionStorage.setItem("user_authenticated", "true");
        sessionStorage.setItem("current_user", selectedUser.name);
        sessionStorage.setItem("current_user_role", userCreds.role || "");
        sessionStorage.setItem("current_user_permissions", perms);
        
        localStorage.setItem("user_authenticated", "true");
        localStorage.setItem("current_user", selectedUser.name);
        localStorage.setItem("current_user_role", userCreds.role || "");
        localStorage.setItem("current_user_permissions", perms);
        
        setIsAuthenticated(true);
      } else {
        setError(t("auth.wrongPassword"));
        setPin("");
      }
      setIsLoading(false);
      return;
    }

    try {
      const response = await apiRequest("POST", "/api/admin-roles/verify-pin", {
        name: selectedUser.name,
        pin: pin
      });

      const data = await response.json();

      if (data.success) {
        sessionStorage.removeItem("explicit_logout");
        localStorage.removeItem("explicit_logout");
        
        const perms = JSON.stringify(data.permissions || []);
        sessionStorage.setItem("user_authenticated", "true");
        sessionStorage.setItem("current_user", selectedUser.name);
        sessionStorage.setItem("current_user_role", data.role || "");
        sessionStorage.setItem("current_user_permissions", perms);
        
        localStorage.setItem("user_authenticated", "true");
        localStorage.setItem("current_user", selectedUser.name);
        localStorage.setItem("current_user_role", data.role || "");
        localStorage.setItem("current_user_permissions", perms);
        
        const pinHash = await hashPin(pin);
        saveOfflineCredential(selectedUser.name, pinHash, data.role || "", data.permissions || []);
        
        setIsAuthenticated(true);
      } else {
        setError(t("auth.wrongPassword"));
        setPin("");
      }
    } catch (err) {
      const credentials = getOfflineCredentials();
      const userCreds = credentials[selectedUser.name];
      
      if (userCreds) {
        const enteredHash = await hashPin(pin);
        
        if (enteredHash === userCreds.hash) {
          sessionStorage.removeItem("explicit_logout");
          localStorage.removeItem("explicit_logout");
          
          const perms = JSON.stringify(userCreds.permissions || []);
          sessionStorage.setItem("user_authenticated", "true");
          sessionStorage.setItem("current_user", selectedUser.name);
          sessionStorage.setItem("current_user_role", userCreds.role || "");
          sessionStorage.setItem("current_user_permissions", perms);
          
          localStorage.setItem("user_authenticated", "true");
          localStorage.setItem("current_user", selectedUser.name);
          localStorage.setItem("current_user_role", userCreds.role || "");
          localStorage.setItem("current_user_permissions", perms);
          
          setIsAuthenticated(true);
          setIsLoading(false);
          return;
        }
      }
      
      setError(t("auth.wrongPassword"));
      setPin("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!selectedUser) {
      setError(t("auth.selectUser"));
      return;
    }

    if (newPin.length < 4) {
      setError(t("auth.pinTooShort"));
      return;
    }

    if (newPin !== confirmPin) {
      setError(t("auth.pinsDoNotMatch"));
      return;
    }

    setResetLoading(true);

    try {
      const response = await apiRequest("POST", "/api/admin-roles/reset-pin", {
        name: selectedUser.name,
        businessPhone,
        newPin
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: t("auth.pinResetSuccess"),
          description: t("auth.pinResetSuccessDesc"),
        });
        setShowForgotPin(false);
        setBusinessPhone("");
        setNewPin("");
        setConfirmPin("");
      } else {
        setError(data.message || t("auth.resetFailed"));
      }
    } catch (err: any) {
      setError(t("auth.invalidBusinessPhone"));
    } finally {
      setResetLoading(false);
    }
  };

  if (isAuthenticated || isPublicRoute) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
      {/* Elegant gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-orange-50 to-amber-100 dark:from-slate-950 dark:via-slate-900 dark:to-amber-950" />
      
      {/* Animated gradient orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-orange-400/20 to-amber-400/20 blur-3xl animate-pulse" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-purple-400/20 to-pink-400/20 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-gradient-to-br from-yellow-400/15 to-amber-400/15 blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      
      {/* Glass card */}
      <div className="relative w-full max-w-md mx-4 p-8 rounded-3xl bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-2xl shadow-black/5 dark:shadow-black/20 animate-fade-in">
        <div className="flex flex-col items-center gap-8 text-center">
          {/* Logo section */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 flex items-center justify-center shadow-lg shadow-orange-500/25 rotate-3 transition-transform hover:rotate-0">
                <span className="text-3xl font-black text-white">P</span>
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 dark:from-white dark:via-slate-200 dark:to-slate-400 bg-clip-text text-transparent tracking-tight">
              PREGA SQUAD
            </h1>
          </div>

          {/* Offline mode indicator */}
          {isOfflineMode && (
            <div className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800">
              <CloudOff className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                Mode hors ligne
              </span>
            </div>
          )}

          {/* Welcome text */}
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white">{t("auth.welcome")}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("auth.selectUserToLogin")}</p>
          </div>

          {!selectedUser ? (
            <div className="w-full">
              <div className="flex flex-wrap justify-center gap-6 py-4">
                {adminRoles.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => setSelectedUser(role)}
                    className="group flex flex-col items-center gap-3 p-4 rounded-2xl hover:bg-white/50 dark:hover:bg-white/5 transition-all duration-300"
                  >
                    <div className="relative">
                      {role.photoUrl ? (
                        <img 
                          src={role.photoUrl}
                          alt={role.name}
                          className={cn(
                            "w-20 h-20 rounded-2xl object-cover shadow-xl transition-all duration-300 group-hover:scale-105 group-hover:shadow-2xl ring-2 ring-white/50 dark:ring-white/20",
                            ROLE_GLOW[role.role] || "shadow-slate-500/30"
                          )}
                        />
                      ) : (
                        <div className={cn(
                          "w-20 h-20 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-xl transition-all duration-300 group-hover:scale-105 group-hover:shadow-2xl bg-gradient-to-br",
                          ROLE_COLORS[role.role] || "from-slate-400 to-slate-600",
                          ROLE_GLOW[role.role] || "shadow-slate-500/30"
                        )}>
                          {role.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {/* Online indicator */}
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 shadow-lg" />
                    </div>
                    <div className="text-center">
                      <span className="block text-sm font-semibold text-slate-800 dark:text-white">{role.name}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400 capitalize">{role.role}</span>
                    </div>
                  </button>
                ))}
              </div>

              {hasNoUsersAnywhere && navigator.onLine && (
                <div className="space-y-4 py-6">
                  <div className="w-20 h-20 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <User className="w-10 h-10 text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t("auth.noUsersConfigured")}
                  </p>
                  <Button 
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-medium shadow-lg shadow-orange-500/25 transition-all"
                    onClick={() => {
                      sessionStorage.setItem("user_authenticated", "true");
                      sessionStorage.setItem("current_user", "Setup");
                      sessionStorage.setItem("current_user_role", "owner");
                      sessionStorage.setItem("current_user_permissions", JSON.stringify([]));
                      setIsAuthenticated(true);
                      window.location.href = "/admin-settings";
                    }}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    {t("auth.setupFirstUser")}
                  </Button>
                </div>
              )}
              
              {hasNoUsersAnywhere && !navigator.onLine && (
                <div className="space-y-4 py-6">
                  <div className="w-20 h-20 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <WifiOff className="w-10 h-10 text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t("auth.offlineNoCredentials")}
                  </p>
                </div>
              )}
            </div>
          ) : showForgotPin ? (
            <form onSubmit={handleResetPin} className="w-full space-y-5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForgotPin(false);
                  setBusinessPhone("");
                  setNewPin("");
                  setConfirmPin("");
                  setError("");
                }}
                className="mb-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                {t("common.back")}
              </Button>

              <div className="flex flex-col items-center gap-3">
                <div className={cn(
                  "w-20 h-20 rounded-2xl flex items-center justify-center text-white shadow-xl bg-gradient-to-br",
                  ROLE_COLORS[selectedUser.role] || "from-slate-400 to-slate-600"
                )}>
                  <KeyRound className="w-10 h-10" />
                </div>
                <span className="text-lg font-semibold text-slate-800 dark:text-white">{t("auth.resetPinFor")} {selectedUser.name}</span>
              </div>

              <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                {t("auth.enterBusinessPhoneToReset")}
              </p>

              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  type="tel"
                  placeholder={t("auth.businessPhone")}
                  value={businessPhone}
                  onChange={(e) => setBusinessPhone(e.target.value)}
                  className="h-14 pl-12 rounded-xl border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                  autoFocus
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  type="password"
                  placeholder={t("auth.newPin")}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  className="h-14 pl-12 rounded-xl border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 text-center text-lg tracking-[0.5em] font-mono focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  type="password"
                  placeholder={t("auth.confirmPin")}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  className="h-14 pl-12 rounded-xl border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 text-center text-lg tracking-[0.5em] font-mono focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                />
              </div>

              {error && (
                <p className="text-sm text-rose-500 font-medium bg-rose-50 dark:bg-rose-500/10 rounded-lg py-2 px-3">{error}</p>
              )}

              <Button 
                type="submit" 
                className="w-full h-14 text-base font-semibold rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg shadow-orange-500/25 transition-all active:scale-[0.98]"
                disabled={resetLoading || !businessPhone || !newPin || !confirmPin}
              >
                {resetLoading ? t("common.loading") : t("auth.resetPin")}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="w-full space-y-5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedUser(null);
                  setPin("");
                  setError("");
                }}
                className="mb-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                {t("common.back")}
              </Button>

              <div className="flex flex-col items-center gap-3">
                {selectedUser.photoUrl ? (
                  <img 
                    src={selectedUser.photoUrl}
                    alt={selectedUser.name}
                    className={cn(
                      "w-24 h-24 rounded-2xl object-cover shadow-xl ring-4 ring-white/50 dark:ring-white/20",
                      ROLE_GLOW[selectedUser.role] || "shadow-slate-500/30"
                    )}
                  />
                ) : (
                  <div className={cn(
                    "w-24 h-24 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-xl bg-gradient-to-br",
                    ROLE_COLORS[selectedUser.role] || "from-slate-400 to-slate-600",
                    ROLE_GLOW[selectedUser.role] || "shadow-slate-500/30"
                  )}>
                    {selectedUser.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-center">
                  <span className="block text-xl font-semibold text-slate-800 dark:text-white">{selectedUser.name}</span>
                  <span className="block text-sm text-slate-500 dark:text-slate-400 capitalize">{selectedUser.role}</span>
                </div>
              </div>

              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  type="password"
                  placeholder={t("auth.enterPin")}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className={cn(
                    "h-14 pl-12 rounded-xl border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 text-center text-xl tracking-[0.5em] font-mono focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all",
                    error && "border-rose-500 focus:ring-rose-500/20 focus:border-rose-500"
                  )}
                  autoComplete="current-password"
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-sm text-rose-500 font-medium bg-rose-50 dark:bg-rose-500/10 rounded-lg py-2 px-3">{error}</p>
              )}

              <Button 
                type="submit" 
                className="w-full h-14 text-base font-semibold rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg shadow-orange-500/25 transition-all active:scale-[0.98]"
                disabled={isLoading}
              >
                {isLoading ? t("common.loading") : t("auth.login")}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full text-sm text-slate-500 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                onClick={() => {
                  setShowForgotPin(true);
                  setPin("");
                  setError("");
                }}
              >
                {t("auth.forgotPin")}
              </Button>
            </form>
          )}
        </div>
        
        {/* Bottom decorative line */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-1 rounded-full bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 opacity-50" />
      </div>
    </div>
  );
}
