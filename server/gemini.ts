const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Only try one model per message — with a free tier of 5 RPM, trying 4 models
// for a single message burns the entire minute budget on one failed conversation.
// gemini-2.0-flash is the most reliable on free tier. gemini-2.5-flash as fallback.
const MODEL_CASCADE = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
];

// After any 429/503, wait this long before trying again (protects free tier quota)
const QUOTA_COOLDOWN_MS = 60 * 1000; // 60 seconds
let quotaExhaustedUntil = 0;

export interface SalonContext {
  name: string;
  address?: string;
  phone?: string;
  openingTime?: string;
  closingTime?: string;
  currency?: string;
  services: { name: string; price: number; duration: number; category: string }[];
}

function buildSystemPrompt(ctx: SalonContext): string {
  const serviceLines = ctx.services.length > 0
    ? ctx.services
        .sort((a, b) => a.category.localeCompare(b.category))
        .map(s => `  - ${s.name} (${s.category}) : ${s.price} ${ctx.currency || "DH"} — ${s.duration} min`)
        .join("\n")
    : "  (liste non disponible)";

  return `أنتِ مساعدة احترافية وودودة لصالون التجميل ${ctx.name}.

=== معلومات الصالون ===
الاسم: ${ctx.name}
${ctx.address ? `العنوان: ${ctx.address}` : ""}
${ctx.phone ? `الهاتف: ${ctx.phone}` : ""}
${ctx.openingTime && ctx.closingTime ? `أوقات العمل: ${ctx.openingTime} – ${ctx.closingTime}` : ""}

=== خدماتنا وأسعارها ===
${serviceLines}

=== القواعد ===
- إذا كتب العميل بالدارجة المغربية، ردّي عليه بالدارجة المغربية مكتوبة بالحروف العربية (مثل: واش، زوينة، بغيتي، كيفاش، معلومات، شنو...)
- إذا كتب العميل بالفرنسية، ردّي عليه بالفرنسية
- لا تكتبي الدارجة بالحروف اللاتينية أبدًا (لا "mrhba"، لا "zwina"، لا "bghiti"...) — استعملي دائمًا الحروف العربية للدارجة
- كوني مختصرة (3-5 أسطر فقط)، دافئة واحترافية
- استعملي الأسعار والخدمات الحقيقية المذكورة أعلاه في إجاباتك
- للحجز، ادعي العميل للتواصل معنا مباشرة أو استعمال صفحة الحجز
- لا تعطي أوقات متاحة بشكل مباشر — قولي أن الفريق سيؤكد
- اختمي دائمًا برسالة دافئة وإيموجي 💖 🌸 ✨`;
}

async function callGemini(model: string, userMessage: string, systemPrompt: string, apiKey: string): Promise<{ reply: string | null; isQuotaError: boolean }> {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: `${systemPrompt}\n\nرسالة العميل: ${userMessage}` }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 400,
        temperature: 0.7,
      },
    }),
  });

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

export async function askGemini(userMessage: string, ctx: SalonContext): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[Gemini] No API key — skipping AI reply");
    return null;
  }

  // Skip entirely if still in cooldown — don't waste quota
  const now = Date.now();
  if (now < quotaExhaustedUntil) {
    const remainingSecs = Math.ceil((quotaExhaustedUntil - now) / 1000);
    console.warn(`[Gemini] Quota cooldown active — skipping for ${remainingSecs}s more`);
    return null;
  }

  const systemPrompt = buildSystemPrompt(ctx);

  for (const model of MODEL_CASCADE) {
    try {
      const { reply, isQuotaError } = await callGemini(model, userMessage, systemPrompt, apiKey);
      if (reply) {
        console.log(`[Gemini] ${model} replied successfully`);
        return reply;
      }
      if (isQuotaError) {
        // Stop trying more models — they share the same account quota.
        // Wait 60s before next attempt to avoid burning the daily budget.
        quotaExhaustedUntil = Date.now() + QUOTA_COOLDOWN_MS;
        console.error(`[Gemini] Quota hit on ${model} — cooling down for ${QUOTA_COOLDOWN_MS / 1000}s, skipping remaining models`);
        return null;
      }
      // Non-quota error (404, unexpected) — try next model
    } catch (err: any) {
      console.error(`[Gemini] ${model} threw: ${err.message}`);
    }
  }

  console.error("[Gemini] All models exhausted — no AI reply");
  return null;
}
