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

// A single turn in a multi-turn conversation (role = "user" | "model")
export interface ConversationTurn {
  role: "user" | "model";
  text: string;
}

// Cache the system prompt per salon snapshot to avoid rebuilding it on every message.
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
  apiKey: string,
  history: ConversationTurn[]
): Promise<{ reply: string | null; isQuotaError: boolean }> {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;

  // Build multi-turn contents array from conversation history + current message
  const contents: { role: string; parts: { text: string }[] }[] = [
    // Previous turns
    ...history.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
    // Current user message
    { role: "user", parts: [{ text: userMessage }] },
  ];

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // systemInstruction keeps the prompt separate from the conversation turns,
        // so it doesn't consume user/model turn slots and isn't repeated in history.
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents,
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
 * Ask Gemini for a reply, supporting multi-turn conversation history.
 *
 * Returns:
 * - `reply`: the AI reply string, FALLBACK_REPLY on quota errors, or null if no API key
 * - `newHistory`: updated conversation turns to persist (unchanged on fallback/error)
 *
 * Only successful AI replies are appended to history — fallback messages are not,
 * so the conversation context stays coherent.
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
      const { reply, isQuotaError } = await callGemini(model, userMessage, systemPrompt, apiKey, history);

      if (reply) {
        console.log(`[Gemini] ${model} replied (turn ${history.length / 2 + 1})`);
        // Append user message + model reply to history
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

      // Non-quota failure — wait then try next model
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
  return { reply: FALLBACK_REPLY, newHistory: history };
}
