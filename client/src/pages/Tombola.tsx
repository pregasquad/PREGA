import { useState, useEffect, useRef } from "react";
import { Sparkles, Clock, Trophy, Gift } from "lucide-react";

// ─── Wheel segments ───────────────────────────────────────────────────────────
const SEGMENTS = [
  { label: "Better\nLuck!", color: "#1e1b4b", border: "#312e81", textColor: "#6b7280", prize: null },
  { label: "20%\nOFF",      color: "#4c1d95", border: "#7c3aed", textColor: "#ede9fe", prize: "20%" },
  { label: "Better\nLuck!", color: "#1a1a2e", border: "#2d2d5e", textColor: "#6b7280", prize: null },
  { label: "40%\nOFF",      color: "#78350f", border: "#d97706", textColor: "#fef3c7", prize: "40%" },
  { label: "Better\nLuck!", color: "#1e1b4b", border: "#312e81", textColor: "#6b7280", prize: null },
  { label: "60%\nOFF",      color: "#064e3b", border: "#10b981", textColor: "#d1fae5", prize: "60%" },
  { label: "Better\nLuck!", color: "#1a1a2e", border: "#2d2d5e", textColor: "#6b7280", prize: null },
  { label: "80%\nOFF",      color: "#1e3a8a", border: "#3b82f6", textColor: "#dbeafe", prize: "80%" },
  { label: "Better\nLuck!", color: "#1e1b4b", border: "#312e81", textColor: "#6b7280", prize: null },
  { label: "FREE\nService", color: "#831843", border: "#ec4899", textColor: "#fce7f3", prize: "free" },
];
const N      = SEGMENTS.length;
const DEG    = 360 / N;
const CX = 200, CY = 200, R = 186, TEXT_R = 128;
const SPIN_MS      = 5000;
const COOLDOWN_MS  = 48 * 60 * 60 * 1000;
const COOLDOWN_KEY = "tombola_last_spin";
const DEVICE_KEY   = "tombola_device_id";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function localStatus(): { canSpin: boolean; nextSpinAt: Date | null } {
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY);
    if (!raw) return { canSpin: true, nextSpinAt: null };
    const next = parseInt(raw, 10) + COOLDOWN_MS;
    if (Date.now() >= next) return { canSpin: true, nextSpinAt: null };
    return { canSpin: false, nextSpinAt: new Date(next) };
  } catch {
    return { canSpin: true, nextSpinAt: null };
  }
}

function saveLocalSpin() {
  try { localStorage.setItem(COOLDOWN_KEY, String(Date.now())); } catch {}
}

// Prize odds: 30% for 20% off · 2.5% each for 40/60/80/free · 60% better luck
function pickPrize(): number {
  const r = Math.random();
  if (r < 0.300) return 1;
  if (r < 0.325) return 3;
  if (r < 0.350) return 5;
  if (r < 0.375) return 7;
  if (r < 0.400) return 9;
  return [0, 2, 4, 6, 8][Math.floor(Math.random() * 5)];
}

function polar(r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}
function slicePath(i: number) {
  const s = polar(R, i * DEG);
  const e = polar(R, (i + 1) * DEG);
  return `M ${CX},${CY} L ${s.x},${s.y} A ${R},${R} 0 0,1 ${e.x},${e.y} Z`;
}
function easeOut(t: number) { return 1 - Math.pow(1 - t, 4); }
function fmtMs(ms: number) {
  if (ms <= 0) return "00:00:00";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

// Pre-compute once — never recalc during render or animation
const PATHS = SEGMENTS.map((_, i) => slicePath(i));
const MIDS  = SEGMENTS.map((_, i) => polar(TEXT_R, i * DEG + DEG / 2));

// Apply transform cross-browser (Instagram IAB needs -webkit- prefix)
function setRotation(el: HTMLDivElement, deg: number) {
  const val = `rotateZ(${deg}deg)`;
  (el.style as any).webkitTransform = val;
  el.style.transform = val;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Tombola() {
  const init = localStatus(); // sync — no loading needed

  const [isSpinning,  setIsSpinning]  = useState(false);
  const [canSpin,     setCanSpin]     = useState(init.canSpin);
  const [nextSpinAt,  setNextSpinAt]  = useState<Date | null>(init.nextSpinAt);
  const [resultPrize, setResultPrize] = useState<string | null | undefined>(undefined);
  const [showResult,  setShowResult]  = useState(false);
  const [countdown,   setCountdown]   = useState("");

  const wheelEl  = useRef<HTMLDivElement>(null);
  const curAngle = useRef(0);
  const rafId    = useRef(0);

  useEffect(() => () => cancelAnimationFrame(rafId.current), []);

  useEffect(() => {
    if (!nextSpinAt) { setCountdown(""); return; }
    const tick = () => {
      const diff = nextSpinAt.getTime() - Date.now();
      if (diff <= 0) { setCanSpin(true); setNextSpinAt(null); setCountdown(""); }
      else setCountdown(fmtMs(diff));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextSpinAt]);

  function startSpin(segIdx: number) {
    const el = wheelEl.current;
    if (!el) return;

    const targetMod = (360 - (segIdx * DEG + DEG / 2) + 360) % 360;
    const extra     = (targetMod - curAngle.current % 360 + 360) % 360;
    const endAngle  = curAngle.current + 5 * 360 + extra;
    const startAng  = curAngle.current;
    const t0        = performance.now();

    function frame(now: number) {
      const t     = Math.min((now - t0) / SPIN_MS, 1);
      const angle = startAng + (endAngle - startAng) * easeOut(t);
      setRotation(el, angle);  // sets both -webkit-transform and transform
      if (t < 1) {
        rafId.current = requestAnimationFrame(frame);
      } else {
        curAngle.current = endAngle;
        saveLocalSpin();
        setResultPrize(SEGMENTS[segIdx].prize);
        setShowResult(true);
        setCanSpin(false);
        setNextSpinAt(new Date(Date.now() + COOLDOWN_MS));
        setIsSpinning(false);
      }
    }

    rafId.current = requestAnimationFrame(frame);
  }

  function handleSpin() {
    if (isSpinning || !canSpin) return;
    const status = localStatus();
    if (!status.canSpin) {
      setCanSpin(false);
      setNextSpinAt(status.nextSpinAt);
      return;
    }
    const segIdx = pickPrize();
    setIsSpinning(true);
    setShowResult(false);
    startSpin(segIdx); // instant — no network wait
    fetch("/api/tombola/spin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: getDeviceId() }),
    }).catch(() => {});
  }

  const prizeWon = resultPrize != null;

  return (
    <div
      className="min-h-screen flex flex-col items-center overflow-x-hidden pb-10"
      style={{ background: "linear-gradient(160deg,#0d0d1f 0%,#1a0533 40%,#200a20 70%,#0d0d1f 100%)" }}
    >
      {/*
        ─── AMBIENT GLOW ───────────────────────────────────────────────────────
        Instagram IAB chokes on filter:blur(). Replaced with simple opacity
        radial-gradient circles — zero GPU cost, same visual effect.
      */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute rounded-full" style={{
          width: 600, height: 600, top: -150, left: "50%",
          transform: "translateX(-50%)",
          background: "radial-gradient(circle,rgba(236,72,153,.22) 0%,rgba(236,72,153,0) 70%)",
        }} />
        <div className="absolute rounded-full" style={{
          width: 400, height: 400, bottom: 50, right: -80,
          background: "radial-gradient(circle,rgba(124,58,237,.18) 0%,rgba(124,58,237,0) 70%)",
        }} />
      </div>

      {/* Logo */}
      <div className="relative z-10 w-full max-w-md px-4 pt-6 pb-2 flex justify-center">
        <img src="/prega_logo.png" alt="PREGASQUAD" className="h-10 object-contain" />
      </div>

      {/* Title */}
      <div className="relative z-10 flex flex-col items-center gap-1 px-4 pb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-pink-400" />
          <h1 className="text-white font-black text-2xl" style={{ letterSpacing: "0.07em" }}>LUCKY WHEEL</h1>
          <Sparkles className="w-5 h-5 text-pink-400" />
        </div>
        <p className="text-gray-500 text-xs text-center">Spin once every 48 hours · 80% chance to win!</p>
      </div>

      {/* ── Wheel ── */}
      <div className="relative z-10 flex items-center justify-center my-2" style={{ width: 460, height: 460 }}>

        {/*
          Glow ring: replaced conic-gradient+blur (Instagram killer) with a
          solid border rendered directly in SVG — zero extra compositing layer.
        */}
        <div className="absolute inset-0 rounded-full" style={{
          border: "6px solid rgba(236,72,153,.45)",
          boxShadow: "0 0 32px rgba(236,72,153,.4), inset 0 0 32px rgba(124,58,237,.2)",
        }} />
        {/* Dark backing */}
        <div className="absolute rounded-full" style={{ inset: 8, background: "#0d0d1f" }} />

        {/* Pointer — box-shadow instead of drop-shadow filter */}
        <div className="absolute z-30" style={{ top: 4, left: "50%", transform: "translateX(-50%)" }}>
          <div style={{
            width: 0, height: 0,
            borderLeft: "16px solid transparent",
            borderRight: "16px solid transparent",
            borderTop: "34px solid #ec4899",
          }} />
        </div>

        {/* Wheel — transform via rAF only, never via React state */}
        <div
          ref={wheelEl}
          className="absolute rounded-full overflow-hidden"
          style={{
            width: 424, height: 424,
            top: "50%", left: "50%",
            marginTop: -212, marginLeft: -212,
            boxShadow: "0 0 0 4px rgba(255,255,255,.06), 0 20px 50px rgba(0,0,0,.8)",
            willChange: "transform",
            transform: "rotateZ(0deg)",
          }}
        >
          <svg viewBox="0 0 400 400" width="424" height="424" style={{ display: "block" }}>
            <defs>
              <radialGradient id="cg" cx="40%" cy="35%">
                <stop offset="0%" stopColor="#be185d" />
                <stop offset="100%" stopColor="#1f1135" />
              </radialGradient>
              {SEGMENTS.map((s, i) => (
                <linearGradient key={i} id={`g${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={s.color} />
                  <stop offset="100%" stopColor={s.border} stopOpacity=".6" />
                </linearGradient>
              ))}
            </defs>

            {SEGMENTS.map((seg, i) => {
              const mid   = MIDS[i];
              const ang   = i * DEG + DEG / 2;
              const lines = seg.label.split("\n");
              const win   = seg.prize !== null;
              return (
                <g key={i}>
                  <path d={PATHS[i]} fill={`url(#g${i})`} stroke={seg.border}
                    strokeWidth={win ? "2.5" : "1"} strokeOpacity={win ? ".9" : ".3"} />
                  <g transform={`rotate(${ang},${mid.x},${mid.y})`}>
                    {lines.map((ln, li) => (
                      <text key={li}
                        x={mid.x}
                        y={mid.y + (li - (lines.length - 1) / 2) * (win ? 16 : 11)}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={seg.textColor}
                        fontSize={win ? "17" : "9"}
                        fontWeight={win ? "900" : "500"}
                        fontFamily="system-ui,-apple-system,sans-serif"
                      >{ln}</text>
                    ))}
                  </g>
                </g>
              );
            })}

            <circle cx={CX} cy={CY} r="36" fill="#0d0d1f" stroke="rgba(236,72,153,.4)" strokeWidth="4" />
            <circle cx={CX} cy={CY} r="28" fill="url(#cg)" />
            <text x={CX} y={CY} textAnchor="middle" dominantBaseline="middle"
              fontSize="20" fill="#ec4899" fontWeight="900">✦</text>
          </svg>

          {/* Shine overlay — opacity only, no blur */}
          <div className="absolute inset-0 rounded-full pointer-events-none" style={{
            background: "linear-gradient(135deg,rgba(255,255,255,.09) 0%,transparent 45%)",
          }} />
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="relative z-10 w-full max-w-sm px-4 mt-3 flex flex-col items-center gap-3">

        {canSpin ? (
          <button
            onClick={handleSpin}
            disabled={isSpinning}
            className="relative w-full py-5 rounded-2xl font-black text-xl text-white overflow-hidden active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: isSpinning
                ? "rgba(190,24,93,.4)"
                : "linear-gradient(135deg,#be185d 0%,#ec4899 50%,#a21caf 100%)",
              boxShadow: isSpinning ? "none" : "0 0 36px rgba(236,72,153,.6), 0 6px 20px rgba(0,0,0,.5)",
              border: "1px solid rgba(255,255,255,.18)",
              letterSpacing: "0.08em",
              transition: "transform 75ms",
            }}
          >
            <span className="absolute inset-x-0 top-0 h-px"
              style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent)" }} />
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
          /*
            Cooldown card: backdrop-filter removed — Instagram IAB makes it
            invisible. Replaced with a solid semi-transparent background.
          */
          <div className="w-full rounded-2xl p-5 flex flex-col items-center gap-2" style={{
            background: "rgba(30,15,50,.95)",
            border: "1px solid rgba(236,72,153,.25)",
            boxShadow: "0 4px 24px rgba(0,0,0,.5)",
          }}>
            <Clock className="w-7 h-7 text-pink-400" />
            <p className="text-gray-300 text-sm font-semibold">Next spin available in</p>
            <p className="text-3xl font-mono font-black text-white tracking-[.15em]">{countdown || "—"}</p>
            <p className="text-gray-500 text-xs text-center">Come back in 48 hours!</p>
          </div>
        )}

        {/* Prize grid */}
        <div className="w-full rounded-2xl p-4" style={{
          background: "rgba(20,10,40,.9)",
          border: "1px solid rgba(255,255,255,.07)",
        }}>
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3 text-center">Possible Prizes</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "20% Discount", color: "#7c3aed", emoji: "🎉" },
              { label: "40% Discount", color: "#d97706", emoji: "💛" },
              { label: "60% Discount", color: "#10b981", emoji: "💚" },
              { label: "80% Discount", color: "#3b82f6", emoji: "💙" },
              { label: "Free Service!", color: "#ec4899", emoji: "🎁", wide: true },
            ].map((p) => (
              <div key={p.label}
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5${(p as any).wide ? " col-span-2 justify-center" : ""}`}
                style={{ background: `${p.color}20`, border: `1px solid ${p.color}45` }}>
                <span className="text-base">{p.emoji}</span>
                <span className="text-xs font-bold" style={{ color: p.color }}>{p.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-gray-600 text-xs text-center">
          Show your winning screen to our staff to claim your prize
        </p>
      </div>

      {/* ── Result modal ── */}
      {showResult && (
        /*
          Modal backdrop: backdrop-filter removed — Instagram IAB makes the
          modal invisible. Using solid rgba background instead.
        */
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,.88)" }}
          onClick={() => setShowResult(false)}
        >
          <div
            className="w-full max-w-xs rounded-3xl p-8 flex flex-col items-center gap-4 relative overflow-hidden"
            style={{
              background: prizeWon
                ? "linear-gradient(160deg,#3b0a20 0%,#0d0d1f 100%)"
                : "linear-gradient(160deg,#1a1740 0%,#0d0d1f 100%)",
              border: prizeWon ? "1px solid rgba(236,72,153,.5)" : "1px solid rgba(255,255,255,.08)",
              boxShadow: prizeWon
                ? "0 0 60px rgba(236,72,153,.4), 0 20px 60px rgba(0,0,0,.8)"
                : "0 20px 60px rgba(0,0,0,.8)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-x-0 top-0 h-px"
              style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent)" }} />

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
                <div className="w-full rounded-xl px-4 py-3 flex items-center gap-2 justify-center"
                  style={{ background: "rgba(236,72,153,.18)", border: "1px solid rgba(236,72,153,.35)" }}>
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
                background: "linear-gradient(135deg,#be185d,#ec4899)",
                boxShadow: "0 4px 18px rgba(236,72,153,.4)",
                border: "1px solid rgba(255,255,255,.18)",
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
