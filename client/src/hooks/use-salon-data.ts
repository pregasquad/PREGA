import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertAppointment, type InsertService, type InsertCategory, type InsertClient, type InsertStaff, type InsertStaffSchedule, type InsertStaffBreak, type InsertStaffTimeOff } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { getFromOfflineStore, saveToOfflineStore, addItemToOfflineStore, addToSyncQueue, updateItemInOfflineStore, deleteItemFromOfflineStore } from "@/lib/offlineDb";

type OfflineStoreName = 'appointments' | 'services' | 'categories' | 'staff' | 'clients' | 'charges' | 'products' | 'staffDeductions' | 'staffCommissions' | 'businessSettings';

// Helper to check if we should use offline mode
function shouldUseOffline(): boolean {
  return !navigator.onLine;
}

// Helper for offline-aware fetch
async function offlineFetch(url: string, options: RequestInit = {}): Promise<Response> {
  if (!navigator.onLine) {
    throw new Error('OFFLINE');
  }
  return fetch(url, { ...options, credentials: 'include' });
}

export function useBusinessSettings() {
  return useQuery<{
    businessName: string;
    currency: string;
    currencySymbol: string;
    openingTime: string;
    closingTime: string;
    workingDays: number[];
  }>({
    queryKey: ["/api/business-settings"],
    queryFn: async () => {
      if (navigator.onLine) {
        try {
          const res = await fetch("/api/business-settings", { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            await saveToOfflineStore('businessSettings', [data]).catch(() => {});
            return data;
          }
          if (res.status === 401) {
            const publicRes = await fetch("/api/public/settings");
            if (publicRes.ok) {
              const publicData = await publicRes.json();
              return { businessName: publicData.businessName || "PREGA SQUAD", currency: publicData.currency || "MAD", currencySymbol: publicData.currencySymbol || "DH", openingTime: "09:00", closingTime: "19:00", workingDays: [1, 2, 3, 4, 5, 6] };
            }
          }
        } catch (e) {
          console.log("[Offline] Network error, using cached business settings");
        }
      }
      const offlineData = await getFromOfflineStore<any>('businessSettings');
      if (offlineData.length > 0) return offlineData[0];
      return { businessName: "PREGA SQUAD", currency: "MAD", currencySymbol: "DH", openingTime: "09:00", closingTime: "19:00", workingDays: [1, 2, 3, 4, 5, 6] };
    },
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

export function useBusinessName() {
  const { data } = useBusinessSettings();
  return data?.businessName || "PREGA SQUAD";
}

export function useAppointments(date?: string) {
  return useQuery({
    queryKey: [api.appointments.list.path, date],
    queryFn: async () => {
      const url = date 
        ? `${api.appointments.list.path}?date=${date}` 
        : api.appointments.list.path;
      
      // Try online first
      if (navigator.onLine) {
        try {
          const res = await fetch(url, { credentials: "include" });
          if (res.ok) {
            const data = api.appointments.list.responses[200].parse(await res.json());
            // Cache for offline use
            if (!date) {
              await saveToOfflineStore('appointments', data).catch(() => {});
            }
            return data;
          }
        } catch (e) {
          console.log("[Offline] Network error, using cached data");
        }
      }
      
      // Fall back to offline data
      const offlineData = await getFromOfflineStore<any>('appointments');
      if (offlineData.length > 0) {
        // Filter by date if needed
        if (date) {
          return offlineData.filter((apt: any) => apt.date === date);
        }
        return offlineData;
      }
      
      throw new Error("No data available - please connect to the internet");
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false, // Don't retry if offline
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertAppointment & { _tempId?: number }) => {
      // Use tempId from onMutate context if available, otherwise generate one
      const tempId = data._tempId || -Date.now();
      const { _tempId, ...appointmentData } = data;
      
      const optimisticAppointment = {
        ...appointmentData,
        id: tempId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: null,
        updatedBy: null,
        _offline: true,
      };

      // If offline, save locally and queue for sync
      if (!navigator.onLine) {
        await addItemToOfflineStore('appointments', optimisticAppointment);
        await addToSyncQueue({
          method: 'POST',
          url: api.appointments.create.path,
          body: { ...appointmentData, _tempId: tempId, _store: 'appointments' },
        });
        return optimisticAppointment;
      }

      // Online - try to create on server
      try {
        const res = await fetch(api.appointments.create.path, {
          method: api.appointments.create.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(appointmentData),
          credentials: "include",
        });
        if (!res.ok) {
          if (res.status === 400) {
            const error = api.appointments.create.responses[400].parse(await res.json());
            throw new Error(error.message);
          }
          throw new Error("Failed to create appointment");
        }
        const result = api.appointments.create.responses[201].parse(await res.json());
        // Cache the new appointment
        await addItemToOfflineStore('appointments', result).catch(() => {});
        return result;
      } catch (error: any) {
        // Network error - save offline
        if (error.name === 'TypeError' || error.message.includes('fetch')) {
          await addItemToOfflineStore('appointments', optimisticAppointment);
          await addToSyncQueue({
            method: 'POST',
            url: api.appointments.create.path,
            body: { ...appointmentData, _tempId: tempId, _store: 'appointments' },
          });
          return optimisticAppointment;
        }
        throw error;
      }
    },
    onMutate: async (newAppointment) => {
      const dateQueryKey = [api.appointments.list.path, newAppointment.date];
      const allQueryKey = [api.appointments.list.path, undefined];
      
      await queryClient.cancelQueries({ queryKey: dateQueryKey });
      await queryClient.cancelQueries({ queryKey: allQueryKey });
      
      const previousDateData = queryClient.getQueryData(dateQueryKey);
      const previousAllData = queryClient.getQueryData(allQueryKey);
      
      const tempId = -Date.now();
      // Attach tempId to the data so mutationFn uses the same ID
      (newAppointment as any)._tempId = tempId;
      
      const optimisticAppointment = {
        ...newAppointment,
        id: tempId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: null,
        updatedBy: null,
      };
      
      if (previousDateData !== undefined) {
        queryClient.setQueryData(dateQueryKey, (old: any) => old ? [...old, optimisticAppointment] : [optimisticAppointment]);
      }
      if (previousAllData !== undefined) {
        queryClient.setQueryData(allQueryKey, (old: any) => old ? [...old, optimisticAppointment] : [optimisticAppointment]);
      }
      
      return { previousDateData, previousAllData, dateQueryKey, allQueryKey, tempId };
    },
    onSuccess: (data, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.dateQueryKey, (old: any) => old ? old.map((apt: any) => apt.id === context.tempId ? data : apt) : [data]);
        queryClient.setQueryData(context.allQueryKey, (old: any) => old ? old.map((apt: any) => apt.id === context.tempId ? data : apt) : [data]);
      }
      const isOffline = (data as any)?._offline;
      toast({ 
        title: isOffline ? "Saved Offline" : "Success", 
        description: isOffline ? "Appointment saved locally. Will sync when online." : "Appointment booked successfully" 
      });
    },
    onError: (err, _variables, context) => {
      if (context) {
        if (context.previousDateData !== undefined) {
          queryClient.setQueryData(context.dateQueryKey, context.previousDateData);
        }
        if (context.previousAllData !== undefined) {
          queryClient.setQueryData(context.allQueryKey, context.previousAllData);
        }
      }
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSettled: (_data, _error, variables) => {
      if (variables?.date) {
        queryClient.invalidateQueries({ queryKey: [api.appointments.list.path, variables.date] });
      }
      queryClient.invalidateQueries({ queryKey: [api.appointments.list.path, undefined] });
    },
  });
}

export function useUpdateAppointment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<InsertAppointment>) => {
      const url = buildUrl(api.appointments.update.path, { id });
      const updatedData = { ...data, updatedAt: new Date().toISOString() };
      
      // Offline mode
      if (!navigator.onLine) {
        await updateItemInOfflineStore('appointments', id, updatedData);
        await addToSyncQueue({
          method: 'PUT',
          url,
          body: { id, ...data, _store: 'appointments', _offlineUpdatedAt: updatedData.updatedAt },
        });
        return { id, ...updatedData, _offline: true };
      }
      
      try {
        const res = await fetch(url, {
          method: api.appointments.update.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to update appointment");
        const result = api.appointments.update.responses[200].parse(await res.json());
        await addItemToOfflineStore('appointments', result).catch(() => {});
        return result;
      } catch (error: any) {
        if (error.name === 'TypeError' || error.message.includes('fetch')) {
          await updateItemInOfflineStore('appointments', id, updatedData);
          await addToSyncQueue({ method: 'PUT', url, body: { id, ...data, _store: 'appointments', _offlineUpdatedAt: updatedData.updatedAt } });
          return { id, ...updatedData, _offline: true };
        }
        throw error;
      }
    },
    onMutate: async ({ id, ...data }) => {
      await queryClient.cancelQueries({ queryKey: [api.appointments.list.path] });
      const previousAppointments = queryClient.getQueriesData({ queryKey: [api.appointments.list.path] });
      
      queryClient.setQueriesData(
        { queryKey: [api.appointments.list.path] },
        (old: any) => old ? old.map((apt: any) => apt.id === id ? { ...apt, ...data, updatedAt: new Date().toISOString() } : apt) : old
      );
      
      return { previousAppointments };
    },
    onSuccess: (data) => {
      const isOffline = (data as any)?._offline;
      if (!isOffline) {
        queryClient.setQueriesData(
          { queryKey: [api.appointments.list.path] },
          (old: any) => old ? old.map((apt: any) => apt.id === data.id ? data : apt) : old
        );
      }
      toast({ 
        title: isOffline ? "Saved Offline" : "Success", 
        description: isOffline ? "Changes saved locally. Will sync when online." : "Appointment updated" 
      });
    },
    onError: (err, _variables, context) => {
      if (context?.previousAppointments) {
        context.previousAppointments.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      if (navigator.onLine) {
        queryClient.invalidateQueries({ queryKey: [api.appointments.list.path] });
      }
    },
  });
}

export function useDeleteAppointment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.appointments.delete.path, { id });
      
      // Offline mode
      if (!navigator.onLine) {
        await deleteItemFromOfflineStore('appointments', id);
        // Only queue sync if it's a real server ID (positive)
        if (id > 0) {
          await addToSyncQueue({ method: 'DELETE', url, body: { id, _store: 'appointments' } });
        }
        return { id, _offline: true };
      }
      
      try {
        const res = await fetch(url, {
          method: api.appointments.delete.method,
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete appointment");
        await deleteItemFromOfflineStore('appointments', id).catch(() => {});
        return { id };
      } catch (error: any) {
        if (error.name === 'TypeError' || error.message.includes('fetch')) {
          await deleteItemFromOfflineStore('appointments', id);
          if (id > 0) {
            await addToSyncQueue({ method: 'DELETE', url, body: { id, _store: 'appointments' } });
          }
          return { id, _offline: true };
        }
        throw error;
      }
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: [api.appointments.list.path] });
      const previousAppointments = queryClient.getQueriesData({ queryKey: [api.appointments.list.path] });
      
      queryClient.setQueriesData(
        { queryKey: [api.appointments.list.path] },
        (old: any) => old ? old.filter((apt: any) => apt.id !== id) : old
      );
      
      return { previousAppointments };
    },
    onSuccess: (result) => {
      const isOffline = (result as any)?._offline;
      toast({ 
        title: "Deleted", 
        description: isOffline ? "Deleted locally. Will sync when online." : "Appointment removed" 
      });
    },
    onError: (err, _variables, context) => {
      if (context?.previousAppointments) {
        context.previousAppointments.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      if (navigator.onLine) {
        queryClient.invalidateQueries({ queryKey: [api.appointments.list.path] });
      }
    },
  });
}

export function useServices() {
  return useQuery({
    queryKey: [api.services.list.path],
    queryFn: async () => {
      if (navigator.onLine) {
        try {
          const res = await fetch(api.services.list.path, { credentials: "include" });
          if (res.ok) {
            const data = api.services.list.responses[200].parse(await res.json());
            await saveToOfflineStore('services', data).catch(() => {});
            return data;
          }
        } catch (e) {
          console.log("[Offline] Network error, using cached services");
        }
      }
      const offlineData = await getFromOfflineStore<any>('services');
      if (offlineData.length > 0) return offlineData;
      throw new Error("No services available offline");
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: [api.categories.list.path],
    queryFn: async () => {
      if (navigator.onLine) {
        try {
          const res = await fetch(api.categories.list.path, { credentials: "include" });
          if (res.ok) {
            const data = api.categories.list.responses[200].parse(await res.json());
            await saveToOfflineStore('categories', data).catch(() => {});
            return data;
          }
        } catch (e) {
          console.log("[Offline] Network error, using cached categories");
        }
      }
      const offlineData = await getFromOfflineStore<any>('categories');
      if (offlineData.length > 0) return offlineData;
      throw new Error("No categories available offline");
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertService & { _tempId?: number }) => {
      const tempId = data._tempId || -Date.now();
      const { _tempId, ...serviceData } = data;
      
      const optimisticService = {
        ...serviceData,
        id: tempId,
        createdAt: new Date().toISOString(),
        _offline: true,
      };

      if (!navigator.onLine) {
        await addItemToOfflineStore('services', optimisticService);
        await addToSyncQueue({
          method: 'POST',
          url: api.services.create.path,
          body: { ...serviceData, _tempId: tempId, _store: 'services' },
        });
        return optimisticService;
      }

      try {
        const res = await fetch(api.services.create.path, {
          method: api.services.create.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(serviceData),
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to create service");
        const result = api.services.create.responses[201].parse(await res.json());
        await addItemToOfflineStore('services', result).catch(() => {});
        return result;
      } catch (error: any) {
        if (error.name === 'TypeError' || error.message.includes('fetch')) {
          await addItemToOfflineStore('services', optimisticService);
          await addToSyncQueue({
            method: 'POST',
            url: api.services.create.path,
            body: { ...serviceData, _tempId: tempId, _store: 'services' },
          });
          return optimisticService;
        }
        throw error;
      }
    },
    onMutate: async (newService) => {
      await queryClient.cancelQueries({ queryKey: [api.services.list.path] });
      const previous = queryClient.getQueryData([api.services.list.path]);
      const tempId = -Date.now();
      (newService as any)._tempId = tempId;
      queryClient.setQueryData([api.services.list.path], (old: any) => 
        old ? [...old, { ...newService, id: tempId }] : [{ ...newService, id: tempId }]
      );
      return { previous, tempId };
    },
    onSuccess: (data, _vars, context) => {
      if (context) {
        queryClient.setQueryData([api.services.list.path], (old: any) => 
          old ? old.map((s: any) => s.id === context.tempId ? data : s) : [data]
        );
      }
      const isOffline = (data as any)?._offline;
      toast({ 
        title: isOffline ? "Saved Offline" : "Success", 
        description: isOffline ? "Service saved locally. Will sync when online." : "Service created" 
      });
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData([api.services.list.path], context.previous);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<InsertService>) => {
      const url = buildUrl(api.services.update.path, { id });
      
      const offlineUpdatedAt = new Date().toISOString();
      if (!navigator.onLine) {
        await updateItemInOfflineStore('services', id, { ...data, updatedAt: offlineUpdatedAt });
        await addToSyncQueue({ method: 'PUT', url, body: { id, ...data, _store: 'services', _offlineUpdatedAt: offlineUpdatedAt } });
        return { id, ...data, updatedAt: offlineUpdatedAt, _offline: true };
      }

      try {
        const res = await fetch(url, {
          method: api.services.update.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to update service");
        const result = await res.json();
        await addItemToOfflineStore('services', result).catch(() => {});
        return result;
      } catch (error: any) {
        if (error.name === 'TypeError' || error.message.includes('fetch')) {
          const fallbackUpdatedAt = new Date().toISOString();
          await updateItemInOfflineStore('services', id, { ...data, updatedAt: fallbackUpdatedAt });
          await addToSyncQueue({ method: 'PUT', url, body: { id, ...data, _store: 'services', _offlineUpdatedAt: fallbackUpdatedAt } });
          return { id, ...data, updatedAt: fallbackUpdatedAt, _offline: true };
        }
        throw error;
      }
    },
    onMutate: async ({ id, ...data }) => {
      await queryClient.cancelQueries({ queryKey: [api.services.list.path] });
      const previous = queryClient.getQueryData([api.services.list.path]);
      queryClient.setQueryData([api.services.list.path], (old: any) => 
        old ? old.map((s: any) => s.id === id ? { ...s, ...data } : s) : old
      );
      return { previous };
    },
    onSuccess: (data) => {
      const isOffline = (data as any)?._offline;
      toast({ 
        title: isOffline ? "Saved Offline" : "Success", 
        description: isOffline ? "Changes saved locally. Will sync when online." : "Service updated" 
      });
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData([api.services.list.path], context.previous);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertCategory & { _tempId?: number }) => {
      const tempId = data._tempId || -Date.now();
      const { _tempId, ...categoryData } = data;
      
      const optimisticCategory = { ...categoryData, id: tempId, createdAt: new Date().toISOString(), _offline: true };

      if (!navigator.onLine) {
        await addItemToOfflineStore('categories', optimisticCategory);
        await addToSyncQueue({ method: 'POST', url: api.categories.create.path, body: { ...categoryData, _tempId: tempId, _store: 'categories' } });
        return optimisticCategory;
      }

      try {
        const res = await fetch(api.categories.create.path, {
          method: api.categories.create.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(categoryData),
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to create category");
        const result = api.categories.create.responses[201].parse(await res.json());
        await addItemToOfflineStore('categories', result).catch(() => {});
        return result;
      } catch (error: any) {
        if (error.name === 'TypeError' || error.message.includes('fetch')) {
          await addItemToOfflineStore('categories', optimisticCategory);
          await addToSyncQueue({ method: 'POST', url: api.categories.create.path, body: { ...categoryData, _tempId: tempId, _store: 'categories' } });
          return optimisticCategory;
        }
        throw error;
      }
    },
    onMutate: async (newCategory) => {
      await queryClient.cancelQueries({ queryKey: [api.categories.list.path] });
      const previous = queryClient.getQueryData([api.categories.list.path]);
      const tempId = -Date.now();
      (newCategory as any)._tempId = tempId;
      queryClient.setQueryData([api.categories.list.path], (old: any) => old ? [...old, { ...newCategory, id: tempId }] : [{ ...newCategory, id: tempId }]);
      return { previous, tempId };
    },
    onSuccess: (data, _vars, context) => {
      if (context) {
        queryClient.setQueryData([api.categories.list.path], (old: any) => old ? old.map((c: any) => c.id === context.tempId ? data : c) : [data]);
      }
      const isOffline = (data as any)?._offline;
      toast({ title: isOffline ? "Saved Offline" : "Success", description: isOffline ? "Category saved locally." : "Category created" });
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData([api.categories.list.path], context.previous);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<InsertCategory>) => {
      const url = buildUrl(api.categories.update.path, { id });
      const offlineUpdatedAt = new Date().toISOString();
      
      if (!navigator.onLine) {
        await updateItemInOfflineStore('categories', id, { ...data, updatedAt: offlineUpdatedAt });
        await addToSyncQueue({ method: 'PUT', url, body: { id, ...data, _store: 'categories', _offlineUpdatedAt: offlineUpdatedAt } });
        return { id, ...data, updatedAt: offlineUpdatedAt, _offline: true };
      }

      try {
        const res = await fetch(url, {
          method: api.categories.update.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to update category");
        const result = await res.json();
        await addItemToOfflineStore('categories', result).catch(() => {});
        return result;
      } catch (error: any) {
        if (error.name === 'TypeError' || error.message.includes('fetch')) {
          await updateItemInOfflineStore('categories', id, { ...data, updatedAt: offlineUpdatedAt });
          await addToSyncQueue({ method: 'PUT', url, body: { id, ...data, _store: 'categories', _offlineUpdatedAt: offlineUpdatedAt } });
          return { id, ...data, updatedAt: offlineUpdatedAt, _offline: true };
        }
        throw error;
      }
    },
    onMutate: async ({ id, ...data }) => {
      await queryClient.cancelQueries({ queryKey: [api.categories.list.path] });
      const previous = queryClient.getQueryData([api.categories.list.path]);
      queryClient.setQueryData([api.categories.list.path], (old: any) => old ? old.map((c: any) => c.id === id ? { ...c, ...data } : c) : old);
      return { previous };
    },
    onSuccess: (data) => {
      const isOffline = (data as any)?._offline;
      toast({ title: isOffline ? "Saved Offline" : "Success", description: isOffline ? "Changes saved locally." : "Category updated" });
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData([api.categories.list.path], context.previous);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteService() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.services.delete.path, { id });
      
      if (!navigator.onLine) {
        await deleteItemFromOfflineStore('services', id);
        if (id > 0) await addToSyncQueue({ method: 'DELETE', url, body: { id, _store: 'services' } });
        return { id, _offline: true };
      }

      try {
        const res = await fetch(url, {
          method: api.services.delete.method,
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete service");
        await deleteItemFromOfflineStore('services', id).catch(() => {});
        return { id };
      } catch (error: any) {
        if (error.name === 'TypeError' || error.message.includes('fetch')) {
          await deleteItemFromOfflineStore('services', id);
          if (id > 0) await addToSyncQueue({ method: 'DELETE', url, body: { id, _store: 'services' } });
          return { id, _offline: true };
        }
        throw error;
      }
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: [api.services.list.path] });
      const previous = queryClient.getQueryData([api.services.list.path]);
      queryClient.setQueryData([api.services.list.path], (old: any) => 
        old ? old.filter((s: any) => s.id !== id) : old
      );
      return { previous };
    },
    onSuccess: (result) => {
      const isOffline = (result as any)?._offline;
      toast({ 
        title: "Deleted", 
        description: isOffline ? "Deleted locally. Will sync when online." : "Service removed" 
      });
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData([api.services.list.path], context.previous);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useStaff() {
  return useQuery({
    queryKey: [api.staff.list.path],
    queryFn: async () => {
      if (navigator.onLine) {
        try {
          const res = await fetch(api.staff.list.path, { credentials: "include" });
          if (res.ok) {
            const data = api.staff.list.responses[200].parse(await res.json());
            await saveToOfflineStore('staff', data).catch(() => {});
            return data;
          }
        } catch (e) {
          console.log("[Offline] Network error, using cached staff");
        }
      }
      const offlineData = await getFromOfflineStore<any>('staff');
      if (offlineData.length > 0) return offlineData;
      throw new Error("No staff available offline");
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useCreateStaff() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertStaff & { _tempId?: number }) => {
      const tempId = data._tempId || -Date.now();
      const { _tempId, ...staffData } = data;
      
      const optimisticStaff = { ...staffData, id: tempId, createdAt: new Date().toISOString(), _offline: true };

      if (!navigator.onLine) {
        await addItemToOfflineStore('staff', optimisticStaff);
        await addToSyncQueue({ method: 'POST', url: api.staff.create.path, body: { ...staffData, _tempId: tempId, _store: 'staff' } });
        return optimisticStaff;
      }

      try {
        const res = await fetch(api.staff.create.path, {
          method: api.staff.create.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(staffData),
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to create staff");
        const result = api.staff.create.responses[201].parse(await res.json());
        await addItemToOfflineStore('staff', result).catch(() => {});
        return result;
      } catch (error: any) {
        if (error.name === 'TypeError' || error.message.includes('fetch')) {
          await addItemToOfflineStore('staff', optimisticStaff);
          await addToSyncQueue({ method: 'POST', url: api.staff.create.path, body: { ...staffData, _tempId: tempId, _store: 'staff' } });
          return optimisticStaff;
        }
        throw error;
      }
    },
    onMutate: async (newStaff) => {
      await queryClient.cancelQueries({ queryKey: [api.staff.list.path] });
      const previous = queryClient.getQueryData([api.staff.list.path]);
      const tempId = -Date.now();
      (newStaff as any)._tempId = tempId;
      queryClient.setQueryData([api.staff.list.path], (old: any) => old ? [...old, { ...newStaff, id: tempId }] : [{ ...newStaff, id: tempId }]);
      return { previous, tempId };
    },
    onSuccess: (data, _vars, context) => {
      if (context) {
        queryClient.setQueryData([api.staff.list.path], (old: any) => old ? old.map((s: any) => s.id === context.tempId ? data : s) : [data]);
      }
      const isOffline = (data as any)?._offline;
      toast({ title: isOffline ? "Saved Offline" : "Success", description: isOffline ? "Staff saved locally." : "Staff member added" });
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData([api.staff.list.path], context.previous);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateStaff() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<InsertStaff>) => {
      const url = buildUrl(api.staff.update.path, { id });
      const offlineUpdatedAt = new Date().toISOString();
      
      if (!navigator.onLine) {
        await updateItemInOfflineStore('staff', id, { ...data, updatedAt: offlineUpdatedAt });
        await addToSyncQueue({ method: 'PUT', url, body: { id, ...data, _store: 'staff', _offlineUpdatedAt: offlineUpdatedAt } });
        return { id, ...data, updatedAt: offlineUpdatedAt, _offline: true };
      }

      try {
        const res = await fetch(url, {
          method: api.staff.update.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to update staff");
        const result = await res.json();
        await addItemToOfflineStore('staff', result).catch(() => {});
        return result;
      } catch (error: any) {
        if (error.name === 'TypeError' || error.message.includes('fetch')) {
          await updateItemInOfflineStore('staff', id, { ...data, updatedAt: offlineUpdatedAt });
          await addToSyncQueue({ method: 'PUT', url, body: { id, ...data, _store: 'staff', _offlineUpdatedAt: offlineUpdatedAt } });
          return { id, ...data, updatedAt: offlineUpdatedAt, _offline: true };
        }
        throw error;
      }
    },
    onMutate: async ({ id, ...data }) => {
      await queryClient.cancelQueries({ queryKey: [api.staff.list.path] });
      const previous = queryClient.getQueryData([api.staff.list.path]);
      queryClient.setQueryData([api.staff.list.path], (old: any) => old ? old.map((s: any) => s.id === id ? { ...s, ...data } : s) : old);
      return { previous };
    },
    onSuccess: (data) => {
      const isOffline = (data as any)?._offline;
      toast({ title: isOffline ? "Saved Offline" : "Success", description: isOffline ? "Changes saved locally." : "Staff member updated" });
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData([api.staff.list.path], context.previous);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteStaff() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.staff.delete.path, { id });
      
      if (!navigator.onLine) {
        await deleteItemFromOfflineStore('staff', id);
        if (id > 0) await addToSyncQueue({ method: 'DELETE', url, body: { id, _store: 'staff' } });
        return { id, _offline: true };
      }

      try {
        const res = await fetch(url, { method: api.staff.delete.method, credentials: "include" });
        if (!res.ok) throw new Error("Failed to delete staff");
        await deleteItemFromOfflineStore('staff', id).catch(() => {});
        return { id };
      } catch (error: any) {
        if (error.name === 'TypeError' || error.message.includes('fetch')) {
          await deleteItemFromOfflineStore('staff', id);
          if (id > 0) await addToSyncQueue({ method: 'DELETE', url, body: { id, _store: 'staff' } });
          return { id, _offline: true };
        }
        throw error;
      }
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: [api.staff.list.path] });
      const previous = queryClient.getQueryData([api.staff.list.path]);
      queryClient.setQueryData([api.staff.list.path], (old: any) => old ? old.filter((s: any) => s.id !== id) : old);
      return { previous };
    },
    onSuccess: (result) => {
      const isOffline = (result as any)?._offline;
      toast({ title: "Deleted", description: isOffline ? "Deleted locally." : "Staff member removed" });
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData([api.staff.list.path], context.previous);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useClients() {
  return useQuery({
    queryKey: [api.clients.list.path],
    queryFn: async () => {
      if (navigator.onLine) {
        try {
          const res = await fetch(api.clients.list.path, { credentials: "include" });
          if (res.ok) {
            const data = api.clients.list.responses[200].parse(await res.json());
            await saveToOfflineStore('clients', data).catch(() => {});
            return data;
          }
        } catch (e) {
          console.log("[Offline] Network error, using cached clients");
        }
      }
      const offlineData = await getFromOfflineStore<any>('clients');
      if (offlineData.length > 0) return offlineData;
      throw new Error("No clients available offline");
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertClient & { _tempId?: number }) => {
      const tempId = data._tempId || -Date.now();
      const { _tempId, ...clientData } = data;
      
      const optimisticClient = { ...clientData, id: tempId, createdAt: new Date().toISOString(), _offline: true };

      if (!navigator.onLine) {
        await addItemToOfflineStore('clients', optimisticClient);
        await addToSyncQueue({ method: 'POST', url: api.clients.create.path, body: { ...clientData, _tempId: tempId, _store: 'clients' } });
        return optimisticClient;
      }

      try {
        const res = await fetch(api.clients.create.path, {
          method: api.clients.create.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(clientData),
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to create client");
        const result = api.clients.create.responses[201].parse(await res.json());
        await addItemToOfflineStore('clients', result).catch(() => {});
        return result;
      } catch (error: any) {
        if (error.name === 'TypeError' || error.message.includes('fetch')) {
          await addItemToOfflineStore('clients', optimisticClient);
          await addToSyncQueue({ method: 'POST', url: api.clients.create.path, body: { ...clientData, _tempId: tempId, _store: 'clients' } });
          return optimisticClient;
        }
        throw error;
      }
    },
    onMutate: async (newClient) => {
      await queryClient.cancelQueries({ queryKey: [api.clients.list.path] });
      const previous = queryClient.getQueryData([api.clients.list.path]);
      const tempId = -Date.now();
      (newClient as any)._tempId = tempId;
      queryClient.setQueryData([api.clients.list.path], (old: any) => old ? [...old, { ...newClient, id: tempId }] : [{ ...newClient, id: tempId }]);
      return { previous, tempId };
    },
    onSuccess: (data, _vars, context) => {
      if (context) {
        queryClient.setQueryData([api.clients.list.path], (old: any) => old ? old.map((c: any) => c.id === context.tempId ? data : c) : [data]);
      }
      const isOffline = (data as any)?._offline;
      toast({ title: isOffline ? "Saved Offline" : "Success", description: isOffline ? "Client saved locally." : "Client added" });
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData([api.clients.list.path], context.previous);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<InsertClient>) => {
      const url = buildUrl(api.clients.update.path, { id });
      const offlineUpdatedAt = new Date().toISOString();
      
      if (!navigator.onLine) {
        await updateItemInOfflineStore('clients', id, { ...data, updatedAt: offlineUpdatedAt });
        await addToSyncQueue({ method: 'PUT', url, body: { id, ...data, _store: 'clients', _offlineUpdatedAt: offlineUpdatedAt } });
        return { id, ...data, updatedAt: offlineUpdatedAt, _offline: true };
      }

      try {
        const res = await fetch(url, {
          method: api.clients.update.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to update client");
        const result = await res.json();
        await addItemToOfflineStore('clients', result).catch(() => {});
        return result;
      } catch (error: any) {
        if (error.name === 'TypeError' || error.message.includes('fetch')) {
          await updateItemInOfflineStore('clients', id, { ...data, updatedAt: offlineUpdatedAt });
          await addToSyncQueue({ method: 'PUT', url, body: { id, ...data, _store: 'clients', _offlineUpdatedAt: offlineUpdatedAt } });
          return { id, ...data, updatedAt: offlineUpdatedAt, _offline: true };
        }
        throw error;
      }
    },
    onMutate: async ({ id, ...data }) => {
      await queryClient.cancelQueries({ queryKey: [api.clients.list.path] });
      const previous = queryClient.getQueryData([api.clients.list.path]);
      queryClient.setQueryData([api.clients.list.path], (old: any) => old ? old.map((c: any) => c.id === id ? { ...c, ...data } : c) : old);
      return { previous };
    },
    onSuccess: (data) => {
      const isOffline = (data as any)?._offline;
      toast({ title: isOffline ? "Saved Offline" : "Success", description: isOffline ? "Changes saved locally." : "Client updated" });
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData([api.clients.list.path], context.previous);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.clients.delete.path, { id });
      
      if (!navigator.onLine) {
        await deleteItemFromOfflineStore('clients', id);
        if (id > 0) await addToSyncQueue({ method: 'DELETE', url, body: { id, _store: 'clients' } });
        return { id, _offline: true };
      }

      try {
        const res = await fetch(url, { method: api.clients.delete.method, credentials: "include" });
        if (!res.ok) throw new Error("Failed to delete client");
        await deleteItemFromOfflineStore('clients', id).catch(() => {});
        return { id };
      } catch (error: any) {
        if (error.name === 'TypeError' || error.message.includes('fetch')) {
          await deleteItemFromOfflineStore('clients', id);
          if (id > 0) await addToSyncQueue({ method: 'DELETE', url, body: { id, _store: 'clients' } });
          return { id, _offline: true };
        }
        throw error;
      }
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: [api.clients.list.path] });
      const previous = queryClient.getQueryData([api.clients.list.path]);
      queryClient.setQueryData([api.clients.list.path], (old: any) => old ? old.filter((c: any) => c.id !== id) : old);
      return { previous };
    },
    onSuccess: (result) => {
      const isOffline = (result as any)?._offline;
      toast({ title: "Deleted", description: isOffline ? "Deleted locally." : "Client removed" });
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData([api.clients.list.path], context.previous);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ["/api/products"],
    queryFn: async () => {
      if (navigator.onLine) {
        try {
          const res = await fetch("/api/products", { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            await saveToOfflineStore('products', data).catch(() => {});
            return data;
          }
        } catch (e) {
          console.log("[Offline] Network error, using cached products");
        }
      }
      const offlineData = await getFromOfflineStore<any>('products');
      if (offlineData.length > 0) return offlineData;
      throw new Error("No products available offline");
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useStaffSchedule(staffId: number | undefined) {
  return useQuery({
    queryKey: ["/api/staff", staffId, "schedule"],
    queryFn: async () => {
      if (!staffId) return [];
      const res = await fetch(`/api/staff/${staffId}/schedule`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch staff schedule");
      return res.json();
    },
    enabled: !!staffId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveStaffSchedule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ staffId, schedules }: { staffId: number; schedules: Array<{ dayOfWeek: number; startTime: string; endTime: string; isActive: boolean }> }) => {
      const res = await fetch(`/api/staff/${staffId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedules),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save schedule");
      return res.json();
    },
    onSuccess: (_data, { staffId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff", staffId, "schedule"] });
      toast({ title: "Success", description: "Schedule saved successfully" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useStaffBreaks(staffId: number | undefined, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["/api/staff", staffId, "breaks", startDate, endDate],
    queryFn: async () => {
      if (!staffId) return [];
      let url = `/api/staff/${staffId}/breaks`;
      if (startDate && endDate) {
        url += `?startDate=${startDate}&endDate=${endDate}`;
      }
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch staff breaks");
      return res.json();
    },
    enabled: !!staffId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateStaffBreak() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertStaffBreak) => {
      const res = await fetch("/api/staff/breaks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to add break");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff", variables.staffId, "breaks"] });
      toast({ title: "Success", description: "Break added successfully" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteStaffBreak() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, staffId }: { id: number; staffId: number }) => {
      const res = await fetch(`/api/staff/breaks/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete break");
      return { id, staffId };
    },
    onSuccess: (_data, { staffId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff", staffId, "breaks"] });
      toast({ title: "Deleted", description: "Break removed" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useStaffTimeOff(staffId: number | undefined) {
  return useQuery({
    queryKey: ["/api/staff", staffId, "time-off"],
    queryFn: async () => {
      if (!staffId) return [];
      const res = await fetch(`/api/staff/${staffId}/time-off`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch time off");
      return res.json();
    },
    enabled: !!staffId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAllStaffTimeOff() {
  return useQuery({
    queryKey: ["/api/staff/time-off/all"],
    queryFn: async () => {
      const res = await fetch("/api/staff/time-off/all", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch all time off");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateStaffTimeOff() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertStaffTimeOff) => {
      const res = await fetch("/api/staff/time-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create time off request");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff", variables.staffId, "time-off"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/time-off/all"] });
      toast({ title: "Success", description: "Time off request created" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateStaffTimeOff() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, staffId, ...data }: { id: number; staffId: number; status?: string }) => {
      const res = await fetch(`/api/staff/time-off/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update time off request");
      return res.json();
    },
    onSuccess: (_data, { staffId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff", staffId, "time-off"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/time-off/all"] });
      toast({ title: "Success", description: "Time off request updated" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteStaffTimeOff() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, staffId }: { id: number; staffId: number }) => {
      const res = await fetch(`/api/staff/time-off/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete time off request");
      return { id, staffId };
    },
    onSuccess: (_data, { staffId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff", staffId, "time-off"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/time-off/all"] });
      toast({ title: "Deleted", description: "Time off request removed" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function usePublicStaffAvailability(staffId: number | undefined, date?: string) {
  return useQuery({
    queryKey: ["/api/public/staff", staffId, "availability", date],
    queryFn: async () => {
      if (!staffId) return null;
      let url = `/api/public/staff/${staffId}/availability`;
      if (date) url += `?date=${date}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch staff availability");
      return res.json() as Promise<{
        schedules: Array<{ dayOfWeek: number; startTime: string; endTime: string; isActive: boolean }>;
        breaks: Array<{ date: string; startTime: string; endTime: string }>;
        timeOffs: Array<{ startDate: string; endDate: string }>;
      }>;
    },
    enabled: !!staffId,
    staleTime: 5 * 60 * 1000,
  });
}

export type StaffAvailabilityStatus = 'available' | 'day_off' | 'outside_hours' | 'on_break' | 'time_off';

export function checkStaffAvailability(
  availability: {
    schedules: Array<{ dayOfWeek: number; startTime: string; endTime: string; isActive: boolean }>;
    breaks: Array<{ date: string; startTime: string; endTime: string }>;
    timeOffs: Array<{ startDate: string; endDate: string }>;
  } | null | undefined,
  date: string,
  time: string
): StaffAvailabilityStatus {
  if (!availability) return 'available';
  
  const dateObj = new Date(date);
  const dayOfWeek = dateObj.getDay();
  
  const timeToMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const timeMinutes = timeToMinutes(time);
  
  if (availability.timeOffs.some(t => date >= t.startDate && date <= t.endDate)) {
    return 'time_off';
  }
  
  const schedule = availability.schedules.find(s => s.dayOfWeek === dayOfWeek);
  if (!schedule || !schedule.isActive) {
    return 'day_off';
  }
  
  const scheduleStart = timeToMinutes(schedule.startTime);
  const scheduleEnd = timeToMinutes(schedule.endTime);
  if (timeMinutes < scheduleStart || timeMinutes >= scheduleEnd) {
    return 'outside_hours';
  }
  
  const breaksForDate = availability.breaks.filter(b => b.date === date);
  for (const brk of breaksForDate) {
    const breakStart = timeToMinutes(brk.startTime);
    const breakEnd = timeToMinutes(brk.endTime);
    if (timeMinutes >= breakStart && timeMinutes < breakEnd) {
      return 'on_break';
    }
  }
  
  return 'available';
}

export function useAllStaffSchedules() {
  return useQuery({
    queryKey: ["/api/staff/all-schedules"],
    queryFn: async () => {
      const staffRes = await fetch("/api/staff", { credentials: "include" });
      if (!staffRes.ok) return {};
      const staff = await staffRes.json();
      
      const availabilityMap: Record<number, {
        schedules: Array<{ dayOfWeek: number; startTime: string; endTime: string; isActive: boolean }>;
        breaks: Array<{ date: string; startTime: string; endTime: string }>;
        timeOffs: Array<{ startDate: string; endDate: string }>;
      }> = {};
      
      for (const s of staff) {
        try {
          const res = await fetch(`/api/public/staff/${s.id}/availability`, { credentials: "include" });
          if (res.ok) {
            availabilityMap[s.id] = await res.json();
          }
        } catch {
          // Skip failed requests
        }
      }
      
      return availabilityMap;
    },
    staleTime: 5 * 60 * 1000,
  });
}
