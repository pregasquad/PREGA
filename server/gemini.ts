const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

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

export async function askGemini(userMessage: string, ctx: SalonContext): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return "💖 مرحباً! لا تترددي في التواصل معنا للمزيد من المعلومات 🌸";
  }

  const systemPrompt = buildSystemPrompt(ctx);

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
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

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[Gemini] API error ${response.status}: ${errBody}`);
      // Try fallback model if flash is deprecated/overloaded
      if (response.status === 404 || response.status === 429 || response.status === 503) {
        console.error(`[Gemini] Status ${response.status} — check API key quota or model availability`);
      }
      return "💖 مرحباً! لا تترددي في التواصل معنا للمزيد من المعلومات 🌸";
    }

    const data = (await response.json()) as any;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return "💖 مرحباً! لا تترددي في التواصل معنا للمزيد من المعلومات 🌸";
    return text.trim();
  } catch (err: any) {
    console.error(`[Gemini] Error: ${err.message}`);
    return "💖 مرحباً! لا تترددي في التواصل معنا للمزيد من المعلومات 🌸";
  }
}
