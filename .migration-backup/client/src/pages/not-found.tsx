import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation();
  
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4 shadow-xl border-0">
        <CardContent className="pt-6 text-center">
          <div className="mb-4 flex justify-center">
            <AlertCircle className="h-12 w-12 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t("notFound.title")}</h1>
          <p className="text-gray-600 mb-6">
            {t("notFound.message")}
          </p>
          <Link href="/">
            <Button className="w-full">{t("notFound.returnHome")}</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
