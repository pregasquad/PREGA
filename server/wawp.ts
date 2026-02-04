const WAWP_BASE_URL = 'https://wawp.net/wp-json/awp/v1';

// Known country codes with validation info
// localLengthWithoutTrunk = length of number after country code (without national trunk 0)
const COUNTRY_CODES: { [key: string]: { localLength: number; name: string } } = {
  '33': { localLength: 9, name: 'France' },       // France: +33 6 12 34 56 78 (9 digits after country code)
  '31': { localLength: 9, name: 'Netherlands' },  // Netherlands: +31 6 12345678
  '212': { localLength: 9, name: 'Morocco' },     // Morocco: +212 612345678
  '32': { localLength: 8, name: 'Belgium' },      // Belgium: +32 4 12 34 56 78
  '34': { localLength: 9, name: 'Spain' },        // Spain: +34 612345678
  '39': { localLength: 10, name: 'Italy' },       // Italy: +39 3 12 345 6789
  '44': { localLength: 10, name: 'UK' },          // UK: +44 7911 123456
  '49': { localLength: 11, name: 'Germany' },     // Germany: +49 170 1234567
  '1': { localLength: 10, name: 'USA/Canada' },   // USA: +1 555 123 4567
  '971': { localLength: 9, name: 'UAE' },         // UAE: +971 50 123 4567
  '966': { localLength: 9, name: 'Saudi Arabia' }, // Saudi: +966 5 1234 5678
};

// Default country code for local numbers without country prefix
const DEFAULT_COUNTRY_CODE = '212'; // Morocco

/**
 * Format a phone number for WhatsApp API
 * Supports:
 * - International format with +: +33612345678, +31612345678
 * - International format with 00: 0033612345678, 0031612345678
 * - Numbers with country code but no prefix: 33612345678, 31612345678
 * - Local Moroccan numbers (default): 0612345678 -> 212612345678
 */
function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  let cleaned = phone.replace(/[^0-9]/g, '');
  
  // Handle 00 international prefix: 0033612345678 -> 33612345678
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }
  
  // Check if number already starts with a known country code
  // Sort by code length descending to match longer codes first (e.g., 212 before 2)
  const sortedCodes = Object.keys(COUNTRY_CODES).sort((a, b) => b.length - a.length);
  
  for (const code of sortedCodes) {
    if (cleaned.startsWith(code)) {
      const info = COUNTRY_CODES[code];
      const numberAfterCode = cleaned.substring(code.length);
      
      // Validate approximate length (allow some flexibility for different formats)
      if (numberAfterCode.length >= info.localLength - 1 && numberAfterCode.length <= info.localLength + 2) {
        return cleaned + '@c.us';
      }
    }
  }
  
  // Number doesn't have a recognized country code - apply default (Morocco)
  // Handle local format with trunk 0: 0612345678 -> 212612345678
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = DEFAULT_COUNTRY_CODE + cleaned.substring(1);
  }
  // Handle short format without trunk: 612345678 -> 212612345678
  else if (cleaned.length === 9 && !cleaned.startsWith('0')) {
    cleaned = DEFAULT_COUNTRY_CODE + cleaned;
  }
  
  return cleaned + '@c.us';
}

/**
 * Detect country from phone number
 * Returns the country name or 'Unknown' if not recognized
 */
export function detectCountry(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('00')) cleaned = cleaned.substring(2);
  
  // Sort by code length descending to match longer codes first
  const sortedCodes = Object.keys(COUNTRY_CODES).sort((a, b) => b.length - a.length);
  
  for (const code of sortedCodes) {
    if (cleaned.startsWith(code)) {
      return COUNTRY_CODES[code].name;
    }
  }
  
  // Check if it's a local number format (starts with 0 or is 9 digits)
  if ((cleaned.startsWith('0') && cleaned.length === 10) || cleaned.length === 9) {
    return 'Morocco'; // Default for local numbers
  }
  
  return 'Unknown';
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
    
    const formData = new URLSearchParams();
    formData.append('instance_id', instanceId);
    formData.append('access_token', accessToken);
    formData.append('chatId', chatId);
    formData.append('message', message);
    
    const response = await fetch(`${WAWP_BASE_URL}/send`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
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
    
    const formData = new URLSearchParams();
    formData.append('instance_id', instanceId);
    formData.append('access_token', accessToken);
    formData.append('chatId', chatId);
    formData.append('file[url]', imageUrl);
    formData.append('file[filename]', 'image.jpg');
    formData.append('file[mimetype]', 'image/jpeg');
    
    if (caption) {
      formData.append('caption', caption);
    }
    
    const response = await fetch(`${WAWP_BASE_URL}/sendImage`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
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

// Salon location for WhatsApp messages
const SALON_LOCATION = {
  lat: 30.399840,
  lng: -9.555420,
  address: "PROJECT ANNASER, IMM 25, Agadir"
};

export async function sendBookingConfirmation(
  clientPhone: string,
  clientName: string,
  appointmentDate: string,
  appointmentTime: string,
  serviceName: string,
  salonName?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const salon = salonName || 'PREGASQUAD';
  const mapsLink = `https://www.google.com/maps/dir/?api=1&destination=${SALON_LOCATION.lat},${SALON_LOCATION.lng}`;
  
  const message = `مرحباً ${clientName}! ✨

تم تأكيد حجزك بنجاح:
📅 التاريخ: ${appointmentDate}
⏰ الوقت: ${appointmentTime}
💅 الخدمة: ${serviceName}

📍 العنوان: ${SALON_LOCATION.address}
🗺️ الموقع: ${mapsLink}

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
    // Try the status endpoint with POST method (Wawp API requires POST for most endpoints)
    const formData = new URLSearchParams();
    formData.append('instance_id', instanceId);
    formData.append('access_token', accessToken);
    
    const response = await fetch(`${WAWP_BASE_URL}/status`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    const data = await response.json();
    console.log('Wawp status response:', JSON.stringify(data));
    
    if (response.ok) {
      // Check various status indicators from Wawp API
      const status = data.status || data.state || data.connection_status;
      const isConnected = status === 'CONNECTED' || 
                         status === 'connected' || 
                         status === 'open' || 
                         data.success === true ||
                         data.authenticated === true ||
                         data.connected === true;
      return { 
        connected: isConnected,
        status: status || (isConnected ? 'connected' : 'unknown')
      };
    } else {
      // If status endpoint fails, credentials are configured but connection status unknown
      // Return configured: true but connected: unknown
      return { 
        connected: false, 
        status: 'configured',
        error: data.message || data.error || 'Could not verify connection status'
      };
    }
  } catch (error: any) {
    return { connected: false, error: error.message };
  }
}
