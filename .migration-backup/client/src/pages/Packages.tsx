import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Edit2, Package, Percent, Calendar, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import type { Service } from "@shared/schema";

interface PackageData {
  id: number;
  name: string;
  description: string | null;
  services: number[];
  originalPrice: number;
  discountedPrice: number;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  maxUsesPerClient: number;
  createdAt: string;
}

interface PackagePurchase {
  id: number;
  packageId: number;
  clientId: number;
  appointmentId: number | null;
  purchaseDate: string;
  usedCount: number;
  maxUses: number;
  status: string;
  createdAt: string;
}

export default function Packages() {
  const { t } = useTranslation();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<PackageData | null>(null);
  const [selectedServices, setSelectedServices] = useState<number[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    originalPrice: 0,
    discountedPrice: 0,
    validFrom: "",
    validUntil: "",
    isActive: true,
    maxUsesPerClient: 1,
  });

  const { data: packages = [] } = useQuery<PackageData[]>({
    queryKey: ["/api/packages"],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: purchases = [] } = useQuery<PackagePurchase[]>({
    queryKey: ["/api/package-purchases"],
  });

  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ["/api/clients"],
  });

  const createPackage = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/packages", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/packages"] });
      resetForm();
    }
  });

  const updatePackage = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/packages/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/packages"] });
      resetForm();
    }
  });

  const deletePackage = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/packages/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/packages"] });
    }
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      originalPrice: 0,
      discountedPrice: 0,
      validFrom: "",
      validUntil: "",
      isActive: true,
      maxUsesPerClient: 1,
    });
    setSelectedServices([]);
    setEditingPackage(null);
    setIsFormOpen(false);
  };

  const handleEdit = (pkg: PackageData) => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name,
      description: pkg.description || "",
      originalPrice: pkg.originalPrice,
      discountedPrice: pkg.discountedPrice,
      validFrom: pkg.validFrom || "",
      validUntil: pkg.validUntil || "",
      isActive: pkg.isActive,
      maxUsesPerClient: pkg.maxUsesPerClient,
    });
    setSelectedServices(pkg.services || []);
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...formData,
      services: selectedServices,
      validFrom: formData.validFrom || null,
      validUntil: formData.validUntil || null,
    };

    if (editingPackage) {
      updatePackage.mutate({ id: editingPackage.id, data });
    } else {
      createPackage.mutate(data);
    }
  };

  const toggleService = (serviceId: number) => {
    setSelectedServices(prev => 
      prev.includes(serviceId) 
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const calculateOriginalPrice = () => {
    return selectedServices.reduce((sum, id) => {
      const service = services.find(s => s.id === id);
      return sum + (service?.price || 0);
    }, 0);
  };

  const getSavingsPercent = (original: number, discounted: number) => {
    if (original <= 0) return 0;
    return Math.round(((original - discounted) / original) * 100);
  };

  const getServiceNames = (serviceIds: number[]) => {
    return serviceIds.map(id => {
      const service = services.find(s => s.id === id);
      return service?.name || "Unknown";
    }).join(", ");
  };

  const getPurchaseCount = (packageId: number) => {
    return purchases.filter(p => p.packageId === packageId).length;
  };

  const getClientName = (clientId: number) => {
    const client = clients.find(c => c.id === clientId);
    return client?.name || "Unknown";
  };

  const activePackages = packages.filter(p => p.isActive);
  const inactivePackages = packages.filter(p => !p.isActive);

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" />
            {t("packages.title")}
          </h1>
          <p className="text-muted-foreground">{t("packages.description")}</p>
        </div>
        <Dialog open={isFormOpen} onOpenChange={(open) => {
          if (!open) resetForm();
          setIsFormOpen(open);
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              {t("packages.createPackage")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingPackage ? t("packages.editPackage") : t("packages.createPackage")}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="name">{t("common.name")}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="description">{t("common.description")}</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label className="mb-2 block">{t("packages.selectServices")}</Label>
                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2 bg-background/50 backdrop-blur-sm">
                  {services.map((service) => (
                    <div key={service.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`service-${service.id}`}
                        checked={selectedServices.includes(service.id)}
                        onCheckedChange={() => toggleService(service.id)}
                      />
                      <label
                        htmlFor={`service-${service.id}`}
                        className="flex-1 flex justify-between cursor-pointer text-sm"
                      >
                        <span>{service.name}</span>
                        <span className="text-muted-foreground">{service.isStartingPrice ? `${t("services.startingFrom")} ` : ''}{service.price} {t("common.currency")}</span>
                      </label>
                    </div>
                  ))}
                </div>
                {selectedServices.length > 0 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {t("packages.totalServices")}: {selectedServices.length} | 
                    {t("packages.originalValue")}: {calculateOriginalPrice()} {t("common.currency")}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="originalPrice">{t("packages.originalPrice")}</Label>
                  <Input
                    id="originalPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.originalPrice}
                    onChange={(e) => setFormData({ ...formData, originalPrice: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="discountedPrice">{t("packages.discountedPrice")}</Label>
                  <Input
                    id="discountedPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.discountedPrice}
                    onChange={(e) => setFormData({ ...formData, discountedPrice: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>
              </div>

              {formData.originalPrice > 0 && formData.discountedPrice > 0 && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 flex items-center gap-2">
                  <Percent className="h-5 w-5 text-green-600" />
                  <span className="font-semibold text-green-600">
                    {t("packages.savings")}: {getSavingsPercent(formData.originalPrice, formData.discountedPrice)}%
                    ({formData.originalPrice - formData.discountedPrice} {t("common.currency")})
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="validFrom">{t("packages.validFrom")}</Label>
                  <Input
                    id="validFrom"
                    type="date"
                    value={formData.validFrom}
                    onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="validUntil">{t("packages.validUntil")}</Label>
                  <Input
                    id="validUntil"
                    type="date"
                    value={formData.validUntil}
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="maxUses">{t("packages.maxUsesPerClient")}</Label>
                  <Input
                    id="maxUses"
                    type="number"
                    min="1"
                    value={formData.maxUsesPerClient}
                    onChange={(e) => setFormData({ ...formData, maxUsesPerClient: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  />
                  <Label htmlFor="isActive">{t("packages.active")}</Label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={resetForm}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={createPackage.isPending || updatePackage.isPending}>
                  {editingPackage ? t("common.save") : t("packages.createPackage")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Badge variant="default" className="bg-green-600">{activePackages.length}</Badge>
            {t("packages.activePackages")}
          </h2>
          {activePackages.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="pt-6 text-center text-muted-foreground">
                {t("packages.noActivePackages")}
              </CardContent>
            </Card>
          ) : (
            activePackages.map((pkg) => (
              <Card key={pkg.id} className="bg-background/60 backdrop-blur-sm border-border/50 hover:border-primary/30 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{pkg.name}</CardTitle>
                      {pkg.description && (
                        <CardDescription>{pkg.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(pkg)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="text-destructive hover:text-destructive"
                        onClick={() => deletePackage.mutate(pkg.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1">
                    {pkg.services.map((serviceId) => {
                      const service = services.find(s => s.id === serviceId);
                      return (
                        <Badge key={serviceId} variant="secondary" className="text-xs">
                          {service?.name || "Unknown"}
                        </Badge>
                      );
                    })}
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-muted-foreground line-through text-sm">
                        {pkg.originalPrice} {t("common.currency")}
                      </span>
                      <span className="ml-2 text-xl font-bold text-primary">
                        {pkg.discountedPrice} {t("common.currency")}
                      </span>
                    </div>
                    <Badge className="bg-green-600">
                      -{getSavingsPercent(pkg.originalPrice, pkg.discountedPrice)}%
                    </Badge>
                  </div>

                  <div className="flex gap-4 text-sm text-muted-foreground">
                    {(pkg.validFrom || pkg.validUntil) && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {pkg.validFrom && pkg.validUntil 
                          ? `${pkg.validFrom} - ${pkg.validUntil}`
                          : pkg.validFrom || pkg.validUntil
                        }
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {t("packages.maxUses")}: {pkg.maxUsesPerClient}
                    </div>
                    <div className="flex items-center gap-1">
                      <Package className="h-4 w-4" />
                      {t("packages.purchased")}: {getPurchaseCount(pkg.id)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Badge variant="secondary">{inactivePackages.length}</Badge>
            {t("packages.inactivePackages")}
          </h2>
          {inactivePackages.length === 0 ? (
            <Card className="border-dashed opacity-60">
              <CardContent className="pt-6 text-center text-muted-foreground">
                {t("packages.noInactivePackages")}
              </CardContent>
            </Card>
          ) : (
            inactivePackages.map((pkg) => (
              <Card key={pkg.id} className="bg-background/40 backdrop-blur-sm border-border/30 opacity-70">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{pkg.name}</CardTitle>
                      {pkg.description && (
                        <CardDescription>{pkg.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(pkg)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="text-destructive hover:text-destructive"
                        onClick={() => deletePackage.mutate(pkg.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground line-through text-sm">
                      {pkg.originalPrice} {t("common.currency")}
                    </span>
                    <span className="text-lg font-bold">
                      {pkg.discountedPrice} {t("common.currency")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}

          <h2 className="text-lg font-semibold mt-6 pt-4 border-t">{t("packages.recentPurchases")}</h2>
          {purchases.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="pt-6 text-center text-muted-foreground">
                {t("packages.noPurchases")}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {purchases.slice(0, 5).map((purchase) => {
                const pkg = packages.find(p => p.id === purchase.packageId);
                return (
                  <Card key={purchase.id} className="bg-background/50 backdrop-blur-sm">
                    <CardContent className="py-3">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">{pkg?.name || "Unknown Package"}</p>
                          <p className="text-sm text-muted-foreground">
                            {getClientName(purchase.clientId)} - {purchase.purchaseDate}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge variant={purchase.status === "active" ? "default" : "secondary"}>
                            {purchase.status}
                          </Badge>
                          <p className="text-sm text-muted-foreground mt-1">
                            {t("packages.used")}: {purchase.usedCount}/{purchase.maxUses}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
