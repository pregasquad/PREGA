import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, MapPin, Clock, Camera, Plus, Pencil, Trash2, Eye, EyeOff, Instagram } from "lucide-react";
import { SiWhatsapp, SiTiktok } from "react-icons/si";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Staff {
  id: number;
  name: string;
  photoUrl?: string | null;
  categories?: string[];
  color?: string;
  gender?: string;
}

function normalizeCategories(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((category): category is string => typeof category === "string" && category.trim().length > 0)
      .map(category => category.trim());
  }
  if (typeof value === "string") {
    return value.split(",").map(category => category.trim()).filter(Boolean);
  }
  return [];
}

function normalizeStaff(value: unknown): Staff[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((member): member is Record<string, unknown> => typeof member === "object" && member !== null)
    .map(member => ({
      id: typeof member.id === "number" ? member.id : Number(member.id),
      name: typeof member.name === "string" ? member.name : "Artiste",
      photoUrl: typeof member.photoUrl === "string" ? member.photoUrl : null,
      categories: normalizeCategories(member.categories),
      color: typeof member.color === "string" ? member.color : undefined,
      gender: typeof member.gender === "string" ? member.gender : undefined,
    }))
    .filter(member => Number.isFinite(member.id));
}

interface Service {
  id: number;
  name: string;
  price: number;
  minPrice?: number | null;
  maxPrice?: number | null;
  duration: number;
  category?: string | null;
  description?: string | null;
  emoji?: string | null;
  imageUrl?: string | null;
}

interface BusinessSettings {
  businessName?: string;
  phone?: string;
  address?: string;
  email?: string;
  mapsLink?: string;
  openingTime?: string;
  closingTime?: string;
  workingDays?: number[];
  currencySymbol?: string;
}

interface WebsiteTestimonial {
  id: number;
  clientName: string;
  clientPhotoUrl: string | null;
  serviceName: string | null;
  rating: number;
  text: string;
  isVisible: boolean;
  createdAt: string;
}

interface TestimonialFormData {
  clientName: string;
  clientPhotoUrl: string;
  serviceName: string;
  rating: number;
  text: string;
  isVisible: boolean;
}

// ── Auth helper ────────────────────────────────────────────────────────────────
function isOwnerLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  const auth = sessionStorage.getItem("user_authenticated") === "true"
    || localStorage.getItem("user_authenticated") === "true";
  if (!auth) return false;
  const role = sessionStorage.getItem("current_user_role")
    || localStorage.getItem("current_user_role") || "";
  if (role === "owner" || role === "manager") return true;
  try {
    const perms: string[] = JSON.parse(
      sessionStorage.getItem("current_user_permissions")
      || localStorage.getItem("current_user_permissions") || "[]"
    );
    return perms.includes("admin_settings");
  } catch { return false; }
}

// ── Fetch helper ───────────────────────────────────────────────────────────────
async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...init });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ── WhatsApp URL ───────────────────────────────────────────────────────────────
function buildWaUrl(phone = "", message = "") {
  let n = phone.replace(/[^0-9]/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("0") && n.length === 10) n = "212" + n.slice(1);
  if (n.length === 9) n = "212" + n;
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}

// ── Day helpers ────────────────────────────────────────────────────────────────
const DAY_FULL = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const DAY_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
function fmtDays(days?: number[]) {
  if (!days?.length) return "Lun – Sam";
  if (days.length === 7) return "Tous les jours";
  const s = [...days].sort((a, b) => a - b);
  const consec = s.every((d, i) => i === 0 || d === s[i - 1] + 1);
  if (consec && s.length >= 4) return `${DAY_FULL[s[0]]} – ${DAY_FULL[s[s.length - 1]]}`;
  return s.map(d => DAY_SHORT[d]).join(", ");
}

// ── Stars ──────────────────────────────────────────────────────────────────────
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

// ── Staff avatar ───────────────────────────────────────────────────────────────
function StaffAvatar({ staff, size = "md", ring = false }: { staff: Staff; size?: "sm" | "md" | "lg" | "xl"; ring?: boolean }) {
  const sizeClass = { sm: "w-10 h-10 text-base", md: "w-16 h-16 text-xl", lg: "w-24 h-24 text-3xl", xl: "w-36 h-36 text-5xl" }[size];
  if (staff.photoUrl) {
    return (
      <img
        src={staff.photoUrl}
        alt={staff.name}
        className={cn(sizeClass, "rounded-full object-cover", ring && "ring-4 ring-[#e91e8c] ring-offset-2")}
      />
    );
  }
  const initials = staff.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className={cn(sizeClass, "rounded-full flex items-center justify-center font-bold text-white", ring && "ring-4 ring-[#e91e8c] ring-offset-2")}
      style={{ background: staff.color || "linear-gradient(135deg,#e91e8c,#9c27b0)" }}>
      {initials}
    </div>
  );
}

// ── Scrolling ticker ───────────────────────────────────────────────────────────
function ServiceTicker({ names }: { names: string[] }) {
  if (!names.length) return null;
  const items = [...names, ...names, ...names];
  return (
    <div className="overflow-hidden bg-[#1a0a12] py-3 select-none">
      <div className="flex items-center animate-[ticker_30s_linear_infinite] whitespace-nowrap w-max">
        {items.map((name, i) => (
          <span key={i} className="flex items-center gap-3 mx-4 text-sm font-semibold text-pink-200 uppercase tracking-widest">
            <span className="text-[#e8a87c]">✦</span>{name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Per-letter animated name (from Website1) ───────────────────────────────────
function AnimatedName({ name, id }: { name: string; id: number }) {
  return (
    <span className="flex flex-wrap justify-center gap-[0.5px]">
      {name.split("").map((ch, i) => (
        <motion.span
          key={`${id}-${i}`}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ delay: i * 0.035, duration: 0.35, ease: "easeOut" }}
          className="inline-block"
        >
          {ch === " " ? "\u00A0" : ch}
        </motion.span>
      ))}
    </span>
  );
}

// ── Hero Staff Carousel (Website1 design) ──────────────────────────────────────
function StaffHero({
  staff, phone, salonName, onBookStaff,
}: {
  staff: Staff[];
  phone: string;
  salonName: string;
  onBookStaff: (s: Staff) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  if (!staff.length) return null;

  const goTo = (idx: number) => setCurrentIndex(idx);
  const next = () => setCurrentIndex(i => (i + 1) % staff.length);
  const prev = () => setCurrentIndex(i => (i - 1 + staff.length) % staff.length);
  const current = staff[currentIndex];

  const figureVariants = {
    enter: { opacity: 0, scale: 0.88, filter: "blur(8px)" },
    center: {
      opacity: 1, scale: 1, filter: "blur(0px)",
      transition: {
        opacity: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const },
        scale: { type: "spring" as const, stiffness: 160, damping: 22 },
        filter: { duration: 0.35, ease: "easeOut" },
      },
    },
    exit: { opacity: 0, scale: 1.06, filter: "blur(4px)", transition: { duration: 0.28 } },
  };

  const textVariants = {
    enter: { opacity: 0, y: 12 },
    center: { opacity: 1, y: 0, transition: { delay: 0.28, duration: 0.38, ease: "easeOut" } },
    exit: { opacity: 0, y: -6, transition: { duration: 0.18 } },
  };

  const roleVariants = {
    enter: { opacity: 0, y: 8 },
    center: { opacity: 1, y: 0, transition: { delay: 0.42, duration: 0.32, ease: "easeOut" } },
    exit: { opacity: 0, transition: { duration: 0.15 } },
  };

  const leftIdx = (currentIndex - 1 + staff.length) % staff.length;
  const rightIdx = (currentIndex + 1) % staff.length;

  return (
    <section className="relative overflow-hidden bg-[#FFB6C1] min-h-[480px] md:min-h-[560px] flex flex-col items-center justify-end pb-8">
      {/* Watermark */}
      <div className="absolute inset-0 flex items-center justify-center select-none pointer-events-none">
        <span className="text-[clamp(5rem,18vw,14rem)] font-black text-[#D4006D]/10 tracking-tighter leading-none">
          THE SQUAD
        </span>
      </div>

      {/* Figure area */}
      <div className="relative w-full flex items-end justify-center" style={{ height: "340px" }}>
        {/* Ghost left */}
        {staff.length > 1 && (
          <motion.div
            className="absolute left-[5%] md:left-[12%] bottom-0 w-24 h-36 md:w-32 md:h-48 opacity-30 blur-sm pointer-events-none"
            key={`ghost-left-${leftIdx}`}
            initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} exit={{ opacity: 0 }}
          >
            <StaffAvatar staff={staff[leftIdx]} size="xl" />
          </motion.div>
        )}

        {/* Ghost right */}
        {staff.length > 1 && (
          <motion.div
            className="absolute right-[5%] md:right-[12%] bottom-0 w-24 h-36 md:w-32 md:h-48 opacity-30 blur-sm pointer-events-none"
            key={`ghost-right-${rightIdx}`}
            initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} exit={{ opacity: 0 }}
          >
            <StaffAvatar staff={staff[rightIdx]} size="xl" />
          </motion.div>
        )}

        {/* Main figure */}
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            variants={figureVariants}
            initial="enter" animate="center" exit="exit"
            className="absolute bottom-0 flex flex-col items-center"
          >
            <div className="w-40 h-40 md:w-56 md:h-56 rounded-full overflow-hidden shadow-2xl border-4 border-white/60">
              <StaffAvatar staff={current} size="xl" />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom info bar */}
      <div className="relative z-10 w-full max-w-lg mx-auto px-4 mt-6 text-center space-y-2">
        {/* Name */}
        <div className="text-3xl md:text-4xl font-black tracking-tight text-[#1A0A0E]">
          <AnimatePresence mode="wait">
            <motion.div key={current.id} initial="enter" animate="center" exit="exit" variants={textVariants}>
              <AnimatedName name={current.name} id={current.id} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Role (categories) */}
        <AnimatePresence mode="wait">
          <motion.p
            key={`role-${current.id}`}
            variants={roleVariants} initial="enter" animate="center" exit="exit"
            className="text-sm font-semibold text-[#1A0A0E]/60 uppercase tracking-widest"
          >
            {current.categories?.join(" · ") || "Artiste"}
          </motion.p>
        </AnimatePresence>

        {/* Book this artist */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`btn-${current.id}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.52, duration: 0.3 } }}
            exit={{ opacity: 0 }}
            className="pt-2"
          >
            <button
              onClick={() => onBookStaff(current)}
              className="inline-flex items-center gap-2 bg-[#D4006D] hover:bg-[#b0005a] text-white font-bold px-6 py-2.5 rounded-full text-sm transition-all shadow-lg shadow-pink-300/40 hover:scale-[1.03]"
            >
              <SiWhatsapp className="w-4 h-4" />
              Réserver avec {current.name.split(" ")[0]}
            </button>
          </motion.div>
        </AnimatePresence>

        {/* Nav controls */}
        {staff.length > 1 && (
          <div className="flex items-center justify-center gap-4 pt-3">
            <button onClick={prev} className="w-9 h-9 rounded-full border border-[#1A0A0E]/20 flex items-center justify-center hover:bg-[#D4006D] hover:text-white hover:border-[#D4006D] transition-all">
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Dot selectors */}
            <div className="flex items-center gap-2">
              {staff.map((member, idx) => (
                <motion.button
                  key={member.id}
                  onClick={() => goTo(idx)}
                  animate={{ width: idx === currentIndex ? 28 : 8 }}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  className={cn(
                    "h-2 rounded-full transition-colors",
                    idx === currentIndex ? "bg-[#D4006D]" : "bg-[#1A0A0E]/30"
                  )}
                />
              ))}
            </div>

            <button onClick={next} className="w-9 h-9 rounded-full border border-[#1A0A0E]/20 flex items-center justify-center hover:bg-[#D4006D] hover:text-white hover:border-[#D4006D] transition-all">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Category pill ──────────────────────────────────────────────────────────────
function CategoryPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn(
      "px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap",
      active ? "bg-[#e91e8c] text-white shadow-md shadow-pink-200" : "bg-white text-gray-600 border border-gray-200 hover:border-pink-200 hover:text-[#e91e8c]"
    )}>{label}</button>
  );
}

// ── Service card ───────────────────────────────────────────────────────────────
function ServiceCard({
  service, phone, salonName, currency, editMode, onImageUpload,
}: {
  service: Service; phone?: string; salonName: string; currency: string;
  editMode: boolean; onImageUpload: (id: number, file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const waMsg = `Bonjour ${salonName} 💕\n\nJe souhaite réserver pour :\n✨ ${service.name}\n\nMerci !`;
  const waUrl = buildWaUrl(phone, waMsg);
  const displayPrice = service.minPrice && service.maxPrice
    ? `${service.minPrice}–${service.maxPrice} ${currency}`
    : `${service.price} ${currency}`;

  return (
    <div className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 border border-pink-100/50 flex flex-col overflow-hidden group">
      <div className="relative w-full h-40 bg-gradient-to-br from-pink-50 to-rose-100 flex-shrink-0">
        {service.imageUrl ? (
          <img src={service.imageUrl} alt={service.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">
            {service.emoji || "💅"}
          </div>
        )}
        {editMode && (
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white gap-1"
          >
            <Camera className="w-7 h-7" />
            <span className="text-xs font-semibold">Changer l&apos;image</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onImageUpload(service.id, f); e.target.value = ""; }} />
        <span className="absolute top-2 right-2 font-bold text-xs px-2.5 py-1 rounded-full bg-white text-[#e91e8c] shadow border border-pink-100">
          {displayPrice}
        </span>
      </div>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <h3 className="font-bold text-[#1a0a12] text-sm leading-snug">
          {service.emoji && <span className="mr-1">{service.emoji}</span>}
          {service.name}
        </h3>
        {service.description && (
          <p className="text-xs text-gray-500 leading-relaxed flex-1">{service.description}</p>
        )}
        <div className="flex items-center justify-between mt-1">
          {service.duration > 0 && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" />{service.duration} min
            </span>
          )}
          <a href={waUrl} target="_blank" rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-white bg-[#e91e8c] hover:bg-[#c91578] px-3 py-1.5 rounded-full transition-colors">
            <SiWhatsapp className="w-3 h-3" />Réserver
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Squad section ──────────────────────────────────────────────────────────────
function SquadSection({ staff, phone, salonName, onSelectStaff }: {
  staff: Staff[];
  phone: string;
  salonName: string;
  onSelectStaff: (s: Staff) => void;
}) {
  if (!staff.length) return null;

  return (
    <section id="squad" className="py-16 px-4 bg-[#1a0a12]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-bold tracking-[0.25em] text-[#e8a87c] uppercase mb-2">LES ARTISTES</p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-white">
            The <span className="text-[#e91e8c] italic">Squad</span>
          </h2>
          <p className="text-gray-400 text-sm mt-3">Sélectionnez une artiste pour réserver directement avec elle</p>
        </div>

        <div className={cn(
          "grid gap-6",
          staff.length === 1 ? "grid-cols-1 max-w-xs mx-auto" :
          staff.length === 2 ? "grid-cols-1 sm:grid-cols-2 max-w-lg mx-auto" :
          "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        )}>
          {staff.map((member, idx) => {
            const bookMsg = `Bonjour ${salonName} 💕\n\nJe souhaite réserver un rendez-vous avec *${member.name}*.\nPouvez-vous me proposer les services disponibles ? Merci 🌸`;
            const bookUrl = buildWaUrl(phone, bookMsg);
            return (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1, duration: 0.45 }}
                className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col items-center text-center gap-4 hover:border-[#e91e8c]/40 hover:bg-white/8 transition-all group cursor-pointer"
                onClick={() => onSelectStaff(member)}
              >
                <div className="relative">
                  <div className="w-24 h-24 rounded-full overflow-hidden ring-2 ring-white/10 group-hover:ring-[#e91e8c]/60 transition-all">
                    <StaffAvatar staff={member} size="lg" />
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-white font-bold text-lg">{member.name}</h3>
                  {member.categories?.length ? (
                    <p className="text-[#e8a87c] text-xs font-semibold uppercase tracking-wider">
                      {member.categories.join(" · ")}
                    </p>
                  ) : null}
                </div>

                <a
                  href={bookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="inline-flex items-center gap-2 bg-[#e91e8c] hover:bg-[#c91578] text-white font-bold px-5 py-2 rounded-full text-sm transition-all shadow-lg shadow-pink-900/30 hover:scale-[1.04]"
                >
                  <SiWhatsapp className="w-4 h-4" />
                  Réserver avec {member.name.split(" ")[0]}
                </a>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Gallery section ────────────────────────────────────────────────────────────
function GallerySection({ services }: { services: Service[] }) {
  const withImages = services.filter(s => s.imageUrl).slice(0, 6);
  if (!withImages.length) return null;

  return (
    <section id="gallery" className="py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs font-bold tracking-[0.25em] text-[#e91e8c] uppercase mb-2">GALERIE</p>
          <h2 className="text-3xl font-extrabold text-[#1a0a12]">
            Nos <span className="text-[#e91e8c] italic">Réalisations</span>
          </h2>
          <p className="text-gray-500 text-sm mt-2">Un espace conçu pour le luxe, le confort et de superbes transformations.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {withImages.map((s, idx) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.07, duration: 0.4 }}
              className={cn(
                "relative overflow-hidden rounded-2xl group",
                idx === 0 ? "col-span-2 row-span-2 md:h-72" : "h-40"
              )}
            >
              <img src={s.imageUrl!} alt={s.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="absolute bottom-0 left-0 right-0 text-white text-xs font-semibold text-center py-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {s.name}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Testimonial modal ──────────────────────────────────────────────────────────
function TestimonialModal({
  initial, onSave, onClose, uploading, onPhotoUpload,
}: {
  initial?: Partial<TestimonialFormData>;
  onSave: (d: TestimonialFormData) => void;
  onClose: () => void;
  uploading: boolean;
  onPhotoUpload: (file: File) => void;
}) {
  const [form, setForm] = useState<TestimonialFormData>({
    clientName: initial?.clientName ?? "",
    clientPhotoUrl: initial?.clientPhotoUrl ?? "",
    serviceName: initial?.serviceName ?? "",
    rating: initial?.rating ?? 5,
    text: initial?.text ?? "",
    isVisible: initial?.isVisible ?? true,
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof TestimonialFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-lg text-[#1a0a12]">
          {initial ? "Modifier l'avis" : "Ajouter un avis"}
        </h3>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-pink-50 border-2 border-pink-200 overflow-hidden flex items-center justify-center cursor-pointer flex-shrink-0 relative"
            onClick={() => fileRef.current?.click()}>
            {form.clientPhotoUrl ? (
              <img src={form.clientPhotoUrl} alt="" className="w-full h-full object-cover" />
            ) : <Camera className="text-pink-300 w-6 h-6" />}
            {uploading && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700">Photo cliente</p>
            <button type="button" onClick={() => fileRef.current?.click()} className="text-xs text-[#e91e8c] hover:underline">
              {form.clientPhotoUrl ? "Changer la photo" : "Ajouter une photo"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onPhotoUpload(f); e.target.value = ""; }} />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">URL photo (optionnel)</label>
          <input className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-pink-400"
            value={form.clientPhotoUrl} onChange={e => setForm(f => ({ ...f, clientPhotoUrl: e.target.value }))} placeholder="https://..." />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">Nom de la cliente *</label>
          <input className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-pink-400"
            value={form.clientName} onChange={set("clientName")} placeholder="Fatima Z." />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">Service (optionnel)</label>
          <input className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-pink-400"
            value={form.serviceName} onChange={set("serviceName")} placeholder="Pose gel complète" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">Note</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" onClick={() => setForm(f => ({ ...f, rating: n }))}>
                <svg viewBox="0 0 20 20" fill={n <= form.rating ? "#f59e0b" : "#d1d5db"} className="w-6 h-6">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">Témoignage *</label>
          <textarea className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-pink-400 resize-none"
            rows={3} value={form.text} onChange={set("text") as any} placeholder="Super service, résultat impeccable !" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.isVisible}
            onChange={e => setForm(f => ({ ...f, isVisible: e.target.checked }))} className="accent-pink-500 w-4 h-4" />
          <span className="text-sm text-gray-600">Visible sur la page</span>
        </label>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button type="button" onClick={() => { if (!form.clientName.trim() || !form.text.trim()) return; onSave(form); }}
            className="flex-1 py-2.5 rounded-xl bg-[#e91e8c] text-white text-sm font-semibold hover:bg-[#c91578] transition-colors">
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Testimonial card ───────────────────────────────────────────────────────────
function TestimonialCard({
  t, editMode, onEdit, onDelete, onToggleVisibility,
}: {
  t: WebsiteTestimonial; editMode: boolean;
  onEdit: () => void; onDelete: () => void; onToggleVisibility: () => void;
}) {
  return (
    <div className={cn("bg-white rounded-2xl p-5 shadow-sm border border-pink-100/50 space-y-3 transition-opacity", !t.isVisible && "opacity-50")}>
      {editMode && (
        <div className="flex items-center justify-end gap-1 -mt-1 -mb-1">
          <button onClick={onToggleVisibility} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            {t.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-pink-50 text-gray-400 hover:text-[#e91e8c] transition-colors">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
      <Stars count={t.rating} />
      <p className="text-gray-600 text-sm leading-relaxed italic">&ldquo;{t.text}&rdquo;</p>
      <div className="flex items-center gap-2.5 pt-2 border-t border-gray-50">
        {t.clientPhotoUrl ? (
          <img src={t.clientPhotoUrl} alt={t.clientName} className="w-9 h-9 rounded-full object-cover border border-pink-100" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-sm font-bold">
            {t.clientName.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <p className="font-bold text-[#1a0a12] text-sm">{t.clientName}</p>
          {t.serviceName && <p className="text-xs text-[#e91e8c]">{t.serviceName}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Website() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [editMode, setEditMode] = useState(false);
  const [testimonialModal, setTestimonialModal] = useState<null | "add" | WebsiteTestimonial>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [pendingPhotoUrl, setPendingPhotoUrl] = useState("");

  const canEdit = isOwnerLoggedIn();
  const qc = useQueryClient();

  // Refs for in-page nav
  const heroRef = useRef<HTMLDivElement>(null);
  const servicesRef = useRef<HTMLDivElement>(null);
  const squadRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const contactRef = useRef<HTMLDivElement>(null);
  const scrollTo = (ref: React.RefObject<HTMLDivElement>) =>
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // ── Data fetching ────────────────────────────────────────────────────────────
  const { data: websiteData } = useQuery<{ settings: BusinessSettings; services: Service[] }>({
    queryKey: ["/api/public/website"],
    queryFn: () => fetch("/api/public/website").then(r => r.json()),
    staleTime: 60 * 1000,
  });

  const { data: staffList = [] } = useQuery<Staff[]>({
    queryKey: ["/api/public/staff"],
    queryFn: () => apiFetch("/api/public/staff").then(normalizeStaff).catch(() => []),
    staleTime: 5 * 60 * 1000,
  });

  const { data: testimonials = [] } = useQuery<WebsiteTestimonial[]>({
    queryKey: editMode ? ["/api/website-testimonials"] : ["/api/public/website-testimonials"],
    queryFn: () => apiFetch(editMode ? "/api/website-testimonials" : "/api/public/website-testimonials").catch(() => []),
    staleTime: 30 * 1000,
  });

  const settings = websiteData?.settings;
  const services = websiteData?.services ?? [];
  const salonName = settings?.businessName || "PREGA SQUAD";
  const phone = settings?.phone || "";
  const currency = settings?.currencySymbol || "MAD";
  const categories = Array.from(new Set(services.map(s => s.category || "Autres")));
  const filteredServices = activeCategory === "all" ? services : services.filter(s => (s.category || "Autres") === activeCategory);
  const tickerNames = services.map(s => s.name);

  // Default book URL (no staff selected)
  const defaultBookUrl = buildWaUrl(phone, `Bonjour ${salonName} 💕\nJe souhaite réserver un rendez-vous, merci !`);

  // ── Staff-specific booking ────────────────────────────────────────────────────
  const handleBookStaff = useCallback((staff: Staff) => {
    const msg = `Bonjour ${salonName} 💕\n\nJe souhaite réserver un rendez-vous avec *${staff.name}*.\nPouvez-vous me proposer les services disponibles ? Merci 🌸`;
    const url = buildWaUrl(phone, msg);
    window.open(url, "_blank", "noopener,noreferrer");
  }, [phone, salonName]);

  const handleSelectStaff = useCallback((staff: Staff) => {
    handleBookStaff(staff);
  }, [handleBookStaff]);

  // ── Mutations ────────────────────────────────────────────────────────────────
  const addTestimonialMut = useMutation({
    mutationFn: (data: TestimonialFormData) =>
      apiFetch("/api/website-testimonials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/website-testimonials"] }); qc.invalidateQueries({ queryKey: ["/api/public/website-testimonials"] }); setTestimonialModal(null); },
  });
  const updateTestimonialMut = useMutation({
    mutationFn: ({ id, ...data }: TestimonialFormData & { id: number }) =>
      apiFetch(`/api/website-testimonials/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/website-testimonials"] }); qc.invalidateQueries({ queryKey: ["/api/public/website-testimonials"] }); setTestimonialModal(null); },
  });
  const deleteTestimonialMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/website-testimonials/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/website-testimonials"] }); qc.invalidateQueries({ queryKey: ["/api/public/website-testimonials"] }); },
  });
  const toggleVisibilityMut = useMutation({
    mutationFn: ({ id, isVisible }: { id: number; isVisible: boolean }) =>
      apiFetch(`/api/website-testimonials/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isVisible }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/website-testimonials"] }); },
  });

  const handleServiceImageUpload = useCallback(async (serviceId: number, file: File) => {
    const fd = new FormData();
    fd.append("image", file);
    try {
      await fetch(`/api/services/${serviceId}/website-image`, { method: "POST", body: fd, credentials: "include" });
      qc.invalidateQueries({ queryKey: ["/api/public/website"] });
    } catch (e) { console.error(e); }
  }, [qc]);

  const handleTestimonialPhotoUpload = useCallback(async (file: File) => {
    setPhotoUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const data = await apiFetch("/api/website-testimonials/upload-photo", { method: "POST", body: fd });
      setPendingPhotoUrl(data.photoUrl || "");
    } catch { } finally { setPhotoUploading(false); }
  }, []);

  const handleSaveTestimonial = useCallback((data: TestimonialFormData) => {
    const payload = { ...data, clientPhotoUrl: pendingPhotoUrl || data.clientPhotoUrl };
    if (testimonialModal === "add") {
      addTestimonialMut.mutate(payload);
    } else if (testimonialModal && typeof testimonialModal === "object") {
      updateTestimonialMut.mutate({ ...payload, id: testimonialModal.id });
    }
    setPendingPhotoUrl("");
  }, [testimonialModal, pendingPhotoUrl, addTestimonialMut, updateTestimonialMut]);

  const visibleTestimonials = editMode ? testimonials : testimonials.filter(t => t.isVisible);

  return (
    <div className="relative bg-white min-h-full overflow-y-auto" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`@keyframes ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-33.333%)} }`}</style>

      {/* ── Edit mode banner ──────────────────────────────────────────────────── */}
      {canEdit && (
        <div className={cn(
          "sticky top-0 z-50 flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold transition-colors",
          editMode ? "bg-[#1a0a12] text-white" : "bg-white/90 backdrop-blur-sm border-b border-pink-100 text-gray-600"
        )}>
          <div className="flex items-center gap-2">
            <Pencil className={cn("w-4 h-4", editMode ? "text-pink-400" : "text-gray-400")} />
            {editMode ? (
              <span>Mode édition <span className="font-normal text-pink-300 ml-1">— survolez les cartes pour modifier</span></span>
            ) : (
              <span className="text-gray-500">Mode aperçu du site</span>
            )}
          </div>
          <button
            onClick={() => setEditMode(e => !e)}
            className={cn("px-4 py-1.5 rounded-full text-xs font-bold transition-all",
              editMode ? "bg-pink-500 hover:bg-pink-400 text-white" : "bg-[#1a0a12] hover:bg-[#2d1520] text-white"
            )}
          >
            {editMode ? "✓ Quitter l'édition" : "✏️ Modifier le site"}
          </button>
        </div>
      )}

      {/* ── Sticky nav ────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-pink-100/50 shadow-sm" style={{ top: canEdit ? "44px" : "0" }}>
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <img src="/logo.png" alt={salonName} className="w-8 h-8 rounded-full object-contain" />
            <span className="font-bold text-[#e91e8c] text-sm hidden sm:block">{salonName}</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
            <button onClick={() => scrollTo(servicesRef)} className="hover:text-[#e91e8c] transition-colors">Services</button>
            <button onClick={() => scrollTo(squadRef)} className="hover:text-[#e91e8c] transition-colors">The Squad</button>
            <button onClick={() => scrollTo(galleryRef)} className="hover:text-[#e91e8c] transition-colors">Galerie</button>
            <button onClick={() => scrollTo(contactRef)} className="hover:text-[#e91e8c] transition-colors">Contact</button>
          </div>
          <a href={defaultBookUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-[#e91e8c] hover:bg-[#c91578] text-white text-xs font-bold px-4 py-2 rounded-full transition-colors">
            <SiWhatsapp className="w-3.5 h-3.5" />Réserver
          </a>
        </div>
      </nav>

      {/* ── Animated Staff Hero (Website1 design) ─────────────────────────────── */}
      <div ref={heroRef}>
        {staffList.length > 0 ? (
          <StaffHero
            staff={staffList}
            phone={phone}
            salonName={salonName}
            onBookStaff={handleBookStaff}
          />
        ) : (
          /* Fallback hero when no staff yet */
          <section className="relative overflow-hidden">
            <div className="max-w-6xl mx-auto px-4 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 bg-white/80 border border-pink-100 rounded-full px-4 py-1.5 text-xs font-semibold text-[#e91e8c] tracking-wider uppercase shadow-sm">
                  <span>✦</span>BEAUTY SALON | HAIR &amp; NAILS | AGADIR
                </div>
                <h1 className="text-4xl md:text-5xl font-extrabold leading-tight text-[#1a0a12]">
                  Your beauty,<br /><span className="text-[#e91e8c] italic">our passion.</span>
                </h1>
                <p className="text-gray-500 text-base leading-relaxed max-w-md">
                  Ongles, coiffure, maquillage et soins du visage à Agadir. Une équipe passionnée et un résultat qui vous ressemble.
                </p>
                <a href={defaultBookUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-[#e91e8c] hover:bg-[#c91578] text-white font-bold px-6 py-3 rounded-full transition-all shadow-lg shadow-pink-200 hover:scale-[1.02] text-sm">
                  <SiWhatsapp className="w-5 h-5" />Réserver un rendez-vous
                </a>
              </div>
              <div className="relative flex items-center justify-center">
                <div className="w-64 h-72 rounded-[2.5rem] overflow-hidden shadow-2xl bg-gradient-to-br from-pink-100 to-rose-200 flex items-center justify-center text-6xl">
                  💅
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* ── Ticker ────────────────────────────────────────────────────────────── */}
      <ServiceTicker names={tickerNames.length > 0 ? tickerNames : ["Maquillage", "Coiffure", "Ongles", "Soins du visage", "Extensions de cils", "Nail art", "Manucure"]} />

      {/* ── Services ──────────────────────────────────────────────────────────── */}
      <section ref={servicesRef} id="services" className="py-16 px-4 bg-gradient-to-br from-pink-50/50 via-white to-rose-50/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 space-y-2">
            <p className="text-xs font-bold tracking-[0.2em] text-[#e91e8c] uppercase">NOS PRESTATIONS</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#1a0a12]">
              Services &amp; <span className="text-[#c8a951] italic">Tarifs</span>
            </h2>
            {editMode && (
              <p className="text-xs text-pink-400 bg-pink-50 inline-block px-3 py-1 rounded-full">
                Survolez une carte pour changer son image
              </p>
            )}
          </div>
          {categories.length > 1 && (
            <div className="flex flex-wrap justify-center gap-2 mb-8">
              <CategoryPill label="Tout" active={activeCategory === "all"} onClick={() => setActiveCategory("all")} />
              {categories.map(cat => (
                <CategoryPill key={cat} label={cat} active={activeCategory === cat} onClick={() => setActiveCategory(cat)} />
              ))}
            </div>
          )}
          {filteredServices.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredServices.map(s => (
                <ServiceCard key={s.id} service={s} phone={phone} salonName={salonName} currency={currency}
                  editMode={editMode} onImageUpload={handleServiceImageUpload} />
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

      {/* ── The Squad ─────────────────────────────────────────────────────────── */}
      <div ref={squadRef}>
        <SquadSection staff={staffList} phone={phone} salonName={salonName} onSelectStaff={handleSelectStaff} />
      </div>

      {/* ── About salon ───────────────────────────────────────────────────────── */}
      <section className="py-16 px-4 bg-gradient-to-br from-pink-50 to-rose-50">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-5">
            <p className="text-xs font-bold tracking-[0.2em] text-[#e91e8c] uppercase">LE SALON</p>
            <h2 className="text-3xl font-extrabold text-[#1a0a12]">
              Un espace dédié à<br /><span className="text-[#e91e8c]">votre beauté</span>
            </h2>
            <p className="text-gray-500 leading-relaxed text-sm">
              {salonName} est votre refuge beauté à Agadir. Nous proposons des prestations haut de gamme dans une ambiance chaleureuse et élégante.
            </p>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="bg-white rounded-2xl p-4 border border-pink-100 shadow-sm">
                <div className="text-2xl font-extrabold text-[#e91e8c]">{services.length}+</div>
                <div className="text-xs text-gray-400 mt-1">Prestations disponibles</div>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-pink-100 shadow-sm">
                <div className="text-2xl font-extrabold text-[#e91e8c]">5★</div>
                <div className="text-xs text-gray-400 mt-1">Note client Google</div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {[
              { icon: "💎", title: "Produits professionnels", desc: "Uniquement des produits de haute qualité pour des résultats durables." },
              { icon: "✨", title: "Expertise & passion", desc: "Notre équipe se forme continuellement aux dernières tendances beauté." },
              { icon: "🤍", title: "Votre satisfaction", desc: "Votre confort et votre satisfaction sont notre priorité absolue." },
            ].map(item => (
              <div key={item.title} className="flex gap-4 bg-white rounded-2xl p-4 border border-pink-100/50 shadow-sm hover:border-pink-300/50 transition-colors">
                <span className="text-2xl shrink-0">{item.icon}</span>
                <div>
                  <p className="font-bold text-[#1a0a12] text-sm">{item.title}</p>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Gallery ───────────────────────────────────────────────────────────── */}
      <div ref={galleryRef}>
        <GallerySection services={services} />
      </div>

      {/* ── Testimonials ──────────────────────────────────────────────────────── */}
      <section className="py-16 px-4 bg-gradient-to-br from-pink-50/50 to-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 space-y-2">
            <p className="text-xs font-bold tracking-[0.2em] text-[#e91e8c] uppercase">AVIS CLIENTS</p>
            <h2 className="text-3xl font-extrabold text-[#1a0a12]">
              Ce que disent nos <span className="text-[#e91e8c] italic">clientes</span>
            </h2>
          </div>
          {visibleTestimonials.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {visibleTestimonials.map(t => (
                <TestimonialCard key={t.id} t={t} editMode={editMode}
                  onEdit={() => { setPendingPhotoUrl(""); setTestimonialModal(t); }}
                  onDelete={() => { if (confirm("Supprimer cet avis ?")) deleteTestimonialMut.mutate(t.id); }}
                  onToggleVisibility={() => toggleVisibilityMut.mutate({ id: t.id, isVisible: !t.isVisible })} />
              ))}
              {editMode && (
                <button onClick={() => { setPendingPhotoUrl(""); setTestimonialModal("add"); }}
                  className="rounded-2xl border-2 border-dashed border-pink-200 hover:border-[#e91e8c] bg-pink-50/50 hover:bg-pink-50 transition-all flex flex-col items-center justify-center gap-2 text-[#e91e8c] min-h-[180px] p-5">
                  <Plus className="w-8 h-8" />
                  <span className="text-sm font-semibold">Ajouter un avis</span>
                </button>
              )}
            </div>
          ) : editMode ? (
            <div className="flex justify-center">
              <button onClick={() => { setPendingPhotoUrl(""); setTestimonialModal("add"); }}
                className="rounded-2xl border-2 border-dashed border-pink-200 hover:border-[#e91e8c] bg-pink-50/50 hover:bg-pink-50 transition-all flex flex-col items-center justify-center gap-2 text-[#e91e8c] w-72 min-h-[180px] p-5">
                <Plus className="w-8 h-8" />
                <span className="text-sm font-semibold">Ajouter le premier avis</span>
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Contact & Hours ───────────────────────────────────────────────────── */}
      <section ref={contactRef} id="visit" className="py-16 px-4 bg-[#1a0a12]">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-5">
            <p className="text-xs font-bold tracking-[0.2em] text-[#e8a87c] uppercase">CONTACT &amp; HORAIRES</p>
            <h2 className="text-3xl font-extrabold text-white">Prête à vous sublimer ?</h2>
            <p className="text-gray-400 text-sm leading-relaxed">Réservez directement via WhatsApp ou venez nous rendre visite.</p>
            <div className="space-y-3">
              {phone && (
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"><SiWhatsapp className="w-4 h-4 text-[#25d366]" /></div>
                  <span>{phone}</span>
                </div>
              )}
              {settings?.address && (
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"><MapPin className="w-4 h-4 text-[#e91e8c]" /></div>
                  <span>{settings.address}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm text-gray-300">
                <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"><Clock className="w-4 h-4 text-[#e91e8c]" /></div>
                <span>{fmtDays(settings?.workingDays)} · {settings?.openingTime || "09:00"} – {settings?.closingTime || "19:00"}</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl p-8 text-center space-y-5 shadow-2xl"
            style={{ background: "linear-gradient(145deg,#f472b6 0%,#ec4899 40%,#db2777 100%)" }}>
            <div className="w-16 h-16 mx-auto rounded-full bg-white/20 flex items-center justify-center">
              <SiWhatsapp className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-extrabold text-white">Réserver maintenant</h3>
            <p className="text-pink-100 text-sm leading-relaxed">
              Envoyez un message WhatsApp et réservez en quelques secondes.
            </p>

            {/* Staff quick-select */}
            {staffList.length > 0 && (
              <div className="space-y-2">
                <p className="text-pink-200 text-xs font-semibold uppercase tracking-wider">Choisir une artiste</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {staffList.map(member => {
                    const msg = `Bonjour ${salonName} 💕\n\nJe souhaite réserver un rendez-vous avec *${member.name}*.\nPouvez-vous me proposer les services disponibles ? Merci 🌸`;
                    const url = buildWaUrl(phone, msg);
                    return (
                      <a key={member.id} href={url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-full transition-all border border-white/20 hover:border-white/40">
                        <div className="w-5 h-5 rounded-full overflow-hidden shrink-0">
                          <StaffAvatar staff={member} size="sm" />
                        </div>
                        {member.name.split(" ")[0]}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            <a href={defaultBookUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white text-[#e91e8c] font-bold px-8 py-3 rounded-full hover:scale-[1.03] transition-transform shadow-lg text-sm">
              <SiWhatsapp className="text-[#25d366] w-4 h-4" />Envoyer un message
            </a>
            {settings?.mapsLink && (
              <div className="pt-1">
                <a href={settings.mapsLink} target="_blank" rel="noopener noreferrer"
                  className="text-pink-100 text-xs hover:text-white transition-colors underline underline-offset-2">
                  📍 Voir sur Google Maps
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <footer className="bg-[#0f0608] py-10 px-4">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-5 text-center">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt={salonName} className="w-10 h-10 rounded-full object-contain" />
            <span className="text-pink-400 font-bold text-lg">{salonName}</span>
          </div>
          <p className="text-gray-500 text-xs">Beauty Salon · Agadir, Maroc</p>
          <div className="flex items-center gap-4">
            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer"
              className="w-9 h-9 rounded-full bg-white/5 hover:bg-[#e91e8c]/20 border border-white/10 hover:border-[#e91e8c]/40 flex items-center justify-center transition-all">
              <Instagram className="w-4 h-4 text-gray-400 hover:text-[#e91e8c]" />
            </a>
            <a href="https://tiktok.com" target="_blank" rel="noopener noreferrer"
              className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-all">
              <SiTiktok className="w-4 h-4 text-gray-400" />
            </a>
            {phone && (
              <a href={defaultBookUrl} target="_blank" rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-[#25d366]/10 hover:bg-[#25d366]/20 border border-[#25d366]/20 flex items-center justify-center transition-all">
                <SiWhatsapp className="w-4 h-4 text-[#25d366]" />
              </a>
            )}
          </div>
          <p className="text-gray-600 text-xs">© {new Date().getFullYear()} {salonName} · Tous droits réservés</p>
        </div>
      </footer>

      {/* ── Floating WhatsApp button ───────────────────────────────────────────── */}
      <a href={defaultBookUrl} target="_blank" rel="noopener noreferrer"
        className="fixed bottom-24 right-4 z-40 w-12 h-12 rounded-full bg-[#25d366] flex items-center justify-center shadow-lg hover:scale-110 transition-transform md:bottom-6"
        title="Réserver sur WhatsApp">
        <SiWhatsapp className="w-6 h-6 text-white" />
      </a>

      {/* ── Testimonial modal ──────────────────────────────────────────────────── */}
      {testimonialModal && (
        <TestimonialModal
          initial={testimonialModal !== "add" ? {
            clientName: testimonialModal.clientName,
            clientPhotoUrl: testimonialModal.clientPhotoUrl || "",
            serviceName: testimonialModal.serviceName || "",
            rating: testimonialModal.rating,
            text: testimonialModal.text,
            isVisible: testimonialModal.isVisible,
          } : undefined}
          onSave={handleSaveTestimonial}
          onClose={() => { setTestimonialModal(null); setPendingPhotoUrl(""); }}
          uploading={photoUploading}
          onPhotoUpload={file => { handleTestimonialPhotoUpload(file); }}
        />
      )}
    </div>
  );
}
