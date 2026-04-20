import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Sparkles, Clock, Trophy, RefreshCw } from "lucide-react";

const SEGMENTS = [
  { label: "Better\nNext Time", color: "#1a2035",   border: "#2d3748", textColor: "#6b7280", prize: null      }, // 0
  { label: "20%",              color: "#4c1d95",   border: "#7c3aed", textColor: "#ede9fe", prize: "20%"     }, // 1
  { label: "Better\nNext Time", color: "#111827",   border: "#1f2937", textColor: "#6b7280", prize: null      }, // 2
  { label: "40%",              color: "#78350f",   border: "#d97706", textColor: "#fef3c7", prize: "40%"     }, // 3
  { label: "Better\nNext Time", color: "#1a2035",   border: "#2d3748", textColor: "#6b7280", prize: null      }, // 4
  { label: "60%",              color: "#064e3b",   border: "#059669", textColor: "#d1fae5", prize: "60%"     }, // 5
  { label: "Better\nNext Time", color: "#111827",   border: "#1f2937", textColor: "#6b7280", prize: null      }, // 6
  { label: "80%",              color: "#1e3a8a",   border: "#2563eb", textColor: "#dbeafe", prize: "80%"     }, // 7
  { label: "Better\nNext Time", color: "#1a2035",   border: "#2d3748", textColor: "#6b7280", prize: null      }, // 8
  { label: "Free\nService",    color: "#831843",   border: "#db2777", textColor: "#fce7f3", prize: "free"    }, // 9
];

const N = SEGMENTS.length;
const DEG = 360 / N; // 36°
const CX = 200, CY = 200, R = 185, TEXT_R = 125;

function polar(r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function slicePath(i: number) {
  const s = polar(R, i * DEG);
  const e = polar(R, (i + 1) * DEG);
  return `M ${CX},${CY} L ${s.x},${s.y} A ${R},${R} 0 0,1 ${e.x},${e.y} Z`;
}

function getDeviceId() {
  let id = localStorage.getItem("tombola_device_id");
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("tombola_device_id", id);
  }
  return id;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function prizeLabel(prize: string | null): string {
  if (!prize) return "";
  if (prize === "free") return "Free Service!";
  return `${prize} Discount!`;
}

function prizeEmoji(prize: string | null): string {
  if (!prize) return "😢";
  if (prize === "free") return "🎁";
  if (prize === "-20%") return "🎉";
  return "💰";
}

export default function Tombola() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [canSpin, setCanSpin] = useState(true);
  const [nextSpinAt, setNextSpinAt] = useState<Date | null>(null);
  const [resultPrize, setResultPrize] = useState<string | null | undefined>(undefined);
  const [showResult, setShowResult] = useState(false);
  const [countdown, setCountdown] = useState("");
  const [checking, setChecking] = useState(true);
  const deviceId = getDeviceId();

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/tombola/status?deviceId=${encodeURIComponent(deviceId)}`);
      const data = await res.json();
      setCanSpin(data.canSpin);
      if (!data.canSpin && data.nextSpinAt) setNextSpinAt(new Date(data.nextSpinAt));
    } catch {
      setCanSpin(true);
    } finally {
      setChecking(false);
    }
  }, [deviceId]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  useEffect(() => {
    if (!nextSpinAt) { setCountdown(""); return; }
    const tick = () => {
      const diff = nextSpinAt.getTime() - Date.now();
      if (diff <= 0) { setCanSpin(true); setNextSpinAt(null); setCountdown(""); return; }
      setCountdown(formatCountdown(diff));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextSpinAt]);

  const handleSpin = async () => {
    if (isSpinning || !canSpin) return;
    setIsSpinning(true);
    setShowResult(false);

    try {
      const res = await fetch("/api/tombola/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });

      if (res.status === 429) {
        const data = await res.json();
        setCanSpin(false);
        if (data.nextSpinAt) setNextSpinAt(new Date(data.nextSpinAt));
        setIsSpinning(false);
        return;
      }

      const data = await res.json();
      const segIdx: number = data.segmentIndex;

      const targetMod = (360 - (segIdx * DEG + DEG / 2) + 360) % 360;
      const currentMod = rotation % 360;
      const spinOffset = (targetMod - currentMod + 360) % 360;
      const finalRotation = rotation + 1800 + spinOffset;

      setRotation(finalRotation);

      setTimeout(() => {
        setResultPrize(SEGMENTS[segIdx].prize);
        setShowResult(true);
        setCanSpin(false);
        if (data.nextSpinAt) setNextSpinAt(new Date(data.nextSpinAt));
        setIsSpinning(false);
      }, 5500);
    } catch {
      setIsSpinning(false);
    }
  };

  return (
    <AppLayout>
      <div
        dir={isRtl ? "rtl" : "ltr"}
        className="min-h-screen flex flex-col items-center justify-start py-6 px-4 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
        }}
      >
        {/* Ambient blobs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)" }} />
        <div className="absolute bottom-20 right-1/4 w-80 h-80 rounded-full opacity-15 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #db2777 0%, transparent 70%)" }} />

        {/* Logo + Title card */}
        <div className="w-full max-w-sm mb-6 rounded-2xl overflow-hidden relative"
          style={{
            background: "rgba(255,255,255,0.07)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.15)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
          }}>
          <div className="absolute inset-x-0 top-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)" }} />
          <div className="flex flex-col items-center py-5 px-4 gap-2">
            <img src="/prega_logo.png" alt="PREGASQUAD" className="h-14 w-auto object-contain drop-shadow-lg" />
            <div className="flex items-center gap-2 mt-1">
              <Sparkles className="w-4 h-4 text-yellow-400" />
              <span className="text-white font-bold text-lg tracking-wide">Tombola Lucky Wheel</span>
              <Sparkles className="w-4 h-4 text-yellow-400" />
            </div>
            <p className="text-gray-400 text-xs text-center">Spin once every 48 hours · 1% chance to win a prize!</p>
          </div>
        </div>

        {/* Wheel container */}
        <div className="relative flex items-center justify-center mb-6">
          {/* Outer ring glow */}
          <div className="absolute rounded-full"
            style={{
              width: 430, height: 430,
              background: "radial-gradient(circle, transparent 48%, rgba(124,58,237,0.3) 55%, transparent 65%)",
              filter: "blur(8px)",
            }} />

          {/* Pointer arrow */}
          <div className="absolute z-20 top-[-6px] left-1/2 -translate-x-1/2 flex flex-col items-center">
            <div style={{
              width: 0, height: 0,
              borderLeft: "14px solid transparent",
              borderRight: "14px solid transparent",
              borderTop: "28px solid #f59e0b",
              filter: "drop-shadow(0 2px 8px rgba(245,158,11,0.8))",
            }} />
          </div>

          {/* Wheel */}
          <div
            style={{
              width: 400,
              height: 400,
              borderRadius: "50%",
              transition: isSpinning ? "transform 5.2s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
              transform: `rotateZ(${rotation}deg)`,
              boxShadow: "0 0 0 6px rgba(255,255,255,0.08), 0 0 40px rgba(124,58,237,0.4), 0 20px 60px rgba(0,0,0,0.6)",
            }}
          >
            <svg viewBox="0 0 400 400" width="400" height="400" style={{ display: "block" }}>
              {/* Segments */}
              {SEGMENTS.map((seg, i) => {
                const mid = polar(TEXT_R, i * DEG + DEG / 2);
                const textAngle = i * DEG + DEG / 2;
                const lines = seg.label.split("\n");
                return (
                  <g key={i}>
                    <path
                      d={slicePath(i)}
                      fill={seg.color}
                      stroke={seg.border}
                      strokeWidth="1.5"
                    />
                    <g transform={`rotate(${textAngle}, ${mid.x}, ${mid.y})`}>
                      {lines.map((line, li) => (
                        <text
                          key={li}
                          x={mid.x}
                          y={mid.y + (li - (lines.length - 1) / 2) * 14}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={seg.textColor}
                          fontSize={seg.prize ? "18" : "9"}
                          fontWeight={seg.prize ? "800" : "500"}
                          fontFamily="system-ui, -apple-system, sans-serif"
                          letterSpacing={seg.prize ? "1" : "0"}
                        >
                          {line}
                        </text>
                      ))}
                    </g>
                  </g>
                );
              })}

              {/* Center circle */}
              <circle cx={CX} cy={CY} r="32" fill="#0f0c29" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
              <circle cx={CX} cy={CY} r="26" fill="url(#centerGrad)" />
              <text x={CX} y={CY} textAnchor="middle" dominantBaseline="middle"
                fontSize="18" fill="#f59e0b" fontWeight="900">✦</text>

              <defs>
                <radialGradient id="centerGrad" cx="40%" cy="35%">
                  <stop offset="0%" stopColor="#4c1d95" />
                  <stop offset="100%" stopColor="#1f1135" />
                </radialGradient>
              </defs>
            </svg>
          </div>

          {/* Shine overlay on wheel */}
          <div className="absolute rounded-full pointer-events-none" style={{
            width: 400, height: 400,
            background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 50%)",
            borderRadius: "50%",
          }} />
        </div>

        {/* Spin button / status area */}
        <div className="w-full max-w-sm flex flex-col items-center gap-4">
          {checking ? (
            <div className="flex items-center gap-2 text-gray-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm">Checking…</span>
            </div>
          ) : canSpin ? (
            <button
              onClick={handleSpin}
              disabled={isSpinning}
              className="relative w-full py-4 rounded-2xl font-bold text-xl text-white overflow-hidden transition-all active:scale-95 disabled:opacity-60"
              style={{
                background: isSpinning
                  ? "rgba(124,58,237,0.4)"
                  : "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #7c3aed 100%)",
                boxShadow: isSpinning ? "none" : "0 0 30px rgba(124,58,237,0.7), 0 4px 20px rgba(0,0,0,0.5)",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              <span className="absolute inset-x-0 top-0 h-px"
                style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)" }} />
              {isSpinning ? (
                <span className="flex items-center justify-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Spinning…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Sparkles className="w-5 h-5 text-yellow-300" />
                  SPIN THE WHEEL!
                  <Sparkles className="w-5 h-5 text-yellow-300" />
                </span>
              )}
            </button>
          ) : (
            <div className="w-full rounded-2xl p-5 flex flex-col items-center gap-2"
              style={{
                background: "rgba(255,255,255,0.06)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
              }}>
              <Clock className="w-7 h-7 text-purple-400" />
              <p className="text-gray-300 text-sm font-medium">Next spin available in</p>
              <p className="text-3xl font-mono font-bold text-white tracking-widest">{countdown || "—"}</p>
              <p className="text-gray-500 text-xs">Come back in 48 hours to try again</p>
            </div>
          )}

          {/* Prize legend */}
          <div className="w-full rounded-2xl p-4"
            style={{
              background: "rgba(255,255,255,0.04)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3 text-center">Possible Prizes</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "20% Discount",  color: "#7c3aed", emoji: "🎉" },
                { label: "40% Discount",  color: "#d97706", emoji: "💛" },
                { label: "60% Discount",  color: "#059669", emoji: "💚" },
                { label: "80% Discount",  color: "#2563eb", emoji: "💙" },
                { label: "Free Service",  color: "#db2777", emoji: "🎁", wide: true },
              ].map((p) => (
                <div key={p.label}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2${(p as any).wide ? " col-span-2 justify-center" : ""}`}
                  style={{ background: `${p.color}22`, border: `1px solid ${p.color}55` }}>
                  <span className="text-base">{p.emoji}</span>
                  <span className="text-xs font-semibold" style={{ color: p.color }}>{p.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Result overlay */}
        {showResult && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
            onClick={() => setShowResult(false)}
          >
            <div
              className="w-full max-w-xs rounded-3xl p-8 flex flex-col items-center gap-4 relative overflow-hidden"
              style={{
                background: resultPrize
                  ? "linear-gradient(135deg, rgba(124,58,237,0.3) 0%, rgba(15,12,41,0.95) 100%)"
                  : "linear-gradient(135deg, rgba(17,24,39,0.97) 0%, rgba(30,27,75,0.97) 100%)",
                border: resultPrize
                  ? "1px solid rgba(168,85,247,0.5)"
                  : "1px solid rgba(255,255,255,0.1)",
                boxShadow: resultPrize
                  ? "0 0 60px rgba(124,58,237,0.5), 0 20px 60px rgba(0,0,0,0.6)"
                  : "0 20px 60px rgba(0,0,0,0.6)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute inset-x-0 top-0 h-px"
                style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)" }} />

              <div className="text-6xl">{prizeEmoji(resultPrize ?? null)}</div>

              {resultPrize ? (
                <>
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-yellow-400" />
                    <span className="text-yellow-300 font-bold text-sm uppercase tracking-widest">You Won!</span>
                    <Trophy className="w-5 h-5 text-yellow-400" />
                  </div>
                  <p className="text-white font-black text-3xl text-center">{prizeLabel(resultPrize)}</p>
                  <p className="text-purple-300 text-sm text-center">Show this to our staff to claim your prize</p>
                </>
              ) : (
                <>
                  <p className="text-gray-300 font-bold text-2xl text-center">Better Luck<br />Next Time!</p>
                  <p className="text-gray-500 text-sm text-center">You can spin again in 48 hours. Good luck!</p>
                </>
              )}

              <button
                onClick={() => setShowResult(false)}
                className="mt-2 px-8 py-3 rounded-2xl font-bold text-white text-sm"
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                  boxShadow: "0 4px 20px rgba(124,58,237,0.5)",
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
