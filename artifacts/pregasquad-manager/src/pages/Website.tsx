import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────
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

// ── Auth helpers ─────────────────────────────────────────────────────────────
function isOwnerLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  const auth = sessionStorage.getItem("user_authenticated") === "true"
    || localStorage.getItem("user_authenticated") === "true";
  if (!auth) return false;
  const role = sessionStorage.getItem("current_user_role")
    || localStorage.getItem("current_user_role") || "";
  // owners and managers can edit; also check admin_settings permission
  if (role === "owner" || role === "manager") return true;
  try {
    const perms: string[] = JSON.parse(
      sessionStorage.getItem("current_user_permissions")
      || localStorage.getItem("current_user_permissions") || "[]"
    );
    return perms.includes("admin_settings");
  } catch { return false; }
}

// ── Fetch helpers ────────────────────────────────────────────────────────────
async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...init });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ── WhatsApp URL ─────────────────────────────────────────────────────────────
function buildWaUrl(phone = "", message = "") {
  let n = phone.replace(/[^0-9]/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("0") && n.length === 10) n = "212" + n.slice(1);
  if (n.length === 9) n = "212" + n;
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}

// ── Day helpers ───────────────────────────────────────────────────────────────
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

// ── Icons ─────────────────────────────────────────────────────────────────────
function WAIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cn("w-4 h-4", className)}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cn("w-4 h-4", className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z" />
    </svg>
  );
}
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cn("w-4 h-4", className)}>
      <circle cx={12} cy={12} r={10} /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cn("w-4 h-4", className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cn("w-5 h-5", className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <circle cx={12} cy={13} r={3} />
    </svg>
  );
}
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cn("w-4 h-4", className)}>
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cn("w-4 h-4", className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cn("w-4 h-4", className)}>
      <polyline points="3 6 5 6 21 6" /><path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path strokeLinecap="round" strokeLinejoin="round" d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  );
}
function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cn("w-4 h-4", className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}
function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cn("w-4 h-4", className)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}
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

// ── Scrolling ticker ──────────────────────────────────────────────────────────
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

// ── Category pill ─────────────────────────────────────────────────────────────
function CategoryPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn(
      "px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap",
      active ? "bg-[#e91e8c] text-white shadow-md shadow-pink-200" : "bg-white text-gray-600 border border-gray-200 hover:border-pink-200 hover:text-[#e91e8c]"
    )}>{label}</button>
  );
}

// ── Service card ──────────────────────────────────────────────────────────────
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
      {/* Image area */}
      <div className="relative w-full h-40 bg-gradient-to-br from-pink-50 to-rose-100 flex-shrink-0">
        {service.imageUrl ? (
          <img src={service.imageUrl} alt={service.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">
            {service.emoji || "💅"}
          </div>
        )}
        {/* Edit overlay */}
        {editMode && (
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white gap-1"
            title="Changer l'image"
          >
            <CameraIcon className="w-7 h-7" />
            <span className="text-xs font-semibold">Changer l&apos;image</span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) onImageUpload(service.id, file);
            e.target.value = "";
          }}
        />
        {/* Price badge */}
        <span className="absolute top-2 right-2 font-bold text-xs px-2.5 py-1 rounded-full bg-white text-[#e91e8c] shadow border border-pink-100">
          {displayPrice}
        </span>
      </div>

      {/* Body */}
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
              <ClockIcon />{service.duration} min
            </span>
          )}
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-white bg-[#e91e8c] hover:bg-[#c91578] px-3 py-1.5 rounded-full transition-colors"
          >
            <WAIcon />Réserver
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Testimonial form (add / edit) ─────────────────────────────────────────────
interface TestimonialFormData {
  clientName: string;
  clientPhotoUrl: string;
  serviceName: string;
  rating: number;
  text: string;
  isVisible: boolean;
}

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
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-bold text-lg text-[#1a0a12]">
          {initial ? "Modifier l'avis" : "Ajouter un avis"}
        </h3>

        {/* Photo */}
        <div className="flex items-center gap-3">
          <div
            className="w-14 h-14 rounded-full bg-pink-50 border-2 border-pink-200 overflow-hidden flex items-center justify-center cursor-pointer flex-shrink-0 relative"
            onClick={() => fileRef.current?.click()}
          >
            {form.clientPhotoUrl ? (
              <img src={form.clientPhotoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <CameraIcon className="text-pink-300 w-6 h-6" />
            )}
            {uploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700">Photo cliente</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-xs text-[#e91e8c] hover:underline"
            >
              {form.clientPhotoUrl ? "Changer la photo" : "Ajouter une photo"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onPhotoUpload(f); e.target.value = ""; }} />
          </div>
        </div>

        {/* URL fallback */}
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">URL photo (optionnel)</label>
          <input
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-pink-400"
            value={form.clientPhotoUrl}
            onChange={e => setForm(f => ({ ...f, clientPhotoUrl: e.target.value }))}
            placeholder="https://..."
          />
        </div>

        {/* Name */}
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">Nom de la cliente *</label>
          <input
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-pink-400"
            value={form.clientName}
            onChange={set("clientName")}
            placeholder="Fatima Z."
          />
        </div>

        {/* Service */}
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">Service (optionnel)</label>
          <input
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-pink-400"
            value={form.serviceName}
            onChange={set("serviceName")}
            placeholder="Pose gel complète"
          />
        </div>

        {/* Stars */}
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

        {/* Text */}
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">Témoignage *</label>
          <textarea
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-pink-400 resize-none"
            rows={3}
            value={form.text}
            onChange={set("text") as any}
            placeholder="Super service, résultat impeccable !"
          />
        </div>

        {/* Visibility */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isVisible}
            onChange={e => setForm(f => ({ ...f, isVisible: e.target.checked }))}
            className="accent-pink-500 w-4 h-4"
          />
          <span className="text-sm text-gray-600">Visible sur la page</span>
        </label>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => {
              if (!form.clientName.trim() || !form.text.trim()) return;
              onSave(form);
            }}
            className="flex-1 py-2.5 rounded-xl bg-[#e91e8c] text-white text-sm font-semibold hover:bg-[#c91578] transition-colors"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Testimonial display card ──────────────────────────────────────────────────
function TestimonialCard({
  t, editMode, onEdit, onDelete, onToggleVisibility,
}: {
  t: WebsiteTestimonial; editMode: boolean;
  onEdit: () => void; onDelete: () => void; onToggleVisibility: () => void;
}) {
  return (
    <div className={cn(
      "bg-white rounded-2xl p-5 shadow-sm border border-pink-100/50 space-y-3 transition-opacity",
      !t.isVisible && "opacity-50"
    )}>
      {editMode && (
        <div className="flex items-center justify-end gap-1 -mt-1 -mb-1">
          <button onClick={onToggleVisibility} title={t.isVisible ? "Masquer" : "Afficher"}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            {t.isVisible ? <EyeIcon /> : <EyeOffIcon />}
          </button>
          <button onClick={onEdit} title="Modifier"
            className="p-1.5 rounded-lg hover:bg-pink-50 text-gray-400 hover:text-[#e91e8c] transition-colors">
            <PencilIcon />
          </button>
          <button onClick={onDelete} title="Supprimer"
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
            <TrashIcon />
          </button>
        </div>
      )}
      <Stars count={t.rating} />
      <p className="text-gray-600 text-sm leading-relaxed italic">&ldquo;{t.text}&rdquo;</p>
      <div className="flex items-center gap-2.5 pt-2 border-t border-gray-50">
        {t.clientPhotoUrl ? (
          <img src={t.clientPhotoUrl} alt={t.clientName}
            className="w-9 h-9 rounded-full object-cover border border-pink-100" />
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Website() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [editMode, setEditMode] = useState(false);
  const [testimonialModal, setTestimonialModal] = useState<null | "add" | WebsiteTestimonial>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [pendingPhotoUrl, setPendingPhotoUrl] = useState("");

  const canEdit = isOwnerLoggedIn();
  const qc = useQueryClient();

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: websiteData } = useQuery<{ settings: BusinessSettings; services: Service[] }>({
    queryKey: ["/api/public/website"],
    queryFn: () => fetch("/api/public/website").then(r => r.json()),
    staleTime: 60 * 1000,
  });

  // Fetch all testimonials (including hidden) when in edit mode, public only otherwise
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
  const waBookUrl = buildWaUrl(phone, `Bonjour ${salonName} 💕\nJe souhaite réserver un rendez-vous, merci !`);

  // ── Mutations ──────────────────────────────────────────────────────────────
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

  // ── Handlers ───────────────────────────────────────────────────────────────
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

  // ── Refs for in-page nav ───────────────────────────────────────────────────
  const servicesRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const contactRef = useRef<HTMLDivElement>(null);
  const scrollTo = (ref: React.RefObject<HTMLDivElement>) =>
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const visibleTestimonials = editMode ? testimonials : testimonials.filter(t => t.isVisible);

  return (
    <div className="relative bg-gradient-to-br from-pink-50 via-white to-rose-50 min-h-full overflow-y-auto" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`@keyframes ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-33.333%)} }`}</style>

      {/* ── Edit mode banner ───────────────────────────────────────────────── */}
      {canEdit && (
        <div className={cn(
          "sticky top-0 z-50 flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold transition-colors",
          editMode ? "bg-[#1a0a12] text-white" : "bg-white/90 backdrop-blur-sm border-b border-pink-100 text-gray-600"
        )}>
          <div className="flex items-center gap-2">
            <PencilIcon className={editMode ? "text-pink-400" : "text-gray-400"} />
            {editMode ? (
              <span>Mode édition <span className="font-normal text-pink-300 ml-1">— survolez les éléments pour les modifier</span></span>
            ) : (
              <span className="text-gray-500">Vous êtes connecté(e) en tant que propriétaire</span>
            )}
          </div>
          <button
            onClick={() => setEditMode(e => !e)}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-bold transition-all",
              editMode
                ? "bg-pink-500 hover:bg-pink-400 text-white"
                : "bg-[#1a0a12] hover:bg-[#2d1520] text-white"
            )}
          >
            {editMode ? "✓ Quitter l'édition" : "✏️ Modifier le site"}
          </button>
        </div>
      )}

      {/* ── Floating WhatsApp button ───────────────────────────────────────── */}
      <a href={waBookUrl} target="_blank" rel="noopener noreferrer"
        className="fixed bottom-24 right-4 z-40 w-12 h-12 rounded-full bg-[#25d366] flex items-center justify-center shadow-lg hover:scale-110 transition-transform md:bottom-6"
        title="Réserver sur WhatsApp">
        <WAIcon className="w-6 h-6 text-white" />
      </a>

      {/* ── In-page sticky nav ─────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-pink-100/50 shadow-sm" style={{ top: canEdit ? "40px" : "0" }}>
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <img src="/logo.png" alt={salonName} className="w-8 h-8 rounded-full object-contain" />
            <span className="font-bold text-[#e91e8c] text-sm hidden sm:block">{salonName}</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
            <button onClick={() => scrollTo(servicesRef)} className="hover:text-[#e91e8c] transition-colors">Services</button>
            <button onClick={() => scrollTo(aboutRef)} className="hover:text-[#e91e8c] transition-colors">Le salon</button>
            <button onClick={() => scrollTo(contactRef)} className="hover:text-[#e91e8c] transition-colors">Contact</button>
          </div>
          <a href={waBookUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-[#e91e8c] hover:bg-[#c91578] text-white text-xs font-bold px-4 py-2 rounded-full transition-colors">
            <WAIcon />Réserver
          </a>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
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
              Ongles, coiffure, maquillage et soins du visage à Agadir. Une équipe passionnée, des produits professionnels et un résultat qui vous ressemble.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href={waBookUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 bg-[#e91e8c] hover:bg-[#c91578] text-white font-bold px-6 py-3 rounded-full transition-all shadow-lg shadow-pink-200 hover:scale-[1.02] text-sm">
                <WAIcon className="w-5 h-5" />Réserver un rendez-vous
              </a>
              {phone && (
                <a href={`tel:${phone}`}
                  className="flex items-center gap-2 bg-white hover:bg-pink-50 text-[#1a0a12] font-bold px-6 py-3 rounded-full border border-pink-100 transition-all text-sm">
                  <PhoneIcon className="w-4 h-4" />Appeler
                </a>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <Stars count={5} />
                <span className="font-semibold text-gray-700">5 étoiles</span>
              </div>
              <span className="text-gray-300">|</span>
              <span className="flex items-center gap-1.5"><MapPinIcon className="text-[#e91e8c]" />Au cœur d&apos;Agadir</span>
            </div>
          </div>

          {/* Hero visual */}
          <div className="relative flex items-center justify-center">
            <div className="relative w-72 h-80 md:w-80 md:h-96">
              <div className="absolute inset-0 rounded-[2.5rem] overflow-hidden"
                style={{ boxShadow: "0 30px 80px rgba(219,39,119,0.35)" }}>
                <img src="/salon-hero.jpeg" alt="PREGA SQUAD salon" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                <span className="absolute bottom-4 left-0 right-0 flex justify-center">
                  <span className="bg-white text-[#e91e8c] text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">✦ It&apos;s a lifestyle</span>
                </span>
              </div>
              {/* Floating cards */}
              <div className="absolute -top-6 -left-8 z-10 bg-white/90 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-xl border border-pink-100/50">
                <p className="font-bold text-[#1a0a12] text-sm">{services.length}+ services</p>
                <p className="text-xs text-gray-400 mt-0.5">disponibles</p>
              </div>
              <div className="absolute -bottom-4 -right-6 z-10 bg-white/90 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-xl border border-pink-100/50">
                <p className="font-bold text-[#1a0a12] text-sm">{settings?.openingTime || "09:00"} – {settings?.closingTime || "19:00"}</p>
                <p className="text-xs text-gray-400 mt-0.5">Ouvert aujourd&apos;hui</p>
              </div>
              <div className="absolute -top-2 -right-4 w-16 h-16 rounded-2xl z-10 shadow-lg"
                style={{ background: "linear-gradient(135deg,#f6d365 0%,#c8a951 100%)" }} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Ticker ────────────────────────────────────────────────────────── */}
      <ServiceTicker names={tickerNames.length > 0 ? tickerNames : ["Maquillage", "Coiffure", "Ongles", "Soins du visage", "Extensions de cils", "Nail art", "Manucure", "Balayage"]} />

      {/* ── Services ──────────────────────────────────────────────────────── */}
      <section ref={servicesRef} className="py-16 px-4">
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
                <ServiceCard
                  key={s.id}
                  service={s}
                  phone={phone}
                  salonName={salonName}
                  currency={currency}
                  editMode={editMode}
                  onImageUpload={handleServiceImageUpload}
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

      {/* ── About ─────────────────────────────────────────────────────────── */}
      <section ref={aboutRef} className="py-16 px-4 bg-[#1a0a12]">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-5">
            <p className="text-xs font-bold tracking-[0.2em] text-[#e8a87c] uppercase">LE SALON</p>
            <h2 className="text-3xl font-extrabold text-white">
              Un espace dédié à<br /><span className="text-[#e91e8c]">votre beauté</span>
            </h2>
            <p className="text-gray-400 leading-relaxed text-sm">
              {salonName} est votre refuge beauté à Agadir. Nous proposons des prestations haut de gamme dans une ambiance chaleureuse et élégante.
            </p>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <div className="text-2xl font-extrabold text-[#e91e8c]">{services.length}+</div>
                <div className="text-xs text-gray-400 mt-1">Prestations disponibles</div>
              </div>
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
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

      {/* ── Testimonials ──────────────────────────────────────────────────── */}
      <section className="py-16 px-4">
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
                <TestimonialCard
                  key={t.id}
                  t={t}
                  editMode={editMode}
                  onEdit={() => { setPendingPhotoUrl(""); setTestimonialModal(t); }}
                  onDelete={() => { if (confirm("Supprimer cet avis ?")) deleteTestimonialMut.mutate(t.id); }}
                  onToggleVisibility={() => toggleVisibilityMut.mutate({ id: t.id, isVisible: !t.isVisible })}
                />
              ))}
              {editMode && (
                <button
                  onClick={() => { setPendingPhotoUrl(""); setTestimonialModal("add"); }}
                  className="rounded-2xl border-2 border-dashed border-pink-200 hover:border-[#e91e8c] bg-pink-50/50 hover:bg-pink-50 transition-all flex flex-col items-center justify-center gap-2 text-[#e91e8c] min-h-[180px] p-5"
                >
                  <PlusIcon className="w-8 h-8" />
                  <span className="text-sm font-semibold">Ajouter un avis</span>
                </button>
              )}
            </div>
          ) : editMode ? (
            <div className="flex justify-center">
              <button
                onClick={() => { setPendingPhotoUrl(""); setTestimonialModal("add"); }}
                className="rounded-2xl border-2 border-dashed border-pink-200 hover:border-[#e91e8c] bg-pink-50/50 hover:bg-pink-50 transition-all flex flex-col items-center justify-center gap-2 text-[#e91e8c] w-72 min-h-[180px] p-5"
              >
                <PlusIcon className="w-8 h-8" />
                <span className="text-sm font-semibold">Ajouter le premier avis</span>
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Contact ───────────────────────────────────────────────────────── */}
      <section ref={contactRef} className="py-16 px-4 bg-gradient-to-br from-pink-50 to-rose-100">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-5">
            <p className="text-xs font-bold tracking-[0.2em] text-[#e91e8c] uppercase">CONTACT &amp; HORAIRES</p>
            <h2 className="text-3xl font-extrabold text-[#1a0a12]">Prête à vous sublimer ?</h2>
            <p className="text-gray-500 text-sm leading-relaxed">Réservez directement via WhatsApp ou appelez-nous.</p>
            <div className="space-y-3">
              {phone && (
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm"><WAIcon className="text-[#25d366]" /></div>
                  <span>{phone}</span>
                </div>
              )}
              {settings?.address && (
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm"><MapPinIcon className="text-[#e91e8c]" /></div>
                  <span>{settings.address}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm"><ClockIcon className="text-[#e91e8c]" /></div>
                <span>{fmtDays(settings?.workingDays)} · {settings?.openingTime || "09:00"} – {settings?.closingTime || "19:00"}</span>
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

          <div className="rounded-3xl p-8 text-center space-y-5 shadow-2xl"
            style={{ background: "linear-gradient(145deg,#f472b6 0%,#ec4899 40%,#db2777 100%)" }}>
            <div className="w-16 h-16 mx-auto rounded-full bg-white/20 flex items-center justify-center">
              <WAIcon className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-extrabold text-white">Réserver maintenant</h3>
            <p className="text-pink-100 text-sm leading-relaxed">Envoyez un message WhatsApp et réservez en quelques secondes.</p>
            <a href={waBookUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white text-[#e91e8c] font-bold px-8 py-3 rounded-full hover:scale-[1.03] transition-transform shadow-lg text-sm">
              <WAIcon className="text-[#25d366]" />Envoyer un message
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

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="bg-[#1a0a12] py-8 px-4 text-center space-y-3">
        <div className="flex items-center justify-center gap-2">
          <img src="/logo.png" alt={salonName} className="w-8 h-8 rounded-full object-contain" />
          <span className="text-pink-400 font-bold">{salonName}</span>
        </div>
        <p className="text-gray-500 text-xs">Beauty Salon · Agadir, Maroc</p>
        <p className="text-gray-600 text-xs">© {new Date().getFullYear()} {salonName} · Tous droits réservés</p>
      </footer>

      {/* ── Testimonial modal ─────────────────────────────────────────────── */}
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
          onPhotoUpload={file => {
            handleTestimonialPhotoUpload(file).then(() => {
              // photo url set in state via setPendingPhotoUrl
            });
          }}
        />
      )}
      {/* Reflect uploaded photo URL back into modal */}
      {pendingPhotoUrl && testimonialModal && typeof testimonialModal === "object" && (() => {
        // side-effect: keep pending photo in sync — handled by onSave
        return null;
      })()}
    </div>
  );
}
