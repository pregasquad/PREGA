import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, TrendingDown, FolderPlus } from "lucide-react";

const DEFAULT_CHARGE_TYPES_KEYS = [
  { id: 0, key: "expenses.product", value: "Produit" },
  { id: 0, key: "expenses.rent", value: "Loyer" },
  { id: 0, key: "expenses.water", value: "Eau" },
  { id: 0, key: "expenses.electricity", value: "Electricité" },
  { id: 0, key: "expenses.salary", value: "Salaire" },
  { id: 0, key: "expenses.other", value: "Autre" },
];

export default function Charges() {
  const { t, i18n } = useTranslation();
  const [type, setType] = useState("Produit");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newCategoryName, setNewCategoryName] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = sessionStorage.getItem("admin_authenticated") === "true";

  const { data: charges = [] } = useQuery({
    queryKey: ["/api/charges"],
    queryFn: async () => {
      const res = await fetch("/api/charges");
      return res.json();
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["/api/expense-categories"],
    queryFn: async () => {
      const res = await fetch("/api/expense-categories");
      return res.json();
    },
  });

  const defaultChargeTypes = DEFAULT_CHARGE_TYPES_KEYS.map(item => ({
    id: 0,
    name: item.value,
    label: t(item.key)
  }));

  const chargeTypes = categories.length > 0 
    ? categories.map((c: any) => ({ id: c.id, name: c.name, label: c.name }))
    : defaultChargeTypes;

  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/expense-categories", { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expense-categories"] });
      setNewCategoryName("");
      toast({ title: t("expenses.categoryAdded") });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/charges", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/charges"] });
      setName("");
      setAmount("");
      toast({ title: t("expenses.expenseAdded") });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/charges/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/charges"] });
      toast({ title: t("expenses.expenseDeleted") });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount || !date) {
      toast({ title: t("expenses.fillAllFields"), variant: "destructive" });
      return;
    }
    createMutation.mutate({
      type: type || "Autre",
      name: name,
      amount: Number(amount),
      date: date,
    });
  };

  const totalCharges = charges.reduce((sum: number, c: any) => sum + c.amount, 0);

  return (
    <div className="h-full flex flex-col gap-4 md:gap-6 p-2 md:p-4 animate-fade-in" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
      <div className="flex justify-between items-center">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-display font-bold">{t("expenses.title")}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              {t("expenses.addExpense")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>{t("expenses.type")}</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("expenses.selectType")} />
                  </SelectTrigger>
                  <SelectContent>
                    {chargeTypes.map((t: any) => (
                      <SelectItem key={`${t.id}-${t.name}`} value={t.name}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("common.name")}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("expenses.namePlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("expenses.amount")} ({t("common.currency")})</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label>{t("common.date")}</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {t("common.add")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-destructive" />
              {t("expenses.totalExpenses")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-destructive">{totalCharges} {t("common.currency")}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="flex-1">
        <CardHeader>
          <CardTitle>{t("expenses.expenseList")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {charges.map((charge: any) => (
            <div key={charge.id} className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg flex justify-between items-center">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{charge.name}</span>
                  <span className="text-xs px-1.5 py-0.5 bg-red-100 dark:bg-red-900/50 rounded text-red-700 dark:text-red-300">
                    {chargeTypes.find((t: any) => t.name === charge.type)?.label || charge.type}
                  </span>
                </div>
                <div className="flex gap-2 text-sm mt-0.5">
                  <span className="text-red-600 dark:text-red-400 font-semibold">{charge.amount} {t("common.currency")}</span>
                  <span className="text-muted-foreground">{charge.date}</span>
                </div>
              </div>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => deleteMutation.mutate(charge.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
          {charges.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              {t("expenses.noExpenses")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
