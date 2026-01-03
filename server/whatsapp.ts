const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

const SENDZEN_API_URL = "https://api.sendzen.io/v1/messages";

export async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    if (!WHATSAPP_API_KEY || !WHATSAPP_PHONE_NUMBER_ID) {
      throw new Error("WhatsApp API credentials not configured");
    }

    const formattedPhone = to.replace(/[^0-9]/g, "");
    
    const response = await fetch(SENDZEN_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        from: WHATSAPP_PHONE_NUMBER_ID,
        to: formattedPhone,
        type: "text",
        text: {
          preview_url: false,
          body: message,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("SendZen API error:", data);
      return { 
        success: false, 
        error: data.error?.message || data.message || "Failed to send message" 
      };
    }

    return { 
      success: true, 
      messageId: data.messages?.[0]?.id || data.id
    };
  } catch (error: any) {
    console.error("WhatsApp send error:", error.message);
    return { success: false, error: error.message };
  }
}

export async function sendBookingConfirmation(
  clientPhone: string,
  clientName: string,
  appointmentDate: string,
  appointmentTime: string,
  serviceName: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const message = `مرحباً ${clientName}،

✅ تم تأكيد حجزك بنجاح!
📅 التاريخ: ${appointmentDate}
⏰ الوقت: ${appointmentTime}
💇 الخدمة: ${serviceName}

شكراً لاختيارك PREGASQUAD! 💜`;

  return sendWhatsAppMessage(clientPhone, message);
}

export async function sendAppointmentReminder(
  clientPhone: string,
  clientName: string,
  appointmentDate: string,
  appointmentTime: string,
  serviceName: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const message = `مرحباً ${clientName}،

تذكير بموعدك في PREGASQUAD:
📅 التاريخ: ${appointmentDate}
⏰ الوقت: ${appointmentTime}
💇 الخدمة: ${serviceName}

نتطلع لرؤيتك! ✨`;

  return sendWhatsAppMessage(clientPhone, message);
}
