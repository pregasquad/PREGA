import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe } from "lucide-react";

const languages = [
  { code: "ar", name: "العربية", dir: "rtl" },
  { code: "fr", name: "Français", dir: "ltr" },
  { code: "en", name: "English", dir: "ltr" },
];

function normalizeLanguage(lng: string): string {
  if (!lng) return "ar";
  const base = lng.split("-")[0].toLowerCase();
  return ["ar", "fr", "en"].includes(base) ? base : "ar";
}

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const normalizedLang = normalizeLanguage(i18n.language);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    const lang = languages.find((l) => l.code === lng);
    if (lang) {
      document.documentElement.dir = lang.dir;
      document.documentElement.lang = lng;
    }
  };

  const currentLang = languages.find((l) => l.code === normalizedLang) || languages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Globe className="w-4 h-4" />
          <span>{currentLang.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            className={normalizedLang === lang.code ? "bg-accent" : ""}
          >
            {lang.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
