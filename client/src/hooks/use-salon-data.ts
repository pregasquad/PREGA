import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertAppointment, type InsertService, type InsertCategory, type InsertClient, type InsertStaff, type InsertStaffSchedule, type InsertStaffBreak, type InsertStaffTimeOff } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useAppointments(date?: string) {
  return useQuery({
    queryKey: [api.appointments.list.path, date],
    queryFn: async () => {
      const url = date 
        ? `${api.appointments.list.path}?date=${date}` 
        : api.appointments.list.path;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch appointments");
      return api.appointments.list.responses[200].parse(await res.json());
    },
    staleTime: 5 * 60 * 1000, // Data stays fresh for 5 minutes - socket.io handles real-time updates
    refetchOnWindowFocus: false, // Don't refetch on tab focus (socket handles updates)
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertAppointment) => {
      const res = await fetch(api.appointments.create.path, {
        method: api.appointments.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.appointments.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create appointment");
      }
      return api.appointments.create.responses[201].parse(await res.json());
    },
    onMutate: async (newAppointment) => {
      const dateQueryKey = [api.appointments.list.path, newAppointment.date];
      const allQueryKey = [api.appointments.list.path, undefined];
      
      await queryClient.cancelQueries({ queryKey: dateQueryKey });
      await queryClient.cancelQueries({ queryKey: allQueryKey });
      
      const previousDateData = queryClient.getQueryData(dateQueryKey);
      const previousAllData = queryClient.getQueryData(allQueryKey);
      
      const tempId = -Date.now();
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
      toast({ title: "Success", description: "Appointment booked successfully" });
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
      const res = await fetch(url, {
        method: api.appointments.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update appointment");
      return api.appointments.update.responses[200].parse(await res.json());
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
      queryClient.setQueriesData(
        { queryKey: [api.appointments.list.path] },
        (old: any) => old ? old.map((apt: any) => apt.id === data.id ? data : apt) : old
      );
      toast({ title: "Success", description: "Appointment updated" });
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
      queryClient.invalidateQueries({ queryKey: [api.appointments.list.path] });
    },
  });
}

export function useDeleteAppointment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.appointments.delete.path, { id });
      const res = await fetch(url, {
        method: api.appointments.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete appointment");
      return id;
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
    onSuccess: () => {
      toast({ title: "Deleted", description: "Appointment removed" });
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
      queryClient.invalidateQueries({ queryKey: [api.appointments.list.path] });
    },
  });
}

export function useServices() {
  return useQuery({
    queryKey: [api.services.list.path],
    queryFn: async () => {
      const res = await fetch(api.services.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch services");
      return api.services.list.responses[200].parse(await res.json());
    },
    staleTime: 5 * 60 * 1000, // Services rarely change - cache for 5 minutes
  });
}

export function useCategories() {
  return useQuery({
    queryKey: [api.categories.list.path],
    queryFn: async () => {
      const res = await fetch(api.categories.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch categories");
      return api.categories.list.responses[200].parse(await res.json());
    },
    staleTime: 5 * 60 * 1000, // Categories rarely change - cache for 5 minutes
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertService) => {
      const res = await fetch(api.services.create.path, {
        method: api.services.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create service");
      return api.services.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.services.list.path] });
      toast({ title: "Success", description: "Service created" });
    },
    onError: (err) => {
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
      const res = await fetch(url, {
        method: api.services.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update service");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.services.list.path] });
      toast({ title: "Success", description: "Service updated" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertCategory) => {
      const res = await fetch(api.categories.create.path, {
        method: api.categories.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create category");
      return api.categories.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.categories.list.path] });
      toast({ title: "Success", description: "Category created" });
    },
    onError: (err) => {
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
      const res = await fetch(url, {
        method: api.categories.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update category");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.categories.list.path] });
      toast({ title: "Success", description: "Category updated" });
    },
    onError: (err) => {
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
      const res = await fetch(url, {
        method: api.services.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete service");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.services.list.path] });
      toast({ title: "Deleted", description: "Service removed" });
    },
  });
}

export function useStaff() {
  return useQuery({
    queryKey: [api.staff.list.path],
    queryFn: async () => {
      const res = await fetch(api.staff.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch staff");
      return api.staff.list.responses[200].parse(await res.json());
    },
    staleTime: 5 * 60 * 1000, // Staff rarely changes - cache for 5 minutes
  });
}

export function useCreateStaff() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertStaff) => {
      const res = await fetch(api.staff.create.path, {
        method: api.staff.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create staff");
      return api.staff.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.staff.list.path] });
      toast({ title: "Success", description: "Staff member added" });
    },
    onError: (err) => {
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
      const res = await fetch(url, {
        method: api.staff.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update staff");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.staff.list.path] });
      toast({ title: "Success", description: "Staff member updated" });
    },
    onError: (err) => {
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
      const res = await fetch(url, {
        method: api.staff.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete staff");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.staff.list.path] });
      toast({ title: "Deleted", description: "Staff member removed" });
    },
  });
}

export function useClients() {
  return useQuery({
    queryKey: [api.clients.list.path],
    queryFn: async () => {
      const res = await fetch(api.clients.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch clients");
      return api.clients.list.responses[200].parse(await res.json());
    },
    staleTime: 5 * 60 * 1000, // Cache clients for 5 minutes
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertClient) => {
      const res = await fetch(api.clients.create.path, {
        method: api.clients.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create client");
      return api.clients.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.clients.list.path] });
      toast({ title: "Success", description: "Client added" });
    },
    onError: (err) => {
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
      const res = await fetch(url, {
        method: api.clients.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update client");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.clients.list.path] });
      toast({ title: "Success", description: "Client updated" });
    },
    onError: (err) => {
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
      const res = await fetch(url, {
        method: api.clients.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete client");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.clients.list.path] });
      toast({ title: "Deleted", description: "Client removed" });
    },
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await fetch("/api/products", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
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
