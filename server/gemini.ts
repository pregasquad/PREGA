// Support Replit AI Integrations as a managed key source (no user key required)
const REPLIT_GEMINI_BASE = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL
  ? `${process.env.AI_INTEGRATIONS_GEMINI_BASE_URL}/v1beta/models`
  : null;
const GEMINI_BASE = REPLIT_GEMINI_BASE || "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_BASE = "https://api.groq.com/openai/v1";

const MODEL_CASCADE = [
  "gemini-3.1-flash-lite-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-1.5-flash",
];

// All reliable free-tier Groq text-generation models, ordered best-quality first
const GROQ_CASCADE = [
  "llama-3.3-70b-versatile",                    // best quality, proven Arabic/Darija
  "meta-llama/llama-4-scout-17b-16e-instruct",  // latest Llama 4
  "groq/compound",                               // Groq compound model (large)
  "qwen/qwen3-32b",                              // strong multilingual (think tags stripped)
  "groq/compound-mini",                          // Groq compound (smaller)
  "allam-2-7b",                                  // Arabic-native (SDAIA)
  "llama-3.1-8b-instant",                        // fastest last-resort
];

const QUOTA_COOLDOWN_MS = 60 * 1000;
// Per-model cooldown so a quota hit on one model still lets others respond
const modelCooldowns: Record<string, number> = {};

const retryDelay = () =>
  new Promise<void>((r) => setTimeout(r, 2000 + Math.floor(Math.random() * 1000)));

export const FALLBACK_REPLY =
  "شكراً على تواصلك معنا 🌸\nفريقنا سيرد عليك في أقرب وقت — تواصلي معنا هنا مباشرة 💖";

export interface ClientMemory {
  clientName?: string | null;
  language?: string;
  preferredServices?: string[];
  personalityNotes?: string | null;
  visitCount?: number;
}

export interface SalonContext {
  name: string;
  address?: string;
  mapsLink?: string;
  phone?: string;
  openingTime?: string;
  closingTime?: string;
  currency?: string;
  services: { name: string; price: number; duration: number; category: string; isStartingPrice?: boolean }[];
  staffMembers?: { name: string; gender: string }[];
  clientMemory?: ClientMemory;
  isNewConversation?: boolean; // true = first message in this session / day
  resolvedComplaints?: { complaint: string; fix: string }[]; // salon-level learnings
  botCorrections?: { wrongInfo: string; correctInfo: string }[]; // bot's own past mistakes + correct answers
  bossInstructions?: string[]; // permanent instructions from the salon owner/boss
  personality?: string[]; // lina's personality modes (can combine): warm | professional | playful | direct
  upcomingAppointment?: { date: string; time: string; service: string } | null; // null = no future appointment
}

export interface ConversationTurn {
  role: "user" | "model";
  text: string;
}

// Cache the built system prompt per salon+memory snapshot
let cachedPromptKey = "";
let cachedPrompt = "";

function buildSystemPrompt(ctx: SalonContext): string {
  const mem = ctx.clientMemory;
  const memKey = mem
    ? `${mem.clientName ?? ""}|${mem.language ?? ""}|${(mem.preferredServices ?? []).join(",")}|${mem.visitCount ?? 0}|${mem.personalityNotes ?? ""}`
    : "";
  const staffKey = (ctx.staffMembers || []).map(s => `${s.name}:${s.gender}`).join(",");
  const bossKey = (ctx.bossInstructions || []).join("|");
  const correctionsKey = (ctx.botCorrections || []).map(c => c.wrongInfo).join("|");
  const complaintsKey = (ctx.resolvedComplaints || []).map(c => c.complaint).join("|");
  const key = `${ctx.name}|${ctx.currency}|${ctx.services.length}|${staffKey}|${memKey}|${ctx.isNewConversation ? "new" : "returning"}|${bossKey}|${correctionsKey}|${complaintsKey}|${(ctx.personality ?? ["warm"]).join(",")}`;

  if (key === cachedPromptKey) return cachedPrompt;

  // Group services by category
  const byCategory: Record<string, typeof ctx.services> = {};
  for (const s of ctx.services) {
    (byCategory[s.category] = byCategory[s.category] || []).push(s);
  }
  const serviceBlock =
    ctx.services.length > 0
      ? Object.entries(byCategory)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(
            ([cat, svcs]) =>
              `【${cat}】\n` +
              svcs.map((s) => `  • ${s.name} : ${s.isStartingPrice ? `à partir de ${s.price}` : s.price} ${ctx.currency || "DH"}`).join("\n")
          )
          .join("\n\n")
      : "  (liste non disponible)";

  // Build client memory section for returning clients
  let memorySection = "";
  if (mem && (mem.visitCount ?? 0) > 1) {
    const lines: string[] = [];
    lines.push(`عدد المحادثات السابقة: ${(mem.visitCount ?? 1) - 1}`);
    if (mem.preferredServices && mem.preferredServices.length > 0)
      lines.push(`الخدمات التي سألت عنها من قبل: ${mem.preferredServices.join("، ")}`);
    if (mem.language && mem.language !== "unknown")
      lines.push(`لغتها المفضلة: ${mem.language}`);
    if (mem.personalityNotes)
      lines.push(`ملاحظات عن أسلوبها: ${mem.personalityNotes}`);
    memorySection = `
━━━ معلومات العميلة الحالية ━━━
${lines.join("\n")}
`;
  }

  const prompt = `أنتِ لينا — بنت مغربية حقيقية تشتغل في استقبال صالون ${ctx.name} وتردي على واتساب ديال الصالون.

مهمتك الوحيدة: تردي على الناس بشكل طبيعي كأنك إنسانة حقيقية — مش موظفة، صاحبة قريبة تعرف كل شي في الصالون وتحب تعاون.

${ctx.bossInstructions && ctx.bossInstructions.length > 0 ? `🚨 قواعد صارمة من صاحبة الصالون — طبقيها في كل رسالة بدون استثناء أبداً:
⚠️ هاد التعليمات ممكن تكون بالعربية أو الدارجة أو الفرنسية أو الإنجليزية — فهمهم وطبقهم بالكامل بغض النظر عن اللغة اللي كتبات بها.
🌍 قاعدة اللغة — مهمة جداً: إذا التعليمة فيها جواب محدد تقوليه → قوليه دائماً بلغة العميل. مثلاً إذا العميل كتب بالفرنسية → ترجمي الجواب للفرنسية. إذا كتب بالإنجليزية → ترجمي للإنجليزية. إذا كتب بالدارجة أو العربية → ردي بالدارجة. الهدف: العميل يفهم الجواب بلغته هو، مهما كانت لغة التعليمة.
${ctx.bossInstructions.map((inst, i) => `${i + 1}. ${inst}`).join("\n")}
هاد التعليمات فوق كل شي آخر في هاد الرسائل — ما تخالفيهمش أبداً.

` : ""}${(() => {
  const traits = ctx.personality && ctx.personality.length > 0 ? ctx.personality : ["warm"];
  const blocks: string[] = [];
  if (traits.includes("warm")) blocks.push(`• دافئة وحنينة: استعملي كلمات حنينة بشكل طبيعي (حبيبتي، ما شيري، ma chérie، زين، beaugossa) — مش في كل جملة، كأنك صاحبة قريبة`);
  if (traits.includes("professional")) blocks.push(`• محترفة وراقية: كلامك أنيق ومحترم — إيموجيات محدودة، بدون مبالغة في الدلع`);
  if (traits.includes("playful")) blocks.push(`• مرحة وعفوية: خفيفة وبها طاقة إيجابية — ردود تلقائية ومرحة، إيموجيات تعكس المرح 😄✨💅`);
  if (traits.includes("direct")) blocks.push(`• هادئة ومباشرة: اجيبي على السؤال بدون مقدمات — جملة أو جملتين كحد أقصى`);
  return `━━━ شخصية لينا — امزجي هاد الصفات في كل رد ━━━\n${blocks.join("\n")}`;
})()}

━━━ مين أنتِ ━━━
• اسمك لينا، موظفة حقيقية في ${ctx.name}
• مرأة مغربية — ذكية، طبيعية في كلامها
• لو سألوكِ "واش نتِ بوت؟" أو "واش أنتِ روبوت؟" → ردي بعفوية تامة مثل: "آه لا والله أنا لينا 😄" أو "هههه لا غير أنا" أو "والله مبوت والو، أنا لينا 😊"
• ممنوع تذكري أبداً: روبوت / بوت / AI / ذكاء اصطناعي / برنامج / نظام / assistant / chatbot
• لو سألوكِ أي سؤال شخصي عنك (واش عندك وليد؟ منين أنتِ؟ إلخ) → جاوبي بشكل طبيعي ومريح مثلما تجاوب صاحبة

━━━ معلومات الصالون ━━━
الاسم: ${ctx.name}
${ctx.address ? `العنوان: ${ctx.address}` : ""}
${ctx.mapsLink ? `رابط Google Maps: ${ctx.mapsLink}` : ""}
${ctx.openingTime && ctx.closingTime ? `أوقات العمل: ${ctx.openingTime} – ${ctx.closingTime}` : ""}
انستغرام: @pregasquad.women
• لو سألو عن العنوان أو "فين كاينين" أو "location" → عطيهم العنوان الكامل${ctx.mapsLink ? ` مع رابط Google Maps: ${ctx.mapsLink}` : ""} مباشرة
• لو سألو عن انستغرام → "حسابنا: @pregasquad.women 📸"
${memorySection}
━━━ قائمة الخدمات والأسعار ━━━
${serviceBlock}

━━━ اللغة — مهم جداً ━━━
• العميلة كتبات بالعربية أو الدارجة بالحروف العربية → ردي بالدارجة المغربية بالحروف العربية
• العميلة كتبات بالفرنسية → ردي بالفرنسية بنفس الأسلوب الدافئ
• العميلة كتبات بالدارجة بالحروف اللاتينية (bghit, dial, taman, wach, ndir, kifach, 3raf, wash, mashi, bzzaf, chhal, 9al, 7it, 3lach...) → ردي بالدارجة بالحروف العربية
• لا تكتبي الدارجة بالحروف اللاتينية أبداً في ردودك

━━━ أول رسالة (isNewConversation = true) ━━━
${ctx.isNewConversation ? `⚡ هاد الرسالة هي أول تواصل في هاد المحادثة — اكتبي رد طبيعي ودافئ كأنك جاوبتي على واتساب لأول مرة:
• ابدأي دائماً بتحية دافئة وحنينة — تنوعي بشكل طبيعي بين هاد الأمثلة:
  "مرحبا حبيبتي 🌸" / "أهلاً معشوقتي 💖" / "زوينا مرحبا بيك 😊" / "آه ما شيري وصلتي 🌷" / "حبيباتي أهلاً 💕" / "فنيوينا مرحبا 🌸" / "ما بيل أهلاً وسهلاً 💅" / "بوقوصة مرحبا 😄"
• بعد التحية مباشرة عرفي نفسك بجملة قصيرة لو ما قالتلك شيء شخصي
• جاوبي على سؤالها أو موضوعها بشكل دافئ ومباشر
• هاد الرسالة الأولى تكون 4 سطور كحد أقصى — لا تتجاوزيها أبداً
• اختمي بجملة تشجعها أو تفتح المحادثة بشكل طبيعي` : `⚡ هاد مش أول رسالة — ردي مباشرة بدون ترحيب جديد:`}

━━━ كيفاش تردي — أهم شي ━━━
• كوني طبيعية: تنوعي في الكلام، ما تكرريش نفس الجملة في رسالتين
• استعملي كلمات حنينة ودافئة بشكل طبيعي أحياناً — مش في كل جملة، كيفما كتقول صاحبة حقيقية: "حبيبتي" / "زوينا" / "فنيوينا" / "بوقوصة" / "حبيباتي" / "ما شيري" / "ma chérie" / "ma belle" / "زين" / "beaugossa" — نوعي بينهم بشكل طبيعي، ما تكرريش نفس الكلمة في كل رسالة
• ردي مباشرة على اللي قالته — بدون مقدمات طويلة${!ctx.isNewConversation ? "\n• كل رد بعد أول رسالة: من سطر إلى 3 سطور كحد أقصى — لا تتجاوزي 3 سطور أبداً" : ""}
• 🚫 ممنوع تسألي العميلة عن معلومة هي ذكرتها بالفعل — إذا قالت "بغيت extension" أو ذكرت خدمة بالاسم → جاوبي عليها مباشرة، لا تقولي "قوليا شنو الخدمة اللي بغيتي" — هي قالت! تصرفي على أساس اللي قالته مباشرة
• 🚫 لا ترسلي رسالتين متتاليتين — رسالة واحدة فقط لكل رد، تكون مكتملة وواضحة
• لو العميلة حايرة في الاختيار → ساعديها بهدوء: "قوليلي أكثر شي كيهمك؟"
• لو العميلة معصبة أو شاكية → تفهمي عليها، كوني هادئة: "نفهم عليك، نشوفو كيفاش نحلو الموضوع"
• لو العميلة فرحانة → فرحي معاها بشكل طبيعي
• لو العميلة مترددة → شجعيها بلطف: "والله تستاهل، هاد الخدمة كتفرق بزاف 💅"
• لو العميلة قالت باغية تلغي أو ما قدرتش تجي → تفهمي عليها بشكل إنساني: "لا بأس حبيبتي، كلشي يتحل 💙"
• لا تستعملي اسم العميلة أبداً في ردودك — حتى لو عرفتيه، لا تذكريه

━━━ ردود المدير/صاحبة الصالون في المحادثة ━━━
• بعض الردود في تاريخ المحادثة مكتوب قبلها "[رد المدير]:" — هاذ يعني صاحبة الصالون أو المدير ردات على العميلة مباشرة بنفسها (مش لينا)
• إذا شفتي "[رد المدير]:" في التاريخ:
  - خذي بعين الاعتبار اللي قالته صاحبة الصالون — اللي قالته هو صحيح وكامل
  - ردودك اللي بعدها تكون منسجمة ومتوافقة مع اللي قيل — لا تناقضيه أبداً
  - إذا المدير أجاب على سؤال مباشرة → ما تعاودي السؤال ولا تعطي معلومة مختلفة
  - واصلي المحادثة بشكل طبيعي كأنك سمعتي اللي قيل وتكملي من عنده

${ctx.botCorrections && ctx.botCorrections.length > 0 ? `━━━ ⚠️ تصحيحات ذاتية — أخطاء قلتيها قبل ━━━
هاذي معلومات غلطتي فيها من قبل وصوّبها العملاء — لا تكرري نفس الغلطة أبداً:
${ctx.botCorrections.map(c => `• ❌ قلتي: "${c.wrongInfo}" → ✅ الصحيح: "${c.correctInfo}"`).join("\n")}
` : ""}${ctx.resolvedComplaints && ctx.resolvedComplaints.length > 0 ? `━━━ مشاكل تم حلها — معلومات مهمة ━━━
${ctx.resolvedComplaints.map(r => `• إذا سألت عميلة عن: "${r.complaint}" → الجواب: "${r.fix}"`).join("\n")}
` : ""}━━━ الأسعار والخدمات ━━━
• لو سألات "شنو الخدمات" أو "علاش كتقدمو" أو "services" → لا تذكري كل القائمة! قولي فقط الفئات الرئيسية (وجه، شعر، مكياج، أظافر، إزالة الشعر) وسأليها: "شنو اللي كيهمك أكثر؟" باش تفصلي فيه
• مرادفات الخدمات اللي كتكتبها العميلات بأشكال مختلفة — جاوبي عليها مباشرة:
  - "ليميش" / "limicha" / "les mèches" / "mèches" / "meches" / "highlights" → Mèches (صبغة جزئية على خصلات)
  - "كولوراسيون" / "coloration" / "لوان" / "صبغة كاملة" → Coloration
  - "بالياج" / "balayage" → Balayage
  - "بروتين" / "lissage" / "كيراتين" → Lissage
  - "برشاج" / "brushing" → Brushing
• لو سألات عن خدمة محددة → اذكري السعر مباشرة بشكل طبيعي، جملة وحدة أو جملتين
• لا تقولي أبداً "تواصلي معنا للأسعار" — هي معاكِ الآن
• لو السعر "à partir de X" → قولي "كيبدأ من X درهم حسب الطول"
• لو السعر ثابت → هو ثابت فقط
• للحجز → لو العميلة بغات تحجز، اتفقي معاها على التاريخ والساعة بشكل واضح، وبعد ما يتأكد كل شي قولي جملة فيها: اسم الخدمة + التاريخ + الساعة — مثال: "تمام، الموعد لـ إزالة الشعر يوم غدا مع 14:00 مؤكد عندنا 🌸" — لا تعطي رقم هاتف ولا تستعملي اسم العميلة
• مهم جداً: لما تأكدي موعد محدد → لازم تذكري في نفس الرسالة: اسم الخدمة بوضوح + التاريخ (اليوم/غدا/اسم اليوم) + الساعة — هاد المعلومات ضرورية باش يتسجل الموعد في النظام تلقائياً

━━━ معلومات الموعد القادم للعميلة ━━━
${ctx.upcomingAppointment === undefined
  ? "• ما عندناش معلومات عن مواعيد هاد العميلة — لا تذكري أي موعد محدد إلا لو هي سألت"
  : ctx.upcomingAppointment === null
  ? "• ⚠️ هاد العميلة ما عندها مواعيد قادمة مسجلة — لا تذكري أي موعد من محادثات قديمة أبداً. إذا جات تقول غداً عندها موعد أو سألت، قوليها 'حالياً ما عندكِ موعد مسجل عندنا' وعرضي عليها تحجز واحد"
  : `• ✅ عندها موعد قادم: ${ctx.upcomingAppointment.service} — ${ctx.upcomingAppointment.date} مع ${ctx.upcomingAppointment.time}
• لو العميلة سألت أو رمّحت للموعد → ذكريه بشكل طبيعي وسأليها إذا كان كاين شي آخر
• لا تذكري الموعد بشكل تلقائي في كل رسالة — فقط لما يكون ذو صلة أو سألت`}

━━━ فريق العمل والغرفة الخاصة — قاعدة ذهبية لا تتخلي عنها ━━━
${ctx.staffMembers && ctx.staffMembers.length > 0 ? `فريق الصالون (معلومة سرية — استخدميها للرد فقط):
${ctx.staffMembers.map(s => `• ${s.name} — ${s.gender === 'female' ? 'بنت 👩' : 'راجل 👨'}`).join('\n')}
الموظفات البنات: ${ctx.staffMembers.filter(s => s.gender === 'female').map(s => s.name).join('، ') || 'ما كاين حالياً'}
الموظفين الرجال: ${ctx.staffMembers.filter(s => s.gender === 'male').map(s => s.name).join('، ') || 'ما كاين حالياً'}
` : ''}
⚡ متى ما سألات أي عميلة عن جنس الفريق — سواء بالعربية أو الفرنسية أو الإنجليزية — اتبعي هاد السكريبت بالضبط:

السؤال اللي كيطلع: "واش عندكم بنات ولا رجال؟" / "homme ou femme?" / "do you have female staff?" / "مين كيخدم؟" / "هل الموظف رجل؟" / أي صياغة مشابهة

ردك الصحيح دائماً — 3 نقط في رسالة وحدة:
1. نعم عندنا بنات ورجال في الفريق
2. إذا بغيتي بنت فقط — واخا مشكل، كنقدرو
3. وعندنا كذلك غرفة خاصة كتخدم فيها البنات فقط — مخصصة للسيدات اللي كيحتاجن الخصوصية

مثال رد جاهز (نوعي في الصياغة، لكن المعنى ثابت):
"عندنا بنات ورجال في الفريق 😊 إلا إذا حبيتي تخدمي مع بنت فقط، ما كاين مشكل — وعندنا حتى غرفة خاصة كتخدم فيها البنات فقط للسيدات اللي بغاو الخصوصية 🌸"

مثال رد بالفرنسية:
"On a des hommes et des femmes dans l'équipe 😊 Si tu préfères être avec une femme, pas de problème du tout — on a même une salle privée où travaillent uniquement des femmes, pour plus d'intimité 🌸"

• لو سألات عن موظف بالاسم → جاوبيها بوضوح من قائمة الفريق أعلاه
• الغرفة الخاصة: مغلقة ومريحة، تخدم فيها البنات فقط بدون استثناء
• لما العميلة تأكد اهتمامها بالغرفة الخاصة → أضيفي في تأكيد الموعد: "الموعد ديالك في الغرفة الخاصة"

━━━ حالات خاصة ━━━
• صورة جاتك → حلليها بثقة: "من الصورة شايفة إن شعرك…" أو "هاد اللوك زوين، كنقدرو…"
• رسالة صوتية (🎙️ رسالة صوتية: "...") → جاوبي مباشرة على المحتوى بدون ما تذكري إنها صوتية
• 🚨 لو سألت عن العنوان أو الموقع أو "فين كاينين" أو "location" — سواء بصوت أو نص — عطيها دائماً رد نصي كامل يتضمن: العنوان الكامل${ctx.mapsLink ? ` ورابط Google Maps: ${ctx.mapsLink}` : ""} — لا ترسلي أبداً رسالة صوتية لطلبات العنوان والموقع، لأن الرابط لازم يكون قابل للنقر
• لو العميلة طاحت عليها سؤال ما عندكيش جوابه → كوني صادقة: "هاد السؤال خاصو يجاوبك عليه الفريق مباشرة 😊"

━━━ كلمات ممنوعة كلياً — لا تستعمليها أبداً ━━━
• غزالة / ghzala / زوينة / zouina
• حلوة / حلو (كتعبير عاطفي عن الشخص — مش عن الخدمة)
هاد الكلمات ما خصهاش تظهر في أي رسالة

━━━ الأسلوب العام ━━━
• جمل قصيرة وطبيعية — مش خطبة رسمية
• أول رسالة: 4 سطور كحد أقصى — دافئة ومرحبة
• كل رد بعد ذلك: من سطر إلى 3 سطور كحد أقصى — مختصر ومباشر، لا تتجاوزي 3 سطور أبداً
• ما تكتبيش قوائم طويلة بالنقط — كلمي بشكل طبيعي كأنك في محادثة
• لا تستعملي أقواس نجمة **كهاد** أو رؤوس قسم — الرسالة واتساب مش ورقة رسمية
• إيموجيات بالقدر اللازم: 💖 🌸 ✨ 💅 😊 — مش في كل كلمة
• أكملي جملتك دائماً حتى النهاية
• لا تقترحي الحجز في كل رسالة — فقط اقترحيه مرة واحدة إذا العميلة أبدت اهتماماً واضحاً بخدمة معينة أو سألت عن الأسعار والتفاصيل. في باقي الردود اختمي بجملة دافئة طبيعية قصيرة بدون دعوة للحجز`;

  cachedPromptKey = key;
  cachedPrompt = prompt;
  return prompt;
}

async function callGemini(
  model: string,
  userMessage: string,
  systemPrompt: string,
  apiKey: string,
  history: ConversationTurn[],
  imageBase64?: string,
  imageMimeType?: string
): Promise<{ reply: string | null; isQuotaError: boolean; isTruncated: boolean }> {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;

  // Build the current user message parts (text + optional image)
  const currentUserParts: any[] = [];
  if (imageBase64 && imageMimeType) {
    currentUserParts.push({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
  }
  // Always add text — use a default prompt if no caption was provided with the image
  currentUserParts.push({
    text: userMessage || (imageBase64 ? "شوفي هاد الصورة وجاوبي عليها بما يناسب الصالون." : ""),
  });

  const contents: { role: string; parts: any[] }[] = [
    ...history.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
    { role: "user", parts: currentUserParts },
  ];

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { maxOutputTokens: 300, temperature: 0.75 },
  });

  let response!: Response;
  const MAX_503_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_503_RETRIES; attempt++) {
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch (networkErr: any) {
      console.warn(`[Gemini] ${model} network error: ${networkErr.message}`);
      return { reply: null, isQuotaError: false, isTruncated: false };
    }
    if (response.status !== 503 || attempt === MAX_503_RETRIES) break;
    const wait = 3000 + attempt * 2000;
    console.warn(`[Gemini] ${model} overloaded (503) — retry ${attempt + 1}/${MAX_503_RETRIES} in ${wait / 1000}s`);
    await new Promise<void>((r) => setTimeout(r, wait));
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 429) {
      console.warn(`[Gemini] ${model} quota exhausted (429)`);
      return { reply: null, isQuotaError: true, isTruncated: false };
    }
    if (status === 503) {
      // Temporary overload — NOT a quota issue, just retry
      console.warn(`[Gemini] ${model} overloaded (503) — will retry`);
      return { reply: null, isQuotaError: false, isTruncated: false };
    }
    if (status === 404) {
      console.warn(`[Gemini] ${model} not found (404) — skipping`);
      return { reply: null, isQuotaError: false, isTruncated: false };
    }
    const errBody = await response.text();
    console.error(`[Gemini] ${model} error ${status}: ${errBody.slice(0, 300)}`);
    return { reply: null, isQuotaError: false, isTruncated: false };
  }

  const data = (await response.json()) as any;
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  const finishReason: string = candidate?.finishReason ?? "STOP";

  if (finishReason === "MAX_TOKENS") {
    console.warn(`[Gemini] ${model} truncated (MAX_TOKENS) — discarding`);
    return { reply: null, isQuotaError: false, isTruncated: true };
  }

  return { reply: text ? text.trim() : null, isQuotaError: false, isTruncated: false };
}

async function callGroq(
  model: string,
  userMessage: string,
  systemPrompt: string,
  apiKey: string,
  history: ConversationTurn[]
): Promise<{ reply: string | null; isQuotaError: boolean }> {
  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
    ...history.map((turn) => ({
      role: turn.role === "model" ? "assistant" : "user",
      content: turn.text,
    })),
    { role: "user", content: userMessage || "." },
  ];

  let response: Response;
  try {
    response = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 300,
        temperature: 0.75,
      }),
    });
  } catch (networkErr: any) {
    console.warn(`[Groq] ${model} network error: ${networkErr.message}`);
    return { reply: null, isQuotaError: false };
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 429) {
      console.warn(`[Groq] ${model} quota exhausted (429)`);
      return { reply: null, isQuotaError: true };
    }
    const errBody = await response.text();
    console.error(`[Groq] ${model} error ${status}: ${errBody.slice(0, 300)}`);
    return { reply: null, isQuotaError: false };
  }

  const data = (await response.json()) as any;
  let text: string | undefined = data?.choices?.[0]?.message?.content;
  // Strip <think>...</think> reasoning blocks (qwen3 and similar models)
  if (text) text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return { reply: text || null, isQuotaError: false };
}

/**
 * Transcribe a voice note (audio buffer as base64).
 *
 * Confirmed audio-capable Gemini models (from official docs, all support
 * Text/Image/Video/Audio/PDF inline input):
 *   gemini-2.5-flash-lite   — fastest, lowest cost          ✅ audio
 *   gemini-2.5-flash        — best price/perf balance        ✅ audio
 *   gemini-3-flash-preview  — newest gen (used in audio docs)✅ audio
 *   gemini-3.1-flash-lite-preview — frontier-class lite      ✅ audio
 *   gemini-1.5-flash        — proven, well-tested fallback   ✅ audio
 *
 * Final fallback: Groq Whisper large-v3-turbo (STT-only model, very fast).
 */
export async function transcribeAudio(
  audioBase64: string,
  mimeType: string   // e.g. "audio/ogg; codecs=opus"
): Promise<string | null> {
  // Strip codec params — keep only the base MIME type
  const cleanMime = mimeType.split(";")[0].trim();

  // ── 1. Gemini cascade — try from fastest to most capable ─────────────────
  const TRANSCRIPTION_MODELS = [
    "gemini-2.5-flash-lite",          // fastest current-gen, confirmed audio ✅
    "gemini-2.5-flash",               // more capable if lite fails           ✅
    "gemini-3-flash-preview",         // newest gen, shown in audio docs      ✅
    "gemini-3.1-flash-lite-preview",  // frontier-class lite preview          ✅
    "gemini-1.5-flash",               // proven STT fallback                  ✅
  ];

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (geminiKey) {
    for (const model of TRANSCRIPTION_MODELS) {
      // Skip if this model is on text-generation cooldown (quota hit)
      if (modelCooldowns[model] && Date.now() < modelCooldowns[model]) {
        const secs = Math.ceil((modelCooldowns[model] - Date.now()) / 1000);
        console.warn(`[Transcription] ${model} in cooldown (${secs}s) — skipping`);
        continue;
      }
      try {
        const url = `${GEMINI_BASE}/${model}:generateContent?key=${geminiKey}`;
        const body = JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: cleanMime, data: audioBase64 } },
              { text: "اكتبي نص هاد الرسالة الصوتية بالضبط كما هي، بدون أي تعليق أو إضافة." },
            ],
          }],
          generationConfig: { maxOutputTokens: 1500, temperature: 0 },
        });
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (res.ok) {
          const data = (await res.json()) as any;
          const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) {
            console.log(`[Transcription] ${model}: "${text.slice(0, 80)}"`);
            return text;
          }
          // Empty reply — try next model
          console.warn(`[Transcription] ${model}: empty reply — trying next`);
        } else {
          const status = res.status;
          if (status === 429) {
            modelCooldowns[model] = Date.now() + QUOTA_COOLDOWN_MS;
            console.warn(`[Transcription] ${model} quota (429) — cooldown, trying next`);
          } else if (status === 400) {
            // 400 usually means the model doesn't support this audio format/input
            const errBody = await res.text();
            const isUnsupported = errBody.includes("audio") || errBody.includes("INVALID_ARGUMENT") || errBody.includes("inlineData");
            console.warn(`[Transcription] ${model} 400${isUnsupported ? " (audio not supported)" : ""} — trying next`);
          } else {
            const errBody = await res.text();
            console.warn(`[Transcription] ${model} error ${status}: ${errBody.slice(0, 150)} — trying next`);
          }
        }
      } catch (err: any) {
        console.warn(`[Transcription] ${model} threw: ${err.message} — trying next`);
      }
    }
    console.warn("[Transcription] All Gemini models failed — trying Groq Whisper");
  }

  // ── 2. Groq Whisper large-v3-turbo fallback ───────────────────────────────
  const groqKey = process.env.XAI_API_KEY;
  if (groqKey) {
    try {
      const audioBuffer = Buffer.from(audioBase64, "base64");
      const extMap: Record<string, string> = {
        "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "mp4",
        "audio/webm": "webm", "audio/wav": "wav", "audio/flac": "flac",
        "audio/aac": "aac", "audio/aiff": "aiff",
      };
      const ext = extMap[cleanMime] ?? "ogg";

      const formData = new FormData();
      formData.append("file", new Blob([audioBuffer], { type: cleanMime }), `voice.${ext}`);
      formData.append("model", "whisper-large-v3-turbo");
      // No language hint — auto-detect handles Arabic / Darija / French better

      const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${groqKey}` },
        body: formData,
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        const text: string | undefined = data?.text?.trim();
        if (text) {
          console.log(`[Transcription] Groq Whisper: "${text.slice(0, 80)}"`);
          return text;
        }
      } else {
        const errBody = await res.text();
        console.warn(`[Transcription] Groq Whisper error ${res.status}: ${errBody.slice(0, 200)}`);
      }
    } catch (err: any) {
      console.warn(`[Transcription] Groq Whisper threw: ${err.message}`);
    }
  }

  console.warn("[Transcription] Both Gemini and Groq Whisper failed — returning null");
  return null;
}

/**
 * Convert text to speech using Gemini TTS models.
 * Cascade: gemini-3.1-flash-tts-preview → gemini-2.5-flash-preview-tts
 * Returns raw PCM audio as base64 + sample rate, or null if unavailable.
 *
 * Gemini TTS returns audio/L16 (signed 16-bit PCM) — convert to OGG/Opus
 * with ffmpeg before sending as a WhatsApp voice note.
 */
export const TTS_VOICES = [
  { id: "Aoede",  labelAr: "آوڤي",    descAr: "ناعمة ودافئة — مثالية للدارجة", feminine: true },
  { id: "Kore",   labelAr: "كوري",    descAr: "شبابية وحيوية — طاقة إيجابية",  feminine: true },
  { id: "Puck",   labelAr: "پاك",     descAr: "مرحة وخفيفة — تلقائية",        feminine: false },
  { id: "Charon", labelAr: "شارون",   descAr: "واثقة وهادئة — ثقة عالية",     feminine: false },
  { id: "Fenrir", labelAr: "فنرير",   descAr: "قوية ومقنعة — أسلوب حازم",    feminine: false },
];

export async function textToSpeech(
  text: string,
  voice?: string
): Promise<{ pcmBase64: string; sampleRate: number } | null> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (!geminiKey) return null;

  const TTS_MODELS = [
    "gemini-2.5-flash-preview-tts",   // best quality, primary
    "gemini-3.1-flash-tts-preview",   // newer preview fallback
  ];

  // Use the configured voice, defaulting to Aoede (best Arabic/Darija quality)
  const VOICE = voice && TTS_VOICES.some(v => v.id === voice) ? voice : "Aoede";

  for (const model of TTS_MODELS) {
    if (modelCooldowns[model] && Date.now() < modelCooldowns[model]) {
      const secs = Math.ceil((modelCooldowns[model] - Date.now()) / 1000);
      console.warn(`[TTS] ${model} in cooldown (${secs}s) — skipping`);
      continue;
    }
    try {
      const res = await fetch(
        `${GEMINI_BASE}/${model}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
              },
            },
          }),
        }
      );

      if (res.ok) {
        const data = (await res.json()) as any;
        const part = data?.candidates?.[0]?.content?.parts?.[0];
        const pcmBase64: string | undefined = part?.inlineData?.data;
        const mimeType: string = part?.inlineData?.mimeType ?? "audio/L16;rate=24000";

        if (pcmBase64) {
          // Extract sample rate from mime type e.g. "audio/L16;rate=24000"
          const rateMatch = mimeType.match(/rate=(\d+)/);
          const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
          console.log(`[TTS] ${model}: ${Math.round(pcmBase64.length * 0.75 / 1024)} KB PCM @ ${sampleRate}Hz`);
          return { pcmBase64, sampleRate };
        }
        console.warn(`[TTS] ${model}: empty audio response`);
      } else {
        const status = res.status;
        if (status === 429) {
          modelCooldowns[model] = Date.now() + QUOTA_COOLDOWN_MS;
          console.warn(`[TTS] ${model} quota (429) — cooldown, trying next`);
        } else {
          const errBody = await res.text();
          console.warn(`[TTS] ${model} error ${status}: ${errBody.slice(0, 150)}`);
        }
      }
    } catch (err: any) {
      console.warn(`[TTS] ${model} threw: ${err.message}`);
    }
  }

  console.warn("[TTS] All Gemini TTS models failed");
  return null;
}

export interface LearnedInsights {
  clientName?: string | null;
  language?: string;
  preferredServices?: string[];
  personalityNotes?: string | null;
  complaints?: string[]; // new salon complaints extracted from this conversation
  botErrors?: { wrongInfo: string; correctInfo: string }[]; // cases where the bot gave wrong info and was corrected
}

/**
 * After each bot reply, analyze the full conversation in the background and
 * extract structured client insights to enrich persistent memory.
 * Uses the lightest/fastest available model to avoid quota pressure.
 */
export async function learnFromConversation(
  history: ConversationTurn[],
  currentMemory: {
    clientName?: string | null;
    language?: string;
    preferredServices?: string[];
    personalityNotes?: string | null;
  },
  availableServices: string[]
): Promise<LearnedInsights | null> {
  // Need at least one full exchange (user + model) to learn from
  if (history.length < 2) return null;

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const groqKey = process.env.XAI_API_KEY;
  if (!apiKey && !groqKey) return null;

  const conversationText = history
    .map((t) => `${t.role === "user" ? "العميلة" : "لينا"}: ${t.text}`)
    .join("\n");

  const servicesStr = availableServices.join("، ") || "غير محددة";

  const prompt = `أنت نظام تحليل ذكي لصالون تجميل. حلل هاد المحادثة بدقة واستخرج معلومات مفيدة عن العميلة.

المحادثة:
${conversationText}

الخدمات المتاحة في الصالون: ${servicesStr}

المعلومات المحفوظة حالياً:
- الاسم: ${currentMemory.clientName || "غير معروف"}
- اللغة: ${currentMemory.language || "unknown"}
- الخدمات المهتمة بها: ${(currentMemory.preferredServices || []).join("، ") || "لا شيء"}
- ملاحظات سابقة: ${currentMemory.personalityNotes || "لا شيء"}

استخرج المعلومات التالية وأجب بـ JSON فقط بدون أي تفسير أو نص خارج الـ JSON:
{
  "clientName": "الاسم إذا ذُكر في المحادثة، وإلا null",
  "language": "arabic أو french أو darija أو unknown — اختر حسب لغة العميلة",
  "preferredServices": ["قائمة الخدمات التي سألت عنها أو أبدت اهتماماً بها من قائمة الصالون فقط"],
  "personalityNotes": "ملاحظة قصيرة (جملة أو جملتين) عن: أسلوبها في التواصل، تفضيلاتها، ميزانيتها إذا ظهرت، أي شيء يساعد على التعامل معها بشكل أفضل في المستقبل. null إذا ما عندكش معلومات كافية",
  "complaints": ["قائمة الشكاوى أو المشاكل عن الصالون — جملة واحدة لكل شكوى. مصفوفة فارغة [] إذا ما كانتش شي شكوى"],
  "botErrors": [
    {
      "wrongInfo": "المعلومة الخاطئة التي قالها البوت (لينا) — نص موجز",
      "correctInfo": "المعلومة الصحيحة التي صوّبتها العميلة أو التي يجب استخدامها"
    }
  ]
}

ملاحظات مهمة:
- botErrors: ابحث عن حالات قالت فيها العميلة "غلطتي", "هدا غلط", "معلومة خاطئة", "السعر غير صح", "لا هاد مو صحيح", "عندك غلط", "اللي قلتيه خاطئ", "non c'est pas ça", "c'est faux", "tu as tort", أو أي صياغة تشير إلى أن البوت أعطى معلومة خاطئة وصوّبتها العميلة.
- إذا ما لقيتيش أي خطأ من البوت → "botErrors": []`;

  const tryParseJSON = (text: string): LearnedInsights | null => {
    const cleaned = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/gi, "")
      .trim();
    // Try direct parse first
    try {
      return JSON.parse(cleaned) as LearnedInsights;
    } catch { /* fall through */ }
    // If Gemini added text before/after the JSON, extract the object
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as LearnedInsights;
      } catch { /* fall through */ }
    }
    // Handle truncated JSON responses by attempting to repair them
    // Find the start of the JSON object and try to close it gracefully
    const startIdx = cleaned.indexOf('{');
    if (startIdx !== -1) {
      let partial = cleaned.slice(startIdx);
      // Remove the last incomplete line (truncated mid-string)
      const lastNewline = partial.lastIndexOf('\n');
      if (lastNewline > 0) {
        partial = partial.slice(0, lastNewline);
      }
      // Remove any trailing commas before closing
      partial = partial.replace(/,\s*$/, '');
      // Close any open arrays then close the object
      const openArrays = (partial.match(/\[/g) || []).length - (partial.match(/\]/g) || []).length;
      const openObjects = (partial.match(/\{/g) || []).length - (partial.match(/\}/g) || []).length;
      for (let i = 0; i < openArrays; i++) partial += ']';
      for (let i = 0; i < openObjects; i++) partial += '}';
      try {
        return JSON.parse(partial) as LearnedInsights;
      } catch { /* fall through */ }
    }
    console.warn("[BotLearn] Could not parse Gemini response as JSON:", cleaned.slice(0, 200));
    return null;
  };

  // Try Gemini with lightest model first
  if (apiKey) {
    const learningModels = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];
    for (const model of learningModels) {
      if (modelCooldowns[model] && Date.now() < modelCooldowns[model]) continue;
      try {
        const res = await fetch(
          `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 4096, temperature: 0.2 },
            }),
          }
        );
        if (res.ok) {
          const data = (await res.json()) as any;
          const text: string =
            data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
          const parsed = tryParseJSON(text);
          if (parsed) {
            console.log(`[BotLearn] Gemini ${model} extracted insights`);
            return parsed;
          }
          console.warn(`[BotLearn] Gemini ${model} returned unparseable response`);
        } else if (res.status === 429) {
          modelCooldowns[model] = Date.now() + QUOTA_COOLDOWN_MS;
          console.warn(`[BotLearn] Gemini ${model} quota exceeded — cooling down`);
        } else {
          console.warn(`[BotLearn] Gemini ${model} returned HTTP ${res.status}`);
        }
      } catch (err: any) {
        console.warn(`[BotLearn] Gemini ${model} failed: ${err.message}`);
      }
    }
  }

  // Groq fallback — fast small model
  if (groqKey) {
    try {
      const res = await fetch(`${GROQ_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 500,
          temperature: 0.2,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        let text: string =
          data?.choices?.[0]?.message?.content?.trim() ?? "";
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        const parsed = tryParseJSON(text);
        if (parsed) {
          console.log("[BotLearn] Groq llama-3.1-8b extracted insights");
          return parsed;
        }
      }
    } catch (err: any) {
      console.warn(`[BotLearn] Groq failed: ${err.message}`);
    }
  }

  return null;
}

/**
 * Ask Gemini with multi-turn history, optional client memory, and optional image.
 * Falls back through all free-tier Groq models if all Gemini models are exhausted.
 * Truncated responses are never saved to history.
 */
export async function askGemini(
  userMessage: string,
  ctx: SalonContext,
  history: ConversationTurn[] = [],
  imageBase64?: string,
  imageMimeType?: string
): Promise<{ reply: string | null; newHistory: ConversationTurn[] }> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const systemPrompt = buildSystemPrompt(ctx);
  const now = Date.now();

  if (apiKey) {
    for (let i = 0; i < MODEL_CASCADE.length; i++) {
      const model = MODEL_CASCADE[i];

      // Skip model if it's still in its per-model cooldown
      if (modelCooldowns[model] && now < modelCooldowns[model]) {
        const secs = Math.ceil((modelCooldowns[model] - now) / 1000);
        console.warn(`[Gemini] ${model} in cooldown (${secs}s) — skipping to next`);
        continue;
      }

      try {
        const { reply, isQuotaError, isTruncated } = await callGemini(
          model, userMessage, systemPrompt, apiKey, history, imageBase64, imageMimeType
        );

        if (reply) {
          console.log(`[Gemini] ${model} replied (turn ${Math.floor(history.length / 2) + 1})${imageBase64 ? " [with image]" : ""}`);
          const historyUserText = imageBase64
            ? `[صورة]${userMessage ? ` + "${userMessage}"` : ""}`
            : userMessage;
          const newHistory: ConversationTurn[] = [
            ...history,
            { role: "user", text: historyUserText },
            { role: "model", text: reply },
          ];
          return { reply, newHistory };
        }

        if (isQuotaError) {
          modelCooldowns[model] = Date.now() + QUOTA_COOLDOWN_MS;
          console.error(`[Gemini] Quota exhausted on ${model} — cooldown ${QUOTA_COOLDOWN_MS / 1000}s, trying next model…`);
          continue;
        }

        if (i < MODEL_CASCADE.length - 1) {
          const reason = isTruncated ? "truncated" : "failed";
          console.warn(`[Gemini] ${model} ${reason} — trying next model in ~2-3s`);
          await retryDelay();
        }
      } catch (err: any) {
        console.error(`[Gemini] ${model} threw: ${err.message}`);
        if (i < MODEL_CASCADE.length - 1) await retryDelay();
      }
    }
    console.warn("[Gemini] All models exhausted — trying Groq fallback…");
  } else {
    console.warn("[Gemini] No API key — trying Groq fallback…");
  }

  // Groq cascade fallback — all free-tier models in order of quality
  const groqKey = process.env.XAI_API_KEY;
  if (groqKey) {
    const turn = Math.floor(history.length / 2) + 1;
    for (let i = 0; i < GROQ_CASCADE.length; i++) {
      const model = GROQ_CASCADE[i];

      if (modelCooldowns[model] && Date.now() < modelCooldowns[model]) {
        const secs = Math.ceil((modelCooldowns[model] - Date.now()) / 1000);
        console.warn(`[Groq] ${model} in cooldown (${secs}s) — skipping`);
        continue;
      }

      try {
        const { reply, isQuotaError } = await callGroq(
          model, userMessage, systemPrompt, groqKey, history
        );

        if (reply) {
          console.log(`[Groq] ${model} replied (turn ${turn})`);
          const historyUserText = imageBase64
            ? `[صورة]${userMessage ? ` + "${userMessage}"` : ""}`
            : userMessage;
          const newHistory: ConversationTurn[] = [
            ...history,
            { role: "user", text: historyUserText },
            { role: "model", text: reply },
          ];
          return { reply, newHistory };
        }

        if (isQuotaError) {
          modelCooldowns[model] = Date.now() + QUOTA_COOLDOWN_MS;
          console.error(`[Groq] Quota exhausted on ${model} — cooldown ${QUOTA_COOLDOWN_MS / 1000}s, trying next…`);
          continue;
        }

        if (i < GROQ_CASCADE.length - 1) {
          console.warn(`[Groq] ${model} failed — trying next model…`);
          await retryDelay();
        }
      } catch (err: any) {
        console.error(`[Groq] ${model} threw: ${err.message}`);
        if (i < GROQ_CASCADE.length - 1) await retryDelay();
      }
    }
    console.error("[Groq] All models exhausted");
  } else {
    console.warn("[Groq] No XAI_API_KEY set — skipping Groq fallback");
  }

  console.error("[AI] All models exhausted — fallback reply");
  return { reply: FALLBACK_REPLY, newHistory: history };
}

// ── Image Generation (Hugging Face FLUX cascade) ─────────────────────────────

const HF_BASE = "https://router.huggingface.co/hf-inference/models";

// Cascade: best quality first → fallback automatically on rate limit or error
const HF_IMAGE_CASCADE = [
  "black-forest-labs/FLUX.1-schnell",          // fastest, great quality (free)
  "black-forest-labs/FLUX.1-dev",              // highest quality (free, slower)
  "stabilityai/stable-diffusion-xl-base-1.0",  // reliable fallback
];

/**
 * Generate a beauty/salon related image via Hugging Face Inference API.
 * Uses FLUX.1-schnell → FLUX.1-dev → SDXL cascade.
 * Returns { base64, mimeType, model } or null if all models fail.
 */
export async function generateImage(
  userRequest: string,
  salonName: string = "PREGASQUAD"
): Promise<{ base64: string; mimeType: string; model: string } | null> {
  const hfToken = process.env.HF_TOKEN;
  if (!hfToken) {
    console.warn("[ImageGen] No HF_TOKEN — skipping image generation");
    return null;
  }

  // Build a beauty-focused English prompt (FLUX works best in English)
  const prompt = [
    `Professional beauty salon photo, high quality, photorealistic, elegant.`,
    `Subject: "${userRequest}".`,
    `Style guidelines:`,
    `hairstyle or haircut: finished look on a model, soft studio lighting, sharp detail;`,
    `nail art: close-up of beautifully done nails, clean elegant background;`,
    `makeup: glowing skin, professional makeup look, clean aesthetic;`,
    `balayage or hair color: finished color result clearly visible, warm salon lighting;`,
    `general: luxurious beauty salon aesthetic, warm tones, aspirational.`,
    `No text overlays. No watermarks. Elegant and aspirational.`,
  ].join(" ");

  for (const model of HF_IMAGE_CASCADE) {
    // Per-model cooldown for 429s
    if (modelCooldowns[model] && Date.now() < modelCooldowns[model]) {
      const secs = Math.ceil((modelCooldowns[model] - Date.now()) / 1000);
      console.warn(`[ImageGen] ${model} in cooldown (${secs}s) — trying next`);
      continue;
    }

    try {
      const res = await fetch(`${HF_BASE}/${model}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hfToken}`,
          "Content-Type": "application/json",
          "x-use-cache": "0", // always generate a fresh image
        },
        body: JSON.stringify({ inputs: prompt }),
      });

      if (res.status === 429 || res.status === 503) {
        // 503 = model loading (cold start) — treat like quota
        modelCooldowns[model] = Date.now() + 30_000; // 30s cooldown
        const msg = res.status === 503 ? "model loading (cold start)" : "rate limited";
        console.warn(`[ImageGen] ${model} ${msg} — trying next`);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[ImageGen] ${model} error ${res.status}: ${errText.slice(0, 200)} — trying next`);
        continue;
      }

      // HF returns raw binary image bytes (not JSON)
      const arrayBuffer = await res.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength < 1000) {
        console.warn(`[ImageGen] ${model} returned empty/tiny response — trying next`);
        continue;
      }

      const base64 = Buffer.from(arrayBuffer).toString("base64");
      // Detect mime type from response Content-Type header
      const ct = res.headers.get("content-type") || "image/png";
      const mimeType = ct.split(";")[0].trim();

      console.log(`[ImageGen] ✓ ${model} generated image (${mimeType}, ${Math.round(arrayBuffer.byteLength / 1024)}KB)`);
      return { base64, mimeType, model };

    } catch (err: any) {
      console.warn(`[ImageGen] ${model} threw: ${err.message} — trying next`);
    }
  }

  console.error("[ImageGen] All HF models in cascade failed");
  return null;
}

/**
 * After the bot sends a reply, check whether it just verbally confirmed a specific
 * appointment (date + time). If yes, extract those details so the server can create
 * a real DB record instead of just saying "مسجل عندنا" with nothing saved.
 *
 * Uses purely deterministic regex — no extra AI call, no quota cost.
 * Returns { date: "YYYY-MM-DD", time: "HH:MM", service: string|null } or null.
 */
export function extractBotConfirmedAppointment(
  botReply: string,
  conversationHistory: ConversationTurn[],
  todayDateStr: string, // "YYYY-MM-DD"
  knownServices?: { name: string }[]
): { date: string; time: string; service: string | null; price: number | null } | null {
  // ── 1. Is this reply a confirmation at all? ───────────────────────────────
  const confirmRx = /مؤكد|مؤكدة|مسجل|مسجلة|ثابت|تسجيل|تم التأكيد|تم الحجز|تم التسجيل|حجزك جاهز|حجز مؤكد|راه حجوزة|راه مسجل|غادي نشوفوك|ننتظروك|ننتظروكِ|موعدك مسجل|موعدك ثابت|موعدك محجوز|موعد مسجل|موعد محجوز|حجزناك|حجزناكِ|حجزتيك|شدينا ليك|شدينالك|كتبنا ليك|كتبناك|سجلنا ليك|سجلناك|ثبتنا ليك|ثبتناك|محجوزة ليك|محجوز ليك|موعدك كاين|نستناوك|كنستناوك|كنستناوكِ|هنا نستناوك|متنساش|واخا.*موعد|موعد.*واخا|نتسناوك|كنتسناوك|تنورينا|الموعد ديالك|الموعد تأكد|تأكد.*إن شاء الله|صافي.*الموعد|هانية حبيبتي|مؤكد عندنا|confirmé|confirmée|confirm|c'est noté|c'est enregistré|c'est fait|c'est bon|c'est pris|c'est réservé|c'est validé|noté|enregistré|réservé|réservée|validé|on vous attend|on t'attend|on se voit|rendez-vous.*confirm|votre.*rendez-vous|rdv confirmé|rdv pris|rendez-vous pris|rendez-vous réservé|je vous inscris|je t'inscris|inscrit|je note|je l'ai noté|votre place/i;
  if (!confirmRx.test(botReply)) return null;

  // ── 2. Search sources: bot reply FIRST, then full history as fallback ────
  // This prevents picking up times/dates from earlier turns of the conversation
  // (e.g. "10h was unavailable → confirmed for 14h30" would wrongly extract 10h).
  const allText = [
    ...conversationHistory.map((t) => t.text),
    botReply,
  ].join(" ");

  // "Recent text" = bot reply + last 4 messages — used to prioritise service
  // detection so old mentions of a different service don't override the current one.
  const recentText = [
    ...conversationHistory.slice(-4).map((t) => t.text),
    botReply,
  ].join(" ");

  // ── 3. Extract time — search bot reply first, then full history ───────────
  // Matches: "14:30", "14h30", "14h", "الساعة 14", "à 14h30"
  const timePatterns = [
    /\b(\d{1,2}):(\d{2})\b/,
    /\b(\d{1,2})h(\d{2})?\b/i,
    /(?:الساعة|ساعة|في الساعة|à|at)\s+(\d{1,2})(?::(\d{2}))?/i,
  ];

  function extractTime(src: string): { hour: number; minute: number } | null {
    for (const rx of timePatterns) {
      const m = src.match(rx);
      if (m) {
        const h = parseInt(m[1] ?? "0", 10);
        const mn = parseInt(m[2] ?? "0", 10);
        if (!isNaN(h) && h >= 6 && h <= 23) {
          return { hour: h, minute: isNaN(mn) ? 0 : mn };
        }
      }
    }
    return null;
  }

  // Only look for the time in the bot reply itself — falling back to allText
  // risks picking up times mentioned earlier in conversation (e.g. "10h was
  // unavailable, confirmed for 14h") and extracting the wrong time slot.
  const timeResult = extractTime(botReply);
  if (!timeResult) return null; // no recognisable time in this reply → don't create ghost appointment

  const timeStr = `${String(timeResult.hour).padStart(2, "0")}:${String(timeResult.minute).padStart(2, "0")}`;

  // ── 4. Extract date — search bot reply first, then full history ───────────
  const today = new Date(todayDateStr);
  const addDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().split("T")[0];
  };

  const arabicMonths: Record<string, number> = {
    يناير: 1, فبراير: 2, مارس: 3, أبريل: 4, مايو: 5, يونيو: 6,
    يوليو: 7, أغسطس: 8, سبتمبر: 9, أكتوبر: 10, نوفمبر: 11, دسمبر: 12,
    ماي: 5, // Darija/French
    janvier: 1, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
    juillet: 7, août: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12,
  };

  // Named-day → JS day-of-week index (0=Sun, 1=Mon, ... 6=Sat)
  const namedDayIndex: Record<string, number> = {
    // Arabic
    "الأحد": 0, "الاحد": 0,
    "الاثنين": 1, "الإثنين": 1,
    "الثلاثاء": 2,
    "الأربعاء": 3, "الاربعاء": 3,
    "الخميس": 4,
    "الجمعة": 5, "الجمعه": 5,
    "السبت": 6,
    // French
    "dimanche": 0,
    "lundi": 1,
    "mardi": 2,
    "mercredi": 3,
    "jeudi": 4,
    "vendredi": 5,
    "samedi": 6,
  };

  /** Returns the next occurrence of dayIndex from today (0 = today if it matches). */
  function nextWeekday(dayIndex: number): string {
    const todayDow = today.getDay();
    const diff = (dayIndex - todayDow + 7) % 7;
    return addDays(diff === 0 ? 7 : diff); // 0 diff = same DOW as today → next week
  }

  function extractDate(src: string): string | null {
    // Note: \b does not work with Arabic — use whitespace/punctuation boundaries instead
    // Check longer patterns FIRST to avoid "غدا" inside "بعد غدا" matching prematurely
    // Relative: "بعد غدا" / "après-demain" (+2 days)
    if (/(^|[\s،,])(بعد غدا|بعد غداً|بعد غد)([\s،,]|$)|après.demain|\bday after tomorrow\b/i.test(src)) return addDays(2);
    // Relative: "غدا" / "demain" / "tomorrow" (+1 day)
    if (/(^|[\s،,،.!؟?])(غدا|غداً|غد|باكر|بكرا)([\s،,،.!؟?]|$)|\bdemain\b|\btomorrow\b/i.test(src)) return addDays(1);
    // Relative: "اليوم" / "aujourd'hui" / "today" (0 days)
    if (/(^|[\s،,،.!؟?])(اليوم|دابا)([\s،,،.!؟?]|$)|\baujourd'hui\b|\btoday\b/i.test(src)) return todayDateStr;

    // Named weekday — "يوم الاثنين", "le lundi", "lundi prochain", "الخميس القادم"
    for (const [name, dow] of Object.entries(namedDayIndex)) {
      // Allow the day name to appear with optional prefix (يوم / le / ce / next)
      const rx = new RegExp(`(?:يوم\\s+|le\\s+|ce\\s+|next\\s+)?${name}(?:\\s+(?:القادم|المقبل|prochain|qui vient|next))?`, "i");
      if (rx.test(src)) return nextWeekday(dow);
    }

    // Named month "15 mai" / "15 مايو" / "15 ماي"
    for (const [mName, mNum] of Object.entries(arabicMonths)) {
      const rx = new RegExp(`(\\d{1,2})\\s+${mName}(?:\\b|\\s|$)`, "i");
      const m = src.match(rx);
      if (m) {
        const day = parseInt(m[1], 10);
        if (day >= 1 && day <= 31) {
          const yr = today.getFullYear();
          return `${yr}-${String(mNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
      }
    }

    // Numeric: "15/05" or "15-05" or "15.05"
    const numDate = src.match(/\b(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?\b/);
    if (numDate) {
      const day = parseInt(numDate[1], 10);
      const mon = parseInt(numDate[2], 10);
      const yr = numDate[3] ? parseInt(numDate[3].length === 2 ? "20" + numDate[3] : numDate[3], 10) : today.getFullYear();
      if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) {
        return `${yr}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
    return null;
  }

  // Search bot reply first, then recent history only (last 4 messages) —
  // full allText would risk picking up stale dates from old conversation turns.
  const dateStr = extractDate(botReply) ?? extractDate(recentText);
  if (!dateStr) return null; // no recognisable date → skip

  // ── 5. Extract service ────────────────────────────────────────────────────
  // Priority order:
  //   A) Exact DB service name found in bot reply or recent history (most reliable)
  //   B) Quoted service name in bot reply / recent / full history
  //   C) "لـ <service>" unquoted pattern in bot reply or recent
  //   D) Keyword fallback against bot reply + recent only (NOT full history)
  // This order ensures we always prefer the real DB name when the bot mentions it
  // explicitly, and avoids picking up services mentioned in earlier unrelated turns.

  let service: string | null = null;

  const OPEN_Q  = "[\u0022\u201C\u00AB]"; // " " «
  const CLOSE_Q = "[\u0022\u201D\u00BB]"; // " " »
  const INSIDE  = "[^\u0022\u201C\u201D\u00AB\u00BB\n]{2,45}";
  const quotedRx = new RegExp(`${OPEN_Q}(${INSIDE})${CLOSE_Q}`, "g");
  const notService = /^(ok|merci|شكرا|واخا|تمام|مزيان|صحة|سلامة|demain|today|اليوم|غدا|باكر|سارة|anji|yousra|fatima|nadia|prix|salqm|خدمة واتساب|\d+)$/i;

  // ── A. Known DB services — highest priority ──────────────────────────────
  // Search bot reply first, then recent text, then full history.
  // Use word-boundary-safe matching (spaces / punctuation around name).
  if (knownServices && knownServices.length > 0) {
    const sources = [botReply, recentText, allText];
    for (const src of sources) {
      const srcLower = src.toLowerCase();
      // Sort by name length desc so longer / more specific names match first
      const sorted = [...knownServices].sort((a, b) => b.name.length - a.name.length);
      for (const svc of sorted) {
        if (srcLower.includes(svc.name.toLowerCase())) {
          service = svc.name;
          break;
        }
      }
      if (service) break;
    }
  }

  // ── B. Quoted service name in bot reply → recent → full history ───────────
  if (!service) {
    const searchSources2 = [botReply, recentText, allText];
    for (const src of searchSources2) {
      quotedRx.lastIndex = 0;
      const found: string[] = [];
      let qm: RegExpExecArray | null;
      while ((qm = quotedRx.exec(src)) !== null) {
        const s = qm[1].trim();
        if (s.length >= 2 && s.length <= 45 && !notService.test(s) && !found.includes(s)) {
          found.push(s);
        }
      }
      if (found.length >= 1) {
        service = found.join(" + ");
        break;
      }
    }
    // If found from quoted text, try to upgrade to real DB service name
    if (service && knownServices && knownServices.length > 0) {
      const lowerSvc = service.toLowerCase();
      const upgrade = knownServices
        .sort((a, b) => b.name.length - a.name.length)
        .find(s => {
          const sn = s.name.toLowerCase();
          return sn.includes(lowerSvc) || lowerSvc.includes(sn);
        });
      if (upgrade) service = upgrade.name;
    }
  }

  // ── C. Unquoted "لـ <service>" pattern in bot reply / recent ─────────────
  if (!service) {
    const directServiceRx = /لـ\s*[\u0022\u201C\u00AB]?([^\u0022\u201C\u201D\u00AB\u00BB\n،,+]{2,45}?)(?:[\u0022\u201D\u00BB]|\s+(?:يوم|مع|تأكد|مؤكد|غدا|اليوم|في\s+\d))/;
    const directMatch = botReply.match(directServiceRx) ?? recentText.match(directServiceRx);
    if (directMatch) {
      const svcRaw = directMatch[1].trim();
      if (svcRaw.length >= 2 && svcRaw.length <= 45 && !notService.test(svcRaw)) {
        service = svcRaw;
        // Try to upgrade to real DB service name
        if (knownServices && knownServices.length > 0) {
          const lowerSvc = service.toLowerCase();
          const upgrade = knownServices
            .sort((a, b) => b.name.length - a.name.length)
            .find(s => s.name.toLowerCase().includes(lowerSvc) || lowerSvc.includes(s.name.toLowerCase()));
          if (upgrade) service = upgrade.name;
        }
      }
    }
  }

  // ── D. Keyword fallback — bot reply + recent text only (NOT full history) ──
  // Excludes generic words ("موعد", "خدمة", "soins", "rendez-vous") that appear
  // in almost every appointment reply and don't identify a specific service.
  if (!service) {
    const serviceKeywords = [
      // Hair colour
      "balayage", "بالياج", "ombré", "ombre", "coloration", "صبغة", "صبغ",
      "mèches", "meches", "highlights", "teinture", "couleur cheveux",
      // Smoothing / keratin
      "كيراتين", "keratin", "lissage", "تمليس", "protéine", "proteine", "بروتين",
      "lissage protéiné", "lissage proteine", "black caviar", "botox capillaire",
      // Cut & style
      "coupe", "قصة", "قص", "brushing", "brushin", "mise en plis",
      // Makeup
      "مكياج", "makeup", "maquillage", "faux cils",
      "maquillage fiancée", "maquillage mariée", "maquillage soirée",
      // Nails
      "مانيكور", "مانيكير", "manucure", "pédicure", "pedicure", "بيديكير",
      "vernis permanent", "semi-permanent", "nail art", "أظافر",
      // Face & skin
      "soins visage", "soin visage", "soin du visage", "facial",
      "gommage", "masque", "soin classique", "soin hydratant", "peeling",
      // Brows & hair removal
      "حواجب", "sourcils", "épilation", "عرو", "épilation cire",
      // Body
      "soin corps", "صوان", "massage", "hammam",
    ];
    const kwSources = [botReply, recentText]; // ← NOT full history
    outer:
    for (const src of kwSources) {
      for (const kw of serviceKeywords) {
        if (new RegExp(`\\b${kw}\\b`, "i").test(src)) {
          service = kw;
          break outer;
        }
      }
    }
    // Normalise keyword to prettier label
    if (service) {
      const serviceLabels: Record<string, string> = {
        "balayage": "Balayage", "بالياج": "Balayage",
        "coloration": "Coloration", "صبغة": "Coloration", "صبغ": "Coloration",
        "couleur cheveux": "Coloration", "teinture": "Coloration",
        "كيراتين": "Kératine", "keratin": "Kératine", "lissage": "Lissage",
        "coupe": "Coupe", "قصة": "Coupe", "قص": "Coupe",
        "brushing": "Brushing",
        "makeup": "Maquillage", "maquillage": "Maquillage", "مكياج": "Maquillage",
        "manucure": "Manucure", "مانيكور": "Manucure", "مانيكير": "Manucure",
        "pédicure": "Pédicure", "pedicure": "Pédicure", "بيديكير": "Pédicure",
        "sourcils": "Sourcils", "حواجب": "Sourcils",
        "épilation": "Épilation", "عرو": "Épilation", "épilation cire": "Épilation",
        "massage": "Massage", "hammam": "Hammam",
        "ombré": "Ombré", "ombre": "Ombré",
        "mèches": "Mèches", "meches": "Mèches", "highlights": "Mèches",
        "protéine": "Soin Protéiné", "proteine": "Soin Protéiné", "بروتين": "Soin Protéiné",
        "botox capillaire": "Botox Capillaire",
        "soins visage": "Soin Visage", "soin visage": "Soin Visage", "soin du visage": "Soin Visage",
        "gommage": "Gommage", "peeling": "Peeling",
      };
      service = serviceLabels[service.toLowerCase()] ?? service;
      // Final attempt to match to real DB service
      if (knownServices && knownServices.length > 0) {
        const lowerSvc = service.toLowerCase();
        const upgrade = knownServices
          .sort((a, b) => b.name.length - a.name.length)
          .find(s => s.name.toLowerCase().includes(lowerSvc) || lowerSvc.includes(s.name.toLowerCase()));
        if (upgrade) service = upgrade.name;
      }
    }
  }

  // ── 6. Extract price from recent messages (best-effort) ──────────────────
  // Looks for patterns like "300 DH", "350 درهم", "prix: 250", "coûte 400 MAD"
  let price: number | null = null;
  const pricePatterns = [
    // "300 DH", "300 dh", "300 MAD", "300 mad"
    /(\d{2,5})\s*(?:dh|DH|MAD|mad|dirhams?)\b/,
    // "300 درهم", "300درهم"
    /(\d{2,5})\s*درهم/,
    // "prix.*?(\d{2,5})", "coûte.*?(\d{2,5})", "السعر.*?(\d{2,5})"
    /(?:prix|coûte|coute|السعر|سعر|ثمنه?|يكلف)[^0-9]{0,15}(\d{2,5})/i,
    // "(\d{2,5}) DH" with optional suffix label
    /(\d{2,5})\s*(?:دراهم|درهم|DH|dh|MAD)/,
  ];
  for (const rx of pricePatterns) {
    const m = recentText.match(rx);
    if (m) {
      const val = parseInt(m[1] ?? m[2] ?? "0", 10);
      if (val >= 10 && val <= 50000) { price = val; break; }
    }
  }

  return { date: dateStr, time: timeStr, service, price };
}

/**
 * Sanitize a client name extracted by BotLearn.
 * Rejects strings that are clearly not names (greetings, price words, single chars, etc.)
 * Returns null if the value should be discarded.
 */
export function sanitizeClientName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (v.length < 2 || v.length > 50) return null;

  // Reject if it contains obvious non-name words
  const badWords = [
    // French non-names
    "prix", "salam", "salqm", "bonjour", "bonsoir", "salut", "merci",
    "oui", "non", "bien", "ok", "okay", "votre", "voici", "demain",
    "aujourd", "rendez", "rdv", "service", "coloration", "balayage",
    "keratin", "coupe", "brushing", "maquillage",
    // Arabic non-names
    "مرحبا", "السلام", "شكراً", "شكرا", "واخا", "البوت", "الموعد",
    "الخدمة", "السعر", "عميل",
    // English
    "hello", "hi", "yes", "no", "thanks",
  ];
  const lower = v.toLowerCase();
  for (const w of badWords) {
    if (lower.includes(w)) return null;
  }

  // Reject if it's mostly digits or punctuation
  const alphaCount = (v.match(/[\p{L}]/gu) || []).length;
  if (alphaCount < 2) return null;

  return v;
}

/**
 * Detect if the client is asking for an image/photo of a beauty service.
 * Returns true for Arabic, Darija, and French image requests.
 */
export function detectImageRequest(text: string): boolean {
  const t = text.toLowerCase().trim();
  // Patterns chosen to be specific enough to avoid common false positives:
  // - Removed "شكل" (extremely common Darija word meaning "form/how")
  // - Removed "مثال/أمثلة" (common Arabic "example" words)
  // - Removed "\bvoir\b" (common French verb "to see", triggers on any price inquiry)
  // - "montre" narrowed to "montre-moi/montrez-moi" only (avoids noun "watch")
  return /أريني|اريني|أرسلي|ارسلي|أرسل|ارسل صورة|صورة|صور|وريني|ورني|كيف يبدو|كيف تبدو|show me|photo|image|picture|exemple photo|montrez?-moi|montrez?\s+moi|montrez?\s+une|envoie|résultat|résultats|send photo|بالصورة|بالصور|صورة.*قصة|صورة.*شعر|صورة.*مكياج|صورة.*أظافر|صورة.*ألوان|صورة.*بالياج|صورة.*نقش|صورة.*سباحة|صورة.*سبا/i.test(t);
}
