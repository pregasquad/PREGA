import twilio from 'twilio';

const YCLOUD_SMS_URL = "https://api.ycloud.com/v2/sms";

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

let connectionSettings: any;

async function getTwilioCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('Replit token not found');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.account_sid || !connectionSettings.settings.api_key || !connectionSettings.settings.api_key_secret)) {
    throw new Error('Twilio not connected');
  }
  return {
    accountSid: connectionSettings.settings.account_sid,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number
  };
}

async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret } = await getTwilioCredentials();
  return twilio(apiKey, apiKeySecret, {
    accountSid: accountSid
  });
}

async function getTwilioFromPhoneNumber() {
  const { phoneNumber } = await getTwilioCredentials();
  return phoneNumber;
}

export async function sendWhatsAppTwilio(
  to: string, 
  message: string
): Promise<MessageResult> {
  try {
    const client = await getTwilioClient();
    const fromNumber = await getTwilioFromPhoneNumber();
    
    if (!fromNumber) {
      console.log("Twilio phone number not configured");
      return { success: false, error: "Twilio phone number not configured", channel: "whatsapp" };
    }

    const formattedPhone = formatPhoneNumber(to);
    if (!formattedPhone) {
      return { success: false, error: "Invalid phone number format", channel: "whatsapp" };
    }

    const result = await client.messages.create({
      from: `whatsapp:${fromNumber}`,
      to: `whatsapp:${formattedPhone}`,
      body: message,
    });

    console.log("WhatsApp sent successfully via Twilio:", result.sid);
    return { success: true, messageId: result.sid, channel: "whatsapp" };
  } catch (error: any) {
    console.error("Failed to send WhatsApp via Twilio:", error.message);
    return { success: false, error: error.message, channel: "whatsapp" };
  }
}

export async function sendSMSTwilio(
  to: string, 
  message: string
): Promise<MessageResult> {
  try {
    const client = await getTwilioClient();
    const fromNumber = await getTwilioFromPhoneNumber();
    
    if (!fromNumber) {
      console.log("Twilio phone number not configured");
      return { success: false, error: "Twilio phone number not configured", channel: "sms" };
    }

    const formattedPhone = formatPhoneNumber(to);
    if (!formattedPhone) {
      return { success: false, error: "Invalid phone number format", channel: "sms" };
    }

    const result = await client.messages.create({
      from: fromNumber,
      to: formattedPhone,
      body: message,
    });

    console.log("SMS sent successfully via Twilio:", result.sid);
    return { success: true, messageId: result.sid, channel: "sms" };
  } catch (error: any) {
    console.error("Failed to send SMS via Twilio:", error.message);
    return { success: false, error: error.message, channel: "sms" };
  }
}

export async function sendSMS(to: string, text: string): Promise<MessageResult> {
  const apiKey = process.env.YCLOUD_API_KEY;
  
  if (!apiKey) {
    console.log("YCloud API key not configured - trying Twilio SMS");
    return sendSMSTwilio(to, text);
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

export async function sendBookingNotification(
  to: string, 
  params: WhatsAppTemplateParams
): Promise<MessageResult> {
  const message = createBookingConfirmationMessage(
    params.clientName,
    params.serviceName,
    params.date,
    params.time
  );

  const whatsappResult = await sendWhatsAppTwilio(to, message);
  if (whatsappResult.success) {
    return whatsappResult;
  }
  console.log("WhatsApp failed, falling back to SMS:", whatsappResult.error);
  
  return sendSMS(to, message);
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
