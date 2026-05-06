const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Primary: gemini-2.5-flash (best quality), fallback: gemini-1.5-flash (more quota headroom)
const MODEL_CASCADE = [
  "gemini-2.5-flash",
  "gemini-1.5-flash",
];

// After a 429/503, wait before trying again (protects free-tier quota)
const QUOTA_COOLDOWN_MS = 60 * 1000; // 60 seconds
let quotaExhaustedUntil = 0;

// Delay between cascade retries on non-quota errors (ms, random jitter in [2000, 3000])
const retryDelay = () =>
  new Promise<void>((r) => setTimeout(r, 2000 + Math.floor(Math.random() * 1000)));

// Fallback reply sent to the client when all Gemini models are unavailable.
// Keeps the bot responsive even when quota is exhausted.
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

// Cache the system prompt per salon snapshot to avoid rebuilding it on every message.
// Key: JSON hash of the context. Cleared when context changes.
let cachedPromptKey = "";
let cachedPrompt = "";

function buildSystemPrompt(ctx: SalonContext): string {
  const key = `${ctx.name}|${ctx.currency}|${ctx.services.length}`;
  if (key === cachedPromptKey) return cachedPrompt;

  const serviceLines =
    ctx.services.length > 0
      ? ctx.services
          .sort((a, b) => a.category.localeCompare(b.category))
          .map(
            (s) =>
              `  - ${s.name} (${s.category}) : ${s.price} ${ctx.currency || "DH"} — ${s.duration} min`
          )
          .join("\n")
      : "  (liste non disponible)";

  const prompt = `أنتِ مساعدة احترافية وودودة لصالون التجميل ${ctx.name}.

=== معلومات الصالون ===
الاسم: ${ctx.name}
${ctx.address ? `العنوان: ${ctx.address}` : ""}
${ctx.phone ? `الهاتف: ${ctx.phone}` : ""}
${ctx.openingTime && ctx.closingTime ? `أوقات العمل: ${ctx.openingTime} – ${ctx.closingTime}` : ""}

=== خدماتنا وأسعارها ===
${serviceLines}

=== القواعد ===
- إذا كتب العميل بالدارجة المغربية، ردّي عليه بالدارجة المغربية بالحروف العربية
- إذا كتب العميل بالفرنسية، ردّي عليه بالفرنسية
- لا تكتبي الدارجة بالحروف اللاتينية أبدًا — استعملي دائمًا الحروف العربية للدارجة
- كوني مختصرة (3-5 أسطر)، دافئة واحترافية
- استعملي الأسعار والخدمات الحقيقية المذكورة أعلاه
- للحجز، ادعي العميل للتواصل معنا مباشرة
- لا تعطي أوقات متاحة مباشرة — قولي أن الفريق سيؤكد
- اختمي دائمًا برسالة دافئة وإيموجي 💖 🌸 ✨`;

  cachedPromptKey = key;
  cachedPrompt = prompt;
  return prompt;
}

async function callGemini(
  model: string,
  userMessage: string,
  systemPrompt: string,
  apiKey: string
): Promise<{ reply: string | null; isQuotaError: boolean }> {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: `${systemPrompt}\n\nرسالة العميل: ${userMessage}` }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 350,
          temperature: 0.7,
        },
      }),
    });
  } catch (networkErr: any) {
    console.warn(`[Gemini] ${model} network error: ${networkErr.message}`);
    return { reply: null, isQuotaError: false };
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 429 || status === 503) {
      console.warn(`[Gemini] ${model} quota/overload (${status})`);
      return { reply: null, isQuotaError: true };
    }
    if (status === 404) {
      console.warn(`[Gemini] ${model} not found (404) — skipping`);
      return { reply: null, isQuotaError: false };
    }
    const errBody = await response.text();
    console.error(`[Gemini] ${model} error ${status}: ${errBody.slice(0, 300)}`);
    return { reply: null, isQuotaError: false };
  }

  const data = (await response.json()) as any;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return { reply: text ? text.trim() : null, isQuotaError: false };
}

/**
 * Ask Gemini for a reply. Returns:
 * - A string reply on success
 * - FALLBACK_REPLY if quota is exhausted or all models fail (never silent on quota errors)
 * - null only if no API key is configured (intentionally silent)
 */
export async function askGemini(
  userMessage: string,
  ctx: SalonContext
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[Gemini] No API key — skipping AI reply");
    return null;
  }

  // Skip and return fallback if still in cooldown — don't waste quota
  const now = Date.now();
  if (now < quotaExhaustedUntil) {
    const remainingSecs = Math.ceil((quotaExhaustedUntil - now) / 1000);
    console.warn(`[Gemini] Quota cooldown active (${remainingSecs}s remaining) — using fallback reply`);
    return FALLBACK_REPLY;
  }

  const systemPrompt = buildSystemPrompt(ctx);

  for (let i = 0; i < MODEL_CASCADE.length; i++) {
    const model = MODEL_CASCADE[i];
    try {
      const { reply, isQuotaError } = await callGemini(model, userMessage, systemPrompt, apiKey);

      if (reply) {
        console.log(`[Gemini] ${model} replied successfully`);
        return reply;
      }

      if (isQuotaError) {
        // All models share the same account quota — stop and cool down
        quotaExhaustedUntil = Date.now() + QUOTA_COOLDOWN_MS;
        console.error(
          `[Gemini] Quota exhausted on ${model} — cooling down for ${QUOTA_COOLDOWN_MS / 1000}s, sending fallback reply`
        );
        return FALLBACK_REPLY;
      }

      // Non-quota error (404, network, unexpected) — wait then try next model
      if (i < MODEL_CASCADE.length - 1) {
        console.warn(`[Gemini] ${model} failed — retrying next model in ~2-3s`);
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
  return FALLBACK_REPLY;
}
