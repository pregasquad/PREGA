import { useState, useEffect, useCallback, useRef } from "react";
import { Sparkles, Clock, Trophy, Gift, ChevronLeft } from "lucide-react";
import { useLocation } from "wouter";

const SEGMENTS = [
  { label: "Better\nLuck\nNext\nTime", color: "#1e1b4b", border: "#312e81", textColor: "#6b7280", prize: null },
  { label: "20%\nOFF",                color: "#4c1d95", border: "#7c3aed", textColor: "#ede9fe", prize: "20%" },
  { label: "Better\nLuck\nNext\nTime", color: "#1a1a2e", border: "#2d2d5e", textColor: "#6b7280", prize: null },
  { label: "40%\nOFF",                color: "#78350f", border: "#d97706", textColor: "#fef3c7", prize: "40%" },
  { label: "Better\nLuck\nNext\nTime", color: "#1e1b4b", border: "#312e81", textColor: "#6b7280", prize: null },
  { label: "60%\nOFF",                color: "#064e3b", border: "#10b981", textColor: "#d1fae5", prize: "60%" },
  { label: "Better\nLuck\nNext\nTime", color: "#1a1a2e", border: "#2d2d5e", textColor: "#6b7280", prize: null },
  { label: "80%\nOFF",                color: "#1e3a8a", border: "#3b82f6", textColor: "#dbeafe", prize: "80%" },
  { label: "Better\nLuck\nNext\nTime", color: "#1e1b4b", border: "#312e81", textColor: "#6b7280", prize: null },
  { label: "FREE\nService",           color: "#831843", border: "#ec4899", textColor: "#fce7f3", prize: "free" },
];

const N = SEGMENTS.length;
const DEG = 360 / N;
const CX = 200, CY = 200, R = 188, TEXT_R = 130;

const COOLDOWN_KEY = "tombola_last_spin";
const DEVICE_KEY = "tombola_device_id";
const COOLDOWN_MS = 48 * 60 * 60 * 1000;

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function getLocalStatus() {
  const lastSpin = localStorage.getItem(COOLDOWN_KEY);
  if (!lastSpin) return { canSpin: true, nextSpinAt: null };
  const last = parseInt(lastSpin, 10);
  const next = last + COOLDOWN_MS;
  if (Date.now() >= next) return { canSpin: true, nextSpinAt: null };
  return { canSpin: false, nextSpinAt: new Date(next) };
}

function saveLocalSpin() {
  localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
}

function clientSidePrize(): number {
  const r = Math.random();
  if (r < 0.002) return 1;
  if (r < 0.004) return 3;
  if (r < 0.006) return 5;
  if (r < 0.008) return 7;
  if (r < 0.010) return 9;
  const losers = [0, 2, 4, 6, 8];
  return losers[Math.floor(Math.random() * losers.length)];
}

function polar(r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function slicePath(i: number) {
  const s = polar(R, i * DEG);
  const e = polar(R, (i + 1) * DEG);
  return `M ${CX},${CY} L ${s.x},${s.y} A ${R},${R} 0 0,1 ${e.x},${e.y} Z`;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Tombola() {
  const [, setLocation] = useLocation();
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [canSpin, setCanSpin] = useState(true);
  const [nextSpinAt, setNextSpinAt] = useState<Date | null>(null);
  const [resultPrize, setResultPrize] = useState<string | null | undefined>(undefined);
  const [showResult, setShowResult] = useState(false);
  const [countdown, setCountdown] = useState("");
  const [checking, setChecking] = useState(true);
  const rotationRef = useRef(rotation);
  rotationRef.current = rotation;

  const refreshStatus = useCallback(() => {
    const local = getLocalStatus();
    setCanSpin(local.canSpin);
    setNextSpinAt(local.nextSpinAt);
    setChecking(false);
  }, []);

  useEffect(() => {
    refreshStatus();
    const deviceId = getDeviceId();
    fetch(`/api/tombola/status?deviceId=${encodeURIComponent(deviceId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.canSpin && data.nextSpinAt) {
          const serverNext = new Date(data.nextSpinAt);
          const localStatus = getLocalStatus();
          if (!localStatus.canSpin && localStatus.nextSpinAt) {
            setNextSpinAt(serverNext > localStatus.nextSpinAt ? serverNext : localStatus.nextSpinAt);
          } else {
            setCanSpin(false);
            setNextSpinAt(serverNext);
          }
        }
      })
      .catch(() => {});
  }, [refreshStatus]);

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

  const handleSpin = useCallback(() => {
    if (isSpinning || !canSpin) return;

    const localStatus = getLocalStatus();
    if (!localStatus.canSpin) {
      setCanSpin(false);
      setNextSpinAt(localStatus.nextSpinAt);
      return;
    }

    setIsSpinning(true);
    setShowResult(false);

    const deviceId = getDeviceId();
    const doSpin = (segIdx: number) => {
      const targetMod = (360 - (segIdx * DEG + DEG / 2) + 360) % 360;
      const currentMod = rotationRef.current % 360;
      const spinOffset = (targetMod - currentMod + 360) % 360;
      const finalRotation = rotationRef.current + 1800 + spinOffset;
      setRotation(finalRotation);

      setTimeout(() => {
        setResultPrize(SEGMENTS[segIdx].prize);
        setShowResult(true);
        setCanSpin(false);
        const next = new Date(Date.now() + COOLDOWN_MS);
        setNextSpinAt(next);
        setIsSpinning(false);
        saveLocalSpin();
      }, 5500);
    };

    fetch("/api/tombola/spin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    })
      .then((res) => {
        if (res.status === 429) {
          return res.json().then((data) => {
            setCanSpin(false);
            if (data.nextSpinAt) setNextSpinAt(new Date(data.nextSpinAt));
            setIsSpinning(false);
            throw new Error("rate-limited");
          });
        }
        return res.json();
      })
      .then((data) => {
        doSpin(data.segmentIndex);
      })
      .catch((err) => {
        if (err?.message === "rate-limited") return;
        doSpin(clientSidePrize());
      });
  }, [isSpinning, canSpin]);

  const prizeWon = resultPrize != null;

  return (
    <div
      className="min-h-screen flex flex-col items-center relative overflow-x-hidden"
      style={{
        background: "linear-gradient(160deg, #0d0d1f 0%, #1a0533 40%, #200a20 70%, #0d0d1f 100%)",
      }}
    >
      {/* Ambient glow blobs */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div
          className="absolute rounded-full"
          style={{
            width: 500, height: 500, top: -100, left: "50%", transform: "translateX(-50%)",
            background: "radial-gradient(circle, rgba(236,72,153,0.18) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 400, height: 400, bottom: 50, right: -100,
            background: "radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 300, height: 300, bottom: 100, left: -50,
            background: "radial-gradient(circle, rgba(236,72,153,0.1) 0%, transparent 70%)",
            filter: "blur(30px)",
          }}
        />
      </div>

      {/* Header */}
      <div className="relative z-10 w-full max-w-md px-4 pt-6 pb-2 flex items-center gap-3">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center justify-center w-9 h-9 rounded-full"
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 flex flex-col items-center pr-9">
          <img src="/prega_logo.png" alt="PREGASQUAD" className="h-10 object-contain drop-shadow-lg" />
        </div>
      </div>

      {/* Title */}
      <div className="relative z-10 flex flex-col items-center gap-1 px-4 pb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-pink-400" />
          <h1 className="text-white font-black text-2xl tracking-wide" style={{ letterSpacing: "0.05em" }}>
            LUCKY WHEEL
          </h1>
          <Sparkles className="w-5 h-5 text-pink-400" />
        </div>
        <p className="text-gray-400 text-xs text-center">
          Spin once every 48 hours · 1% chance to win!
        </p>
      </div>

      {/* Wheel area */}
      <div className="relative z-10 flex items-center justify-center my-2">
        {/* Outer decorative ring */}
        <div
          className="absolute rounded-full"
          style={{
            width: 448, height: 448,
            background: "conic-gradient(from 0deg, rgba(236,72,153,0.4), rgba(124,58,237,0.4), rgba(236,72,153,0.4))",
            filter: "blur(12px)",
            borderRadius: "50%",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: 440, height: 440,
            background: "#0d0d1f",
            borderRadius: "50%",
          }}
        />

        {/* Pointer */}
        <div className="absolute z-30" style={{ top: -4, left: "50%", transform: "translateX(-50%)" }}>
          <div style={{
            width: 0, height: 0,
            borderLeft: "16px solid transparent",
            borderRight: "16px solid transparent",
            borderTop: "34px solid #ec4899",
            filter: "drop-shadow(0 0 10px rgba(236,72,153,0.9))",
          }} />
        </div>

        {/* Wheel */}
        <div
          style={{
            width: 420,
            height: 420,
            borderRadius: "50%",
            transition: isSpinning
              ? "transform 5.5s cubic-bezier(0.15, 0.5, 0.1, 1.0)"
              : "none",
            transform: `rotateZ(${rotation}deg)`,
            boxShadow: "0 0 0 8px rgba(255,255,255,0.06), 0 0 50px rgba(236,72,153,0.3), 0 20px 60px rgba(0,0,0,0.7)",
            position: "relative",
          }}
        >
          <svg viewBox="0 0 400 400" width="420" height="420" style={{ display: "block", borderRadius: "50%" }}>
            <defs>
              <radialGradient id="centerGrad" cx="40%" cy="35%">
                <stop offset="0%" stopColor="#be185d" />
                <stop offset="100%" stopColor="#1f1135" />
              </radialGradient>
              {SEGMENTS.map((seg, i) => (
                <linearGradient
                  key={`grad-${i}`}
                  id={`segGrad-${i}`}
                  x1="0%" y1="0%" x2="100%" y2="100%"
                >
                  <stop offset="0%" stopColor={seg.color} stopOpacity="1" />
                  <stop offset="100%" stopColor={seg.border} stopOpacity="0.5" />
                </linearGradient>
              ))}
            </defs>

            {SEGMENTS.map((seg, i) => {
              const mid = polar(TEXT_R, i * DEG + DEG / 2);
              const textAngle = i * DEG + DEG / 2;
              const lines = seg.label.split("\n");
              const isWinner = seg.prize !== null;
              return (
                <g key={i}>
                  <path
                    d={slicePath(i)}
                    fill={`url(#segGrad-${i})`}
                    stroke={seg.border}
                    strokeWidth={isWinner ? "2" : "1"}
                    strokeOpacity={isWinner ? "0.8" : "0.4"}
                  />
                  <g transform={`rotate(${textAngle}, ${mid.x}, ${mid.y})`}>
                    {lines.map((line, li) => (
                      <text
                        key={li}
                        x={mid.x}
                        y={mid.y + (li - (lines.length - 1) / 2) * (isWinner ? 15 : 11)}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={seg.textColor}
                        fontSize={isWinner ? "16" : "8"}
                        fontWeight={isWinner ? "900" : "500"}
                        fontFamily="system-ui, -apple-system, sans-serif"
                        letterSpacing={isWinner ? "0.5" : "0"}
                      >
                        {line}
                      </text>
                    ))}
                  </g>
                </g>
              );
            })}

            {/* Center hub */}
            <circle cx={CX} cy={CY} r="36" fill="#0d0d1f" stroke="rgba(236,72,153,0.3)" strokeWidth="4" />
            <circle cx={CX} cy={CY} r="28" fill="url(#centerGrad)" />
            <text x={CX} y={CY} textAnchor="middle" dominantBaseline="middle"
              fontSize="20" fill="#ec4899" fontWeight="900">✦</text>
          </svg>

          {/* Shine overlay */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 45%)",
            }}
          />
        </div>
      </div>

      {/* Spin button / cooldown */}
      <div className="relative z-10 w-full max-w-sm px-4 mt-4 flex flex-col items-center gap-3">
        {checking ? (
          <div className="flex items-center gap-2 text-gray-500 py-4">
            <div className="w-4 h-4 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Checking…</span>
          </div>
        ) : canSpin ? (
          <button
            onClick={handleSpin}
            disabled={isSpinning}
            className="relative w-full py-5 rounded-2xl font-black text-xl text-white overflow-hidden transition-all duration-150 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: isSpinning
                ? "rgba(236,72,153,0.3)"
                : "linear-gradient(135deg, #be185d 0%, #ec4899 45%, #a21caf 100%)",
              boxShadow: isSpinning
                ? "none"
                : "0 0 40px rgba(236,72,153,0.6), 0 6px 24px rgba(0,0,0,0.5)",
              border: "1px solid rgba(255,255,255,0.2)",
              letterSpacing: "0.08em",
            }}
          >
            <span className="absolute inset-x-0 top-0 h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)" }} />
            {isSpinning ? (
              <span className="flex items-center justify-center gap-3">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Spinning…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-3">
                <Sparkles className="w-5 h-5 text-pink-200" />
                SPIN THE WHEEL
                <Sparkles className="w-5 h-5 text-pink-200" />
              </span>
            )}
          </button>
        ) : (
          <div
            className="w-full rounded-2xl p-5 flex flex-col items-center gap-2"
            style={{
              background: "rgba(255,255,255,0.05)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            <Clock className="w-7 h-7 text-pink-400" />
            <p className="text-gray-300 text-sm font-semibold">Next spin available in</p>
            <p className="text-3xl font-mono font-black text-white tracking-[0.15em]">{countdown || "—"}</p>
            <p className="text-gray-500 text-xs text-center">Come back in 48 hours to try again!</p>
          </div>
        )}

        {/* Prize grid */}
        <div
          className="w-full rounded-2xl p-4"
          style={{
            background: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3 text-center">
            Possible Prizes
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "20% Discount", color: "#7c3aed", emoji: "🎉" },
              { label: "40% Discount", color: "#d97706", emoji: "💛" },
              { label: "60% Discount", color: "#10b981", emoji: "💚" },
              { label: "80% Discount", color: "#3b82f6", emoji: "💙" },
              { label: "Free Service!", color: "#ec4899", emoji: "🎁", wide: true },
            ].map((p) => (
              <div
                key={p.label}
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5${(p as any).wide ? " col-span-2 justify-center" : ""}`}
                style={{
                  background: `${p.color}18`,
                  border: `1px solid ${p.color}45`,
                }}
              >
                <span className="text-base">{p.emoji}</span>
                <span className="text-xs font-bold" style={{ color: p.color }}>{p.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-gray-600 text-xs text-center pb-6">
          Show your winning screen to our staff to claim your prize
        </p>
      </div>

      {/* Result overlay */}
      {showResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(12px)" }}
          onClick={() => setShowResult(false)}
        >
          <div
            className="w-full max-w-xs rounded-3xl p-8 flex flex-col items-center gap-4 relative overflow-hidden"
            style={{
              background: prizeWon
                ? "linear-gradient(160deg, rgba(190,24,93,0.25) 0%, rgba(13,13,31,0.97) 100%)"
                : "linear-gradient(160deg, rgba(30,27,75,0.97) 0%, rgba(13,13,31,0.97) 100%)",
              border: prizeWon
                ? "1px solid rgba(236,72,153,0.5)"
                : "1px solid rgba(255,255,255,0.08)",
              boxShadow: prizeWon
                ? "0 0 80px rgba(236,72,153,0.4), 0 20px 60px rgba(0,0,0,0.7)"
                : "0 20px 60px rgba(0,0,0,0.7)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-x-0 top-0 h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)" }} />

            <div className="text-7xl">{prizeWon ? (resultPrize === "free" ? "🎁" : "🎉") : "😢"}</div>

            {prizeWon ? (
              <>
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-400" />
                  <span className="text-yellow-300 font-black text-sm uppercase tracking-widest">You Won!</span>
                  <Trophy className="w-5 h-5 text-yellow-400" />
                </div>
                <p className="text-white font-black text-3xl text-center">
                  {resultPrize === "free" ? "Free Service!" : `${resultPrize} Discount!`}
                </p>
                <div
                  className="w-full rounded-xl px-4 py-3 flex items-center gap-2 justify-center"
                  style={{ background: "rgba(236,72,153,0.15)", border: "1px solid rgba(236,72,153,0.3)" }}
                >
                  <Gift className="w-4 h-4 text-pink-400" />
                  <p className="text-pink-300 text-sm text-center font-medium">
                    Show this screen to our staff to claim your prize
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="text-white font-black text-2xl text-center">Better Luck<br />Next Time!</p>
                <p className="text-gray-400 text-sm text-center">
                  You can spin again in 48 hours. Good luck!
                </p>
              </>
            )}

            <button
              onClick={() => setShowResult(false)}
              className="mt-2 w-full py-3.5 rounded-2xl font-black text-white text-sm"
              style={{
                background: "linear-gradient(135deg, #be185d, #ec4899)",
                boxShadow: "0 4px 20px rgba(236,72,153,0.4)",
                border: "1px solid rgba(255,255,255,0.2)",
                letterSpacing: "0.06em",
              }}
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
