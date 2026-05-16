import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

declare global {
  interface Window {
    paypal?: {
      Buttons: (opts: object) => { render: (el: HTMLElement) => Promise<void>; close: () => void };
    };
    paypalLoadedCurrency?: string;
  }
}

interface PayPalButtonProps {
  amount: number;
  description?: string;
  onSuccess: (orderId: string) => void;
  onError?: (err: unknown) => void;
}

export function PayPalButton({
  amount,
  description = "Salon appointment",
  onSuccess,
  onError,
}: PayPalButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<ReturnType<NonNullable<typeof window.paypal>["Buttons"]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        // Fetch client ID + correct currency from backend (sandbox=USD, live=MAD)
        const configRes = await fetch("/api/paypal/config");
        if (!configRes.ok) throw new Error("PayPal not configured");
        const { clientId, currency } = await configRes.json() as { clientId: string; currency: string };

        // Load PayPal SDK — if already loaded but for a different currency, reload it
        const needsReload = window.paypal && window.paypalLoadedCurrency !== currency;
        if (needsReload) {
          // Remove old script so the SDK reloads with the correct currency
          document.querySelectorAll('script[src*="paypal.com/sdk"]').forEach(s => s.remove());
          delete (window as any).paypal;
        }

        if (!window.paypal) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}&components=buttons&enable-funding=card`;
            script.onload = () => {
              window.paypalLoadedCurrency = currency;
              resolve();
            };
            script.onerror = () => reject(new Error("Failed to load PayPal SDK"));
            document.head.appendChild(script);
          });
        }

        if (cancelled || !containerRef.current || !window.paypal) return;

        setLoading(false);

        const buttons = window.paypal.Buttons({
          style: {
            layout: "vertical",
            color: "blue",
            shape: "rect",
            label: "pay",
            height: 44,
          },
          createOrder: async () => {
            const res = await fetch("/api/paypal/create-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ amount, currency, description }),
            });
            if (!res.ok) throw new Error("Failed to create order");
            const data = await res.json() as { id: string };
            return data.id;
          },
          onApprove: async (data: { orderID: string }) => {
            const res = await fetch("/api/paypal/capture-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId: data.orderID }),
            });
            const result = await res.json() as { success: boolean; orderId: string };
            if (result.success) {
              onSuccess(result.orderId);
            } else {
              setError("Payment capture failed. Please try again.");
              onError?.(new Error("Capture failed"));
            }
          },
          onError: (err: unknown) => {
            console.error("[PayPal]", err);
            setError("Payment failed. Please try again.");
            onError?.(err);
          },
        });

        buttonsRef.current = buttons;
        await buttons.render(containerRef.current!);
      } catch (err) {
        if (!cancelled) {
          console.error("[PayPal init]", err);
          setError("Could not load payment. Please try again.");
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      buttonsRef.current?.close();
    };
  }, [amount, description]);

  return (
    <div className="w-full space-y-2">
      {loading && (
        <div className="flex items-center justify-center h-12 gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Chargement PayPal...</span>
        </div>
      )}
      {error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}
      <div ref={containerRef} className={loading ? "hidden" : "block"} />
    </div>
  );
}
