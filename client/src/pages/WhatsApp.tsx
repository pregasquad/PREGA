import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Smartphone,
  Wifi,
  WifiOff,
  RefreshCw,
  Send,
  LogOut,
  QrCode,
  MessageCircle,
  Loader2,
  CheckCircle2,
  Users,
  AlertCircle,
  Hash,
  Phone,
} from "lucide-react";

interface WAStatus {
  status: "disconnected" | "connecting" | "qr" | "pairing" | "open";
  connected: boolean;
  phone?: string;
  qr?: string | null;
}

function StatusBadge({ status }: { status: WAStatus["status"] }) {
  if (status === "open")
    return (
      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1">
        <CheckCircle2 className="w-3 h-3" /> Connected
      </Badge>
    );
  if (status === "qr")
    return (
      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1">
        <QrCode className="w-3 h-3" /> Scan QR
      </Badge>
    );
  if (status === "pairing")
    return (
      <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 gap-1">
        <Hash className="w-3 h-3" /> Enter Code
      </Badge>
    );
  if (status === "connecting")
    return (
      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 gap-1">
        <Loader2 className="w-3 h-3 animate-spin" /> Connecting
      </Badge>
    );
  return (
    <Badge className="bg-muted text-muted-foreground gap-1">
      <WifiOff className="w-3 h-3" /> Disconnected
    </Badge>
  );
}

function PairingCodeDisplay({ code }: { code: string }) {
  const parts = code.length === 8 ? [code.slice(0, 4), code.slice(4)] : [code];
  return (
    <div className="flex items-center justify-center gap-3 py-2">
      {parts.map((part, i) => (
        <div key={i} className="flex gap-1">
          {part.split("").map((ch, j) => (
            <span
              key={j}
              className="w-10 h-12 flex items-center justify-center rounded-lg border-2 border-purple-500/40 bg-purple-500/10 text-2xl font-bold font-mono text-purple-300"
            >
              {ch}
            </span>
          ))}
          {i < parts.length - 1 && (
            <span className="w-4 flex items-center justify-center text-2xl text-muted-foreground">-</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function WhatsApp() {
  const { toast } = useToast();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pairingPhone, setPairingPhone] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState(
    "مرحباً! هذه رسالة اختبار من صالون PREGASQUAD 💅"
  );
  const [broadcastMsg, setBroadcastMsg] = useState("");

  const { data: waData, refetch } = useQuery<WAStatus>({
    queryKey: ["/api/whatsapp/qr"],
    queryFn: () => apiRequest("GET", "/api/whatsapp/qr").then((r) => r.json()),
    refetchInterval: false,
    staleTime: 0,
  });

  const status = waData?.status ?? "disconnected";
  const connected = waData?.connected ?? false;

  // Poll status when not connected
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (status !== "open") {
      pollRef.current = setInterval(() => {
        refetch();
      }, 6000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status, refetch]);

  // Clear pairing code once connected
  useEffect(() => {
    if (status === "open") setPairingCode(null);
  }, [status]);

  const connectQRMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/whatsapp/connect-qr").then((r) => r.json()),
    onSuccess: () => {
      setPairingCode(null);
      setTimeout(() => refetch(), 2000);
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const pairingMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/whatsapp/pairing-code", { phone: pairingPhone }).then((r) =>
        r.json()
      ),
    onSuccess: (data) => {
      if (data.success && data.code) {
        setPairingCode(data.code);
        setTimeout(() => refetch(), 3000);
      } else {
        toast({
          title: "Failed to get pairing code",
          description: data.error || "Try again",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/whatsapp/disconnect").then((r) => r.json()),
    onSuccess: () => {
      setPairingCode(null);
      toast({ title: "Disconnected", description: "WhatsApp session ended." });
      setTimeout(() => refetch(), 800);
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const sendTestMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/notifications/send", {
        phone: testPhone,
        message: testMessage,
      }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Message sent!", description: `Delivered to ${testPhone}` });
      } else {
        toast({ title: "Failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { data: clients } = useQuery<any[]>({
    queryKey: ["/api/clients"],
    queryFn: () => apiRequest("GET", "/api/clients").then((r) => r.json()),
  });

  const clientsWithPhone = (clients ?? []).filter((c: any) => c.phone?.trim());

  const broadcastMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/notifications/broadcast", {
        message: broadcastMsg,
      }).then((r) => r.json()),
    onSuccess: (data) => {
      toast({
        title:
          data.failed > 0
            ? `Sent ${data.sent}/${data.total}`
            : `All ${data.sent} messages sent!`,
        description: data.failed > 0 ? `${data.failed} failed` : "Broadcast complete.",
        variant: data.failed > 0 ? "destructive" : "default",
      });
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="page-wrapper p-4 md:p-6 space-y-5 max-w-xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <MessageCircle className="w-6 h-6 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">WhatsApp</h1>
          <p className="text-sm text-muted-foreground">Free messaging — no subscription needed</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusBadge status={status} />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => refetch()}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* ── CONNECTED STATE ─────────────────────────────────── */}
      {connected && (
        <div className="rounded-2xl border bg-card p-5 space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <Wifi className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-400">WhatsApp connected</p>
              {waData?.phone && (
                <p className="text-xs text-muted-foreground font-mono">+{waData.phone}</p>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
          >
            {disconnectMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4 mr-2" />
            )}
            Disconnect &amp; log out
          </Button>
        </div>
      )}

      {/* ── CONNECTION CARD (not connected) ─────────────────── */}
      {!connected && (
        <div className="rounded-2xl border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-muted-foreground" />
            <span className="font-semibold">Link your WhatsApp</span>
          </div>

          <Tabs defaultValue="phone">
            <TabsList className="w-full rounded-xl">
              <TabsTrigger value="phone" className="flex-1 rounded-lg gap-2">
                <Phone className="w-3.5 h-3.5" />
                Phone number
              </TabsTrigger>
              <TabsTrigger value="qr" className="flex-1 rounded-lg gap-2">
                <QrCode className="w-3.5 h-3.5" />
                QR code
              </TabsTrigger>
            </TabsList>

            {/* ── PAIRING CODE TAB ── */}
            <TabsContent value="phone" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Enter your WhatsApp number. We'll give you an 8-character code to enter inside the WhatsApp app.
              </p>

              {!pairingCode ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                      Phone number (with country code)
                    </Label>
                    <Input
                      placeholder="+212612345678"
                      value={pairingPhone}
                      onChange={(e) => setPairingPhone(e.target.value)}
                      dir="ltr"
                    />
                  </div>
                  <Button
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={() => pairingMutation.mutate()}
                    disabled={pairingMutation.isPending || pairingPhone.replace(/[^0-9]/g, "").length < 8}
                  >
                    {pairingMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Getting code…</>
                    ) : (
                      <><Hash className="w-4 h-4 mr-2" /> Get pairing code</>
                    )}
                  </Button>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
                    <p className="text-sm font-medium text-center text-purple-300">Your pairing code</p>
                    <PairingCodeDisplay code={pairingCode} />
                    <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>Open <strong>WhatsApp</strong> on your phone</li>
                      <li>Tap <strong>⋮ Menu</strong> → <strong>Linked Devices</strong></li>
                      <li>Tap <strong>Link with phone number</strong></li>
                      <li>Enter the code above</li>
                    </ol>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full text-xs"
                    onClick={() => { setPairingCode(null); refetch(); }}
                  >
                    Try again with a different number
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ── QR TAB ── */}
            <TabsContent value="qr" className="space-y-4 mt-4">
              {status === "qr" && waData?.qr ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="p-3 bg-white rounded-2xl shadow-lg">
                    <img src={waData.qr} alt="WhatsApp QR Code" className="w-52 h-52" />
                  </div>
                  <p className="text-xs text-center text-muted-foreground max-w-xs">
                    Open WhatsApp → <strong>⋮ Menu</strong> → <strong>Linked Devices</strong> → <strong>Link a Device</strong> → scan
                  </p>
                  <p className="text-xs text-muted-foreground opacity-60">
                    QR auto-refreshes every 6 s
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {status === "connecting" ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                      <p className="text-sm text-blue-400">Generating QR code…</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border">
                      <QrCode className="w-4 h-4 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Click below to generate a QR code</p>
                    </div>
                  )}
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => connectQRMutation.mutate()}
                    disabled={connectQRMutation.isPending || status === "connecting"}
                  >
                    {connectQRMutation.isPending || status === "connecting" ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
                    ) : (
                      <><QrCode className="w-4 h-4 mr-2" /> Generate QR code</>
                    )}
                  </Button>
                </div>
              )}

              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-300">
                  If WhatsApp shows "Can't link new devices", use the <strong>Phone number</strong> tab instead — it works even when QR scanning is blocked.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* ── TEST MESSAGE ─────────────────────────────────────── */}
      <div className="rounded-2xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Send className="w-5 h-5 text-muted-foreground" />
          <span className="font-semibold">Test Message</span>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Phone Number
            </Label>
            <Input
              placeholder="0612345678 or +212612345678"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Message
            </Label>
            <Textarea
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              rows={3}
              dir="rtl"
            />
          </div>
          <Button
            className="w-full"
            onClick={() => sendTestMutation.mutate()}
            disabled={
              !connected ||
              !testPhone.trim() ||
              !testMessage.trim() ||
              sendTestMutation.isPending
            }
          >
            {sendTestMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            {!connected ? "Connect WhatsApp first" : "Send Test"}
          </Button>
        </div>
      </div>

      {/* ── BROADCAST ────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-muted-foreground" />
            <span className="font-semibold">Broadcast</span>
          </div>
          <Badge variant="secondary" className="text-xs">
            {clientsWithPhone.length} clients with phone
          </Badge>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Message — use{" "}
              <code className="bg-muted px-1 rounded text-[11px]">{"{name}"}</code> for client
              name
            </Label>
            <Textarea
              placeholder={"مرحباً {name}! نذكركم بعروضنا الجديدة… 💅"}
              value={broadcastMsg}
              onChange={(e) => setBroadcastMsg(e.target.value)}
              rows={4}
              dir="rtl"
            />
          </div>
          <Button
            className="w-full liquid-gradient text-white"
            onClick={() => broadcastMutation.mutate()}
            disabled={
              !connected ||
              !broadcastMsg.trim() ||
              clientsWithPhone.length === 0 ||
              broadcastMutation.isPending
            }
          >
            {broadcastMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <MessageCircle className="w-4 h-4 mr-2" />
            )}
            {!connected
              ? "Connect WhatsApp first"
              : broadcastMutation.isPending
              ? "Sending…"
              : `Broadcast to ${clientsWithPhone.length} clients`}
          </Button>
        </div>
      </div>
    </div>
  );
}
