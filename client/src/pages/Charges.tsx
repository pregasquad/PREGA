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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    id: item.id,
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
    <div className="h-full flex flex-col gap-4 md:gap-6 p-2 md:p-4" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
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
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("expenses.type")}</TableHead>
                <TableHead>{t("common.name")}</TableHead>
                <TableHead>{t("expenses.amount")}</TableHead>
                <TableHead>{t("common.date")}</TableHead>
                <TableHead className="w-[80px]">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {charges.map((charge: any) => (
                <TableRow key={charge.id}>
                  <TableCell>
                    {chargeTypes.find((t: any) => t.name === charge.type)?.label || charge.type}
                  </TableCell>
                  <TableCell>{charge.name}</TableCell>
                  <TableCell className="font-semibold">{charge.amount} {t("common.currency")}</TableCell>
                  <TableCell>{charge.date}</TableCell>
                  <TableCell>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => deleteMutation.mutate(charge.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {charges.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {t("expenses.noExpenses")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
