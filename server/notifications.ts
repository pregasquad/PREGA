const YCLOUD_SMS_URL = "https://api.ycloud.com/v2/sms";
const YCLOUD_WHATSAPP_URL = "https://api.ycloud.com/v2/whatsapp/messages";

interface MessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
  channel?: "sms" | "whatsapp";
}

interface WhatsAppTemplateParams {
  clientName: string;
  serviceName: string;
  date: string;
  time: string;
}

export async function sendSMS(to: string, text: string): Promise<MessageResult> {
  const apiKey = process.env.YCLOUD_API_KEY;
  
  if (!apiKey) {
    console.log("YCloud API key not configured - SMS not sent");
    return { success: false, error: "API key not configured", channel: "sms" };
  }

  if (!to || !text) {
    return { success: false, error: "Missing phone number or message", channel: "sms" };
  }

  const formattedPhone = formatPhoneNumber(to);
  if (!formattedPhone) {
    return { success: false, error: "Invalid phone number format", channel: "sms" };
  }

  try {
    const response = await fetch(YCLOUD_SMS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        to: formattedPhone,
        text: text,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("YCloud SMS error:", errorData);
      return { 
        success: false, 
        error: errorData.error?.message || `HTTP ${response.status}`,
        channel: "sms"
      };
    }

    const data = await response.json();
    console.log("SMS sent successfully:", data.id);
    return { success: true, messageId: data.id, channel: "sms" };
  } catch (error) {
    console.error("Failed to send SMS:", error);
    return { success: false, error: String(error), channel: "sms" };
  }
}

export async function sendWhatsAppTemplate(
  to: string, 
  params: WhatsAppTemplateParams
): Promise<MessageResult> {
  const apiKey = process.env.YCLOUD_API_KEY;
  const whatsappFrom = process.env.YCLOUD_WHATSAPP_NUMBER;
  const templateName = process.env.YCLOUD_WHATSAPP_TEMPLATE || "booking_confirmation";
  const templateLang = process.env.YCLOUD_WHATSAPP_TEMPLATE_LANG || "ar";
  
  if (!apiKey) {
    console.log("YCloud API key not configured - WhatsApp not sent");
    return { success: false, error: "API key not configured", channel: "whatsapp" };
  }

  if (!whatsappFrom) {
    console.log("WhatsApp business number not configured");
    return { success: false, error: "WhatsApp business number not configured", channel: "whatsapp" };
  }

  if (!to) {
    return { success: false, error: "Missing phone number", channel: "whatsapp" };
  }

  const formattedPhone = formatPhoneNumber(to);
  if (!formattedPhone) {
    return { success: false, error: "Invalid phone number format", channel: "whatsapp" };
  }

  try {
    const response = await fetch(YCLOUD_WHATSAPP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        from: whatsappFrom,
        to: formattedPhone,
        type: "template",
        template: {
          name: templateName,
          language: {
            code: templateLang,
          },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: params.clientName },
                { type: "text", text: params.serviceName },
                { type: "text", text: params.date },
                { type: "text", text: params.time },
              ],
            },
          ],
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("YCloud WhatsApp error:", errorData);
      return { 
        success: false, 
        error: errorData.error?.message || `HTTP ${response.status}`,
        channel: "whatsapp"
      };
    }

    const data = await response.json();
    console.log("WhatsApp template sent successfully:", data.id);
    return { success: true, messageId: data.id, channel: "whatsapp" };
  } catch (error) {
    console.error("Failed to send WhatsApp:", error);
    return { success: false, error: String(error), channel: "whatsapp" };
  }
}

export async function sendBookingNotification(
  to: string, 
  params: WhatsAppTemplateParams
): Promise<MessageResult> {
  if (process.env.YCLOUD_WHATSAPP_NUMBER) {
    const whatsappResult = await sendWhatsAppTemplate(to, params);
    if (whatsappResult.success) {
      return whatsappResult;
    }
    console.log("WhatsApp failed, falling back to SMS:", whatsappResult.error);
  }
  
  const smsMessage = createBookingConfirmationMessage(
    params.clientName,
    params.serviceName,
    params.date,
    params.time
  );
  return sendSMS(to, smsMessage);
}

function formatPhoneNumber(phone: string): string | null {
  const cleaned = phone.replace(/\D/g, "");
  
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    return "+212" + cleaned.substring(1);
  }
  
  if (cleaned.startsWith("212") && cleaned.length === 12) {
    return "+" + cleaned;
  }
  
  if (phone.startsWith("+")) {
    return phone;
  }
  
  if (cleaned.length >= 10) {
    return "+" + cleaned;
  }
  
  return null;
}

export function createAppointmentReminderMessage(
  clientName: string,
  serviceName: string,
  date: string,
  time: string,
  staffName: string
): string {
  return `مرحباً ${clientName}، نذكرك بموعدك في PREGASQUAD:
📅 التاريخ: ${date}
⏰ الوقت: ${time}
💇 الخدمة: ${serviceName}
👤 مع: ${staffName}

نتطلع لرؤيتك! 💜`;
}

export function createBookingConfirmationMessage(
  clientName: string,
  serviceName: string,
  date: string,
  time: string
): string {
  return `مرحباً ${clientName}، تم تأكيد حجزك في PREGASQUAD! ✅
📅 التاريخ: ${date}
⏰ الوقت: ${time}
💇 الخدمة: ${serviceName}

شكراً لاختيارك PREGASQUAD! 💜`;
}
