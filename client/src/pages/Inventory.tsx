import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Minus, Package, Trash2, Edit2, UserPlus } from "lucide-react";
import { LogoSpinner } from "@/components/LogoSpinner";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProductSchema, insertStaffSchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useState } from "react";
import type { Product } from "@shared/schema";
import { useTranslation } from "react-i18next";

export default function Inventory() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isStaffDialogOpen, setIsStaffDialogOpen] = useState(false);

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const productForm = useForm({
    resolver: zodResolver(insertProductSchema),
    defaultValues: { name: "", quantity: 0, lowStockThreshold: 5 }
  });

  const staffForm = useForm({
    resolver: zodResolver(insertStaffSchema),
    defaultValues: { name: "", color: "#" + Math.floor(Math.random()*16777215).toString(16) }
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/products", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      productForm.reset();
      toast({ title: t("inventory.productAdded") });
    }
  });

  const createStaffMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/staff", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      setIsStaffDialogOpen(false);
      staffForm.reset();
      toast({ title: t("staff.staffAdded") });
    }
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/products/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setEditingProduct(null);
      toast({ title: t("inventory.productUpdated") });
    }
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: t("inventory.productDeleted") });
    }
  });

  const updateStockMutation = useMutation({
    mutationFn: async ({ id, quantity }: { id: number; quantity: number }) => {
      const res = await apiRequest("PATCH", `/api/products/${id}/quantity`, { quantity });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LogoSpinner size="md" />
      </div>
    );
  }

  return (
    <div className="p-2 md:p-4 lg:p-6 space-y-4 md:space-y-6" dir={i18n.language === "ar" ? "rtl" : "ltr"}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 md:gap-4">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">{t("inventory.title")}</h1>
        <div className="flex gap-2">
          <Dialog open={isStaffDialogOpen} onOpenChange={setIsStaffDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <UserPlus className="h-4 w-4" />
                {t("staff.addStaff")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("staff.addStaff")}</DialogTitle></DialogHeader>
              <Form {...staffForm}>
                <form onSubmit={staffForm.handleSubmit((data) => createStaffMutation.mutate(data))} className="space-y-4">
                  <FormField control={staffForm.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>{t("common.name")}</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={staffForm.control} name="color" render={({ field }) => (
                    <FormItem><FormLabel>{t("staff.color")}</FormLabel><FormControl><Input type="color" {...field} /></FormControl></FormItem>
                  )} />
                  <Button type="submit" className="w-full" disabled={createStaffMutation.isPending}>{t("common.add")}</Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                {t("inventory.newProduct")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("inventory.newProduct")}</DialogTitle>
              </DialogHeader>
              <Form {...productForm}>
                <form onSubmit={productForm.handleSubmit((data) => createProductMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={productForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("inventory.productName")}</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={productForm.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("inventory.quantity")}</FormLabel>
                        <FormControl><Input type="number" value={field.value ?? 0} onChange={e => field.onChange(parseInt(e.target.value) || 0)} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={productForm.control}
                    name="lowStockThreshold"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("inventory.minStock")}</FormLabel>
                        <FormControl><Input type="number" value={field.value ?? 5} onChange={e => field.onChange(parseInt(e.target.value) || 0)} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={createProductMutation.isPending}>{t("common.add")}</Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products?.map((product) => (
          <Card key={product.id} className="hover-elevate overflow-visible">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xl font-bold">{product.name}</CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" onClick={() => deleteProductMutation.mutate(product.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t("inventory.quantity")}:</span>
                  <span className={`text-2xl font-bold ${Number(product.quantity || 0) <= Number(product.lowStockThreshold || 2) ? 'text-destructive' : 'text-primary'}`}>
                    {product.quantity}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t("inventory.minStock")}:</span>
                  <span className="text-muted-foreground">{product.lowStockThreshold || 2}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => updateStockMutation.mutate({ id: product.id, quantity: Number(product.quantity || 0) + 1 })}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => updateStockMutation.mutate({ id: product.id, quantity: Math.max(0, Number(product.quantity || 0) - 1) })}
                    disabled={Number(product.quantity || 0) <= 0}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setEditingProduct(product);
                      productForm.reset({
                        name: product.name,
                        quantity: product.quantity ?? 0,
                        lowStockThreshold: product.lowStockThreshold ?? 5
                      });
                    }}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </div>

                <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
                  <DialogContent>
                    <DialogHeader><DialogTitle>{t("inventory.editProduct")}</DialogTitle></DialogHeader>
                    <Form {...productForm}>
                      <form onSubmit={productForm.handleSubmit((data) => updateProductMutation.mutate({ id: editingProduct!.id, data }))} className="space-y-4">
                        <FormField
                          control={productForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("inventory.productName")}</FormLabel>
                              <FormControl><Input {...field} /></FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={productForm.control}
                          name="quantity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("inventory.quantity")}</FormLabel>
                              <FormControl><Input type="number" value={field.value ?? 0} onChange={e => field.onChange(parseInt(e.target.value) || 0)} /></FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={productForm.control}
                          name="lowStockThreshold"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("inventory.minStock")}</FormLabel>
                              <FormControl><Input type="number" value={field.value ?? 5} onChange={e => field.onChange(parseInt(e.target.value) || 0)} /></FormControl>
                            </FormItem>
                          )}
                        />
                        <Button type="submit" className="w-full">{t("common.save")}</Button>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
                
                {Number(product.quantity || 0) <= Number(product.lowStockThreshold || 2) && (
                  <p className="text-xs text-destructive font-medium animate-pulse">
                    ⚠️ {t("inventory.stockAlert")}: {t("inventory.lowStock")}!
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
