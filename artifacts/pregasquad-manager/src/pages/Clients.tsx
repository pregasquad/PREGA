import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { prefetchCoreData } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { getAppSocket } from "@/lib/appSocket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2, User, Phone, Mail, Gift, Calendar as CalendarIcon, Star, Crown, Award, Zap, Clock, RefreshCw, CreditCard, Search, Check, MessageCircle, AlertTriangle } from "lucide-react";
import { SpinningLogo } from "@/components/ui/spinning-logo";
import { format, startOfToday } from "date-fns";
import { ar, enUS, fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Client, Appointment, Service, Staff } from "@shared/schema";

const TAG_OPTIONS = [
  { label: "VIP", color: "bg-yellow-500" },
  { label: "منتظم", color: "bg-green-500" },
  { label: "جديد", color: "bg-blue-500" },
  { label: "غائب", color: "bg-orange-500" },
  { label: "مميز", color: "bg-purple-500" },
];

function parseClientTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  return tags.split(",").map(t => t.trim()).filter(Boolean);
}

const TIME_SLOTS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30", "20:00", "20:30",
  "21:00", "21:30", "22:00", "22:30", "23:00", "23:30",
  "00:00", "00:30", "01:00", "01:30", "02:00", "02:30", "03:00"
];

export default function Clients() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isQuickBookOpen, setIsQuickBookOpen] = useState(false);
  const [quickBookClient, setQuickBookClient] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [giftCardCode, setGiftCardCode] = useState("");
  const [foundGiftCard, setFoundGiftCard] = useState<any>(null);
  const [redeemAmount, setRedeemAmount] = useState("");

  const [quickBookData, setQuickBookData] = useState({
    date: startOfToday(),
    time: "",
    serviceId: "",
    staffId: "",
  });

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    birthday: "",
    notes: "",
  });

  const getDateLocale = () => {
    switch (i18n.language) {
      case "ar": return ar;
      case "fr": return fr;
      default: return enUS;
    }
  };

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  useEffect(() => {
    const socket = getAppSocket();
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
    socket.on("client:created", refresh);
    socket.on("client:updated", refresh);
    return () => {
      socket.off("client:created", refresh);
      socket.off("client:updated", refresh);
      // Do NOT disconnect — this is a shared singleton used across the app
    };
  }, [queryClient]);

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: staffList = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const { data: clientAppointments = [] } = useQuery<Appointment[]>({
    queryKey: ["/api/clients", selectedClient?.id, "appointments"],
    queryFn: async () => {
      if (!selectedClient?.id) return [];
      const res = await fetch(`/api/clients/${selectedClient.id}/appointments`);
      return res.json();
    },
    enabled: !!selectedClient?.id,
  });

  const { data: quickBookClientHistory = [] } = useQuery<Appointment[]>({
    queryKey: ["/api/clients", quickBookClient?.id, "appointments"],
    queryFn: async () => {
      if (!quickBookClient?.id) return [];
      const res = await fetch(`/api/clients/${quickBookClient.id}/appointments`);
      return res.json();
    },
    enabled: !!quickBookClient?.id,
  });

  const frequentServices = useMemo(() => {
    if (!quickBookClientHistory.length) return [];
    const serviceCounts: Record<string, { name: string; count: number; serviceId?: number }> = {};
    quickBookClientHistory.forEach((appt) => {
      if (appt.service) {
        if (!serviceCounts[appt.service]) {
          serviceCounts[appt.service] = { name: appt.service, count: 0 };
        }
        serviceCounts[appt.service].count++;
        const matchingService = services.find(s => s.name === appt.service);
        if (matchingService) {
          serviceCounts[appt.service].serviceId = matchingService.id;
        }
      }
    });
    return Object.values(serviceCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [quickBookClientHistory, services]);

  const [isSyncing, setIsSyncing] = useState(false);

  // A phone is a WhatsApp LID (internal identifier, not a real phone number)
  // when it has 14+ digits. Real Moroccan numbers are at most 12 digits (212XXXXXXXXX).
  const isLidPhone = (phone: string | null | undefined) =>
    (phone ?? "").replace(/[^0-9]/g, "").length >= 14;

  const lidClients = clients.filter((c) => isLidPhone(c.phone));

  const handleWhatsAppSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/whatsapp/sync-clients", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      const parts = [];
      if (data.created > 0) parts.push(`${data.created} ajouté(s)`);
      if (data.updated > 0) parts.push(`${data.updated} mis à jour`);
      if (data.cleaned > 0) parts.push(`${data.cleaned} supprimé(s)`);
      const base = parts.length > 0 ? parts.join(", ") : "Déjà à jour";
      const extra = (data.needsManualFix ?? 0) > 0
        ? ` — ${data.needsManualFix} contact(s) avec numéro inconnu, corrigez manuellement`
        : "";
      toast({ title: "Sync WhatsApp", description: base + extra });
    } catch (err: any) {
      toast({ title: t("common.error", "Error"), description: err.message, variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setIsAddDialogOpen(false);
      resetForm();
      toast({ title: t("clients.clientAdded") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      const res = await fetch(`/api/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setIsEditDialogOpen(false);
      resetForm();
      toast({ title: t("clients.clientUpdated") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const tagsMutation = useMutation({
    mutationFn: async ({ id, tags }: { id: number; tags: string[] }) => {
      const res = await fetch(`/api/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: tags.join(",") }),
      });
      if (!res.ok) throw new Error("Failed to update tags");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
    },
  });

  const toggleTag = (client: Client, tag: string) => {
    const current = parseClientTags((client as any).tags);
    const updated = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    tagsMutation.mutate({ id: client.id, tags: updated });
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/clients/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: t("clients.clientDeleted") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const quickBookMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to book");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setIsQuickBookOpen(false);
      setQuickBookClient(null);
      setQuickBookData({ date: startOfToday(), time: "", serviceId: "", staffId: "" });
      toast({ title: t("clients.bookingSuccess") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const lookupGiftCard = async () => {
    if (!giftCardCode.trim()) return;
    try {
      const res = await fetch(`/api/gift-cards/code/${giftCardCode.toUpperCase()}`);
      if (!res.ok) {
        toast({ title: t("giftCard.notFound", "Gift card not found"), variant: "destructive" });
        setFoundGiftCard(null);
        return;
      }
      const card = await res.json();
      setFoundGiftCard(card);
    } catch {
      toast({ title: t("giftCard.lookupError", "Error looking up gift card"), variant: "destructive" });
    }
  };

  const redeemGiftCardMutation = useMutation({
    mutationFn: async ({ cardId, amount, clientId }: { cardId: number; amount: number; clientId: number }) => {
      const res = await fetch(`/api/gift-cards/${cardId}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: "Failed to redeem" }));
        throw new Error(error.message);
      }
      const giftCardData = await res.json();
      
      const clientRes = await fetch(`/api/clients/${clientId}/gift-card-balance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      if (!clientRes.ok) {
        throw new Error("Failed to credit client balance");
      }
      const clientData = await clientRes.json();
      
      return { giftCard: giftCardData, client: clientData };
    },
    onSuccess: (data) => {
      toast({ title: t("giftCard.redeemed", "Gift card redeemed successfully!") + ` +${redeemAmount} DH` });
      setFoundGiftCard(data.giftCard);
      setSelectedClient(data.client);
      setRedeemAmount("");
      queryClient.invalidateQueries({ queryKey: ["/api/gift-cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
    },
    onError: (error: Error) => {
      toast({ title: error.message || t("giftCard.redeemError", "Failed to redeem gift card"), variant: "destructive" });
    },
  });

  const toggleUsePointsMutation = useMutation({
    mutationFn: async ({ clientId, usePoints }: { clientId: number; usePoints: boolean }) => {
      const res = await fetch(`/api/clients/${clientId}/use-points`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usePoints }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: data.usePoints 
          ? t("clients.pointsActivated", "Points discount activated") 
          : t("clients.pointsDeactivated", "Points discount deactivated")
      });
      setSelectedClient(data);
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
    },
    onError: () => {
      toast({ title: t("common.error", "Error"), variant: "destructive" });
    },
  });

  const toggleUseGiftCardBalanceMutation = useMutation({
    mutationFn: async ({ clientId, useGiftCardBalance }: { clientId: number; useGiftCardBalance: boolean }) => {
      const res = await fetch(`/api/clients/${clientId}/use-gift-card-balance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useGiftCardBalance }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: data.useGiftCardBalance 
          ? t("giftCard.balanceActivated", "Gift card balance discount activated") 
          : t("giftCard.balanceDeactivated", "Gift card balance discount deactivated")
      });
      setSelectedClient(data);
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
    },
    onError: () => {
      toast({ title: t("common.error", "Error"), variant: "destructive" });
    },
  });

  const handleRedeemGiftCard = () => {
    if (!foundGiftCard) {
      toast({ title: t("giftCard.noCard", "No gift card selected"), variant: "destructive" });
      return;
    }
    if (!selectedClient) {
      toast({ title: t("giftCard.noClient", "No client selected"), variant: "destructive" });
      return;
    }
    const amount = parseFloat(redeemAmount);
    if (!amount || amount <= 0) {
      toast({ title: t("giftCard.invalidAmount", "Please enter a valid amount"), variant: "destructive" });
      return;
    }
    if (amount > foundGiftCard.currentBalance) {
      toast({ title: t("giftCard.insufficientBalance", "Amount exceeds card balance"), variant: "destructive" });
      return;
    }
    if (!foundGiftCard.isActive) {
      toast({ title: t("giftCard.inactive", "This gift card is inactive"), variant: "destructive" });
      return;
    }
    redeemGiftCardMutation.mutate({ cardId: foundGiftCard.id, amount, clientId: selectedClient.id });
  };

  const resetForm = () => {
    setFormData({ name: "", phone: "", email: "", birthday: "", notes: "" });
  };

  const handleEdit = (client: Client) => {
    setSelectedClient(client);
    setFormData({
      name: client.name,
      phone: client.phone || "",
      email: client.email || "",
      birthday: client.birthday || "",
      notes: client.notes || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleViewDetails = (client: Client) => {
    setSelectedClient(client);
    setIsDetailDialogOpen(true);
  };

  const handleQuickBook = (client: Client, e: React.MouseEvent) => {
    e.stopPropagation();
    setQuickBookClient(client);
    setQuickBookData({ date: startOfToday(), time: "", serviceId: "", staffId: "" });
    setIsQuickBookOpen(true);
  };

  const handleSubmitQuickBook = () => {
    if (!quickBookClient || !quickBookData.serviceId || !quickBookData.time || !quickBookData.staffId) return;
    
    const service = services.find(s => s.id === parseInt(quickBookData.serviceId));
    const staff = staffList.find(s => s.id === parseInt(quickBookData.staffId));
    if (!service || !staff) return;

    quickBookMutation.mutate({
      client: quickBookClient.name,
      phone: quickBookClient.phone || "",
      service: service.name,
      staff: staff.name,
      date: format(quickBookData.date, "yyyy-MM-dd"),
      startTime: quickBookData.time,
      duration: service.duration,
      price: service.price,
      total: service.price,
      paid: false,
    });
  };

  const getLoyaltyTier = (points: number) => {
    if (points >= 1000) return { name: t("clients.vip"), color: "bg-yellow-500", icon: Crown };
    if (points >= 500) return { name: t("clients.gold"), color: "bg-sky-500", icon: Award };
    if (points >= 100) return { name: t("clients.silver"), color: "bg-gray-400", icon: Star };
    return { name: t("clients.bronze"), color: "bg-pink-600", icon: Star };
  };

  const filteredClients = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone?.includes(searchTerm) ||
      c.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Render form fields inline to prevent focus loss on re-render
  const renderFormFields = () => (
    <>
      <div>
        <Label>{t("clients.name")} *</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder={t("clients.clientName")}
        />
      </div>
      <div>
        <Label>{t("clients.phone")}</Label>
        <Input
          value={formData.phone}
          onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
          placeholder="0612345678"
          dir="ltr"
        />
      </div>
      <div>
        <Label>{t("clients.email")}</Label>
        <Input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
          placeholder="email@example.com"
          dir="ltr"
        />
      </div>
      <div>
        <Label>{t("clients.birthday")}</Label>
        <Input
          type="date"
          value={formData.birthday}
          onChange={(e) => setFormData(prev => ({ ...prev, birthday: e.target.value }))}
        />
      </div>
      <div>
        <Label>{t("clients.notes")}</Label>
        <Input
          value={formData.notes}
          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
          placeholder={t("clients.additionalNotes")}
        />
      </div>
    </>
  );

  if (isLoading) {
    return <div className="loading-container h-64"><SpinningLogo size="lg" /></div>;
  }

  return (
    <div className="p-2 md:p-4 lg:p-6 space-y-4 md:space-y-6 animate-fade-in" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{t("clients.title")}</h1>
          <p className="text-sm md:text-base text-muted-foreground">{t("clients.pageDesc")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isSyncing}
            onClick={handleWhatsAppSync}
            data-testid="button-whatsapp-sync"
            title={t("clients.whatsappSync", "Sync from WhatsApp")}
            className="gap-1.5 text-green-600 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-950"
          >
            <MessageCircle className={`h-4 w-4 ${isSyncing ? "animate-pulse" : ""}`} />
            {isSyncing
              ? t("common.syncing", "جاري...")
              : t("clients.whatsappSync", "مزامنة واتساب")}
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={isRefreshing}
            onClick={async () => {
              setIsRefreshing(true);
              await prefetchCoreData();
              setIsRefreshing(false);
              toast({ title: t("common.refreshed"), description: t("common.dataUpdated") });
            }}
            title={t("common.refresh")}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="w-4 h-4 ml-2" />
                {t("clients.addClient")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("clients.newClient")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {renderFormFields()}
                <Button onClick={() => createMutation.mutate(formData)} className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t("common.loading") : t("common.add")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        <Card>
          <CardContent className="p-3 md:pt-6 md:px-6">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-pink-100 dark:bg-pink-900/30 rounded-lg">
                <User className="w-4 h-4 md:w-5 md:h-5 text-pink-600" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-muted-foreground">{t("clients.title")}</p>
                <p className="text-lg md:text-2xl font-bold">{clients.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:pt-6 md:px-6">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <Crown className="w-4 h-4 md:w-5 md:h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-muted-foreground">{t("clients.vip")}</p>
                <p className="text-lg md:text-2xl font-bold">
                  {clients.filter((c) => c.loyaltyPoints >= 1000).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:pt-6 md:px-6">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Gift className="w-4 h-4 md:w-5 md:h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-muted-foreground">{t("clients.loyaltyPoints")}</p>
                <p className="text-lg md:text-2xl font-bold">
                  {clients.reduce((sum, c) => sum + c.loyaltyPoints, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:pt-6 md:px-6">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 bg-pink-100 dark:bg-pink-900/30 rounded-lg">
                <CalendarIcon className="w-4 h-4 md:w-5 md:h-5 text-pink-600" />
              </div>
              <div>
                <p className="text-xs md:text-sm text-muted-foreground">{t("clients.totalAppointments")}</p>
                <p className="text-lg md:text-2xl font-bold">
                  {clients.reduce((sum, c) => sum + c.totalVisits, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {lidClients.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-700 p-3">
          <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-orange-800 dark:text-orange-300">
              {lidClients.length} contact(s) avec numéro WhatsApp inconnu
            </p>
            <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
              WhatsApp utilise des identifiants internes pour ces contacts. Cliquez sur ✏️ à côté du nom et entrez le vrai numéro de téléphone.
            </p>
            <div className="flex flex-wrap gap-1 mt-2">
              {lidClients.slice(0, 8).map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleEdit(c)}
                  className="text-xs bg-orange-200 dark:bg-orange-800 text-orange-900 dark:text-orange-100 rounded px-2 py-0.5 hover:bg-orange-300 dark:hover:bg-orange-700 transition-colors"
                >
                  ✏️ {c.name}
                </button>
              ))}
              {lidClients.length > 8 && (
                <span className="text-xs text-orange-600 dark:text-orange-400 self-center">
                  +{lidClients.length - 8} autres
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("common.search") + "..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-search-clients"
          />
        </div>
      </div>

      {isMobile ? (
        <div className="space-y-2">
          {filteredClients.map((client) => {
            const tier = getLoyaltyTier(client.loyaltyPoints);
            const TierIcon = tier.icon;
            return (
              <Card
                key={client.id}
                className="cursor-pointer"
                onClick={() => handleViewDetails(client)}
                data-testid={`card-client-${client.id}`}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="p-1.5 bg-muted rounded-full shrink-0">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{client.name}</p>
                        {client.phone && (
                          isLidPhone(client.phone) ? (
                            <p className="text-xs text-orange-500 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> رقم مجهول
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground" dir="ltr">{client.phone}</p>
                          )
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end max-w-[50%]">
                      <Badge className={`${tier.color} text-white text-[10px] px-1.5 py-0.5`}>
                        <TierIcon className="w-2.5 h-2.5" />
                        {tier.name}
                      </Badge>
                      {parseClientTags((client as any).tags).map((tag) => {
                        const opt = TAG_OPTIONS.find((o) => o.label === tag);
                        return (
                          <span
                            key={tag}
                            className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium text-white", opt?.color ?? "bg-gray-500")}
                          >
                            {tag}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarIcon className="w-3 h-3" />
                        {client.totalVisits}
                      </span>
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3" />
                        {client.loyaltyPoints}
                      </span>
                      {Number(client.giftCardBalance ?? 0) > 0 && (
                        <span className="flex items-center gap-1 text-green-600">
                          <CreditCard className="w-3 h-3" />
                          {Number(client.giftCardBalance).toFixed(0)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-1 h-7 text-xs px-2"
                        onClick={(e) => handleQuickBook(client, e)}
                        data-testid={`button-quickbook-${client.id}`}
                      >
                        <Zap className="w-3 h-3" />
                        {t("clients.quickBook")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleEdit(client)}
                        data-testid={`button-edit-client-${client.id}`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => deleteMutation.mutate(client.id)}
                        data-testid={`button-delete-client-${client.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("clients.name")}</TableHead>
                  <TableHead>{t("clients.phone")}</TableHead>
                  <TableHead>{t("clients.email")}</TableHead>
                  <TableHead>{t("clients.totalAppointments")}</TableHead>
                  <TableHead>{t("clients.loyaltyPoints")}</TableHead>
                  <TableHead>{t("giftCard.balance", "Gift Card")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => {
                  const tier = getLoyaltyTier(client.loyaltyPoints);
                  const TierIcon = tier.icon;
                  return (
                    <TableRow
                      key={client.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleViewDetails(client)}
                      data-testid={`row-client-${client.id}`}
                    >
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell dir="ltr">
                        {isLidPhone(client.phone) ? (
                          <span className="flex items-center gap-1 text-orange-500 text-sm">
                            <AlertTriangle className="w-3.5 h-3.5" /> رقم مجهول
                          </span>
                        ) : (
                          client.phone || "-"
                        )}
                      </TableCell>
                      <TableCell dir="ltr">{client.email || "-"}</TableCell>
                      <TableCell>{client.totalVisits}</TableCell>
                      <TableCell>{client.loyaltyPoints}</TableCell>
                      <TableCell>
                        {Number(client.giftCardBalance ?? 0) > 0 ? (
                          <span className="text-green-600 font-medium">{Number(client.giftCardBalance ?? 0).toFixed(2)}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${tier.color} text-white`}>
                          <TierIcon className="w-3 h-3 ml-1" />
                          {tier.name}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap gap-1">
                          {TAG_OPTIONS.map((tag) => {
                            const clientTags = parseClientTags((client as any).tags);
                            const active = clientTags.includes(tag.label);
                            return (
                              <button
                                key={tag.label}
                                title={tag.label}
                                onClick={() => toggleTag(client, tag.label)}
                                className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-all border",
                                  active
                                    ? `${tag.color} text-white border-transparent`
                                    : "bg-muted text-muted-foreground border-border hover:bg-muted/70"
                                )}
                              >
                                {tag.label}
                              </button>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <Button
                            variant="default"
                            size="sm"
                            className="gap-1"
                            onClick={(e) => handleQuickBook(client, e)}
                            data-testid={`button-quickbook-${client.id}`}
                          >
                            <Zap className="w-3 h-3" />
                            {t("clients.quickBook")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(client)}
                            data-testid={`button-edit-client-${client.id}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(client.id)}
                            data-testid={`button-delete-client-${client.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("clients.editClient")}</DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <div className="space-y-4">
              {renderFormFields()}
              <Button 
                onClick={() => updateMutation.mutate({ id: selectedClient.id, data: formData })} 
                className="w-full"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? t("common.loading") : t("common.save")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isQuickBookOpen} onOpenChange={setIsQuickBookOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              {t("clients.quickBookTitle")}
            </DialogTitle>
          </DialogHeader>
          {quickBookClient && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{quickBookClient.name}</span>
                </div>
                {quickBookClient.phone && (
                  <div className="flex items-center gap-2 mt-1">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm" dir="ltr">{quickBookClient.phone}</span>
                  </div>
                )}
              </div>

              {frequentServices.length > 0 && (
                <div>
                  <Label className="text-sm font-medium mb-2 block">{t("clients.frequentServices")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {frequentServices.map((svc) => (
                      <Button
                        key={svc.name}
                        variant={quickBookData.serviceId === String(svc.serviceId) ? "default" : "outline"}
                        size="sm"
                        onClick={() => svc.serviceId && setQuickBookData({ ...quickBookData, serviceId: String(svc.serviceId) })}
                        disabled={!svc.serviceId}
                      >
                        {svc.name} ({svc.count}x)
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label>{t("clients.allServices")}</Label>
                <Select
                  value={quickBookData.serviceId}
                  onValueChange={(v) => setQuickBookData({ ...quickBookData, serviceId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("planning.selectService")} />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((svc) => (
                      <SelectItem key={svc.id} value={String(svc.id)}>
                        {svc.name} - {svc.price} {t("common.currency")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t("clients.selectStaff")}</Label>
                <Select
                  value={quickBookData.staffId}
                  onValueChange={(v) => setQuickBookData({ ...quickBookData, staffId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("clients.selectStaff")} />
                  </SelectTrigger>
                  <SelectContent>
                    {staffList.map((staff) => (
                      <SelectItem key={staff.id} value={String(staff.id)}>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: staff.color }} />
                          {staff.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("clients.selectDate")}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="w-4 h-4 mr-2" />
                        {format(quickBookData.date, "PPP", { locale: getDateLocale() })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={quickBookData.date}
                        onSelect={(d) => d && setQuickBookData({ ...quickBookData, date: d })}
                        locale={getDateLocale()}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <Label>{t("clients.selectTime")}</Label>
                  <Select
                    value={quickBookData.time}
                    onValueChange={(v) => setQuickBookData({ ...quickBookData, time: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("clients.selectTime")} />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_SLOTS.map((time) => (
                        <SelectItem key={time} value={time}>
                          <div className="flex items-center gap-2">
                            <Clock className="w-3 h-3" />
                            {time}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={handleSubmitQuickBook}
                className="w-full"
                disabled={!quickBookData.serviceId || !quickBookData.time || !quickBookData.staffId || quickBookMutation.isPending}
              >
                <Zap className="w-4 h-4 mr-2" />
                {quickBookMutation.isPending ? t("common.loading") : t("clients.bookNow")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailDialogOpen} onOpenChange={(open) => {
        setIsDetailDialogOpen(open);
        if (!open) {
          setGiftCardCode("");
          setFoundGiftCard(null);
          setRedeemAmount("");
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("clients.clientDetails")}</DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <Tabs defaultValue="info">
              <TabsList className="w-full">
                <TabsTrigger value="info" className="flex-1">{t("clients.clientDetails")}</TabsTrigger>
                <TabsTrigger value="history" className="flex-1">{t("clients.appointmentHistory")}</TabsTrigger>
                <TabsTrigger value="loyalty" className="flex-1">{t("clients.loyaltyPoints")}</TabsTrigger>
                <TabsTrigger value="giftcard" className="flex-1 gap-1">
                  <CreditCard className="h-3 w-3" />
                  {t("giftCard.title", "Gift Card")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="info" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedClient.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span dir="ltr">{selectedClient.phone || "-"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span dir="ltr">{selectedClient.email || "-"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedClient.birthday || "-"}</span>
                  </div>
                </div>
                {selectedClient.notes && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm">{selectedClient.notes}</p>
                  </div>
                )}
                <Button 
                  className="w-full gap-2" 
                  onClick={() => {
                    setIsDetailDialogOpen(false);
                    handleQuickBook(selectedClient, { stopPropagation: () => {} } as React.MouseEvent);
                  }}
                >
                  <Zap className="w-4 h-4" />
                  {t("clients.quickBook")}
                </Button>
              </TabsContent>
              <TabsContent value="history">
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {clientAppointments.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">{t("clients.noAppointments")}</p>
                  ) : (
                    clientAppointments.map((appt) => (
                      <div
                        key={appt.id}
                        className="flex justify-between items-center p-3 bg-muted rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{appt.service}</p>
                          <p className="text-sm text-muted-foreground">
                            {appt.date} - {appt.startTime}
                          </p>
                        </div>
                        <div className="text-left">
                          <p className="font-bold">{appt.total} {t("common.currency")}</p>
                          <Badge variant={appt.paid ? "default" : "destructive"}>
                            {appt.paid ? t("common.paid") : t("common.unpaid")}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
              <TabsContent value="loyalty">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-2xl font-bold text-primary">{selectedClient.loyaltyPoints}</p>
                      <p className="text-sm text-muted-foreground">{t("clients.loyaltyPoints")}</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-2xl font-bold">{selectedClient.totalVisits}</p>
                      <p className="text-sm text-muted-foreground">{t("clients.totalAppointments")}</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-2xl font-bold">{selectedClient.totalSpent} {t("common.currency")}</p>
                      <p className="text-sm text-muted-foreground">{t("clients.totalSpent")}</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className={`text-2xl font-bold ${Number(selectedClient.giftCardBalance ?? 0) > 0 ? 'text-green-600' : ''}`}>
                        {Number(selectedClient.giftCardBalance ?? 0).toFixed(2)} {t("common.currency")}
                      </p>
                      <p className="text-sm text-muted-foreground">{t("giftCard.balance", "Gift Card Balance")}</p>
                    </div>
                  </div>
                  
                  {selectedClient.loyaltyPoints > 0 && (
                    <div className={cn(
                      "p-4 rounded-lg border-2 transition-all cursor-pointer",
                      selectedClient.usePoints 
                        ? "border-green-500 bg-green-500/10" 
                        : "border-muted bg-muted/50"
                    )}
                      onClick={() => toggleUsePointsMutation.mutate({ clientId: selectedClient.id, usePoints: !selectedClient.usePoints })}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center",
                            selectedClient.usePoints ? "bg-green-500" : "bg-muted-foreground/30"
                          )}>
                            {selectedClient.usePoints ? <Check className="h-5 w-5 text-white" /> : <Zap className="h-5 w-5" />}
                          </div>
                          <div>
                            <p className="font-medium">{t("clients.usePointsForDiscount", "Use Points for Discount")}</p>
                            <p className="text-sm text-muted-foreground">
                              {selectedClient.usePoints 
                                ? t("clients.pointsWillBeApplied", "Points will be applied on next appointment") 
                                : t("clients.pointsSaved", "Points are being saved")}
                            </p>
                            <p className="text-xs text-primary mt-1">
                              {t("clients.availablePoints", "Available")}: {selectedClient.loyaltyPoints} {t("clients.points", "points")}
                            </p>
                          </div>
                        </div>
                        <Badge variant={selectedClient.usePoints ? "default" : "secondary"}>
                          {selectedClient.usePoints ? t("common.active", "Active") : t("common.inactive", "Inactive")}
                        </Badge>
                      </div>
                    </div>
                  )}

                  {Number(selectedClient.giftCardBalance ?? 0) > 0 && (
                    <div className={cn(
                      "p-4 rounded-lg border-2 transition-all cursor-pointer",
                      selectedClient.useGiftCardBalance 
                        ? "border-emerald-500 bg-emerald-500/10" 
                        : "border-muted bg-muted/50"
                    )}
                      onClick={() => toggleUseGiftCardBalanceMutation.mutate({ clientId: selectedClient.id, useGiftCardBalance: !selectedClient.useGiftCardBalance })}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center",
                            selectedClient.useGiftCardBalance ? "bg-emerald-500" : "bg-muted-foreground/30"
                          )}>
                            {selectedClient.useGiftCardBalance ? <Check className="h-5 w-5 text-white" /> : <CreditCard className="h-5 w-5" />}
                          </div>
                          <div>
                            <p className="font-medium">{t("giftCard.useBalanceForDiscount", "Use Gift Card Balance")}</p>
                            <p className="text-sm text-muted-foreground">
                              {t("giftCard.availableBalance", "Available")}: {Number(selectedClient.giftCardBalance ?? 0).toFixed(2)} {t("common.currency")}
                            </p>
                          </div>
                        </div>
                        <Badge variant={selectedClient.useGiftCardBalance ? "default" : "secondary"}>
                          {selectedClient.useGiftCardBalance ? t("common.active", "Active") : t("common.inactive", "Inactive")}
                        </Badge>
                      </div>
                    </div>
                  )}

                  <div className="p-4 bg-gradient-to-r from-primary/20 to-primary/10 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">{t("clients.loyaltyPoints")}</p>
                    <p className="text-sm">• 100 {t("clients.loyaltyPoints")} = 10 {t("common.currency")}</p>
                    <p className="text-sm">• 500 {t("clients.loyaltyPoints")} = Free Service</p>
                    <p className="text-sm">• 1000 {t("clients.loyaltyPoints")} = {t("clients.vip")}</p>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="giftcard">
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder={t("giftCard.enterCode", "Enter gift card code")}
                      value={giftCardCode}
                      onChange={(e) => setGiftCardCode(e.target.value.toUpperCase())}
                      className="flex-1"
                    />
                    <Button onClick={lookupGiftCard} className="gap-2">
                      <Search className="h-4 w-4" />
                      {t("giftCard.lookup", "Lookup")}
                    </Button>
                  </div>
                  
                  {foundGiftCard && (
                    <Card className="glass-card">
                      <CardContent className="pt-4 space-y-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm text-muted-foreground">{t("giftCard.code", "Code")}</p>
                            <p className="font-mono font-bold text-lg">{foundGiftCard.code}</p>
                          </div>
                          <Badge variant={foundGiftCard.isActive ? "default" : "secondary"}>
                            {foundGiftCard.isActive ? t("giftCard.active", "Active") : t("giftCard.inactive", "Inactive")}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-3 bg-muted rounded-lg text-center">
                            <p className="text-2xl font-bold text-green-600">{foundGiftCard.currentBalance} {t("common.currency")}</p>
                            <p className="text-xs text-muted-foreground">{t("giftCard.currentBalance", "Current Balance")}</p>
                          </div>
                          <div className="p-3 bg-muted rounded-lg text-center">
                            <p className="text-2xl font-bold">{foundGiftCard.initialBalance} {t("common.currency")}</p>
                            <p className="text-xs text-muted-foreground">{t("giftCard.initialBalance", "Initial Balance")}</p>
                          </div>
                        </div>

                        {foundGiftCard.recipientName && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">{t("giftCard.recipient", "Recipient")}: </span>
                            {foundGiftCard.recipientName}
                          </div>
                        )}

                        {foundGiftCard.expiresAt && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">{t("giftCard.expires", "Expires")}: </span>
                            {format(new Date(foundGiftCard.expiresAt), "PPP", { locale: getDateLocale() })}
                          </div>
                        )}

                        {foundGiftCard.isActive && foundGiftCard.currentBalance > 0 && (
                          <div className="pt-4 border-t space-y-3">
                            <Label>{t("giftCard.redeemAmount", "Amount to Redeem")} ({t("common.currency")})</Label>
                            <div className="flex gap-2">
                              <Input
                                type="number"
                                placeholder="0"
                                value={redeemAmount}
                                onChange={(e) => setRedeemAmount(e.target.value)}
                                max={foundGiftCard.currentBalance}
                                className="flex-1"
                              />
                              <Button 
                                onClick={handleRedeemGiftCard}
                                disabled={redeemGiftCardMutation.isPending}
                                className="gap-2"
                              >
                                <Check className="h-4 w-4" />
                                {t("giftCard.redeem", "Redeem")}
                              </Button>
                            </div>
                            <div className="flex gap-1 flex-wrap">
                              {[50, 100, 200].filter(v => v <= foundGiftCard.currentBalance).map(amount => (
                                <Button 
                                  key={amount}
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => setRedeemAmount(String(amount))}
                                >
                                  {amount} {t("common.currency")}
                                </Button>
                              ))}
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setRedeemAmount(String(foundGiftCard.currentBalance))}
                              >
                                {t("giftCard.useAll", "Use All")}
                              </Button>
                            </div>
                          </div>
                        )}

                        {foundGiftCard.currentBalance === 0 && (
                          <div className="p-3 bg-muted rounded-lg text-center text-muted-foreground">
                            {t("giftCard.empty", "This gift card has been fully used")}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {!foundGiftCard && (
                    <div className="p-8 text-center text-muted-foreground">
                      <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>{t("giftCard.enterCodeHint", "Enter a gift card code to look up its balance and redeem it")}</p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
