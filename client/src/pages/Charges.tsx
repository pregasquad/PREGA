import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval, subMonths, addMonths } from "date-fns";
import { fr, enUS, ar } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, TrendingDown, FolderPlus, RefreshCw, ChevronLeft, ChevronRight, Calendar, Paperclip, X, Image, FileText, Eye } from "lucide-react";
import { autoPrintExpense } from "@/lib/printReceipt";
import { useBusinessSettings } from "@/hooks/use-salon-data";

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
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [attachment, setAttachment] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{data: string, name: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = sessionStorage.getItem("admin_authenticated") === "true";
  const { data: salonSettings } = useBusinessSettings();

  const getLocale = () => {
    switch (i18n.language) {
      case "fr": return fr;
      case "ar": return ar;
      default: return enUS;
    }
  };

  const goToPreviousMonth = () => setSelectedMonth(subMonths(selectedMonth, 1));
  const goToNextMonth = () => setSelectedMonth(addMonths(selectedMonth, 1));
  const goToCurrentMonth = () => setSelectedMonth(new Date());

  const { data: charges = [] } = useQuery<any[]>({
    queryKey: ["/api/charges"],
  });

  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ["/api/expense-categories"],
  });

  const defaultChargeTypes = DEFAULT_CHARGE_TYPES_KEYS.map(item => ({
    id: 0,
    name: item.value,
    label: t(item.key)
  }));

  const chargeTypes = categories.length > 0 
    ? categories.map((c: any) => ({ id: c.id, name: c.name, label: c.name }))
    : defaultChargeTypes;

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
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/charges", data);
      return { ...data, ...(await res.json()) };
    },
    onSuccess: (savedData: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/charges"] });

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
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/charges/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/charges"] });
      toast({ title: t("expenses.expenseDeleted") });
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
    const compressedBlob = new Blob(chunks);
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
      const blob = new Blob(chunks, { type: originalMime });
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

  const totalCharges = filteredCharges.reduce((sum: number, c: any) => sum + c.amount, 0);

  return (
    <div className="h-full flex flex-col gap-4 md:gap-6 p-2 md:p-4 animate-fade-in" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-display font-bold">{t("expenses.title")}</h1>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToPreviousMonth}>
              {i18n.language === "ar" ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-3 min-w-[140px]" onClick={goToCurrentMonth}>
              <Calendar className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
              <span className="capitalize">{format(selectedMonth, "MMMM yyyy", { locale: getLocale() })}</span>
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToNextMonth}>
              {i18n.language === "ar" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              {t("expenses.addExpense")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>{t("expenses.type")}</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("expenses.selectType")} />
                  </SelectTrigger>
                  <SelectContent>
                    {chargeTypes.map((t: any) => (
                      <SelectItem key={`${t.id}-${t.name}`} value={t.name}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("common.name")}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("expenses.namePlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("expenses.amount")} ({t("common.currency")})</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label>{t("common.date")}</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("expenses.attachment")}</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-expense-attachment"
                />
                {attachment ? (
                  <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                    {isImageAttachment(attachment) ? (
                      <Image className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-sm truncate flex-1">{attachmentName}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={removeAttachment}
                      data-testid="button-remove-attachment"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-add-attachment"
                  >
                    <Paperclip className="w-4 h-4 ltr:mr-2 rtl:ml-2" />
                    {t("expenses.addAttachment")}
                  </Button>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-expense">
                {t("common.add")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-destructive" />
              {t("expenses.totalExpenses")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-destructive">{totalCharges} {t("common.currency")}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="flex-1">
        <CardHeader>
          <CardTitle>{t("expenses.expenseList")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredCharges.map((charge: any) => (
            <div key={charge.id} className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg flex justify-between items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{charge.name}</span>
                  <span className="text-xs px-1.5 py-0.5 bg-red-100 dark:bg-red-900/50 rounded text-red-700 dark:text-red-300">
                    {chargeTypes.find((t: any) => t.name === charge.type)?.label || charge.type}
                  </span>
                  {charge.attachment && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setPreviewAttachment({data: charge.attachment, name: charge.attachmentName || 'attachment'})}
                      data-testid={`button-view-attachment-${charge.id}`}
                    >
                      <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </div>
                <div className="flex gap-2 text-sm mt-0.5">
                  <span className="text-red-600 dark:text-red-400 font-semibold">{charge.amount} {t("common.currency")}</span>
                  <span className="text-muted-foreground">{charge.date}</span>
                </div>
              </div>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-destructive"
                  onClick={() => deleteMutation.mutate(charge.id)}
                  data-testid={`button-delete-expense-${charge.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
          {filteredCharges.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              {t("expenses.noExpensesForPeriod")}
            </p>
          )}
        </CardContent>
      </Card>

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
