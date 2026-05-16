import { useEffect, useRef, useState } from "react";
import { Loader2, CreditCard, Lock, CheckCircle2 } from "lucide-react";

declare global {
  interface Window {
    paypal?: {
      HostedFields?: {
        isEligible: () => boolean;
        render: (opts: object) => Promise<{
          submit: (opts?: object) => Promise<{ orderId: string }>;
          getState: () => {
            fields: {
              number: { isValid: boolean };
              expirationDate: { isValid: boolean };
              cvv: { isValid: boolean };
            };
          };
          on: (event: string, handler: () => void) => void;
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
  const hostedFieldsRef = useRef<{
    submit: (opts?: object) => Promise<{ orderId: string }>;
    getState: () => { fields: { number: { isValid: boolean }; expirationDate: { isValid: boolean }; cvv: { isValid: boolean } } };
    on: (event: string, handler: () => void) => void;
  } | null>(null);
  const payingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convertedAmount, setConvertedAmount] = useState<{ value: number; currency: string } | null>(null);

  const doSubmit = async () => {
    if (!hostedFieldsRef.current || payingRef.current) return;
    payingRef.current = true;
    setPaying(true);
    setError(null);
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
        setSuccess(true);
        onSuccess(capture.orderId);
      } else {
        setError("Le paiement a échoué. Vérifiez vos infos.");
        onError?.(new Error("Capture failed"));
        payingRef.current = false;
        setPaying(false);
      }
    } catch (err) {
      console.error("[PayPal pay]", err);
      setError("Le paiement a échoué. Vérifiez vos infos.");
      onError?.(err);
      payingRef.current = false;
      setPaying(false);
    }
  };

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
          throw new Error("Hosted Fields not eligible");
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
              "font-size": "15px",
              "font-family": "inherit",
              color: "inherit",
              padding: "0 12px",
            },
            ":focus": { color: "inherit" },
            ".invalid": { color: "#ef4444" },
            ".valid": { color: "inherit" },
          },
          fields: {
            number: { selector: "#paypal-card-number", placeholder: "Numéro de carte" },
            cvv: { selector: "#paypal-cvv", placeholder: "CVV" },
            expirationDate: { selector: "#paypal-expiry", placeholder: "MM/AA" },
          },
        });

        if (cancelled) return;
        hostedFieldsRef.current = hf;
        setLoading(false);

        // Auto-submit once all 3 fields are valid — no button click needed
        hf.on("validityChange", () => {
          const state = hf.getState();
          const allValid =
            state.fields.number.isValid &&
            state.fields.expirationDate.isValid &&
            state.fields.cvv.isValid;
          if (allValid && !payingRef.current) {
            doSubmit();
          }
        });
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

  const fieldClass =
    "h-11 w-full rounded-lg border border-input bg-background overflow-hidden transition-colors";

  if (success) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-green-600">
        <CheckCircle2 className="w-8 h-8" />
        <p className="text-sm font-semibold">Paiement confirmé !</p>
      </div>
    );
  }

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

        {paying && (
          <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Traitement en cours...</span>
          </div>
        )}

        {error && (
          <p className="text-xs text-destructive text-center">{error}</p>
        )}

        {!paying && (
          <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground pt-1">
            <Lock className="w-3 h-3" />
            Le paiement s'effectue automatiquement dès que la carte est saisie
          </p>
        )}
      </div>
    </div>
  );
}
