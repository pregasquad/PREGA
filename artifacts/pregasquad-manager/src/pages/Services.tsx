import { useServices, useCategories, useCreateService, useCreateCategory, useDeleteService } from "@/hooks/use-salon-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Minus, Trash2, Tag, Scissors, Edit2, Package, RefreshCw, X, ChevronDown, ChevronRight, ImagePlus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormMessage, FormLabel } from "@/components/ui/form";
import { insertServiceSchema, insertCategorySchema } from "@shared/schema";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Product, Service, Category } from "@shared/schema";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";

const linkedProductItemSchema = z.object({ productId: z.number().int(), quantity: z.number().int().min(1).default(1) });
type LinkedProductItem = { productId: number; quantity: number };

const serviceFormSchema = insertServiceSchema.extend({
  price: z.coerce.number(),
  duration: z.coerce.number(),
  linkedProductId: z.coerce.number().optional().nullable(),
  linkedProductIds: z.array(linkedProductItemSchema).default([]),
  commissionPercent: z.coerce.number().min(0).max(100).default(50),
  emoji: z.string().max(10).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
});

function ServiceImagePicker({ value, onChange }: { value?: string | null; onChange: (url: string | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="flex items-center gap-3">
      <div
        onClick={() => fileRef.current?.click()}
        className="relative w-20 h-20 rounded-xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all overflow-hidden shrink-0"
      >
        {value ? (
          <img src={value} alt="صورة الخدمة" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <ImagePlus className="w-6 h-6" />
            <span className="text-[10px]">صورة</span>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="text-xs text-primary hover:underline text-start"
        >
          {value ? "تغيير الصورة" : "رفع صورة"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-destructive hover:underline text-start"
          >
            حذف الصورة
          </button>
        )}
        <p className="text-[10px] text-muted-foreground leading-tight">تُعرض في شاشة البيع</p>
      </div>
    </div>
  );
}

function normalizeLinkedProducts(raw: any): LinkedProductItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any) =>
    typeof item === "number" ? { productId: item, quantity: 1 } : { productId: item.productId, quantity: item.quantity ?? 1 }
  );
}

function LinkedProductPicker({ value, onChange, products }: {
  value: LinkedProductItem[];
  onChange: (v: LinkedProductItem[]) => void;
  products: Product[];
}) {
  const linked = value || [];
  const isLinked = (id: number) => linked.some(l => l.productId === id);
  const getQty = (id: number) => linked.find(l => l.productId === id)?.quantity ?? 1;

  const toggle = (id: number, checked: boolean) => {
    if (checked) onChange([...linked, { productId: id, quantity: 1 }]);
    else onChange(linked.filter(l => l.productId !== id));
  };
  const setQty = (id: number, delta: number) => {
    onChange(linked.map(l => l.productId === id ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l));
  };

  if (products.length === 0) return <p className="text-sm text-muted-foreground">لا توجد منتجات</p>;

  return (
    <div className="space-y-1.5 max-h-44 overflow-y-auto border rounded-md p-2">
      {products.map(p => (
        <div key={p.id} className={`flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors ${isLinked(p.id) ? "bg-primary/8" : ""}`}>
          <Checkbox
            id={`lp-${p.id}`}
            checked={isLinked(p.id)}
            onCheckedChange={(checked) => toggle(p.id, !!checked)}
          />
          <label htmlFor={`lp-${p.id}`} className="text-sm flex-1 cursor-pointer leading-tight">
            {p.name}
            <span className="text-muted-foreground text-xs ml-1">({p.quantity} متوفر)</span>
          </label>
          {isLinked(p.id) && (
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" data-testid={`button-qty-dec-${p.id}`}
                onClick={() => setQty(p.id, -1)}
                className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors">
                <Minus className="w-3 h-3" />
              </button>
              <span className="w-6 text-center text-sm font-semibold tabular-nums">{getQty(p.id)}</span>
              <button type="button" data-testid={`button-qty-inc-${p.id}`}
                onClick={() => setQty(p.id, 1)}
                className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors">
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Services() {
  const { t, i18n } = useTranslation();
  const { data: services = [] } = useServices();
  const { data: categories = [] } = useCategories();
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });
  const { toast } = useToast();
  
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [showAddService, setShowAddService] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());

  const toggleCategory = (categoryId: number) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const expandAll = () => setExpandedCategories(new Set(categories.map(c => c.id)));
  const collapseAll = () => setExpandedCategories(new Set());

  const createService = useCreateService();
  const updateServiceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/services/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      setEditingService(null);
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    }
  });

  const createCategory = useCreateCategory();
  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/categories/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setEditingCategory(null);
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    }
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    }
  });

  const deleteService = useDeleteService();

  const sForm = useForm({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: { name: "", price: 0, duration: 30, category: "", linkedProductId: null, linkedProductIds: [] as LinkedProductItem[], commissionPercent: 50, isStartingPrice: false, emoji: "", imageUrl: null }
  });

  const cForm = useForm({
    resolver: zodResolver(insertCategorySchema),
    defaultValues: { name: "" }
  });

  const editSForm = useForm({
    resolver: zodResolver(serviceFormSchema),
  });

  const editCForm = useForm({
    resolver: zodResolver(insertCategorySchema),
  });

  const onServiceSubmit = (data: any) => {
    createService.mutate(data, { onSuccess: () => sForm.reset() });
  };

  const onCategorySubmit = (data: any) => {
    createCategory.mutate(data, { onSuccess: () => cForm.reset() });
  };

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl mx-auto px-2 md:px-0 animate-fade-in" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-display font-bold">{t("services.pageTitle")}</h1>
          <p className="text-sm md:text-base text-muted-foreground">{t("services.pageDesc")}</p>
        </div>
        <Button
          variant="outline"
          size="icon"
          disabled={isRefreshing}
          onClick={async () => {
            setIsRefreshing(true);
            await queryClient.invalidateQueries();
            setIsRefreshing(false);
            toast({ title: t("common.refreshed"), description: t("common.dataUpdated") });
          }}
          title={t("common.refresh")}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button data-testid="button-add-service" onClick={() => { sForm.reset(); setShowAddService(true); }}>
          <Plus className="w-4 h-4" />
          {t("services.newService")}
        </Button>
        <Button data-testid="button-add-category" variant="outline" onClick={() => { cForm.reset(); setShowAddCategory(true); }}>
          <Tag className="w-4 h-4" />
          {t("services.newCategory")}
        </Button>
      </div>

      <div className="max-w-4xl space-y-4">
          <Card className="shadow-lg shadow-black/5 border-border/50">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <CardTitle>{t("services.currentServices")}</CardTitle>
              <div className="flex gap-1">
                <Button
                  data-testid="button-expand-all"
                  variant="ghost"
                  size="sm"
                  onClick={expandAll}
                  className="text-xs text-muted-foreground"
                >
                  {t("common.expandAll", { defaultValue: "Expand All" })}
                </Button>
                <Button
                  data-testid="button-collapse-all"
                  variant="ghost"
                  size="sm"
                  onClick={collapseAll}
                  className="text-xs text-muted-foreground"
                >
                  {t("common.collapseAll", { defaultValue: "Collapse All" })}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {categories.map(category => {
                const categoryServices = services.filter(s => s.category === category.name);
                const isExpanded = expandedCategories.has(category.id);
                return (
                  <div key={category.id} className="border rounded-lg overflow-hidden">
                    <button
                      data-testid={`button-toggle-category-${category.id}`}
                      className="w-full flex items-center justify-between p-3 hover-elevate transition-colors"
                      onClick={() => toggleCategory(category.id)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="text-sm font-bold uppercase truncate">{category.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">({categoryServices.length})</span>
                      </div>
                      <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" data-testid={`button-edit-category-${category.id}`} onClick={() => {
                          setEditingCategory(category);
                          editCForm.reset(category);
                        }}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" data-testid={`button-delete-category-${category.id}`} onClick={() => deleteCategoryMutation.mutate(category.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="border-t px-3 pb-3 pt-2 space-y-2">
                        {categoryServices.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2 text-center">{t("services.noServicesInCategory", { defaultValue: "No services in this category" })}</p>
                        ) : (
                          categoryServices.map(service => (
                            <div key={service.id} data-testid={`card-service-${service.id}`} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50 group">
                              {(service as any).imageUrl && (
                                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 mr-2 border border-border/40">
                                  <img src={(service as any).imageUrl} alt={service.name} className="w-full h-full object-cover" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <h4 className="font-semibold text-sm truncate">
                                  {!(service as any).imageUrl && (service as any).emoji && <span className="mr-1">{(service as any).emoji}</span>}
                                  {service.name}
                                </h4>
                                <p className="text-xs text-muted-foreground">{service.duration} {t("common.minutes")} • {service.isStartingPrice ? `${t("services.startingFrom")} ` : ''}{service.price} DH • {t("services.commission")} {service.commissionPercent ?? 50}%</p>
                                {(() => {
                                  const items = normalizeLinkedProducts(service.linkedProductIds);
                                  const legacyId = service.linkedProductId;
                                  const allItems = items.length > 0 ? items : (legacyId ? [{ productId: legacyId, quantity: 1 }] : []);
                                  if (allItems.length === 0) return null;
                                  return (
                                    <div className="text-xs text-primary flex items-center gap-1 mt-1 flex-wrap">
                                      <Package className="w-3 h-3" />
                                      {allItems.map(({ productId, quantity }) => {
                                        const prod = products?.find(p => p.id === productId);
                                        return prod ? `${prod.name} ×${quantity}` : null;
                                      }).filter(Boolean).join(" · ")}
                                    </div>
                                  );
                                })()}
                              </div>
                              <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" data-testid={`button-edit-service-${service.id}`} onClick={() => {
                                  setEditingService(service);
                                  editSForm.reset({
                                    ...service,
                                    linkedProductIds: normalizeLinkedProducts(service.linkedProductIds),
                                  });
                                }}>
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" data-testid={`button-delete-service-${service.id}`} onClick={() => deleteService.mutate(service.id)}>
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
      </div>

      <Dialog open={showAddService} onOpenChange={setShowAddService}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Scissors className="w-5 h-5 text-primary" />{t("services.newService")}</DialogTitle></DialogHeader>
          <Form {...sForm}>
            <form onSubmit={sForm.handleSubmit((data) => {
              createService.mutate(data, { onSuccess: () => { sForm.reset(); setShowAddService(false); } });
            })} className="space-y-4">
              <FormField
                control={sForm.control}
                name="imageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("services.serviceImage", "صورة الخدمة")}</FormLabel>
                    <FormControl>
                      <ServiceImagePicker value={field.value} onChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="flex gap-3">
                <FormField
                  control={sForm.control}
                  name="emoji"
                  render={({ field }) => (
                    <FormItem className="w-20 shrink-0">
                      <FormLabel>{t("services.emoji", "إيموجي")}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} placeholder="💅" className="text-center text-xl" maxLength={2} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={sForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>{t("services.serviceName")}</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <FormField
                  control={sForm.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.price")}</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={sForm.control}
                  name="duration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.duration")}</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={sForm.control}
                  name="commissionPercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("services.commissionPercent")}</FormLabel>
                      <FormControl><Input type="number" min={0} max={100} {...field} /></FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={sForm.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("services.category")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder={t("services.selectCategory")} /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={sForm.control}
                name="linkedProductIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      {t("services.linkedProducts")} ({t("services.optional")})
                    </FormLabel>
                    <LinkedProductPicker
                      value={field.value as LinkedProductItem[]}
                      onChange={field.onChange}
                      products={products ?? []}
                    />
                    <p className="text-xs text-muted-foreground">{t("services.autoDeductNote")}</p>
                  </FormItem>
                )}
              />
              <FormField
                control={sForm.control}
                name="isStartingPrice"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="text-sm font-normal cursor-pointer">
                      {t("services.startingPrice")}
                    </FormLabel>
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={createService.isPending}>{t("common.add")}</Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddCategory} onOpenChange={setShowAddCategory}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Tag className="w-5 h-5 text-primary" />{t("services.newCategory")}</DialogTitle></DialogHeader>
          <Form {...cForm}>
            <form onSubmit={cForm.handleSubmit((data) => {
              createCategory.mutate(data, { onSuccess: () => { cForm.reset(); setShowAddCategory(false); } });
            })} className="space-y-4">
              <FormField
                control={cForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormControl><Input placeholder={t("services.categoryName")} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={createCategory.isPending}>{t("common.add")}</Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingService} onOpenChange={() => setEditingService(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("services.editService")}</DialogTitle></DialogHeader>
          <Form {...editSForm}>
            <form onSubmit={editSForm.handleSubmit((data) => updateServiceMutation.mutate({ id: editingService!.id, data }))} className="space-y-4">
              <FormField control={editSForm.control} name="imageUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("services.serviceImage", "صورة الخدمة")}</FormLabel>
                  <FormControl>
                    <ServiceImagePicker value={field.value} onChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )} />
              <div className="flex gap-3">
                <FormField control={editSForm.control} name="emoji" render={({ field }) => (
                  <FormItem className="w-20 shrink-0">
                    <FormLabel>{t("services.emoji", "إيموجي")}</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} placeholder="💅" className="text-center text-xl" maxLength={2} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={editSForm.control} name="name" render={({ field }) => (
                  <FormItem className="flex-1"><FormLabel>{t("common.name")}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editSForm.control} name="price" render={({ field }) => (
                  <FormItem><FormLabel>{t("common.price")}</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={editSForm.control} name="duration" render={({ field }) => (
                  <FormItem><FormLabel>{t("common.duration")}</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
                )} />
              </div>
              <FormField
                control={editSForm.control}
                name="isStartingPrice"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={!!field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="text-sm font-normal cursor-pointer">
                      {t("services.startingPrice")}
                    </FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={editSForm.control}
                name="linkedProductIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      {t("services.linkedProducts")}
                    </FormLabel>
                    <LinkedProductPicker
                      value={field.value as LinkedProductItem[]}
                      onChange={field.onChange}
                      products={products ?? []}
                    />
                    <p className="text-xs text-muted-foreground">{t("services.autoDeductNote")}</p>
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={updateServiceMutation.isPending}>{t("common.save")}</Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingCategory} onOpenChange={() => setEditingCategory(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("services.editCategory")}</DialogTitle></DialogHeader>
          <Form {...editCForm}>
            <form onSubmit={editCForm.handleSubmit((data) => updateCategoryMutation.mutate({ id: editingCategory!.id, data }))} className="space-y-4">
              <FormField control={editCForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>{t("common.name")}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={updateCategoryMutation.isPending}>{t("common.save")}</Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
