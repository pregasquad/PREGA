import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Percent, Save, Check, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Staff, Service } from "@shared/schema";

interface StaffCommission {
  id: number;
  staffId: number;
  serviceId: number;
  percentage: number;
}

export default function StaffCommissions() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [commissionValues, setCommissionValues] = useState<Record<number, number>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [savedServices, setSavedServices] = useState<Set<number>>(new Set());

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: allCommissions = [] } = useQuery<StaffCommission[]>({
    queryKey: ["/api/staff-commissions"],
  });

  const { data: staffCommissions = [], refetch: refetchStaffCommissions } = useQuery<StaffCommission[]>({
    queryKey: [`/api/staff-commissions/staff/${selectedStaffId}`],
    enabled: !!selectedStaffId,
  });

  useEffect(() => {
    if (selectedStaffId && services.length > 0) {
      const values: Record<number, number> = {};
      services.forEach(service => {
        const commission = staffCommissions.find(c => c.serviceId === service.id);
        values[service.id] = commission?.percentage ?? service.commissionPercent ?? 50;
      });
      setCommissionValues(values);
      setHasChanges(false);
      setSavedServices(new Set());
    }
  }, [selectedStaffId, staffCommissions, services]);

  const bulkSaveMutation = useMutation({
    mutationFn: async (data: { staffId: number; commissions: { serviceId: number; percentage: number }[] }) => {
      const res = await apiRequest("POST", "/api/staff-commissions/bulk", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-commissions"] });
      refetchStaffCommissions();
      setHasChanges(false);
    },
  });

  const singleSaveMutation = useMutation({
    mutationFn: async (data: { staffId: number; serviceId: number; percentage: number }) => {
      const res = await apiRequest("POST", "/api/staff-commissions", data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-commissions"] });
      refetchStaffCommissions();
      setSavedServices(prev => new Set(prev).add(variables.serviceId));
      setTimeout(() => {
        setSavedServices(prev => {
          const next = new Set(prev);
          next.delete(variables.serviceId);
          return next;
        });
      }, 2000);
    },
  });

  const handleValueChange = (serviceId: number, value: string) => {
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
      setCommissionValues(prev => ({ ...prev, [serviceId]: numValue }));
      setHasChanges(true);
    }
  };

  const handleSaveAll = () => {
    if (!selectedStaffId) return;
    const commissions = Object.entries(commissionValues).map(([serviceId, percentage]) => ({
      serviceId: parseInt(serviceId),
      percentage,
    }));
    bulkSaveMutation.mutate({ staffId: selectedStaffId, commissions });
  };

  const handleSaveSingle = (serviceId: number) => {
    if (!selectedStaffId) return;
    const percentage = commissionValues[serviceId];
    singleSaveMutation.mutate({ staffId: selectedStaffId, serviceId, percentage });
  };

  const getStaffCommissionForService = (staffId: number, serviceId: number): number | null => {
    const commission = allCommissions.find(c => c.staffId === staffId && c.serviceId === serviceId);
    return commission?.percentage ?? null;
  };

  const categories = Array.from(new Set(services.map(s => s.category)));

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Percent className="h-6 w-6 text-primary" />
            {t("salaries.staffCommissions", "Commissions par Employé")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("salaries.staffCommissionsDescription", "Définir le pourcentage de commission pour chaque employé par service")}
          </p>
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t("salaries.selectStaff", "Sélectionner un Employé")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedStaffId?.toString() ?? ""}
            onValueChange={(value) => setSelectedStaffId(parseInt(value))}
          >
            <SelectTrigger className="w-full md:w-[300px]">
              <SelectValue placeholder={t("salaries.chooseStaff", "Choisir un employé...")} />
            </SelectTrigger>
            <SelectContent>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id.toString()}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedStaffId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {t("salaries.commissionsByService", "Commissions par Service")}
              </CardTitle>
              {hasChanges && (
                <Button onClick={handleSaveAll} disabled={bulkSaveMutation.isPending} size="sm">
                  <Save className="h-4 w-4 mr-2" />
                  {t("common.saveAll", "Tout Enregistrer")}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {categories.map(category => (
              <div key={category} className="mb-6 last:mb-0">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                  {category}
                </h3>
                <div className="space-y-2">
                  {services
                    .filter(s => s.category === category)
                    .map(service => {
                      const currentValue = commissionValues[service.id] ?? service.commissionPercent ?? 50;
                      const originalCommission = staffCommissions.find(c => c.serviceId === service.id);
                      const hasChange = originalCommission 
                        ? originalCommission.percentage !== currentValue
                        : (service.commissionPercent ?? 50) !== currentValue;
                      const isSaved = savedServices.has(service.id);

                      return (
                        <div
                          key={service.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="font-medium">{service.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {service.isStartingPrice ? `${t("services.startingFrom")} ` : ''}{service.price} DH • {service.duration} min
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                value={currentValue}
                                onChange={(e) => handleValueChange(service.id, e.target.value)}
                                className="w-20 h-9 text-center"
                              />
                              <span className="text-muted-foreground">%</span>
                            </div>
                            <Button
                              variant={isSaved ? "default" : hasChange ? "outline" : "ghost"}
                              size="sm"
                              onClick={() => handleSaveSingle(service.id)}
                              disabled={singleSaveMutation.isPending || isSaved}
                              className="w-20"
                            >
                              {isSaved ? (
                                <>
                                  <Check className="h-4 w-4 mr-1" />
                                  OK
                                </>
                              ) : (
                                t("common.save", "Save")
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("salaries.commissionsOverview", "Aperçu des Commissions")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">{t("common.service", "Service")}</TableHead>
                  {staff.map(s => (
                    <TableHead key={s.id} className="text-center min-w-[100px]">
                      <div className="flex items-center justify-center gap-1">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        {s.name}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map(service => (
                  <TableRow key={service.id}>
                    <TableCell className="font-medium">{service.name}</TableCell>
                    {staff.map(s => {
                      const customPercent = getStaffCommissionForService(s.id, service.id);
                      const defaultPercent = service.commissionPercent ?? 50;
                      const displayPercent = customPercent ?? defaultPercent;
                      const isCustom = customPercent !== null;

                      return (
                        <TableCell key={s.id} className="text-center">
                          <span className={isCustom ? "font-semibold text-primary" : "text-muted-foreground"}>
                            {displayPercent}%
                          </span>
                          {isCustom && (
                            <span className="ml-1 text-xs text-green-600">✓</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {t("salaries.commissionsNote", "Les valeurs en orange sont personnalisées. Les autres utilisent le pourcentage par défaut du service.")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
