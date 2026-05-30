export interface LogEntry {
  id: number;
  ts: number;
  level: "log" | "warn" | "error";
  msg: string;
}

const MAX_LOGS = 600;
const buffer: LogEntry[] = [];
let counter = 0;

const _log = console.log.bind(console);
const _warn = console.warn.bind(console);
const _error = console.error.bind(console);

function capture(level: LogEntry["level"], args: unknown[]) {
  const msg = args
    .map((a) =>
      typeof a === "string"
        ? a
        : a instanceof Error
        ? `${a.message}`
        : (() => { try { return JSON.stringify(a); } catch { return String(a); } })()
    )
    .join(" ");
  if (!msg.trim()) return;
  buffer.push({ id: ++counter, ts: Date.now(), level, msg });
  if (buffer.length > MAX_LOGS) buffer.shift();
}

console.log = (...args: unknown[]) => { _log(...args); capture("log", args); };
console.warn = (...args: unknown[]) => { _warn(...args); capture("warn", args); };
console.error = (...args: unknown[]) => { _error(...args); capture("error", args); };

export function getRecentLogs(sinceId?: number): LogEntry[] {
  if (sinceId === undefined) return [...buffer];
  return buffer.filter((e) => e.id > sinceId);
}

export function getLastId(): number {
  return buffer.length > 0 ? buffer[buffer.length - 1].id : 0;
}
