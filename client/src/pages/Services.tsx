import { useServices, useCategories, useCreateService, useCreateCategory, useDeleteService } from "@/hooks/use-salon-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Tag, Scissors, Edit2, Package, RefreshCw, X, ChevronDown, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormMessage, FormLabel } from "@/components/ui/form";
import { insertServiceSchema, insertCategorySchema } from "@shared/schema";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Product, Service, Category } from "@shared/schema";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";

const serviceFormSchema = insertServiceSchema.extend({
  price: z.coerce.number(),
  duration: z.coerce.number(),
  linkedProductId: z.coerce.number().optional().nullable(),
  linkedProductIds: z.array(z.number()).default([]),
  commissionPercent: z.coerce.number().min(0).max(100).default(50),
});

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
    }
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
    }
  });

  const deleteService = useDeleteService();

  const sForm = useForm({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: { name: "", price: 0, duration: 30, category: "", linkedProductId: null, linkedProductIds: [] as number[], commissionPercent: 50, isStartingPrice: false }
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
          onClick={() => {
            queryClient.invalidateQueries();
            toast({ title: t("common.refreshed"), description: t("common.dataUpdated") });
          }}
          title={t("common.refresh")}
        >
          <RefreshCw className="h-4 w-4" />
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
                              <div className="min-w-0">
                                <h4 className="font-semibold text-sm truncate">{service.name}</h4>
                                <p className="text-xs text-muted-foreground">{service.duration} {t("common.minutes")} • {service.isStartingPrice ? `${t("services.startingFrom")} ` : ''}{service.price} DH • {t("services.commission")} {service.commissionPercent ?? 50}%</p>
                                {(((service.linkedProductIds as number[] | null | undefined) || []).length > 0 || service.linkedProductId) && (
                                  <div className="text-xs text-primary flex items-center gap-1 mt-1 flex-wrap">
                                    <Package className="w-3 h-3" />
                                    {((service.linkedProductIds as number[] | null | undefined) || []).length > 0 
                                      ? ((service.linkedProductIds as number[]) || []).map(id => products?.find(p => p.id === id)?.name).filter(Boolean).join(", ")
                                      : products?.find(p => p.id === service.linkedProductId)?.name || t("services.linkedProduct")
                                    }
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" data-testid={`button-edit-service-${service.id}`} onClick={() => {
                                  setEditingService(service);
                                  editSForm.reset(service);
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
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("services.serviceName")}</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                    <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                      {products?.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t("services.noProductsAvailable")}</p>
                      ) : (
                        products?.map((p) => (
                          <div key={p.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`product-${p.id}`}
                              checked={(field.value || []).includes(p.id)}
                              onCheckedChange={(checked) => {
                                const current = field.value || [];
                                if (checked) {
                                  field.onChange([...current, p.id]);
                                } else {
                                  field.onChange(current.filter((id: number) => id !== p.id));
                                }
                              }}
                            />
                            <label htmlFor={`product-${p.id}`} className="text-sm cursor-pointer">
                              {p.name} ({p.quantity} {t("services.inStock")})
                            </label>
                          </div>
                        ))
                      )}
                    </div>
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
              <FormField control={editSForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>{t("common.name")}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
              )} />
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
                    <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                      {products?.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t("services.noProductsAvailable")}</p>
                      ) : (
                        products?.map((p) => (
                          <div key={p.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`edit-product-${p.id}`}
                              checked={(field.value || []).includes(p.id)}
                              onCheckedChange={(checked) => {
                                const current = field.value || [];
                                if (checked) {
                                  field.onChange([...current, p.id]);
                                } else {
                                  field.onChange(current.filter((id: number) => id !== p.id));
                                }
                              }}
                            />
                            <label htmlFor={`edit-product-${p.id}`} className="text-sm cursor-pointer">
                              {p.name} ({p.quantity} {t("services.inStock")})
                            </label>
                          </div>
                        ))
                      )}
                    </div>
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full">{t("common.save")}</Button>
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
              <Button type="submit" className="w-full">{t("common.save")}</Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
