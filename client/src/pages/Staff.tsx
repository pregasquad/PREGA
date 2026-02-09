import { useStaff, useCreateStaff, useUpdateStaff, useDeleteStaff, useCategories } from "@/hooks/use-salon-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Edit2, User, Phone, Mail, DollarSign, Palette, Tag, Calendar, Coffee, CalendarOff, Upload } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormMessage, FormLabel } from "@/components/ui/form";
import { insertStaffSchema } from "@shared/schema";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Staff as StaffType } from "@shared/schema";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import StaffScheduleManager from "@/components/StaffScheduleManager";
import { useToast } from "@/hooks/use-toast";

import { ImageCropper } from "@/components/ImageCropper";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useUpload } from "@/hooks/use-upload";

const staffFormSchema = insertStaffSchema.extend({
  baseSalary: z.coerce.number().min(0).optional(),
});

const STAFF_COLORS = [
  "#f97316", "#ef4444", "#22c55e", "#3b82f6", "#8b5cf6", 
  "#ec4899", "#14b8a6", "#f59e0b", "#6366f1", "#10b981"
];

export default function Staff() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const { data: staffList = [] } = useStaff();
  const { data: categories = [] } = useCategories();
  
  const [editingStaff, setEditingStaff] = useState<StaffType | null>(null);
  const [scheduleStaff, setScheduleStaff] = useState<StaffType | null>(null);
  const [scheduleTab, setScheduleTab] = useState<"schedule" | "breaks" | "timeoff">("schedule");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [currentFormInstance, setCurrentFormInstance] = useState<any>(null);

  const { toast } = useToast();
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const deleteStaff = useDeleteStaff();

  const form = useForm({
    resolver: zodResolver(staffFormSchema),
    defaultValues: { 
      name: "", 
      color: "#f97316", 
      phone: "", 
      email: "", 
      photoUrl: "",
      baseSalary: 0,
      categories: ""
    }
  });

  const editForm = useForm({
    resolver: zodResolver(staffFormSchema),
    defaultValues: { 
      name: "", 
      color: "#f97316", 
      phone: "", 
      email: "", 
      photoUrl: "",
      baseSalary: 0,
      categories: ""
    }
  });

  const onSubmit = async (data: z.infer<typeof staffFormSchema>) => {
    await createStaff.mutateAsync(data as any);
    form.reset();
    setIsAddDialogOpen(false);
  };

  const onEditSubmit = async (data: z.infer<typeof staffFormSchema>) => {
    if (editingStaff) {
      await updateStaff.mutateAsync({ id: editingStaff.id, ...data } as any);
      setEditingStaff(null);
    }
  };

  const handleEdit = (staff: StaffType) => {
    setEditingStaff(staff);
    editForm.reset({
      name: staff.name,
      color: staff.color,
      phone: staff.phone || "",
      email: staff.email || "",
      photoUrl: staff.photoUrl || "",
      baseSalary: staff.baseSalary || 0,
      categories: staff.categories || ""
    });
  };

  const handleDelete = async (id: number) => {
    if (confirm(t("staff.confirmDelete", { defaultValue: "Are you sure you want to delete this staff member?" }))) {
      await deleteStaff.mutateAsync(id);
    }
  };

  const openScheduleTab = (staff: StaffType, tab: "schedule" | "breaks" | "timeoff") => {
    setScheduleTab(tab);
    setScheduleStaff(staff);
  };

  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  const parseCategories = (cats: string | null | undefined): string[] => {
    if (!cats) return [];
    try {
      return JSON.parse(cats);
    } catch {
      return cats.split(",").map(c => c.trim()).filter(Boolean);
    }
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    if (!currentFormInstance) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      currentFormInstance.setValue("photoUrl", base64data);
      setCropImage(null);
      toast({ title: t("common.success"), description: "Photo updated locally" });
    };
    reader.readAsDataURL(croppedBlob);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include"
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Upload failed");
      }
      
      const { url } = await res.json();
      form.setValue("photoUrl", url);
      editForm.setValue("photoUrl", url);
      toast({ title: t("common.success"), description: "Photo uploaded" });
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    }
  };

  const StaffForm = ({ formInstance, onSubmitFn, buttonText }: { 
    formInstance: typeof form; 
    onSubmitFn: (data: z.infer<typeof staffFormSchema>) => Promise<void>;
    buttonText: string;
  }) => {
    const selectedCategories = parseCategories(formInstance.watch("categories"));
    
    const toggleCategory = (catName: string) => {
      const current = selectedCategories;
      const updated = current.includes(catName) 
        ? current.filter(c => c !== catName)
        : [...current, catName];
      formInstance.setValue("categories", JSON.stringify(updated));
    };

    const handleFileUploadLocal = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("file", file);
      
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
          credentials: "include"
        });
        
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || "Upload failed");
        }
        
        const { url } = await res.json();
        formInstance.setValue("photoUrl", url);
        toast({ title: t("common.success"), description: "Photo updated" });
      } catch (err: any) {
        toast({ title: t("common.error"), description: err.message, variant: "destructive" });
      }
    };

    return (
      <Form {...formInstance}>
        <form onSubmit={formInstance.handleSubmit(onSubmitFn)} className="space-y-4">
          <FormField
            control={formInstance.control}
            name="photoUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {t("staff.photoUrl", { defaultValue: "Profile Photo" })}
                </FormLabel>
                <FormControl>
                  <div className="flex flex-col gap-2">
                    {field.value && (
                      <div className="relative group w-20 h-20">
                        <img src={field.value} alt="Preview" className="w-20 h-20 rounded-full object-cover border group-hover:opacity-50 transition-opacity" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          <Edit2 className="h-5 w-5 text-white drop-shadow" />
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button 
                        type="button" 
                        variant="outline" 
                        className="w-full gap-2"
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = "image/*";
                          input.onchange = (e) => handleFileUploadLocal(e as any);
                          input.click();
                        }}
                      >
                        <Upload className="h-4 w-4" />
                        {t("staff.uploadPhoto", { defaultValue: "Upload Photo" })}
                      </Button>
                    </div>
                    <Input {...field} type="hidden" />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={formInstance.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {t("staff.name", { defaultValue: "Name" })}
                </FormLabel>
                <FormControl>
                  <Input {...field} placeholder={t("staff.namePlaceholder", { defaultValue: "Staff name" })} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={formInstance.control}
            name="color"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  {t("staff.color", { defaultValue: "Color" })}
                </FormLabel>
                <div className="flex gap-2 flex-wrap">
                  {STAFF_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => field.onChange(color)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        field.value === color ? "border-foreground scale-110" : "border-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={formInstance.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    {t("staff.phone", { defaultValue: "Phone" })}
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="06XXXXXXXX" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={formInstance.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    {t("staff.email", { defaultValue: "Email" })}
                  </FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder="email@example.com" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={formInstance.control}
            name="baseSalary"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  {t("staff.baseSalary", { defaultValue: "Base Salary" })}
                </FormLabel>
                <FormControl>
                  <Input {...field} type="number" min={0} step={100} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              {t("staff.categories", { defaultValue: "Service Categories" })}
            </Label>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <label 
                  key={cat.id} 
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                    selectedCategories.includes(cat.name) 
                      ? "bg-primary text-primary-foreground border-primary" 
                      : "bg-muted/50 hover:bg-muted"
                  }`}
                >
                  <Checkbox 
                    checked={selectedCategories.includes(cat.name)}
                    onCheckedChange={() => toggleCategory(cat.name)}
                    className="hidden"
                  />
                  <span className="text-sm">{cat.name}</span>
                </label>
              ))}
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={createStaff.isPending || updateStaff.isPending}>
            {buttonText}
          </Button>
        </form>
      </Form>
    );
  };

  return (
    <div className="space-y-6 p-4 md:p-6 animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold gradient-text">
            {t("staff.title", { defaultValue: "Staff Management" })}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("staff.subtitle", { defaultValue: "Manage your team members" })}
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              {t("staff.add", { defaultValue: "Add Staff" })}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("staff.addNew", { defaultValue: "Add New Staff Member" })}</DialogTitle>
            </DialogHeader>
            <StaffForm 
              formInstance={form} 
              onSubmitFn={onSubmit} 
              buttonText={t("staff.create", { defaultValue: "Create Staff" })} 
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {staffList.map((staff) => {
          const staffCategories = parseCategories(staff.categories);
          
          return (
            <Card key={staff.id} className="glass-card overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                  <div className="flex items-center gap-3 w-full min-w-0">
                    {staff.photoUrl ? (
                      <img 
                        src={staff.photoUrl} 
                        alt={staff.name}
                        className="w-12 h-12 rounded-full object-cover border-2 shrink-0"
                        style={{ borderColor: staff.color }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(staff.name)}&background=${staff.color.replace('#', '')}&color=fff`;
                        }}
                      />
                    ) : (
                      <div 
                        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
                        style={{ backgroundColor: staff.color }}
                      >
                        {getInitial(staff.name)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-lg truncate">{staff.name}</CardTitle>
                      {staff.baseSalary ? (
                        <CardDescription className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {staff.baseSalary.toLocaleString()} MAD
                        </CardDescription>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-wrap justify-center sm:justify-end shrink-0 w-full sm:w-auto border-t sm:border-0 pt-2 sm:pt-0">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => openScheduleTab(staff, "schedule")}
                      title={t("schedule.manageSchedule", "Manage Schedule")}
                      className="h-8 w-8"
                    >
                      <Calendar className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => openScheduleTab(staff, "breaks")}
                      title={t("schedule.addBreak", "Add Break")}
                      className="h-8 w-8"
                    >
                      <Coffee className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => openScheduleTab(staff, "timeoff")}
                      title={t("schedule.requestTimeOff", "Day Off")}
                      className="h-8 w-8"
                    >
                      <CalendarOff className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleEdit(staff)}
                      className="h-8 w-8"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleDelete(staff.id)}
                      className="text-destructive hover:text-destructive h-8 w-8"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {staff.phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    {staff.phone}
                  </div>
                )}
                {staff.email && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    {staff.email}
                  </div>
                )}
                {staffCategories.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {staffCategories.map(cat => (
                      <span 
                        key={cat} 
                        className="px-2 py-0.5 text-xs rounded-full bg-muted"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {staffList.length === 0 && (
        <Card className="glass-card p-8 text-center">
          <User className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">
            {t("staff.noStaff", { defaultValue: "No staff members yet" })}
          </h3>
          <p className="text-muted-foreground mb-4">
            {t("staff.addFirst", { defaultValue: "Add your first team member to get started" })}
          </p>
        </Card>
      )}

      <Dialog open={!!editingStaff} onOpenChange={(open) => !open && setEditingStaff(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("staff.edit", { defaultValue: "Edit Staff Member" })}</DialogTitle>
          </DialogHeader>
          <StaffForm 
            formInstance={editForm} 
            onSubmitFn={onEditSubmit} 
            buttonText={t("staff.save", { defaultValue: "Save Changes" })} 
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!scheduleStaff} onOpenChange={(open) => !open && setScheduleStaff(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("schedule.manageSchedule", { defaultValue: "Manage Schedule" })}</DialogTitle>
          </DialogHeader>
          {scheduleStaff && (
            <StaffScheduleManager 
              key={`${scheduleStaff.id}-${scheduleTab}`} 
              staff={scheduleStaff} 
              onClose={() => setScheduleStaff(null)} 
              defaultTab={scheduleTab} 
              // Removed invalid defaultTab property if it causes issues, assuming StaffScheduleManager supports it
            />
          )}
        </DialogContent>
      </Dialog>

      {cropImage && (
        <ImageCropper 
          imageSrc={cropImage} 
          onCropComplete={handleCropComplete} 
          onCancel={() => setCropImage(null)} 
        />
      )}
    </div>
  );
}
