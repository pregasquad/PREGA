import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { calcAppointmentCommission } from "@/lib/commissionCalc";

interface Props {
  className?: string;
}

export function MonthlyGoalBanner({ className }: Props) {
  const { t } = useTranslation();
  const [monthlyGoal, setMonthlyGoal] = useState<number>(
    () => Number(localStorage.getItem("monthly_revenue_goal") || 0)
  );
  const [goalEditValue, setGoalEditValue] = useState("");
  const [showGoalEdit, setShowGoalEdit] = useState(false);

  const { data: salaryData } = useQuery<any>({
    queryKey: ["/api/salaries/compute"],
    staleTime: 0,
  });

  const monthlySalonShare = useMemo(() => {
    const apts: any[] = salaryData?.appointments ?? [];
    const allStaff: any[] = salaryData?.staff ?? [];
    const allServices: any[] = salaryData?.services ?? [];
    const allStaffCommissions: any[] = salaryData?.staffCommissions ?? [];
    const monthStr = format(new Date(), "yyyy-MM");
    const monthApts = apts.filter(
      (a: any) => a.paid && typeof a.date === "string" && a.date.startsWith(monthStr)
    );
    let revenue = 0;
    let commissions = 0;
    for (const app of monthApts) {
      revenue += Number(app.total || 0);
      commissions += calcAppointmentCommission(app, allServices, allStaff, allStaffCommissions);
    }
    return revenue - commissions;
  }, [salaryData]);

  const fmt = (n: number) => Math.round(n).toLocaleString("fr-MA");
  const pct = monthlyGoal > 0 ? Math.round((monthlySalonShare / monthlyGoal) * 100) : 0;
  const reached = monthlySalonShare >= monthlyGoal && monthlyGoal > 0;
  const warm = monthlySalonShare / monthlyGoal >= 0.7;

  return (
    <Card className={`glass-card ${className ?? ""}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center">
              <TrendingUp className="h-3.5 w-3.5 text-violet-600" />
            </div>
            <span className="text-sm font-semibold">
              {t("salaries.monthlyGoal") || "هدف الشهر"}
            </span>
          </div>
          {!showGoalEdit ? (
            <button
              className="text-xs text-muted-foreground underline underline-offset-2"
              onClick={() => {
                setGoalEditValue(monthlyGoal > 0 ? String(monthlyGoal) : "");
                setShowGoalEdit(true);
              }}
            >
              {monthlyGoal > 0
                ? `${fmt(monthlyGoal)} DH`
                : t("salaries.setGoal") || "تعيين الهدف"}
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                value={goalEditValue}
                onChange={(e) => setGoalEditValue(e.target.value)}
                className="h-7 w-28 text-sm text-end"
                placeholder="0"
                autoFocus
              />
              <Button
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  const val = Number(goalEditValue) || 0;
                  setMonthlyGoal(val);
                  localStorage.setItem("monthly_revenue_goal", String(val));
                  setShowGoalEdit(false);
                }}
              >
                ✓
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setShowGoalEdit(false)}
              >
                ✕
              </Button>
            </div>
          )}
        </div>

        {monthlyGoal > 0 ? (
          <>
            <div className="relative h-3 rounded-full bg-secondary overflow-hidden mb-1.5">
              <div
                className={`absolute inset-y-0 start-0 rounded-full transition-all duration-500 ${
                  reached
                    ? "bg-emerald-500"
                    : warm
                    ? "bg-violet-500"
                    : "bg-violet-400/70"
                }`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
              <span>{fmt(monthlySalonShare)} DH</span>
              <span
                className={`font-semibold ${
                  reached
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-violet-600 dark:text-violet-400"
                }`}
              >
                {pct}%{reached && " ✓"}
              </span>
              <span>{fmt(monthlyGoal)} DH</span>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-1">
            {t("salaries.noGoalSet") || "لم يتم تعيين هدف شهري بعد"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
