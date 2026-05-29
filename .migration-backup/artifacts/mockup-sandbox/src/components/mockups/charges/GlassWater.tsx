import { ShoppingBag, TrendingDown, TrendingUp, Wallet, Plus, Trash2, ChevronLeft, ChevronRight, ArrowRight, RefreshCw } from "lucide-react";

const CURRENCY = "DH";

const mockProductCharges = [
  { id: 1, name: "شامبو كيراتين", date: "2026-05-24", amount: 120 },
  { id: 2, name: "صبغة L'Oréal", date: "2026-05-22", amount: 85 },
];

const mockCharges = [
  { id: 3, name: "إيجار الشهر", type: "إيجار", date: "2026-05-01", amount: 2500 },
  { id: 4, name: "فاتورة الكهرباء", type: "فواتير", date: "2026-05-05", amount: 340 },
  { id: 5, name: "مواد التنظيف", type: "مواد", date: "2026-05-10", amount: 190 },
];

function GlassCard({ children, className = "", glow = "" }: { children: React.ReactNode; className?: string; glow?: string }) {
  return (
    <div
      className={`relative rounded-2xl border border-white/15 backdrop-blur-xl overflow-hidden ${className}`}
      style={{ background: "rgba(255,255,255,0.07)", boxShadow: glow || "0 4px 32px rgba(0,180,255,0.08), inset 0 1px 0 rgba(255,255,255,0.12)" }}
    >
      {children}
    </div>
  );
}

function StatRow({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="flex items-center gap-2 text-sm text-white/60">
        {icon}
        {label}
      </span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}

export function GlassWater() {
  return (
    <div
      dir="rtl"
      className="min-h-screen relative overflow-hidden font-sans"
      style={{
        background: "linear-gradient(135deg, #020c1b 0%, #041628 30%, #062040 60%, #062e50 100%)",
      }}
    >
      {/* ── Animated water orbs ─────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-[-80px] right-[-60px] w-[420px] h-[420px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #00d4ff 0%, #0070ff 50%, transparent 70%)", filter: "blur(60px)" }} />
        <div className="absolute bottom-[-100px] left-[-80px] w-[500px] h-[500px] rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #00ffcc 0%, #0080ff 50%, transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute top-[40%] left-[30%] w-[300px] h-[300px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #7dd3fc 0%, transparent 70%)", filter: "blur(50px)" }} />
        {/* Floating bubbles */}
        {[
          { w: 8, h: 8, top: "15%", left: "20%", op: 0.3, blur: 0 },
          { w: 5, h: 5, top: "35%", right: "15%", op: 0.2, blur: 0 },
          { w: 12, h: 12, top: "60%", left: "10%", op: 0.15, blur: 1 },
          { w: 6, h: 6, top: "80%", right: "30%", op: 0.25, blur: 0 },
          { w: 4, h: 4, top: "25%", left: "55%", op: 0.2, blur: 0 },
          { w: 10, h: 10, top: "50%", right: "8%", op: 0.12, blur: 1 },
        ].map((b, i) => (
          <div
            key={i}
            className="absolute rounded-full border border-cyan-300/30"
            style={{
              width: b.w * 4, height: b.h * 4,
              top: b.top, left: (b as any).left, right: (b as any).right,
              opacity: b.op,
              background: "rgba(125,211,252,0.08)",
              backdropFilter: b.blur ? `blur(${b.blur}px)` : undefined,
            }}
          />
        ))}
      </div>

      {/* ── Content ──────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col gap-5 p-5 max-w-5xl mx-auto pb-10">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white drop-shadow-lg tracking-wide">المصاريف</h1>
          <div className="flex items-center gap-2">
            <GlassCard className="flex items-center gap-0 px-1 py-1">
              <button className="p-1.5 rounded-xl hover:bg-white/10 transition text-white/70">
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="px-3 text-sm font-medium text-white/90">مايو 2026</span>
              <button className="p-1.5 rounded-xl hover:bg-white/10 transition text-white/70">
                <ChevronLeft className="w-4 h-4" />
              </button>
            </GlassCard>
            <GlassCard className="p-2 cursor-pointer hover:bg-white/10 transition">
              <RefreshCw className="w-4 h-4 text-white/60" />
            </GlassCard>
          </div>
        </div>

        {/* ── Summary Stats Row ─────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: "حصة الصالون",
              value: "8,420",
              icon: <TrendingUp className="w-5 h-5" />,
              color: "from-emerald-500/20 to-cyan-500/10",
              textColor: "text-emerald-300",
              glowColor: "rgba(16,185,129,0.15)",
              sign: "+",
            },
            {
              label: "المصاريف",
              value: "3,030",
              icon: <TrendingDown className="w-5 h-5" />,
              color: "from-red-500/20 to-rose-500/10",
              textColor: "text-red-300",
              glowColor: "rgba(239,68,68,0.15)",
              sign: "-",
            },
            {
              label: "المسحوبات",
              value: "1,500",
              icon: <Wallet className="w-5 h-5" />,
              color: "from-amber-500/20 to-yellow-500/10",
              textColor: "text-amber-300",
              glowColor: "rgba(245,158,11,0.15)",
              sign: "-",
            },
          ].map((s) => (
            <div
              key={s.label}
              className={`relative rounded-2xl p-4 border border-white/10 overflow-hidden`}
              style={{
                background: `linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))`,
                boxShadow: `0 4px 24px ${s.glowColor}, inset 0 1px 0 rgba(255,255,255,0.1)`,
                backdropFilter: "blur(20px)",
              }}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${s.color} opacity-60`} />
              <div className="relative">
                <div className={`${s.textColor} mb-2 opacity-80`}>{s.icon}</div>
                <p className="text-xs text-white/50 mb-1">{s.label}</p>
                <p className={`text-2xl font-bold ${s.textColor} drop-shadow`}>
                  {s.sign}{s.value} <span className="text-sm font-normal opacity-70">{CURRENCY}</span>
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Caisse breakdown + withdrawal form ─────────── */}
        <GlassCard
          glow="0 4px 40px rgba(0,180,255,0.12), inset 0 1px 0 rgba(255,255,255,0.1)"
          className="p-0 overflow-hidden"
        >
          {/* Amber header line */}
          <div className="h-0.5 w-full bg-gradient-to-r from-amber-400/0 via-amber-400/60 to-amber-400/0" />
          <div className="p-4 grid grid-cols-2 gap-6">
            {/* Add withdrawal form */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="w-4 h-4 text-amber-300" />
                <span className="text-sm font-semibold text-amber-200">مسحوبات المالكة</span>
              </div>
              {["المبلغ (DH)", "التاريخ", "ملاحظات"].map((p, i) => (
                <div
                  key={p}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white/40 border border-white/10"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  {p}
                </div>
              ))}
              <button
                className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 text-amber-900 transition hover:brightness-110"
                style={{ background: "linear-gradient(135deg, #f59e0b, #fbbf24)" }}
              >
                <Plus className="w-4 h-4" />
                إضافة مسحوبة
              </button>
            </div>

            {/* Caisse summary */}
            <div
              className="rounded-xl p-4 border border-white/8 space-y-1"
              style={{ background: "rgba(255,255,255,0.04)" }}
            >
              <p className="text-xs text-white/40 uppercase tracking-wider mb-3">ملخص الكيس</p>
              <StatRow
                icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
                label="حصة الصالون"
                value={`+ 8,420 ${CURRENCY}`}
                color="text-emerald-300"
              />
              <div className="h-px bg-white/8 my-1.5" />
              <StatRow
                icon={<Wallet className="w-3.5 h-3.5 text-amber-400" />}
                label="مسحوباتي"
                value={`- 1,500 ${CURRENCY}`}
                color="text-amber-300"
              />
              <StatRow
                icon={<TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                label="المصاريف"
                value={`- 3,030 ${CURRENCY}`}
                color="text-red-300"
              />
              <div className="h-px bg-white/8 my-1.5" />
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm font-bold text-white flex items-center gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5" />
                  صافي الربح
                </span>
                <span
                  className="text-base font-bold px-3 py-0.5 rounded-full text-emerald-200"
                  style={{ background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.3)" }}
                >
                  3,890 {CURRENCY}
                </span>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* ── Products Budget Card ──────────────────────── */}
        <GlassCard
          glow="0 4px 40px rgba(139,92,246,0.18), inset 0 1px 0 rgba(255,255,255,0.1)"
          className="p-0"
        >
          <div className="h-0.5 w-full bg-gradient-to-r from-violet-400/0 via-violet-400/60 to-violet-400/0" />
          <div className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded-lg" style={{ background: "rgba(139,92,246,0.25)", border: "1px solid rgba(139,92,246,0.3)" }}>
                <ShoppingBag className="w-4 h-4 text-violet-300" />
              </div>
              <span className="font-semibold text-violet-200">بجت المنتجات</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Budget summary */}
              <div className="rounded-xl p-3 space-y-1.5 border border-white/8" style={{ background: "rgba(255,255,255,0.04)" }}>
                <p className="text-xs text-white/40 uppercase tracking-wider mb-2">ملخص البجت</p>
                {[
                  { label: "رصيد الشهور السابقة", value: "+ 150 DH", color: "text-emerald-300" },
                  { label: "بجت هذا الشهر", value: "+ 320 DH", color: "text-violet-300" },
                  { label: "مشتريات هذا الشهر", value: "- 205 DH", color: "text-red-300" },
                ].map((r) => (
                  <div key={r.label} className="flex items-center justify-between">
                    <span className="text-xs text-white/50">{r.label}</span>
                    <span className={`text-xs font-semibold ${r.color}`}>{r.value}</span>
                  </div>
                ))}
                <div className="h-px bg-white/10 my-1" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">الرصيد المتراكم</span>
                  <span
                    className="text-sm font-bold px-2 py-0.5 rounded-full text-violet-200"
                    style={{ background: "rgba(139,92,246,0.25)", border: "1px solid rgba(139,92,246,0.35)" }}
                  >
                    265 {CURRENCY}
                  </span>
                </div>
                <p className="text-xs text-white/25 pt-0.5">يبدأ الحساب من: 2026-05-24</p>
              </div>

              {/* Quick-add form */}
              <div className="space-y-2.5">
                <p className="text-xs text-white/40 uppercase tracking-wider">إضافة منتج</p>
                {["اسم المنتج", "المبلغ (DH)"].map((p) => (
                  <div
                    key={p}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white/40 border border-white/10"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    {p}
                  </div>
                ))}
                <button
                  className="w-full py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 text-white transition hover:brightness-110"
                  style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.7), rgba(109,40,217,0.7))", border: "1px solid rgba(139,92,246,0.4)" }}
                >
                  <Plus className="w-4 h-4" />
                  إضافة
                </button>

                {/* Mini product list */}
                <div className="space-y-1.5 mt-1">
                  {mockProductCharges.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-violet-400/15"
                      style={{ background: "rgba(139,92,246,0.1)" }}
                    >
                      <div>
                        <p className="text-xs text-white/80 font-medium">{c.name}</p>
                        <p className="text-xs text-white/35">{c.date}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-violet-300">{c.amount} {CURRENCY}</span>
                        <button className="text-white/25 hover:text-red-300 transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* ── Add Expense + Expense List ────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          {/* Add expense form */}
          <GlassCard
            glow="0 4px 32px rgba(0,180,255,0.1), inset 0 1px 0 rgba(255,255,255,0.1)"
            className="col-span-1 p-4 space-y-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <Plus className="w-4 h-4 text-cyan-300" />
              <span className="text-sm font-semibold text-white/90">إضافة مصروف</span>
            </div>
            {["النوع", "الاسم", "المبلغ (DH)", "التاريخ"].map((p) => (
              <div
                key={p}
                className="w-full rounded-xl px-3 py-2 text-sm text-white/35 border border-white/10"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                {p}
              </div>
            ))}
            <button
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition hover:brightness-110 flex items-center justify-center gap-2"
              style={{
                background: "linear-gradient(135deg, rgba(6,182,212,0.5), rgba(37,99,235,0.5))",
                border: "1px solid rgba(125,211,252,0.3)",
                boxShadow: "0 0 20px rgba(6,182,212,0.2)",
              }}
            >
              <Plus className="w-4 h-4" />
              إضافة
            </button>
          </GlassCard>

          {/* Expense list */}
          <GlassCard
            glow="0 4px 32px rgba(0,180,255,0.08), inset 0 1px 0 rgba(255,255,255,0.1)"
            className="col-span-2 p-4"
          >
            <p className="text-sm font-semibold text-white/80 mb-3">قائمة المصاريف</p>
            <div className="space-y-2">
              {mockCharges.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-white/8"
                  style={{ background: "rgba(239,68,68,0.07)" }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white/85 truncate">{c.name}</span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded text-red-300/80"
                        style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.2)" }}
                      >
                        {c.type}
                      </span>
                    </div>
                    <div className="flex gap-2 mt-0.5">
                      <span className="text-sm font-semibold text-red-300">{c.amount} {CURRENCY}</span>
                      <span className="text-xs text-white/30">{c.date}</span>
                    </div>
                  </div>
                  <button className="text-white/20 hover:text-red-300 transition ml-2">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
