const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const MODEL_CASCADE = [
  "gemini-2.5-flash",
  "gemini-1.5-flash",
];

const QUOTA_COOLDOWN_MS = 60 * 1000;
// Per-model cooldown so a quota hit on 2.5-flash still lets 1.5-flash respond
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
• ممنوع تبدأي بـ "أهلا بك" أو "أهلاً" أو "مرحباً" — النظام يضيفها تلقائياً في بداية كل رسالة، لا تكرريها
• ابدأي مباشرة بالجواب على سؤال العميلة${clientFirstName ? `\n• إذا عرفتِ اسمها فاستعمليه بشكل طبيعي: ${clientFirstName}` : ""}
• ممنوع تستعملي "حبيبتي" في كل رسالة — استعمليها مرة مرة فقط، كثير الأحيان لا تستعمليها أبداً
• تنوعي في التعابير: مرة "صاحبتي"، مرة الاسم، مرة مباشرة بدون نداء — ولا تكرري نفس النداء في كل رسالة
• عند السؤال عن الأسعار: اذكري السعر مباشرة من القائمة — لا تقولي "تواصلي معنا للأسعار"
• عند السؤال عن عدة خدمات: اذكري سعر كل واحدة
• إذا كان السعر "à partir de X": قولي "السعر كيبدأ من X درهم على حساب طول الشعر، والثمن النهائي كيتحدد عند الزيارة"
• إذا كان السعر ثابتاً: هو ثابت — لا تقولي "قد يتغير حسب الطول"
• أكملي جملتك دائماً حتى النهاية — لا تقطعي الكلام في المنتصف
• للحجز أو تحديد الوقت: قولي "راسلينا هنا وغادي يتواصلوا معاك الفريق" — لا تعطي رقم الهاتف لأن العميلة راها فالواتساب الآن
• إذا جات العميلة بصورة: حلليها وجاوبي على حساب اللي شفتيه (نوع الشعر، اللون، الخدمة المناسبة...)
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

  const systemPrompt = buildSystemPrompt(ctx);
  const now = Date.now();

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
        // Don't return — fall through to next model in cascade
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

  console.error("[Gemini] All models exhausted — fallback reply");
  return { reply: FALLBACK_REPLY, newHistory: history };
}
