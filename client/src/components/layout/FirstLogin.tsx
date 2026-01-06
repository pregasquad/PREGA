import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, User } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface AdminRole {
  id: number;
  name: string;
  role: string;
  pin: string | null;
}

interface FirstLoginProps {
  children: React.ReactNode;
}

export function FirstLogin({ children }: FirstLoginProps) {
  const { t } = useTranslation();
  const [location] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem("user_authenticated") === "true";
    }
    return false;
  });

  const isPublicRoute = location === "/booking";
  const [selectedUser, setSelectedUser] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
        name: selectedUser,
        pin: pin
      });

      const data = await response.json();

      if (data.success) {
        sessionStorage.setItem("user_authenticated", "true");
        sessionStorage.setItem("current_user", selectedUser);
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

  if (isAuthenticated || isPublicRoute) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100 dark:from-gray-900 dark:to-gray-800">
      <Card className="w-full max-w-md p-8 shadow-2xl border-2 border-primary/20">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
              <span className="text-2xl font-bold text-white">P</span>
            </div>
            <h1 className="text-2xl font-bold text-primary">PREGA SQUAD</h1>
          </div>

          <div className="p-4 rounded-full bg-primary/10">
            <Lock className="w-10 h-10 text-primary" />
          </div>

          <div>
            <h2 className="text-2xl font-bold font-display">{t("auth.welcome")}</h2>
            <p className="text-muted-foreground mt-2">{t("auth.loginToAccess")}</p>
          </div>

          <form onSubmit={handleLogin} className="w-full space-y-4 mt-2">
            <div className="space-y-2">
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="w-full h-12">
                  <User className="w-4 h-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder={t("auth.selectUser")} />
                </SelectTrigger>
                <SelectContent>
                  {adminRoles.map((role) => (
                    <SelectItem key={role.id} value={role.name}>
                      {role.name} ({t(`adminSettings.${role.role}`)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Input
              type="password"
              placeholder={t("auth.enterPin")}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className={`h-12 ${error ? "border-destructive focus-visible:ring-destructive" : ""}`}
              autoComplete="current-password"
            />

            {error && <p className="text-sm text-destructive font-medium">{error}</p>}

            <Button 
              type="submit" 
              className="w-full h-12 text-lg"
              disabled={isLoading || !selectedUser}
            >
              {isLoading ? t("common.loading") : t("auth.login")}
            </Button>
          </form>

          {adminRoles.length === 0 && (
            <div className="space-y-3">
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
                  sessionStorage.setItem("admin_authenticated", "true");
                  setIsAuthenticated(true);
                  window.location.href = "/settings";
                }}
              >
                {t("auth.setupFirstUser")}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
