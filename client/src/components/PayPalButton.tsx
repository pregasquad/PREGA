import { useEffect, useRef, useState } from "react";
import { Loader2, Lock, CheckCircle2 } from "lucide-react";

declare global {
  interface Window {
    paypal?: {
      FUNDING: { CARD: string };
      Buttons: (opts: object) => {
        render: (el: HTMLElement) => Promise<void>;
        close: () => void;
        isEligible: () => boolean;
      };
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

export function PayPalButton({ amount, description = "Salon appointment", onSuccess, onError }: PayPalButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<{ close: () => void } | null>(null);

  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convertedAmount, setConvertedAmount] = useState<{ value: number; currency: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const configRes = await fetch("/api/paypal/config");
        if (!configRes.ok) throw new Error("PayPal not configured");
        const { clientId, currency, madRate } = await configRes.json() as {
          clientId: string; currency: string; madRate: number;
        };

        const paypalAmount = Math.ceil((amount / madRate) * 100) / 100;
        if (!cancelled) setConvertedAmount({ value: paypalAmount, currency });

        // Reload SDK only if currency changed
        const needsReload = window.paypal && window.paypalLoadedCurrency !== currency;
        if (needsReload) {
          document.querySelectorAll('script[src*="paypal.com/sdk"]').forEach(s => s.remove());
          delete (window as any).paypal;
        }

        if (!window.paypal) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            // Only `buttons` component — works on all accounts, no special features needed
            script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}&components=buttons&enable-funding=card`;
            script.onload = () => { window.paypalLoadedCurrency = currency; resolve(); };
            script.onerror = () => reject(new Error("Failed to load PayPal SDK"));
            document.head.appendChild(script);
          });
        }

        if (cancelled || !window.paypal || !containerRef.current) return;

        const createOrder = async () => {
          const res = await fetch("/api/paypal/create-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: paypalAmount, currency, description }),
          });
          if (!res.ok) throw new Error("Failed to create order");
          const data = await res.json() as { id: string };
          return data.id;
        };

        const captureOrder = async (orderId: string) => {
          const res = await fetch("/api/paypal/capture-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId }),
          });
          const result = await res.json() as { success: boolean; orderId: string };
          if (!result.success) throw new Error("Capture failed");
          return result.orderId;
        };

        // Try card-only button first; fall back to full PayPal button if card isn't eligible
        const fundingSources = [window.paypal.FUNDING.CARD, undefined];

        for (const fundingSource of fundingSources) {
          if (cancelled || !containerRef.current) break;

          const btnOpts: Record<string, unknown> = {
            style: { shape: "rect", height: 44, label: "pay" },
            createOrder,
            onApprove: async (data: { orderID: string }) => {
              setPaying(true);
              try {
                const id = await captureOrder(data.orderID);
                setSuccess(true);
                onSuccess(id);
              } catch (e) {
                setError("Le paiement a échoué. Réessayez.");
                onError?.(e);
                setPaying(false);
              }
            },
            onError: (e: unknown) => {
              console.error("[PayPal]", e);
              setError("Le paiement a échoué. Réessayez.");
              onError?.(e);
            },
            onCancel: () => setError(null),
          };

          if (fundingSource) btnOpts.fundingSource = fundingSource;

          const btn = window.paypal.Buttons(btnOpts);
          if (!btn.isEligible()) continue; // try next funding source

          buttonsRef.current = btn;
          setLoading(false);
          await btn.render(containerRef.current!);
          return; // rendered successfully
        }

        // Nothing was eligible
        throw new Error("No eligible payment method");

      } catch (err) {
        if (!cancelled) {
          console.error("[PayPal init]", err);
          setError("Impossible de charger le paiement. Réessayez.");
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

  if (success) {
    return (
      <div className="flex flex-col items-center gap-2 py-3 text-green-600">
        <CheckCircle2 className="w-7 h-7" />
        <p className="text-sm font-semibold">Paiement confirmé !</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      {loading && (
        <div className="flex items-center justify-center h-11 gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Chargement...</span>
        </div>
      )}

      {convertedAmount && !loading && !error && (
        <p className="text-xs text-muted-foreground text-center">
          Montant :{" "}
          <span className="font-semibold text-foreground">
            {convertedAmount.value.toFixed(2)} {convertedAmount.currency}
          </span>
          <span className="opacity-60"> (≈ {amount} DH)</span>
        </p>
      )}

      {error && <p className="text-xs text-destructive text-center">{error}</p>}

      {paying && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Traitement en cours...</span>
        </div>
      )}

      <div ref={containerRef} className={loading || paying ? "hidden" : "block"} />

      {!loading && !error && !paying && (
        <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <Lock className="w-3 h-3" />
          Paiement sécurisé
        </p>
      )}
    </div>
  );
}
