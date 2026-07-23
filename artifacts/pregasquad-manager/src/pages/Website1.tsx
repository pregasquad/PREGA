import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Crown, Mail, MapPin, Clock, Phone, Menu, X } from "lucide-react";
import { Instagram } from "lucide-react";
import { SiTiktok, SiWhatsapp } from "react-icons/si";
import logoImg from "@assets/IMG_4806_1784674657228.jpeg";
import bossPhoto from "@assets/IMG_0503_1784675435922.jpeg";
import bossCutout from "@assets/generated_images/boss-cutout.png";
import coiffeurPhoto from "@assets/ED5544FA-32F2-46D8-82FF-39C2C3300048_1784808998712.png";
import coiffeurCutout from "@assets/generated_images/coiffeur-cutout.png";
import estheticianPhoto from "@assets/9748981A-4260-47D3-A30A-AFADDAC680C8_1784809089053.png";
import estheticianCutout from "@assets/generated_images/esthetician-cutout.png";
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
  collabLink?: string;
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
    collabLink: "mailto:contact@pregasquad.com",
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
            <img src={logoImg} alt="Prega Squad Logo" className="w-10 h-10 rounded-full object-cover shadow-[0_0_15px_rgba(212,0,109,0.5)]" />
            <span className="font-bebas text-3xl tracking-widest text-primary mt-1">PREGA SQUAD</span>
          </div>
          <div className="hidden md:flex items-center gap-10 text-sm font-semibold tracking-[0.2em] uppercase text-gray-300">
            {links.map((link) => <a key={link.href} href={link.href} className="hover:text-primary transition-colors">{link.label}</a>)}
          </div>
          <a href="#visit" className="hidden md:inline-block bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-full text-sm font-bold tracking-widest uppercase transition-transform hover:scale-105 active:scale-95 shadow-lg shadow-primary/30">Book</a>
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
            <a href="#visit" onClick={() => setOpen(false)} className="mt-2 bg-primary text-white text-center py-4 rounded-full font-bold tracking-widest uppercase text-sm shadow-lg shadow-primary/30">Book Now</a>
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
  const current = staff[currentIndex];
  const leftIndex = (currentIndex - 1 + staff.length) % staff.length;
  const rightIndex = (currentIndex + 1) % staff.length;
  const next = () => setCurrentIndex(index => (index + 1) % staff.length);
  const prev = () => setCurrentIndex(index => (index - 1 + staff.length) % staff.length);

  const figureVariants = {
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
  const ghostVariants = {
    enter: { opacity: 0 },
    center: { opacity: 1, transition: { duration: 0.5, ease: "easeOut" } },
    exit: { opacity: 0, transition: { duration: 0.25 } },
  };
  const roleVariants = {
    enter: { opacity: 0, y: 10 },
    center: { opacity: 1, y: 0, transition: { delay: 0.32, duration: 0.4, ease: "easeOut" } },
    exit: { opacity: 0, y: -6, transition: { duration: 0.18 } },
  };
  const buttonVariants = {
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
            {current.isBoss && <motion.a variants={buttonVariants} initial="enter" animate="center" exit="exit" href={current.collabLink || "mailto:contact@pregasquad.com"} className="inline-flex items-center gap-2 mt-2 px-5 py-2 rounded-full text-xs font-bold tracking-widest uppercase bg-primary text-white shadow-lg shadow-primary/30"><Mail size={12} />CONTACT FOR COLLAB</motion.a>}
          </motion.div>
        </AnimatePresence>
        <div className="flex flex-col items-center gap-3 mb-4">
          {!current.isBoss && <a href="#visit" className="font-bebas italic" style={{ fontSize: "clamp(22px,5vw,56px)", color: "#D4006D" }}>BOOK NOW &gt;</a>}
          <div className="flex items-center justify-center gap-3">
            {[prev, next].map((callback, index) => <button key={index} onClick={callback} className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all duration-200" style={{ border: "1.5px solid #1A0A0E30", color: "#1A0A0E" }}>{index === 0 ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}</button>)}
          </div>
        </div>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {staff.map((member, index) => {
            const active = index === currentIndex;
            return <motion.button key={member.id} onClick={() => setCurrentIndex(index)} animate={{ width: active ? 54 : 42, height: active ? 54 : 42 }} transition={{ type: "spring", stiffness: 320, damping: 28 }} className="relative flex-shrink-0">
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

const services = [
  ["Hair Styling", "Cuts, blowouts, and signature styling for every occasion."],
  ["Hair Color", "Balayage, highlights, full color transformations, and gloss toning."],
  ["Makeup", "Bridal perfection, high-fashion editorial, and everyday soft glam."],
  ["Nail Art", "Gel extensions, acrylics, intricate nail art, and luxury pedicures."],
  ["Skincare & Facials", "Signature glow treatments and deep hydrating facials."],
  ["Eyebrows & Lashes", "Precision shaping, lamination, tints, and volume extensions."],
];

function ServicesSection() {
  return <section id="services" className="py-32 bg-[#0D0D0D] relative">
    <div className="container mx-auto px-6 md:px-12 max-w-7xl">
      <motion.div initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} className="mb-20">
        <h2 className="font-bebas text-7xl md:text-9xl text-white mb-6">SERVICES</h2><div className="w-32 h-2 bg-primary" />
      </motion.div>
      <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-100px" }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12">
        {services.map(([title, description]) => <motion.div key={title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 100 }} className="group border-t-2 border-white/10 pt-8 hover:border-primary transition-colors duration-300">
          <h3 className="font-bebas text-3xl text-white mb-4 tracking-wide group-hover:text-primary transition-colors">{title}</h3><p className="text-gray-400 font-light leading-relaxed text-lg">{description}</p>
        </motion.div>)}
      </motion.div>
      <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="mt-24 text-center"><a href="#visit" className="inline-block font-bebas text-4xl text-white hover:text-primary transition-colors border-b border-primary pb-2">BOOK A SERVICE &gt;</a></motion.div>
    </div>
  </section>;
}

function SquadSection() {
  const boss = staff.find(member => member.isBoss);
  const artists = staff.filter(member => !member.isBoss);
  return <section id="squad" className="py-32 bg-[#0A0A0A] relative border-t border-white/5">
    <div className="container mx-auto px-6 md:px-12 max-w-7xl">
      <motion.div initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} className="mb-20 text-center">
        <h2 className="font-bebas text-7xl md:text-9xl text-white mb-6">THE SQUAD</h2><div className="w-32 h-2 bg-primary mx-auto" />
      </motion.div>
      {boss && <motion.div initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} className="mb-16 flex flex-col md:flex-row items-center gap-8 md:gap-14 bg-white/[0.02] border border-primary/20 rounded-2xl p-8 md:p-12 relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="relative flex-shrink-0"><div className="w-44 h-44 md:w-56 md:h-56 rounded-full overflow-hidden border-4 border-primary shadow-[0_0_40px_rgba(212,0,109,0.4)]"><img src={boss.photo} alt={boss.name} loading="eager" className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105" /></div><div className="absolute -top-2 -right-2 bg-primary rounded-full w-10 h-10 flex items-center justify-center shadow-lg shadow-primary/50"><Crown size={18} className="text-white" fill="white" /></div></div>
        <div className="text-center md:text-left relative z-10"><div className="flex items-center gap-3 justify-center md:justify-start mb-2"><span className="bg-primary/20 border border-primary/40 text-primary text-[10px] font-bold tracking-[0.3em] px-3 py-1 rounded-full uppercase">FOUNDER &amp; BOSS</span></div><h3 className="font-bebas text-6xl md:text-7xl text-white tracking-widest leading-none mb-2">{boss.name}</h3><p className="font-bebas text-2xl text-primary tracking-[0.2em] mb-4">{boss.role}</p><p className="text-gray-400 font-light text-lg max-w-md leading-relaxed mb-6">{boss.bio}</p><a href={boss.collabLink} className="inline-flex items-center gap-2 bg-primary hover:bg-white text-white hover:text-black px-8 py-3 rounded-full font-bold tracking-widest uppercase text-sm transition-all duration-200 shadow-lg shadow-primary/40"><Mail size={16} />CONTACT FOR COLLAB</a></div>
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
  return <section id="visit" className="py-32 bg-[#0A0A0A] relative border-t border-white/5"><div className="container mx-auto px-6 md:px-12 max-w-6xl">
    <motion.div initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} className="mb-20 text-center"><h2 className="font-bebas text-7xl md:text-9xl text-white mb-6">VISIT US</h2><div className="w-32 h-2 bg-primary mx-auto" /></motion.div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
      <motion.div initial={{ opacity: 0, x: -50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="space-y-12">
        <div className="flex items-start gap-6 group"><div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300 shrink-0"><MapPin size={28} /></div><div><h3 className="font-bebas text-4xl text-white tracking-widest mb-2">LOCATION</h3><p className="text-gray-400 text-lg font-light leading-relaxed">Beauty District, City Center<br />123 Glow Avenue, Suite 400</p></div></div>
        <div className="flex items-start gap-6 group"><div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300 shrink-0"><Clock size={28} /></div><div><h3 className="font-bebas text-4xl text-white tracking-widest mb-2">HOURS</h3><p className="text-gray-400 text-lg font-light leading-relaxed">Mon - Sat: 9:00 AM - 9:00 PM<br />Sun: 10:00 AM - 7:00 PM</p></div></div>
        <div className="flex items-start gap-6 group"><div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300 shrink-0"><Phone size={28} /></div><div><h3 className="font-bebas text-4xl text-white tracking-widest mb-2">CONTACT</h3><p className="text-gray-400 text-lg font-light leading-relaxed">+1 (555) 789-0123<br />hello@pregasquad.com</p></div></div>
      </motion.div>
      <motion.div initial={{ opacity: 0, x: 50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="bg-[#111] p-8 md:p-12 rounded-sm border-l-4 border-primary"><h3 className="font-bebas text-5xl text-white mb-6">READY TO GLOW?</h3><p className="text-gray-400 text-lg font-light mb-10 leading-relaxed">Appointments fill up fast. Secure your spot with our artists today and experience the standard in beauty.</p><button className="w-full bg-primary hover:bg-white text-white hover:text-black py-5 text-xl font-bebas tracking-[0.2em] transition-all duration-300">BOOK YOUR APPOINTMENT &gt;</button></motion.div>
    </div>
  </div></section>;
}

function Footer() {
  return <footer className="bg-black py-16 border-t border-white/10"><div className="container mx-auto px-6 md:px-12 max-w-7xl">
    <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-16">
      <div className="flex items-center gap-4"><img src={logoImg} alt="Prega Squad Logo" className="w-12 h-12 rounded-full object-cover grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all" /><div><div className="font-bebas text-3xl tracking-widest text-white">PREGA SQUAD</div><div className="text-primary text-xs font-bold tracking-[0.3em] uppercase mt-1">Glow and Beyond</div></div></div>
      <div className="flex items-center gap-8 text-sm font-semibold tracking-[0.2em] uppercase text-gray-500"><a href="#services" className="hover:text-white transition-colors">Services</a><a href="#squad" className="hover:text-white transition-colors">Squad</a><a href="#gallery" className="hover:text-white transition-colors">Gallery</a></div>
      <div className="flex gap-6"><a href="#" className="text-gray-500 hover:text-primary transition-colors"><Instagram size={24} /></a><a href="#" className="text-gray-500 hover:text-primary transition-colors"><SiTiktok size={22} /></a><a href="#" className="text-gray-500 hover:text-primary transition-colors"><SiWhatsapp size={22} /></a></div>
    </div>
    <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/5 text-gray-600 text-sm font-light"><p>&copy; {new Date().getFullYear()} Prega Squad. All rights reserved.</p><div className="flex items-center gap-2 mt-4 md:mt-0"><MapPin size={14} /><span>Beauty District, City Center</span></div></div>
  </div></footer>;
}

export default function Website1() {
  return (
    <div className="website1-root bg-[#0A0A0A] min-h-screen text-white overflow-x-hidden font-sans" style={{ "--primary": "329 100% 42%", "--font-sans": "'Inter', sans-serif" } as React.CSSProperties}>
      <Navbar />
      <main><HeroSection /><ServicesSection /><SquadSection /><GallerySection /><VisitSection /></main>
      <Footer />
    </div>
  );
}