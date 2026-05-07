import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { 
  UserPlus, Users, Shield, Download, FileSpreadsheet, 
  Trash2, Edit, Calendar, User, Briefcase, Package, 
  CreditCard, Building2, Clock, Save, Camera, Loader2, RefreshCw,
  MessageCircle, Send, Lock, LayoutGrid, Sparkles,
  Search, Check, X, Phone, AlertTriangle, CheckCircle2,
  BookTemplate
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { SpinningLogo } from "@/components/ui/spinning-logo";
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
  mapsLink?: string | null;
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

const ROLE_LABELS: Record<string, { gradient: string }> = {
  owner: { gradient: "from-red-400 to-rose-600" },
  manager: { gradient: "from-pink-400 to-fuchsia-600" },
  receptionist: { gradient: "from-emerald-400 to-teal-600" }
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

function GlassSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`glass-card rounded-2xl overflow-hidden ${className}`}>
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

function GlassSectionHeader({ icon: Icon, title, description, action }: { 
  icon: React.ElementType; 
  title: string; 
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="liquid-glass-header px-5 py-4 md:px-6 md:py-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl liquid-gradient flex items-center justify-center shrink-0 shadow-lg">
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-base md:text-lg tracking-tight truncate">{title}</h3>
            {description && (
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5 line-clamp-1">{description}</p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

export default function AdminSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
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
  const [lastBroadcastMessage, setLastBroadcastMessage] = useState("");
  const [broadcastResult, setBroadcastResult] = useState<{sent: number, failed: number, total: number, failedClients: {id: number, name: string, phone: string, error: string}[]} | null>(null);
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
      setBroadcastResult({ sent: data.sent, failed: data.failed, total: data.total, failedClients: data.failedClients || [] });
      toast({ 
        title: t("admin.broadcastSent"),
        description: `${data.sent}/${data.total} ${t("admin.messagesSent")}`
      });
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
    setLastBroadcastMessage(broadcastMessage);
    const clientIds = Array.from(selectedClientIds);
    broadcastMutation.mutate({ message: broadcastMessage, clientIds });
  };

  const handleResendToFailed = () => {
    if (!broadcastResult || broadcastResult.failedClients.length === 0 || !lastBroadcastMessage) return;
    const failedIds = broadcastResult.failedClients.map(c => c.id);
    const previousResult = broadcastResult;
    setBroadcastResult(null);
    broadcastMutation.mutate({ message: lastBroadcastMessage, clientIds: failedIds }, {
      onError: () => {
        setBroadcastResult(previousResult);
      }
    });
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
    <div className="space-y-5 p-3 md:p-6 animate-fade-in max-w-5xl mx-auto">
      <div className="glass-elevated rounded-2xl px-5 py-5 md:px-7 md:py-6 glass-shine">
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl liquid-gradient flex items-center justify-center shadow-lg">
              <Shield className="w-6 h-6 md:w-7 md:h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight" data-testid="text-admin-title">
                {t("admin.title")}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">{t("admin.description")}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="glass-subtle rounded-xl h-10 w-10 hover:scale-105 transition-transform"
            onClick={() => {
              queryClient.invalidateQueries();
              toast({ title: t("common.refreshed"), description: t("common.dataUpdated") });
            }}
            title={t("common.refresh")}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="business" className="w-full">
        <div className="glass-card rounded-2xl p-1.5 mb-5">
          <TabsList className="grid w-full grid-cols-4 bg-transparent h-auto p-0 gap-1">
            {[
              { value: "business", icon: Building2, label: t("admin.business") },
              { value: "users", icon: Users, label: t("admin.users") },
              { value: "broadcast", icon: MessageCircle, label: t("admin.broadcast") },
              { value: "export", icon: Download, label: t("admin.export") },
            ].map(tab => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="rounded-xl py-2.5 md:py-3 px-2 gap-2 text-xs md:text-sm font-medium transition-all duration-300 data-[state=active]:liquid-gradient data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 data-[state=inactive]:hover:bg-muted/60"
                data-testid={`tab-${tab.value}`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ==================== BUSINESS TAB ==================== */}
        <TabsContent value="business" className="space-y-5 mt-0">
          <GlassSection>
            <GlassSectionHeader
              icon={Building2}
              title={t("admin.businessSettings")}
              description={t("admin.businessSettingsDesc")}
            />
            <div className="p-5 md:p-6">
              {isLoadingBusiness ? (
                <div className="loading-container py-12 min-h-[300px]"><SpinningLogo size="lg" /></div>
              ) : (
                <form onSubmit={handleBusinessSave} className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("admin.logo") || "Logo"}</Label>
                      <div className="flex items-center gap-4">
                        {businessForm.logo ? (
                          <div className="w-14 h-14 rounded-xl overflow-hidden glass-subtle flex items-center justify-center">
                            <img src={businessForm.logo} alt="Logo" className="h-full w-full object-contain" />
                          </div>
                        ) : (
                          <div className="w-14 h-14 rounded-xl glass-subtle flex items-center justify-center">
                            <Camera className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <Button 
                          type="button" 
                          variant="outline"
                          size="sm"
                          className="glass-subtle rounded-xl border-0"
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
                          data-testid="button-upload-logo"
                        >
                          <Camera className="mr-2 h-3.5 w-3.5" />
                          {t("admin.uploadLogo") || "Upload Logo"}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("admin.businessName")}</Label>
                      <Input
                        value={businessForm.businessName}
                        onChange={(e) => setBusinessForm(prev => ({ ...prev, businessName: e.target.value }))}
                        placeholder="PREGA SQUAD"
                        className="glass-subtle rounded-xl border-0 h-11"
                        data-testid="input-business-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("common.email")}</Label>
                      <Input
                        type="email"
                        value={businessForm.email || ""}
                        onChange={(e) => setBusinessForm(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="contact@example.com"
                        className="glass-subtle rounded-xl border-0 h-11"
                        data-testid="input-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("common.phone")}</Label>
                      <Input
                        value={businessForm.phone || ""}
                        onChange={(e) => setBusinessForm(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="+212 6XX XXX XXX"
                        className="glass-subtle rounded-xl border-0 h-11"
                        data-testid="input-phone"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("admin.address")}</Label>
                      <Input
                        value={businessForm.address || ""}
                        onChange={(e) => setBusinessForm(prev => ({ ...prev, address: e.target.value }))}
                        placeholder={t("admin.addressPlaceholder")}
                        className="glass-subtle rounded-xl border-0 h-11"
                        data-testid="input-address"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">رابط Google Maps</Label>
                      <Input
                        value={businessForm.mapsLink || ""}
                        onChange={(e) => setBusinessForm(prev => ({ ...prev, mapsLink: e.target.value }))}
                        placeholder="https://maps.app.goo.gl/..."
                        className="glass-subtle rounded-xl border-0 h-11"
                        data-testid="input-maps-link"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <div className="glass-subtle rounded-2xl p-5">
                    <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" />
                      {t("admin.workingHours")}
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("admin.openingTime")}</Label>
                        <Input
                          type="time"
                          value={businessForm.openingTime}
                          onChange={(e) => setBusinessForm(prev => ({ ...prev, openingTime: e.target.value }))}
                          className="rounded-xl border-border/50 h-11"
                          data-testid="input-opening-time"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("admin.closingTime")}</Label>
                        <Input
                          type="time"
                          value={businessForm.closingTime}
                          onChange={(e) => setBusinessForm(prev => ({ ...prev, closingTime: e.target.value }))}
                          className="rounded-xl border-border/50 h-11"
                          data-testid="input-closing-time"
                        />
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("admin.workingDays")}</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {DAYS_OF_WEEK.map(day => {
                          const isActive = businessForm.workingDays?.includes(day.value) || false;
                          return (
                            <button
                              key={day.value}
                              type="button"
                              onClick={() => toggleWorkingDay(day.value)}
                              className={`px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                                isActive 
                                  ? 'liquid-gradient text-white shadow-md shadow-primary/20' 
                                  : 'glass-subtle hover:bg-muted/80'
                              }`}
                              data-testid={`button-day-${day.value}`}
                            >
                              {t(`days.${day.label}`)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="glass-subtle rounded-2xl p-5">
                    <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-primary" />
                      {t("admin.autoLock")}
                    </h3>
                    <p className="text-xs text-muted-foreground mb-3">{t("admin.autoLockDesc")}</p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={businessForm.autoLockEnabled}
                        onClick={() => setBusinessForm(prev => ({ ...prev, autoLockEnabled: !prev.autoLockEnabled }))}
                        className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${businessForm.autoLockEnabled ? 'liquid-gradient' : 'bg-muted'}`}
                        data-testid="switch-auto-lock"
                      >
                        <span className={`block absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${businessForm.autoLockEnabled ? 'translate-x-5' : ''}`} />
                      </button>
                      <span className="text-sm">{t("admin.autoLockEnabled")}</span>
                    </div>
                  </div>

                  <div className="glass-subtle rounded-2xl p-5">
                    <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <LayoutGrid className="w-4 h-4 text-primary" />
                      {t("admin.planningShortcuts")}
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4">{t("admin.planningShortcutsDesc")}</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      {[0, 1, 2, 3].map((slotIndex) => (
                        <div key={slotIndex} className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">{t("admin.shortcutSlot")} {slotIndex + 1}</Label>
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
                            <SelectTrigger className="rounded-xl border-border/50 h-10" data-testid={`select-shortcut-${slotIndex}`}>
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

                  <div className="glass-subtle rounded-2xl p-5">
                    <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-primary" />
                      {t("admin.currency")}
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("admin.currencyCode")}</Label>
                        <Input
                          value={businessForm.currency}
                          onChange={(e) => setBusinessForm(prev => ({ ...prev, currency: e.target.value }))}
                          placeholder="MAD"
                          maxLength={5}
                          className="rounded-xl border-border/50 h-11"
                          data-testid="input-currency-code"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("admin.currencySymbol")}</Label>
                        <Input
                          value={businessForm.currencySymbol}
                          onChange={(e) => setBusinessForm(prev => ({ ...prev, currencySymbol: e.target.value }))}
                          placeholder="DH"
                          maxLength={5}
                          className="rounded-xl border-border/50 h-11"
                          data-testid="input-currency-symbol"
                        />
                      </div>
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    className="liquid-glass-button rounded-xl h-11 px-6 gap-2 w-full sm:w-auto" 
                    disabled={businessMutation.isPending}
                    data-testid="button-save-business"
                  >
                    {businessMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {t("common.save")}
                  </Button>
                </form>
              )}
            </div>
          </GlassSection>
        </TabsContent>

        {/* ==================== USERS TAB ==================== */}
        <TabsContent value="users" className="space-y-5 mt-0">
          <GlassSection>
            <GlassSectionHeader
              icon={Users}
              title={t("admin.userManagement")}
              description={t("admin.userManagementDesc")}
              action={
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                  setIsDialogOpen(open);
                  if (!open) {
                    setEditingRole(null);
                    resetForm();
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button className="liquid-glass-button rounded-xl h-9 px-4 gap-2 text-sm" data-testid="button-add-user">
                      <UserPlus className="w-4 h-4" />
                      <span className="hidden sm:inline">{t("admin.addUser")}</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto liquid-glass-modal rounded-2xl">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-lg">
                        <div className="w-8 h-8 rounded-lg liquid-gradient flex items-center justify-center">
                          {editingRole ? <Edit className="w-4 h-4 text-white" /> : <UserPlus className="w-4 h-4 text-white" />}
                        </div>
                        {editingRole ? t("admin.editUser") : t("admin.addUser")}
                      </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("common.name")}</Label>
                          <Input
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            placeholder={t("admin.namePlaceholder")}
                            required
                            className="rounded-xl h-11"
                            data-testid="input-user-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("admin.role")}</Label>
                          <Select
                            value={formData.role}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}
                          >
                            <SelectTrigger className="rounded-xl h-11" data-testid="select-user-role">
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
                        <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("admin.pin")} ({t("services.optional")})</Label>
                        <Input
                          type="password"
                          value={formData.pin}
                          onChange={(e) => setFormData(prev => ({ ...prev, pin: e.target.value }))}
                          placeholder="****"
                          maxLength={10}
                          className="rounded-xl h-11"
                          data-testid="input-user-pin"
                        />
                        <p className="text-xs text-muted-foreground">{t("admin.pinDesc")}</p>
                      </div>
                      
                      <div className="glass-subtle rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-semibold flex items-center gap-2">
                            <Shield className="w-4 h-4 text-primary" />
                            {t("admin.permissions")}
                          </Label>
                          <div className="flex gap-1.5">
                            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs rounded-lg" onClick={selectAllPermissions} data-testid="button-select-all-perms">
                              {t("admin.selectAll")}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs rounded-lg" onClick={clearAllPermissions} data-testid="button-clear-all-perms">
                              {t("admin.clearAll")}
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">{t("admin.permissionsDesc")}</p>
                        <div className="grid gap-1.5 md:grid-cols-2">
                          {ALL_PERMISSIONS.map((perm) => {
                            const isChecked = formData.permissions.includes(perm.key);
                            return (
                              <label
                                key={perm.key}
                                htmlFor={`perm-${perm.key}`}
                                className={`flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all duration-200 ${
                                  isChecked 
                                    ? 'bg-primary/10 border border-primary/20' 
                                    : 'hover:bg-muted/50 border border-transparent'
                                }`}
                              >
                                <Checkbox
                                  id={`perm-${perm.key}`}
                                  checked={isChecked}
                                  onCheckedChange={() => togglePermission(perm.key)}
                                  className="rounded-md"
                                />
                                <span className="text-sm flex-1">
                                  {t(perm.labelKey, perm.key.replace(/_/g, ' '))}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <Button type="submit" className="w-full liquid-glass-button rounded-xl h-11" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-user">
                        {(createMutation.isPending || updateMutation.isPending) ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : null}
                        {editingRole ? t("common.save") : t("common.add")}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              }
            />
            <div className="p-5 md:p-6">
              {isLoading ? (
                <div className="loading-container py-12 min-h-[300px]"><SpinningLogo size="lg" /></div>
              ) : adminRoles.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-2xl glass-subtle flex items-center justify-center mx-auto mb-4">
                    <Users className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">{t("admin.noUsers")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {adminRoles.map((role) => {
                    const roleInfo = ROLE_LABELS[role.role] || { gradient: "from-gray-400 to-gray-600" };
                    return (
                      <div 
                        key={role.id} 
                        className="glass-subtle rounded-2xl p-4 transition-all duration-200 hover:shadow-md group"
                        data-testid={`card-user-${role.id}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="relative shrink-0">
                            {role.photoUrl ? (
                              <img 
                                src={role.photoUrl} 
                                alt={role.name}
                                className="w-12 h-12 md:w-14 md:h-14 rounded-xl object-cover ring-2 ring-white/50 shadow-md"
                              />
                            ) : (
                              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center text-white text-lg font-bold bg-gradient-to-br ${roleInfo.gradient} shadow-md`}>
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
                              <div className="w-6 h-6 rounded-lg bg-white dark:bg-card shadow-md flex items-center justify-center hover:scale-110 transition-transform">
                                {uploadingPhotoId === role.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                                ) : (
                                  <Camera className="w-3 h-3 text-muted-foreground" />
                                )}
                              </div>
                            </label>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm md:text-base">{role.name}</span>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] md:text-xs font-semibold text-white bg-gradient-to-r ${roleInfo.gradient} shadow-sm`}>
                                {t(`admin.${role.role}`)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Shield className="w-3 h-3" />
                                {role.permissions?.length || 0}/{ALL_PERMISSIONS.length}
                              </span>
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Lock className="w-3 h-3" />
                                {role.pin ? "••••" : "-"}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-9 w-9 rounded-xl hover:bg-primary/10"
                              onClick={() => handleEdit(role)}
                              data-testid={`button-edit-user-${role.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-9 w-9 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                if (confirm(t("admin.deleteConfirm"))) {
                                  deleteMutation.mutate(role.id);
                                }
                              }}
                              data-testid={`button-delete-user-${role.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </GlassSection>

          <GlassSection>
            <GlassSectionHeader
              icon={Sparkles}
              title={t("admin.rolePermissions")}
              description={t("admin.rolePermissionsDesc")}
            />
            <div className="p-5 md:p-6">
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  { role: "owner", icon: Shield, desc: t("admin.ownerDesc") },
                  { role: "manager", icon: Briefcase, desc: t("admin.managerDesc") },
                  { role: "receptionist", icon: User, desc: t("admin.receptionistDesc") },
                ].map(item => {
                  const roleInfo = ROLE_LABELS[item.role];
                  return (
                    <div key={item.role} className="glass-subtle rounded-2xl p-4 space-y-3 hover:shadow-md transition-all duration-200">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${roleInfo.gradient} flex items-center justify-center shadow-sm`}>
                          <item.icon className="w-4 h-4 text-white" />
                        </div>
                        <span className={`text-xs font-bold uppercase tracking-wider bg-gradient-to-r ${roleInfo.gradient} bg-clip-text text-transparent`}>
                          {t(`admin.${item.role}`)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </GlassSection>
        </TabsContent>

        {/* ==================== BROADCAST TAB ==================== */}
        <TabsContent value="broadcast" className="space-y-5 mt-0">
          <form onSubmit={handleBroadcast} className="space-y-5">

            {/* Stats overview bar */}
            <div className="grid grid-cols-3 gap-3">
              <div className="glass-subtle rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold leading-tight" data-testid="text-clients-with-phone">{clientsWithPhone.length}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{t("admin.withPhone", { defaultValue: "With Phone" })}</p>
                </div>
              </div>
              <div className="glass-subtle rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold leading-tight" data-testid="text-selected-count">{selectedClientIds.size}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{t("admin.selected", { defaultValue: "Selected" })}</p>
                </div>
              </div>
              <div className="glass-subtle rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                  <BookTemplate className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold leading-tight" data-testid="text-template-count">{messageTemplates.length}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{t("admin.templates", { defaultValue: "Templates" })}</p>
                </div>
              </div>
            </div>

            {/* Section 1: Client Selection */}
            <GlassSection>
              <GlassSectionHeader
                icon={Users}
                title={t("admin.selectClients", { defaultValue: "Select Recipients" })}
                description={`${clientsWithPhone.length} ${t("admin.clientsWithPhone", { defaultValue: "clients with phone numbers" })}`}
                action={
                  <div className="flex gap-1.5">
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-xs rounded-xl px-3" onClick={selectAllClients} data-testid="button-select-all-clients">
                      {t("common.selectAll", { defaultValue: "Select all" })}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-xs rounded-xl px-3" onClick={deselectAllClients} data-testid="button-deselect-all-clients">
                      {t("common.deselectAll", { defaultValue: "Clear" })}
                    </Button>
                  </div>
                }
              />
              <div className="p-4 md:p-5 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder={t("admin.searchClients", { defaultValue: "Search by name or phone..." })}
                    value={clientSearchQuery}
                    onChange={(e) => setClientSearchQuery(e.target.value)}
                    className="glass-subtle rounded-xl border-0 h-10 pl-10 pr-4"
                    data-testid="input-search-clients"
                  />
                  {clientSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setClientSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={t("common.clearSearch", { defaultValue: "Clear search" })}
                      data-testid="button-clear-search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="rounded-xl overflow-hidden glass-subtle max-h-[280px] overflow-y-auto">
                  {filteredClientsForBroadcast.length === 0 ? (
                    <div className="p-8 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                        <Users className="w-5 h-5 text-muted-foreground/50" />
                      </div>
                      <p className="text-sm text-muted-foreground">{t("admin.noClientsFound", { defaultValue: "No clients found" })}</p>
                      {clientSearchQuery && (
                        <p className="text-xs text-muted-foreground/70 mt-1">{t("admin.tryDifferentSearch", { defaultValue: "Try a different search term" })}</p>
                      )}
                    </div>
                  ) : (
                    filteredClientsForBroadcast.map((client, idx) => {
                      const isSelected = selectedClientIds.has(client.id);
                      const initials = client.name.charAt(0).toUpperCase();
                      return (
                        <div 
                          key={client.id}
                          role="checkbox"
                          aria-checked={isSelected}
                          tabIndex={0}
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer select-none transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                            idx !== filteredClientsForBroadcast.length - 1 ? 'border-b border-border/10' : ''
                          } ${
                            isSelected 
                              ? 'bg-primary/5 dark:bg-primary/10' 
                              : 'hover:bg-muted/30'
                          }`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleClientSelection(client.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault();
                              toggleClientSelection(client.id);
                            }
                          }}
                          data-testid={`client-select-${client.id}`}
                        >
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold transition-all duration-200 ${
                            isSelected 
                              ? 'liquid-gradient text-white shadow-md shadow-primary/20' 
                              : 'bg-muted/60 text-muted-foreground'
                          }`}>
                            {isSelected ? <Check className="w-4 h-4" /> : initials}
                          </div>
                          <div className="flex-1 min-w-0 pointer-events-none">
                            <p className="font-medium text-sm truncate">{client.name}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {client.phone}
                            </p>
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                              <Check className="w-3 h-3 text-primary" />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {selectedClientIds.size > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="h-7 px-3 rounded-full liquid-gradient flex items-center gap-1.5 text-white text-xs font-semibold shadow-sm">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {selectedClientIds.size} {t("admin.clientsSelected", { defaultValue: "selected" })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("admin.readyToSend", { defaultValue: "Ready to receive broadcast" })}
                    </p>
                  </div>
                )}
              </div>
            </GlassSection>

            {/* Section 2: Message Composer */}
            <GlassSection>
              <GlassSectionHeader
                icon={Send}
                title={t("admin.composeMessage", { defaultValue: "Compose Message" })}
                description={t("admin.broadcastDesc")}
              />
              <div className="p-4 md:p-5 space-y-4">
                {messageTemplates.length > 0 && (
                  <div className="glass-subtle rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <BookTemplate className="w-4 h-4 text-primary" />
                      <Label className="text-sm font-semibold">{t("admin.messageTemplate", { defaultValue: "Message Templates" })}</Label>
                    </div>
                    <div className="flex gap-2">
                      <Select value={selectedTemplateId} onValueChange={handleLoadTemplate}>
                        <SelectTrigger className="flex-1 rounded-xl h-10 border-border/40" data-testid="select-template">
                          <SelectValue placeholder={t("admin.selectTemplate", { defaultValue: "Choose a template..." })} />
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
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 rounded-xl text-destructive hover:bg-destructive/10"
                          onClick={() => deleteTemplateMutation.mutate(Number(selectedTemplateId))}
                          disabled={deleteTemplateMutation.isPending}
                          aria-label={t("admin.deleteTemplate", { defaultValue: "Delete template" })}
                          data-testid="button-delete-template"
                        >
                          {deleteTemplateMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="broadcast-message" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("admin.message")}</Label>
                  <Textarea
                    id="broadcast-message"
                    placeholder={t("admin.broadcastPlaceholder")}
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    rows={6}
                    className="resize-none rounded-xl glass-subtle border-0 focus:ring-2 focus:ring-primary/30 text-sm leading-relaxed"
                    data-testid="input-broadcast-message"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono text-[10px]">{"{name}"}</span>
                      {t("admin.useNameVariable")}
                    </p>
                    {broadcastMessage.trim() && (
                      <span className="text-xs text-muted-foreground">{broadcastMessage.length} {t("admin.chars", { defaultValue: "chars" })}</span>
                    )}
                  </div>
                </div>

                {broadcastMessage.trim() && (
                  <div className="glass-subtle rounded-xl p-3">
                    {!showSaveTemplate ? (
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm"
                        className="rounded-xl h-8 text-xs w-full justify-center gap-1.5"
                        onClick={() => setShowSaveTemplate(true)}
                        data-testid="button-show-save-template"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {t("admin.saveAsTemplate", { defaultValue: "Save as template" })}
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          placeholder={t("admin.templateName", { defaultValue: "Template name" })}
                          value={newTemplateName}
                          onChange={(e) => setNewTemplateName(e.target.value)}
                          className="flex-1 rounded-xl h-9 text-sm"
                          data-testid="input-template-name"
                        />
                        <Button 
                          type="button" 
                          size="sm"
                          className="rounded-xl h-9 liquid-glass-button px-3"
                          onClick={handleSaveAsTemplate}
                          disabled={!newTemplateName.trim() || createTemplateMutation.isPending}
                          data-testid="button-save-template"
                        >
                          {createTemplateMutation.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                        </Button>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon"
                          className="rounded-xl h-9 w-9"
                          onClick={() => {
                            setShowSaveTemplate(false);
                            setNewTemplateName("");
                          }}
                          aria-label={t("common.cancel", { defaultValue: "Cancel" })}
                          data-testid="button-cancel-template"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <Button 
                  type="submit" 
                  disabled={!broadcastMessage.trim() || broadcastMutation.isPending || selectedClientIds.size === 0}
                  className="w-full liquid-glass-button rounded-xl h-12 gap-2.5 text-sm font-semibold"
                  data-testid="button-send-broadcast"
                >
                  {broadcastMutation.isPending ? (
                    <>
                      <Loader2 className="w-4.5 h-4.5 animate-spin" />
                      {t("admin.sending")}...
                    </>
                  ) : (
                    <>
                      <Send className="w-4.5 h-4.5" />
                      {selectedClientIds.size > 0 
                        ? `${t("admin.sendTo", { defaultValue: "Send to" })} ${selectedClientIds.size} ${t("admin.clients", { defaultValue: "client(s)" })}`
                        : t("admin.selectClientsFirst", "Select clients first")}
                    </>
                  )}
                </Button>
              </div>
            </GlassSection>

            {/* Section 3: Results Panel */}
            {broadcastResult && (
              <GlassSection className={broadcastResult.failed > 0 ? 'ring-1 ring-amber-400/30' : 'ring-1 ring-emerald-400/30'}>
                <div className={`px-5 py-4 md:px-6 md:py-5 ${
                  broadcastResult.failed > 0 
                    ? 'bg-gradient-to-r from-amber-500/8 via-orange-500/5 to-transparent' 
                    : 'bg-gradient-to-r from-emerald-500/8 via-teal-500/5 to-transparent'
                }`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                      broadcastResult.failed > 0 
                        ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/20' 
                        : 'bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/20'
                    }`}>
                      {broadcastResult.failed > 0 ? (
                        <AlertTriangle className="w-5 h-5 text-white" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base">
                        {t("admin.broadcastComplete")}
                      </h3>
                      <div className="flex items-center gap-4 mt-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-xs font-medium">{broadcastResult.sent} {t("admin.sent")}</span>
                        </div>
                        {broadcastResult.failed > 0 && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-amber-500" />
                            <span className="text-xs font-medium">{broadcastResult.failed} {t("admin.failed")}</span>
                          </div>
                        )}
                        <span className="text-xs text-muted-foreground">{t("admin.total")}: {broadcastResult.total}</span>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-4 h-2 rounded-full bg-muted/50 overflow-hidden">
                    <div className="h-full flex">
                      <div 
                        className="bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${broadcastResult.total > 0 ? (broadcastResult.sent / broadcastResult.total) * 100 : 0}%` }}
                      />
                      {broadcastResult.failed > 0 && (
                        <div 
                          className="bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500 ml-0.5"
                          style={{ width: `${(broadcastResult.failed / broadcastResult.total) * 100}%` }}
                        />
                      )}
                    </div>
                  </div>
                </div>
                
                {broadcastResult.failedClients.length > 0 && (
                  <div className="px-5 pb-5 md:px-6 md:pb-6 pt-2 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-destructive uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {t("admin.failedClients", { defaultValue: "Failed to send" })}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleResendToFailed}
                        disabled={broadcastMutation.isPending}
                        className="rounded-xl h-8 gap-1.5 text-xs border-amber-400/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                        data-testid="button-resend-failed"
                      >
                        {broadcastMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        {t("admin.resendToFailed", { defaultValue: "Retry" })} ({broadcastResult.failedClients.length})
                      </Button>
                    </div>
                    <div className="rounded-xl overflow-hidden glass-subtle max-h-[180px] overflow-y-auto">
                      {broadcastResult.failedClients.map((client, idx) => (
                        <div 
                          key={client.id} 
                          className={`flex items-center gap-3 px-4 py-3 ${idx !== broadcastResult.failedClients.length - 1 ? 'border-b border-border/10' : ''}`}
                          data-testid={`failed-client-${client.id}`}
                        >
                          <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                            <X className="w-4 h-4 text-destructive" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{client.name}</span>
                              <span className="text-muted-foreground text-xs flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {client.phone}
                              </span>
                            </div>
                            <p className="text-xs text-destructive/70 truncate mt-0.5">{client.error}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </GlassSection>
            )}
          </form>
        </TabsContent>

        {/* ==================== EXPORT TAB ==================== */}
        <TabsContent value="export" className="space-y-5 mt-0">
          <GlassSection>
            <GlassSectionHeader
              icon={FileSpreadsheet}
              title={t("admin.exportData")}
              description={t("admin.exportDataDesc")}
            />
            <div className="p-5 md:p-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {exportOptions.map(({ key, icon: Icon, label }) => (
                  <button
                    key={key}
                    className="glass-subtle rounded-2xl p-5 flex flex-col items-center gap-3 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 group cursor-pointer"
                    onClick={() => handleExport(key)}
                    data-testid={`button-export-${key}`}
                  >
                    <div className="w-12 h-12 rounded-xl liquid-gradient flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow">
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-sm font-medium text-center">{label}</span>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors">
                      <Download className="w-3 h-3" />
                      CSV
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </GlassSection>

          <GlassSection>
            <GlassSectionHeader
              icon={Shield}
              title={t("admin.backupInfo")}
            />
            <div className="p-5 md:p-6">
              <div className="glass-subtle rounded-2xl p-5 flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{t("admin.backupInfoDesc")}</p>
              </div>
            </div>
          </GlassSection>
        </TabsContent>
      </Tabs>
    </div>
  );
}