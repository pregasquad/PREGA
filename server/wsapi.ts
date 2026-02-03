const WSAPI_BASE_URL = 'https://api.wsapi.chat';

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
  
  return cleaned + '@s.whatsapp.net';
}

export async function sendWhatsAppMessage(
  to: string, 
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.WSAPI_API_KEY;
  const instanceId = process.env.WSAPI_INSTANCE_ID;
  
  if (!apiKey) {
    console.error('WSAPI_API_KEY not set in environment');
    return { success: false, error: 'WSAPI API key not configured' };
  }
  
  if (!instanceId) {
    console.error('WSAPI_INSTANCE_ID not set in environment');
    return { success: false, error: 'WSAPI instance ID not configured' };
  }

  try {
    const chatId = formatPhoneNumber(to);
    console.log('Sending WhatsApp via WSAPI to:', chatId);
    
    const response = await fetch(`${WSAPI_BASE_URL}/messages/text`, {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'X-Instance-Id': instanceId,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        to: chatId,
        text: message
      })
    });

    const data = await response.json();
    console.log('WSAPI response:', JSON.stringify(data));
    
    if (response.ok && (data.success || data.id || data.messageId)) {
      return { success: true, messageId: data.id || data.messageId };
    } else {
      const errorMsg = data.error?.message || data.message || JSON.stringify(data);
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    console.error('WSAPI WhatsApp error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendWhatsAppImage(
  to: string, 
  imageUrl: string,
  caption?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.WSAPI_API_KEY;
  const instanceId = process.env.WSAPI_INSTANCE_ID;
  
  if (!apiKey) {
    return { success: false, error: 'WSAPI API key not configured' };
  }
  
  if (!instanceId) {
    return { success: false, error: 'WSAPI instance ID not configured' };
  }

  try {
    const chatId = formatPhoneNumber(to);
    
    const response = await fetch(`${WSAPI_BASE_URL}/messages/image`, {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'X-Instance-Id': instanceId,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        to: chatId,
        url: imageUrl,
        caption: caption || ''
      })
    });

    const data = await response.json();
    
    if (response.ok && (data.success || data.id || data.messageId)) {
      return { success: true, messageId: data.id || data.messageId };
    } else {
      const errorMsg = data.error?.message || data.message || JSON.stringify(data);
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    console.error('WSAPI image error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function setTypingIndicator(
  to: string,
  state: 'typing' | 'recording' | 'available' = 'typing'
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.WSAPI_API_KEY;
  const instanceId = process.env.WSAPI_INSTANCE_ID;
  
  if (!apiKey || !instanceId) {
    return { success: false, error: 'WSAPI credentials not configured' };
  }

  try {
    const chatId = formatPhoneNumber(to);
    
    const response = await fetch(`${WSAPI_BASE_URL}/chats/${chatId}/presence`, {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'X-Instance-Id': instanceId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ state })
    });

    return { success: response.ok };
  } catch (error: any) {
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

export async function getConnectionStatus(): Promise<{ connected: boolean; error?: string }> {
  const apiKey = process.env.WSAPI_API_KEY;
  const instanceId = process.env.WSAPI_INSTANCE_ID;
  
  if (!apiKey || !instanceId) {
    return { connected: false, error: 'WSAPI credentials not configured' };
  }

  try {
    const response = await fetch(`${WSAPI_BASE_URL}/instance`, {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
        'X-Instance-Id': instanceId,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    return { connected: response.ok && data.status === 'connected' };
  } catch (error: any) {
    return { connected: false, error: error.message };
  }
}
