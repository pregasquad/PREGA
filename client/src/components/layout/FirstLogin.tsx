import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, User, Settings, ArrowLeft, Phone, KeyRound } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface AdminRole {
  id: number;
  name: string;
  role: string;
  pin: string | null;
}

interface FirstLoginProps {
  children: React.ReactNode;
}

const ROLE_COLORS: Record<string, string> = {
  owner: "from-red-400 to-red-600",
  manager: "from-blue-400 to-blue-600",
  receptionist: "from-green-400 to-green-600"
};

export function FirstLogin({ children }: FirstLoginProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [location] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem("user_authenticated") === "true";
    }
    return false;
  });

  const isPublicRoute = location === "/booking";
  const [selectedUser, setSelectedUser] = useState<AdminRole | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Forgot PIN state
  const [showForgotPin, setShowForgotPin] = useState(false);
  const [businessPhone, setBusinessPhone] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const { data: adminRoles = [] } = useQuery<AdminRole[]>({
    queryKey: ["/api/admin-roles"],
    queryFn: async () => {
      const res = await fetch("/api/admin-roles");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !isAuthenticated,
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!selectedUser) {
      setError(t("auth.selectUser"));
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiRequest("POST", "/api/admin-roles/verify-pin", {
        name: selectedUser.name,
        pin: pin
      });

      const data = await response.json();

      if (data.success) {
        sessionStorage.setItem("user_authenticated", "true");
        sessionStorage.setItem("current_user", selectedUser.name);
        sessionStorage.setItem("current_user_role", data.role || "");
        sessionStorage.setItem("current_user_permissions", JSON.stringify(data.permissions || []));
        setIsAuthenticated(true);
      } else {
        setError(t("auth.wrongPassword"));
        setPin("");
      }
    } catch (err) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-lg p-6 md:p-8 shadow-2xl border-2 border-primary/20">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg">
              <span className="text-3xl font-bold text-white">P</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-primary">PREGA SQUAD</h1>
          </div>

          <div>
            <h2 className="text-xl md:text-2xl font-bold font-display">{t("auth.welcome")}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{t("auth.selectUserToLogin")}</p>
          </div>

          {!selectedUser ? (
            <div className="w-full">
              <div className="flex flex-wrap justify-center gap-4 py-4">
                {adminRoles.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => setSelectedUser(role)}
                    className="group flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-all duration-200"
                  >
                    <div className={cn(
                      "w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center text-white text-2xl md:text-3xl font-bold shadow-lg transition-transform group-hover:scale-110 bg-gradient-to-br",
                      ROLE_COLORS[role.role] || "from-gray-400 to-gray-600"
                    )}>
                      {role.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-foreground">{role.name}</span>
                    <span className="text-xs text-muted-foreground capitalize">{role.role}</span>
                  </button>
                ))}
              </div>

              {adminRoles.length === 0 && (
                <div className="space-y-4 py-6">
                  <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center">
                    <User className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("auth.noUsersConfigured")}
                  </p>
                  <Button 
                    variant="outline" 
                    className="w-full"
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
            </div>
          ) : showForgotPin ? (
            <form onSubmit={handleResetPin} className="w-full space-y-4">
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
                className="mb-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                {t("common.back")}
              </Button>

              <div className="flex flex-col items-center gap-2">
                <div className={cn(
                  "w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-lg ring-4 ring-orange-300 bg-gradient-to-br",
                  ROLE_COLORS[selectedUser.role] || "from-gray-400 to-gray-600"
                )}>
                  <KeyRound className="w-10 h-10" />
                </div>
                <span className="text-lg font-semibold text-foreground">{t("auth.resetPinFor")} {selectedUser.name}</span>
              </div>

              <p className="text-sm text-muted-foreground text-center">
                {t("auth.enterBusinessPhoneToReset")}
              </p>

              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type="tel"
                  placeholder={t("auth.businessPhone")}
                  value={businessPhone}
                  onChange={(e) => setBusinessPhone(e.target.value)}
                  className="h-12 pl-10"
                  autoFocus
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder={t("auth.newPin")}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  className="h-12 pl-10 text-center text-lg tracking-widest"
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder={t("auth.confirmPin")}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  className="h-12 pl-10 text-center text-lg tracking-widest"
                />
              </div>

              {error && <p className="text-sm text-destructive font-medium">{error}</p>}

              <Button 
                type="submit" 
                className="w-full h-12 text-lg bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
                disabled={resetLoading || !businessPhone || !newPin || !confirmPin}
              >
                {resetLoading ? t("common.loading") : t("auth.resetPin")}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="w-full space-y-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedUser(null);
                  setPin("");
                  setError("");
                }}
                className="mb-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                {t("common.back")}
              </Button>

              <div className="flex flex-col items-center gap-2">
                <div className={cn(
                  "w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-lg ring-4 ring-primary/30 bg-gradient-to-br",
                  ROLE_COLORS[selectedUser.role] || "from-gray-400 to-gray-600"
                )}>
                  {selectedUser.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-lg font-semibold text-foreground">{selectedUser.name}</span>
                <span className="text-xs text-muted-foreground capitalize">{selectedUser.role}</span>
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder={t("auth.enterPin")}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className={cn(
                    "h-12 pl-10 text-center text-lg tracking-widest",
                    error && "border-destructive focus-visible:ring-destructive"
                  )}
                  autoComplete="current-password"
                  autoFocus
                />
              </div>

              {error && <p className="text-sm text-destructive font-medium">{error}</p>}

              <Button 
                type="submit" 
                className="w-full h-12 text-lg bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
                disabled={isLoading}
              >
                {isLoading ? t("common.loading") : t("auth.login")}
              </Button>

              <Button
                type="button"
                variant="link"
                className="w-full text-sm text-muted-foreground hover:text-primary"
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
      </Card>
    </div>
  );
}
