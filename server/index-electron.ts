import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import session from "express-session";
import { storage } from "./storage-sqlite";
import { api } from "@shared/routes";
import { z } from "zod";
import path from "path";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

const sessionMiddleware = session({
  secret: "pregasquad-local-secret-key-2024",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});

app.use(sessionMiddleware);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
  });

  next();
});

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

app.get("/api/auth/user", (req: any, res) => {
  if (req.session && req.session.user) {
    res.json(req.session.user);
  } else {
    res.json({ id: 1, username: "admin", firstName: "Admin", lastName: "User" });
  }
});

app.post("/api/login", async (req: any, res) => {
  const { username, password } = req.body;
  const user = await storage.validateUser(username, password);
  if (user) {
    req.session.user = user;
    res.json(user);
  } else {
    res.status(401).json({ message: "Invalid credentials" });
  }
});

app.get("/api/logout", (req: any, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.get(api.appointments.list.path, async (req, res) => {
  const { date } = z.object({ date: z.string().optional() }).parse(req.query);
  const items = await storage.getAppointments(date);
  res.json(items);
});

app.post(api.appointments.create.path, async (req, res) => {
  try {
    const input = api.appointments.create.input.parse(req.body);
    const item = await storage.createAppointment(input);
    if (!item.paid) {
      io.emit("booking:created", item);
    }
    res.status(201).json(item);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: err.errors[0].message });
    }
    throw err;
  }
});

app.put(api.appointments.update.path, async (req, res) => {
  try {
    const input = api.appointments.update.input.parse(req.body);
    const item = await storage.updateAppointment(Number(req.params.id), input);
    res.json(item);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: err.errors[0].message });
    }
    throw err;
  }
});

app.delete(api.appointments.delete.path, async (req, res) => {
  await storage.deleteAppointment(Number(req.params.id));
  res.status(204).send();
});

app.get(api.services.list.path, async (req, res) => {
  const items = await storage.getServices();
  res.json(items);
});

app.post(api.services.create.path, async (req, res) => {
  try {
    const input = api.services.create.input.parse(req.body);
    const item = await storage.createService(input);
    res.status(201).json(item);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: err.errors[0].message });
    }
    throw err;
  }
});

app.patch("/api/services/:id", async (req, res) => {
  try {
    const item = await storage.updateService(Number(req.params.id), req.body);
    res.json(item);
  } catch (err) {
    res.status(400).json({ message: "Update failed" });
  }
});

app.delete(api.services.delete.path, async (req, res) => {
  await storage.deleteService(Number(req.params.id));
  res.status(204).send();
});

app.get(api.categories.list.path, async (req, res) => {
  const items = await storage.getCategories();
  res.json(items);
});

app.post(api.categories.create.path, async (req, res) => {
  try {
    const input = api.categories.create.input.parse(req.body);
    const item = await storage.createCategory(input);
    res.status(201).json(item);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: err.errors[0].message });
    }
    throw err;
  }
});

app.patch("/api/categories/:id", async (req, res) => {
  try {
    const item = await storage.updateCategory(Number(req.params.id), req.body);
    res.json(item);
  } catch (err) {
    res.status(400).json({ message: "Update failed" });
  }
});

app.delete("/api/categories/:id", async (req, res) => {
  await storage.deleteCategory(Number(req.params.id));
  res.status(204).send();
});

app.get(api.staff.list.path, async (req, res) => {
  const items = await storage.getStaff();
  res.json(items);
});

app.post("/api/staff", async (req, res) => {
  const item = await storage.createStaff(req.body);
  res.status(201).json(item);
});

app.patch("/api/staff/:id", async (req, res) => {
  const item = await storage.updateStaff(Number(req.params.id), req.body);
  res.json(item);
});

app.delete("/api/staff/:id", async (req, res) => {
  await storage.deleteStaff(Number(req.params.id));
  res.status(204).send();
});

app.get("/api/products", async (_req, res) => {
  const products = await storage.getProducts();
  res.json(products);
});

app.post("/api/products", async (req, res) => {
  const item = await storage.createProduct(req.body);
  res.status(201).json(item);
});

app.patch("/api/products/:id", async (req, res) => {
  const item = await storage.updateProduct(Number(req.params.id), req.body);
  res.json(item);
});

app.delete("/api/products/:id", async (req, res) => {
  await storage.deleteProduct(Number(req.params.id));
  res.status(204).send();
});

app.get("/api/products/:id", async (req, res) => {
  const product = await storage.getProducts().then(prods => prods.find(p => p.id === parseInt(req.params.id)));
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json(product);
});

app.get("/api/products/by-name/:name", async (req, res) => {
  const product = await storage.getProductByName(req.params.name);
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json(product);
});

app.patch("/api/products/:id/quantity", async (req, res) => {
  const { quantity } = req.body;
  if (typeof quantity !== "number") return res.status(400).json({ message: "Invalid quantity" });
  try {
    const updated = await storage.updateProductQuantity(parseInt(req.params.id), quantity);
    res.json(updated);
  } catch (e) {
    res.status(404).json({ message: "Product not found" });
  }
});

app.get("/api/charges", async (_req, res) => {
  const items = await storage.getCharges();
  res.json(items);
});

app.post("/api/charges", async (req, res) => {
  try {
    const item = await storage.createCharge(req.body);
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ message: "Failed to create charge" });
  }
});

app.delete("/api/charges/:id", async (req, res) => {
  await storage.deleteCharge(Number(req.params.id));
  res.status(204).send();
});

async function seedDatabase() {
  const staffList = await storage.getStaff();
  if (staffList.length === 0) {
    await storage.createStaff({ name: "Hayat", color: "#d63384" });
    await storage.createStaff({ name: "Mehdi", color: "#20c997" });
    await storage.createStaff({ name: "Nofl", color: "#0d6efd" });
  }

  const categoriesList = await storage.getCategories();
  if (categoriesList.length === 0) {
    await storage.createCategory({ name: "Beauté" });
    await storage.createCategory({ name: "Coiffure" });
    await storage.createCategory({ name: "Onglerie" });
    await storage.createCategory({ name: "Épilation à la Cire" });
    await storage.createCategory({ name: "Soins du Visage" });
  }

  const servicesList = await storage.getServices();
  if (servicesList.length === 0) {
    await storage.createService({ name: "Maquillage Simple", price: 100, duration: 30, category: "Beauté" });
    await storage.createService({ name: "Maquillage et faux-cils", price: 150, duration: 45, category: "Beauté" });
    await storage.createService({ name: "Brushing", price: 50, duration: 30, category: "Coiffure" });
    await storage.createService({ name: "Coupe et Brushing", price: 80, duration: 60, category: "Coiffure" });
    await storage.createService({ name: "Manicure Simple", price: 50, duration: 30, category: "Onglerie" });
    await storage.createService({ name: "Sourcils", price: 30, duration: 15, category: "Épilation à la Cire" });
    await storage.createService({ name: "Soin Classique", price: 200, duration: 45, category: "Soins du Visage" });
  }

  const prods = await storage.getProducts();
  if (prods.length === 0) {
    await storage.createProduct({ name: "Lissage Protéine", quantity: 10 });
    await storage.createProduct({ name: "Color Blond", quantity: 5 });
  }
}

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
  throw err;
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "public")));
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(__dirname, "public", "index.html"));
    }
  });
}

const port = parseInt(process.env.PORT || "5000", 10);

(async () => {
  await seedDatabase();
  
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();

export { app, httpServer };
