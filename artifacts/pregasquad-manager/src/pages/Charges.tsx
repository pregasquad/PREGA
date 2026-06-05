import { useState, useRef, useMemo, useEffect } from "react";
import { MonthlyGoalBanner } from "@/components/MonthlyGoalBanner";
import { calcAppointmentCommission } from "@/lib/commissionCalc";
import { getWorkDayDate } from "@/lib/workday";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval, subMonths, addMonths } from "date-fns";
import { fr, enUS, ar } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, TrendingDown, FolderPlus, RefreshCw, ChevronLeft, ChevronRight, Calendar, Paperclip, X, Image, FileText, Wallet, TrendingUp, ArrowRight, ChevronDown, ChevronUp, ShoppingBag } from "lucide-react";
import { autoPrintExpense } from "@/lib/printReceipt";
import { useBusinessSettings } from "@/hooks/use-salon-data";
import { refreshSalariesBackground } from "@/lib/salariesRefresher";

const DEFAULT_CHARGE_TYPES_KEYS = [
  { id: 1, key: "expenses.product", value: "Produit" },
  { id: 2, key: "expenses.rent", value: "Loyer" },
  { id: 3, key: "expenses.water", value: "Eau" },
  { id: 4, key: "expenses.electricity", value: "Electricité" },
  { id: 5, key: "expenses.salary", value: "Salaire" },
  { id: 6, key: "expenses.other", value: "Autre" },
];

export default function Charges() {
  const { t, i18n } = useTranslation();
  const [type, setType] = useState("Produit");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => format(getWorkDayDate(), "yyyy-MM-dd"));
  const [attachment, setAttachment] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{data: string, name: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(() => getWorkDayDate());
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = sessionStorage.getItem("current_user_role") === "owner";
  const { data: salonSettings } = useBusinessSettings();
  const [withdrawalsExpanded, setWithdrawalsExpanded] = useState(false);
  const [chargesListExpanded, setChargesListExpanded] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [withdrawalDate, setWithdrawalDate] = useState(() => format(getWorkDayDate(), "yyyy-MM-dd"));
  const chargesDateInitRef = useRef(false);

  useEffect(() => {
    if (salonSettings?.openingTime && salonSettings?.closingTime && !chargesDateInitRef.current) {
      chargesDateInitRef.current = true;
      const workDay = getWorkDayDate(salonSettings.openingTime, salonSettings.closingTime);
      setDate(format(workDay, "yyyy-MM-dd"));
      setWithdrawalDate(format(workDay, "yyyy-MM-dd"));
      setSelectedMonth(workDay);
    }
  }, [salonSettings?.openingTime, salonSettings?.closingTime]);
  const [withdrawalNotes, setWithdrawalNotes] = useState("");
  const [productName, setProductName] = useState("");
  const [productAmount, setProductAmount] = useState("");

  // Feature activation date — set once to today on first use, never changes after that
  const [productsStartDate] = useState<string>(() => {
    const stored = localStorage.getItem("productsFeatureStartDate");
    if (stored) return stored;
    const today = format(new Date(), "yyyy-MM-dd");
    localStorage.setItem("productsFeatureStartDate", today);
    return today;
  });

  const getLocale = () => {
    switch (i18n.language) {
      case "fr": return fr;
      case "ar": return ar;
      default: return enUS;
    }
  };

  const goToPreviousMonth = () => setSelectedMonth(subMonths(selectedMonth, 1));
  const goToNextMonth = () => setSelectedMonth(addMonths(selectedMonth, 1));
  const goToCurrentMonth = () => setSelectedMonth(getWorkDayDate(salonSettings?.openingTime, salonSettings?.closingTime));

  const { data: charges = [] } = useQuery<any[]>({
    queryKey: ["/api/charges"],
  });

  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ["/api/expense-categories"],
  });

  const { data: ownerWithdrawals = [] } = useQuery<any[]>({
    queryKey: ["/api/owner-withdrawals"],
  });

  // Use the same data source as Salaries so salonPortion is always identical
  const { data: salaryData } = useQuery<any>({
    queryKey: ["/api/salaries/compute"],
    staleTime: 0,
  });

  const defaultChargeTypes = DEFAULT_CHARGE_TYPES_KEYS.map(item => ({
    id: 0,
    name: item.value,
    label: t(item.key)
  }));

  const chargeTypes = categories.length > 0 
    ? categories.map((c: any) => ({ id: c.id, name: c.name, label: c.name }))
    : defaultChargeTypes;

  const createWithdrawalMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/owner-withdrawals", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner-withdrawals"] });
      setWithdrawalAmount("");
      setWithdrawalNotes("");
      toast({ title: t("ownerWithdrawals.withdrawalAdded") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const deleteWithdrawalMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/owner-withdrawals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner-withdrawals"] });
      toast({ title: t("ownerWithdrawals.withdrawalDeleted") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const handleWithdrawalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawalAmount || !withdrawalDate) {
      toast({ title: t("ownerWithdrawals.fillAllFields"), variant: "destructive" });
      return;
    }
    createWithdrawalMutation.mutate({
      amount: Number(withdrawalAmount),
      date: withdrawalDate,
      notes: withdrawalNotes || null,
    });
  };

  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/expense-categories", { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expense-categories"] });
      setNewCategoryName("");
      toast({ title: t("expenses.categoryAdded") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/charges", data);
      return { ...data, ...(await res.json()) };
    },
    onSuccess: (savedData: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
      refreshSalariesBackground();

      autoPrintExpense({
        businessName: salonSettings?.businessName || "PREGASQUAD SALON",
        currency: salonSettings?.currencySymbol || "DH",
        expenseType: savedData.type || "",
        expenseName: savedData.name || "",
        amount: Number(savedData.amount) || 0,
        date: savedData.date || format(new Date(), "yyyy-MM-dd"),
      });

      setName("");
      setAmount("");
      removeAttachment();
      toast({ title: t("expenses.expenseAdded") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/charges/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
      refreshSalariesBackground();
      toast({ title: t("expenses.expenseDeleted") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/charges", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/salaries/compute"] });
      refreshSalariesBackground();
      setProductName("");
      setProductAmount("");
      toast({ title: t("expenses.expenseAdded") });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const compressImage = (file: File, maxWidth = 1200, quality = 0.7): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas not supported")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL("image/jpeg", quality);
        resolve(compressed);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
      img.src = url;
    });
  };

  const blobToDataURL = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const compressFile = async (file: File): Promise<string> => {
    if (typeof CompressionStream === "undefined") {
      return blobToDataURL(file);
    }
    const stream = file.stream().pipeThrough(new CompressionStream("gzip"));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const compressedBlob = new Blob(chunks as Uint8Array<ArrayBuffer>[]);
    const dataUrl = await blobToDataURL(compressedBlob);
    const base64Part = dataUrl.split(",")[1];
    return `data:application/gzip;name=${encodeURIComponent(file.type)};base64,${base64Part}`;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxRawSize = 10 * 1024 * 1024;
    if (file.size > maxRawSize) {
      toast({ title: t("expenses.fileTooLarge"), variant: "destructive" });
      return;
    }

    try {
      let result: string;
      if (file.type.startsWith("image/")) {
        result = await compressImage(file);
      } else {
        result = await compressFile(file);
      }

      const maxPayloadSize = 8 * 1024 * 1024;
      if (result.length > maxPayloadSize) {
        toast({ title: t("expenses.fileTooLarge"), variant: "destructive" });
        return;
      }

      setAttachment(result);
      setAttachmentName(file.name);
    } catch {
      toast({ title: t("expenses.compressionFailed"), variant: "destructive" });
    }
  };

  const removeAttachment = () => {
    setAttachment(null);
    setAttachmentName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isImageAttachment = (data: string) => data?.startsWith("data:image/");
  const isCompressedAttachment = (data: string) => data?.startsWith("data:application/gzip;");

  const downloadCompressedFile = async (data: string, fileName: string) => {
    try {
      const header = data.split(",")[0];
      const base64 = data.split(",")[1];

      let originalMime = "application/octet-stream";
      const nameMatch = header.match(/name=([^;]+)/);
      if (nameMatch) originalMime = decodeURIComponent(nameMatch[1]);

      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      if (typeof DecompressionStream === "undefined") {
        const blob = new Blob([bytes], { type: originalMime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName || "attachment";
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      const stream = new Blob([bytes]).stream();
      const decompressedStream = stream.pipeThrough(new DecompressionStream("gzip"));
      const reader = decompressedStream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const blob = new Blob(chunks as Uint8Array<ArrayBuffer>[], { type: originalMime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "attachment";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: t("expenses.downloadFailed"), variant: "destructive" });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount || !date) {
      toast({ title: t("expenses.fillAllFields"), variant: "destructive" });
      return;
    }
    createMutation.mutate({
      type: type || "Autre",
      name: name,
      amount: Number(amount),
      date: date,
      attachment: attachment || null,
      attachmentName: attachmentName || null,
    });
  };

  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);
  
  const filteredCharges = charges.filter((charge: any) => {
    try {
      const chargeDate = parseISO(charge.date);
      return isWithinInterval(chargeDate, { start: monthStart, end: monthEnd });
    } catch {
      return false;
    }
  });

  const filteredWithdrawals = ownerWithdrawals.filter((w: any) => {
    try {
      const wDate = parseISO(w.date);
      return isWithinInterval(wDate, { start: monthStart, end: monthEnd });
    } catch {
      return false;
    }
  });

  // Mirror Salaries.tsx exactly: same data, same calcAppointmentCommission logic
  const monthRevenue = useMemo(() => {
    const allAppointments: any[] = salaryData?.appointments ?? [];
    const allStaff: any[] = salaryData?.staff ?? [];
    const allServices: any[] = salaryData?.services ?? [];
    const allStaffCommissions: any[] = salaryData?.staffCommissions ?? [];

    const monthApts = allAppointments.filter((a: any) => {
      if (!a.paid || !a.date) return false;
      try {
        return isWithinInterval(parseISO(a.date), { start: monthStart, end: monthEnd });
      } catch { return false; }
    });

    let totalRevenue = 0;
    let totalCommissions = 0;
    for (const app of monthApts) {
      totalRevenue += Number(app.total || 0);
      totalCommissions += calcAppointmentCommission(app, allServices, allStaff, allStaffCommissions);
    }
    return totalRevenue - totalCommissions;
  }, [salaryData, monthStart, monthEnd]);

  // Products budget: remaining % after manual staff commission + 50% salon share
  // Returns BOTH this month's budget and cumulative (from start date) for carry-over
  const productsBudgetData = useMemo(() => {
    const allAppointments: any[] = salaryData?.appointments ?? [];
    const allStaff: any[] = salaryData?.staff ?? [];
    const allServices: any[] = salaryData?.services ?? [];
    const allStaffCommissions: any[] = salaryData?.staffCommissions ?? [];

    const monthEndStr = format(monthEnd, "yyyy-MM-dd");

    const calcBudgetForApts = (apts: any[]): number => {
      let budget = 0;
      for (const app of apts) {
        const resolvedStaff = app.staffId
          ? allStaff.find((s: any) => s.id === Number(app.staffId))
          : allStaff.find((s: any) => s.name === app.staff);

        let serviceItems: Array<{ name: string; price: number }> | null = null;
        if (app.servicesJson) {
          try {
            const parsed = typeof app.servicesJson === "string" ? JSON.parse(app.servicesJson) : app.servicesJson;
            if (Array.isArray(parsed) && parsed.length > 0) serviceItems = parsed;
          } catch { serviceItems = null; }
        }

        if (serviceItems && serviceItems.length > 0) {
          const sumPrices = serviceItems.reduce((s: number, i: any) => s + Number(i.price || 0), 0);
          const appTotal = Number(app.total || 0);
          const discountRatio = sumPrices > 0 && appTotal >= 0 && appTotal < sumPrices ? appTotal / sumPrices : 1;
          for (const item of serviceItems) {
            const effectivePrice = Number(item.price || 0) * discountRatio;
            const svcDef = allServices.find((s: any) => s.name === item.name);
            if (!svcDef || !resolvedStaff) continue;
            const manualComm = allStaffCommissions.find(
              (c: any) => c.staffId === resolvedStaff.id && c.serviceId === svcDef.id
            );
            if (manualComm) {
              budget += effectivePrice * (Math.max(0, 100 - manualComm.percentage - 50) / 100);
            }
          }
        } else {
          const svcDef = allServices.find((s: any) => s.name === (app.service || ""));
          if (!svcDef || !resolvedStaff) continue;
          const manualComm = allStaffCommissions.find(
            (c: any) => c.staffId === resolvedStaff.id && c.serviceId === svcDef.id
          );
          if (manualComm) {
            budget += Number(app.total || 0) * (Math.max(0, 100 - manualComm.percentage - 50) / 100);
          }
        }
      }
      return budget;
    };

    const isValidPaid = (a: any) => !!(a.paid && a.date);

    // This month only (from productsStartDate if it falls within the month)
    const monthApts = allAppointments.filter((a: any) => {
      if (!isValidPaid(a)) return false;
      try { return a.date >= productsStartDate && isWithinInterval(parseISO(a.date), { start: monthStart, end: monthEnd }); }
      catch { return false; }
    });

    // Cumulative: from productsStartDate to end of selected month (carry-over source)
    const cumulativeApts = allAppointments.filter((a: any) => {
      if (!isValidPaid(a)) return false;
      return a.date >= productsStartDate && a.date <= monthEndStr;
    });

    return {
      monthly: calcBudgetForApts(monthApts),
      cumulative: calcBudgetForApts(cumulativeApts),
    };
  }, [salaryData, monthStart, monthEnd, productsStartDate]);

  const monthProductsBudget = productsBudgetData.monthly;
  const cumulativeProductsBudget = productsBudgetData.cumulative;

  const totalCharges = filteredCharges.reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);
  const totalWithdrawals = filteredWithdrawals.reduce((sum: number, w: any) => sum + Number(w.amount || 0), 0);
  const netRemaining = monthRevenue - totalWithdrawals - totalCharges;

  // This month's product charges (for the detail list)
  const productCharges = filteredCharges.filter((c: any) => c.type === "Produit" && c.date >= productsStartDate);
  const totalProductCharges = productCharges.reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);

  // Cumulative product charges from start date to end of selected month (for carry-over balance)
  const monthEndStr = format(monthEnd, "yyyy-MM-dd");
  const totalCumulativeProductCharges = (charges as any[])
    .filter((c: any) => c.type === "Produit" && c.date >= productsStartDate && c.date <= monthEndStr)
    .reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);

  // Carry-over balance = all accumulated budget minus all accumulated spending
  const carryOverBalance = cumulativeProductsBudget - totalCumulativeProductCharges;
  // Previous months carry-over (balance before this month)
  const prevMonthEndStr = format(new Date(monthStart.getFullYear(), monthStart.getMonth(), 0), "yyyy-MM-dd");
  const prevCumulativeBudget = productsBudgetData.cumulative - monthProductsBudget;
  const prevCumulativeSpending = (charges as any[])
    .filter((c: any) => c.type === "Produit" && c.date >= productsStartDate && c.date <= prevMonthEndStr)
    .reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);
  const carryOver = prevCumulativeBudget - prevCumulativeSpending;

  const handleProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName || !productAmount || !date) {
      toast({ title: t("expenses.fillAllFields"), variant: "destructive" });
      return;
    }
    createProductMutation.mutate({
      type: "Produit",
      name: productName,
      amount: Number(productAmount),
      date: date,
      attachment: null,
      attachmentName: null,
    });
  };

  const glassCard = {
    background: "rgba(255,255,255,0.72)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.55)",
    borderRadius: "1.25rem",
    boxShadow: "0 8px 32px rgba(214,51,132,0.07), inset 0 1px 0 rgba(255,255,255,0.7)",
  } as React.CSSProperties;

  return (
    <div className="flex flex-col gap-4 p-2 md:p-4 animate-fade-in" dir={i18n.language === "ar" ? "rtl" : "ltr"}>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h1 className="text-xl md:text-2xl font-display font-bold">{t("expenses.title")}</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white/60 dark:bg-white/5 backdrop-blur-sm border border-white/50 dark:border-white/10 rounded-xl px-1 py-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToPreviousMonth}>
              {i18n.language === "ar" ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-3 min-w-[130px]" onClick={goToCurrentMonth}>
              <Calendar className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
              <span className="capitalize text-sm">{format(selectedMonth, "MMMM yyyy", { locale: getLocale() })}</span>
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToNextMonth}>
              {i18n.language === "ar" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="bg-white/60 dark:bg-white/5 backdrop-blur-sm border-white/50 dark:border-white/10 rounded-xl"
            disabled={isRefreshing}
            onClick={async () => {
              setIsRefreshing(true);
              await queryClient.invalidateQueries();
              setIsRefreshing(false);
              toast({ title: t("common.refreshed"), description: t("common.dataUpdated") });
            }}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* ── Monthly Goal Banner — always visible ── */}
      <MonthlyGoalBanner />

      {/* ── Owner Withdrawals (admin only) — TOP ── */}
      {isAdmin && (
        <div className="p-5 dark:bg-white/5" style={{ ...glassCard, border: "1px solid rgba(217,119,6,0.2)" }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="font-semibold text-base text-amber-700 dark:text-amber-400">{t("ownerWithdrawals.title")}</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <form onSubmit={handleWithdrawalSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">{t("ownerWithdrawals.amount")}</Label>
                  <Input type="number" value={withdrawalAmount} onChange={(e) => setWithdrawalAmount(e.target.value)} placeholder="0" className="h-9 text-sm bg-white/60 dark:bg-white/5 border-white/50 dark:border-white/10" data-testid="input-withdrawal-amount" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">{t("common.date")}</Label>
                  <Input type="date" value={withdrawalDate} onChange={(e) => setWithdrawalDate(e.target.value)} className="h-9 text-sm bg-white/60 dark:bg-white/5 border-white/50 dark:border-white/10" data-testid="input-withdrawal-date" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("ownerWithdrawals.notes")}</Label>
                <Textarea value={withdrawalNotes} onChange={(e) => setWithdrawalNotes(e.target.value)} placeholder={t("ownerWithdrawals.notesPlaceholder")} rows={2} className="text-sm bg-white/60 dark:bg-white/5 border-white/50 dark:border-white/10 resize-none" data-testid="input-withdrawal-notes" />
              </div>
              <Button type="submit" className="w-full h-9 bg-amber-600 hover:bg-amber-700 text-white" disabled={createWithdrawalMutation.isPending} data-testid="button-submit-withdrawal">
                <Plus className="w-4 h-4 ltr:mr-2 rtl:ml-2" />
                {t("ownerWithdrawals.addWithdrawal")}
              </Button>
            </form>

            <div className="space-y-3">
              {/* Caisse breakdown */}
              <div className="p-3.5 bg-amber-50/70 dark:bg-amber-950/20 rounded-xl border border-amber-100/60 dark:border-amber-800/20 space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t("ownerWithdrawals.caisseBreakdown")}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3 text-emerald-500" />{t("salaries.salonShare")}</span>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">+ {monthRevenue.toFixed(0)} {t("common.currency")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="w-3 h-3 text-amber-600" />{t("ownerWithdrawals.myWithdrawals")}</span>
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400">- {totalWithdrawals.toFixed(0)} {t("common.currency")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="w-3 h-3 text-destructive" />{t("expenses.totalExpenses")}</span>
                  <span className="text-xs font-bold text-destructive">- {totalCharges.toFixed(0)} {t("common.currency")}</span>
                </div>
                <div className={`flex items-center justify-between pt-2 border-t ${netRemaining >= 0 ? "border-emerald-200/50" : "border-red-200/50"}`}>
                  <span className="text-sm font-bold">{t("reports.netProfit")}</span>
                  <span className={`text-base font-bold ${netRemaining >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                    {netRemaining.toFixed(0)} {t("common.currency")}
                  </span>
                </div>
              </div>

              {/* Withdrawals list */}
              <div>
                <Button variant="ghost" size="sm" className="w-full flex items-center justify-between text-xs text-muted-foreground h-8 px-2" onClick={() => setWithdrawalsExpanded(!withdrawalsExpanded)} data-testid="button-toggle-withdrawals">
                  <span>{t("ownerWithdrawals.myWithdrawals")} ({filteredWithdrawals.length})</span>
                  {withdrawalsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Button>
                {withdrawalsExpanded && (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto mt-1">
                    {filteredWithdrawals.map((w: any) => (
                      <div key={w.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50/80 dark:bg-amber-950/20 border border-amber-100/50 dark:border-amber-800/20">
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-bold text-amber-700 dark:text-amber-400">{Number(w.amount).toFixed(0)} {t("common.currency")}</span>
                          <span className="text-[10px] text-muted-foreground ltr:ml-2 rtl:mr-2">{w.date}</span>
                          {w.notes && <p className="text-[10px] text-muted-foreground truncate">{w.notes}</p>}
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive/70 hover:text-destructive" onClick={() => deleteWithdrawalMutation.mutate(w.id)} data-testid={`button-delete-withdrawal-${w.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                    {filteredWithdrawals.length === 0 && (
                      <p className="text-center text-xs text-muted-foreground py-3">{t("ownerWithdrawals.noWithdrawals")}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Stats Row ── */}
      <div className={`grid gap-3 ${isAdmin ? "grid-cols-3" : "grid-cols-1"}`}>
        <div className="p-4 dark:bg-red-950/20" style={glassCard}>
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-destructive" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("expenses.totalExpenses")}</span>
          </div>
          <p className="text-2xl font-bold text-destructive">{totalCharges.toFixed(0)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("common.currency")}</p>
        </div>
        {isAdmin && (
          <div className="p-4 dark:bg-amber-950/20" style={glassCard}>
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("ownerWithdrawals.totalWithdrawals")}</span>
            </div>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{totalWithdrawals.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("common.currency")}</p>
          </div>
        )}
        {isAdmin && (
          <div className={`p-4 ${netRemaining >= 0 ? "dark:bg-emerald-950/20" : "dark:bg-red-950/20"}`} style={glassCard}>
            <div className="flex items-center gap-2 mb-1">
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("reports.netProfit")}</span>
            </div>
            <p className={`text-2xl font-bold ${netRemaining >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
              {netRemaining.toFixed(0)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("common.currency")}</p>
          </div>
        )}
      </div>

      {/* ── Main Grid: Form + Expense List ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Add Expense */}
        <div className="p-5 dark:bg-white/5" style={glassCard}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Plus className="w-4 h-4 text-primary" />
            </div>
            <h2 className="font-semibold text-base">{t("expenses.addExpense")}</h2>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("expenses.type")}</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="h-9 text-sm bg-white/60 dark:bg-white/5 border-white/50 dark:border-white/10">
                    <SelectValue placeholder={t("expenses.selectType")} />
                  </SelectTrigger>
                  <SelectContent>
                    {chargeTypes.map((t: any) => (
                      <SelectItem key={`${t.id}-${t.name}`} value={t.name}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("expenses.amount")}</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="h-9 text-sm bg-white/60 dark:bg-white/5 border-white/50 dark:border-white/10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("common.name")}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("expenses.namePlaceholder")}
                className="h-9 text-sm bg-white/60 dark:bg-white/5 border-white/50 dark:border-white/10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("common.date")}</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 text-sm bg-white/60 dark:bg-white/5 border-white/50 dark:border-white/10"
              />
            </div>
            <div className="space-y-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-expense-attachment"
              />
              {attachment ? (
                <div className="flex items-center gap-2 p-2 bg-white/50 dark:bg-white/5 rounded-lg border border-white/40">
                  {isImageAttachment(attachment) ? <Image className="w-4 h-4 text-muted-foreground shrink-0" /> : <FileText className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <span className="text-xs truncate flex-1">{attachmentName}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={removeAttachment} data-testid="button-remove-attachment">
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" className="w-full h-9 text-xs bg-white/40 dark:bg-white/5 border-white/40 dark:border-white/10" onClick={() => fileInputRef.current?.click()} data-testid="button-add-attachment">
                  <Paperclip className="w-3.5 h-3.5 ltr:mr-1.5 rtl:ml-1.5" />
                  {t("expenses.addAttachment")}
                </Button>
              )}
            </div>
            <Button type="submit" className="w-full h-10" disabled={createMutation.isPending} data-testid="button-submit-expense">
              <Plus className="w-4 h-4 ltr:mr-2 rtl:ml-2" />
              {t("common.add")}
            </Button>
          </form>
        </div>

        {/* Expense List */}
        <div className="dark:bg-white/5 overflow-hidden" style={glassCard}>
          {/* Collapsible header */}
          <button
            type="button"
            onClick={() => setChargesListExpanded(v => !v)}
            className="w-full flex items-center gap-2 p-5 text-start"
            data-testid="button-toggle-charges-list"
          >
            <div className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <TrendingDown className="w-4 h-4 text-destructive" />
            </div>
            <h2 className="font-semibold text-base flex-1">{t("expenses.expenseList")}</h2>
            <span className="text-xs text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">{filteredCharges.length}</span>
            {chargesListExpanded
              ? <ChevronUp className="w-4 h-4 text-muted-foreground ms-1" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground ms-1" />}
          </button>

          {chargesListExpanded && (
            <div className="px-5 pb-5 space-y-2 max-h-[360px] overflow-y-auto">
              {filteredCharges.map((charge: any) => (
                <div key={charge.id} className="flex items-center gap-2 p-3 rounded-xl bg-red-50/80 dark:bg-red-950/20 border border-red-100/60 dark:border-red-800/20" data-testid={`row-expense-${charge.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium truncate">{charge.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-red-100 dark:bg-red-900/50 rounded-full text-red-700 dark:text-red-300 shrink-0">
                        {chargeTypes.find((t: any) => t.name === charge.type)?.label || charge.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm font-bold text-red-600 dark:text-red-400">{charge.amount} {t("common.currency")}</span>
                      <span className="text-xs text-muted-foreground">{charge.date}</span>
                      {charge.attachment && (
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setPreviewAttachment({data: charge.attachment, name: charge.attachmentName || 'attachment'})} data-testid={`button-view-attachment-${charge.id}`}>
                          <Paperclip className="w-3 h-3 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive/70 hover:text-destructive" onClick={() => deleteMutation.mutate(charge.id)} data-testid={`button-delete-expense-${charge.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              {filteredCharges.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                  <TrendingDown className="w-8 h-8 opacity-20" />
                  <p className="text-sm">{t("expenses.noExpensesForPeriod")}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Products Budget ── */}
      <div className="p-5 dark:bg-white/5" style={{ ...glassCard, border: "1px solid rgba(139,92,246,0.2)" }}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <ShoppingBag className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </div>
          <h2 className="font-semibold text-base text-violet-700 dark:text-violet-400">بجت المنتجات</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Budget summary */}
          <div className="p-3.5 bg-violet-50/70 dark:bg-violet-950/20 rounded-xl border border-violet-100/60 dark:border-violet-800/20 space-y-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">ملخص البجت</p>
            {carryOver !== 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">رصيد الشهور السابقة</span>
                <span className={`text-xs font-bold ${carryOver >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                  {carryOver >= 0 ? "+" : ""}{carryOver.toFixed(0)} {t("common.currency")}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">بجت هذا الشهر</span>
              <span className="text-xs font-bold text-violet-600 dark:text-violet-400">+ {monthProductsBudget.toFixed(0)} {t("common.currency")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">مشتريات هذا الشهر</span>
              <span className="text-xs font-bold text-destructive">- {totalProductCharges.toFixed(0)} {t("common.currency")}</span>
            </div>
            <div className={`flex items-center justify-between pt-2 border-t ${carryOverBalance >= 0 ? "border-violet-200/60" : "border-red-200/60"}`}>
              <span className="text-sm font-bold">الرصيد المتراكم</span>
              <span className={`text-base font-bold ${carryOverBalance >= 0 ? "text-violet-600 dark:text-violet-400" : "text-destructive"}`}>
                {carryOverBalance.toFixed(0)} {t("common.currency")}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground pt-1 border-t border-dashed">
              من: <span className="font-semibold">{productsStartDate}</span>
            </p>
          </div>

          {/* Quick-add + list */}
          <div className="space-y-3">
            <form onSubmit={handleProductSubmit} className="flex gap-2">
              <Input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="اسم المنتج..."
                className="h-9 text-sm flex-1 bg-white/60 dark:bg-white/5 border-white/50 dark:border-white/10"
                data-testid="input-product-name"
              />
              <Input
                type="number"
                value={productAmount}
                onChange={(e) => setProductAmount(e.target.value)}
                placeholder="0"
                className="h-9 text-sm w-24 bg-white/60 dark:bg-white/5 border-white/50 dark:border-white/10"
                data-testid="input-product-amount"
              />
              <Button type="submit" size="sm" className="h-9 bg-violet-600 hover:bg-violet-700 text-white shrink-0" disabled={createProductMutation.isPending} data-testid="button-submit-product">
                <Plus className="w-4 h-4" />
              </Button>
            </form>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {productCharges.map((charge: any) => (
                <div key={charge.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50/80 dark:bg-violet-950/20 border border-violet-100/50 dark:border-violet-800/20" data-testid={`row-product-${charge.id}`}>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium truncate block">{charge.name}</span>
                    <span className="text-[10px] text-muted-foreground">{charge.date}</span>
                  </div>
                  <span className="text-xs font-bold text-violet-700 dark:text-violet-400 shrink-0">{Number(charge.amount).toFixed(0)} {t("common.currency")}</span>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/70 hover:text-destructive shrink-0" onClick={() => deleteMutation.mutate(charge.id)} data-testid={`button-delete-product-${charge.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
              {productCharges.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-4">ما كاين شي منتجات مشتراة هذا الشهر</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {previewAttachment && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewAttachment(null)}
          data-testid="modal-attachment-preview"
        >
          <div
            className="bg-background rounded-lg max-w-lg w-full max-h-[80vh] overflow-auto p-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">{previewAttachment.name}</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPreviewAttachment(null)}
                data-testid="button-close-preview"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            {isImageAttachment(previewAttachment.data) ? (
              <img
                src={previewAttachment.data}
                alt={t("expenses.attachment")}
                className="w-full rounded-md object-contain max-h-[60vh]"
              />
            ) : isCompressedAttachment(previewAttachment.data) ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <FileText className="w-12 h-12 text-muted-foreground" />
                <Button
                  variant="outline"
                  onClick={() => downloadCompressedFile(previewAttachment.data, previewAttachment.name)}
                  data-testid="button-download-compressed"
                >
                  {t("expenses.downloadAttachment")}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8">
                <FileText className="w-12 h-12 text-muted-foreground" />
                <a
                  href={previewAttachment.data}
                  download={previewAttachment.name}
                  className="text-primary underline text-sm"
                >
                  {t("expenses.downloadAttachment")}
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
