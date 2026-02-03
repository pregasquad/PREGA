const WOZZAPI_BASE_URL = 'https://api.wozzapi.com/api/v1';

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/[^0-9+]/g, '');
  
  if (!cleaned.startsWith('+')) {
    if (cleaned.startsWith('00')) {
      cleaned = '+' + cleaned.substring(2);
    } else if (cleaned.startsWith('0') && cleaned.length === 10) {
      cleaned = '+212' + cleaned.substring(1);
    } else if (!cleaned.startsWith('212') && cleaned.length === 9) {
      cleaned = '+212' + cleaned;
    } else if (cleaned.startsWith('212')) {
      cleaned = '+' + cleaned;
    } else {
      cleaned = '+' + cleaned;
    }
  }
  
  return cleaned;
}

export async function sendWhatsAppMessage(
  to: string, 
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const token = process.env.WOZZAPI_TOKEN;
  const sessionId = process.env.WOZZAPI_SESSION_ID;
  
  if (!token) {
    console.error('WOZZAPI_TOKEN not set in environment');
    return { success: false, error: 'Wozzapi token not configured' };
  }
  
  if (!sessionId) {
    console.error('WOZZAPI_SESSION_ID not set in environment');
    return { success: false, error: 'Wozzapi session ID not configured' };
  }

  try {
    const phoneNumber = formatPhoneNumber(to);
    console.log('Sending WhatsApp via Wozzapi to:', phoneNumber);
    
    const response = await fetch(`${WOZZAPI_BASE_URL}/messages/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        sessionId,
        to: phoneNumber,
        message
      })
    });

    const data = await response.json();
    console.log('Wozzapi response:', JSON.stringify(data));
    
    if (response.ok && data.success) {
      return { success: true, messageId: data.data?.id };
    } else {
      const errorMsg = data.message || data.error || JSON.stringify(data);
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    console.error('Wozzapi WhatsApp error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendWhatsAppImage(
  to: string, 
  imageUrl: string,
  caption?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const token = process.env.WOZZAPI_TOKEN;
  const sessionId = process.env.WOZZAPI_SESSION_ID;
  
  if (!token) {
    return { success: false, error: 'Wozzapi token not configured' };
  }
  
  if (!sessionId) {
    return { success: false, error: 'Wozzapi session ID not configured' };
  }

  try {
    const phoneNumber = formatPhoneNumber(to);
    
    const response = await fetch(`${WOZZAPI_BASE_URL}/messages/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        sessionId,
        to: phoneNumber,
        type: 'image',
        mediaUrl: imageUrl,
        caption: caption || ''
      })
    });

    const data = await response.json();
    
    if (response.ok && data.success) {
      return { success: true, messageId: data.data?.id };
    } else {
      const errorMsg = data.message || data.error || JSON.stringify(data);
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    console.error('Wozzapi image error:', error.message);
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

export async function getConnectionStatus(): Promise<{ connected: boolean; status?: string; error?: string }> {
  const token = process.env.WOZZAPI_TOKEN;
  const sessionId = process.env.WOZZAPI_SESSION_ID;
  
  if (!token || !sessionId) {
    return { connected: false, error: 'Wozzapi credentials not configured' };
  }

  try {
    const response = await fetch(`${WOZZAPI_BASE_URL}/sessions/${sessionId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    
    if (response.ok && data.success) {
      const status = data.data?.status;
      return { 
        connected: status === 'READY' || status === 'CONNECTED',
        status 
      };
    } else {
      return { connected: false, error: data.message || 'Failed to get session status' };
    }
  } catch (error: any) {
    return { connected: false, error: error.message };
  }
}
