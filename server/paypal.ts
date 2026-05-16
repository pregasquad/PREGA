import type { Express, Request, Response, NextFunction } from "express";

const PAYPAL_BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

// Currencies PayPal actually supports — prevents arbitrary string injection
const ALLOWED_CURRENCIES = new Set([
  "MAD", "USD", "EUR", "GBP", "CAD", "AUD", "CHF", "JPY", "AED", "SAR", "QAR", "KWD", "BHD", "OMR",
]);

// Simple per-IP rate limiter: max 20 PayPal calls per 5 minutes
const paypalRateLimits = new Map<string, { count: number; resetAt: number }>();
const PAYPAL_RATE_LIMIT = 20;
const PAYPAL_RATE_WINDOW = 5 * 60 * 1000; // 5 minutes

function paypalRateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const record = paypalRateLimits.get(ip);

  if (!record || now > record.resetAt) {
    paypalRateLimits.set(ip, { count: 1, resetAt: now + PAYPAL_RATE_WINDOW });
    return next();
  }
  if (record.count >= PAYPAL_RATE_LIMIT) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }
  record.count++;
  next();
}

// Cache the access token to avoid fetching a new one on every request (tokens last 9 hours)
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PayPal credentials not configured");

  const now = Date.now();
  if (cachedToken && now < cachedToken.expiresAt) return cachedToken.value;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal token error: ${err}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  // Cache with a 5-minute safety margin before actual expiry
  cachedToken = { value: data.access_token, expiresAt: now + (data.expires_in - 300) * 1000 };
  return cachedToken.value;
}

export function registerPayPalRoutes(app: Express) {
  // Return the client-side client ID (safe to expose — public key by design)
  app.get("/api/paypal/config", paypalRateLimitMiddleware, (_req, res) => {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    if (!clientId) return res.status(503).json({ error: "PayPal not configured" });
    res.json({ clientId });
  });

  // Create a PayPal order for a booking payment
  app.post("/api/paypal/create-order", paypalRateLimitMiddleware, async (req, res) => {
    try {
      const { amount, currency = "MAD", description = "Salon appointment" } = req.body as {
        amount: number;
        currency?: string;
        description?: string;
      };

      if (!amount || typeof amount !== "number" || isNaN(amount) || amount <= 0 || amount > 100000) {
        return res.status(400).json({ error: "Invalid amount" });
      }

      const safeCurrency = String(currency).toUpperCase();
      if (!ALLOWED_CURRENCIES.has(safeCurrency)) {
        return res.status(400).json({ error: "Unsupported currency" });
      }

      const safeDescription = String(description).slice(0, 127);

      const token = await getAccessToken();
      const orderRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              amount: {
                currency_code: safeCurrency,
                value: amount.toFixed(2),
              },
              description: safeDescription,
            },
          ],
        }),
      });

      if (!orderRes.ok) {
        const err = await orderRes.text();
        console.error("[PayPal] create-order error:", err);
        return res.status(500).json({ error: "Failed to create PayPal order" });
      }

      const order = await orderRes.json();
      res.json({ id: (order as { id: string }).id });
    } catch (err) {
      console.error("[PayPal] create-order exception:", err);
      res.status(500).json({ error: "PayPal error" });
    }
  });

  // Capture an approved PayPal order
  app.post("/api/paypal/capture-order", paypalRateLimitMiddleware, async (req, res) => {
    try {
      const { orderId } = req.body as { orderId: string };
      if (!orderId || typeof orderId !== "string" || orderId.length > 100) {
        return res.status(400).json({ error: "Missing or invalid orderId" });
      }

      const token = await getAccessToken();
      const captureRes = await fetch(
        `${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!captureRes.ok) {
        const err = await captureRes.text();
        console.error("[PayPal] capture-order error:", err);
        return res.status(500).json({ error: "Failed to capture PayPal order" });
      }

      const capture = await captureRes.json() as {
        status: string;
        id: string;
        purchase_units: Array<{ payments: { captures: Array<{ id: string; status: string }> } }>;
      };

      const captureStatus =
        capture.purchase_units?.[0]?.payments?.captures?.[0]?.status ?? capture.status;

      res.json({
        success: captureStatus === "COMPLETED",
        orderId: capture.id,
        status: captureStatus,
      });
    } catch (err) {
      console.error("[PayPal] capture-order exception:", err);
      res.status(500).json({ error: "PayPal error" });
    }
  });
}
