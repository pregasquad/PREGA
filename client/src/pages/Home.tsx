import { useAppointments, useStaff, useServices, useClients, useCategories } from "@/hooks/use-salon-data";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Scissors, CalendarCheck, TrendingUp, Clock, Package, UserPlus, Pencil, Trash2, LogOut, AlertTriangle, Banknote, CreditCard, RefreshCw } from "lucide-react";
import { format, startOfToday, subDays } from "date-fns";
import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertStaffSchema } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

function getWorkDayDate(): Date {
  const now = new Date();
  const hour = now.getHours();
  if (hour < 2) {
    return subDays(startOfToday(), 1);
  }
  return startOfToday();
}

function EditStaffForm({ staff, categories, onSubmit, isPending, t }: { 
  staff: any; 
  categories: any[]; 
  onSubmit: (data: any) => void; 
  isPending: boolean;
  t: any;
}) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    staff.categories ? staff.categories.split(",").filter(Boolean) : []
  );
  const [name, setName] = useState(staff.name);
  const [color, setColor] = useState(staff.color);

  const toggleCategory = (catName: string) => {
    setSelectedCategories(prev => 
      prev.includes(catName) ? prev.filter(c => c !== catName) : [...prev, catName]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, color, categories: selectedCategories.join(",") });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">{t("home.name")}</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">{t("home.color")}</label>
        <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">{t("home.categories")}</label>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat: any) => (
            <Button
              key={cat.id}
              type="button"
              variant={selectedCategories.includes(cat.name) ? "default" : "outline"}
              size="sm"
              onClick={() => toggleCategory(cat.name)}
            >
              {cat.name}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t("home.selectCategoriesHint")}</p>
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("home.updating") : t("home.update")}
      </Button>
    </form>
  );
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const todayDate = useMemo(() => format(getWorkDayDate(), "yyyy-MM-dd"), []);
  const { data: appointments = [] } = useAppointments(todayDate);
  const { data: staff = [] } = useStaff();
  const { data: services = [] } = useServices();
  const { data: clients = [] } = useClients();
  const { data: categories = [] } = useCategories();
  const { data: lowStockProducts = [] } = useQuery({
    queryKey: ["/api/products/low-stock"],
    queryFn: async () => {
      const res = await fetch("/api/products/low-stock", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch low stock products");
      return res.json();
    },
  });
  const [isStaffDialogOpen, setIsStaffDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const handleAdminLogout = () => {
    sessionStorage.removeItem("admin_authenticated");
    localStorage.removeItem("admin_authenticated");
    setLocation("/planning");
  };

  const staffForm = useForm({
    resolver: zodResolver(insertStaffSchema),
    defaultValues: { name: "", color: "#" + Math.floor(Math.random()*16777215).toString(16), categories: "" }
  });

  const createStaffMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/staff", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      setIsStaffDialogOpen(false);
      staffForm.reset({ name: "", color: "#" + Math.floor(Math.random()*16777215).toString(16), categories: "" });
      toast({ title: t("home.staffAdded") });
    }
  });

  const updateStaffMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/staff/${editingStaff.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      setEditingStaff(null);
      toast({ title: t("home.staffUpdated") });
    }
  });

  const deleteStaffMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/staff/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: t("home.staffDeleted") });
    }
  });

  const todayStats = useMemo(() => {
    const totalRevenue = appointments.reduce((sum, app: any) => sum + (app.total || 0), 0);
    const paidRevenue = appointments.filter((app: any) => app.paid).reduce((sum, app: any) => sum + (app.total || 0), 0);
    const unpaidRevenue = totalRevenue - paidRevenue;
    return { totalRevenue, paidRevenue, unpaidRevenue, count: appointments.length };
  }, [appointments]);

  const stats = [
    { label: t("home.todayRevenue"), value: `${todayStats.totalRevenue} DH`, icon: Banknote, color: "text-emerald-500", highlight: true },
    { label: t("home.todayAppointments"), value: todayStats.count, icon: CalendarCheck, color: "text-cyan-500" },
    { label: t("home.paidToday"), value: `${todayStats.paidRevenue} DH`, icon: CreditCard, color: "text-green-500" },
    { label: t("home.unpaidToday"), value: `${todayStats.unpaidRevenue} DH`, icon: TrendingUp, color: todayStats.unpaidRevenue > 0 ? "text-sky-500" : "text-muted-foreground" },
  ];

  return (
    <div className="space-y-4 md:space-y-8 p-3 md:p-6 animate-fade-in min-h-screen pb-20" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-3xl font-display font-bold">{t("home.dashboard")}</h1>
          <p className="text-muted-foreground text-sm md:text-base mt-1">{t("home.overview")}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 md:h-10 md:w-10"
            onClick={() => {
              queryClient.invalidateQueries();
              toast({ title: t("common.refreshed"), description: t("common.dataUpdated") });
            }}
            title={t("common.refresh")}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <LanguageSwitcher />
          
          <Button 
            variant="outline" 
            size="sm"
            className="gap-1 md:gap-2 text-destructive hover:bg-destructive/10 hover:border-destructive/30 text-xs md:text-sm h-8 md:h-9"
            onClick={handleAdminLogout}
          >
            <LogOut className="w-3 h-3 md:w-4 md:h-4" />
            <span className="hidden sm:inline">{t("home.logout")}</span>
          </Button>
          
          <Dialog open={isStaffDialogOpen} onOpenChange={setIsStaffDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1 md:gap-2 text-xs md:text-sm h-8 md:h-9">
                <UserPlus className="w-3 h-3 md:w-4 md:h-4" />
                <span className="hidden sm:inline">{t("home.addStaff")}</span>
                <span className="sm:hidden">+</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("home.addNewStaff")}</DialogTitle></DialogHeader>
              <Form {...staffForm}>
                <form onSubmit={staffForm.handleSubmit((data) => createStaffMutation.mutate(data))} className="space-y-4">
                  <FormField control={staffForm.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>{t("home.name")}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={staffForm.control} name="color" render={({ field }) => (
                    <FormItem><FormLabel>{t("home.color")}</FormLabel><FormControl><Input type="color" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={staffForm.control} name="categories" render={({ field }) => {
                    const selectedCategories = field.value ? field.value.split(",").filter(Boolean) : [];
                    const toggleCategory = (catName: string) => {
                      const newCategories = selectedCategories.includes(catName)
                        ? selectedCategories.filter(c => c !== catName)
                        : [...selectedCategories, catName];
                      field.onChange(newCategories.join(","));
                    };
                    return (
                      <FormItem>
                        <FormLabel>{t("home.categories")}</FormLabel>
                        <div className="flex flex-wrap gap-2">
                          {categories.map((cat: any) => (
                            <Button
                              key={cat.id}
                              type="button"
                              variant={selectedCategories.includes(cat.name) ? "default" : "outline"}
                              size="sm"
                              onClick={() => toggleCategory(cat.name)}
                            >
                              {cat.name}
                            </Button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">{t("home.selectCategoriesHint")}</p>
                      </FormItem>
                    );
                  }} />
                  <Button type="submit" className="w-full" disabled={createStaffMutation.isPending}>
                    {createStaffMutation.isPending ? t("home.adding") : t("home.add")}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
          {stats.map((stat, i) => (
            <Card key={i} className={`hover-elevate ${stat.highlight ? 'bg-gradient-to-br from-emerald-50 to-green-100 dark:from-emerald-950/50 dark:to-green-900/30 border-emerald-200 dark:border-emerald-800' : ''}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 gap-2 p-3 md:p-6">
                <CardTitle className="text-xs md:text-sm font-medium">{stat.label}</CardTitle>
                <stat.icon className={`h-4 w-4 md:h-5 md:w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
                <div className={`text-lg md:text-2xl font-bold ${stat.highlight ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

      {lowStockProducts.length > 0 && (
        <Card className="border-destructive bg-destructive/5 hover-elevate">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              {t("home.lowStockAlert")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lowStockProducts.map((product: any) => (
                <div
                  key={product.id}
                  className="flex items-center gap-2 bg-background px-3 py-2 rounded-lg border border-destructive/30"
                >
                  <Package className="w-4 h-4 text-destructive" />
                  <span className="font-medium">{product.name}</span>
                  <span className="text-destructive font-bold">({product.quantity})</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 ml-1"
                    onClick={() => setLocation("/inventory")}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
          <Card className="hover-elevate">
            <CardHeader className="p-3 md:p-6 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                {t("home.todayAppointments")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0">
              {appointments.length === 0 ? (
                <p className="text-muted-foreground text-center py-4 md:py-8 text-sm">{t("home.noAppointmentsToday")}</p>
              ) : (
                <div className="space-y-2 md:space-y-4">
                  {appointments.slice(0, 5).map((app: any) => (
                    <div key={app.id} className="flex items-center justify-between p-2 md:p-3 rounded-lg bg-muted/50">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm md:text-base truncate">{app.client || t("common.noClient")}</p>
                        <p className="text-xs text-muted-foreground truncate">{app.service}</p>
                      </div>
                      <div className={`shrink-0 ${isRtl ? "text-left ml-2" : "text-right ml-2"}`}>
                        <p className="text-xs md:text-sm font-medium">{app.startTime}</p>
                        <p className="text-xs text-primary font-bold">{app.total} {t("common.currency")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader className="p-3 md:p-6 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                <Package className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                {t("home.teamStatus")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0">
              <div className="space-y-2 md:space-y-4">
                {staff.map((s: any) => {
                  const staffApps = appointments.filter((a: any) => a.staffId === s.id || (!a.staffId && a.staff === s.name)).length;
                  return (
                    <div key={s.id} className="flex items-center justify-between p-2 md:p-3 rounded-lg bg-muted/50 gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="font-medium text-sm md:text-base truncate">{s.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs md:text-sm bg-background px-1.5 md:px-2 py-0.5 md:py-1 rounded-md border border-border whitespace-nowrap">
                          {staffApps}
                        </span>
                        <Dialog open={!!editingStaff && editingStaff.id === s.id} onOpenChange={(open) => !open && setEditingStaff(null)}>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 md:h-8 md:w-8" onClick={() => setEditingStaff(s)}>
                              <Pencil className="h-3 w-3 md:h-4 md:w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader><DialogTitle>{t("home.editStaffData")}</DialogTitle></DialogHeader>
                            <EditStaffForm 
                              staff={s} 
                              categories={categories} 
                              onSubmit={(data: any) => updateStaffMutation.mutate(data)} 
                              isPending={updateStaffMutation.isPending}
                              t={t}
                            />
                          </DialogContent>
                        </Dialog>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 md:h-8 md:w-8 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(t("home.deleteConfirm"))) {
                              deleteStaffMutation.mutate(s.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3 md:h-4 md:w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
      </div>
    </div>
  );
}
