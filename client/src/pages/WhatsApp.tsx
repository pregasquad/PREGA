import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  Trash2,
  Mic,
  Sparkles,
  Save,
  Bot,
  BotOff,
  Filter,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Clock,
  User,
  ShieldAlert,
  ShieldCheck,
  Pencil,
} from "lucide-react";

interface WAStatus {
  status: "disconnected" | "connecting" | "qr" | "pairing" | "open";
  connected: boolean;
  phone?: string;
  qr?: string | null;
  pairingCode?: string | null;
  pairingCodeExpiresAt?: number | null;
  pairingError?: string | null;
  isReplitDev?: boolean;
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
  const [selectedVoice, setSelectedVoice] = useState("Aoede");

  // ── Collapsible section states ────────────────────────────────────────────
  const [testOpen, setTestOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [botConfirmedOpen, setBotConfirmedOpen] = useState(false);

  // ── Conversation log state ────────────────────────────────────────────────
  const [logOpen, setLogOpen] = useState(false);
  const [expandedJid, setExpandedJid] = useState<string | null>(null);

  // ── Complaints panel state ────────────────────────────────────────────────
  const [complaintsOpen, setComplaintsOpen] = useState(false);
  const [fixingId, setFixingId] = useState<number | null>(null);
  const [fixNote, setFixNote] = useState("");

  // ── Phone number filter state ──────────────────────────────────────────────
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDirty, setFilterDirty] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "allowlist" | "blocklist">("all");
  const [filterNumbers, setFilterNumbers] = useState<string[]>([]);
  const [filterInput, setFilterInput] = useState("");

  const { data: waData, refetch } = useQuery<WAStatus>({
    queryKey: ["/api/whatsapp/qr"],
    queryFn: () => apiRequest("GET", "/api/whatsapp/qr").then((r) => r.json()),
    refetchInterval: false,
    staleTime: 0,
  });

  const status = waData?.status ?? "disconnected";
  const connected = waData?.connected ?? false;
  const isReplitDev = waData?.isReplitDev ?? false;

  // ── Start expiry countdown from a known expiresAt timestamp ─────────────
  const startExpiryCountdown = (expiresAt: number) => {
    if (codeExpiryRef.current) clearInterval(codeExpiryRef.current);
    const remaining = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    setCodeExpiresIn(remaining);
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
  };

  // ── Socket.IO: instant pairing code / error (no waiting for next poll) ──
  useEffect(() => {
    const socket = io();
    socket.on("whatsapp:pairing_code", ({ code, expiresAt }: { code: string; expiresAt?: number }) => {
      setPairingCode(code);
      setIsWaitingForCode(false);
      if (countdownRef.current) clearInterval(countdownRef.current);
      startExpiryCountdown(expiresAt ?? Date.now() + 90_000);
    });
    socket.on("whatsapp:pairing_code_expired", () => {
      setPairingCode(null);
      setIsWaitingForCode(false);
      setCodeExpiresIn(null);
      if (codeExpiryRef.current) clearInterval(codeExpiryRef.current);
      toast({
        title: "Code expired",
        description: "The pairing code expired — please request a new one.",
        variant: "destructive",
        duration: 6000,
      });
      setTimeout(() => refetch(), 500);
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
      // Start countdown from server-provided expiresAt (if available)
      if (waData.pairingCodeExpiresAt && waData.pairingCodeExpiresAt > Date.now()) {
        startExpiryCountdown(waData.pairingCodeExpiresAt);
      }
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

  // NOTE: We deliberately do NOT auto-clear the session on page load.
  // Koyeb takes a few seconds to restore the session from the DB on startup,
  // and auto-wiping during that window would destroy valid credentials.

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
    onSuccess: () => {
      setTimeout(() => refetch(), 1500);
    },
    onError: (err: any) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const pairingMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/whatsapp/pairing-code", { phone: pairingPhone }).then((r) =>
        r.json()
      ),
    onMutate: () => {
      shownErrorRef.current = null;
      setIsWaitingForCode(true);
      setPairingCode(null);
    },
    onSuccess: (data) => {
      if (!data.success) {
        setIsWaitingForCode(false);
        if (countdownRef.current) clearInterval(countdownRef.current);
        toast({
          title: "فشل في بدء الربط",
          description: data.error || "حاول مرة أخرى",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      setIsWaitingForCode(false);
      if (countdownRef.current) clearInterval(countdownRef.current);
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
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

  const clearSessionMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/whatsapp/clear-session").then((r) => r.json()),
    onSuccess: () => {
      setPairingCode(null);
      setIsWaitingForCode(false);
      toast({ title: "Session cleared", description: "Old session deleted. You can now re-link your phone." });
      setTimeout(() => refetch(), 500);
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

  const { data: bizSettings } = useQuery<any>({
    queryKey: ["/api/business-settings"],
    queryFn: () => apiRequest("GET", "/api/business-settings").then((r) => r.json()),
  });

  useEffect(() => {
    if (bizSettings?.ttsVoice) setSelectedVoice(bizSettings.ttsVoice);
    if (bizSettings?.botFilterMode) setFilterMode(bizSettings.botFilterMode);
    if (bizSettings?.botFilterNumbers) {
      try { setFilterNumbers(JSON.parse(bizSettings.botFilterNumbers)); } catch { setFilterNumbers([]); }
    }
  }, [bizSettings?.ttsVoice, bizSettings?.botFilterMode, bizSettings?.botFilterNumbers]);

  const saveVoiceMutation = useMutation({
    mutationFn: (voice: string) =>
      apiRequest("PATCH", "/api/business-settings", { ttsVoice: voice }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-settings"] });
      toast({ title: "تم الحفظ ✓", description: "تم تحديث صوت البوت بنجاح" });
    },
    onError: (err: any) =>
      toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const toggleBotMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("PATCH", "/api/business-settings", { botEnabled: enabled }).then((r) => r.json()),
    onSuccess: (_data, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-settings"] });
      toast({
        title: enabled ? "البوت مفعّل ✓" : "البوت متوقف ✓",
        description: enabled ? "لينا راه كيجاوب دابا 🤖" : "البوت متوقف — الرسائل ما غاديش تتجاوب أوتوماتيك",
      });
    },
    onError: (err: any) =>
      toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  // ── Conversation log query & mutations ────────────────────────────────────
  interface ConvEntry {
    jid: string;
    phone: string;
    clientName: string | null;
    language: string;
    visitCount: number;
    lastSeen: string | null;
    history: { role: "user" | "model"; text: string }[];
    botBlocked: boolean;
    preferredServices: string[];
    personalityNotes: string | null;
  }

  const {
    data: conversations,
    refetch: refetchConvs,
    isFetching: convsFetching,
  } = useQuery<ConvEntry[]>({
    queryKey: ["/api/whatsapp/bot-conversations"],
    queryFn: () =>
      apiRequest("GET", "/api/whatsapp/bot-conversations").then((r) => r.json()),
    enabled: logOpen,
    staleTime: 30_000,
  });

  const clearConvMutation = useMutation({
    mutationFn: (jid: string) =>
      apiRequest("DELETE", `/api/whatsapp/bot-conversations/${encodeURIComponent(jid)}`).then((r) => r.json()),
    onSuccess: (_data, jid) => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/bot-conversations"] });
      if (expandedJid === jid) setExpandedJid(null);
      toast({ title: "تم المسح ✓", description: "تم مسح سجل المحادثة" });
    },
    onError: (err: any) =>
      toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const blockConvMutation = useMutation({
    mutationFn: ({ jid, blocked }: { jid: string; blocked: boolean }) =>
      apiRequest("PATCH", `/api/whatsapp/bot-conversations/${encodeURIComponent(jid)}/block`, { blocked }).then((r) => r.json()),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/bot-conversations"] });
      toast({
        title: vars.blocked ? "تم الإيقاف ✓" : "تم التفعيل ✓",
        description: vars.blocked ? "البوت لن يرد على هذا الرقم" : "البوت سيرد من جديد على هذا الرقم",
      });
    },
    onError: (err: any) =>
      toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  // ── Bot-confirmed appointments query ─────────────────────────────────────
  const {
    data: botConfirmedAppointments = [],
    isFetching: botConfirmedFetching,
  } = useQuery<any[]>({
    queryKey: ["/api/appointments/bot-confirmed"],
    queryFn: () => apiRequest("GET", "/api/appointments/bot-confirmed").then((r) => r.json()),
    enabled: botConfirmedOpen,
    staleTime: 30_000,
  });

  // ── Complaints queries & mutations ────────────────────────────────────────
  interface SalonComplaint {
    id: number;
    complaintText: string;
    complaintType: "complaint" | "bot_error";
    sourceJid: string;
    sourcePhone?: string | null;
    clientName?: string | null;
    detectedAt: string;
    isResolved: boolean;
    fixNote?: string | null;
    resolvedAt?: string | null;
  }

  const {
    data: complaints,
    refetch: refetchComplaints,
    isFetching: complaintsFetching,
  } = useQuery<SalonComplaint[]>({
    queryKey: ["/api/bot/complaints"],
    queryFn: () => apiRequest("GET", "/api/bot/complaints").then((r) => r.json()),
    enabled: complaintsOpen,
    staleTime: 30_000,
  });

  const resolveComplaintMutation = useMutation({
    mutationFn: ({ id, fixNote: note }: { id: number; fixNote: string }) =>
      apiRequest("PATCH", `/api/bot/complaints/${id}/resolve`, { fixNote: note }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot/complaints"] });
      setFixingId(null);
      setFixNote("");
      toast({ title: "تم الحفظ ✓", description: "الحل سيُستخدم من طرف البوت مع عملاء آخرين" });
    },
    onError: (err: any) =>
      toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const deleteComplaintMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/bot/complaints/${id}`).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot/complaints"] });
      toast({ title: "تم الحذف ✓" });
    },
    onError: (err: any) =>
      toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const formatRelativeTime = (iso: string | null): string => {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "الآن";
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    return `منذ ${days} يوم`;
  };

  const langLabel = (lang: string) =>
    lang === "arabic" ? "عربية" : lang === "french" ? "FR" : lang === "darija" ? "دارجة" : "—";

  const saveFilterMutation = useMutation({
    mutationFn: (payload: { mode: string; numbers: string[] }) =>
      apiRequest("PATCH", "/api/business-settings", {
        botFilterMode: payload.mode,
        botFilterNumbers: JSON.stringify(payload.numbers),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-settings"] });
      setFilterDirty(false);
      toast({ title: "تم الحفظ ✓", description: "تم تحديث إعدادات الفلتر" });
    },
    onError: (err: any) =>
      toast({ title: "خطأ في الحفظ", description: err.message, variant: "destructive" }),
  });

  const normalizeFilterNumber = (n: string) => {
    let d = n.replace(/[^0-9]/g, "");
    if (d.startsWith("00")) d = d.slice(2);
    if (d.startsWith("0") && d.length === 10) d = "212" + d.slice(1);
    if (d.length === 9) d = "212" + d;
    return d;
  };

  const addFilterNumber = () => {
    const normalized = normalizeFilterNumber(filterInput.trim());
    if (!normalized || filterNumbers.includes(normalized)) { setFilterInput(""); return; }
    setFilterNumbers((prev) => [...prev, normalized]);
    setFilterDirty(true);
    setFilterInput("");
  };

  const removeFilterNumber = (num: string) => {
    setFilterNumbers((prev) => prev.filter((n) => n !== num));
    setFilterDirty(true);
  };

  const botEnabled = bizSettings?.botEnabled !== false;

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
    <div className="space-y-5 p-3 md:p-6 animate-fade-in max-w-xl mx-auto w-full">
      {/* Header */}
      <div className="glass-elevated rounded-2xl px-5 py-5 glass-shine">
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl liquid-gradient flex items-center justify-center shadow-lg shrink-0">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold tracking-tight">واتساب</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Free messaging — no subscription needed</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={status} />
            <Button
              variant="ghost"
              size="icon"
              className="glass-subtle rounded-xl h-9 w-9 hover:scale-105 transition-transform"
              onClick={() => refetch()}
              data-testid="button-refresh-status"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── BOT TOGGLE ── */}
      <div className={`glass-card rounded-2xl p-4 transition-all ${botEnabled ? "border-emerald-500/30" : "border-red-500/30"}`}>
        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-md ${botEnabled ? "bg-emerald-500/15 border border-emerald-500/25" : "bg-red-500/15 border border-red-500/25"}`}>
              {botEnabled ? <Bot className="w-5 h-5 text-emerald-400" /> : <BotOff className="w-5 h-5 text-red-400" />}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">البوت (لينا)</p>
              <p className={`text-xs mt-0.5 truncate ${botEnabled ? "text-emerald-400" : "text-red-400"}`}>
                {botEnabled ? "مفعّل — كيجاوب أوتوماتيك 🟢" : "متوقف — الرسائل ما غاديش تتجاوب 🔴"}
              </p>
            </div>
          </div>
          <Button
            data-testid="button-toggle-bot"
            size="sm"
            disabled={toggleBotMutation.isPending}
            onClick={() => toggleBotMutation.mutate(!botEnabled)}
            className={`shrink-0 min-w-[80px] rounded-xl ${botEnabled ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30" : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"}`}
            variant="ghost"
          >
            {toggleBotMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : botEnabled ? (
              <><BotOff className="w-4 h-4 mr-1" />إيقاف</>
            ) : (
              <><Bot className="w-4 h-4 mr-1" />تفعيل</>
            )}
          </Button>
        </div>
      </div>

      {/* ── DISCONNECTED ALERT ── */}
      {!connected && status === "disconnected" && !isWaitingForCode && (
        <div className="glass-card rounded-2xl border-red-500/30 flex items-start gap-3 p-4">
          <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center shrink-0">
            <WifiOff className="w-4 h-4 text-red-400" />
          </div>
          <div className="flex-1 min-w-0 relative z-10">
            <p className="text-sm font-semibold text-red-400">WhatsApp déconnecté</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Liez à nouveau votre téléphone pour rétablir la connexion.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 h-8 gap-1.5 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-xl"
            onClick={() => clearSessionMutation.mutate()}
            disabled={clearSessionMutation.isPending}
            data-testid="button-clear-session"
          >
            {clearSessionMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            Clear session
          </Button>
        </div>
      )}

      {/* ── CONNECTED STATE ── */}
      {connected && (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div className="relative z-10 flex items-center gap-3 p-3 rounded-xl glass-subtle border-emerald-500/20">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
              <Wifi className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-400">WhatsApp connected</p>
              {waData?.phone && (
                <p className="text-xs text-muted-foreground font-mono">+{waData.phone}</p>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            className="relative z-10 w-full border-destructive/40 text-destructive hover:bg-destructive/10 rounded-xl"
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
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="liquid-glass-header px-5 py-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl liquid-gradient flex items-center justify-center shrink-0 shadow-lg">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-semibold text-sm">Link your WhatsApp</span>
              <p className="text-xs text-muted-foreground mt-0.5">Connect your phone to get started</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
          <Tabs defaultValue="phone">
            <TabsList className="w-full rounded-xl glass-subtle">
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
        </div>
      )}

      {/* ── TEST MESSAGE ── */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <button
          className="liquid-glass-header w-full flex items-center gap-3 p-5 text-left hover:brightness-105 transition-all"
          onClick={() => setTestOpen((o) => !o)}
          data-testid="button-toggle-test"
        >
          <div className="w-10 h-10 rounded-xl liquid-gradient flex items-center justify-center shrink-0 shadow-lg">
            <Send className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <span className="font-semibold text-sm">Test Message</span>
            <p className="text-xs text-muted-foreground mt-0.5">أرسل رسالة تجريبية لأي رقم</p>
          </div>
          {testOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
        </button>
        {testOpen && (
          <div className="border-t border-border/30 p-5 space-y-3">
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
        )}
      </div>

      {/* ── BROADCAST ── */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <button
          className="liquid-glass-header w-full flex items-center gap-3 p-5 text-left hover:brightness-105 transition-all"
          onClick={() => setBroadcastOpen((o) => !o)}
          data-testid="button-toggle-broadcast"
        >
          <div className="w-10 h-10 rounded-xl liquid-gradient flex items-center justify-center shrink-0 shadow-lg">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <span className="font-semibold text-sm">Broadcast</span>
            <p className="text-xs text-muted-foreground mt-0.5">{clientsWithPhone.length} clients with phone</p>
          </div>
          {broadcastOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
        </button>
        {broadcastOpen && (
          <div className="border-t border-border/30 p-5 space-y-3">
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
        )}
      </div>

      {/* ── COMPLAINTS PANEL ── */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <button
          className="liquid-glass-header w-full flex items-center gap-3 p-5 text-left hover:brightness-105 transition-all"
          onClick={() => setComplaintsOpen((o) => !o)}
          data-testid="button-toggle-complaints"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <span className="font-semibold text-sm">شكاوى العملاء</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              {complaintsOpen && complaints
                ? `${complaints.length} شكوى — ${complaints.filter((c) => c.isResolved).length} محلولة`
                : "اضغط لعرض الشكاوى المكتشفة من المحادثات"}
            </p>
          </div>
          {complaintsFetching && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />}
          {complaintsOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
        </button>

        {complaintsOpen && (
          <div className="border-t border-border/30">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-5 py-3 glass-subtle">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3 text-amber-400" />
                  {complaints?.filter(c => c.complaintType === "complaint").length ?? 0} شكوى
                </span>
                <span className="flex items-center gap-1">
                  <Bot className="w-3 h-3 text-red-400" />
                  {complaints?.filter(c => c.complaintType === "bot_error").length ?? 0} خطأ بوت
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1.5"
                onClick={() => refetchComplaints()}
                disabled={complaintsFetching}
                data-testid="button-refresh-complaints"
              >
                <RefreshCw className={`w-3 h-3 ${complaintsFetching ? "animate-spin" : ""}`} />
                تحديث
              </Button>
            </div>

            {!complaints || complaints.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                <ShieldAlert className="w-8 h-8 opacity-30" />
                <p className="text-sm">لا توجد شكاوى أو أخطاء مكتشفة بعد</p>
                <p className="text-xs opacity-60 text-center px-6">
                  ستظهر هنا تلقائياً عندما يذكر العملاء مشاكل أو يصوّبون أخطاء البوت
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/40 max-h-[600px] overflow-y-auto">
                {complaints.map((c) => {
                  const isBotError = c.complaintType === "bot_error";
                  return (
                    <div key={c.id} className={`px-5 py-4 space-y-2 ${isBotError ? "bg-red-500/3" : ""}`}>
                      <div className="flex items-start gap-3">
                        {/* Type icon */}
                        <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${
                          isBotError
                            ? "bg-red-500/10"
                            : c.isResolved ? "bg-emerald-500/10" : "bg-amber-500/10"
                        }`}>
                          {isBotError
                            ? <Bot className="w-4 h-4 text-red-400" />
                            : c.isResolved
                              ? <ShieldCheck className="w-4 h-4 text-emerald-400" />
                              : <ShieldAlert className="w-4 h-4 text-amber-400" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Complaint/Error text */}
                          {isBotError ? (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">خطأ قالته لينا</span>
                              </div>
                              <p className="text-sm leading-relaxed text-red-300/80 line-through" dir="rtl">{c.complaintText}</p>
                              {c.fixNote && (
                                <div className="flex items-start gap-1.5 mt-1">
                                  <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide shrink-0 mt-0.5">الصحيح</span>
                                  <p className="text-sm leading-relaxed text-emerald-300" dir="rtl">{c.fixNote}</p>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm leading-relaxed" dir="rtl">{c.complaintText}</p>
                          )}

                          {/* Meta row */}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {c.clientName && (
                              <span className="text-[10px] text-muted-foreground">{c.clientName}</span>
                            )}
                            {c.sourcePhone && (
                              <span className="text-[10px] font-mono text-muted-foreground" dir="ltr">{c.sourcePhone}</span>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              {formatRelativeTime(c.detectedAt)}
                            </span>
                            {isBotError ? (
                              <Badge className="text-[9px] px-1.5 py-0 bg-red-500/15 text-red-400 border-red-500/30">
                                تصحيح تلقائي ✓
                              </Badge>
                            ) : c.isResolved ? (
                              <Badge className="text-[9px] px-1.5 py-0 bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                                محلولة
                              </Badge>
                            ) : (
                              <Badge className="text-[9px] px-1.5 py-0 bg-amber-500/15 text-amber-400 border-amber-500/30">
                                بانتظار الحل
                              </Badge>
                            )}
                          </div>

                          {/* Resolved fix note for complaints (not bot errors — they display inline above) */}
                          {!isBotError && c.isResolved && c.fixNote && (
                            <div className="mt-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                              <p className="text-xs text-emerald-300 leading-relaxed" dir="rtl">
                                <span className="font-semibold">الحل: </span>{c.fixNote}
                              </p>
                            </div>
                          )}

                          {/* Inline fix input (for unresolved complaints and editing bot errors) */}
                          {fixingId === c.id && (
                            <div className="mt-2 space-y-2" dir="rtl">
                              <Textarea
                                value={fixNote}
                                onChange={(e) => setFixNote(e.target.value)}
                                placeholder={isBotError ? "صحّح المعلومة الخاطئة هنا…" : "اكتبي الحل أو الإجراء الذي اتخذتموه…"}
                                rows={2}
                                className="text-xs"
                                data-testid={`textarea-fix-note-${c.id}`}
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                  disabled={!fixNote.trim() || resolveComplaintMutation.isPending}
                                  onClick={() => resolveComplaintMutation.mutate({ id: c.id, fixNote })}
                                  data-testid={`button-save-fix-${c.id}`}
                                >
                                  {resolveComplaintMutation.isPending
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <Save className="w-3 h-3" />}
                                  حفظ
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs"
                                  onClick={() => { setFixingId(null); setFixNote(""); }}
                                >
                                  إلغاء
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-col gap-1 shrink-0">
                          {(!c.isResolved || isBotError) && fixingId !== c.id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className={`h-7 text-xs gap-1 ${isBotError ? "text-red-400 hover:bg-red-500/10" : "text-amber-400 hover:bg-amber-500/10"}`}
                              onClick={() => { setFixingId(c.id); setFixNote(c.fixNote || ""); }}
                              data-testid={`button-fix-complaint-${c.id}`}
                            >
                              <Pencil className="w-3 h-3" />
                              {isBotError ? "تعديل" : "حل"}
                            </Button>
                          )}
                          {!isBotError && c.isResolved && fixingId !== c.id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1 text-muted-foreground hover:bg-muted/30"
                              onClick={() => { setFixingId(c.id); setFixNote(c.fixNote || ""); }}
                              data-testid={`button-edit-fix-${c.id}`}
                            >
                              <Pencil className="w-3 h-3" />
                              تعديل
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs gap-1 text-destructive hover:bg-destructive/10"
                            onClick={() => deleteComplaintMutation.mutate(c.id)}
                            disabled={deleteComplaintMutation.isPending}
                            data-testid={`button-delete-complaint-${c.id}`}
                          >
                            <Trash2 className="w-3 h-3" />
                            حذف
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── BOT VOICE SETTINGS ── */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <button
          className="liquid-glass-header w-full flex items-center gap-3 p-5 text-left hover:brightness-105 transition-all"
          onClick={() => setVoiceOpen((o) => !o)}
          data-testid="button-toggle-voice"
        >
          <div className="w-10 h-10 rounded-xl liquid-gradient flex items-center justify-center shrink-0 shadow-lg">
            <Mic className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <span className="font-semibold text-sm">صوت البوت (رسائل صوتية)</span>
            <p className="text-xs text-muted-foreground mt-0.5">{bizSettings?.ttsVoice ?? "Aoede"} — Gemini TTS</p>
          </div>
          {voiceOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
        </button>
        {voiceOpen && (
          <div className="border-t border-border/30 p-5 space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              عندما يرسل العميل رسالة صوتية، يرد البوت بصوت — اختاري صوت لينا المناسب للصالون 💅
            </p>
            <div className="grid grid-cols-1 gap-2" dir="rtl">
              {[
                { id: "Aoede",  icon: "🌸", label: "آوڤي",   desc: "ناعمة ودافئة — مثالية للدارجة",  feminine: true  },
                { id: "Kore",   icon: "✨", label: "كوري",   desc: "شبابية وحيوية — طاقة إيجابية",  feminine: true  },
                { id: "Puck",   icon: "😄", label: "پاك",    desc: "مرحة وخفيفة — تلقائية",        feminine: false },
                { id: "Charon", icon: "🎯", label: "شارون",  desc: "واثقة وهادئة — ثقة عالية",     feminine: false },
                { id: "Fenrir", icon: "💪", label: "فنرير",  desc: "قوية ومقنعة — أسلوب حازم",    feminine: false },
              ].map((v) => (
                <button
                  key={v.id}
                  data-testid={`button-voice-${v.id}`}
                  onClick={() => setSelectedVoice(v.id)}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-right transition-all ${
                    selectedVoice === v.id
                      ? "border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/40"
                      : "glass-subtle hover:brightness-105"
                  }`}
                >
                  <span className="text-xl">{v.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{v.label}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{v.id}</span>
                      {v.feminine && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-pink-500/40 text-pink-400">أنثوي</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{v.desc}</p>
                  </div>
                  {selectedVoice === v.id && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  )}
                </button>
              ))}
            </div>
            <Button
              className="w-full"
              onClick={() => saveVoiceMutation.mutate(selectedVoice)}
              disabled={saveVoiceMutation.isPending || selectedVoice === (bizSettings?.ttsVoice ?? "Aoede")}
              data-testid="button-save-voice"
            >
              {saveVoiceMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {saveVoiceMutation.isPending ? "جاري الحفظ…" : "حفظ الصوت"}
            </Button>
          </div>
        )}
      </div>

      {/* ── BOT-CONFIRMED BOOKINGS ── */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <button
          className="liquid-glass-header w-full flex items-center gap-3 p-5 text-left hover:brightness-105 transition-all"
          onClick={() => setBotConfirmedOpen((o) => !o)}
          data-testid="button-toggle-bot-confirmed"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1">
            <span className="font-semibold text-sm">حجوزات أكّدها البوت</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              {botConfirmedOpen && botConfirmedAppointments.length > 0
                ? `${botConfirmedAppointments.length} حجز مؤكّد عبر واتساب`
                : "اضغط لعرض المواعيد التي أكّدها العملاء عبر واتساب"}
            </p>
          </div>
          {botConfirmedFetching && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />}
          {botConfirmedOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
        </button>

        {botConfirmedOpen && (
          <div className="border-t border-border/30">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-5 py-3 glass-subtle">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>{botConfirmedAppointments.length} حجز مؤكّد</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1.5"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/appointments/bot-confirmed"] })}
                disabled={botConfirmedFetching}
                data-testid="button-refresh-bot-confirmed"
              >
                <RefreshCw className={`w-3 h-3 ${botConfirmedFetching ? "animate-spin" : ""}`} />
                تحديث
              </Button>
            </div>

            {botConfirmedFetching ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : botConfirmedAppointments.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground" dir="rtl">
                <CheckCircle2 className="w-8 h-8 opacity-30" />
                <p className="text-sm">لا توجد حجوزات مؤكّدة من البوت بعد</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40" dir="rtl">
                {botConfirmedAppointments.map((apt: any) => {
                  const currency = bizSettings?.currencySymbol ?? "DH";
                  const services = (() => {
                    try { return apt.servicesJson ? JSON.parse(apt.servicesJson) : null; } catch { return null; }
                  })();
                  const serviceNames = services?.map((s: any) => s.name).join("، ") || apt.service || "—";
                  const totalDuration = services?.reduce((a: number, s: any) => a + (s.duration || 0), 0) || apt.duration;
                  return (
                    <div
                      key={apt.id}
                      className="px-5 py-4 space-y-3 hover:bg-muted/10 transition-colors"
                      data-testid={`row-bot-confirmed-${apt.id}`}
                    >
                      {/* Row 1: client + paid badge */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-emerald-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{apt.client || "—"}</p>
                            {apt.phone && (
                              <p className="text-[11px] font-mono text-muted-foreground" dir="ltr">{apt.phone}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge
                            className={`text-[10px] px-2 py-0 ${apt.paid ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-amber-500/15 text-amber-400 border-amber-500/30"}`}
                          >
                            {apt.paid ? "مدفوع ✓" : "غير مدفوع"}
                          </Badge>
                        </div>
                      </div>

                      {/* Row 2: service + duration */}
                      <div className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary/60" />
                        <span className="flex-1 leading-relaxed">{serviceNames}</span>
                        {totalDuration > 0 && (
                          <span className="shrink-0 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {totalDuration} د
                          </span>
                        )}
                      </div>

                      {/* Row 3: staff + date/time + price */}
                      <div className="flex items-center gap-3 flex-wrap">
                        {apt.staff && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <User className="w-3 h-3" />
                            {apt.staff}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground" dir="ltr">
                          <Calendar className="w-3 h-3" />
                          {apt.date}
                        </span>
                        {apt.startTime && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground" dir="ltr">
                            <Clock className="w-3 h-3" />
                            {apt.startTime}
                          </span>
                        )}
                        {apt.total > 0 && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-foreground mr-auto" dir="ltr">
                            {apt.total} {currency}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── CONVERSATION LOG ── */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {/* Header */}
        <button
          className="liquid-glass-header w-full flex items-center gap-3 p-5 text-left hover:brightness-105 transition-all"
          onClick={() => setLogOpen((o) => !o)}
          data-testid="button-toggle-conv-log"
        >
          <div className="w-10 h-10 rounded-xl liquid-gradient flex items-center justify-center shrink-0 shadow-lg">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <span className="font-semibold text-sm">سجل محادثات لينا</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              {conversations ? `${conversations.length} محادثة محفوظة` : "اضغط لعرض المحادثات"}
            </p>
          </div>
          {convsFetching && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />}
          {logOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
        </button>

        {logOpen && (
          <div className="border-t border-border/30">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-5 py-3 glass-subtle">
              <span className="text-xs text-muted-foreground">
                {conversations?.length ?? 0} محادثة — آخر 100
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1.5"
                onClick={() => refetchConvs()}
                disabled={convsFetching}
                data-testid="button-refresh-convs"
              >
                <RefreshCw className={`w-3 h-3 ${convsFetching ? "animate-spin" : ""}`} />
                تحديث
              </Button>
            </div>

            {/* List */}
            {!conversations || conversations.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                <MessageCircle className="w-8 h-8 opacity-30" />
                <p className="text-sm">لا توجد محادثات محفوظة بعد</p>
                <p className="text-xs opacity-60">ستظهر هنا بعد أول رسالة يستلمها البوت</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40 max-h-[600px] overflow-y-auto">
                {conversations.map((conv) => {
                  const isExpanded = expandedJid === conv.jid;
                  const lastMsg = conv.history[conv.history.length - 1];
                  return (
                    <div key={conv.jid} className={`transition-colors ${conv.botBlocked ? "opacity-60" : ""}`}>
                      {/* Conversation row — RTL layout */}
                      <div className="flex items-center gap-0 px-5 py-3.5" dir="rtl">
                        {/* Block toggle — rightmost in RTL = visual right */}
                        <div
                          className="flex flex-col items-center gap-0.5 shrink-0 ml-3"
                          title={conv.botBlocked ? "تفعيل البوت" : "إيقاف البوت"}
                        >
                          <Switch
                            checked={!conv.botBlocked}
                            onCheckedChange={(val) =>
                              blockConvMutation.mutate({ jid: conv.jid, blocked: !val })
                            }
                            disabled={blockConvMutation.isPending}
                            data-testid={`switch-bot-block-${conv.phone}`}
                            className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-red-500"
                          />
                          <span className={`text-[9px] font-semibold ${conv.botBlocked ? "text-red-500" : "text-emerald-500"}`}>
                            {conv.botBlocked ? "موقوف" : "نشط"}
                          </span>
                        </div>
                        <button
                          className="flex items-center gap-3 flex-1 min-w-0 text-right hover:bg-muted/20 transition-colors rounded-lg pl-2"
                          onClick={() => setExpandedJid(isExpanded ? null : conv.jid)}
                          data-testid={`button-conv-${conv.phone}`}
                        >
                          {/* Expand chevron — first in RTL = visual right after toggle */}
                          <ChevronDown
                            className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                          {/* Meta */}
                          <div className="flex flex-col items-start gap-1 shrink-0">
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Clock className="w-2.5 h-2.5" />
                              <span>{formatRelativeTime(conv.lastSeen)}</span>
                            </div>
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                              {conv.history.length} رسالة
                            </Badge>
                          </div>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm truncate" dir="ltr">
                                {conv.clientName || conv.phone}
                              </span>
                              {conv.clientName && (
                                <span className="text-[10px] font-mono text-muted-foreground" dir="ltr">
                                  {conv.phone}
                                </span>
                              )}
                              <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                                {langLabel(conv.language)}
                              </Badge>
                              {conv.botBlocked && (
                                <Badge variant="destructive" className="text-[9px] px-1 py-0 shrink-0">
                                  موقوف
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5" dir="rtl">
                              {lastMsg?.role === "model" ? "لينا: " : ""}
                              {lastMsg?.text?.replace(/^🎙️\s*/, "") ?? "—"}
                            </p>
                          </div>
                          {/* Avatar */}
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${conv.botBlocked ? "bg-destructive/10 border border-destructive/30" : "bg-emerald-500/15 border border-emerald-500/30"}`}>
                            {conv.botBlocked ? (
                              <BotOff className="w-4 h-4 text-destructive" />
                            ) : (
                              <User className="w-4 h-4 text-emerald-500" />
                            )}
                          </div>
                        </button>
                      </div>

                      {/* Expanded chat bubble view */}
                      {isExpanded && (
                        <div className="px-5 pb-4 space-y-3 bg-muted/10">

                          {/* ── Bot Memory Card ── */}
                          {(conv.personalityNotes || (conv.preferredServices && conv.preferredServices.length > 0)) && (
                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                              <div className="flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span className="text-[11px] font-semibold text-emerald-400">ما تعلمه البوت عن هاد العميلة</span>
                              </div>
                              {conv.preferredServices && conv.preferredServices.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {conv.preferredServices.map((svc, si) => (
                                    <Badge
                                      key={si}
                                      variant="secondary"
                                      className="text-[10px] px-2 py-0 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                                    >
                                      {svc}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {conv.personalityNotes && (
                                <p className="text-[11px] text-muted-foreground leading-relaxed" dir="rtl">
                                  {conv.personalityNotes}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Chat bubbles */}
                          <div className="space-y-2 max-h-72 overflow-y-auto pt-2 pr-1">
                            {conv.history.map((turn, i) => (
                              <div
                                key={i}
                                className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}
                              >
                                <div
                                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                                    turn.role === "user"
                                      ? "bg-emerald-500/20 text-foreground rounded-tr-sm"
                                      : "bg-card border border-border text-foreground rounded-tl-sm"
                                  }`}
                                  dir="rtl"
                                >
                                  {turn.role === "model" && (
                                    <span className="text-[10px] font-semibold text-emerald-400 block mb-0.5">لينا</span>
                                  )}
                                  <span className="whitespace-pre-wrap break-words">
                                    {turn.text.replace(/^🎙️\s*/, "")}
                                    {turn.text.startsWith("🎙️") && (
                                      <span className="inline-flex items-center gap-0.5 ml-1 text-[10px] text-muted-foreground">
                                        <Mic className="w-2.5 h-2.5" /> رسالة صوتية
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs text-muted-foreground">
                              {Math.ceil(conv.history.length / 2)} رسالة ذهاب وإياب · {conv.visitCount} زيارة
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => clearConvMutation.mutate(conv.jid)}
                              disabled={clearConvMutation.isPending}
                              data-testid={`button-clear-conv-${conv.phone}`}
                            >
                              {clearConvMutation.isPending ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
                              مسح السجل
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── PHONE NUMBER FILTER ── */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {/* Header — click to expand/collapse */}
        <button
          className="liquid-glass-header w-full flex items-center gap-3 p-5 text-left hover:brightness-105 transition-all"
          onClick={() => setFilterOpen((o) => !o)}
          data-testid="button-toggle-filter"
        >
          <div className="w-10 h-10 rounded-xl liquid-gradient flex items-center justify-center shrink-0 shadow-lg">
            <Filter className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <span className="font-semibold text-sm">فلتر الأرقام</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              {filterMode === "all"
                ? "البوت يرد على الجميع"
                : filterMode === "allowlist"
                ? `قائمة بيضاء — ${filterNumbers.length} رقم`
                : `قائمة سوداء — ${filterNumbers.length} رقم`}
            </p>
          </div>
          <Badge
            variant="secondary"
            className={`text-xs shrink-0 liquid-glass-chip ${
              filterMode === "allowlist"
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : filterMode === "blocklist"
                ? "bg-red-500/15 text-red-400 border-red-500/30"
                : ""
            }`}
          >
            {filterMode === "all" ? "الكل" : filterMode === "allowlist" ? "قائمة بيضاء" : "قائمة سوداء"}
          </Badge>
          {filterOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
        </button>

        {/* Collapsed body */}
        {filterOpen && (
          <div className="px-5 pb-5 space-y-4 border-t border-border/30">
            {/* Mode selector */}
            <div className="space-y-2 pt-4">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">وضع الفلتر</Label>
              <div className="grid grid-cols-3 gap-1.5" dir="rtl">
                {([
                  { value: "all",       label: "الجميع",       desc: "يرد على كل الأرقام",          color: "blue"    },
                  { value: "allowlist", label: "قائمة بيضاء",  desc: "يرد فقط على الأرقام المحددة", color: "emerald" },
                  { value: "blocklist", label: "قائمة سوداء",  desc: "يتجاهل الأرقام المحددة",      color: "red"     },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    data-testid={`button-filter-mode-${opt.value}`}
                    onClick={() => setFilterMode(opt.value)}
                    className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2 text-center transition-all text-xs ${
                      filterMode === opt.value
                        ? opt.color === "blue"
                          ? "border-blue-500/60 bg-blue-500/10 ring-1 ring-blue-500/40 text-blue-400"
                          : opt.color === "emerald"
                          ? "border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/40 text-emerald-400"
                          : "border-red-500/60 bg-red-500/10 ring-1 ring-red-500/40 text-red-400"
                        : "glass-subtle hover:brightness-105 text-muted-foreground"
                    }`}
                  >
                    <span className="font-semibold text-[11px]">{opt.label}</span>
                    <span className="text-[9px] leading-tight opacity-80 hidden sm:block">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Number list — only shown when not "all" */}
            {filterMode !== "all" && (
              <div className="space-y-3">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  {filterMode === "allowlist" ? "الأرقام المسموح لها" : "الأرقام المحظورة"}
                </Label>

                {/* Add number input */}
                <div className="flex gap-2">
                  <Input
                    placeholder="212XXXXXXXXX أو +212XXXXXXXXX"
                    value={filterInput}
                    onChange={(e) => setFilterInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addFilterNumber()}
                    className="flex-1 text-sm font-mono"
                    data-testid="input-filter-number"
                    dir="ltr"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={addFilterNumber}
                    disabled={!filterInput.trim()}
                    data-testid="button-add-filter-number"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {/* Number chips */}
                {filterNumbers.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3 border rounded-xl border-dashed border-border/40">
                    لم تُضَف أي أرقام بعد
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {filterNumbers.map((num) => (
                      <div
                        key={num}
                        className="liquid-glass-chip flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-mono"
                        data-testid={`chip-filter-number-${num}`}
                      >
                        <span dir="ltr">{num}</span>
                        <button
                          onClick={() => removeFilterNumber(num)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          data-testid={`button-remove-filter-${num}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Info box */}
            <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/40 border text-xs text-muted-foreground" dir="rtl">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
              <span>
                أدخل الأرقام بالصيغة الدولية مثل <span dir="ltr" className="font-mono">212612345678</span> أو <span dir="ltr" className="font-mono">+212612345678</span> — البوت يُوحِّد الصيغ أوتوماتيك.
              </span>
            </div>

            {/* Save button */}
            {filterDirty && (
              <p className="text-xs text-amber-400 text-center font-medium animate-pulse">
                ⚠️ لديك تغييرات غير محفوظة — اضغط على حفظ
              </p>
            )}
            <Button
              className={`w-full ${filterDirty ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}`}
              onClick={() => saveFilterMutation.mutate({ mode: filterMode, numbers: filterNumbers })}
              disabled={saveFilterMutation.isPending}
              data-testid="button-save-filter"
            >
              {saveFilterMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {saveFilterMutation.isPending ? "جاري الحفظ…" : "حفظ الفلتر"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
