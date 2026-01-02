const YCLOUD_API_URL = "https://api.ycloud.com/v2/sms";

interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendSMS(to: string, text: string): Promise<SMSResult> {
  const apiKey = process.env.YCLOUD_API_KEY;
  
  if (!apiKey) {
    console.log("YCloud API key not configured - SMS not sent");
    return { success: false, error: "API key not configured" };
  }

  if (!to || !text) {
    return { success: false, error: "Missing phone number or message" };
  }

  const formattedPhone = formatPhoneNumber(to);
  if (!formattedPhone) {
    return { success: false, error: "Invalid phone number format" };
  }

  try {
    const response = await fetch(YCLOUD_API_URL, {
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
        error: errorData.error?.message || `HTTP ${response.status}` 
      };
    }

    const data = await response.json();
    console.log("SMS sent successfully:", data.id);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error("Failed to send SMS:", error);
    return { success: false, error: String(error) };
  }
}

function formatPhoneNumber(phone: string): string | null {
  const cleaned = phone.replace(/\D/g, "");
  
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    return "+212" + cleaned.substring(1);
  }
  
  if (cleaned.startsWith("212") && cleaned.length === 12) {
    return "+" + cleaned;
  }
  
  if (cleaned.startsWith("+")) {
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
