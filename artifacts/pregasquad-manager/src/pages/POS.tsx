import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { autoPrint } from "@/lib/printReceipt";
import { useBusinessName } from "@/hooks/use-salon-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ShoppingCart, Search, X, CreditCard, Banknote,
  Check, User, Loader2, Receipt, Scissors, Tag,
  Sparkles, Trash2, Plus, Star,
} from "lucide-react";
import type { Client } from "@shared/schema";

const USAGE_KEY = "pos_service_usage";

function loadUsage(): Record<number, number> {
  try { return JSON.parse(localStorage.getItem(USAGE_KEY) || "{}"); } catch { return {}; }
}

function incrementUsage(serviceId: number) {
  const usage = loadUsage();
  usage[serviceId] = (usage[serviceId] || 0) + 1;
  localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
}

interface CartItem {
  id: string;
  serviceId?: number;
  name: string;
  price: number;
  duration: number;
}

type PaymentMethod = "cash" | "card" | "split";

function uid() { return Math.random().toString(36).slice(2, 9); }

export default function POS() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const businessName = useBusinessName();

  const { data: services = [] } = useQuery<any[]>({ queryKey: ["/api/services"] });
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const { data: staffList = [] } = useQuery<any[]>({ queryKey: ["/api/staff"] });
  const { data: biz } = useQuery<any>({ queryKey: ["/api/business-settings"] });

  const currency = biz?.currency || "DH";
  const loyaltyRate = Number(biz?.loyaltyPointsRate ?? 10);
  const pointsPerDirham = Number(biz?.loyaltyPointsPerDh ?? biz?.loyaltyPointsPerDirham ?? 1);
  const loyaltyMultiplier = Number(biz?.loyaltyPointsMultiplier ?? 1);

  const [usageMap, setUsageMap] = useState<Record<number, number>>(() => loadUsage());

  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState("favorites");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [showClients, setShowClients] = useState(false);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({});
  const [discountAmt, setDiscountAmt] = useState(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [cashGiven, setCashGiven] = useState(0);
  const [useLoyalty, setUseLoyalty] = useState(false);
  const [useGiftCard, setUseGiftCard] = useState(false);
  const [activeTab, setActiveTab] = useState<"services" | "cart">("services");
  const [done, setDone] = useState(false);

  const clientDropRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clientDropRef.current && !clientDropRef.current.contains(e.target as Node)) {
        setShowClients(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const allCats = useMemo(() => [...new Set(services.map((s: any) => s.category as string))], [services]);

  // Top 8 most-used service IDs (by usage count), only those with at least 1 use
  const topServiceIds = useMemo(() => {
    return Object.entries(usageMap)
      .filter(([, count]) => count > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([id]) => Number(id));
  }, [usageMap]);

  const hasFavorites = topServiceIds.length > 0;

  // Effective default: show "favorites" if any exist, else "all"
  const effectiveCat = selectedCat === "favorites" && !hasFavorites ? "all" : selectedCat;

  const filteredServices = useMemo(() => {
    let list: any[] = services;

    if (effectiveCat === "favorites") {
      // Show only top-used services, sorted by usage count desc
      list = topServiceIds
        .map(id => services.find((s: any) => s.id === id))
        .filter(Boolean);
    } else {
      if (effectiveCat !== "all") list = list.filter((s: any) => s.category === effectiveCat);
      if (!search.trim()) {
        // Sort by usage count descending so most-used float to top
        list = [...list].sort((a: any, b: any) => (usageMap[b.id] || 0) - (usageMap[a.id] || 0));
      }
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s: any) => s.name.toLowerCase().includes(q));
    }
    return list;
  }, [services, effectiveCat, search, topServiceIds, usageMap]);

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients.slice(0, 25);
    const q = clientSearch.toLowerCase();
    return clients.filter(c => c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q)).slice(0, 25);
  }, [clients, clientSearch]);

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.price, 0), [cart]);
  const totalDur = useMemo(() => cart.reduce((s, i) => s + i.duration, 0), [cart]);
  const selectedStaff = staffList.find((s: any) => s.id === staffId);

  const canLoyalty = !!(selectedClient?.loyaltyEnrolled && Number(selectedClient?.loyaltyPoints ?? 0) > 0);
  const loyaltyDiscount = (useLoyalty && canLoyalty)
    ? Math.min(subtotal * 0.5, Number(selectedClient!.loyaltyPoints) * (loyaltyRate / 100))
    : 0;

  const canGiftCard = !!(selectedClient && Number(selectedClient?.giftCardBalance ?? 0) > 0);
  const giftCardDiscount = (useGiftCard && canGiftCard)
    ? Math.min(Math.max(0, subtotal - discountAmt - loyaltyDiscount), Number(selectedClient!.giftCardBalance))
    : 0;

  const total = Math.max(0, subtotal - discountAmt - loyaltyDiscount - giftCardDiscount);
  const change = payMethod === "cash" ? Math.max(0, cashGiven - total) : 0;
  const pointsEarned = selectedClient?.loyaltyEnrolled ? Math.floor(total * pointsPerDirham * loyaltyMultiplier) : 0;

  const clearCart = () => {
    setCart([]); setDiscountAmt(0); setUseLoyalty(false);
    setUseGiftCard(false); setCashGiven(0); setSelectedClient(null);
  };

  const addToCart = (svc: any) => {
    setCart(prev => [...prev, { id: uid(), serviceId: svc.id, name: svc.name, price: svc.price, duration: svc.duration }]);
    setActiveTab("cart");
    if (svc.id) {
      incrementUsage(svc.id);
      setUsageMap(loadUsage());
    }
  };

  const sellMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      // Round to nearest 15-minute slot so it lands on a Planning grid row
      const roundedMins = Math.round(now.getMinutes() / 15) * 15;
      const roundedTime = new Date(now);
      roundedTime.setMinutes(roundedMins, 0, 0);
      const body = {
        date: format(roundedTime, "yyyy-MM-dd"),
        startTime: format(roundedTime, "HH:mm"),
        duration: totalDur || 30,
        client: selectedClient?.name || "عميل عابر",
        clientId: selectedClient?.id ?? null,
        phone: selectedClient?.phone ?? null,
        service: cart.map(c => c.name).join(" + ").slice(0, 255),
        servicesJson: cart.map(c => ({ name: c.name, price: c.price, duration: c.duration })),
        staff: selectedStaff?.name || "—",
        staffId: staffId ?? null,
        price: subtotal,
        total,
        paid: true,
        loyaltyPointsEarned: pointsEarned,
        loyaltyDiscountAmount: loyaltyDiscount,
        loyaltyPointsRedeemed: useLoyalty ? Math.ceil(loyaltyDiscount / (loyaltyRate / 100)) : 0,
        giftCardDiscountAmount: giftCardDiscount,
        bookingStatus: "completed",
        createdBy: "pos",
      };
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: async (apt) => {
      if (selectedClient) {
        // Server already awards points for paid appointments — only handle redemptions & gift card deductions here
        if (useLoyalty && loyaltyDiscount > 0) {
          const redeem = Math.ceil(loyaltyDiscount / (loyaltyRate / 100));
          const r = await fetch(`/api/clients/${selectedClient.id}/loyalty`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ points: -redeem, spent: 0 }),
          });
          if (!r.ok) toast({ title: "تحذير", description: "لم يتم خصم نقاط الولاء", variant: "destructive" });
        }
        if (giftCardDiscount > 0) {
          const r = await fetch(`/api/clients/${selectedClient.id}/gift-card-balance`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: -giftCardDiscount }),
          });
          if (!r.ok) toast({ title: "تحذير", description: "لم يتم خصم رصيد بطاقة الهدية", variant: "destructive" });
        }
      }
      autoPrint({
        businessName,
        currency,
        clientName: selectedClient?.name || "عميل عابر",
        clientPhone: selectedClient?.phone ?? undefined,
        services: cart.map(c => c.name).join(", "),
        staffName: selectedStaff?.name || "—",
        date: format(new Date(), "dd/MM/yyyy"),
        time: format(new Date(), "HH:mm"),
        duration: totalDur,
        total,
        appointmentId: apt.id,
        loyaltyPointsEarned: pointsEarned,
      }).catch(() => {});

      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "تمت عملية البيع ✅", description: `${total.toFixed(0)} ${currency}` });
      setDone(true);
      setTimeout(() => { clearCart(); setDone(false); setActiveTab("services"); }, 2500);
    },
    onError: () => toast({ title: "حدث خطأ", variant: "destructive" }),
  });

  const ServicesPane = (
    <div className="flex flex-col h-full gap-3">
      <div className="relative">
        <Search className={cn("absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none", isRtl ? "right-3" : "left-3")} />
        <Input
          placeholder="بحث في الخدمات..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={cn("h-9 text-sm", isRtl ? "pr-9" : "pl-9")}
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {hasFavorites && (
          <button
            onClick={() => setSelectedCat("favorites")}
            className={cn(
              "shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
              effectiveCat === "favorites" ? "bg-amber-500 text-white border-amber-500" : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-400"
            )}
          >
            <Star className="w-3 h-3 fill-current" />
            المفضلة
          </button>
        )}
        <button
          onClick={() => setSelectedCat("all")}
          className={cn(
            "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
            effectiveCat === "all" ? "bg-primary text-white border-primary" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
          )}
        >
          الكل
        </button>
        {allCats.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCat(cat)}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
              effectiveCat === cat ? "bg-primary text-white border-primary" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        {filteredServices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
            <Scissors className="w-10 h-10 mb-2 opacity-20" />
            <p className="text-sm">لا توجد خدمات</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {filteredServices.map((svc: any) => {
              const useCount = usageMap[svc.id] || 0;
              const isTopUsed = topServiceIds.includes(svc.id);
              return (
              <button
                key={svc.id}
                onClick={() => addToCart(svc)}
                className={cn(
                  "group flex flex-col items-start gap-0 rounded-xl border bg-card hover:bg-primary/5 hover:border-primary/40 active:scale-95 transition-all text-left shadow-sm overflow-hidden relative",
                  isTopUsed && "border-amber-200/80 dark:border-amber-700/40"
                )}
              >
                {isTopUsed && (
                  <span className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 bg-amber-400/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                    <Star className="w-2.5 h-2.5 fill-white" />
                    {useCount}×
                  </span>
                )}
                {svc.imageUrl && !imgErrors[svc.id] ? (
                  <div className="w-full h-24 overflow-hidden bg-muted/40 shrink-0">
                    <img
                      src={svc.imageUrl}
                      alt={svc.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={() => setImgErrors(prev => ({ ...prev, [svc.id]: true }))}
                    />
                  </div>
                ) : (
                  <div className={cn("w-full h-16 flex items-center justify-center shrink-0", isTopUsed ? "bg-amber-50/50 dark:bg-amber-900/10" : "bg-muted/20")}>
                    {svc.emoji
                      ? <span className="text-3xl leading-none">{svc.emoji}</span>
                      : <Scissors className="w-7 h-7 text-muted-foreground/25" />
                    }
                  </div>
                )}
                <div className="flex flex-col gap-1.5 p-2.5 w-full flex-1">
                  <span className="text-sm font-medium leading-tight line-clamp-2 group-hover:text-primary transition-colors w-full">
                    {svc.name}
                  </span>
                  <div className="flex items-center justify-between w-full mt-auto pt-1.5 border-t border-border/40">
                    <span className="text-[10px] text-muted-foreground">{svc.duration} min</span>
                    <span className="text-sm font-bold text-primary">{svc.price} {currency}</span>
                  </div>
                </div>
              </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  const CartPane = (
    <div className="flex flex-col h-full gap-3">
      {/* Client picker */}
      <div className="relative" ref={clientDropRef}>
        <button
          onClick={() => { setShowClients(v => !v); setClientSearch(""); }}
          className={cn(
            "w-full flex items-center gap-2 p-2.5 rounded-xl border text-sm transition-all",
            selectedClient ? "border-primary/40 bg-primary/5 text-primary" : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
          )}
        >
          <User className="w-4 h-4 shrink-0" />
          <span className="flex-1 truncate text-start">
            {selectedClient ? selectedClient.name : "عميل عابر"}
          </span>
          {selectedClient
            ? <button type="button" onClick={e => { e.stopPropagation(); setSelectedClient(null); setUseLoyalty(false); setUseGiftCard(false); }} className="shrink-0 hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
            : <span className="text-[10px] opacity-50 shrink-0">اختر...</span>
          }
        </button>
        {selectedClient && (
          <div className="flex gap-1.5 mt-1 flex-wrap">
            {selectedClient.loyaltyEnrolled && <Badge variant="outline" className="text-[9px] h-4 gap-0.5"><span>⭐</span>{selectedClient.loyaltyPoints} نقطة</Badge>}
            {Number(selectedClient.giftCardBalance ?? 0) > 0 && <Badge variant="outline" className="text-[9px] h-4 gap-0.5 text-green-600"><span>🎁</span>{Number(selectedClient.giftCardBalance).toFixed(0)} {currency}</Badge>}
          </div>
        )}
        {showClients && (
          <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-background border rounded-xl shadow-xl overflow-hidden">
            <div className="p-2 border-b">
              <Input autoFocus placeholder="بحث بالاسم أو الهاتف..." value={clientSearch} onChange={e => setClientSearch(e.target.value)} className="h-8 text-sm" />
            </div>
            <ScrollArea className="max-h-52">
              <div className="p-1">
                {filteredClients.map(c => (
                  <button
                    key={c.id}
                    className="w-full text-start px-3 py-2 hover:bg-muted rounded-lg transition-colors text-sm flex items-center gap-2"
                    onClick={() => { setSelectedClient(c); setShowClients(false); setUseLoyalty(!!(c.loyaltyEnrolled && Number(c.loyaltyPoints) > 0)); setUseGiftCard(!!(c.useGiftCardBalance && Number(c.giftCardBalance) > 0)); }}
                  >
                    <span className="flex-1 font-medium truncate">{c.name}</span>
                    {c.phone && <span className="text-xs text-muted-foreground shrink-0" dir="ltr">{c.phone}</span>}
                  </button>
                ))}
                {filteredClients.length === 0 && <p className="text-center text-xs text-muted-foreground py-3">لا يوجد</p>}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Staff picker — avatar cards */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground px-0.5">الموظفة</p>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {/* "None" card */}
          <button
            onClick={() => setStaffId(null)}
            className={cn(
              "flex flex-col items-center gap-1 shrink-0 transition-all",
              staffId === null ? "opacity-100" : "opacity-50 hover:opacity-80"
            )}
          >
            <div className={cn(
              "w-12 h-12 rounded-full border-2 flex items-center justify-center bg-muted/60 transition-all",
              staffId === null ? "border-primary shadow-md shadow-primary/20 scale-110" : "border-border"
            )}>
              <User className="w-5 h-5 text-muted-foreground" />
            </div>
            <span className={cn(
              "text-[9px] font-medium leading-tight text-center max-w-[52px] truncate",
              staffId === null ? "text-primary" : "text-muted-foreground"
            )}>أي</span>
          </button>

          {staffList.map((s: any) => {
            const isSelected = staffId === s.id;
            const initials = s.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
            return (
              <button
                key={s.id}
                onClick={() => setStaffId(s.id)}
                className={cn(
                  "flex flex-col items-center gap-1 shrink-0 transition-all",
                  isSelected ? "opacity-100" : "opacity-55 hover:opacity-80"
                )}
              >
                <div className={cn(
                  "w-12 h-12 rounded-full border-2 overflow-hidden transition-all",
                  isSelected ? "border-primary shadow-md shadow-primary/25 scale-110" : "border-border"
                )}>
                  {s.photoUrl ? (
                    <img src={s.photoUrl} alt={s.name} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-white text-sm font-bold"
                      style={{ backgroundColor: s.color || "#888" }}
                    >
                      {initials}
                    </div>
                  )}
                </div>
                <span className={cn(
                  "text-[9px] font-medium leading-tight text-center max-w-[52px] truncate",
                  isSelected ? "text-primary" : "text-muted-foreground"
                )}>
                  {s.name.split(" ")[0]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cart items */}
      <ScrollArea className="flex-1 min-h-0">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <ShoppingCart className="w-10 h-10 mb-2 opacity-20" />
            <p className="text-sm">السلة فارغة</p>
            <p className="text-xs mt-1 opacity-50">اختر خدمة من اليسار</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cart.map(item => (
              <div key={item.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/40 border border-border/30 group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.duration} min</p>
                </div>
                <span className="text-sm font-bold text-primary shrink-0">{item.price} {currency}</span>
                <button onClick={() => setCart(p => p.filter(i => i.id !== item.id))} className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {cart.length > 0 && (
        <div className="space-y-2.5 border-t pt-3 shrink-0">
          {/* Discount */}
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input
              type="number" min={0} max={subtotal}
              placeholder={`خصم (${currency})`}
              value={discountAmt || ""}
              onChange={e => setDiscountAmt(Math.max(0, Math.min(subtotal, Number(e.target.value))))}
              className="h-8 text-sm"
            />
          </div>

          {/* Loyalty toggle */}
          {canLoyalty && (
            <button
              onClick={() => setUseLoyalty(v => !v)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all",
                useLoyalty ? "border-yellow-400/60 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700" : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
              )}
            >
              <span className="text-base shrink-0">⭐</span>
              <span className="flex-1 text-start text-xs">نقاط ({selectedClient?.loyaltyPoints} نقطة)</span>
              <span className={cn("text-xs font-bold shrink-0", useLoyalty ? "text-yellow-700" : "text-muted-foreground")}>
                {useLoyalty ? `-${loyaltyDiscount.toFixed(0)} ${currency}` : "تفعيل"}
              </span>
            </button>
          )}

          {/* Gift card toggle */}
          {canGiftCard && (
            <button
              onClick={() => setUseGiftCard(v => !v)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all",
                useGiftCard ? "border-green-400/60 bg-green-50 dark:bg-green-900/20 text-green-700" : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
              )}
            >
              <span className="text-base shrink-0">🎁</span>
              <span className="flex-1 text-start text-xs">بطاقة هدية ({Number(selectedClient?.giftCardBalance).toFixed(0)} {currency})</span>
              <span className={cn("text-xs font-bold shrink-0", useGiftCard ? "text-green-700" : "text-muted-foreground")}>
                {useGiftCard ? `-${giftCardDiscount.toFixed(0)} ${currency}` : "تفعيل"}
              </span>
            </button>
          )}

          {/* Summary */}
          <div className="space-y-1 text-sm bg-muted/30 rounded-xl p-3">
            {subtotal !== total && (
              <div className="flex justify-between text-muted-foreground">
                <span>المجموع الجزئي</span><span>{subtotal.toFixed(0)} {currency}</span>
              </div>
            )}
            {discountAmt > 0 && <div className="flex justify-between text-orange-500"><span>خصم</span><span>-{discountAmt.toFixed(0)} {currency}</span></div>}
            {loyaltyDiscount > 0 && <div className="flex justify-between text-yellow-600"><span>نقاط الولاء</span><span>-{loyaltyDiscount.toFixed(0)} {currency}</span></div>}
            {giftCardDiscount > 0 && <div className="flex justify-between text-green-600"><span>بطاقة هدية</span><span>-{giftCardDiscount.toFixed(0)} {currency}</span></div>}
            <div className="flex justify-between items-center font-bold text-base border-t pt-2 mt-1">
              <span>الإجمالي</span>
              <span className="text-primary text-xl">{total.toFixed(0)} {currency}</span>
            </div>
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { key: "cash", icon: <Banknote className="w-4 h-4" />, label: "نقداً" },
              { key: "card", icon: <CreditCard className="w-4 h-4" />, label: "بطاقة" },
              { key: "split", icon: <span className="text-sm font-bold">½</span>, label: "مختلط" },
            ] as const).map(pm => (
              <button
                key={pm.key}
                onClick={() => setPayMethod(pm.key)}
                className={cn(
                  "flex flex-col items-center gap-1 p-2 rounded-xl border text-xs font-medium transition-all",
                  payMethod === pm.key ? "border-primary bg-primary/10 text-primary shadow-sm" : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                )}
              >
                {pm.icon}
                <span>{pm.label}</span>
              </button>
            ))}
          </div>

          {/* Cash given */}
          {payMethod === "cash" && total > 0 && (
            <div className="flex items-center gap-2">
              <Input
                type="number" min={0}
                placeholder={`مبلغ العميل ≥ ${total.toFixed(0)}`}
                value={cashGiven || ""}
                onChange={e => setCashGiven(Number(e.target.value))}
                className="h-8 text-sm flex-1"
              />
              {cashGiven >= total && cashGiven > 0 && (
                <span className="text-sm font-bold text-green-600 shrink-0">↩ {change.toFixed(0)}</span>
              )}
            </div>
          )}

          {pointsEarned > 0 && (
            <p className="text-[11px] text-center text-yellow-600 font-medium">⭐ سيكسب {pointsEarned} نقطة ولاء</p>
          )}

          {/* Complete button */}
          <Button
            className={cn(
              "w-full h-12 text-base font-bold gap-2 transition-all duration-300",
              done && "bg-green-500 hover:bg-green-500 border-green-500"
            )}
            disabled={cart.length === 0 || sellMutation.isPending || done}
            onClick={() => sellMutation.mutate()}
          >
            {done
              ? <><Check className="w-5 h-5" /> تمت العملية بنجاح!</>
              : sellMutation.isPending
                ? <><Loader2 className="w-5 h-5 animate-spin" /> جارٍ الحفظ...</>
                : <><Receipt className="w-5 h-5" /> إتمام البيع · {total.toFixed(0)} {currency}</>
            }
          </Button>

          <button onClick={clearCart} className="w-full text-xs text-muted-foreground hover:text-destructive transition-colors py-1 flex items-center justify-center gap-1">
            <Trash2 className="w-3 h-3" /> مسح السلة
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col" dir={isRtl ? "rtl" : "ltr"}>
      {/* ── Header ───────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 border-b shrink-0 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <ShoppingCart className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight">POS — نقطة البيع</h1>
          <p className="text-xs text-muted-foreground">بيع سريع بدون حجز مسبق</p>
        </div>
        {cart.length > 0 && (
          <Badge className="mr-auto bg-primary text-white">
            {cart.length} {cart.length === 1 ? "خدمة" : "خدمات"} · {subtotal.toFixed(0)} {currency}
          </Badge>
        )}
      </div>

      {/* ── Mobile tabs ──────────────────────────────── */}
      <div className="md:hidden flex border-b shrink-0">
        <button
          onClick={() => setActiveTab("services")}
          className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium border-b-2 transition-colors", activeTab === "services" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}
        >
          <Scissors className="w-4 h-4" />الخدمات
        </button>
        <button
          onClick={() => setActiveTab("cart")}
          className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium border-b-2 transition-colors relative", activeTab === "cart" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}
        >
          <ShoppingCart className="w-4 h-4" />
          السلة
          {cart.length > 0 && (
            <span className="ml-1 min-w-[18px] h-[18px] bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
              {cart.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Main layout ──────────────────────────────── */}
      <div className="flex-1 min-h-0 flex md:gap-4 md:p-4">
        {/* Services panel */}
        <div className={cn(
          "flex-1 min-w-0 p-3 md:p-0",
          activeTab === "services" ? "flex flex-col" : "hidden md:flex md:flex-col"
        )}>
          {ServicesPane}
        </div>

        {/* Vertical divider (desktop only) */}
        <div className="hidden md:block w-px bg-border shrink-0" />

        {/* Cart panel */}
        <div className={cn(
          "md:w-80 lg:w-96 shrink-0 p-3 md:p-0",
          activeTab === "cart" ? "flex flex-col" : "hidden md:flex md:flex-col"
        )}>
          {CartPane}
        </div>
      </div>
    </div>
  );
}
