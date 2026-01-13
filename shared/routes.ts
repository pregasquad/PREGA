import { z } from 'zod';
import { insertAppointmentSchema, insertServiceSchema, insertCategorySchema, insertStaffSchema, appointments, services, categories, staff, insertClientSchema, clients } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  appointments: {
    list: {
      method: 'GET' as const,
      path: '/api/appointments',
      input: z.object({ date: z.string().optional() }).optional(),
      responses: { 200: z.array(z.custom<typeof appointments.$inferSelect>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/appointments',
      input: insertAppointmentSchema,
      responses: { 201: z.custom<typeof appointments.$inferSelect>(), 400: errorSchemas.validation },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/appointments/:id',
      input: insertAppointmentSchema.partial().omit({ createdAt: true } as any),
      responses: { 200: z.custom<typeof appointments.$inferSelect>(), 404: errorSchemas.notFound },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/appointments/:id',
      responses: { 204: z.void(), 404: errorSchemas.notFound },
    },
  },
  services: {
    list: {
      method: 'GET' as const,
      path: '/api/services',
      responses: { 200: z.array(z.custom<typeof services.$inferSelect>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/services',
      input: insertServiceSchema,
      responses: { 201: z.custom<typeof services.$inferSelect>(), 400: errorSchemas.validation },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/services/:id',
      input: insertServiceSchema.partial(),
      responses: { 200: z.custom<typeof services.$inferSelect>(), 404: errorSchemas.notFound },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/services/:id',
      responses: { 204: z.void(), 404: errorSchemas.notFound },
    },
  },
  categories: {
    list: {
      method: 'GET' as const,
      path: '/api/categories',
      responses: { 200: z.array(z.custom<typeof categories.$inferSelect>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/categories',
      input: insertCategorySchema,
      responses: { 201: z.custom<typeof categories.$inferSelect>(), 400: errorSchemas.validation },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/categories/:id',
      input: insertCategorySchema.partial(),
      responses: { 200: z.custom<typeof categories.$inferSelect>(), 404: errorSchemas.notFound },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/categories/:id',
      responses: { 204: z.void(), 404: errorSchemas.notFound },
    },
  },
  staff: {
    list: {
      method: 'GET' as const,
      path: '/api/staff',
      responses: { 200: z.array(z.custom<typeof staff.$inferSelect>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/staff',
      input: insertStaffSchema,
      responses: { 201: z.custom<typeof staff.$inferSelect>(), 400: errorSchemas.validation },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/staff/:id',
      input: insertStaffSchema.partial(),
      responses: { 200: z.custom<typeof staff.$inferSelect>(), 404: errorSchemas.notFound },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/staff/:id',
      responses: { 204: z.void(), 404: errorSchemas.notFound },
    },
  },
  clients: {
    list: {
      method: 'GET' as const,
      path: '/api/clients',
      responses: { 200: z.array(z.custom<typeof clients.$inferSelect>()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/clients',
      input: insertClientSchema,
      responses: { 201: z.custom<typeof clients.$inferSelect>(), 400: errorSchemas.validation },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/clients/:id',
      input: insertClientSchema.partial(),
      responses: { 200: z.custom<typeof clients.$inferSelect>(), 404: errorSchemas.notFound },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/clients/:id',
      responses: { 204: z.void(), 404: errorSchemas.notFound },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
