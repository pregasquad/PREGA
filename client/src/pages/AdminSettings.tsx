import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  UserPlus, Users, Shield, Download, FileSpreadsheet, 
  Trash2, Edit, Calendar, User, Briefcase, Package, 
  CreditCard, DollarSign
} from "lucide-react";

interface AdminRole {
  id: number;
  name: string;
  role: string;
  pin: string | null;
  permissions: string[];
  createdAt: string;
}

const ROLE_LABELS: Record<string, { label: string, color: string }> = {
  owner: { label: "Owner", color: "bg-red-500" },
  manager: { label: "Manager", color: "bg-blue-500" },
  receptionist: { label: "Receptionist", color: "bg-green-500" }
};

export default function AdminSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    role: "receptionist",
    pin: ""
  });

  const { data: adminRoles = [], isLoading } = useQuery<AdminRole[]>({
    queryKey: ["/api/admin-roles"],
    queryFn: async () => {
      const res = await fetch("/api/admin-roles");
      return res.json();
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/admin-roles", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-roles"] });
      setIsDialogOpen(false);
      resetForm();
      toast({ title: t("admin.userAdded") });
    },
    onError: (err: any) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: Partial<typeof formData> }) => {
      const res = await apiRequest("PATCH", `/api/admin-roles/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-roles"] });
      setEditingRole(null);
      resetForm();
      toast({ title: t("admin.userUpdated") });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin-roles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-roles"] });
      toast({ title: t("admin.userDeleted") });
    }
  });

  const resetForm = () => {
    setFormData({ name: "", role: "receptionist", pin: "" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRole) {
      updateMutation.mutate({ id: editingRole.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (role: AdminRole) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      role: role.role,
      pin: role.pin || ""
    });
    setIsDialogOpen(true);
  };

  const handleExport = async (type: string) => {
    try {
      const response = await fetch(`/api/export/${type}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: t("admin.exportSuccess") });
    } catch (err) {
      toast({ title: t("common.error"), variant: "destructive" });
    }
  };

  const exportOptions = [
    { key: "appointments", icon: Calendar, label: t("admin.exportAppointments") },
    { key: "clients", icon: User, label: t("admin.exportClients") },
    { key: "services", icon: Briefcase, label: t("admin.exportServices") },
    { key: "staff", icon: Users, label: t("admin.exportStaff") },
    { key: "inventory", icon: Package, label: t("admin.exportInventory") },
    { key: "expenses", icon: CreditCard, label: t("admin.exportExpenses") }
  ];

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-bold font-display flex items-center gap-2">
          <Shield className="w-6 h-6 md:w-8 md:h-8" />
          {t("admin.title")}
        </h1>
        <p className="text-muted-foreground">{t("admin.description")}</p>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="users" className="gap-2">
            <Users className="w-4 h-4" />
            {t("admin.users")}
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-2">
            <Download className="w-4 h-4" />
            {t("admin.export")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t("admin.userManagement")}</CardTitle>
                <CardDescription>{t("admin.userManagementDesc")}</CardDescription>
              </div>
              <Dialog open={isDialogOpen} onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) {
                  setEditingRole(null);
                  resetForm();
                }
              }}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <UserPlus className="w-4 h-4" />
                    {t("admin.addUser")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingRole ? t("admin.editUser") : t("admin.addUser")}
                    </DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label>{t("common.name")}</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder={t("admin.namePlaceholder")}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("admin.role")}</Label>
                      <Select
                        value={formData.role}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">{t("admin.owner")}</SelectItem>
                          <SelectItem value="manager">{t("admin.manager")}</SelectItem>
                          <SelectItem value="receptionist">{t("admin.receptionist")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("admin.pin")} ({t("services.optional")})</Label>
                      <Input
                        type="password"
                        value={formData.pin}
                        onChange={(e) => setFormData(prev => ({ ...prev, pin: e.target.value }))}
                        placeholder="****"
                        maxLength={10}
                      />
                      <p className="text-xs text-muted-foreground">{t("admin.pinDesc")}</p>
                    </div>
                    <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                      {editingRole ? t("common.save") : t("common.add")}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center py-4 text-muted-foreground">{t("common.loading")}</p>
              ) : adminRoles.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground">{t("admin.noUsers")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.name")}</TableHead>
                      <TableHead>{t("admin.role")}</TableHead>
                      <TableHead>{t("admin.pin")}</TableHead>
                      <TableHead className="text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adminRoles.map((role) => (
                      <TableRow key={role.id}>
                        <TableCell className="font-medium">{role.name}</TableCell>
                        <TableCell>
                          <Badge className={`${ROLE_LABELS[role.role]?.color || "bg-gray-500"} text-white`}>
                            {t(`admin.${role.role}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {role.pin ? "••••" : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="icon" variant="ghost" onClick={() => handleEdit(role)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm(t("admin.deleteConfirm"))) {
                                  deleteMutation.mutate(role.id);
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("admin.rolePermissions")}</CardTitle>
              <CardDescription>{t("admin.rolePermissionsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 border rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-red-500 text-white">{t("admin.owner")}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{t("admin.ownerDesc")}</p>
                </div>
                <div className="p-4 border rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-500 text-white">{t("admin.manager")}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{t("admin.managerDesc")}</p>
                </div>
                <div className="p-4 border rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-500 text-white">{t("admin.receptionist")}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{t("admin.receptionistDesc")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" />
                {t("admin.exportData")}
              </CardTitle>
              <CardDescription>{t("admin.exportDataDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {exportOptions.map(({ key, icon: Icon, label }) => (
                  <Button
                    key={key}
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2"
                    onClick={() => handleExport(key)}
                  >
                    <Icon className="w-6 h-6" />
                    <span>{label}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("admin.backupInfo")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{t("admin.backupInfoDesc")}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
