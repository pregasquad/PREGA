const WHAPI_API_URL = 'https://gate.whapi.cloud';

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/[^0-9+]/g, '');
  
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }
  
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '212' + cleaned.substring(1);
  }
  
  if (!cleaned.startsWith('212') && cleaned.length === 9) {
    cleaned = '212' + cleaned;
  }
  
  return cleaned;
}

export async function sendWhatsAppMessage(
  to: string, 
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiToken = process.env.WHAPI_TOKEN;
  
  if (!apiToken) {
    console.error('WHAPI_TOKEN not set in environment');
    return { success: false, error: 'Whapi token not configured' };
  }

  try {
    const phoneNumber = formatPhoneNumber(to);
    console.log('Sending WhatsApp to:', phoneNumber);
    
    const response = await fetch(`${WHAPI_API_URL}/messages/text`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        to: phoneNumber,
        body: message
      })
    });

    const data = await response.json();
    console.log('Whapi response:', JSON.stringify(data));
    
    if (response.ok && data.sent) {
      return { success: true, messageId: data.message?.id };
    } else {
      const errorMsg = data.error?.message || data.message || JSON.stringify(data);
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    console.error('Whapi WhatsApp error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendWhatsAppImage(
  to: string, 
  imageUrl: string,
  caption?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiToken = process.env.WHAPI_TOKEN;
  
  if (!apiToken) {
    return { success: false, error: 'Whapi token not configured' };
  }

  try {
    const phoneNumber = formatPhoneNumber(to);
    
    const response = await fetch(`${WHAPI_API_URL}/messages/image`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        to: phoneNumber,
        media: imageUrl,
        caption: caption || ''
      })
    });

    const data = await response.json();
    
    if (response.ok && data.sent) {
      return { success: true, messageId: data.message?.id };
    } else {
      const errorMsg = data.error?.message || data.message || JSON.stringify(data);
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    console.error('Whapi image error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendAppointmentReminder(
  clientPhone: string,
  clientName: string,
  appointmentDate: string,
  appointmentTime: string,
  serviceName: string,
  salonName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const salon = salonName || 'PREGASQUAD';
  const message = `مرحباً ${clientName}! 💇‍♀️

هذا تذكير بموعدك:
📅 التاريخ: ${appointmentDate}
⏰ الوقت: ${appointmentTime}
💅 الخدمة: ${serviceName}

نتطلع لرؤيتك في ${salon}!
للإلغاء أو التعديل، يرجى التواصل معنا.`;

  return sendWhatsAppMessage(clientPhone, message);
}

export async function sendBookingConfirmation(
  clientPhone: string,
  clientName: string,
  appointmentDate: string,
  appointmentTime: string,
  serviceName: string,
  salonName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const salon = salonName || 'PREGASQUAD';
  const message = `مرحباً ${clientName}! ✨

تم تأكيد حجزك بنجاح:
📅 التاريخ: ${appointmentDate}
⏰ الوقت: ${appointmentTime}
💅 الخدمة: ${serviceName}

شكراً لاختيارك ${salon}!
نتطلع لرؤيتك. 💕`;

  return sendWhatsAppMessage(clientPhone, message);
}

export async function sendWaitlistNotification(
  clientPhone: string,
  clientName: string,
  availableDate: string,
  availableTime: string,
  salonName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const salon = salonName || 'PREGASQUAD';
  const message = `مرحباً ${clientName}! 🎉

أخبار سارة! أصبح لدينا موعد متاح:
📅 التاريخ: ${availableDate}
⏰ الوقت: ${availableTime}

احجز الآن قبل فوات الأوان!
للحجز، يرجى التواصل معنا أو زيارة صفحة الحجز.

${salon} 💕`;

  return sendWhatsAppMessage(clientPhone, message);
}

export async function sendGiftCardNotification(
  recipientPhone: string,
  recipientName: string,
  giftCardCode: string,
  amount: number,
  senderName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const from = senderName ? `من ${senderName}` : '';
  const message = `مرحباً ${recipientName}! 🎁

لقد تلقيت بطاقة هدية ${from}!
💳 رمز البطاقة: ${giftCardCode}
💰 القيمة: ${amount} درهم

يمكنك استخدام هذه البطاقة في موعدك القادم.
شكراً لك! 💕`;

  return sendWhatsAppMessage(recipientPhone, message);
}
