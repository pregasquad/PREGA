import { useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { 
  UserPlus, Users, Shield, Download, FileSpreadsheet, 
  Trash2, Edit, Calendar, User, Briefcase, Package, 
  CreditCard, Building2, Clock, Save, Camera, Loader2, RefreshCw,
  MessageCircle, Send, Lock, LayoutGrid
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { SpinningLogo } from "@/components/ui/spinning-logo";
import { useIsMobile } from "@/hooks/use-mobile";
import { SHORTCUT_OPTIONS, DEFAULT_SHORTCUTS } from "@/lib/shortcuts";

interface AdminRole {
  id: number;
  name: string;
  role: string;
  pin: string | null;
  photoUrl: string | null;
  permissions: string[];
  createdAt: string;
}

interface BusinessSettings {
  id?: number;
  businessName: string;
  logo?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  currency: string;
  currencySymbol: string;
  openingTime: string;
  closingTime: string;
  workingDays: number[];
  autoLockEnabled: boolean;
  planningShortcuts: string[];
}

interface MessageTemplate {
  id: number;
  name: string;
  content: string;
  category?: string | null;
  createdAt: string;
  updatedAt: string;
}

const ROLE_LABELS: Record<string, { label: string, color: string }> = {
  owner: { label: "Owner", color: "bg-red-500" },
  manager: { label: "Manager", color: "bg-pink-500" },
  receptionist: { label: "Receptionist", color: "bg-green-500" }
};

const ALL_PERMISSIONS = [
  { key: "view_home", labelKey: "permissions.viewHome", icon: "Home" },
  { key: "view_planning", labelKey: "permissions.viewPlanning", icon: "Calendar" },
  { key: "view_booking_history", labelKey: "permissions.viewBookingHistory", icon: "History" },
  { key: "manage_appointments", labelKey: "permissions.manageAppointments", icon: "Calendar" },
  { key: "edit_cardboard", labelKey: "permissions.editCardboard", icon: "Layout" },
  { key: "view_services", labelKey: "permissions.viewServices", icon: "Scissors" },
  { key: "manage_services", labelKey: "permissions.manageServices", icon: "Scissors" },
  { key: "view_packages", labelKey: "permissions.viewPackages", icon: "PackageOpen" },
  { key: "manage_packages", labelKey: "permissions.managePackages", icon: "PackageOpen" },
  { key: "view_clients", labelKey: "permissions.viewClients", icon: "Users" },
  { key: "manage_clients", labelKey: "permissions.manageClients", icon: "Users" },
  { key: "view_inventory", labelKey: "permissions.viewInventory", icon: "Package" },
  { key: "manage_inventory", labelKey: "permissions.manageInventory", icon: "Package" },
  { key: "view_expenses", labelKey: "permissions.viewExpenses", icon: "Wallet" },
  { key: "manage_expenses", labelKey: "permissions.manageExpenses", icon: "Wallet" },
  { key: "view_salaries", labelKey: "permissions.viewSalaries", icon: "DollarSign" },
  { key: "manage_salaries", labelKey: "permissions.manageSalaries", icon: "DollarSign" },
  { key: "view_staff", labelKey: "permissions.viewStaff", icon: "UserCog" },
  { key: "manage_staff", labelKey: "permissions.manageStaff", icon: "UserCog" },
  { key: "view_staff_performance", labelKey: "permissions.viewStaffPerformance", icon: "TrendingUp" },
  { key: "manage_staff_goals", labelKey: "permissions.manageStaffGoals", icon: "Target" },
  { key: "view_loyalty", labelKey: "permissions.viewLoyalty", icon: "Gift" },
  { key: "manage_loyalty", labelKey: "permissions.manageLoyalty", icon: "Gift" },
  { key: "view_gift_cards", labelKey: "permissions.viewGiftCards", icon: "CreditCard" },
  { key: "manage_gift_cards", labelKey: "permissions.manageGiftCards", icon: "CreditCard" },
  { key: "manage_waitlist", labelKey: "permissions.manageWaitlist", icon: "Clock" },
  { key: "view_users", labelKey: "permissions.viewUsers", icon: "UserCheck" },
  { key: "manage_users", labelKey: "permissions.manageUsers", icon: "UserCheck" },
  { key: "view_reports", labelKey: "permissions.viewReports", icon: "BarChart" },
  { key: "admin_settings", labelKey: "permissions.adminSettings", icon: "Settings" },
  { key: "export_data", labelKey: "permissions.exportData", icon: "Download" },
  { key: "edit_past_appointments", labelKey: "permissions.editPastAppointments", icon: "Lock" },
  { key: "open_cash_drawer", labelKey: "permissions.openCashDrawer", icon: "Wallet" },
];

const DAYS_OF_WEEK = [
  { value: 0, label: "sunday" },
  { value: 1, label: "monday" },
  { value: 2, label: "tuesday" },
  { value: 3, label: "wednesday" },
  { value: 4, label: "thursday" },
  { value: 5, label: "friday" },
  { value: 6, label: "saturday" }
];

export default function AdminSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    role: "receptionist",
    pin: "",
    permissions: [] as string[]
  });
  const [businessForm, setBusinessForm] = useState<BusinessSettings>({
    businessName: "PREGA SQUAD",
    currency: "MAD",
    currencySymbol: "DH",
    openingTime: "09:00",
    closingTime: "19:00",
    workingDays: [1, 2, 3, 4, 5, 6],
    autoLockEnabled: false,
    planningShortcuts: DEFAULT_SHORTCUTS
  });
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastResult, setBroadcastResult] = useState<{sent: number, failed: number, total: number} | null>(null);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<number>>(new Set());
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [newTemplateName, setNewTemplateName] = useState("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  const { data: adminRoles = [], isLoading } = useQuery<AdminRole[]>({
    queryKey: ["/api/admin-roles"],
    queryFn: async () => {
      const res = await fetch("/api/admin-roles");
      return res.json();
    }
  });

  const { data: businessSettings, isLoading: isLoadingBusiness } = useQuery<BusinessSettings>({
    queryKey: ["/api/business-settings"],
  });

  // Update business form when data loads
  useEffect(() => {
    if (businessSettings) {
      setBusinessForm(prev => ({
        ...prev,
        ...businessSettings,
        planningShortcuts: businessSettings.planningShortcuts || DEFAULT_SHORTCUTS,
      }));
    }
  }, [businessSettings]);

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
      setIsDialogOpen(false);
      setEditingRole(null);
      resetForm();
      toast({ title: t("admin.userUpdated") });
    },
    onError: (err: any) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
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

  const [uploadingPhotoId, setUploadingPhotoId] = useState<number | null>(null);

  const handlePhotoUpload = async (roleId: number, file: File) => {
    setUploadingPhotoId(roleId);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      formData.append("staffId", roleId.toString());
      
      const res = await fetch(`/api/admin-roles/${roleId}/photo`, {
        method: "POST",
        body: formData,
        credentials: "include"
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Upload failed");
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/admin-roles"] });
      toast({ title: t("admin.photoUploaded") });
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    } finally {
      setUploadingPhotoId(null);
    }
  };

  const businessMutation = useMutation({
    mutationFn: async (data: Partial<BusinessSettings>) => {
      const res = await apiRequest("PATCH", "/api/business-settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-settings"] });
      toast({ title: t("admin.settingsSaved") });
    },
    onError: (err: any) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    }
  });

  const { data: clients = [] } = useQuery<{id: number, name: string, phone: string | null}[]>({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  });

  const clientsWithPhone = Array.isArray(clients) ? clients.filter(c => c.phone && c.phone.trim() !== '') : [];

  const { data: messageTemplates = [] } = useQuery<MessageTemplate[]>({
    queryKey: ["/api/message-templates"],
    queryFn: async () => {
      const res = await fetch("/api/message-templates");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (template: { name: string; content: string }) => {
      const res = await apiRequest("POST", "/api/message-templates", template);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/message-templates"] });
      toast({ title: t("admin.templateSaved", { defaultValue: "Template enregistré" }) });
      setNewTemplateName("");
      setShowSaveTemplate(false);
    },
    onError: (err: any) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    }
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/message-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/message-templates"] });
      setSelectedTemplateId("");
      toast({ title: t("admin.templateDeleted", { defaultValue: "Template supprimé" }) });
    },
    onError: (err: any) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    }
  });

  const handleLoadTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId) {
      const template = messageTemplates.find(t => t.id.toString() === templateId);
      if (template) {
        setBroadcastMessage(template.content);
      }
    }
  };

  const handleSaveAsTemplate = () => {
    if (!newTemplateName.trim() || !broadcastMessage.trim()) return;
    createTemplateMutation.mutate({ name: newTemplateName.trim(), content: broadcastMessage });
  };

  const broadcastMutation = useMutation({
    mutationFn: async ({ message, clientIds }: { message: string; clientIds?: number[] }) => {
      const res = await apiRequest("POST", "/api/notifications/broadcast", { message, clientIds });
      return res.json();
    },
    onSuccess: (data) => {
      setBroadcastResult({ sent: data.sent, failed: data.failed, total: data.total });
      toast({ 
        title: t("admin.broadcastSent"),
        description: `${data.sent}/${data.total} ${t("admin.messagesSent")}`
      });
      setBroadcastMessage("");
      setSelectedClientIds(new Set());
    },
    onError: (err: any) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    }
  });

  const handleBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;
    if (selectedClientIds.size === 0) {
      toast({ title: t("common.error"), description: t("admin.selectClientsFirst", "Please select at least one client"), variant: "destructive" });
      return;
    }
    setBroadcastResult(null);
    const clientIds = Array.from(selectedClientIds);
    broadcastMutation.mutate({ message: broadcastMessage, clientIds });
  };

  const filteredClientsForBroadcast = clientsWithPhone.filter(c => 
    c.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
    (c.phone && c.phone.includes(clientSearchQuery))
  );

  const toggleClientSelection = (clientId: number) => {
    setSelectedClientIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(clientId)) {
        newSet.delete(clientId);
      } else {
        newSet.add(clientId);
      }
      return newSet;
    });
  };

  const selectAllClients = () => {
    setSelectedClientIds(new Set(filteredClientsForBroadcast.map(c => c.id)));
  };

  const deselectAllClients = () => {
    setSelectedClientIds(new Set());
  };

  const handleBusinessPhotoUpload = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include"
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Upload failed");
      }
      
      const { url } = await res.json();
      setBusinessForm(prev => ({ ...prev, logo: url }));
      toast({ title: t("admin.photoUploaded") });
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    }
  };

  const handleBusinessSave = (e: React.FormEvent) => {
    e.preventDefault();
    businessMutation.mutate(businessForm);
  };

  const toggleWorkingDay = (day: number) => {
    setBusinessForm(prev => {
      const workingDays = prev.workingDays || [];
      return {
        ...prev,
        workingDays: workingDays.includes(day)
          ? workingDays.filter(d => d !== day)
          : [...workingDays, day].sort((a, b) => a - b)
      };
    });
  };

  const resetForm = () => {
    setFormData({ name: "", role: "receptionist", pin: "", permissions: [] });
  };

  const togglePermission = (permission: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission]
    }));
  };

  const selectAllPermissions = () => {
    setFormData(prev => ({
      ...prev,
      permissions: ALL_PERMISSIONS.map(p => p.key)
    }));
  };

  const clearAllPermissions = () => {
    setFormData(prev => ({
      ...prev,
      permissions: []
    }));
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
      pin: role.pin || "",
      permissions: role.permissions || []
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
    <div className="space-y-6 p-2 md:p-4 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl md:text-3xl font-bold font-display flex items-center gap-2">
            <Shield className="w-6 h-6 md:w-8 md:h-8" />
            {t("admin.title")}
          </h1>
          <p className="text-muted-foreground">{t("admin.description")}</p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            queryClient.invalidateQueries();
            toast({ title: t("common.refreshed"), description: t("common.dataUpdated") });
          }}
          title={t("common.refresh")}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="business" className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="business" className="gap-2">
            <Building2 className="w-4 h-4" />
            {t("admin.business")}
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="w-4 h-4" />
            {t("admin.users")}
          </TabsTrigger>
          <TabsTrigger value="broadcast" className="gap-2">
            <MessageCircle className="w-4 h-4" />
            {t("admin.broadcast")}
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-2">
            <Download className="w-4 h-4" />
            {t("admin.export")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="business" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                {t("admin.businessSettings")}
              </CardTitle>
              <CardDescription>{t("admin.businessSettingsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingBusiness ? (
                <div className="loading-container py-8 min-h-[300px]"><SpinningLogo size="lg" /></div>
              ) : (
                <form onSubmit={handleBusinessSave} className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("admin.logo") || "Logo"}</Label>
                      <div className="flex items-center gap-4">
                        {businessForm.logo && (
                          <img src={businessForm.logo} alt="Logo" className="h-12 w-12 object-contain border rounded" />
                        )}
                        <Button 
                          type="button" 
                          variant="outline"
                          onClick={() => {
                            const input = document.createElement("input");
                            input.type = "file";
                            input.accept = "image/*";
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (file) handleBusinessPhotoUpload(file);
                            };
                            input.click();
                          }}
                        >
                          <Camera className="mr-2 h-4 w-4" />
                          {t("admin.uploadLogo") || "Upload Logo"}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("admin.businessName")}</Label>
                      <Input
                        value={businessForm.businessName}
                        onChange={(e) => setBusinessForm(prev => ({ ...prev, businessName: e.target.value }))}
                        placeholder="PREGA SQUAD"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("common.email")}</Label>
                      <Input
                        type="email"
                        value={businessForm.email || ""}
                        onChange={(e) => setBusinessForm(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="contact@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("common.phone")}</Label>
                      <Input
                        value={businessForm.phone || ""}
                        onChange={(e) => setBusinessForm(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="+212 6XX XXX XXX"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("admin.address")}</Label>
                      <Input
                        value={businessForm.address || ""}
                        onChange={(e) => setBusinessForm(prev => ({ ...prev, address: e.target.value }))}
                        placeholder={t("admin.addressPlaceholder")}
                      />
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="font-medium mb-4 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {t("admin.workingHours")}
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>{t("admin.openingTime")}</Label>
                        <Input
                          type="time"
                          value={businessForm.openingTime}
                          onChange={(e) => setBusinessForm(prev => ({ ...prev, openingTime: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("admin.closingTime")}</Label>
                        <Input
                          type="time"
                          value={businessForm.closingTime}
                          onChange={(e) => setBusinessForm(prev => ({ ...prev, closingTime: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <Label>{t("admin.workingDays")}</Label>
                      <div className="flex flex-wrap gap-2">
                        {DAYS_OF_WEEK.map(day => (
                          <div
                            key={day.value}
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              id={`day-${day.value}`}
                              checked={businessForm.workingDays?.includes(day.value) || false}
                              onCheckedChange={() => toggleWorkingDay(day.value)}
                            />
                            <label
                              htmlFor={`day-${day.value}`}
                              className="text-sm cursor-pointer"
                            >
                              {t(`days.${day.label}`)}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="font-medium mb-2 flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      {t("admin.autoLock")}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-3">{t("admin.autoLockDesc")}</p>
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={businessForm.autoLockEnabled}
                        onCheckedChange={(checked) => setBusinessForm(prev => ({ ...prev, autoLockEnabled: !!checked }))}
                        id="auto-lock-toggle"
                        data-testid="switch-auto-lock"
                      />
                      <label htmlFor="auto-lock-toggle" className="text-sm cursor-pointer">{t("admin.autoLockEnabled")}</label>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="font-medium mb-2 flex items-center gap-2">
                      <LayoutGrid className="w-4 h-4" />
                      {t("admin.planningShortcuts")}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-3">{t("admin.planningShortcutsDesc")}</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      {[0, 1, 2, 3].map((slotIndex) => (
                        <div key={slotIndex} className="space-y-1">
                          <Label>{t("admin.shortcutSlot")} {slotIndex + 1}</Label>
                          <Select
                            value={businessForm.planningShortcuts?.[slotIndex] || ""}
                            onValueChange={(val) => {
                              setBusinessForm(prev => {
                                const shortcuts = [...(prev.planningShortcuts || DEFAULT_SHORTCUTS)];
                                shortcuts[slotIndex] = val;
                                return { ...prev, planningShortcuts: shortcuts };
                              });
                            }}
                          >
                            <SelectTrigger data-testid={`select-shortcut-${slotIndex}`}>
                              <SelectValue placeholder={t("admin.selectShortcut")} />
                            </SelectTrigger>
                            <SelectContent>
                              {SHORTCUT_OPTIONS.map(opt => (
                                <SelectItem key={opt.key} value={opt.key}>
                                  <span className="flex items-center gap-2">
                                    <opt.icon className="w-4 h-4" />
                                    {t(opt.labelKey)}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="font-medium mb-4">{t("admin.currency")}</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>{t("admin.currencyCode")}</Label>
                        <Input
                          value={businessForm.currency}
                          onChange={(e) => setBusinessForm(prev => ({ ...prev, currency: e.target.value }))}
                          placeholder="MAD"
                          maxLength={5}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("admin.currencySymbol")}</Label>
                        <Input
                          value={businessForm.currencySymbol}
                          onChange={(e) => setBusinessForm(prev => ({ ...prev, currencySymbol: e.target.value }))}
                          placeholder="DH"
                          maxLength={5}
                        />
                      </div>
                    </div>
                  </div>

                  <Button type="submit" className="gap-2" disabled={businessMutation.isPending}>
                    <Save className="w-4 h-4" />
                    {t("common.save")}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </TabsContent>

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
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {editingRole ? t("admin.editUser") : t("admin.addUser")}
                    </DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
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
                    
                    <div className="space-y-3 border-t pt-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">{t("admin.permissions")}</Label>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={selectAllPermissions}>
                            {t("admin.selectAll")}
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={clearAllPermissions}>
                            {t("admin.clearAll")}
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{t("admin.permissionsDesc")}</p>
                      <div className="grid gap-2 md:grid-cols-2">
                        {ALL_PERMISSIONS.map((perm) => (
                          <label
                            key={perm.key}
                            htmlFor={`perm-${perm.key}`}
                            className="flex items-center space-x-2 p-2 border rounded-lg hover:bg-muted/50 cursor-pointer"
                          >
                            <Checkbox
                              id={`perm-${perm.key}`}
                              checked={formData.permissions.includes(perm.key)}
                              onCheckedChange={() => togglePermission(perm.key)}
                            />
                            <span className="text-sm flex-1">
                              {t(perm.labelKey, perm.key.replace(/_/g, ' '))}
                            </span>
                          </label>
                        ))}
                      </div>
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
                <div className="loading-container py-8 min-h-[400px]"><SpinningLogo size="lg" /></div>
              ) : adminRoles.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground">{t("admin.noUsers")}</p>
              ) : isMobile ? (
                  <div className="space-y-3">
                    {adminRoles.map((role) => (
                      <div key={role.id} className="p-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            {role.photoUrl ? (
                              <img 
                                src={role.photoUrl} 
                                alt={role.name}
                                className="w-10 h-10 rounded-full object-cover border-2 border-primary/20"
                              />
                            ) : (
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold bg-gradient-to-br ${
                                role.role === "owner" ? "from-red-400 to-red-600" :
                                role.role === "manager" ? "from-pink-400 to-pink-600" :
                                "from-green-400 to-green-600"
                              }`}>
                                {role.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <label className="absolute -bottom-1 -right-1 cursor-pointer">
                              <input 
                                type="file"
                                className="hidden"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handlePhotoUpload(role.id, file);
                                    e.target.value = "";
                                  }
                                }}
                                disabled={uploadingPhotoId === role.id}
                              />
                              <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                                {uploadingPhotoId === role.id ? (
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                ) : (
                                  <Camera className="w-2.5 h-2.5" />
                                )}
                              </div>
                            </label>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{role.name}</span>
                              <Badge className={`${ROLE_LABELS[role.role]?.color || "bg-gray-500"} text-white text-[10px]`}>
                                {t(`admin.${role.role}`)}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <span>{role.permissions?.length || 0}/{ALL_PERMISSIONS.length} {t("admin.permissions")}</span>
                              <span>·</span>
                              <span>PIN: {role.pin ? "••••" : "-"}</span>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button size="icon" variant="ghost" onClick={() => handleEdit(role)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="text-destructive"
                              onClick={() => {
                                if (confirm(t("admin.deleteConfirm"))) {
                                  deleteMutation.mutate(role.id);
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("admin.photo")}</TableHead>
                        <TableHead>{t("common.name")}</TableHead>
                        <TableHead>{t("admin.role")}</TableHead>
                        <TableHead>{t("admin.permissions")}</TableHead>
                        <TableHead>{t("admin.pin")}</TableHead>
                        <TableHead className="text-right">{t("common.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adminRoles.map((role) => (
                        <TableRow key={role.id}>
                          <TableCell>
                            <div className="relative inline-block">
                              {role.photoUrl ? (
                                <img 
                                  src={role.photoUrl} 
                                  alt={role.name}
                                  className="w-12 h-12 rounded-full object-cover border-2 border-primary/20"
                                />
                              ) : (
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold bg-gradient-to-br ${
                                  role.role === "owner" ? "from-red-400 to-red-600" :
                                  role.role === "manager" ? "from-pink-400 to-pink-600" :
                                  "from-green-400 to-green-600"
                                }`}>
                                  {role.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <label className="absolute -bottom-1 -right-1 cursor-pointer">
                                <input 
                                  type="file"
                                  className="hidden"
                                  accept="image/jpeg,image/png,image/webp"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      handlePhotoUpload(role.id, file);
                                      e.target.value = "";
                                    }
                                  }}
                                  disabled={uploadingPhotoId === role.id}
                                />
                                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/80 transition-colors">
                                  {uploadingPhotoId === role.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Camera className="w-3 h-3" />
                                  )}
                                </div>
                              </label>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{role.name}</TableCell>
                          <TableCell>
                            <Badge className={`${ROLE_LABELS[role.role]?.color || "bg-gray-500"} text-white`}>
                              {t(`admin.${role.role}`)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-normal">
                              {role.permissions?.length || 0} / {ALL_PERMISSIONS.length}
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
                )
              }
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
                    <Badge className="bg-pink-500 text-white">{t("admin.manager")}</Badge>
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

        <TabsContent value="broadcast" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                {t("admin.whatsappBroadcast")}
              </CardTitle>
              <CardDescription>{t("admin.broadcastDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleBroadcast} className="space-y-4">
                {/* Client Selection */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      {t("admin.selectClients", { defaultValue: "Sélectionner les clients" })}
                    </Label>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={selectAllClients}>
                        {t("common.selectAll", { defaultValue: "Tout sélectionner" })}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={deselectAllClients}>
                        {t("common.deselectAll", { defaultValue: "Tout désélectionner" })}
                      </Button>
                    </div>
                  </div>
                  
                  <Input
                    placeholder={t("admin.searchClients", { defaultValue: "Rechercher par nom ou téléphone..." })}
                    value={clientSearchQuery}
                    onChange={(e) => setClientSearchQuery(e.target.value)}
                    className="mb-2"
                  />
                  
                  <div className="border rounded-lg max-h-[200px] overflow-y-auto">
                    {filteredClientsForBroadcast.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground text-sm">
                        {t("admin.noClientsFound", { defaultValue: "Aucun client trouvé" })}
                      </div>
                    ) : (
                      filteredClientsForBroadcast.map(client => {
                        const isSelected = selectedClientIds.has(client.id);
                        return (
                          <div 
                            key={client.id}
                            className="flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer select-none"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleClientSelection(client.id);
                            }}
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center pointer-events-none ${isSelected ? 'bg-primary border-primary' : 'border-input'}`}>
                              {isSelected && <span className="text-primary-foreground text-xs">✓</span>}
                            </div>
                            <div className="flex-1 min-w-0 pointer-events-none">
                              <p className="font-medium text-sm truncate">{client.name}</p>
                              <p className="text-xs text-muted-foreground">{client.phone}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  
                  <p className="text-xs text-muted-foreground">
                    {selectedClientIds.size > 0 
                      ? `${selectedClientIds.size} ${t("admin.clientsSelected", { defaultValue: "client(s) sélectionné(s)" })}`
                      : t("admin.allClientsWillReceive", { defaultValue: "Tous les clients recevront le message si aucun n'est sélectionné" })}
                  </p>
                </div>

                {/* Template Selection */}
                {messageTemplates.length > 0 && (
                  <div className="space-y-2">
                    <Label>{t("admin.messageTemplate", { defaultValue: "Template de message" })}</Label>
                    <div className="flex gap-2">
                      <Select value={selectedTemplateId} onValueChange={handleLoadTemplate}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder={t("admin.selectTemplate", { defaultValue: "Choisir un template..." })} />
                        </SelectTrigger>
                        <SelectContent>
                          {messageTemplates.map(template => (
                            <SelectItem key={template.id} value={template.id.toString()}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedTemplateId && (
                        <Button 
                          type="button" 
                          variant="destructive" 
                          size="icon"
                          onClick={() => deleteTemplateMutation.mutate(Number(selectedTemplateId))}
                          disabled={deleteTemplateMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="broadcast-message">{t("admin.message")}</Label>
                  <Textarea
                    id="broadcast-message"
                    placeholder={t("admin.broadcastPlaceholder")}
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    rows={5}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("admin.useNameVariable")}
                  </p>
                  
                  {/* Save as Template */}
                  {broadcastMessage.trim() && (
                    <div className="mt-2">
                      {!showSaveTemplate ? (
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={() => setShowSaveTemplate(true)}
                        >
                          <Save className="w-4 h-4 mr-2" />
                          {t("admin.saveAsTemplate", { defaultValue: "Sauvegarder comme template" })}
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Input
                            placeholder={t("admin.templateName", { defaultValue: "Nom du template" })}
                            value={newTemplateName}
                            onChange={(e) => setNewTemplateName(e.target.value)}
                            className="flex-1"
                          />
                          <Button 
                            type="button" 
                            size="sm"
                            onClick={handleSaveAsTemplate}
                            disabled={!newTemplateName.trim() || createTemplateMutation.isPending}
                          >
                            {createTemplateMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Save className="w-4 h-4" />
                            )}
                          </Button>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setShowSaveTemplate(false);
                              setNewTemplateName("");
                            }}
                          >
                            {t("common.cancel", { defaultValue: "Annuler" })}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {broadcastResult && (
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-sm font-medium text-green-600 dark:text-green-400">
                      {t("admin.broadcastComplete")}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("admin.sent")}: {broadcastResult.sent} | {t("admin.failed")}: {broadcastResult.failed} | {t("admin.total")}: {broadcastResult.total}
                    </p>
                  </div>
                )}

                <Button 
                  type="submit" 
                  disabled={!broadcastMessage.trim() || broadcastMutation.isPending || selectedClientIds.size === 0}
                  className="w-full sm:w-auto"
                >
                  {broadcastMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t("admin.sending")}...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      {selectedClientIds.size > 0 
                        ? `${t("admin.sendTo", { defaultValue: "Envoyer à" })} ${selectedClientIds.size} ${t("admin.clients", { defaultValue: "client(s)" })}`
                        : t("admin.selectClientsFirst", "Select clients first")}
                    </>
                  )}
                </Button>
              </form>
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
