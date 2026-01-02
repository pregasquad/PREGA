import { useAppointments, useStaff, useServices, useClients } from "@/hooks/use-salon-data";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Scissors, CalendarCheck, TrendingUp, Clock, Package, UserPlus, Pencil, Trash2, LogOut, AlertTriangle } from "lucide-react";
import { format, startOfToday } from "date-fns";
import { useState } from "react";
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
import { useLocation } from "wouter";

export default function Home() {
  const { data: appointments = [] } = useAppointments(format(startOfToday(), "yyyy-MM-dd"));
  const { data: staff = [] } = useStaff();
  const { data: services = [] } = useServices();
  const { data: clients = [] } = useClients();
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
    setLocation("/planning");
  };

  const staffForm = useForm({
    resolver: zodResolver(insertStaffSchema),
    defaultValues: { name: "", color: "#" + Math.floor(Math.random()*16777215).toString(16) }
  });

  const createStaffMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/staff", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      setIsStaffDialogOpen(false);
      staffForm.reset({ name: "", color: "#" + Math.floor(Math.random()*16777215).toString(16) });
      toast({ title: "تمت إضافة الموظف" });
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
      toast({ title: "تم تحديث بيانات الموظف" });
    }
  });

  const deleteStaffMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/staff/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: "تم حذف الموظف" });
    }
  });

  const stats = [
    { label: "مواعيد اليوم", value: appointments.length, icon: CalendarCheck, color: "text-blue-500" },
    { label: "إجمالي العملاء", value: clients.length, icon: Users, color: "text-green-500" },
    { label: "الخدمات المتاحة", value: services.length, icon: Scissors, color: "text-purple-500" },
    { label: "فريق العمل", value: staff.length, icon: Clock, color: "text-orange-500" },
  ];

  return (
    <div className="space-y-8 p-6" dir="rtl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">لوحة التحكم</h1>
          <p className="text-muted-foreground mt-2">نظرة عامة على نشاط الصالون اليوم</p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            className="gap-2 text-destructive hover:bg-destructive/10 hover:border-destructive/30"
            onClick={handleAdminLogout}
          >
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </Button>
          
          <Dialog open={isStaffDialogOpen} onOpenChange={setIsStaffDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <UserPlus className="w-4 h-4" />
                إضافة موظف
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>إضافة موظف جديد</DialogTitle></DialogHeader>
              <Form {...staffForm}>
                <form onSubmit={staffForm.handleSubmit((data) => createStaffMutation.mutate(data))} className="space-y-4">
                  <FormField control={staffForm.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>الاسم</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={staffForm.control} name="color" render={({ field }) => (
                    <FormItem><FormLabel>اللون</FormLabel><FormControl><Input type="color" {...field} /></FormControl></FormItem>
                  )} />
                  <Button type="submit" className="w-full" disabled={createStaffMutation.isPending}>
                    {createStaffMutation.isPending ? "جاري الإضافة..." : "إضافة"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, i) => (
            <Card key={i} className="hover-elevate">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

      {lowStockProducts.length > 0 && (
        <Card className="border-destructive bg-destructive/5 hover-elevate">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              تنبيه المخزون المنخفض
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
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="hover-elevate">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                مواعيد اليوم
              </CardTitle>
            </CardHeader>
            <CardContent>
              {appointments.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">لا توجد مواعيد مجدولة لليوم</p>
              ) : (
                <div className="space-y-4">
                  {appointments.slice(0, 5).map((app: any) => (
                    <div key={app.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-bold">{app.client}</p>
                        <p className="text-xs text-muted-foreground">{app.service}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{app.startTime}</p>
                        <p className="text-xs text-primary font-bold">{app.total} DH</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                حالة الفريق
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {staff.map((s: any) => {
                  const staffApps = appointments.filter((a: any) => a.staff === s.name).length;
                  return (
                    <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="font-medium">{s.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm bg-background px-2 py-1 rounded-md border border-border">
                          {staffApps} مواعيد اليوم
                        </span>
                        <Dialog open={!!editingStaff && editingStaff.id === s.id} onOpenChange={(open) => !open && setEditingStaff(null)}>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingStaff(s)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader><DialogTitle>تعديل بيانات الموظف</DialogTitle></DialogHeader>
                            <form 
                              onSubmit={(e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                updateStaffMutation.mutate({
                                  name: formData.get("name"),
                                  color: formData.get("color")
                                });
                              }} 
                              className="space-y-4"
                            >
                              <div className="space-y-2">
                                <label className="text-sm font-medium">الاسم</label>
                                <Input name="name" defaultValue={s.name} required />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium">اللون</label>
                                <Input name="color" type="color" defaultValue={s.color} required />
                              </div>
                              <Button type="submit" className="w-full" disabled={updateStaffMutation.isPending}>
                                {updateStaffMutation.isPending ? "جاري التحديث..." : "تحديث"}
                              </Button>
                            </form>
                          </DialogContent>
                        </Dialog>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm("هل أنت متأكد من حذف هذا الموظف؟")) {
                              deleteStaffMutation.mutate(s.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
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
