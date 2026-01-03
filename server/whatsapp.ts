const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_FROM_NUMBER = "212669640496";

const SENDZEN_API_URL = "https://api.sendzen.io/v1/messages";

function formatMoroccoPhone(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, "");
  
  if (cleaned.startsWith("0")) {
    cleaned = "212" + cleaned.substring(1);
  }
  
  if (!cleaned.startsWith("212") && cleaned.length === 9) {
    cleaned = "212" + cleaned;
  }
  
  return cleaned;
}

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  parameters: string[]
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    if (!WHATSAPP_API_KEY || !WHATSAPP_PHONE_NUMBER_ID) {
      throw new Error("WhatsApp API credentials not configured");
    }

    const formattedPhone = formatMoroccoPhone(to);
    
    const bodyParameters = parameters.map(text => ({
      type: "text",
      text: text
    }));

    const requestBody = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      from: WHATSAPP_FROM_NUMBER,
      to: formattedPhone,
      type: "template",
      template: {
        name: templateName,
        lang_code: languageCode,
        components: [
          {
            type: "body",
            parameters: bodyParameters
          }
        ]
      }
    };

    console.log("Sending WhatsApp template:", JSON.stringify(requestBody, null, 2));

    const response = await fetch(SENDZEN_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    console.log("SendZen API response:", JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error("SendZen API error:", data);
      return { 
        success: false, 
        error: data.error?.message || data.message || "Failed to send message" 
      };
    }

    return { 
      success: true, 
      messageId: data.messages?.[0]?.id || data.data?.[0]?.message_id || data.id
    };
  } catch (error: any) {
    console.error("WhatsApp send error:", error.message);
    return { success: false, error: error.message };
  }
}

export async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    if (!WHATSAPP_API_KEY || !WHATSAPP_PHONE_NUMBER_ID) {
      throw new Error("WhatsApp API credentials not configured");
    }

    const formattedPhone = formatMoroccoPhone(to);
    
    const response = await fetch(SENDZEN_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "text",
        text: {
          preview_url: false,
          body: message,
        },
      }),
    });

    const data = await response.json();
    console.log("SendZen API response:", JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error("SendZen API error:", data);
      return { 
        success: false, 
        error: data.error?.message || data.message || "Failed to send message" 
      };
    }

    return { 
      success: true, 
      messageId: data.messages?.[0]?.id || data.data?.[0]?.message_id || data.id
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
  return sendWhatsAppTemplate(
    clientPhone,
    "pregasquad",
    "ar",
    [clientName, appointmentDate, appointmentTime, serviceName]
  );
}

export async function sendAppointmentReminder(
  clientPhone: string,
  clientName: string,
  appointmentDate: string,
  appointmentTime: string,
  serviceName: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  return sendWhatsAppTemplate(
    clientPhone,
    "pregasquad",
    "ar",
    [clientName, appointmentDate, appointmentTime, serviceName]
  );
}
