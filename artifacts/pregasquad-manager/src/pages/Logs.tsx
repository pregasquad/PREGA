import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal, Pause, Play, Trash2, Download, Filter, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: number;
  ts: number;
  level: "log" | "warn" | "error";
  msg: string;
}

type Category =
  | "Bot"
  | "BossCorrection"
  | "Baileys"
  | "WhatsApp"
  | "Storage"
  | "accept-bot"
  | "Client"
  | "Other";

const CATEGORIES: { key: Category; label: string; color: string; bgColor: string; match: RegExp }[] = [
  { key: "Baileys",       label: "Baileys",        color: "text-blue-400",    bgColor: "bg-blue-500/15 border-blue-500/30 text-blue-400",   match: /\[Baileys\]/i },
  { key: "Bot",           label: "Bot",            color: "text-emerald-400", bgColor: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400", match: /\[Bot\]/i },
  { key: "BossCorrection",label: "Correction",     color: "text-amber-400",   bgColor: "bg-amber-500/15 border-amber-500/30 text-amber-400", match: /\[BossCorrection\]/i },
  { key: "WhatsApp",      label: "WhatsApp",       color: "text-green-400",   bgColor: "bg-green-500/15 border-green-500/30 text-green-400", match: /\[WhatsApp\]/i },
  { key: "Storage",       label: "Storage",        color: "text-cyan-400",    bgColor: "bg-cyan-500/15 border-cyan-500/30 text-cyan-400",   match: /\[STORAGE\]/i },
  { key: "accept-bot",    label: "Accept",         color: "text-violet-400",  bgColor: "bg-violet-500/15 border-violet-500/30 text-violet-400", match: /\[accept-bot\]/i },
  { key: "Client",        label: "Client",         color: "text-pink-400",    bgColor: "bg-pink-500/15 border-pink-500/30 text-pink-400",   match: /^Client (connected|disconnected)/i },
  { key: "Other",         label: "Other",          color: "text-zinc-400",    bgColor: "bg-zinc-500/15 border-zinc-500/30 text-zinc-400",   match: /.*/ },
];

function getCategory(msg: string): Category {
  for (const cat of CATEGORIES) {
    if (cat.key === "Other") continue;
    if (cat.match.test(msg)) return cat.key;
  }
  return "Other";
}

function colorizeMsg(msg: string, level: LogEntry["level"]): { prefix: string; rest: string; color: string } {
  if (level === "error") return { prefix: "", rest: msg, color: "text-red-400" };
  if (level === "warn")  return { prefix: "", rest: msg, color: "text-yellow-400" };

  for (const cat of CATEGORIES) {
    if (cat.key === "Other") continue;
    const m = msg.match(cat.match);
    if (m) {
      const bracket = m[0];
      const idx = msg.indexOf(bracket);
      const prefix = msg.slice(0, idx + bracket.length);
      const rest = msg.slice(idx + bracket.length);
      return { prefix, rest, color: cat.color };
    }
  }
  return { prefix: "", rest: msg, color: "text-zinc-400" };
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("fr-FR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<Category>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const lastIdRef = useRef<number>(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close();
    const url = `/api/logs/stream?since=${lastIdRef.current}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => {
      setConnected(false);
      es.close();
      setTimeout(connect, 3000);
    };
    es.onmessage = (e) => {
      if (pausedRef.current) return;
      try {
        const incoming: LogEntry[] = JSON.parse(e.data);
        if (!incoming.length) return;
        lastIdRef.current = incoming[incoming.length - 1].id;
        setLogs((prev) => {
          const merged = [...prev, ...incoming].slice(-600);
          return merged;
        });
      } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    fetch("/api/logs")
      .then((r) => r.json())
      .then(({ logs: initial, lastId }: { logs: LogEntry[]; lastId: number }) => {
        setLogs(initial);
        lastIdRef.current = lastId;
        connect();
      })
      .catch(connect);

    return () => esRef.current?.close();
  }, [connect]);

  useEffect(() => {
    if (autoScroll && !paused) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll, paused]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAutoScroll(atBottom);
  };

  const visibleLogs = logs.filter((entry) => {
    const cat = getCategory(entry.msg);
    if (activeCategories.size > 0 && !activeCategories.has(cat)) return false;
    if (filter) return entry.msg.toLowerCase().includes(filter.toLowerCase());
    return true;
  });

  const toggleCategory = (cat: Category) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleDownload = () => {
    const text = visibleLogs
      .map((e) => `[${formatTime(e.ts)}] [${e.level.toUpperCase()}] ${e.msg}`)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `server-logs-${Date.now()}.txt`;
    a.click();
  };

  return (
    <div className="flex flex-col h-full min-h-0 p-4 gap-3" dir="ltr">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl liquid-gradient flex items-center justify-center shadow-lg">
            <Terminal className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight">Server Logs</h1>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Circle
                className={cn("w-2 h-2 fill-current", connected ? "text-emerald-400" : "text-red-400")}
              />
              <span>{connected ? "Live" : "Reconnecting…"}</span>
              <span className="opacity-50">·</span>
              <span>{visibleLogs.length} lines</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className={cn("h-8 text-xs gap-1.5 rounded-xl", paused && "border-amber-500/50 text-amber-400")}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 rounded-xl"
            onClick={handleDownload}
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 rounded-xl hover:border-red-500/50 hover:text-red-400"
            onClick={() => setLogs([])}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter logs…"
            className="h-8 pl-8 text-xs rounded-xl font-mono"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => toggleCategory(cat.key)}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-all",
                activeCategories.has(cat.key)
                  ? cat.bgColor
                  : "border-border/40 text-muted-foreground hover:border-border"
              )}
            >
              {cat.label}
            </button>
          ))}
          {activeCategories.size > 0 && (
            <button
              onClick={() => setActiveCategories(new Set())}
              className="text-[11px] px-2 py-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            >
              ✕ clear
            </button>
          )}
        </div>
      </div>

      {/* Terminal */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-zinc-950 border border-border/40 p-4 font-mono text-xs leading-5"
      >
        {visibleLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-2">
            <Terminal className="w-8 h-8 opacity-30" />
            <p>No logs yet — waiting for server output…</p>
          </div>
        ) : (
          visibleLogs.map((entry) => {
            const { prefix, rest, color } = colorizeMsg(entry.msg, entry.level);
            return (
              <div key={entry.id} className="flex gap-2 hover:bg-white/[0.02] rounded px-1 -mx-1 group">
                <span className="text-zinc-600 shrink-0 select-none tabular-nums">
                  {formatTime(entry.ts)}
                </span>
                {entry.level !== "log" && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] px-1 py-0 h-4 shrink-0 self-start mt-0.5 font-mono",
                      entry.level === "error"
                        ? "border-red-500/40 text-red-400 bg-red-500/10"
                        : "border-yellow-500/40 text-yellow-400 bg-yellow-500/10"
                    )}
                  >
                    {entry.level.toUpperCase()}
                  </Badge>
                )}
                <span className={cn("break-all whitespace-pre-wrap flex-1", color)}>
                  {prefix && (
                    <span className="font-bold">{prefix}</span>
                  )}
                  {rest}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }}
          className="fixed bottom-20 right-6 text-xs px-3 py-1.5 rounded-xl bg-primary text-white shadow-lg hover:opacity-90 transition z-50"
        >
          ↓ Scroll to bottom
        </button>
      )}
    </div>
  );
}
