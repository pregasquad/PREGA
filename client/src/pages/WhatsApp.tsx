import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { io } from "socket.io-client";
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
  pairingCode?: string | null;
  pairingError?: string | null;
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

function PairingProgress({ seconds }: { seconds: number }) {
  const total = 30;
  const pct = Math.min(95, Math.round((seconds / total) * 100));
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Connecting to WhatsApp…</span>
        <span>{seconds}s</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-purple-500 transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground text-center">
        {seconds < 5
          ? "Starting secure connection…"
          : seconds < 15
          ? "Requesting pairing code from WhatsApp…"
          : "Almost there — waiting for WhatsApp response…"}
      </p>
    </div>
  );
}

export default function WhatsApp() {
  const { toast } = useToast();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track the error we already showed so we don't re-fire on stale poll data
  const shownErrorRef = useRef<string | null>(null);

  const [pairingPhone, setPairingPhone] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [isWaitingForCode, setIsWaitingForCode] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [codeExpiresIn, setCodeExpiresIn] = useState<number | null>(null);
  const codeExpiryRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  // ── Socket.IO: instant pairing code / error (no waiting for next poll) ──
  useEffect(() => {
    const socket = io();
    socket.on("whatsapp:pairing_code", ({ code }: { code: string }) => {
      setPairingCode(code);
      setIsWaitingForCode(false);
      if (countdownRef.current) clearInterval(countdownRef.current);
      // Start 60-second expiry countdown
      if (codeExpiryRef.current) clearInterval(codeExpiryRef.current);
      setCodeExpiresIn(60);
      codeExpiryRef.current = setInterval(() => {
        setCodeExpiresIn((s) => {
          if (s === null || s <= 1) {
            if (codeExpiryRef.current) clearInterval(codeExpiryRef.current);
            setPairingCode(null);
            setCodeExpiresIn(null);
            return null;
          }
          return s - 1;
        });
      }, 1000);
    });
    socket.on("whatsapp:pairing_error", ({ error }: { error: string }) => {
      if (shownErrorRef.current === error) return;
      shownErrorRef.current = error;
      setIsWaitingForCode(false);
      if (countdownRef.current) clearInterval(countdownRef.current);
      toast({ title: "Failed to get pairing code", description: error, variant: "destructive", duration: 8000 });
    });
    socket.on("whatsapp:connected", () => {
      setPairingCode(null);
      setIsWaitingForCode(false);
      setCodeExpiresIn(null);
      if (codeExpiryRef.current) clearInterval(codeExpiryRef.current);
      setTimeout(() => refetch(), 500);
    });
    socket.on("whatsapp:disconnected", () => refetch());
    socket.on("whatsapp:pairing_refreshing", ({ attempt }: { attempt: number }) => {
      setPairingCode(null);
      setIsWaitingForCode(true);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setWaitSeconds(0);
      countdownRef.current = setInterval(() => setWaitSeconds((s) => s + 1), 1000);
      if (attempt === 0) {
        // attempt=0 means: code was shown, connection dropped, checking if phone accepted it
        toast({ title: "Checking connection…", description: "Verifying if your phone accepted the code.", duration: 4000 });
      }
    });
    socket.on("whatsapp:pairing_dropped", ({ reason }: { reason: string }) => {
      setPairingCode(null);
      setIsWaitingForCode(false);
      if (countdownRef.current) clearInterval(countdownRef.current);
      toast({
        title: "Could not link device — please try again",
        description: "WhatsApp couldn't complete the link. Enter your number and request a new code.",
        variant: "destructive",
        duration: 10000,
      });
      refetch();
    });
    socket.on("whatsapp:logged_out", ({ reason }: { reason?: string }) => {
      setPairingCode(null);
      setIsWaitingForCode(false);
      if (countdownRef.current) clearInterval(countdownRef.current);
      const isDeviceRemoved = reason === "device_removed";
      toast({
        title: isDeviceRemoved ? "WhatsApp removed this device" : "WhatsApp logged out",
        description: isDeviceRemoved
          ? "WhatsApp disconnected this session (likely a duplicate connection). Please re-link your phone."
          : "Your WhatsApp session ended. Please re-link your phone.",
        variant: "destructive",
        duration: 12000,
      });
      setTimeout(() => refetch(), 500);
    });
    return () => { socket.disconnect(); };
  }, []);

  // ── Pick up pairing code from poll response ──────────────────────────────
  useEffect(() => {
    if (isWaitingForCode && waData?.pairingCode) {
      setPairingCode(waData.pairingCode);
      setIsWaitingForCode(false);
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
  }, [waData?.pairingCode, isWaitingForCode]);

  // ── Pick up pairing error from poll response ──────────────────────────────
  useEffect(() => {
    if (
      isWaitingForCode &&
      waData?.pairingError &&
      waData.pairingError !== shownErrorRef.current
    ) {
      shownErrorRef.current = waData.pairingError;
      setIsWaitingForCode(false);
      if (countdownRef.current) clearInterval(countdownRef.current);
      toast({
        title: "Failed to get pairing code",
        description: waData.pairingError,
        variant: "destructive",
        duration: 8000,
      });
    }
  }, [waData?.pairingError, isWaitingForCode]);

  // ── If status flips to disconnected while still waiting, show error ──────
  useEffect(() => {
    if (isWaitingForCode && status === "disconnected" && waitSeconds > 15) {
      setIsWaitingForCode(false);
      if (countdownRef.current) clearInterval(countdownRef.current);
      toast({
        title: "Connection failed",
        description: "Could not reach WhatsApp servers. Please try again.",
        variant: "destructive",
      });
    }
  }, [status, isWaitingForCode, waitSeconds]);

  // ── Polling — faster while waiting ──────────────────────────────────────
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    const interval =
      status === "pairing" || status === "connecting" || isWaitingForCode
        ? 2000
        : status === "open"
        ? 0
        : 6000;
    if (interval > 0) {
      pollRef.current = setInterval(() => refetch(), interval);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status, refetch, isWaitingForCode]);

  // ── Auto-clear stale paired-device history when no phone is connected ────
  const clearedSessionRef = useRef(false);
  useEffect(() => {
    if (!clearedSessionRef.current && waData && status === "disconnected") {
      clearedSessionRef.current = true;
      apiRequest("POST", "/api/whatsapp/clear-session").catch(() => {});
    }
  }, [waData, status]);

  // ── Clear pairing state once connected ──────────────────────────────────
  useEffect(() => {
    if (status === "open") {
      setPairingCode(null);
      setIsWaitingForCode(false);
      setWaitSeconds(0);
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
  }, [status]);

  // ── Countdown timer while waiting ────────────────────────────────────────
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (isWaitingForCode) {
      setWaitSeconds(0);
      countdownRef.current = setInterval(() => setWaitSeconds((s) => s + 1), 1000);
    }
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [isWaitingForCode]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const connectQRMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/whatsapp/connect-qr").then((r) => r.json()),
    onSuccess: () => setTimeout(() => refetch(), 1500),
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const pairingMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/whatsapp/pairing-code", { phone: pairingPhone }).then((r) =>
        r.json()
      ),
    onMutate: () => {
      // Reset stale error tracking so a previous error doesn't fire immediately
      shownErrorRef.current = null;
      setIsWaitingForCode(true);
      setPairingCode(null);
    },
    onSuccess: (data) => {
      if (!data.success) {
        setIsWaitingForCode(false);
        if (countdownRef.current) clearInterval(countdownRef.current);
        toast({
          title: "Failed to start pairing",
          description: data.error || "Try again",
          variant: "destructive",
        });
      }
      // If success, keep isWaitingForCode=true and wait for code via polling
    },
    onError: (err: any) => {
      setIsWaitingForCode(false);
      if (countdownRef.current) clearInterval(countdownRef.current);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/whatsapp/disconnect").then((r) => r.json()),
    onSuccess: () => {
      setPairingCode(null);
      setIsWaitingForCode(false);
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

  function resetPairing() {
    shownErrorRef.current = null;
    setPairingCode(null);
    setIsWaitingForCode(false);
    setWaitSeconds(0);
    setCodeExpiresIn(null);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (codeExpiryRef.current) clearInterval(codeExpiryRef.current);
    refetch();
  }

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
            data-testid="button-refresh-status"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* ── DISCONNECTED ALERT ── */}
      {!connected && status === "disconnected" && !isWaitingForCode && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/30">
          <WifiOff className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-400">WhatsApp déconnecté</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Liez à nouveau votre téléphone pour rétablir la connexion.
            </p>
          </div>
        </div>
      )}

      {/* ── CONNECTED STATE ── */}
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
            data-testid="button-disconnect"
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

      {/* ── CONNECTION CARD (not connected) ── */}
      {!connected && (
        <div className="rounded-2xl border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-muted-foreground" />
            <span className="font-semibold">Link your WhatsApp</span>
          </div>

          <Tabs defaultValue="qr">
            <TabsList className="w-full rounded-xl">
              <TabsTrigger value="qr" className="flex-1 rounded-lg gap-2">
                <QrCode className="w-3.5 h-3.5" />
                QR code
              </TabsTrigger>
              <TabsTrigger value="phone" className="flex-1 rounded-lg gap-2">
                <Phone className="w-3.5 h-3.5" />
                Phone number
              </TabsTrigger>
            </TabsList>

            {/* ── PAIRING CODE TAB ── */}
            <TabsContent value="phone" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Enter your WhatsApp number to receive an 8-character pairing code.
              </p>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>If you've tried multiple times without success, use the <strong>QR code</strong> tab instead — it's more reliable.</span>
              </div>

              {/* Waiting for code */}
              {isWaitingForCode && !pairingCode && (
                <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
                  <div className="flex items-center gap-2 justify-center">
                    <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                    <span className="text-sm text-purple-300 font-medium">
                      Getting your pairing code…
                    </span>
                  </div>
                  <PairingProgress seconds={waitSeconds} />
                  <p className="text-xs text-center text-muted-foreground">
                    This usually takes 5–15 seconds
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground"
                    onClick={resetPairing}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {/* Input form — hidden while waiting or showing a code */}
              {!pairingCode && !isWaitingForCode && (
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
                      data-testid="input-pairing-phone"
                    />
                  </div>
                  <Button
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={() => pairingMutation.mutate()}
                    disabled={
                      pairingMutation.isPending ||
                      pairingPhone.replace(/[^0-9]/g, "").length < 8
                    }
                    data-testid="button-get-pairing-code"
                  >
                    {pairingMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting…</>
                    ) : (
                      <><Hash className="w-4 h-4 mr-2" /> Get pairing code</>
                    )}
                  </Button>
                </>
              )}

              {/* Pairing code display */}
              {pairingCode && !isWaitingForCode && (
                <div className="space-y-3">
                  <div className={`rounded-xl border p-4 space-y-3 ${codeExpiresIn !== null && codeExpiresIn <= 15 ? "border-red-500/40 bg-red-500/5" : "border-purple-500/30 bg-purple-500/5"}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-purple-300">Your pairing code</p>
                      {codeExpiresIn !== null && (
                        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${codeExpiresIn <= 15 ? "bg-red-500/20 text-red-400" : codeExpiresIn <= 30 ? "bg-amber-500/20 text-amber-400" : "bg-purple-500/20 text-purple-400"}`}>
                          {codeExpiresIn}s
                        </span>
                      )}
                    </div>
                    <PairingCodeDisplay code={pairingCode} />
                    {codeExpiresIn !== null && codeExpiresIn <= 15 && (
                      <p className="text-xs text-red-400 text-center font-medium animate-pulse">
                        Code expiring — enter it now!
                      </p>
                    )}
                    <div className="space-y-1.5 pt-1">
                      <p className="text-xs font-medium text-muted-foreground">On your phone:</p>
                      <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                        <li>Open <strong>WhatsApp</strong></li>
                        <li>Tap <strong>⋮ Menu</strong> → <strong>Linked Devices</strong></li>
                        <li>Tap <strong>Link a Device</strong></li>
                        <li>Tap <strong>"Link with phone number instead"</strong></li>
                        <li>Enter the code above</li>
                      </ol>
                    </div>
                  </div>
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
                    onClick={() => { refetch(); }}
                    data-testid="button-check-connected"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    I entered the code — check connection
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full text-xs"
                    onClick={resetPairing}
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
                    data-testid="button-generate-qr"
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
                  If WhatsApp shows "Can't link new devices", use the{" "}
                  <strong>Phone number</strong> tab instead — it works even when QR scanning is blocked.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* ── TEST MESSAGE ── */}
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
              data-testid="input-test-phone"
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
            data-testid="button-send-test"
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

      {/* ── BROADCAST ── */}
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
              <code className="bg-muted px-1 rounded text-[11px]">{"{name}"}</code> for client name
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
