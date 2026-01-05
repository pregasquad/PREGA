const SENDZEN_API_URL = 'https://api.sendzen.io/v1/messages';

export async function sendWhatsAppMessage(to: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.SENDZEN_API_KEY;
  
  if (!apiKey) {
    return { success: false, error: 'SendZen API key not configured' };
  }

  try {
    const phoneNumber = to.replace(/[^0-9]/g, '');
    
    const requestBody = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'text',
      text: {
        body: message
      }
    };
    
    console.log('SendZen request:', JSON.stringify(requestBody));
    
    const response = await fetch(SENDZEN_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    console.log('SendZen response:', JSON.stringify(data));
    
    if (response.ok && data.messages) {
      return { success: true, messageId: data.messages?.[0]?.id };
    } else {
      const errorMsg = data.error?.message || data.message || data.detail || JSON.stringify(data);
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    console.error('SendZen WhatsApp error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendAppointmentReminder(
  clientPhone: string,
  clientName: string,
  appointmentDate: string,
  appointmentTime: string,
  serviceName: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const message = `مرحباً ${clientName}،\n\nتذكير بموعدك في PREGASQUAD:\n📅 التاريخ: ${appointmentDate}\n⏰ الوقت: ${appointmentTime}\n💇 الخدمة: ${serviceName}\n\nنتطلع لرؤيتك! ✨`;
  
  return sendWhatsAppMessage(clientPhone, message);
}

export async function sendBookingConfirmation(
  clientPhone: string,
  clientName: string,
  appointmentDate: string,
  appointmentTime: string,
  serviceName: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const message = `مرحباً ${clientName}،\n\n✅ تم تأكيد حجزك بنجاح!\n📅 التاريخ: ${appointmentDate}\n⏰ الوقت: ${appointmentTime}\n💇 الخدمة: ${serviceName}\n\nشكراً لاختيارك PREGASQUAD! 💜`;
  
  return sendWhatsAppMessage(clientPhone, message);
}
