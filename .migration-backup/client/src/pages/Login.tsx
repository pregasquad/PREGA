import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Scissors } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function Login() {
  const { t } = useTranslation();
  
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-muted/20 p-4">
      <div className="absolute inset-0 overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-50"></div>
        <div className="absolute top-1/2 right-0 w-[500px] h-[500px] bg-accent/30 rounded-full blur-3xl opacity-50 transform translate-x-1/3"></div>
      </div>

      <Card className="w-full max-w-md p-8 shadow-2xl shadow-primary/5 border-border/50 relative z-10 bg-card/80 backdrop-blur-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6 transform rotate-3">
            <Scissors className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold text-foreground">{t("login.welcomeBack")}</h1>
          <p className="text-muted-foreground mt-2">{t("login.signInPrompt")}</p>
        </div>

        <div className="space-y-4">
          <a href="/api/login">
            <Button 
              className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all hover:-translate-y-0.5" 
              size="lg"
            >
              {t("login.loginWithReplit")}
            </Button>
          </a>
          
          <div className="text-center mt-6">
            <p className="text-xs text-muted-foreground">
              {t("login.secureAuth")}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
