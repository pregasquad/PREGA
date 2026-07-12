import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────
interface Service {
  id: number;
  name: string;
  price: number;
  minPrice?: number;
  maxPrice?: number;
  duration: number;
  category?: string;
  description?: string;
  emoji?: string;
  isActive?: boolean;
}

interface BusinessSettings {
  businessName?: string;
  phone?: string;
  ownerPhone?: string;
  address?: string;
  openingTime?: string;
  closingTime?: string;
  workingDays?: number[];
  logo?: string;
  email?: string;
  mapsLink?: string;
  currencySymbol?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildWhatsAppUrl(phone: string | undefined, message: string): string {
  if (!phone) return "https://wa.me/";
  let n = phone.replace(/[^0-9]/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("0") && n.length === 10) n = "212" + n.slice(1);
  if (n.length === 9) n = "212" + n;
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}

const DAY_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const DAY_NAMES_FULL = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function formatWorkingDays(days?: number[]): string {
  if (!days || days.length === 0) return "Lun – Sam";
  if (days.length === 7) return "Tous les jours";
  const sorted = [...days].sort((a, b) => a - b);
  // detect consecutive range
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (consecutive && sorted.length >= 4) {
    return `${DAY_NAMES_FULL[sorted[0]]} – ${DAY_NAMES_FULL[sorted[sorted.length - 1]]}`;
  }
  return sorted.map(d => DAY_NAMES[d]).join(", ");
}

// ── WhatsApp SVG icon ────────────────────────────────────────────────────────
function WAIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("w-4 h-4", className)}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ── Phone icon ───────────────────────────────────────────────────────────────
function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cn("w-4 h-4", className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z" />
    </svg>
  );
}

// ── Clock icon ───────────────────────────────────────────────────────────────
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cn("w-4 h-4", className)}>
      <circle cx={12} cy={12} r={10} />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// ── MapPin icon ──────────────────────────────────────────────────────────────
function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cn("w-4 h-4", className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

// ── Scrolling ticker ─────────────────────────────────────────────────────────
function ServiceTicker({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const items = [...names, ...names, ...names];
  return (
    <div className="overflow-hidden bg-[#1a0a12] py-3 select-none">
      <div className="flex items-center animate-[ticker_30s_linear_infinite] whitespace-nowrap w-max">
        {items.map((name, i) => (
          <span key={i} className="flex items-center gap-3 mx-4 text-sm font-semibold text-pink-200 uppercase tracking-widest">
            <span className="text-[#e8a87c] text-base">✦</span>
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Star rating ──────────────────────────────────────────────────────────────
function Stars({ count = 5 }: { count?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} viewBox="0 0 20 20" fill={i < count ? "#f59e0b" : "#d1d5db"} className="w-4 h-4">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

// ── Service card ─────────────────────────────────────────────────────────────
function ServiceCard({ service, whatsappPhone, salonName, currencySymbol }: {
  service: Service;
  whatsappPhone?: string;
  salonName: string;
  currencySymbol: string;
}) {
  const waMsg = `Bonjour ${salonName} 💕\n\nJe souhaite réserver pour :\n✨ ${service.name}\n\nMerci !`;
  const waUrl = buildWhatsAppUrl(whatsappPhone, waMsg);

  const displayPrice = service.minPrice && service.maxPrice
    ? `${service.minPrice}–${service.maxPrice} ${currencySymbol}`
    : `${service.price} ${currencySymbol}`;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 border border-pink-100/50 group flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-bold text-[#1a0a12] text-base leading-snug flex-1">
          {service.emoji && <span className="mr-1">{service.emoji}</span>}
          {service.name}
        </h3>
        <span className="shrink-0 font-bold text-sm px-2.5 py-1 rounded-full bg-pink-50 text-[#e91e8c] border border-pink-100">
          {displayPrice}
        </span>
      </div>

      {service.description && (
        <p className="text-sm text-gray-500 leading-relaxed flex-1">{service.description}</p>
      )}

      <div className="flex items-center justify-between mt-1">
        {service.duration > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <ClockIcon />
            {service.duration} min
          </span>
        )}
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-white bg-[#e91e8c] hover:bg-[#c91578] px-3 py-1.5 rounded-full transition-colors"
        >
          <WAIcon />
          Réserver
        </a>
      </div>
    </div>
  );
}

// ── Category pills ───────────────────────────────────────────────────────────
function CategoryPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap",
        active
          ? "bg-[#e91e8c] text-white shadow-md shadow-pink-200"
          : "bg-white text-gray-600 border border-gray-200 hover:border-pink-200 hover:text-[#e91e8c]"
      )}
    >
      {label}
    </button>
  );
}

// ── Decorative floating card (hero) ──────────────────────────────────────────
function FloatingCard({ className, label, sub }: { className?: string; label: string; sub?: string }) {
  return (
    <div className={cn(
      "absolute bg-white/90 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-xl border border-pink-100/50",
      className
    )}>
      <p className="font-bold text-[#1a0a12] text-sm">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Website() {
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const { data: websiteData } = useQuery<{ settings: BusinessSettings; services: Service[] }>({
    queryKey: ["/api/public/website"],
    queryFn: () => fetch("/api/public/website").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const settings = websiteData?.settings;
  const activeServices = websiteData?.services ?? [];
  const salonName = settings?.businessName || "PREGA SQUAD";
  const phone = settings?.phone || settings?.ownerPhone || "";
  const currencySymbol = settings?.currencySymbol || "MAD";
  const openingTime = settings?.openingTime || "09:00";
  const closingTime = settings?.closingTime || "19:00";
  const workingDays = settings?.workingDays;

  // Build categories from services
  const categories = Array.from(
    new Set(activeServices.map(s => s.category || "Autres").filter(Boolean))
  );

  const filteredServices = activeCategory === "all"
    ? activeServices
    : activeServices.filter(s => (s.category || "Autres") === activeCategory);

  // Service names for ticker
  const tickerNames = activeServices.map(s => s.name);

  // WhatsApp URLs
  const waBookUrl = buildWhatsAppUrl(phone, `Bonjour ${salonName} 💕\nJe souhaite réserver un rendez-vous, merci !`);
  const waCallUrl = `tel:${phone}`;

  // Section refs for in-page nav
  const heroRef = useRef<HTMLDivElement>(null);
  const servicesRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const contactRef = useRef<HTMLDivElement>(null);

  const scrollTo = (ref: React.RefObject<HTMLDivElement>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="relative bg-gradient-to-br from-pink-50 via-white to-rose-50 min-h-full overflow-y-auto" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Ticker animation keyframe injection */}
      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
      `}</style>

      {/* ── Floating WhatsApp button ──────────────────────── */}
      <a
        href={waBookUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-24 right-4 z-50 w-12 h-12 rounded-full bg-[#25d366] flex items-center justify-center shadow-lg hover:scale-110 transition-transform md:bottom-6"
        title="Réserver sur WhatsApp"
      >
        <WAIcon className="w-6 h-6 text-white" />
      </a>

      {/* ── In-page sticky nav ───────────────────────────── */}
      <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-pink-100/50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2 shrink-0">
            <img src="/logo.png" alt={salonName} className="w-8 h-8 rounded-full object-contain" />
            <span className="font-bold text-[#e91e8c] text-sm hidden sm:block">{salonName}</span>
          </div>

          {/* Links */}
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
            <button onClick={() => scrollTo(servicesRef)} className="hover:text-[#e91e8c] transition-colors">Services</button>
            <button onClick={() => scrollTo(aboutRef)} className="hover:text-[#e91e8c] transition-colors">Le salon</button>
            <button onClick={() => scrollTo(contactRef)} className="hover:text-[#e91e8c] transition-colors">Contact</button>
          </div>

          {/* CTA */}
          <a
            href={waBookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-[#e91e8c] hover:bg-[#c91578] text-white text-xs font-bold px-4 py-2 rounded-full transition-colors"
          >
            <WAIcon />
            Réserver
          </a>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section ref={heroRef} className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          {/* Left */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 bg-white/80 border border-pink-100 rounded-full px-4 py-1.5 text-xs font-semibold text-[#e91e8c] tracking-wider uppercase shadow-sm">
              <span>✦</span>
              BEAUTY SALON | HAIR &amp; NAILS | AGADIR
            </div>

            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight text-[#1a0a12]">
              Your beauty,<br />
              <span className="text-[#e91e8c] italic">our passion.</span>
            </h1>

            <p className="text-gray-500 text-base leading-relaxed max-w-md">
              Ongles, coiffure, maquillage et soins du visage à Agadir. Une équipe passionnée, des produits professionnels et un résultat qui vous ressemble. Réservez en un clic sur WhatsApp.
            </p>

            <div className="flex flex-wrap gap-3">
              <a
                href={waBookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-[#e91e8c] hover:bg-[#c91578] text-white font-bold px-6 py-3 rounded-full transition-all shadow-lg shadow-pink-200 hover:scale-[1.02] text-sm"
              >
                <WAIcon className="w-5 h-5" />
                Réserver un rendez-vous
              </a>
              {phone && (
                <a
                  href={waCallUrl}
                  className="flex items-center gap-2 bg-white hover:bg-pink-50 text-[#1a0a12] font-bold px-6 py-3 rounded-full border border-pink-100 transition-all text-sm"
                >
                  <PhoneIcon className="w-4 h-4" />
                  Appeler
                </a>
              )}
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <Stars count={5} />
                <span className="font-semibold text-gray-700">5 étoiles</span>
              </div>
              <span className="text-gray-300">|</span>
              <span className="flex items-center gap-1.5">
                <MapPinIcon className="text-[#e91e8c]" />
                Au cœur d&apos;Agadir
              </span>
            </div>
          </div>

          {/* Right — decorative hero visual */}
          <div className="relative flex items-center justify-center">
            <div className="relative w-72 h-80 md:w-80 md:h-96">
              {/* Main pink card */}
              <div
                className="absolute inset-0 rounded-[2.5rem] flex flex-col items-center justify-center gap-3"
                style={{
                  background: "linear-gradient(145deg, #f472b6 0%, #ec4899 40%, #db2777 100%)",
                  boxShadow: "0 30px 80px rgba(219,39,119,0.35)",
                }}
              >
                <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-12 h-12 text-white" fill="currentColor">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                </div>
                <span className="text-white/90 tracking-[0.3em] text-xs font-bold uppercase">
                  {activeServices.length > 0 ? activeServices[0]?.category?.toUpperCase() || "ONGLES" : "ONGLES"}
                </span>
                <span className="bg-white text-[#e91e8c] text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
                  ✦ It&apos;s a lifestyle
                </span>
              </div>

              {/* Top-left floating card */}
              <FloatingCard
                className="-top-6 -left-8 z-10"
                label={`${activeServices.length}+ services`}
                sub="disponibles"
              />

              {/* Bottom-right floating card */}
              <FloatingCard
                className="-bottom-4 -right-6 z-10"
                label={`${openingTime} – ${closingTime}`}
                sub="Ouvert aujourd'hui"
              />

              {/* Gold accent card */}
              <div
                className="absolute -top-2 -right-4 w-16 h-16 rounded-2xl z-10 shadow-lg"
                style={{ background: "linear-gradient(135deg, #f6d365 0%, #c8a951 100%)" }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Ticker ───────────────────────────────────────── */}
      <ServiceTicker names={tickerNames.length > 0 ? tickerNames : ["Maquillage", "Coiffure", "Ongles", "Soins du visage", "Extensions de cils", "Nail art", "Manucure", "Balayage"]} />

      {/* ── Services ─────────────────────────────────────── */}
      <section ref={servicesRef} className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10 space-y-2">
            <p className="text-xs font-bold tracking-[0.2em] text-[#e91e8c] uppercase">NOS PRESTATIONS</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#1a0a12]">
              Services &amp; <span className="text-[#c8a951] italic">Tarifs</span>
            </h2>
            <p className="text-gray-500 text-sm max-w-lg mx-auto">
              Des prestations sur-mesure pour sublimer votre beauté. Prix en {currencySymbol}, confirmés lors de votre réservation.
            </p>
          </div>

          {/* Category tabs */}
          {categories.length > 1 && (
            <div className="flex flex-wrap justify-center gap-2 mb-8">
              <CategoryPill label="Tout" active={activeCategory === "all"} onClick={() => setActiveCategory("all")} />
              {categories.map(cat => (
                <CategoryPill key={cat} label={cat} active={activeCategory === cat} onClick={() => setActiveCategory(cat)} />
              ))}
            </div>
          )}

          {/* Category description */}
          {activeCategory !== "all" && (
            <p className="text-center text-sm text-gray-400 mb-6 italic">{activeCategory}</p>
          )}

          {/* Service cards grid */}
          {filteredServices.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredServices.map((service, i) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  whatsappPhone={phone}
                  salonName={salonName}
                  currencySymbol={currencySymbol}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">💅</div>
              <p>Chargement des services...</p>
            </div>
          )}
        </div>
      </section>

      {/* ── About / Le Salon ─────────────────────────────── */}
      <section ref={aboutRef} className="py-16 px-4 bg-[#1a0a12]">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-5">
            <p className="text-xs font-bold tracking-[0.2em] text-[#e8a87c] uppercase">LE SALON</p>
            <h2 className="text-3xl font-extrabold text-white">
              Un espace dédié à<br />
              <span className="text-[#e91e8c]">votre beauté</span>
            </h2>
            <p className="text-gray-400 leading-relaxed text-sm">
              {salonName} est votre refuge beauté à Agadir. Nous proposons des prestations haut de gamme dans une ambiance chaleureuse et élégante. Notre équipe de professionnelles passionnées est à votre service pour vous offrir une expérience unique.
            </p>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <div className="text-2xl font-extrabold text-[#e91e8c]">{activeServices.length}+</div>
                <div className="text-xs text-gray-400 mt-1">Prestations disponibles</div>
              </div>
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <div className="text-2xl font-extrabold text-[#e91e8c]">5★</div>
                <div className="text-xs text-gray-400 mt-1">Note client Google</div>
              </div>
            </div>
          </div>

          {/* Values */}
          <div className="space-y-4">
            {[
              { icon: "💎", title: "Produits professionnels", desc: "Nous utilisons uniquement des produits de haute qualité pour des résultats durables." },
              { icon: "✨", title: "Expertise & passion", desc: "Notre équipe se forme continuellement aux dernières tendances beauté." },
              { icon: "🤍", title: "Votre satisfaction", desc: "Votre confort et votre satisfaction sont notre priorité absolue." },
            ].map((item) => (
              <div key={item.title} className="flex gap-4 bg-white/5 rounded-2xl p-4 border border-white/10 hover:border-pink-500/30 transition-colors">
                <span className="text-2xl shrink-0">{item.icon}</span>
                <div>
                  <p className="font-bold text-white text-sm">{item.title}</p>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Reviews ──────────────────────────────────────── */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 space-y-2">
            <p className="text-xs font-bold tracking-[0.2em] text-[#e91e8c] uppercase">AVIS CLIENTS</p>
            <h2 className="text-3xl font-extrabold text-[#1a0a12]">
              Ce que disent nos <span className="text-[#e91e8c] italic">clientes</span>
            </h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { name: "Fatima Z.", text: "Excellente prestation ! Les ongles sont parfaits et l'équipe est tellement professionnelle. Je reviens chaque mois 💕", service: "Pose gel complète" },
              { name: "Amina K.", text: "Le meilleur salon d'Agadir ! Ambiance chaleureuse, résultat impeccable. Je recommande vivement à toutes mes amies.", service: "Maquillage mariée" },
              { name: "Sara M.", text: "Toujours satisfaite de mes visites ! Coiffure magnifique et équipe à l'écoute. Réservez vite, ça part très vite !", service: "Balayage & coiffure" },
            ].map((review) => (
              <div key={review.name} className="bg-white rounded-2xl p-5 shadow-sm border border-pink-100/50 space-y-3">
                <Stars count={5} />
                <p className="text-gray-600 text-sm leading-relaxed italic">&ldquo;{review.text}&rdquo;</p>
                <div className="pt-2 border-t border-gray-50">
                  <p className="font-bold text-[#1a0a12] text-sm">{review.name}</p>
                  <p className="text-xs text-[#e91e8c]">{review.service}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact + CTA ─────────────────────────────────── */}
      <section ref={contactRef} className="py-16 px-4 bg-gradient-to-br from-pink-50 to-rose-100">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-5">
            <p className="text-xs font-bold tracking-[0.2em] text-[#e91e8c] uppercase">CONTACT &amp; HORAIRES</p>
            <h2 className="text-3xl font-extrabold text-[#1a0a12]">
              Prête à vous sublimer ?
            </h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              Réservez directement via WhatsApp ou appelez-nous. On est là pour vous !
            </p>

            <div className="space-y-3">
              {phone && (
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm">
                    <WAIcon className="text-[#25d366]" />
                  </div>
                  <span>{phone}</span>
                </div>
              )}
              {settings?.address && (
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm">
                    <MapPinIcon className="text-[#e91e8c]" />
                  </div>
                  <span>{settings.address}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm">
                  <ClockIcon className="text-[#e91e8c]" />
                </div>
                <span>{formatWorkingDays(workingDays)} · {openingTime} – {closingTime}</span>
              </div>
              {settings?.email && (
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#e91e8c]">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <span>{settings.email}</span>
                </div>
              )}
            </div>
          </div>

          {/* CTA card */}
          <div
            className="rounded-3xl p-8 text-center space-y-5 shadow-2xl"
            style={{ background: "linear-gradient(145deg, #f472b6 0%, #ec4899 40%, #db2777 100%)" }}
          >
            <div className="w-16 h-16 mx-auto rounded-full bg-white/20 flex items-center justify-center">
              <WAIcon className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-extrabold text-white">Réserver maintenant</h3>
            <p className="text-pink-100 text-sm leading-relaxed">
              Cliquez pour envoyer un message WhatsApp et réserver votre rendez-vous en quelques secondes.
            </p>
            <a
              href={waBookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white text-[#e91e8c] font-bold px-8 py-3 rounded-full hover:scale-[1.03] transition-transform shadow-lg text-sm"
            >
              <WAIcon className="text-[#25d366]" />
              Envoyer un message
            </a>

            {settings?.mapsLink && (
              <div className="pt-1">
                <a
                  href={settings.mapsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-pink-100 text-xs hover:text-white transition-colors underline underline-offset-2"
                >
                  📍 Voir sur Google Maps
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="bg-[#1a0a12] py-8 px-4 text-center space-y-3">
        <div className="flex items-center justify-center gap-2">
          <img src="/logo.png" alt={salonName} className="w-8 h-8 rounded-full object-contain" />
          <span className="text-pink-400 font-bold">{salonName}</span>
        </div>
        <p className="text-gray-500 text-xs">
          Beauty Salon · Agadir, Maroc
        </p>
        <p className="text-gray-600 text-xs">
          © {new Date().getFullYear()} {salonName} · Tous droits réservés
        </p>
      </footer>

    </div>
  );
}
