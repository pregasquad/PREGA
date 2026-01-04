import { useServices, useCategories, useCreateService, useCreateCategory, useDeleteService } from "@/hooks/use-salon-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Tag, Scissors, Edit2, Package } from "lucide-react";
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

const serviceFormSchema = insertServiceSchema.extend({
  price: z.coerce.number(),
  duration: z.coerce.number(),
  linkedProductId: z.coerce.number().optional().nullable(),
  commissionPercent: z.coerce.number().min(0).max(100).default(50),
});

export default function Services() {
  const { t, i18n } = useTranslation();
  const { data: services = [] } = useServices();
  const { data: categories = [] } = useCategories();
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });
  
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

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
    defaultValues: { name: "", price: 0, duration: 30, category: "", linkedProductId: null, commissionPercent: 50 }
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
    <div className="space-y-6 max-w-5xl mx-auto" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
      <div>
        <h1 className="text-3xl font-display font-bold">{t("services.pageTitle")}</h1>
        <p className="text-muted-foreground">{t("services.pageDesc")}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card className="shadow-lg shadow-black/5 border-border/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Tag className="w-5 h-5 text-primary" />
                {t("services.newCategory")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...cForm}>
                <form onSubmit={cForm.handleSubmit(onCategorySubmit)} className="space-y-4">
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
            </CardContent>
          </Card>

          <Card className="shadow-lg shadow-black/5 border-border/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Scissors className="w-5 h-5 text-primary" />
                {t("services.newService")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...sForm}>
                <form onSubmit={sForm.handleSubmit(onServiceSubmit)} className="space-y-4">
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
                  <div className="grid grid-cols-3 gap-4">
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
                    name="linkedProductId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Package className="w-4 h-4" />
                          {t("services.linkedProduct")} ({t("services.optional")})
                        </FormLabel>
                        <Select 
                          onValueChange={(val) => field.onChange(val === "none" ? null : Number(val))} 
                          value={field.value ? String(field.value) : "none"}
                        >
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder={t("services.selectProduct")} /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">{t("services.noProduct")}</SelectItem>
                            {products?.map((p) => (
                              <SelectItem key={p.id} value={p.id.toString()}>
                                {p.name} ({p.quantity} {t("services.inStock")})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{t("services.autoDeductNote")}</p>
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={createService.isPending}>{t("common.add")}</Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-lg shadow-black/5 border-border/50">
            <CardHeader>
              <CardTitle>{t("services.currentServices")}</CardTitle>
            </CardHeader>
            <CardContent>
              {categories.map(category => {
                const categoryServices = services.filter(s => s.category === category.name);
                return (
                  <div key={category.id} className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-muted-foreground uppercase flex items-center gap-2">
                        {category.name}
                      </h3>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={() => {
                          setEditingCategory(category);
                          editCForm.reset(category);
                        }}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteCategoryMutation.mutate(category.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {categoryServices.map(service => (
                        <div key={service.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border group">
                          <div>
                            <h4 className="font-semibold">{service.name}</h4>
                            <p className="text-sm text-muted-foreground">{service.duration} {t("common.minutes")} • {service.price} DH • {t("services.commission")} {service.commissionPercent ?? 50}%</p>
                            {service.linkedProductId && (
                              <p className="text-xs text-primary flex items-center gap-1 mt-1">
                                <Package className="w-3 h-3" />
                                {products?.find(p => p.id === service.linkedProductId)?.name || t("services.linkedProduct")}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" onClick={() => {
                              setEditingService(service);
                              editSForm.reset(service);
                            }}>
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteService.mutate(service.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

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
                name="linkedProductId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      {t("services.linkedProduct")}
                    </FormLabel>
                    <Select 
                      onValueChange={(val) => field.onChange(val === "none" ? null : Number(val))} 
                      value={field.value ? String(field.value) : "none"}
                    >
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder={t("services.selectProduct")} /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">{t("services.noProduct")}</SelectItem>
                        {products?.map((p) => (
                          <SelectItem key={p.id} value={p.id.toString()}>
                            {p.name} ({p.quantity} {t("services.inStock")})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
