import { useEffect, useRef, useState } from "react";
import { Loader2, Lock, CheckCircle2 } from "lucide-react";

declare global {
  interface Window {
    paypal?: {
      FUNDING?: { CARD: string; PAYPAL: string };
      Buttons?: (opts: object) => { render: (el: HTMLElement) => Promise<void>; close: () => void };
      HostedFields?: {
        isEligible: () => boolean;
        render: (opts: object) => Promise<{
          submit: (opts?: object) => Promise<unknown>;
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

export function PayPalButton({ amount, description = "Salon appointment", onSuccess, onError }: PayPalButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<{ close: () => void } | null>(null);
  const hostedFieldsRef = useRef<{
    submit: (opts?: object) => Promise<unknown>;
    getState: () => { fields: { number: { isValid: boolean }; expirationDate: { isValid: boolean }; cvv: { isValid: boolean } } };
    on: (event: string, handler: () => void) => void;
  } | null>(null);
  const payingRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"hosted" | "buttons" | null>(null);
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convertedAmount, setConvertedAmount] = useState<{ value: number; currency: string } | null>(null);

  const captureOrder = async (orderId: string) => {
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
      throw new Error("Capture failed");
    }
  };

  const handleHostedSubmit = async () => {
    if (!hostedFieldsRef.current || payingRef.current) return;
    payingRef.current = true;
    setPaying(true);
    setError(null);
    try {
      const result = await hostedFieldsRef.current.submit();
      const orderId = (result as any).orderId ?? (result as any).orderID;
      await captureOrder(orderId);
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
          clientId: string; currency: string; madRate: number;
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
            script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}&components=hosted-fields,buttons&intent=capture&disable-funding=paypal,venmo,paylater`;
            script.onload = () => { window.paypalLoadedCurrency = currency; resolve(); };
            script.onerror = () => reject(new Error("Failed to load PayPal SDK"));
            document.head.appendChild(script);
          });
        }

        if (cancelled || !window.paypal) return;

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

        // Try Hosted Fields first (inline 3-field form — requires Advanced Card Payments)
        if (window.paypal.HostedFields?.isEligible()) {
          const hf = await window.paypal.HostedFields.render({
            createOrder,
            styles: {
              input: { "font-size": "15px", "font-family": "inherit", color: "inherit", padding: "0 12px" },
              ":focus": { color: "inherit" },
              ".invalid": { color: "#ef4444" },
            },
            fields: {
              number: { selector: "#paypal-card-number", placeholder: "Numéro de carte" },
              cvv: { selector: "#paypal-cvv", placeholder: "CVV" },
              expirationDate: { selector: "#paypal-expiry", placeholder: "MM/AA" },
            },
          });

          if (cancelled) return;
          hostedFieldsRef.current = hf;
          setMode("hosted");
          setLoading(false);

          // Auto-submit when all 3 fields are valid
          hf.on("validityChange", () => {
            const s = hf.getState();
            if (s.fields.number.isValid && s.fields.expirationDate.isValid && s.fields.cvv.isValid && !payingRef.current) {
              handleHostedSubmit();
            }
          });
          return;
        }

        // Fallback: standard card-only PayPal button
        if (!window.paypal.Buttons || !containerRef.current) return;

        const buttons = window.paypal.Buttons({
          fundingSource: window.paypal.FUNDING?.CARD,
          style: { shape: "rect", height: 44 },
          createOrder,
          onApprove: async (data: { orderID: string }) => {
            setPaying(true);
            try {
              await captureOrder(data.orderID);
            } catch (err) {
              setError("Le paiement a échoué. Réessayez.");
              onError?.(err);
              setPaying(false);
            }
          },
          onError: (err: unknown) => {
            console.error("[PayPal]", err);
            setError("Le paiement a échoué. Réessayez.");
            onError?.(err);
          },
        });

        if (cancelled) return;
        buttonsRef.current = buttons as { close: () => void };
        setMode("buttons");
        setLoading(false);
        await (buttons as { render: (el: HTMLElement) => Promise<void> }).render(containerRef.current!);

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

  const fieldClass = "h-11 w-full rounded-lg border border-input bg-background overflow-hidden";

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

      {/* Hosted Fields — inline card form (shown when Advanced Card Payments is enabled) */}
      <div className={loading || mode !== "hosted" ? "hidden" : "space-y-2"}>
        {convertedAmount && (
          <p className="text-xs text-muted-foreground text-center pb-1">
            Montant : <span className="font-semibold text-foreground">{convertedAmount.value.toFixed(2)} {convertedAmount.currency}</span>
            <span className="opacity-60"> (≈ {amount} DH)</span>
          </p>
        )}
        <div id="paypal-card-number" className={fieldClass} />
        <div className="grid grid-cols-2 gap-2">
          <div id="paypal-expiry" className={fieldClass} />
          <div id="paypal-cvv" className={fieldClass} />
        </div>
        {paying && (
          <div className="flex items-center justify-center gap-2 py-1 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Traitement en cours...</span>
          </div>
        )}
        {!paying && (
          <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <Lock className="w-3 h-3" />
            Paiement automatique dès que la carte est saisie
          </p>
        )}
      </div>

      {/* Standard card button fallback */}
      <div className={loading || mode !== "buttons" ? "hidden" : "space-y-2"}>
        {convertedAmount && (
          <p className="text-xs text-muted-foreground text-center pb-1">
            Montant : <span className="font-semibold text-foreground">{convertedAmount.value.toFixed(2)} {convertedAmount.currency}</span>
            <span className="opacity-60"> (≈ {amount} DH)</span>
          </p>
        )}
        <div ref={containerRef} />
        {paying && (
          <div className="flex items-center justify-center gap-2 py-1 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Traitement en cours...</span>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive text-center">{error}</p>}
    </div>
  );
}
