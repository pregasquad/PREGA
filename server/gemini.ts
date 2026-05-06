const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

const SYSTEM_PROMPT = `Tu es une assistante professionnelle du salon de beauté PREGASQUAD.

Règles importantes :
- Réponds en français ou en darija marocaine selon la langue du client
- Sois courte, chaleureuse et professionnelle
- Tu peux aider avec : prix des services, disponibilités, conseils beauté, réservations, promotions
- Si le client veut réserver, dis-lui de visiter le salon ou de contacter directement l'équipe
- N'invente pas de prix ou de disponibilités précises — dis que l'équipe confirmera
- Termine toujours avec un emoji chaleureux 💖 🌸 ✨`;

export async function askGemini(userMessage: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return "💖 Marhba! N'hésitez pas à nous contacter pour plus d'informations 🌸";
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${SYSTEM_PROMPT}\n\nClient: ${userMessage}`,
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 300,
          temperature: 0.7,
        },
      }),
    });

    if (!response.ok) {
      console.error(`[Gemini] API error: ${response.status}`);
      return "💖 Marhba! N'hésitez pas à nous contacter pour plus d'informations 🌸";
    }

    const data = (await response.json()) as any;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return "💖 Marhba! N'hésitez pas à nous contacter pour plus d'informations 🌸";
    return text.trim();
  } catch (err: any) {
    console.error(`[Gemini] Error: ${err.message}`);
    return "💖 Marhba! N'hésitez pas à nous contacter pour plus d'informations 🌸";
  }
}
