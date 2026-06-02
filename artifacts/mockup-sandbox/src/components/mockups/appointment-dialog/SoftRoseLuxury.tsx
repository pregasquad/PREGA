import { useState } from "react";
import { User, Clock, Scissors, Star, Gift, ShieldCheck, Check, ChevronDown, X, Sparkles, CalendarDays, Timer } from "lucide-react";

const services = [
  { id: 1, name: "Coupe & Brushing", price: 150, duration: 45 },
  { id: 2, name: "Coloration", price: 280, duration: 90 },
  { id: 3, name: "Soin Kératine", price: 350, duration: 120 },
  { id: 4, name: "Manucure", price: 80, duration: 30 },
  { id: 5, name: "Maquillage", price: 200, duration: 60 },
];

const staffList = ["Yasmine", "Nadia", "Sara", "Fatima"];
const timeSlots = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:00", "14:30", "15:00", "15:30"];

export function SoftRoseLuxury() {
  const [selectedServices, setSelectedServices] = useState([services[0], services[3]]);
  const [staff, setStaff] = useState("Yasmine");
  const [time, setTime] = useState("10:00");
  const [client] = useState("Leila Benali");
  const [paid, setPaid] = useState(false);
  const [privateRoom, setPrivateRoom] = useState(false);
  const [loyaltyApplied, setLoyaltyApplied] = useState(false);
  const [giftApplied, setGiftApplied] = useState(false);
  const [showServicePicker, setShowServicePicker] = useState(false);

  const baseTotal = selectedServices.reduce((s, sv) => s + sv.price, 0);
  const loyaltyDiscount = loyaltyApplied ? 30 : 0;
  const giftDiscount = giftApplied ? 50 : 0;
  const total = Math.max(0, baseTotal - loyaltyDiscount - giftDiscount);
  const duration = selectedServices.reduce((s, sv) => s + sv.duration, 0);

  const toggleService = (svc: typeof services[0]) => {
    setSelectedServices(prev =>
      prev.find(s => s.id === svc.id)
        ? prev.filter(s => s.id !== svc.id)
        : [...prev, svc]
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-amber-50 flex items-center justify-center p-4" style={{ fontFamily: "'Nunito', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;500;600;700;800&family=Playfair+Display:ital,wght@0,400;0,600;1,400&display=swap');
        .rose-card { background: rgba(255,255,255,0.85); backdrop-filter: blur(20px); }
        .gold-shine { background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 40%, #f59e0b 100%); }
        .rose-btn { transition: all 0.2s ease; }
        .rose-btn:hover { transform: translateY(-1px); }
        .service-chip { transition: all 0.18s ease; }
        .header-gradient { background: linear-gradient(135deg, #fda4af 0%, #fb7185 40%, #f43f5e 100%); }
        .soft-shadow { box-shadow: 0 8px 32px rgba(244,63,94,0.12), 0 2px 8px rgba(0,0,0,0.06); }
        .inner-glow { box-shadow: inset 0 1px 0 rgba(255,255,255,0.8); }
      `}</style>

      <div className="w-[390px] rose-card rounded-3xl overflow-hidden soft-shadow border border-rose-100">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="header-gradient px-4 py-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white/10 -translate-y-16 translate-x-16" />
          <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white/10 translate-y-10 -translate-x-8" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-white/25 backdrop-blur flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <span style={{ fontFamily: "'Playfair Display', serif" }} className="text-white text-lg font-semibold">Nouvelle Réservation</span>
              </div>
              <button className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <X className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            {/* Price + Paid row */}
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-white/20 backdrop-blur rounded-2xl px-4 py-2.5 flex items-center gap-2">
                <span className="text-white/70 text-xs font-medium">Total</span>
                <span className="text-white text-2xl font-bold ml-auto">{total}</span>
                <span className="text-white/80 text-sm font-semibold">DH</span>
              </div>
              <button
                onClick={() => setPaid(!paid)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-semibold text-sm transition-all ${
                  paid
                    ? "bg-emerald-400 text-white shadow-lg shadow-emerald-400/30"
                    : "bg-white/20 text-white/80 backdrop-blur"
                }`}
              >
                {paid ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border-2 border-white/60 inline-block" />}
                Réglé
              </button>
            </div>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────── */}
        <div className="px-4 py-3 space-y-3 max-h-[520px] overflow-y-auto">

          {/* Client */}
          <div className="space-y-1">
            <label className="text-[11px] font-700 text-rose-400 uppercase tracking-wider px-1">Cliente</label>
            <div className="flex items-center gap-3 bg-rose-50 border border-rose-100 rounded-2xl px-3.5 py-2.5 inner-glow">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-300 to-pink-400 flex items-center justify-center text-white font-bold text-sm shrink-0">
                {client.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{client}</p>
                <p className="text-[11px] text-rose-400">12 visites · Client fidèle</p>
              </div>
              <div className="flex items-center gap-1 bg-amber-100 rounded-full px-2 py-0.5">
                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                <span className="text-[11px] font-bold text-amber-600">320 pts</span>
              </div>
              <ChevronDown className="w-4 h-4 text-rose-300 shrink-0" />
            </div>
          </div>

          {/* Staff + Time + Duration */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-700 text-rose-400 uppercase tracking-wider px-1">Staff</label>
              <div className="bg-rose-50 border border-rose-100 rounded-xl px-2.5 py-2 flex items-center gap-1.5 inner-glow">
                <User className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <select
                  value={staff}
                  onChange={e => setStaff(e.target.value)}
                  className="flex-1 bg-transparent text-[12px] font-semibold text-gray-700 outline-none min-w-0 cursor-pointer"
                >
                  {staffList.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-700 text-rose-400 uppercase tracking-wider px-1">Heure</label>
              <div className="bg-rose-50 border border-rose-100 rounded-xl px-2.5 py-2 flex items-center gap-1.5 inner-glow">
                <Clock className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <select
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="flex-1 bg-transparent text-[12px] font-semibold text-gray-700 outline-none min-w-0 cursor-pointer"
                >
                  {timeSlots.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-700 text-rose-400 uppercase tracking-wider px-1">Durée</label>
              <div className="bg-rose-50 border border-rose-100 rounded-xl px-2.5 py-2 flex items-center gap-1.5 inner-glow">
                <Timer className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span className="text-[12px] font-semibold text-gray-700">{duration} min</span>
              </div>
            </div>
          </div>

          {/* Services */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <label className="text-[11px] font-700 text-rose-400 uppercase tracking-wider">Services</label>
              <button
                onClick={() => setShowServicePicker(!showServicePicker)}
                className="text-[11px] font-semibold text-rose-500 flex items-center gap-1"
              >
                <Scissors className="w-3 h-3" /> Modifier
              </button>
            </div>
            {/* Selected chips */}
            <div className="flex flex-wrap gap-1.5">
              {selectedServices.map(svc => (
                <div key={svc.id} className="service-chip flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 bg-gradient-to-r from-rose-100 to-pink-100 border border-rose-200 rounded-full">
                  <span className="text-[12px] font-semibold text-rose-700">{svc.name}</span>
                  <span className="text-[11px] text-rose-500 font-bold">{svc.price} DH</span>
                  <button onClick={() => toggleService(svc)} className="w-4 h-4 rounded-full bg-rose-200 flex items-center justify-center ml-0.5">
                    <X className="w-2.5 h-2.5 text-rose-600" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setShowServicePicker(!showServicePicker)}
                className="service-chip flex items-center gap-1 px-2.5 py-1.5 border-2 border-dashed border-rose-200 rounded-full text-[12px] font-semibold text-rose-400 hover:bg-rose-50"
              >
                + Ajouter
              </button>
            </div>
            {/* Service picker */}
            {showServicePicker && (
              <div className="bg-white border border-rose-100 rounded-2xl p-2 shadow-lg space-y-0.5">
                {services.map(svc => (
                  <button
                    key={svc.id}
                    onClick={() => toggleService(svc)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all ${
                      selectedServices.find(s => s.id === svc.id)
                        ? "bg-rose-50 text-rose-700"
                        : "text-gray-600 hover:bg-rose-50/50"
                    }`}
                  >
                    <span className="font-medium">{svc.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-rose-500 font-semibold text-xs">{svc.price} DH</span>
                      {selectedServices.find(s => s.id === svc.id) && <Check className="w-3.5 h-3.5 text-rose-500" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Discounts row */}
          <div className="flex gap-2">
            <button
              onClick={() => setLoyaltyApplied(!loyaltyApplied)}
              className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border text-[12px] font-semibold transition-all ${
                loyaltyApplied
                  ? "bg-amber-50 border-amber-300 text-amber-700"
                  : "bg-rose-50 border-rose-100 text-rose-400 hover:bg-amber-50/50"
              }`}
            >
              <Star className={`w-3.5 h-3.5 shrink-0 ${loyaltyApplied ? "text-amber-500 fill-amber-500" : ""}`} />
              <span>320 pts</span>
              {loyaltyApplied && <span className="ml-auto text-amber-600 font-bold">-30 DH</span>}
            </button>
            <button
              onClick={() => setGiftApplied(!giftApplied)}
              className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border text-[12px] font-semibold transition-all ${
                giftApplied
                  ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                  : "bg-rose-50 border-rose-100 text-rose-400 hover:bg-emerald-50/50"
              }`}
            >
              <Gift className={`w-3.5 h-3.5 shrink-0 ${giftApplied ? "text-emerald-500" : ""}`} />
              <span>50 DH carte</span>
              {giftApplied && <span className="ml-auto text-emerald-600 font-bold">-50 DH</span>}
            </button>
          </div>

          {/* Private Room */}
          <button
            onClick={() => setPrivateRoom(!privateRoom)}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-[13px] font-semibold transition-all ${
              privateRoom
                ? "bg-violet-50 border-violet-200 text-violet-700"
                : "bg-rose-50 border-rose-100 text-rose-400"
            }`}
          >
            <ShieldCheck className={`w-4 h-4 shrink-0 ${privateRoom ? "text-violet-500" : "text-rose-300"}`} />
            <span className="flex-1 text-start">غرفة خاصة — نساء فقط</span>
            <span className="text-[11px] opacity-60">Private Room</span>
            {privateRoom && <Check className="w-3.5 h-3.5 text-violet-500" />}
          </button>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-[11px] font-700 text-rose-400 uppercase tracking-wider px-1">Notes</label>
            <textarea
              rows={2}
              placeholder="Remarques spéciales, préférences client..."
              className="w-full bg-rose-50 border border-rose-100 rounded-xl px-3.5 py-2.5 text-[12px] text-gray-600 placeholder-rose-300 outline-none resize-none focus:border-rose-300 focus:bg-white transition-all inner-glow"
            />
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────── */}
        <div className="px-4 pb-4 pt-1">
          {/* Summary strip */}
          {(loyaltyApplied || giftApplied) && (
            <div className="flex items-center justify-between bg-rose-50 border border-rose-100 rounded-xl px-3.5 py-2 mb-2.5 text-[12px]">
              <span className="text-gray-500">Prix services</span>
              <span className="font-semibold text-gray-700">{baseTotal} DH</span>
              <span className="text-rose-400">→</span>
              <span className="font-bold text-rose-600">{total} DH</span>
            </div>
          )}

          <button
            className="rose-btn w-full py-3.5 rounded-2xl font-bold text-white text-[15px] soft-shadow"
            style={{ background: "linear-gradient(135deg, #fb7185 0%, #f43f5e 60%, #e11d48 100%)" }}
          >
            <span className="flex items-center justify-center gap-2">
              <CalendarDays className="w-4.5 h-4.5" />
              Confirmer la réservation
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
