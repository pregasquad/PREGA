import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2, User, Phone, Mail, Gift, Calendar, Star, Crown, Award } from "lucide-react";
import type { Client, Appointment } from "@shared/schema";

export default function Clients() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    birthday: "",
    notes: "",
  });

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
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
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/clients/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: t("clients.clientDeleted") });
    },
  });

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

  const getLoyaltyTier = (points: number) => {
    if (points >= 1000) return { name: t("clients.vip"), color: "bg-yellow-500", icon: Crown };
    if (points >= 500) return { name: t("clients.gold"), color: "bg-amber-500", icon: Award };
    if (points >= 100) return { name: t("clients.silver"), color: "bg-gray-400", icon: Star };
    return { name: t("clients.bronze"), color: "bg-orange-600", icon: Star };
  };

  const filteredClients = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone?.includes(searchTerm) ||
      c.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const ClientForm = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="space-y-4">
      <div>
        <Label>{t("clients.name")} *</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder={t("clients.clientName")}
        />
      </div>
      <div>
        <Label>{t("clients.phone")}</Label>
        <Input
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          placeholder="0612345678"
          dir="ltr"
        />
      </div>
      <div>
        <Label>{t("clients.email")}</Label>
        <Input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="email@example.com"
          dir="ltr"
        />
      </div>
      <div>
        <Label>{t("clients.birthday")}</Label>
        <Input
          type="date"
          value={formData.birthday}
          onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
        />
      </div>
      <div>
        <Label>{t("clients.notes")}</Label>
        <Input
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder={t("clients.additionalNotes")}
        />
      </div>
      <Button onClick={onSubmit} className="w-full">
        {submitLabel}
      </Button>
    </div>
  );

  if (isLoading) {
    return <div className="p-6 text-center">{t("common.loading")}</div>;
  }

  return (
    <div className="p-6 space-y-6" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{t("clients.title")}</h1>
          <p className="text-muted-foreground">{t("clients.pageDesc")}</p>
        </div>
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
            <ClientForm
              onSubmit={() => createMutation.mutate(formData)}
              submitLabel={t("common.add")}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("clients.totalAppointments")}</p>
                <p className="text-2xl font-bold">{clients.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Crown className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("clients.vip")} {t("clients.title")}</p>
                <p className="text-2xl font-bold">
                  {clients.filter((c) => c.loyaltyPoints >= 1000).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Gift className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("clients.loyaltyPoints")}</p>
                <p className="text-2xl font-bold">
                  {clients.reduce((sum, c) => sum + c.loyaltyPoints, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Calendar className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("clients.totalAppointments")}</p>
                <p className="text-2xl font-bold">
                  {clients.reduce((sum, c) => sum + c.totalVisits, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>{t("clients.title")}</CardTitle>
            <Input
              placeholder={t("common.search") + "..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("clients.name")}</TableHead>
                <TableHead>{t("clients.phone")}</TableHead>
                <TableHead>{t("clients.email")}</TableHead>
                <TableHead>{t("clients.totalAppointments")}</TableHead>
                <TableHead>{t("clients.loyaltyPoints")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
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
                  >
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell dir="ltr">{client.phone || "-"}</TableCell>
                    <TableCell dir="ltr">{client.email || "-"}</TableCell>
                    <TableCell>{client.totalVisits}</TableCell>
                    <TableCell>{client.loyaltyPoints}</TableCell>
                    <TableCell>
                      <Badge className={`${tier.color} text-white`}>
                        <TierIcon className="w-3 h-3 ml-1" />
                        {tier.name}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(client)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(client.id)}
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

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("clients.editClient")}</DialogTitle>
          </DialogHeader>
          <ClientForm
            onSubmit={() =>
              selectedClient && updateMutation.mutate({ id: selectedClient.id, data: formData })
            }
            submitLabel={t("common.save")}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("clients.clientDetails")}</DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <Tabs defaultValue="info">
              <TabsList className="w-full">
                <TabsTrigger value="info" className="flex-1">{t("clients.clientDetails")}</TabsTrigger>
                <TabsTrigger value="history" className="flex-1">{t("clients.appointmentHistory")}</TabsTrigger>
                <TabsTrigger value="loyalty" className="flex-1">{t("clients.loyaltyPoints")}</TabsTrigger>
              </TabsList>
              <TabsContent value="info" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                  <div className="grid grid-cols-3 gap-4 text-center">
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
                  </div>
                  <div className="p-4 bg-gradient-to-r from-primary/20 to-primary/10 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">{t("clients.loyaltyPoints")}</p>
                    <p className="text-sm">• 100 {t("clients.loyaltyPoints")} = 10 {t("common.currency")}</p>
                    <p className="text-sm">• 500 {t("clients.loyaltyPoints")} = Free Service</p>
                    <p className="text-sm">• 1000 {t("clients.loyaltyPoints")} = {t("clients.vip")}</p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
