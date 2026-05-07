const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const MODEL_CASCADE = [
  "gemini-2.5-flash",
  "gemini-1.5-flash",
];

const QUOTA_COOLDOWN_MS = 60 * 1000;
let quotaExhaustedUntil = 0;

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
  services: { name: string; price: number; duration: number; category: string }[];
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
  const key = `${ctx.name}|${ctx.currency}|${ctx.services.length}|${memKey}|${ctx.isNewConversation ? "new" : "cont"}`;
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
              svcs.map((s) => `  • ${s.name} : ${s.price} ${ctx.currency || "DH"}`).join("\n")
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

━━━ طول الرسالة — القاعدة الأهم ━━━
• ردودك قصيرة دائماً — كأنك تراسلي صاحبة على واتساب
• الحد الأقصى: 2 إلى 4 جمل قصيرة — ممنوع الإطالة
• لا تشرحي أكثر مما طلبت — إذا سألت عن سعر، عطيها السعر مباشرة بجملة واحدة
• لا تكتبي نقط تعداد (•) أو قوائم طويلة — اكتبي بشكل طبيعي كأنك تدردشي
• لا تكرري المعلومة اللي قلتيها — قوليها مرة وكفى
• لا تختمي كل رسالة بجملة مجاملة طويلة — أحياناً رسالة قصيرة ومباشرة أحسن بكثير

━━━ أسلوب الرد ━━━
• تحدثي بشكل إنساني مريح — كأنك صاحبة بالطبيعة، مو موظفة رسمية
${ctx.isNewConversation
  ? "• هاد الرسالة هي الأولى — رحبي بطريقة قصيرة وطبيعية (جملة واحدة كفاية)"
  : "• المحادثة جارية — ابدأي مباشرة بالجواب، بلا 'أهلاً' أو 'مرحباً' أو أي ترحيب"
}
• ممنوع تستعملي "حبيبتي" في كل رسالة — أحياناً لا تستعمليها خالص${clientFirstName ? `\n• اسمها ${clientFirstName} — استعمليه أحياناً بشكل طبيعي، مو في كل رسالة` : ""}
• عند السؤال عن سعر: اذكري السعر مباشرة — لا تضيفي شرح غير ضروري
• عند السؤال عن عدة خدمات: اذكري كل خدمة وسعرها في سطر — بدون مقدمة
• للحجز: قولي "راسلينا هنا وغادي يتواصلوا معاك" — ممنوع تعطي رقم الهاتف
• إذا جات بصورة: قولي رأيك مباشرة في 2-3 جمل (الشعر، اللون، الخدمة المناسبة)
• إيموجي واحد أو اثنين في الرسالة — مو أكثر، ومو في كل رسالة`;

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

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          maxOutputTokens: 380,
          temperature: 0.75,
        },
      }),
    });
  } catch (networkErr: any) {
    console.warn(`[Gemini] ${model} network error: ${networkErr.message}`);
    return { reply: null, isQuotaError: false, isTruncated: false };
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 429 || status === 503) {
      console.warn(`[Gemini] ${model} quota/overload (${status})`);
      return { reply: null, isQuotaError: true, isTruncated: false };
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

/**
 * Ask Gemini with multi-turn history, optional client memory, and optional image.
 * Truncated responses are never saved to history.
 */
export async function askGemini(
  userMessage: string,
  ctx: SalonContext,
  history: ConversationTurn[] = [],
  imageBase64?: string,
  imageMimeType?: string
): Promise<{ reply: string | null; newHistory: ConversationTurn[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[Gemini] No API key — skipping AI reply");
    return { reply: null, newHistory: history };
  }

  const now = Date.now();
  if (now < quotaExhaustedUntil) {
    const remainingSecs = Math.ceil((quotaExhaustedUntil - now) / 1000);
    console.warn(`[Gemini] Quota cooldown (${remainingSecs}s) — fallback`);
    return { reply: FALLBACK_REPLY, newHistory: history };
  }

  const systemPrompt = buildSystemPrompt(ctx);

  for (let i = 0; i < MODEL_CASCADE.length; i++) {
    const model = MODEL_CASCADE[i];
    try {
      const { reply, isQuotaError, isTruncated } = await callGemini(
        model, userMessage, systemPrompt, apiKey, history, imageBase64, imageMimeType
      );

      if (reply) {
        console.log(`[Gemini] ${model} replied (turn ${Math.floor(history.length / 2) + 1})${imageBase64 ? " [with image]" : ""}`);
        // Store a text-only summary in history (can't store raw image bytes)
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
        quotaExhaustedUntil = Date.now() + QUOTA_COOLDOWN_MS;
        console.error(`[Gemini] Quota exhausted on ${model} — cooldown ${QUOTA_COOLDOWN_MS / 1000}s`);
        return { reply: FALLBACK_REPLY, newHistory: history };
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

  console.error("[Gemini] All models exhausted — fallback reply");
  return { reply: FALLBACK_REPLY, newHistory: history };
}
