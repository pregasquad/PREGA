import { useEffect, useRef, useState } from "react";
import { Loader2, CreditCard, Lock } from "lucide-react";

declare global {
  interface Window {
    paypal?: {
      HostedFields?: {
        isEligible: () => boolean;
        render: (opts: object) => Promise<{
          submit: (opts?: object) => Promise<{ orderId: string }>;
        }>;
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

export function PayPalButton({
  amount,
  description = "Salon appointment",
  onSuccess,
  onError,
}: PayPalButtonProps) {
  const hostedFieldsRef = useRef<{ submit: (opts?: object) => Promise<{ orderId: string }> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convertedAmount, setConvertedAmount] = useState<{ value: number; currency: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const configRes = await fetch("/api/paypal/config");
        if (!configRes.ok) throw new Error("PayPal not configured");
        const { clientId, currency, madRate } = await configRes.json() as {
          clientId: string;
          currency: string;
          madRate: number;
        };

        const paypalAmount = Math.ceil((amount / madRate) * 100) / 100;
        if (!cancelled) setConvertedAmount({ value: paypalAmount, currency });

        const needsReload = window.paypal && window.paypalLoadedCurrency !== currency;
        if (needsReload) {
          document.querySelectorAll('script[src*="paypal.com/sdk"]').forEach(s => s.remove());
          delete (window as any).paypal;
        }

        if (!window.paypal) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}&components=hosted-fields&intent=capture`;
            script.onload = () => { window.paypalLoadedCurrency = currency; resolve(); };
            script.onerror = () => reject(new Error("Failed to load PayPal SDK"));
            document.head.appendChild(script);
          });
        }

        if (cancelled || !window.paypal?.HostedFields) return;
        if (!window.paypal.HostedFields.isEligible()) {
          throw new Error("Hosted Fields not eligible for this account");
        }

        const hf = await window.paypal.HostedFields.render({
          createOrder: async () => {
            const res = await fetch("/api/paypal/create-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ amount: paypalAmount, currency, description }),
            });
            if (!res.ok) throw new Error("Failed to create order");
            const data = await res.json() as { id: string };
            return data.id;
          },
          styles: {
            input: {
              "font-size": "16px",
              "font-family": "inherit",
              color: "inherit",
              padding: "0 12px",
            },
            ":focus": { color: "inherit" },
            ".invalid": { color: "#ef4444" },
          },
          fields: {
            number: {
              selector: "#paypal-card-number",
              placeholder: "0000 0000 0000 0000",
            },
            cvv: {
              selector: "#paypal-cvv",
              placeholder: "CVV",
            },
            expirationDate: {
              selector: "#paypal-expiry",
              placeholder: "MM/YY",
            },
          },
        });

        if (!cancelled) {
          hostedFieldsRef.current = hf;
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[PayPal HostedFields init]", err);
          setError("Impossible de charger le paiement. Réessayez.");
          setLoading(false);
        }
      }
    };

    init();
    return () => { cancelled = true; };
  }, [amount, description]);

  const handlePay = async () => {
    if (!hostedFieldsRef.current || paying) return;
    setError(null);
    setPaying(true);
    try {
      const result = await hostedFieldsRef.current.submit();
      const orderId = (result as any).orderId ?? (result as any).orderID;

      const captureRes = await fetch("/api/paypal/capture-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const capture = await captureRes.json() as { success: boolean; orderId: string };
      if (capture.success) {
        onSuccess(capture.orderId);
      } else {
        setError("Le paiement a échoué. Vérifiez vos infos et réessayez.");
        onError?.(new Error("Capture failed"));
      }
    } catch (err) {
      console.error("[PayPal pay]", err);
      setError("Le paiement a échoué. Vérifiez vos infos et réessayez.");
      onError?.(err);
    } finally {
      setPaying(false);
    }
  };

  const fieldClass =
    "h-11 w-full rounded-lg border border-input bg-background text-sm overflow-hidden";

  return (
    <div className="w-full space-y-3">
      {loading && (
        <div className="flex items-center justify-center h-12 gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Chargement...</span>
        </div>
      )}

      <div className={loading ? "hidden" : "space-y-2"}>
        {convertedAmount && (
          <p className="text-xs text-muted-foreground text-center pb-1">
            Montant :{" "}
            <span className="font-semibold text-foreground">
              {convertedAmount.value.toFixed(2)} {convertedAmount.currency}
            </span>
            <span className="opacity-60"> (≈ {amount} DH)</span>
          </p>
        )}

        <div id="paypal-card-number" className={fieldClass} />

        <div className="grid grid-cols-2 gap-2">
          <div id="paypal-expiry" className={fieldClass} />
          <div id="paypal-cvv" className={fieldClass} />
        </div>

        {error && (
          <p className="text-xs text-destructive text-center">{error}</p>
        )}

        <button
          onClick={handlePay}
          disabled={paying}
          className="w-full h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {paying ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CreditCard className="w-4 h-4" />
          )}
          {paying ? "Traitement..." : "Payer par carte"}
        </button>

        <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <Lock className="w-3 h-3" />
          Paiement sécurisé via PayPal
        </p>
      </div>
    </div>
  );
}
