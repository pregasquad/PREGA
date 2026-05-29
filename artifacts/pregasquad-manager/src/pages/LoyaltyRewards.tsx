import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { io } from "socket.io-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Gift, Settings, Users, Trophy, Star, Copy, Plus, X, Check, Search, Minus, Edit2, Trash2, MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface BusinessSettings {
  id?: number;
  loyaltyEnabled?: boolean;
  loyaltyPointsPerDh?: number;
  loyaltyPointsValue?: number;
  referralBonusPoints?: number;
  referralBonusReferee?: number;
}

interface GiftCard {
  id: number;
  code: string;
  initialAmount: number;
  currentBalance: number;
  recipientName?: string;
  recipientPhone?: string;
  isActive: boolean;
  expiresAt?: string;
  createdAt: string;
}

interface Referral {
  id: number;
  referrerId: number;
  refereeId: number;
  status: 'pending' | 'completed';
  referrerPointsAwarded: number;
  refereePointsAwarded: number;
  createdAt: string;
}

interface Client {
  id: number;
  name: string;
  phone?: string;
  loyaltyPoints: number;
  loyaltyEnrolled: boolean;
  totalVisits: number;
  totalSpent: number;
}

export default function LoyaltyRewards() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("settings");
  
  const [loyaltySettings, setLoyaltySettings] = useState<BusinessSettings>({
    loyaltyEnabled: true,
    loyaltyPointsPerDh: 1,
    loyaltyPointsValue: 0.1,
    referralBonusPoints: 100,
    referralBonusReferee: 50,
  });

  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [pointsToAdd, setPointsToAdd] = useState<number>(0);
  const [clientSearch, setClientSearch] = useState("");
  const [editPointsOpen, setEditPointsOpen] = useState(false);
  const [editPointsValue, setEditPointsValue] = useState<number>(0);
  const [editingGiftCard, setEditingGiftCard] = useState<GiftCard | null>(null);
  const [editGiftCardData, setEditGiftCardData] = useState({
    initialAmount: 0,
    currentBalance: 0,
    recipientName: "",
    recipientPhone: "",
  });
  const [newGiftCard, setNewGiftCard] = useState({
    initialAmount: 100,
    recipientName: "",
    recipientPhone: "",
    expiresAt: "",
  });

  const { data: businessSettings } = useQuery<BusinessSettings>({
    queryKey: ["/api/business-settings"],
  });

  const { data: giftCards = [], isLoading: giftCardsLoading } = useQuery<GiftCard[]>({
    queryKey: ["/api/gift-cards"],
    queryFn: async () => {
      const res = await fetch("/api/gift-cards");
      if (!res.ok) throw new Error("Failed to fetch gift cards");
      return res.json();
    },
  });

  const { data: referrals = [], isLoading: referralsLoading } = useQuery<Referral[]>({
    queryKey: ["/api/referrals"],
    queryFn: async () => {
      const res = await fetch("/api/referrals");
      if (!res.ok) throw new Error("Failed to fetch referrals");
      return res.json();
    },
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
  });

  useEffect(() => {
    if (businessSettings) {
      setLoyaltySettings({
        loyaltyEnabled: businessSettings.loyaltyEnabled ?? true,
        loyaltyPointsPerDh: businessSettings.loyaltyPointsPerDh ?? 1,
        loyaltyPointsValue: businessSettings.loyaltyPointsValue ?? 0.1,
        referralBonusPoints: businessSettings.referralBonusPoints ?? 100,
        referralBonusReferee: businessSettings.referralBonusReferee ?? 50,
      });
    }
  }, [businessSettings]);

  // Listen for real-time loyalty points updates
  useEffect(() => {
    const socket = io();
    
    socket.on("client:loyaltyUpdated", (data: { clientId: number; clientName: string; pointsAdded: number; newTotal: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({
        title: t("loyalty.pointsAwarded", { defaultValue: "Points attribués" }),
        description: t("loyalty.pointsAwardedDesc", { 
          defaultValue: `${data.pointsAdded} points ajoutés à ${data.clientName}`,
          points: data.pointsAdded,
          name: data.clientName
        }),
      });
    });

    return () => {
      socket.off("client:loyaltyUpdated");
      socket.disconnect();
    };
  }, [queryClient, toast, t]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: Partial<BusinessSettings>) => {
      return apiRequest("PATCH", "/api/business-settings", settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-settings"] });
      toast({
        title: t("common.success"),
        description: t("loyalty.settingsSaved"),
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("loyalty.settingsError"),
        variant: "destructive",
      });
    },
  });

  const toggleGiftCardMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/gift-cards/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gift-cards"] });
      toast({
        title: t("common.success"),
        description: t("loyalty.giftCardUpdated"),
      });
    },
  });

  const createGiftCardMutation = useMutation({
    mutationFn: async (data: typeof newGiftCard) => {
      return apiRequest("POST", "/api/gift-cards", {
        ...data,
        initialAmount: Number(data.initialAmount),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gift-cards"] });
      setNewGiftCard({ initialAmount: 100, recipientName: "", recipientPhone: "", expiresAt: "" });
      toast({
        title: t("common.success"),
        description: t("loyalty.giftCardCreated"),
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("loyalty.giftCardError"),
        variant: "destructive",
      });
    },
  });

  const editGiftCardMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof editGiftCardData }) => {
      return apiRequest("PATCH", `/api/gift-cards/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gift-cards"] });
      setEditingGiftCard(null);
      toast({
        title: t("common.success"),
        description: t("loyalty.giftCardUpdated"),
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("loyalty.giftCardError"),
        variant: "destructive",
      });
    },
  });

  const deleteGiftCardMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/gift-cards/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gift-cards"] });
      toast({
        title: t("common.success"),
        description: t("loyalty.giftCardDeleted"),
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("loyalty.giftCardError"),
        variant: "destructive",
      });
    },
  });

  const sendGiftCardWhatsAppMutation = useMutation({
    mutationFn: async (card: GiftCard) => {
      return apiRequest("POST", "/api/notifications/gift-card", {
        recipientPhone: card.recipientPhone,
        recipientName: card.recipientName,
        giftCardCode: card.code,
        amount: card.currentBalance,
      });
    },
    onSuccess: () => {
      toast({
        title: t("common.success"),
        description: t("loyalty.giftCardWhatsAppSent", { defaultValue: "WhatsApp notification sent!" }),
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("loyalty.giftCardWhatsAppError", { defaultValue: "Failed to send WhatsApp notification" }),
        variant: "destructive",
      });
    },
  });

  const updateClientPointsMutation = useMutation({
    mutationFn: async ({ clientId, points }: { clientId: number; points: number }) => {
      return apiRequest("PATCH", `/api/clients/${clientId}`, { loyaltyPoints: points });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setPointsToAdd(0);
      toast({
        title: t("common.success"),
        description: t("loyalty.pointsUpdated"),
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("loyalty.pointsError"),
        variant: "destructive",
      });
    },
  });

  const selectedClient = clients.find(c => c.id.toString() === selectedClientId);
  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.phone && c.phone.includes(clientSearch))
  );

  const handleAddPoints = () => {
    if (selectedClient && pointsToAdd !== 0) {
      const newPoints = Math.max(0, selectedClient.loyaltyPoints + pointsToAdd);
      updateClientPointsMutation.mutate({ clientId: selectedClient.id, points: newPoints });
    }
  };

  const handleEditPoints = () => {
    if (selectedClient) {
      setEditPointsValue(selectedClient.loyaltyPoints);
      setEditPointsOpen(true);
    }
  };

  const handleSaveEditedPoints = () => {
    if (selectedClient) {
      const newPoints = Math.max(0, editPointsValue);
      updateClientPointsMutation.mutate({ clientId: selectedClient.id, points: newPoints });
      setEditPointsOpen(false);
    }
  };

  const toggleEnrollmentMutation = useMutation({
    mutationFn: async ({ clientId, enrolled }: { clientId: number; enrolled: boolean }) => {
      return apiRequest("PATCH", `/api/clients/${clientId}`, { loyaltyEnrolled: enrolled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({
        title: t("common.success"),
        description: t("loyalty.enrollmentUpdated"),
      });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("loyalty.enrollmentError"),
        variant: "destructive",
      });
    },
  });

  const enrolledClients = clients.filter(c => c.loyaltyEnrolled);
  const unenrolledClients = clients.filter(c => !c.loyaltyEnrolled);

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate(loyaltySettings);
  };

  const handleCreateGiftCard = (e: React.FormEvent) => {
    e.preventDefault();
    createGiftCardMutation.mutate(newGiftCard);
  };

  const handleEditGiftCard = (card: GiftCard) => {
    setEditingGiftCard(card);
    setEditGiftCardData({
      initialAmount: card.initialAmount,
      currentBalance: card.currentBalance,
      recipientName: card.recipientName || "",
      recipientPhone: card.recipientPhone || "",
    });
  };

  const handleSaveGiftCard = () => {
    if (editingGiftCard) {
      editGiftCardMutation.mutate({
        id: editingGiftCard.id,
        data: editGiftCardData,
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t("common.success"),
      description: t("loyalty.codeCopied"),
    });
  };

  const topClients = [...clients]
    .filter((c) => c.loyaltyPoints > 0)
    .sort((a, b) => b.loyaltyPoints - a.loyaltyPoints)
    .slice(0, 10);

  const totalReferrals = referrals.length;
  const completedReferrals = referrals.filter((r) => r.status === "completed").length;
  const totalPointsAwarded = referrals.reduce(
    (sum, r) => sum + r.referrerPointsAwarded + r.refereePointsAwarded,
    0
  );

  return (
    <div className={cn("space-y-6", isRtl && "rtl")} dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Gift className="w-7 h-7 text-primary" />
            {t("loyalty.title")}
          </h1>
          <p className="text-muted-foreground">{t("loyalty.description")}</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 lg:w-[750px]">
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">{t("loyalty.settings")}</span>
          </TabsTrigger>
          <TabsTrigger value="clients" className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">{t("loyalty.clients")}</span>
          </TabsTrigger>
          <TabsTrigger value="gift-cards" className="flex items-center gap-2">
            <Gift className="w-4 h-4" />
            <span className="hidden sm:inline">{t("loyalty.giftCards")}</span>
          </TabsTrigger>
          <TabsTrigger value="referrals" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">{t("loyalty.referrals")}</span>
          </TabsTrigger>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            <span className="hidden sm:inline">{t("loyalty.overview")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                {t("loyalty.loyaltySettings")}
              </CardTitle>
              <CardDescription>{t("loyalty.loyaltySettingsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <Label className="text-base font-medium">{t("loyalty.enableProgram")}</Label>
                  <p className="text-sm text-muted-foreground">{t("loyalty.enableProgramDesc")}</p>
                </div>
                <Switch
                  checked={loyaltySettings.loyaltyEnabled}
                  onCheckedChange={(checked) =>
                    setLoyaltySettings({ ...loyaltySettings, loyaltyEnabled: checked })
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pointsPerDh">{t("loyalty.pointsPerDh")}</Label>
                  <Input
                    id="pointsPerDh"
                    type="number"
                    min="0"
                    step="0.1"
                    value={loyaltySettings.loyaltyPointsPerDh}
                    onChange={(e) =>
                      setLoyaltySettings({
                        ...loyaltySettings,
                        loyaltyPointsPerDh: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">{t("loyalty.pointsPerDhDesc")}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pointsValue">{t("loyalty.pointsValue")}</Label>
                  <Input
                    id="pointsValue"
                    type="number"
                    min="0"
                    step="0.01"
                    value={loyaltySettings.loyaltyPointsValue}
                    onChange={(e) =>
                      setLoyaltySettings({
                        ...loyaltySettings,
                        loyaltyPointsValue: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">{t("loyalty.pointsValueDesc")}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  {t("loyalty.referralBonuses")}
                </h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="referrerBonus">{t("loyalty.referrerBonus")}</Label>
                    <Input
                      id="referrerBonus"
                      type="number"
                      min="0"
                      value={loyaltySettings.referralBonusPoints}
                      onChange={(e) =>
                        setLoyaltySettings({
                          ...loyaltySettings,
                          referralBonusPoints: parseInt(e.target.value) || 0,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">{t("loyalty.referrerBonusDesc")}</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="refereeBonus">{t("loyalty.refereeBonus")}</Label>
                    <Input
                      id="refereeBonus"
                      type="number"
                      min="0"
                      value={loyaltySettings.referralBonusReferee}
                      onChange={(e) =>
                        setLoyaltySettings({
                          ...loyaltySettings,
                          referralBonusReferee: parseInt(e.target.value) || 0,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">{t("loyalty.refereeBonusDesc")}</p>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleSaveSettings}
                disabled={updateSettingsMutation.isPending}
                className="w-full md:w-auto"
              >
                {updateSettingsMutation.isPending ? t("common.loading") : t("common.save")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clients" className="space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                {t("loyalty.manageClientPoints")}
              </CardTitle>
              <CardDescription>{t("loyalty.manageClientPointsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>{t("loyalty.selectClient")}</Label>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("loyalty.searchClient")} />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="p-2">
                      <Input
                        placeholder={t("loyalty.searchByNameOrPhone")}
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        className="mb-2"
                      />
                    </div>
                    {filteredClients.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground text-sm">
                        {t("loyalty.noClientsFound")}
                      </div>
                    ) : (
                      filteredClients.slice(0, 50).map((client) => (
                        <SelectItem key={client.id} value={client.id.toString()}>
                          <div className="flex items-center justify-between w-full gap-4">
                            <span>{client.name}</span>
                            <div className="flex items-center gap-2">
                              {client.loyaltyEnrolled ? (
                                <Badge variant="default" className="bg-green-500/20 text-green-600">
                                  {t("loyalty.enrolled")}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">
                                  {t("loyalty.notEnrolled")}
                                </Badge>
                              )}
                              <Badge variant="secondary">
                                {client.loyaltyPoints} pts
                              </Badge>
                            </div>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedClient && (
                <Card className="bg-muted/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">{selectedClient.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {selectedClient.phone || t("loyalty.noPhone")}
                        </p>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        <div>
                          <p className="text-3xl font-bold text-primary">{selectedClient.loyaltyPoints}</p>
                          <p className="text-sm text-muted-foreground">{t("loyalty.currentPoints")}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleEditPoints}
                          title={t("loyalty.editPoints", { defaultValue: "Modifier les points" })}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg bg-background mb-6">
                      <div className="space-y-0.5">
                        <Label htmlFor="loyalty-enrolled" className="text-base font-medium">
                          {t("loyalty.enrolledInProgram")}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {t("loyalty.enrolledDesc")}
                        </p>
                      </div>
                      <Switch
                        id="loyalty-enrolled"
                        checked={selectedClient.loyaltyEnrolled}
                        onCheckedChange={(checked) => {
                          toggleEnrollmentMutation.mutate({ 
                            clientId: selectedClient.id, 
                            enrolled: checked 
                          });
                        }}
                        disabled={toggleEnrollmentMutation.isPending}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="p-3 rounded-lg bg-background">
                        <p className="text-sm text-muted-foreground">{t("loyalty.totalVisits")}</p>
                        <p className="text-xl font-semibold">{selectedClient.totalVisits}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-background">
                        <p className="text-sm text-muted-foreground">{t("loyalty.totalSpent")}</p>
                        <p className="text-xl font-semibold">{selectedClient.totalSpent} DH</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <Label>{t("loyalty.adjustPoints")}</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setPointsToAdd(prev => prev - 10)}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <Input
                          type="number"
                          value={pointsToAdd}
                          onChange={(e) => setPointsToAdd(parseInt(e.target.value) || 0)}
                          className="w-24 text-center"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setPointsToAdd(prev => prev + 10)}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t("loyalty.newBalance")}: {Math.max(0, selectedClient.loyaltyPoints + pointsToAdd)} {t("loyalty.points")}
                      </p>
                      <Button
                        onClick={handleAddPoints}
                        disabled={pointsToAdd === 0 || updateClientPointsMutation.isPending}
                        className="w-full"
                      >
                        {updateClientPointsMutation.isPending ? (
                          t("common.saving")
                        ) : pointsToAdd > 0 ? (
                          <>
                            <Plus className="w-4 h-4 mr-2" />
                            {t("loyalty.addPoints", { points: pointsToAdd })}
                          </>
                        ) : pointsToAdd < 0 ? (
                          <>
                            <Minus className="w-4 h-4 mr-2" />
                            {t("loyalty.removePoints", { points: Math.abs(pointsToAdd) })}
                          </>
                        ) : (
                          t("loyalty.noChanges")
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gift-cards" className="space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5" />
                {t("loyalty.createGiftCard")}
              </CardTitle>
              <CardDescription>
                {t("loyalty.createGiftCardDesc", "Create a new gift card with a unique code")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateGiftCard} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="gc-amount">{t("loyalty.amount")}</Label>
                    <Input
                      id="gc-amount"
                      type="number"
                      min="1"
                      value={newGiftCard.initialAmount}
                      onChange={(e) => setNewGiftCard({ ...newGiftCard, initialAmount: parseInt(e.target.value) || 0 })}
                      placeholder="100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gc-recipient">{t("loyalty.recipientName")}</Label>
                    <Input
                      id="gc-recipient"
                      value={newGiftCard.recipientName}
                      onChange={(e) => setNewGiftCard({ ...newGiftCard, recipientName: e.target.value })}
                      placeholder={t("loyalty.recipientNamePlaceholder", "Optional")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gc-phone">{t("loyalty.recipientPhone")}</Label>
                    <Input
                      id="gc-phone"
                      value={newGiftCard.recipientPhone}
                      onChange={(e) => setNewGiftCard({ ...newGiftCard, recipientPhone: e.target.value })}
                      placeholder={t("loyalty.recipientPhonePlaceholder", "Optional")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gc-expires">{t("loyalty.expiresAt", "Expires At")}</Label>
                    <Input
                      id="gc-expires"
                      type="date"
                      value={newGiftCard.expiresAt}
                      onChange={(e) => setNewGiftCard({ ...newGiftCard, expiresAt: e.target.value })}
                    />
                  </div>
                </div>
                <Button type="submit" disabled={createGiftCardMutation.isPending || newGiftCard.initialAmount <= 0}>
                  <Plus className="w-4 h-4 mr-2" />
                  {createGiftCardMutation.isPending ? t("common.loading") : t("loyalty.createGiftCard")}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="w-5 h-5" />
                {t("loyalty.allGiftCards")}
              </CardTitle>
              <CardDescription>
                {giftCards.length} {t("loyalty.giftCardsTotal")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {giftCardsLoading ? (
                <div className="text-center py-8 text-muted-foreground">{t("common.loading")}</div>
              ) : giftCards.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">{t("loyalty.noGiftCards")}</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("loyalty.code")}</TableHead>
                        <TableHead>{t("loyalty.initialBalance")}</TableHead>
                        <TableHead>{t("loyalty.currentBalance")}</TableHead>
                        <TableHead>{t("loyalty.recipient")}</TableHead>
                        <TableHead>{t("common.status")}</TableHead>
                        <TableHead>{t("loyalty.created")}</TableHead>
                        <TableHead>{t("common.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {giftCards.map((card) => (
                        <TableRow key={card.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <code className="font-mono text-sm bg-muted px-2 py-1 rounded">
                                {card.code}
                              </code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => copyToClipboard(card.code)}
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>{card.initialAmount} DH</TableCell>
                          <TableCell className={card.currentBalance < card.initialAmount ? "text-sky-500" : ""}>
                            {card.currentBalance} DH
                          </TableCell>
                          <TableCell>
                            {card.recipientName || "-"}
                            {card.recipientPhone && (
                              <span className="block text-xs text-muted-foreground">{card.recipientPhone}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={card.isActive ? "default" : "secondary"}>
                              {card.isActive ? t("loyalty.active") : t("loyalty.inactive")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(card.createdAt), "dd/MM/yyyy")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {card.recipientPhone && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-green-600 hover:text-green-700"
                                  onClick={() => sendGiftCardWhatsAppMutation.mutate(card)}
                                  disabled={sendGiftCardWhatsAppMutation.isPending}
                                  title={t("loyalty.sendWhatsApp", { defaultValue: "Send WhatsApp" })}
                                >
                                  <MessageSquare className="w-3 h-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditGiftCard(card)}
                              >
                                <Edit2 className="w-3 h-3" />
                              </Button>
                              <Button
                                variant={card.isActive ? "destructive" : "default"}
                                size="sm"
                                onClick={() =>
                                  toggleGiftCardMutation.mutate({
                                    id: card.id,
                                    isActive: !card.isActive,
                                  })
                                }
                                disabled={toggleGiftCardMutation.isPending}
                              >
                                {card.isActive ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (confirm(t("loyalty.confirmDeleteGiftCard"))) {
                                    deleteGiftCardMutation.mutate(card.id);
                                  }
                                }}
                                disabled={deleteGiftCardMutation.isPending}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="referrals" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="glass-card">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-primary/10">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{totalReferrals}</p>
                    <p className="text-sm text-muted-foreground">{t("loyalty.totalReferrals")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-green-500/10">
                    <Check className="w-6 h-6 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{completedReferrals}</p>
                    <p className="text-sm text-muted-foreground">{t("loyalty.completedReferrals")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-pink-500/10">
                    <Star className="w-6 h-6 text-pink-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{totalPointsAwarded}</p>
                    <p className="text-sm text-muted-foreground">{t("loyalty.pointsAwarded")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                {t("loyalty.referralsList")}
              </CardTitle>
              <CardDescription>{t("loyalty.referralsListDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {referralsLoading ? (
                <div className="text-center py-8 text-muted-foreground">{t("common.loading")}</div>
              ) : referrals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">{t("loyalty.noReferrals")}</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("loyalty.referrer")}</TableHead>
                        <TableHead>{t("loyalty.referee")}</TableHead>
                        <TableHead>{t("common.status")}</TableHead>
                        <TableHead>{t("loyalty.pointsAwarded")}</TableHead>
                        <TableHead>{t("common.date")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {referrals.map((referral) => {
                        const referrer = clients.find((c) => c.id === referral.referrerId);
                        const referee = clients.find((c) => c.id === referral.refereeId);
                        return (
                          <TableRow key={referral.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{referrer?.name || `#${referral.referrerId}`}</p>
                                <p className="text-xs text-muted-foreground">
                                  {t("loyalty.referralCode")}: REF{referral.referrerId}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>{referee?.name || `#${referral.refereeId}`}</TableCell>
                            <TableCell>
                              <Badge variant={referral.status === "completed" ? "default" : "secondary"}>
                                {referral.status === "completed" ? t("loyalty.completed") : t("loyalty.pending")}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {referral.referrerPointsAwarded + referral.refereePointsAwarded} pts
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(referral.createdAt), "dd/MM/yyyy")}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Copy className="w-5 h-5" />
                {t("loyalty.clientReferralCodes")}
              </CardTitle>
              <CardDescription>{t("loyalty.clientReferralCodesDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {clients.slice(0, 9).map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div>
                      <p className="font-medium text-sm">{client.name}</p>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">REF{client.id}</code>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => copyToClipboard(`REF${client.id}`)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overview" className="space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5" />
                {t("loyalty.topClients")}
              </CardTitle>
              <CardDescription>{t("loyalty.topClientsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {topClients.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">{t("loyalty.noLoyaltyData")}</div>
              ) : (
                <div className="space-y-3">
                  {topClients.map((client, index) => (
                    <div
                      key={client.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
                            index === 0 && "bg-yellow-500/20 text-yellow-600",
                            index === 1 && "bg-gray-400/20 text-gray-600",
                            index === 2 && "bg-pink-500/20 text-pink-600",
                            index > 2 && "bg-muted text-muted-foreground"
                          )}
                        >
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium">{client.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {client.totalVisits} {t("loyalty.visits")} · {client.totalSpent} DH {t("loyalty.spent")}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary">{client.loyaltyPoints}</p>
                        <p className="text-xs text-muted-foreground">{t("loyalty.points")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Points Dialog */}
      <Dialog open={editPointsOpen} onOpenChange={setEditPointsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("loyalty.editPoints", { defaultValue: "Modifier les points" })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-points">{t("loyalty.newPointsValue", { defaultValue: "Nouvelle valeur des points" })}</Label>
              <Input
                id="edit-points"
                type="number"
                min="0"
                value={editPointsValue}
                onChange={(e) => setEditPointsValue(parseInt(e.target.value) || 0)}
              />
            </div>
            {selectedClient && (
              <p className="text-sm text-muted-foreground">
                {t("loyalty.currentPointsLabel", { defaultValue: "Points actuels" })}: {selectedClient.loyaltyPoints}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPointsOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveEditedPoints} disabled={updateClientPointsMutation.isPending}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Gift Card Dialog */}
      <Dialog open={!!editingGiftCard} onOpenChange={(open) => !open && setEditingGiftCard(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("loyalty.editGiftCard", { defaultValue: "Edit Gift Card" })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="initial-amount">{t("loyalty.initialBalance")}</Label>
              <Input
                id="initial-amount"
                type="number"
                min="0"
                value={editGiftCardData.initialAmount}
                onChange={(e) => setEditGiftCardData({ ...editGiftCardData, initialAmount: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="current-balance">{t("loyalty.currentBalance")}</Label>
              <Input
                id="current-balance"
                type="number"
                min="0"
                value={editGiftCardData.currentBalance}
                onChange={(e) => setEditGiftCardData({ ...editGiftCardData, currentBalance: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipient-name">{t("loyalty.recipientName", { defaultValue: "Recipient Name" })}</Label>
              <Input
                id="recipient-name"
                value={editGiftCardData.recipientName}
                onChange={(e) => setEditGiftCardData({ ...editGiftCardData, recipientName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipient-phone">{t("loyalty.recipientPhone", { defaultValue: "Recipient Phone" })}</Label>
              <Input
                id="recipient-phone"
                value={editGiftCardData.recipientPhone}
                onChange={(e) => setEditGiftCardData({ ...editGiftCardData, recipientPhone: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingGiftCard(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveGiftCard} disabled={editGiftCardMutation.isPending}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
