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
  "شكراً لتواصلك معنا 💖\nفريقنا متاح للإجابة على استفساراتك.\nيرجى التواصل معنا مباشرة أو الاتصال بالصالون 🌸";

export interface ClientMemory {
  clientName?: string | null;
  language?: string;           // 'arabic' | 'french' | 'darija' | 'unknown'
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
}

export interface ConversationTurn {
  role: "user" | "model";
  text: string;
}

// Cache the built system prompt per salon+memory snapshot
let cachedPromptKey = "";
let cachedPrompt = "";

function buildSystemPrompt(ctx: SalonContext): string {
  // Include client memory in the cache key so returning clients get personalised prompts
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
              svcs.map((s) => `  • ${s.name} : ${s.price} ${ctx.currency || "DH"}`).join("\n")
          )
          .join("\n\n")
      : "  (liste non disponible)";

  // Build client memory section (only shown for returning clients)
  let memorySection = "";
  if (mem && (mem.visitCount ?? 0) > 1) {
    const lines: string[] = [];
    if (mem.clientName) lines.push(`الاسم: ${mem.clientName}`);
    lines.push(`عدد المحادثات السابقة: ${(mem.visitCount ?? 1) - 1}`);
    if (mem.preferredServices && mem.preferredServices.length > 0)
      lines.push(`الخدمات التي سأل/ت عنها من قبل: ${mem.preferredServices.join("، ")}`);
    if (mem.language && mem.language !== "unknown")
      lines.push(`اللغة المفضلة: ${mem.language}`);
    if (mem.personalityNotes)
      lines.push(`ملاحظات: ${mem.personalityNotes}`);
    memorySection = `
━━━ معلومات العميل الحالي ━━━
${lines.join("\n")}
(استعمل هذه المعلومات لتخصيص ردك — رحّب بالعميل باسمه إذا كان معروفاً)
`;
  } else if (mem?.clientName) {
    memorySection = `\n━━━ معلومات العميل الحالي ━━━\nالاسم: ${mem.clientName}\n`;
  }

  const prompt = `أنتِ موظفة استقبال حقيقية في صالون ${ctx.name} — اسمك "لينا".
تتحدثين مع العملاء عبر واتساب كأي موظفة بشرية، بأسلوب طبيعي ودافئ تماماً كما لو كنتِ تردين على رسالة من صديقة.

━━━ هويتك ━━━
• اسمك لينا، موظفة في ${ctx.name}
• لستِ روبوتاً ولا برنامجاً — أنتِ إنسانة تعمل في الصالون
• إذا سألك أحد "هل أنتِ بوت؟" أو "هل أنتِ إنسان؟" أو "هل أنتِ ذكاء اصطناعي؟": قولي بشكل طبيعي "لا حبيبتي أنا لينا من فريق ${ctx.name} 😊" أو ما شابه ذلك بنفس الطابع
• لا تذكري أبداً كلمات: روبوت، بوت، ذكاء اصطناعي، AI، assistant, chatbot، برنامج، نظام

━━━ معلومات الصالون ━━━
الاسم: ${ctx.name}
${ctx.address ? `العنوان: ${ctx.address}` : ""}
${ctx.phone ? `للحجز والاستفسار: ${ctx.phone}` : ""}
${ctx.openingTime && ctx.closingTime ? `أوقات العمل: ${ctx.openingTime} – ${ctx.closingTime}` : ""}
${memorySection}
━━━ قائمة الخدمات والأسعار ━━━
${serviceBlock}

━━━ اللغة ━━━
1. العميل يكتب بالعربية أو الدارجة بالحروف العربية → ردّي بالدارجة المغربية بالحروف العربية
2. العميل يكتب بالفرنسية → ردّي بالفرنسية
3. العميل يكتب بالدارجة بالحروف اللاتينية (bghit, dial, taman, wach, ndir, kifach, 3raf, zloul, wash, mashi, bzzaf, chhal...) → ردّي بالدارجة بالحروف العربية
4. لا تكتبي الدارجة بالحروف اللاتينية أبداً في ردودك

━━━ أسلوب الرد ━━━
• تحدثي بشكل إنساني طبيعي — مثل موظفة تعرف زبوناتها وتحب شغلها
• لا تستعملي صياغات رسمية جافة أو جمل تبدو آلية
• إذا سألتك عن سعر خدمة: قولي السعر مباشرة من القائمة بلا تردد — لا تقولي "تواصل معنا"
• إذا سألتك عن عدة خدمات: اذكري سعر كل واحدة
• أكملي جملتك دائماً حتى النهاية — لا تقطعي الكلام في المنتصف
• إذا عرفتِ اسم العميلة، استعمليه بشكل طبيعي في الرد
• للحجز: وجّهي العميلة للتواصل${ctx.phone ? ` على ${ctx.phone}` : " مباشرة"} — قولي أن الفريق سيحدد الوقت المناسب
• اختمي دائماً بإيموجي دافئ 💖 🌸 ✨ كما تفعل أي موظفة ودودة`;

  cachedPromptKey = key;
  cachedPrompt = prompt;
  return prompt;
}

async function callGemini(
  model: string,
  userMessage: string,
  systemPrompt: string,
  apiKey: string,
  history: ConversationTurn[]
): Promise<{ reply: string | null; isQuotaError: boolean; isTruncated: boolean }> {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;

  const contents: { role: string; parts: { text: string }[] }[] = [
    ...history.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
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
          maxOutputTokens: 700,
          temperature: 0.65,
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
    console.warn(`[Gemini] ${model} truncated (MAX_TOKENS) — discarding to avoid history corruption`);
    return { reply: null, isQuotaError: false, isTruncated: true };
  }

  return { reply: text ? text.trim() : null, isQuotaError: false, isTruncated: false };
}

/**
 * Ask Gemini with multi-turn history and optional client memory.
 * Truncated responses are never saved to history.
 */
export async function askGemini(
  userMessage: string,
  ctx: SalonContext,
  history: ConversationTurn[] = []
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
        model, userMessage, systemPrompt, apiKey, history
      );

      if (reply) {
        console.log(`[Gemini] ${model} replied (turn ${Math.floor(history.length / 2) + 1})`);
        const newHistory: ConversationTurn[] = [
          ...history,
          { role: "user", text: userMessage },
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
