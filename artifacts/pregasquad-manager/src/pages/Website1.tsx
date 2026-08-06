import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { ChevronLeft, ChevronRight, Crown, MapPin, Clock, Phone, Menu, X } from "lucide-react";
import { Instagram } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import logoImg from "@assets/IMG_4806_1784674657228.jpeg";
import bossPhoto from "@assets/IMG_0503_1784675435922.jpeg";
import bossCutout from "@assets/generated_images/boss-cutout.png";
import coiffeurPhoto from "@assets/ED5544FA-32F2-46D8-82FF-39C2C3300048_1784808998712.png";
import coiffeurCutout from "@assets/generated_images/coiffeur-cutout.png";
import estheticianPhoto from "@assets/9748981A-4260-47D3-A30A-AFADDAC680C8_1784809089053.png";
import estheticianCutout from "@assets/generated_images/esthetician-cutout.png";
import managerPhoto from "@assets/IMG_0785_1786042581377.png";
import managerCutout from "@assets/manager-cutout.png";
import salonImg from "@assets/65C064CA-118F-41EE-825F-B5D6EC37DCEA_1784674657228.jpeg";
import gallery1 from "@assets/generated_images/gallery-1.jpg";
import gallery2 from "@assets/generated_images/gallery-2.jpg";
import gallery3 from "@assets/generated_images/gallery-3.jpg";
import gallery4 from "@assets/generated_images/gallery-4.jpg";
import gallery5 from "@assets/generated_images/gallery-5.jpg";

interface StaffMember {
  id: number;
  name: string;
  role: string;
  bio: string;
  photo: string;
  cutout: string;
  isBoss?: boolean;
}

interface WebsiteSettings {
  businessName?: string;
  phone?: string;
  address?: string;
  email?: string;
  mapsLink?: string;
  openingTime?: string;
  closingTime?: string;
  workingDays?: number[];
  currencySymbol?: string;
  instagramUrl?: string;
}

interface WebsiteInfo {
  settings: WebsiteSettings;
  services: Array<{ id: number; name: string; category?: string | null; emoji?: string | null; price?: number; duration?: number; isStartingPrice?: boolean }>;
  bookForStaff: (staffName: string) => void;
  bookWithoutStaff: () => void;
  bookCurrentStaff: () => void;
  selectStaff: (staffName: string) => void;
  selectedStaffName?: string;
}

const defaultWebsiteInfo: WebsiteInfo = {
  settings: { businessName: "PREGA SQUAD", workingDays: [1, 2, 3, 4, 5, 6], openingTime: "09:00", closingTime: "19:00" },
  services: [],
  bookForStaff: () => {},
  bookWithoutStaff: () => {},
  bookCurrentStaff: () => {},
  selectStaff: () => {},
  selectedStaffName: "THE BOSS",
};

const WebsiteInfoContext = createContext<WebsiteInfo>(defaultWebsiteInfo);

function formatWhatsAppPhone(phone = "") {
  let normalized = phone.replace(/[^0-9]/g, "");
  if (normalized.startsWith("00")) normalized = normalized.slice(2);
  if (normalized.startsWith("0") && normalized.length === 10) normalized = `212${normalized.slice(1)}`;
  if (normalized.length === 9) normalized = `212${normalized}`;
  return normalized;
}

function buildWhatsAppUrl(phone: string | undefined, message: string) {
  const normalizedPhone = formatWhatsAppPhone(phone);
  if (!normalizedPhone) return "";
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

function WebsiteInfoProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<WebsiteSettings>(defaultWebsiteInfo.settings);
  const [services, setServices] = useState<Array<{ id: number; name: string; category?: string | null; emoji?: string | null; price?: number; duration?: number; isStartingPrice?: boolean }>>([]);
  const [selectedStaffName, setSelectedStaffName] = useState(defaultWebsiteInfo.selectedStaffName);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/website")
      .then(response => {
        if (!response.ok) throw new Error(`Website data request failed: ${response.status}`);
        return response.json();
      })
      .then(data => {
        if (cancelled) return;
        setSettings({ ...defaultWebsiteInfo.settings, ...(data.settings ?? {}) });
        setServices(Array.isArray(data.services) ? data.services : []);
      })
      .catch(error => console.error("Failed to load public website settings:", error));
    return () => { cancelled = true; };
  }, []);

  const openBooking = (staffName?: string) => {
    const salonName = settings.businessName || "PREGA SQUAD";
    const message = staffName
      ? `Bonjour ${salonName} 💕\n\nJe souhaite réserver un rendez-vous avec *${staffName}*.\nPouvez-vous me proposer les services disponibles ? Merci 🌸`
      : `Bonjour ${salonName} 💕\n\nJe souhaite réserver un rendez-vous.\nPouvez-vous me proposer les services disponibles ? Merci 🌸`;
    const url = buildWhatsAppUrl(settings.phone, message);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      document.getElementById("visit")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <WebsiteInfoContext.Provider value={{
      settings,
      services,
      bookForStaff: name => openBooking(name),
      bookWithoutStaff: () => openBooking(),
      bookCurrentStaff: () => openBooking(selectedStaffName),
      selectStaff: setSelectedStaffName,
      selectedStaffName,
    }}>
      {children}
    </WebsiteInfoContext.Provider>
  );
}

function useWebsiteInfo() {
  return useContext(WebsiteInfoContext);
}

const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
function formatWorkingDays(days?: number[]) {
  if (!days?.length) return "";
  if (days.length === 7) return "Tous les jours";
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length >= 4 && sorted.every((day, index) => index === 0 || day === sorted[index - 1] + 1)) {
    return `${dayNames[sorted[0]]} – ${dayNames[sorted[sorted.length - 1]]}`;
  }
  return sorted.map(day => dayNames[day]).join(", ");
}

const staff: StaffMember[] = [
  {
    id: 99,
    name: "THE BOSS",
    role: "FOUNDER & DIRECTOR",
    bio: "The visionary behind Prega Squad. For collaborations, partnerships & business inquiries — reach out directly.",
    photo: bossPhoto,
    cutout: bossCutout,
    isBoss: true,
  },
  {
    id: 1,
    name: "KHALIL",
    role: "COIFFEUR",
    bio: "Expert barber and stylist delivering precision cuts and sharp looks.",
    photo: coiffeurPhoto,
    cutout: coiffeurCutout,
  },
  {
    id: 2,
    name: "HASNA",
    role: "ESTHETICIENNE",
    bio: "Skin care specialist delivering glowing, radiant results with expert precision.",
    photo: estheticianPhoto,
    cutout: estheticianCutout,
  },
  {
    id: 3,
    name: "MANAGER",
    role: "MANAGER",
    bio: "Overseeing daily operations and ensuring every client experience exceeds expectations.",
    photo: managerPhoto,
    cutout: managerCutout,
  },
];

const links = [
  { label: "Services", href: "#services" },
  { label: "The Squad", href: "#squad" },
  { label: "Gallery", href: "#gallery" },
  { label: "Visit", href: "#visit" },
];

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { bookCurrentStaff, settings } = useWebsiteInfo();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleResize = () => { if (window.innerWidth >= 768) setOpen(false); };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <>
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled || open ? "bg-black/95 backdrop-blur-md border-b border-white/10 py-4 shadow-xl" : "bg-transparent py-6"
      }`}>
        <div className="container mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={logoImg} alt={`${settings.businessName || "Prega Squad"} Logo`} className="w-10 h-10 rounded-full object-cover shadow-[0_0_15px_rgba(212,0,109,0.5)]" />
            <span className="font-bebas text-3xl tracking-widest text-primary mt-1">{settings.businessName || "PREGA SQUAD"}</span>
          </div>
          <div className="hidden md:flex items-center gap-10 text-sm font-semibold tracking-[0.2em] uppercase text-gray-300">
            {links.map((link) => <a key={link.href} href={link.href} className="hover:text-primary transition-colors">{link.label}</a>)}
          </div>
          <button onClick={bookCurrentStaff} className="hidden md:inline-block bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-full text-sm font-bold tracking-widest uppercase transition-transform hover:scale-105 active:scale-95 shadow-lg shadow-primary/30">Book</button>
          <button onClick={() => setOpen(value => !value)} className="md:hidden text-white p-2 rounded-lg hover:bg-white/10 transition-colors" aria-label="Toggle menu">
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-x-0 top-[68px] z-40 bg-black/97 backdrop-blur-xl border-b border-white/10 flex flex-col px-6 pt-6 pb-8 gap-6 md:hidden">
            {links.map(link => <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="font-bebas text-4xl tracking-widest text-white hover:text-primary transition-colors">{link.label}</a>)}
            <button onClick={() => { setOpen(false); bookCurrentStaff(); }} className="mt-2 bg-primary text-white text-center py-4 rounded-full font-bold tracking-widest uppercase text-sm shadow-lg shadow-primary/30">Book Now</button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function AnimatedName({ name, id }: { name: string; id: number }) {
  return (
    <span style={{ display: "inline-block" }}>
      {name.split("").map((character, index) => (
        <motion.span key={`${id}-${index}`} initial={{ opacity: 0, y: 28, rotateX: -40 }} animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ delay: 0.08 + index * 0.045, type: "spring", stiffness: 380, damping: 28 }}
          style={{ display: "inline-block", transformOrigin: "bottom center" }}>
          {character === " " ? "\u00A0" : character}
        </motion.span>
      ))}
    </span>
  );
}

function HeroSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { bookForStaff, selectStaff } = useWebsiteInfo();
  const current = staff[currentIndex];
  const leftIndex = (currentIndex - 1 + staff.length) % staff.length;
  const rightIndex = (currentIndex + 1) % staff.length;
  const selectIndex = (index: number) => {
    setCurrentIndex(index);
    selectStaff(staff[index].name);
  };
  const next = () => selectIndex((currentIndex + 1) % staff.length);
  const prev = () => selectIndex((currentIndex - 1 + staff.length) % staff.length);

  const figureVariants: Variants = {
    enter: { opacity: 0, scale: 0.9, filter: "blur(6px)" },
    center: {
      opacity: 1, scale: 1, filter: "blur(0px)",
      transition: {
        opacity: { duration: 0.55, ease: [0.25, 0.1, 0.25, 1] as const },
        scale: { type: "spring" as const, stiffness: 160, damping: 22, mass: 1.2 },
        filter: { duration: 0.4, ease: "easeOut" },
      },
    },
    exit: { opacity: 0, scale: 1.06, filter: "blur(3px)", transition: { duration: 0.32, ease: [0.4, 0, 1, 1] as const } },
  };
  const ghostVariants: Variants = {
    enter: { opacity: 0 },
    center: { opacity: 1, transition: { duration: 0.5, ease: "easeOut" } },
    exit: { opacity: 0, transition: { duration: 0.25 } },
  };
  const roleVariants: Variants = {
    enter: { opacity: 0, y: 10 },
    center: { opacity: 1, y: 0, transition: { delay: 0.32, duration: 0.4, ease: "easeOut" } },
    exit: { opacity: 0, y: -6, transition: { duration: 0.18 } },
  };
  const buttonVariants: Variants = {
    enter: { opacity: 0, y: 8 },
    center: { opacity: 1, y: 0, transition: { delay: 0.46, duration: 0.35, ease: "easeOut" } },
    exit: { opacity: 0, transition: { duration: 0.15 } },
  };

  return (
    <section className="relative w-full h-[100dvh] overflow-hidden flex flex-col" style={{ background: "#FFB6C1" }}>
      <motion.div aria-hidden animate={{ opacity: [0.1, 0.14, 0.1] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
        <span className="font-bebas whitespace-nowrap leading-none" style={{ fontSize: "clamp(90px,28vw,380px)", color: "#D4006D", letterSpacing: "-0.02em" }}>THE SQUAD</span>
      </motion.div>

      <div className="relative flex-1 flex items-end justify-center overflow-hidden" style={{ paddingTop: "68px" }}>
        <div className="absolute bottom-0 left-0 flex items-end justify-center opacity-22 hover:opacity-35 transition-opacity duration-500 cursor-pointer" style={{ width: "26%", maxWidth: 240 }} onClick={prev}>
          <AnimatePresence mode="sync"><motion.img key={staff[leftIndex].id} src={staff[leftIndex].cutout || staff[leftIndex].photo} alt="" variants={ghostVariants} initial="enter" animate="center" exit="exit"
            style={{ height: "55dvh", width: "auto", maxWidth: "100%", objectFit: "contain", objectPosition: "bottom", display: "block" }} /></AnimatePresence>
        </div>
        <div className="absolute bottom-0 right-0 flex items-end justify-center opacity-22 hover:opacity-35 transition-opacity duration-500 cursor-pointer" style={{ width: "26%", maxWidth: 240 }} onClick={next}>
          <AnimatePresence mode="sync"><motion.img key={staff[rightIndex].id} src={staff[rightIndex].cutout || staff[rightIndex].photo} alt="" variants={ghostVariants} initial="enter" animate="center" exit="exit"
            style={{ height: "55dvh", width: "auto", maxWidth: "100%", objectFit: "contain", objectPosition: "bottom", display: "block" }} /></AnimatePresence>
        </div>

        <AnimatePresence>
          {current.isBoss && <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full z-20 bg-primary shadow-[0_0_20px_rgba(212,0,109,0.56)]">
            <Crown size={12} color="#fff" /><span className="text-white text-[10px] font-bold tracking-[0.2em] uppercase">BOSS</span>
          </motion.div>}
        </AnimatePresence>

        <div className="relative z-10 flex items-end justify-center" style={{ height: "100%" }}>
          <AnimatePresence mode="sync">
            <motion.div key={current.id} variants={figureVariants} initial="enter" animate="center" exit="exit" className="absolute bottom-0 flex items-end justify-center" style={{ transformOrigin: "bottom center" }}>
              <img src={current.cutout || current.photo} alt={current.name} style={{ height: "calc(100dvh - 290px)", maxHeight: 640, width: "auto", maxWidth: "clamp(180px, 46vw, 500px)", objectFit: "contain", objectPosition: "bottom", display: "block", filter: "drop-shadow(0 24px 48px rgba(212,0,109,0.18))" }} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="relative z-30 shrink-0 px-5 md:px-10 pb-6 pt-3" style={{ background: "linear-gradient(to top, #FFB6C1 65%, transparent)" }}>
        <div className="text-center mb-1 overflow-hidden" style={{ perspective: 600 }}>
          <AnimatePresence mode="wait"><motion.h2 key={current.id} className="font-bebas leading-none tracking-wide" style={{ fontSize: "clamp(42px, 10vw, 96px)", color: "#1A0A0E" }} exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}>
            <AnimatedName name={current.name} id={current.id} />
          </motion.h2></AnimatePresence>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={current.id} className="text-center mb-3">
            <motion.p variants={roleVariants} initial="enter" animate="center" exit="exit" className="font-bebas tracking-[0.2em]" style={{ fontSize: "clamp(13px, 3vw, 22px)", color: "#D4006D" }}>{current.role}</motion.p>
            {current.isBoss && <motion.button variants={buttonVariants} initial="enter" animate="center" exit="exit" onClick={() => bookForStaff(current.name)} className="inline-flex items-center gap-2 mt-2 px-5 py-2 rounded-full text-xs font-bold tracking-widest uppercase bg-primary text-white shadow-lg shadow-primary/30"><SiWhatsapp size={12} />CONTACT FOR COLLAB</motion.button>}
          </motion.div>
        </AnimatePresence>
        <div className="flex flex-col items-center gap-3 mb-4">
          <button onClick={() => bookForStaff(current.name)} className="font-bebas italic" style={{ fontSize: "clamp(22px,5vw,56px)", color: "#D4006D" }}>BOOK NOW &gt;</button>
          <div className="flex items-center justify-center gap-3">
            {[prev, next].map((callback, index) => <button key={index} onClick={callback} className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all duration-200" style={{ border: "1.5px solid #1A0A0E30", color: "#1A0A0E" }}>{index === 0 ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}</button>)}
          </div>
        </div>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {staff.map((member, index) => {
            const active = index === currentIndex;
            return <motion.button key={member.id} onClick={() => selectIndex(index)} animate={{ width: active ? 54 : 42, height: active ? 54 : 42 }} transition={{ type: "spring", stiffness: 320, damping: 28 }} className="relative flex-shrink-0">
              {member.isBoss && <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10"><Crown size={10} color={active ? "#D4006D" : "#1A0A0E80"} fill={active ? "#D4006D" : "none"} /></div>}
              <motion.div animate={{ borderColor: active ? "#D4006D" : "#1A0A0E40", opacity: active ? 1 : 0.5, boxShadow: active ? "0 0 20px #D4006D70" : "none" }} transition={{ duration: 0.3 }} className="w-full h-full rounded-full overflow-hidden border-2">
                <img src={member.photo} alt={member.name} className="w-full h-full object-cover object-top" />
              </motion.div>
              <AnimatePresence>{active && <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-bold tracking-widest whitespace-nowrap uppercase" style={{ color: "#D4006D" }}>{member.isBoss ? "BOSS" : member.name}</motion.span>}</AnimatePresence>
            </motion.button>;
          })}
        </div>
      </div>
    </section>
  );
}

const FALLBACK_SERVICES = [
  { id: -1, name: "Coupe & Brushing", category: "Cheveux", emoji: "✂️" },
  { id: -2, name: "Balayage & Couleur", category: "Cheveux", emoji: "🎨" },
  { id: -3, name: "Lissage & Kératine", category: "Cheveux", emoji: "✨" },
  { id: -4, name: "Maquillage Mariée", category: "Maquillage", emoji: "💄" },
  { id: -5, name: "Maquillage Soirée", category: "Maquillage", emoji: "💋" },
  { id: -6, name: "Pose Gel & Acrylique", category: "Ongles", emoji: "💅" },
  { id: -7, name: "Nail Art", category: "Ongles", emoji: "🌸" },
  { id: -8, name: "Soin Visage", category: "Soins", emoji: "🧖" },
  { id: -9, name: "Épilation", category: "Soins", emoji: "🌿" },
  { id: -10, name: "Sourcils & Cils", category: "Soins", emoji: "👁️" },
];

function ServicesSection() {
  const { services: apiServices, bookCurrentStaff } = useWebsiteInfo();
  const services = apiServices.length > 0 ? apiServices : FALLBACK_SERVICES;

  const categories = useMemo(() => {
    const cats: string[] = [];
    for (const s of services) {
      const cat = s.category ?? "Autres";
      if (!cats.includes(cat)) cats.push(cat);
    }
    return cats;
  }, [services]);

  const [activeCategory, setActiveCategory] = useState<string>("");

  // Reset to first category when categories change
  const effectiveActive = categories.includes(activeCategory) ? activeCategory : (categories[0] ?? "");

  const filtered = useMemo(
    () => services.filter(s => (s.category ?? "Autres") === effectiveActive),
    [services, effectiveActive],
  );

  return (
    <section id="services" className="py-32 bg-[#0D0D0D] relative">
      <div className="container mx-auto px-6 md:px-12 max-w-7xl">
        {/* Heading */}
        <motion.div initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} className="mb-16">
          <h2 className="font-bebas text-7xl md:text-9xl text-white mb-6">SERVICES</h2>
          <div className="w-32 h-2 bg-primary" />
        </motion.div>

        {/* Category tabs */}
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="flex flex-wrap gap-3 mb-14">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`font-bebas text-xl tracking-widest px-6 py-2 border-b-2 transition-all duration-200 ${
                cat === effectiveActive
                  ? "text-primary border-primary"
                  : "text-gray-400 border-transparent hover:text-white hover:border-white/30"
              }`}
            >
              {cat}
            </button>
          ))}
        </motion.div>

        {/* Services grid for active category */}
        <AnimatePresence mode="wait">
          <motion.div
            key={effectiveActive}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12"
          >
            {filtered.map(service => (
              <div key={service.id} className="group border-t-2 border-white/10 pt-8 hover:border-primary transition-colors duration-300">
                <div className="flex items-center gap-3 mb-3">
                  {service.emoji && <span className="text-2xl">{service.emoji}</span>}
                  <h3 className="font-bebas text-3xl text-white tracking-wide group-hover:text-primary transition-colors">{service.name}</h3>
                </div>
                {(service.price != null && service.price > 0) && (
                  <p className="text-primary font-bebas text-xl tracking-wide">
                    {service.isStartingPrice ? "À partir de " : ""}{service.price} MAD
                    {service.duration ? <span className="text-gray-500 text-base ml-2">· {service.duration} min</span> : null}
                  </p>
                )}
              </div>
            ))}
          </motion.div>
        </AnimatePresence>

        {/* Book CTA */}
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="mt-20 text-center">
          <button onClick={bookCurrentStaff} className="inline-block font-bebas text-4xl text-white hover:text-primary transition-colors border-b border-primary pb-2">
            BOOK A SERVICE &gt;
          </button>
        </motion.div>
      </div>
    </section>
  );
}

function SquadSection() {
  const boss = staff.find(member => member.isBoss);
  const artists = staff.filter(member => !member.isBoss);
  const { bookForStaff } = useWebsiteInfo();
  return <section id="squad" className="py-32 bg-[#0A0A0A] relative border-t border-white/5">
    <div className="container mx-auto px-6 md:px-12 max-w-7xl">
      <motion.div initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} className="mb-20 text-center">
        <h2 className="font-bebas text-7xl md:text-9xl text-white mb-6">THE SQUAD</h2><div className="w-32 h-2 bg-primary mx-auto" />
      </motion.div>
      {boss && <motion.div initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} className="mb-16 flex flex-col md:flex-row items-center gap-8 md:gap-14 bg-white/[0.02] border border-primary/20 rounded-2xl p-8 md:p-12 relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="relative flex-shrink-0"><div className="w-44 h-44 md:w-56 md:h-56 rounded-full overflow-hidden border-4 border-primary shadow-[0_0_40px_rgba(212,0,109,0.4)]"><img src={boss.photo} alt={boss.name} loading="eager" className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105" /></div><div className="absolute -top-2 -right-2 bg-primary rounded-full w-10 h-10 flex items-center justify-center shadow-lg shadow-primary/50"><Crown size={18} className="text-white" fill="white" /></div></div>
        <div className="text-center md:text-left relative z-10"><div className="flex items-center gap-3 justify-center md:justify-start mb-2"><span className="bg-primary/20 border border-primary/40 text-primary text-[10px] font-bold tracking-[0.3em] px-3 py-1 rounded-full uppercase">FOUNDER &amp; BOSS</span></div><h3 className="font-bebas text-6xl md:text-7xl text-white tracking-widest leading-none mb-2">{boss.name}</h3><p className="font-bebas text-2xl text-primary tracking-[0.2em] mb-4">{boss.role}</p><p className="text-gray-400 font-light text-lg max-w-md leading-relaxed mb-6">{boss.bio}</p><button onClick={() => bookForStaff(boss.name)} className="inline-flex items-center gap-2 bg-primary hover:bg-white text-white hover:text-black px-8 py-3 rounded-full font-bold tracking-widest uppercase text-sm transition-all duration-200 shadow-lg shadow-primary/40"><SiWhatsapp size={16} />CONTACT FOR COLLAB</button></div>
      </motion.div>}
      <div className={`grid gap-8 md:gap-12 ${artists.length === 1 ? "grid-cols-1 max-w-sm mx-auto" : artists.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3"}`}>
        {artists.map((member, index) => <motion.div key={member.id} initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ delay: index * 0.15 }} className="group relative">
          <div className="relative aspect-[3/4] overflow-hidden mb-6 rounded-sm bg-[#111]"><img src={member.photo} alt={member.name} loading="lazy" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-90 group-hover:opacity-100 grayscale-[20%] group-hover:grayscale-0" /><div className="absolute inset-0 border-4 border-transparent group-hover:border-primary transition-colors duration-500 z-10 pointer-events-none" /></div>
          <h3 className="font-bebas text-5xl text-white tracking-widest">{member.name}</h3><p className="font-bebas text-xl text-primary tracking-[0.2em] mb-4">{member.role}</p><p className="text-gray-400 font-light text-lg">{member.bio}</p>
        </motion.div>)}
      </div>
    </div>
  </section>;
}

const galleryImages = [
  { src: salonImg, alt: "Luxury Salon Interior", span: "md:col-span-2 md:row-span-2" },
  { src: gallery1, alt: "Balayage Hair" },
  { src: gallery2, alt: "Nail Art" },
  { src: gallery3, alt: "Bridal Makeup", span: "md:col-span-2" },
  { src: gallery4, alt: "Pink Salon Chairs" },
  { src: gallery5, alt: "Hair Blowout" },
];

function GallerySection() {
  return <section id="gallery" className="py-32 bg-[#0D0D0D]"><div className="container mx-auto px-4 md:px-8 max-w-[1400px]">
    <motion.div initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} className="mb-20 flex flex-col md:flex-row md:items-end justify-between gap-8">
      <div><h2 className="font-bebas text-7xl md:text-9xl text-white mb-6">GALLERY</h2><div className="w-32 h-2 bg-primary" /></div>
      <p className="text-gray-400 max-w-sm text-lg font-light">Step into our world. A space designed for luxury, comfort, and breathtaking transformations.</p>
    </motion.div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 auto-rows-[200px] md:auto-rows-[300px]">
      {galleryImages.map((image, index) => <motion.div key={image.src} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: index * 0.08 }} className={`relative overflow-hidden group ${image.span ?? ""}`}>
        <img src={image.src} alt={image.alt} loading={index === 0 ? "eager" : "lazy"} decoding="async" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
        <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/30 mix-blend-multiply transition-colors duration-500" />
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-t from-black/80 to-transparent flex items-end p-6 transition-opacity duration-300"><span className="font-bebas text-2xl text-white tracking-widest">{image.alt}</span></div>
      </motion.div>)}
    </div>
  </div></section>;
}

function VisitSection() {
  const { settings, bookCurrentStaff } = useWebsiteInfo();
  const address = settings.address || "Address not configured";
  const hours = `${formatWorkingDays(settings.workingDays)}: ${settings.openingTime || "09:00"} – ${settings.closingTime || "19:00"}`;
  return <section id="visit" className="py-32 bg-[#0A0A0A] relative border-t border-white/5"><div className="container mx-auto px-6 md:px-12 max-w-6xl">
    <motion.div initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} className="mb-20 text-center"><h2 className="font-bebas text-7xl md:text-9xl text-white mb-6">VISIT US</h2><div className="w-32 h-2 bg-primary mx-auto" /></motion.div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
      <motion.div initial={{ opacity: 0, x: -50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="space-y-12">
        <div className="flex items-start gap-6 group"><div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300 shrink-0"><MapPin size={28} /></div><div><h3 className="font-bebas text-4xl text-white tracking-widest mb-2">LOCATION</h3><p className="text-gray-400 text-lg font-light leading-relaxed">{address}</p>{settings.mapsLink && <a href={settings.mapsLink} target="_blank" rel="noreferrer" className="inline-block mt-2 text-primary text-sm hover:text-white transition-colors">OPEN MAP &gt;</a>}</div></div>
        <div className="flex items-start gap-6 group"><div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300 shrink-0"><Clock size={28} /></div><div><h3 className="font-bebas text-4xl text-white tracking-widest mb-2">HOURS</h3><p className="text-gray-400 text-lg font-light leading-relaxed">{hours}</p></div></div>
        <div className="flex items-start gap-6 group"><div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300 shrink-0"><Phone size={28} /></div><div><h3 className="font-bebas text-4xl text-white tracking-widest mb-2">CONTACT</h3><p className="text-gray-400 text-lg font-light leading-relaxed">{settings.phone || "WhatsApp number not configured"}{settings.email && <><br />{settings.email}</>}</p></div></div>
      </motion.div>
      <motion.div initial={{ opacity: 0, x: 50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="bg-[#111] p-8 md:p-12 rounded-sm border-l-4 border-primary"><h3 className="font-bebas text-5xl text-white mb-6">READY TO GLOW?</h3><p className="text-gray-400 text-lg font-light mb-10 leading-relaxed">Appointments fill up fast. Secure your spot with our artists today and experience the standard in beauty.</p><button onClick={bookCurrentStaff} className="w-full bg-primary hover:bg-white text-white hover:text-black py-5 text-xl font-bebas tracking-[0.2em] transition-all duration-300">BOOK YOUR APPOINTMENT &gt;</button></motion.div>
    </div>
  </div></section>;
}

function Footer() {
  const { settings } = useWebsiteInfo();
  const socialLinks = settings.instagramUrl ? [{ href: settings.instagramUrl, label: "Instagram", icon: <Instagram size={24} /> }] : [];
  const businessName = settings.businessName || "PREGA SQUAD";
  return <footer className="bg-black py-16 border-t border-white/10"><div className="container mx-auto px-6 md:px-12 max-w-7xl">
    <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-16">
      <div className="flex items-center gap-4"><img src={logoImg} alt={`${businessName} Logo`} className="w-12 h-12 rounded-full object-cover grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all" /><div><div className="font-bebas text-3xl tracking-widest text-white">{businessName}</div><div className="text-primary text-xs font-bold tracking-[0.3em] uppercase mt-1">Glow and Beyond</div></div></div>
      <div className="flex items-center gap-8 text-sm font-semibold tracking-[0.2em] uppercase text-gray-500"><a href="#services" className="hover:text-white transition-colors">Services</a><a href="#squad" className="hover:text-white transition-colors">Squad</a><a href="#gallery" className="hover:text-white transition-colors">Gallery</a></div>
      {socialLinks.length > 0 && <div className="flex gap-6">{socialLinks.map(link => <a key={link.href} href={link.href} target="_blank" rel="noreferrer" aria-label={link.label} className="text-gray-500 hover:text-primary transition-colors">{link.icon}</a>)}</div>}
    </div>
    <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/5 text-gray-600 text-sm font-light"><p>&copy; {new Date().getFullYear()} {businessName}. All rights reserved.</p>{settings.address && <div className="flex items-center gap-2 mt-4 md:mt-0"><MapPin size={14} /><span>{settings.address}</span></div>}</div>
  </div></footer>;
}

export default function Website1() {
  return (
    <WebsiteInfoProvider>
      <div className="website1-root bg-[#0A0A0A] min-h-screen text-white overflow-x-hidden font-sans" style={{ "--primary": "329 100% 42%", "--font-sans": "'Inter', sans-serif" } as React.CSSProperties}>
        <Navbar />
        <main><HeroSection /><ServicesSection /><SquadSection /><GallerySection /><VisitSection /></main>
        <Footer />
      </div>
    </WebsiteInfoProvider>
  );
}