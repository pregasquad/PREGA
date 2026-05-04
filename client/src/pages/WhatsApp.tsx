import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
} from "lucide-react";

interface WAStatus {
  status: "disconnected" | "connecting" | "qr" | "open";
  connected: boolean;
  phone?: string;
  qr?: string | null;
}

function StatusBadge({ status }: { status: WAStatus["status"] }) {
  if (status === "open") return (
    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1">
      <CheckCircle2 className="w-3 h-3" /> Connected
    </Badge>
  );
  if (status === "qr") return (
    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1">
      <QrCode className="w-3 h-3" /> Scan QR
    </Badge>
  );
  if (status === "connecting") return (
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

export default function WhatsApp() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("مرحباً! هذه رسالة اختبار من صالون PREGASQUAD 💅");
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: waData, refetch } = useQuery<WAStatus>({
    queryKey: ["/api/whatsapp/qr"],
    queryFn: () => apiRequest("GET", "/api/whatsapp/qr").then(r => r.json()),
    refetchInterval: false,
    staleTime: 0,
  });

  const status = waData?.status ?? "disconnected";
  const connected = waData?.connected ?? false;

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (status !== "open") {
      pollRef.current = setInterval(() => { refetch(); }, 8000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status, refetch]);

  const reconnectMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/whatsapp/reconnect").then(r => r.json()),
    onSuccess: () => { setTimeout(() => refetch(), 3000); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/whatsapp/disconnect").then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Disconnected", description: "WhatsApp session ended." });
      setTimeout(() => refetch(), 1000);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const sendTestMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/send", { phone: testPhone, message: testMessage }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Message sent!", description: `Delivered to ${testPhone}` });
      } else {
        toast({ title: "Failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { data: clients } = useQuery<any[]>({
    queryKey: ["/api/clients"],
    queryFn: () => apiRequest("GET", "/api/clients").then(r => r.json()),
  });

  const clientsWithPhone = (clients ?? []).filter((c: any) => c.phone?.trim());

  const broadcastMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/broadcast", { message: broadcastMsg }).then(r => r.json()),
    onSuccess: (data) => {
      toast({
        title: data.failed > 0 ? `Sent ${data.sent}/${data.total}` : `All ${data.sent} messages sent!`,
        description: data.failed > 0 ? `${data.failed} failed` : "Broadcast complete.",
        variant: data.failed > 0 ? "destructive" : "default",
      });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="page-wrapper p-4 md:p-6 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <MessageCircle className="w-6 h-6 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">WhatsApp</h1>
          <p className="text-sm text-muted-foreground">Free messaging via WhatsApp Web</p>
        </div>
        <div className="ml-auto"><StatusBadge status={status} /></div>
      </div>

      {/* Connection card */}
      <div className="rounded-2xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-muted-foreground" />
            <span className="font-semibold">Connection</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-8 w-8">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* QR Code section */}
        {status === "qr" && waData?.qr && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="p-3 bg-white rounded-2xl shadow-lg">
              <img src={waData.qr} alt="WhatsApp QR Code" className="w-52 h-52" />
            </div>
            <p className="text-sm text-center text-muted-foreground max-w-xs">
              Open <strong>WhatsApp</strong> on your phone → tap <strong>⋮ Menu</strong> → <strong>Linked Devices</strong> → <strong>Link a Device</strong> → scan this QR code
            </p>
            <p className="text-xs text-muted-foreground">QR refreshes automatically every 8 seconds</p>
          </div>
        )}

        {status === "open" && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <Wifi className="w-5 h-5 text-emerald-400" />
            <div>
              <p className="text-sm font-medium text-emerald-400">WhatsApp connected</p>
              {waData?.phone && <p className="text-xs text-muted-foreground">+{waData.phone}</p>}
            </div>
          </div>
        )}

        {(status === "disconnected") && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border">
            <WifiOff className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Not connected</p>
              <p className="text-xs text-muted-foreground">Click Connect to generate a QR code</p>
            </div>
          </div>
        )}

        {status === "connecting" && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            <p className="text-sm text-blue-400">Connecting to WhatsApp…</p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {!connected ? (
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => { reconnectMutation.mutate(); }}
              disabled={reconnectMutation.isPending || status === "connecting"}
            >
              {reconnectMutation.isPending || status === "connecting" ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting…</>
              ) : (
                <><QrCode className="w-4 h-4 mr-2" /> Connect</>
              )}
            </Button>
          ) : (
            <Button
              variant="outline"
              className="flex-1 border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4 mr-2" />
              )}
              Disconnect
            </Button>
          )}
        </div>

        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-300">
            This uses WhatsApp Web on your phone. Keep your phone charged and connected to the internet. 
            The session persists across server restarts.
          </p>
        </div>
      </div>

      {/* Test message */}
      <div className="rounded-2xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Send className="w-5 h-5 text-muted-foreground" />
          <span className="font-semibold">Test Message</span>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Phone Number</Label>
            <Input
              placeholder="0612345678 or +212612345678"
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Message</Label>
            <Textarea
              value={testMessage}
              onChange={e => setTestMessage(e.target.value)}
              rows={3}
              dir="rtl"
            />
          </div>
          <Button
            className="w-full"
            onClick={() => sendTestMutation.mutate()}
            disabled={!connected || !testPhone.trim() || !testMessage.trim() || sendTestMutation.isPending}
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

      {/* Broadcast */}
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
              Message — use <code className="bg-muted px-1 rounded text-xs">{"{name}"}</code> for client name
            </Label>
            <Textarea
              placeholder="مرحباً {name}! نذكركم بعروضنا الجديدة… 💅"
              value={broadcastMsg}
              onChange={e => setBroadcastMsg(e.target.value)}
              rows={4}
              dir="rtl"
            />
          </div>
          <Button
            className="w-full liquid-gradient text-white"
            onClick={() => broadcastMutation.mutate()}
            disabled={!connected || !broadcastMsg.trim() || clientsWithPhone.length === 0 || broadcastMutation.isPending}
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
