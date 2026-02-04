const WAWP_BASE_URL = 'https://wawp.net/wp-json/awp/v1';

// Known country codes with validation info
// localLengthWithoutTrunk = length of number after country code (without national trunk 0)
const COUNTRY_CODES: { [key: string]: { localLength: number; name: string } } = {
  // North Africa & Middle East
  '212': { localLength: 9, name: 'Morocco' },      // Morocco: +212 612345678
  '213': { localLength: 9, name: 'Algeria' },      // Algeria: +213 5 12 34 56 78
  '216': { localLength: 8, name: 'Tunisia' },      // Tunisia: +216 12 345 678
  '20': { localLength: 10, name: 'Egypt' },        // Egypt: +20 10 1234 5678
  '971': { localLength: 9, name: 'UAE' },          // UAE: +971 50 123 4567
  '966': { localLength: 9, name: 'Saudi Arabia' }, // Saudi: +966 5 1234 5678
  '974': { localLength: 8, name: 'Qatar' },        // Qatar: +974 3312 3456
  '965': { localLength: 8, name: 'Kuwait' },       // Kuwait: +965 1234 5678
  '973': { localLength: 8, name: 'Bahrain' },      // Bahrain: +973 3612 3456
  '968': { localLength: 8, name: 'Oman' },         // Oman: +968 9123 4567
  '962': { localLength: 9, name: 'Jordan' },       // Jordan: +962 7 9123 4567
  '961': { localLength: 8, name: 'Lebanon' },      // Lebanon: +961 3 123 456
  // Europe
  '33': { localLength: 9, name: 'France' },        // France: +33 6 12 34 56 78
  '34': { localLength: 9, name: 'Spain' },         // Spain: +34 612345678
  '39': { localLength: 10, name: 'Italy' },        // Italy: +39 3 12 345 6789
  '44': { localLength: 10, name: 'UK' },           // UK: +44 7911 123456
  '49': { localLength: 11, name: 'Germany' },      // Germany: +49 170 1234567
  '31': { localLength: 9, name: 'Netherlands' },   // Netherlands: +31 6 12345678
  '32': { localLength: 8, name: 'Belgium' },       // Belgium: +32 4 12 34 56 78
  '41': { localLength: 9, name: 'Switzerland' },   // Switzerland: +41 79 123 45 67
  '43': { localLength: 10, name: 'Austria' },      // Austria: +43 664 123 4567
  '45': { localLength: 8, name: 'Denmark' },       // Denmark: +45 12 34 56 78
  '46': { localLength: 9, name: 'Sweden' },        // Sweden: +46 70 123 45 67
  '47': { localLength: 8, name: 'Norway' },        // Norway: +47 123 45 678
  '48': { localLength: 9, name: 'Poland' },        // Poland: +48 512 345 678
  '351': { localLength: 9, name: 'Portugal' },     // Portugal: +351 912 345 678
  '352': { localLength: 9, name: 'Luxembourg' },   // Luxembourg: +352 621 123 456
  '353': { localLength: 9, name: 'Ireland' },      // Ireland: +353 87 123 4567
  '358': { localLength: 10, name: 'Finland' },     // Finland: +358 40 123 4567
  '30': { localLength: 10, name: 'Greece' },       // Greece: +30 694 123 4567
  '36': { localLength: 9, name: 'Hungary' },       // Hungary: +36 20 123 4567
  '40': { localLength: 9, name: 'Romania' },       // Romania: +40 721 234 567
  '420': { localLength: 9, name: 'Czech Republic' }, // Czech: +420 601 234 567
  '7': { localLength: 10, name: 'Russia' },        // Russia: +7 912 345 6789
  '380': { localLength: 9, name: 'Ukraine' },      // Ukraine: +380 50 123 4567
  '90': { localLength: 10, name: 'Turkey' },       // Turkey: +90 532 123 4567
  // Americas
  '1': { localLength: 10, name: 'USA/Canada' },    // USA: +1 555 123 4567
  '52': { localLength: 10, name: 'Mexico' },       // Mexico: +52 55 1234 5678
  '55': { localLength: 11, name: 'Brazil' },       // Brazil: +55 11 91234 5678
  '54': { localLength: 10, name: 'Argentina' },    // Argentina: +54 11 1234 5678
  // Asia & Others
  '86': { localLength: 11, name: 'China' },        // China: +86 139 1234 5678
  '91': { localLength: 10, name: 'India' },        // India: +91 98765 43210
  '81': { localLength: 10, name: 'Japan' },        // Japan: +81 90 1234 5678
  '82': { localLength: 10, name: 'South Korea' },  // South Korea: +82 10 1234 5678
  '60': { localLength: 10, name: 'Malaysia' },     // Malaysia: +60 12 345 6789
  '65': { localLength: 8, name: 'Singapore' },     // Singapore: +65 8123 4567
  '27': { localLength: 9, name: 'South Africa' },  // South Africa: +27 82 123 4567
  '61': { localLength: 9, name: 'Australia' },     // Australia: +61 4 1234 5678
  '64': { localLength: 9, name: 'New Zealand' },   // New Zealand: +64 21 123 4567
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
  
  // Number doesn't match a known country code
  // Check if it looks like a local Moroccan number (only apply default for these)
  
  // Handle local format with trunk 0: 0612345678 -> 212612345678
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = DEFAULT_COUNTRY_CODE + cleaned.substring(1);
  }
  // Handle short format without trunk: 612345678 -> 212612345678
  else if (cleaned.length === 9 && !cleaned.startsWith('0')) {
    cleaned = DEFAULT_COUNTRY_CODE + cleaned;
  }
  // For longer numbers (11+ digits), assume they already have a country code
  // and pass through as-is - this handles unlisted countries
  // For other lengths, also pass through (user responsibility)
  
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
  // Universal maps link - works with Google Maps, Apple Maps, Waze and others
  const mapsLink = `https://maps.google.com/maps?q=${SALON_LOCATION.lat},${SALON_LOCATION.lng}`;
  
  const message = `مرحباً ${clientName}! ✨

تم تأكيد حجزك بنجاح:
📅 التاريخ: ${appointmentDate}
⏰ الوقت: ${appointmentTime}
💅 الخدمة: ${serviceName}

📍 العنوان: ${SALON_LOCATION.address}
🗺️ افتح الموقع: ${mapsLink}

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
