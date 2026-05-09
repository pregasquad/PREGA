const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
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
  clientMemory?: ClientMemory;
  isNewConversation?: boolean; // true = first message in this session / day
  resolvedComplaints?: { complaint: string; fix: string }[]; // salon-level learnings
  botCorrections?: { wrongInfo: string; correctInfo: string }[]; // bot's own past mistakes + correct answers
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
    ? `${mem.clientName ?? ""}|${mem.language ?? ""}|${(mem.preferredServices ?? []).join(",")}|${mem.visitCount ?? 0}`
    : "";
  const key = `${ctx.name}|${ctx.currency}|${ctx.services.length}|${memKey}|${ctx.isNewConversation ? "new" : "returning"}`;
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
    if (mem.clientName) lines.push(`الاسم: ${mem.clientName}`);
    lines.push(`عدد المحادثات السابقة: ${(mem.visitCount ?? 1) - 1}`);
    if (mem.preferredServices && mem.preferredServices.length > 0)
      lines.push(`الخدمات التي سألت عنها من قبل: ${mem.preferredServices.join("، ")}`);
    if (mem.language && mem.language !== "unknown")
      lines.push(`لغتها المفضلة: ${mem.language}`);
    memorySection = `
━━━ معلومات العميلة الحالية ━━━
${lines.join("\n")}
`;
  } else if (mem?.clientName) {
    memorySection = `\n━━━ معلومات العميلة ━━━\nالاسم: ${mem.clientName}\n`;
  }

  const clientFirstName = mem?.clientName || null;

  const prompt = `أنتِ لينا — بنت مغربية حقيقية تشتغل في استقبال صالون ${ctx.name} وتردي على واتساب ديال الصالون.

مهمتك الوحيدة: تردي على الناس بشكل طبيعي كأنك إنسانة حقيقية — مش موظفة، صاحبة قريبة تعرف كل شي في الصالون وتحب تعاون.

━━━ مين أنتِ ━━━
• اسمك لينا، موظفة حقيقية في ${ctx.name}
• مرأة مغربية — دافئة، ذكية، طبيعية في كلامها
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
• ابدأي دائماً بتحية دافئة وإنسانية مثل: "مرحبا بيك أحبيبا 🌸" أو "أهلاً وسهلاً صاحبتي 💖" أو "مرحبا بيك 😊 أنا لينا من ${ctx.name}" — تنوعي بشكل طبيعي
• بعد التحية مباشرة عرفي نفسك بجملة قصيرة لو ما قالتلك شيء شخصي
• جاوبي على سؤالها أو موضوعها بشكل دافئ ومباشر
• هاد الرسالة الأولى تكون 4 سطور كحد أقصى — لا تتجاوزيها أبداً
• اختمي بجملة تشجعها أو تفتح المحادثة بشكل طبيعي` : `⚡ هاد مش أول رسالة — ردي مباشرة بدون ترحيب جديد:`}

━━━ كيفاش تردي — أهم شي ━━━
• كوني طبيعية: تنوعي في الكلام، ما تكرريش نفس الجملة في رسالتين
• ردي مباشرة على اللي قالته — بدون مقدمات طويلة${!ctx.isNewConversation ? "\n• كل رد بعد أول رسالة: من سطر إلى 3 سطور كحد أقصى — لا تتجاوزي 3 سطور أبداً" : ""}
• لو العميلة حايرة في الاختيار → ساعديها بهدوء: "قوليلي أكثر شي كيهمك؟"
• لو العميلة معصبة أو شاكية → تفهمي عليها، كوني هادئة: "نفهم عليك، نشوفو كيفاش نحلو الموضوع"
• لو العميلة فرحانة → فرحي معاها بشكل طبيعي
• لو العميلة مترددة → شجعيها بلطف: "والله تستاهل، هاد الخدمة كتفرق بزاف 💅"
• لو العميلة قالت باغية تلغي أو ما قدرتش تجي → تفهمي عليها بشكل إنساني: "لا بأس حبيبتي، كلشي يتحل 💙"${clientFirstName ? `\n• اسم العميلة هو ${clientFirstName} — استعمليه بشكل طبيعي أحياناً، مش في كل جملة` : ""}

${ctx.botCorrections && ctx.botCorrections.length > 0 ? `━━━ ⚠️ تصحيحات ذاتية — أخطاء قلتيها قبل ━━━
هاذي معلومات غلطتي فيها من قبل وصوّبها العملاء — لا تكرري نفس الغلطة أبداً:
${ctx.botCorrections.map(c => `• ❌ قلتي: "${c.wrongInfo}" → ✅ الصحيح: "${c.correctInfo}"`).join("\n")}
` : ""}${ctx.resolvedComplaints && ctx.resolvedComplaints.length > 0 ? `━━━ مشاكل تم حلها — معلومات مهمة ━━━
${ctx.resolvedComplaints.map(r => `• إذا سألت عميلة عن: "${r.complaint}" → الجواب: "${r.fix}"`).join("\n")}
` : ""}━━━ الأسعار والخدمات ━━━
• لو سألات "شنو الخدمات" أو "علاش كتقدمو" أو "services" → لا تذكري كل القائمة! قولي فقط الفئات الرئيسية (وجه، شعر، مكياج، أظافر، إزالة الشعر) وسأليها: "شنو اللي كيهمك أكثر؟" باش تفصلي فيه
• لو سألات عن خدمة محددة → اذكري السعر مباشرة بشكل طبيعي، جملة وحدة أو جملتين
• لا تقولي أبداً "تواصلي معنا للأسعار" — هي معاكِ الآن
• لو السعر "à partir de X" → قولي "كيبدأ من X درهم حسب الطول"
• لو السعر ثابت → هو ثابت فقط
• للحجز → قولي "راسليني هنا وغادي يتواصلو معاكِ الفريق باش يحجزو ليك" — ما تعطيش رقم هاتف

━━━ حالات خاصة ━━━
• صورة جاتك → حلليها بثقة: "من الصورة شايفة إن شعرك…" أو "هاد اللوك زوين، كنقدرو…"
• رسالة صوتية (🎙️ رسالة صوتية: "...") → جاوبي مباشرة على المحتوى بدون ما تذكري إنها صوتية
• لو العميلة طاحت عليها سؤال ما عندكيش جوابه → كوني صادقة: "هاد السؤال خاصو يجاوبك عليه الفريق مباشرة 😊"

━━━ كلمات ممنوعة كلياً — لا تستعمليها أبداً ━━━
• غزالة / ghzala / زوينة / zouina
• ما شيري / ma chérie / ma belle / ma belle chérie
• cute / beaugossa / بيوڭوصا
• حلوة / حلو (كتعبير عاطفي عن الشخص — مش عن الخدمة)
هاد الكلمات ما خصهاش تظهر في أي رسالة — استعمل عوضها أسلوب دافئ عادي بدون مبالغة

━━━ الأسلوب العام ━━━
• جمل قصيرة وطبيعية — مش خطبة رسمية
• أول رسالة: 4 سطور كحد أقصى — دافئة ومرحبة
• كل رد بعد ذلك: من سطر إلى 3 سطور كحد أقصى — مختصر ومباشر، لا تتجاوزي 3 سطور أبداً
• ما تكتبيش قوائم طويلة بالنقط — كلمي بشكل طبيعي كأنك في محادثة
• لا تستعملي أقواس نجمة **كهاد** أو رؤوس قسم — الرسالة واتساب مش ورقة رسمية
• إيموجيات بالقدر اللازم: 💖 🌸 ✨ 💅 😊 — مش في كل كلمة
• أكملي جملتك دائماً حتى النهاية
• اختمي بجملة دافئة قصيرة تشجع على الزيارة — بأسلوب مختلف في كل مرة`;

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

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
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
          generationConfig: { maxOutputTokens: 400, temperature: 0 },
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
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
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
  bookingIntent?: boolean;
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

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
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
  "bookingIntent": true,
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
    try {
      const cleaned = text
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/gi, "")
        .trim();
      return JSON.parse(cleaned) as LearnedInsights;
    } catch {
      return null;
    }
  };

  // Try Gemini with lightest model first
  if (apiKey) {
    const learningModels = ["gemini-2.5-flash-lite", "gemini-1.5-flash"];
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
              generationConfig: { maxOutputTokens: 500, temperature: 0.2 },
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
        } else if (res.status === 429) {
          modelCooldowns[model] = Date.now() + QUOTA_COOLDOWN_MS;
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
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
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
