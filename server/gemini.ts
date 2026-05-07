const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Primary: gemini-2.5-flash (best quality), fallback: gemini-1.5-flash (more quota headroom)
const MODEL_CASCADE = [
  "gemini-2.5-flash",
  "gemini-1.5-flash",
];

// After a 429/503, wait before trying again (protects free-tier quota)
const QUOTA_COOLDOWN_MS = 60 * 1000; // 60 seconds
let quotaExhaustedUntil = 0;

// Delay between cascade retries on non-quota errors — random jitter in [2000, 3000] ms
const retryDelay = () =>
  new Promise<void>((r) => setTimeout(r, 2000 + Math.floor(Math.random() * 1000)));

// Fallback reply sent to the client when all Gemini models are unavailable.
export const FALLBACK_REPLY =
  "شكراً لتواصلك معنا 💖\nفريقنا متاح للإجابة على استفساراتك.\nيرجى التواصل معنا مباشرة أو الاتصال بالصالون 🌸";

export interface SalonContext {
  name: string;
  address?: string;
  phone?: string;
  openingTime?: string;
  closingTime?: string;
  currency?: string;
  services: { name: string; price: number; duration: number; category: string }[];
}

// A single turn in a multi-turn conversation (role = "user" | "model")
export interface ConversationTurn {
  role: "user" | "model";
  text: string;
}

// Cache the built system prompt per salon snapshot to avoid rebuilding on every message.
let cachedPromptKey = "";
let cachedPrompt = "";

function buildSystemPrompt(ctx: SalonContext): string {
  const key = `${ctx.name}|${ctx.currency}|${ctx.services.length}`;
  if (key === cachedPromptKey) return cachedPrompt;

  // Group services by category so the list is easier to read
  const byCategory: Record<string, typeof ctx.services> = {};
  for (const s of ctx.services) {
    (byCategory[s.category] = byCategory[s.category] || []).push(s);
  }
  const serviceBlock =
    ctx.services.length > 0
      ? Object.entries(byCategory)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([cat, svcs]) =>
            `【${cat}】\n` +
            svcs.map((s) => `  • ${s.name} : ${s.price} ${ctx.currency || "DH"}`).join("\n")
          )
          .join("\n\n")
      : "  (liste non disponible)";

  const prompt = `أنتِ مساعدة احترافية وودودة لصالون التجميل "${ctx.name}".
مهمتكِ: الإجابة على أسئلة العملاء بشكل كامل وواضح، مع ذكر الأسعار الحقيقية دائماً.

━━━ معلومات الصالون ━━━
الاسم: ${ctx.name}
${ctx.address ? `العنوان: ${ctx.address}` : ""}
${ctx.phone ? `الهاتف للحجز: ${ctx.phone}` : ""}
${ctx.openingTime && ctx.closingTime ? `أوقات العمل: ${ctx.openingTime} – ${ctx.closingTime}` : ""}

━━━ قائمة الخدمات والأسعار الكاملة ━━━
${serviceBlock}

━━━ قواعد اللغة ━━━
1. إذا كتب العميل بالعربية أو بالدارجة المغربية بالحروف العربية → ردّي بالدارجة المغربية بالحروف العربية
2. إذا كتب العميل بالفرنسية → ردّي بالفرنسية
3. إذا كتب العميل بالدارجة بالحروف اللاتينية أو مزيج (مثل: bghit, dial, taman, wach, zloul, nails, brushing, coiffure, prix, kifach, ndir, 3raf) → هذه دارجة مغربية بخط لاتيني، ردّي عليها بالدارجة المغربية بالحروف العربية
4. لا تكتبي الدارجة بالحروف اللاتينية في ردودك — استعملي دائماً الحروف العربية

━━━ قواعد المحتوى ━━━
• عند السؤال عن الأسعار أو خدمة معينة: اذكري الأسعار الحقيقية من القائمة أعلاه مباشرة — لا تقولي "تواصل معنا للأسعار"، بل اذكري السعر فوراً
• عند السؤال عن عدة خدمات (مثل nails و brushing): اذكري سعر كل خدمة على حدة
• أكملي ردودك دائماً حتى النهاية — لا تقطعي الجملة في المنتصف
• للحجز: وجّهي العميل للتواصل المباشر${ctx.phone ? ` على ${ctx.phone}` : ""}
• لا تعطي أوقات متاحة محددة — قولي أن الفريق سيؤكد
• اختمي كل رد بإيموجي دافئ 💖 🌸 ✨`;

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

  // Build multi-turn contents array from conversation history + current message
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
        // systemInstruction keeps the prompt outside conversation turns
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents,
        generationConfig: {
          // 700 tokens — enough to list a full service price menu without truncation
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

  // finishReason "MAX_TOKENS" means the response was cut off — don't treat it as a good reply
  const finishReason: string = candidate?.finishReason ?? "STOP";
  const isTruncated = finishReason === "MAX_TOKENS";

  if (isTruncated) {
    console.warn(`[Gemini] ${model} response truncated (MAX_TOKENS) — discarding to avoid history corruption`);
    // Return null so the cascade tries the next model with a fresh attempt
    return { reply: null, isQuotaError: false, isTruncated: true };
  }

  return { reply: text ? text.trim() : null, isQuotaError: false, isTruncated: false };
}

/**
 * Ask Gemini for a reply, supporting multi-turn conversation history.
 *
 * Returns:
 * - `reply`: AI reply string, FALLBACK_REPLY on quota errors, or null if no API key
 * - `newHistory`: updated turns to persist — only set when a complete AI reply was received
 *
 * Truncated responses (MAX_TOKENS) are never saved to history to prevent context corruption.
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

  // Return fallback during cooldown — don't burn remaining quota
  const now = Date.now();
  if (now < quotaExhaustedUntil) {
    const remainingSecs = Math.ceil((quotaExhaustedUntil - now) / 1000);
    console.warn(`[Gemini] Quota cooldown active (${remainingSecs}s remaining) — using fallback reply`);
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
        console.error(
          `[Gemini] Quota exhausted on ${model} — cooling down ${QUOTA_COOLDOWN_MS / 1000}s, sending fallback`
        );
        return { reply: FALLBACK_REPLY, newHistory: history };
      }

      // Truncated or unexpected failure — wait then try next model
      if (i < MODEL_CASCADE.length - 1) {
        const reason = isTruncated ? "truncated" : "failed";
        console.warn(`[Gemini] ${model} ${reason} — retrying next model in ~2-3s`);
        await retryDelay();
      }
    } catch (err: any) {
      console.error(`[Gemini] ${model} threw: ${err.message}`);
      if (i < MODEL_CASCADE.length - 1) {
        await retryDelay();
      }
    }
  }

  console.error("[Gemini] All models exhausted — sending fallback reply");
  return { reply: FALLBACK_REPLY, newHistory: history };
}
