import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
const twilioWhatsAppPhone = process.env.TWILIO_WHATSAPP_NUMBER || twilioPhone;

let client: twilio.Twilio | null = null;

if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
}

export interface NotificationResult {
  success: boolean;
  messageSid?: string;
  error?: string;
}

function getSmsNumber(): string | null {
  if (!twilioPhone) return null;
  return twilioPhone.replace(/^whatsapp:/, "");
}

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\s+/g, "").replace(/^whatsapp:/, "");
  
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  
  if (cleaned.startsWith("00")) {
    return "+" + cleaned.substring(2);
  }
  
  if (cleaned.startsWith("0")) {
    return "+212" + cleaned.substring(1);
  }
  
  if (cleaned.startsWith("212")) {
    return "+" + cleaned;
  }
  
  return "+212" + cleaned;
}

export async function sendSMS(to: string, message: string): Promise<NotificationResult> {
  const smsFrom = getSmsNumber();
  if (!client || !smsFrom) {
    return { success: false, error: "Twilio SMS not configured" };
  }

  const formattedTo = formatPhoneNumber(to);

  try {
    const result = await client.messages.create({
      body: message,
      from: smsFrom,
      to: formattedTo,
    });
    return { success: true, messageSid: result.sid };
  } catch (error: any) {
    console.error("SMS send error:", error);
    return { success: false, error: error.message };
  }
}

export async function sendWhatsApp(to: string, message: string): Promise<NotificationResult> {
  if (!client || !twilioWhatsAppPhone) {
    return { success: false, error: "Twilio WhatsApp not configured" };
  }

  const formattedTo = formatPhoneNumber(to);

  const whatsappFrom = twilioWhatsAppPhone.startsWith("whatsapp:") 
    ? twilioWhatsAppPhone 
    : `whatsapp:${twilioWhatsAppPhone}`;
  
  const whatsappTo = `whatsapp:${formattedTo}`;

  try {
    const result = await client.messages.create({
      body: message,
      from: whatsappFrom,
      to: whatsappTo,
    });
    return { success: true, messageSid: result.sid };
  } catch (error: any) {
    console.error("WhatsApp send error:", error);
    return { success: false, error: error.message };
  }
}

export function formatAppointmentReminder(
  clientName: string,
  serviceName: string,
  date: string,
  time: string,
  salonName: string = "PREGASQUAD"
): string {
  return `مرحباً ${clientName}! 🌸

تذكير بموعدك في ${salonName}:
📅 التاريخ: ${date}
⏰ الوقت: ${time}
💇 الخدمة: ${serviceName}

نتطلع لرؤيتك! ✨`;
}

export function formatAppointmentConfirmation(
  clientName: string,
  serviceName: string,
  date: string,
  time: string,
  total: number,
  salonName: string = "PREGASQUAD"
): string {
  return `شكراً ${clientName}! 🎉

تم تأكيد حجزك في ${salonName}:
📅 التاريخ: ${date}
⏰ الوقت: ${time}
💇 الخدمة: ${serviceName}
💰 السعر: ${total} DH

نتطلع لرؤيتك! ✨`;
}

export function isTwilioConfigured(): boolean {
  return !!(client && twilioPhone);
}

export function formatNewBookingNotification(
  clientName: string,
  clientPhone: string,
  serviceName: string,
  date: string,
  time: string,
  total: number
): string {
  return `حجز جديد! 🔔

👤 العميل: ${clientName}
📱 الهاتف: ${clientPhone}
💇 الخدمة: ${serviceName}
📅 التاريخ: ${date}
⏰ الوقت: ${time}
💰 السعر: ${total} DH`;
}

export async function notifySalonOwner(message: string): Promise<NotificationResult> {
  const ownerPhone = process.env.SALON_OWNER_PHONE;
  if (!ownerPhone) {
    return { success: false, error: "Owner phone not configured" };
  }
  return sendWhatsApp(ownerPhone, message);
}

export async function sendClientConfirmation(
  clientPhone: string,
  clientName: string,
  serviceName: string,
  date: string,
  time: string,
  total: number
): Promise<NotificationResult> {
  if (!clientPhone) {
    return { success: false, error: "No client phone provided" };
  }
  const message = formatAppointmentConfirmation(clientName, serviceName, date, time, total);
  return sendWhatsApp(clientPhone, message);
}
