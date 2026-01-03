import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, X } from "lucide-react";
import { useLocation } from "wouter";

interface AdminLockProps {
  children: React.ReactNode;
}

export function AdminLock({ children }: AdminLockProps) {
  const [isLocked, setIsLocked] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const isAuth = sessionStorage.getItem("admin_authenticated");
    if (isAuth === "true") {
      setIsLocked(false);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isLocked) {
        setLocation("/planning");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLocked, setLocation]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "hisoka123") {
      sessionStorage.setItem("admin_authenticated", "true");
      setIsLocked(false);
      setError(false);
    } else {
      setError(true);
      setPassword("");
    }
  };

  if (!isLocked) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-md p-6 shadow-2xl border-2 border-primary/20 relative">
        <Button 
          variant="ghost" 
          size="icon" 
          className="absolute right-4 top-4 rounded-full"
          onClick={() => setLocation("/planning")}
        >
          <X className="h-4 w-4" />
        </Button>
        
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="p-3 rounded-full bg-primary/10">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold font-display">منطقة محمية</h2>
          <p className="text-muted-foreground">يرجى إدخال كلمة المرور للوصول إلى هذه الصفحة</p>
          
          <form onSubmit={handleLogin} className="w-full space-y-4 mt-4">
            <Input
              type="password"
              placeholder="كلمة المرور"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={error ? "border-destructive focus-visible:ring-destructive" : ""}
              autoFocus
            />
            {error && <p className="text-xs text-destructive font-bold">كلمة المرور غير صحيحة</p>}
            <Button type="submit" className="w-full h-11 text-lg">
              دخول
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
