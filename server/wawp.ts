const WAWP_BASE_URL = 'https://wawp.net/wp-json/awp/v1';

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, '');
  
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }
  
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '212' + cleaned.substring(1);
  }
  
  if (!cleaned.startsWith('212') && cleaned.length === 9) {
    cleaned = '212' + cleaned;
  }
  
  return cleaned + '@c.us';
}

export async function sendWhatsAppMessage(
  to: string, 
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const instanceId = process.env.WAWP_INSTANCE_ID;
  const accessToken = process.env.WAWP_ACCESS_TOKEN;
  
  if (!instanceId) {
    console.error('WAWP_INSTANCE_ID not set in environment');
    return { success: false, error: 'Wawp instance ID not configured' };
  }
  
  if (!accessToken) {
    console.error('WAWP_ACCESS_TOKEN not set in environment');
    return { success: false, error: 'Wawp access token not configured' };
  }

  try {
    const chatId = formatPhoneNumber(to);
    console.log('Sending WhatsApp via Wawp to:', chatId);
    
    const params = new URLSearchParams({
      instance_id: instanceId,
      access_token: accessToken,
      chatId,
      message
    });
    
    const response = await fetch(`${WAWP_BASE_URL}/send?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    console.log('Wawp response:', JSON.stringify(data));
    
    if (response.ok && (data.success || data.id || data.sent)) {
      return { success: true, messageId: data.id || data.messageId };
    } else {
      const errorMsg = data.message || data.error || JSON.stringify(data);
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    console.error('Wawp WhatsApp error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendWhatsAppImage(
  to: string, 
  imageUrl: string,
  caption?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const instanceId = process.env.WAWP_INSTANCE_ID;
  const accessToken = process.env.WAWP_ACCESS_TOKEN;
  
  if (!instanceId || !accessToken) {
    return { success: false, error: 'Wawp credentials not configured' };
  }

  try {
    const chatId = formatPhoneNumber(to);
    
    const params = new URLSearchParams({
      instance_id: instanceId,
      access_token: accessToken,
      chatId,
      'file[url]': imageUrl,
      'file[filename]': 'image.jpg',
      'file[mimetype]': 'image/jpeg'
    });
    
    if (caption) {
      params.append('caption', caption);
    }
    
    const response = await fetch(`${WAWP_BASE_URL}/sendImage?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    
    if (response.ok && (data.success || data.id || data.sent)) {
      return { success: true, messageId: data.id || data.messageId };
    } else {
      const errorMsg = data.message || data.error || JSON.stringify(data);
      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    console.error('Wawp image error:', error.message);
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
  const instanceId = process.env.WAWP_INSTANCE_ID;
  const accessToken = process.env.WAWP_ACCESS_TOKEN;
  
  if (!instanceId || !accessToken) {
    return { connected: false, error: 'Wawp credentials not configured' };
  }

  try {
    const params = new URLSearchParams({
      instance_id: instanceId,
      access_token: accessToken
    });
    
    const response = await fetch(`${WAWP_BASE_URL}/info?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    
    if (response.ok) {
      const status = data.status || data.state;
      return { 
        connected: status === 'CONNECTED' || status === 'open' || data.success === true,
        status 
      };
    } else {
      return { connected: false, error: data.message || 'Failed to get session status' };
    }
  } catch (error: any) {
    return { connected: false, error: error.message };
  }
}
