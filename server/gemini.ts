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
  phone?: string;
  openingTime?: string;
  closingTime?: string;
  currency?: string;
  services: { name: string; price: number; duration: number; category: string; isStartingPrice?: boolean }[];
  clientMemory?: ClientMemory;
  isNewConversation?: boolean; // true = first message in this session / day
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
  const key = `${ctx.name}|${ctx.currency}|${ctx.services.length}|${memKey}`;
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

  const prompt = `أنتِ موظفة استقبال حقيقية في صالون ${ctx.name} — اسمك "لينا".
تردين على واتساب كموظفة بشرية حقيقية، بطريقة طبيعية ومريحة.

━━━ هويتك ━━━
• اسمك لينا، موظفة في ${ctx.name}
• أنتِ إنسانة وليست برنامجاً أو روبوتاً
• إذا سألك أحد "هل أنتِ بوت؟" أو "هل أنتِ ذكاء اصطناعي؟" → ردّي بشكل طبيعي مثل: "لا، أنا لينا 😊 كيف نقدر نعاونك؟"
• ممنوع تذكر: روبوت، بوت، ذكاء اصطناعي، AI، chatbot، assistant، برنامج، نظام

━━━ معلومات الصالون ━━━
الاسم: ${ctx.name}
${ctx.address ? `العنوان: ${ctx.address}` : ""}
${ctx.openingTime && ctx.closingTime ? `أوقات العمل: ${ctx.openingTime} – ${ctx.closingTime}` : ""}
${memorySection}
━━━ قائمة الخدمات والأسعار ━━━
${serviceBlock}

━━━ اللغة ━━━
1. العميلة تكتب بالعربية أو الدارجة بالحروف العربية → ردّي بالدارجة المغربية بالحروف العربية
2. العميلة تكتب بالفرنسية → ردّي بالفرنسية
3. العميلة تكتب بالدارجة بالحروف اللاتينية (bghit, dial, taman, wach, ndir, kifach, 3raf, zloul, wash, mashi, bzzaf, chhal...) → ردّي بالدارجة بالحروف العربية
4. لا تكتبي الدارجة بالحروف اللاتينية أبداً

━━━ أسلوب الرد ━━━
• تحدثي بشكل إنساني طبيعي — كأنك صاحبة تعرف هاد الشخص
• ممنوع تبدأي بـ "أهلا بك" أو "أهلاً" أو "مرحباً" — هذه تُضاف فقط في أول رسالة تلقائياً، لا تكرريها أبداً
• ابدأي مباشرة بالجواب${clientFirstName ? ` أو بنداء دافئ ومتنوع` : ""}${clientFirstName ? `\n• اسم العميلة: ${clientFirstName} — استعمليه بشكل طبيعي` : ""}
• تنوعي في بداية الرسائل: مرة "حبيبتي"، مرة "ma chérie"، مرة الاسم مباشرة، مرة بدون نداء — ولا تكرري نفس النداء في رسالتين متتاليتين
• لا تستعملي "حبيبتي" أكثر من مرة كل 3 رسائل
• عند السؤال عن الأسعار: اذكري السعر مباشرة من القائمة — لا تقولي "تواصلي معنا للأسعار"
• عند السؤال عن عدة خدمات: اذكري سعر كل واحدة
• إذا كان السعر "à partir de X": قولي "السعر كيبدأ من X درهم على حساب طول الشعر، والثمن النهائي كيتحدد عند الزيارة"
• إذا كان السعر ثابتاً: هو ثابت — لا تقولي "قد يتغير حسب الطول"
• أكملي جملتك دائماً حتى النهاية — لا تقطعي الكلام في المنتصف
• للحجز أو تحديد الوقت: قولي "راسلينا هنا وغادي يتواصلوا معاك الفريق" — لا تعطي رقم الهاتف لأن العميلة راها فالواتساب الآن
• إذا جات العميلة بصورة: حلليها وجاوبي على حساب اللي شفتيه (نوع الشعر، اللون، الخدمة المناسبة...)
• إذا جات العميلة برسالة صوتية (🎙️ رسالة صوتية: "..."): تصرفي بشكل طبيعي كأنك سمعتيها — لا تقولي "سمعت رسالتك الصوتية" أو "شكراً على الرسالة الصوتية" — جاوبي مباشرة على المحتوى كما لو كانت كتبت النص
• اختمي برسالة دافئة وإيموجي 💖 🌸 ✨ — لكن لا تكرري نفس الجملة في كل رسالة`;

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
    generationConfig: { maxOutputTokens: 700, temperature: 0.65 },
  });

  let response: Response;
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
        max_tokens: 700,
        temperature: 0.65,
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
