import type { Express } from "express";

const PAYPAL_BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PayPal credentials not configured");

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

  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export function registerPayPalRoutes(app: Express) {
  // Return the client-side client ID (safe to expose)
  app.get("/api/paypal/config", (_req, res) => {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    if (!clientId) return res.status(503).json({ error: "PayPal not configured" });
    res.json({ clientId });
  });

  // Create a PayPal order for a booking deposit / full payment
  app.post("/api/paypal/create-order", async (req, res) => {
    try {
      const { amount, currency = "USD", description = "Salon appointment" } = req.body as {
        amount: number;
        currency?: string;
        description?: string;
      };

      if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }

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
                currency_code: currency,
                value: amount.toFixed(2),
              },
              description,
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
  app.post("/api/paypal/capture-order", async (req, res) => {
    try {
      const { orderId } = req.body as { orderId: string };
      if (!orderId) return res.status(400).json({ error: "Missing orderId" });

      const token = await getAccessToken();
      const captureRes = await fetch(
        `${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`,
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
