import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, TrendingDown } from "lucide-react";

const CHARGE_TYPES = [
  { value: "Produit", label: "منتج" },
  { value: "Loyer", label: "إيجار" },
  { value: "Eau", label: "ماء" },
  { value: "Electricité", label: "كهرباء" },
  { value: "Salaire", label: "راتب" },
  { value: "Autre", label: "أخرى" },
];

export default function Charges() {
  const [type, setType] = useState("Produit");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
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

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/charges", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/charges"] });
      setName("");
      setAmount("");
      toast({ title: "تمت إضافة المصروف" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/charges/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/charges"] });
      toast({ title: "تم حذف المصروف" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount || !date) {
      toast({ title: "يرجى ملء جميع الحقول", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      type,
      name,
      amount: Number(amount),
      date,
    });
  };

  const totalCharges = charges.reduce((sum: number, c: any) => sum + c.amount, 0);

  return (
    <div className="h-full flex flex-col gap-6" dir="rtl">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl md:text-3xl font-display font-bold">المصاريف</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              إضافة مصروف
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>النوع</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHARGE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>الاسم</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: شامبو"
                />
              </div>

              <div className="space-y-2">
                <Label>المبلغ (DH)</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label>التاريخ</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                إضافة
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-destructive" />
              إجمالي المصاريف
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-destructive">{totalCharges} DH</p>
          </CardContent>
        </Card>
      </div>

      <Card className="flex-1">
        <CardHeader>
          <CardTitle>قائمة المصاريف</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>النوع</TableHead>
                <TableHead>الاسم</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead className="w-[80px]">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {charges.map((charge: any) => (
                <TableRow key={charge.id}>
                  <TableCell>
                    {CHARGE_TYPES.find((t) => t.value === charge.type)?.label || charge.type}
                  </TableCell>
                  <TableCell>{charge.name}</TableCell>
                  <TableCell className="font-semibold">{charge.amount} DH</TableCell>
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
                    لا توجد مصاريف مسجلة
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
