import { z } from "zod";

export const api = {
  appointments: {
    list: {
      method: "GET" as const,
      path: "/api/appointments",
      responses: { 200: z.array(z.any()) },
    },
    create: {
      method: "POST" as const,
      path: "/api/appointments",
      responses: { 201: z.any(), 400: z.object({ message: z.string(), field: z.string().optional() }) },
    },
    update: {
      method: "PUT" as const,
      path: "/api/appointments/:id",
      responses: { 200: z.any(), 404: z.object({ message: z.string() }) },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/appointments/:id",
      responses: { 204: z.void(), 404: z.object({ message: z.string() }) },
    },
  },
  services: {
    list: {
      method: "GET" as const,
      path: "/api/services",
      responses: { 200: z.array(z.any()) },
    },
    create: {
      method: "POST" as const,
      path: "/api/services",
      responses: { 201: z.any(), 400: z.object({ message: z.string(), field: z.string().optional() }) },
    },
    update: {
      method: "PATCH" as const,
      path: "/api/services/:id",
      responses: { 200: z.any(), 404: z.object({ message: z.string() }) },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/services/:id",
      responses: { 204: z.void(), 404: z.object({ message: z.string() }) },
    },
  },
  categories: {
    list: {
      method: "GET" as const,
      path: "/api/categories",
      responses: { 200: z.array(z.any()) },
    },
    create: {
      method: "POST" as const,
      path: "/api/categories",
      responses: { 201: z.any(), 400: z.object({ message: z.string(), field: z.string().optional() }) },
    },
    update: {
      method: "PATCH" as const,
      path: "/api/categories/:id",
      responses: { 200: z.any(), 404: z.object({ message: z.string() }) },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/categories/:id",
      responses: { 204: z.void(), 404: z.object({ message: z.string() }) },
    },
  },
  staff: {
    list: {
      method: "GET" as const,
      path: "/api/staff",
      responses: { 200: z.array(z.any()) },
    },
    create: {
      method: "POST" as const,
      path: "/api/staff",
      responses: { 201: z.any(), 400: z.object({ message: z.string(), field: z.string().optional() }) },
    },
    update: {
      method: "PATCH" as const,
      path: "/api/staff/:id",
      responses: { 200: z.any(), 404: z.object({ message: z.string() }) },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/staff/:id",
      responses: { 204: z.void(), 404: z.object({ message: z.string() }) },
    },
  },
  clients: {
    list: {
      method: "GET" as const,
      path: "/api/clients",
      responses: { 200: z.array(z.any()) },
    },
    create: {
      method: "POST" as const,
      path: "/api/clients",
      responses: { 201: z.any(), 400: z.object({ message: z.string(), field: z.string().optional() }) },
    },
    update: {
      method: "PATCH" as const,
      path: "/api/clients/:id",
      responses: { 200: z.any(), 404: z.object({ message: z.string() }) },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/clients/:id",
      responses: { 204: z.void(), 404: z.object({ message: z.string() }) },
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
