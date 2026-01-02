import twilio from 'twilio';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.account_sid || !connectionSettings.settings.api_key || !connectionSettings.settings.api_key_secret)) {
    throw new Error('Twilio not connected');
  }
  return {
    accountSid: connectionSettings.settings.account_sid,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number
  };
}

export async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  return twilio(apiKey, apiKeySecret, {
    accountSid: accountSid
  });
}

export async function getTwilioFromPhoneNumber() {
  const { phoneNumber } = await getCredentials();
  return phoneNumber;
}

export async function sendWhatsAppMessage(to: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const client = await getTwilioClient();
    const fromNumber = await getTwilioFromPhoneNumber();
    
    const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const formattedFrom = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;
    
    const result = await client.messages.create({
      body: message,
      from: formattedFrom,
      to: formattedTo
    });
    
    return { success: true, messageId: result.sid };
  } catch (error: any) {
    console.error('WhatsApp send error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendSMS(to: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const client = await getTwilioClient();
    const fromNumber = await getTwilioFromPhoneNumber();
    
    const result = await client.messages.create({
      body: message,
      from: fromNumber,
      to: to
    });
    
    return { success: true, messageId: result.sid };
  } catch (error: any) {
    console.error('SMS send error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendAppointmentReminder(
  clientPhone: string,
  clientName: string,
  appointmentDate: string,
  appointmentTime: string,
  serviceName: string,
  useWhatsApp: boolean = true
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const message = `مرحباً ${clientName}،\n\nتذكير بموعدك في PREGASQUAD:\n📅 التاريخ: ${appointmentDate}\n⏰ الوقت: ${appointmentTime}\n💇 الخدمة: ${serviceName}\n\nنتطلع لرؤيتك! ✨`;
  
  if (useWhatsApp) {
    return sendWhatsAppMessage(clientPhone, message);
  } else {
    return sendSMS(clientPhone, message);
  }
}

export async function sendBookingConfirmation(
  clientPhone: string,
  clientName: string,
  appointmentDate: string,
  appointmentTime: string,
  serviceName: string,
  useWhatsApp: boolean = true
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const message = `مرحباً ${clientName}،\n\n✅ تم تأكيد حجزك بنجاح!\n📅 التاريخ: ${appointmentDate}\n⏰ الوقت: ${appointmentTime}\n💇 الخدمة: ${serviceName}\n\nشكراً لاختيارك PREGASQUAD! 💜`;
  
  if (useWhatsApp) {
    return sendWhatsAppMessage(clientPhone, message);
  } else {
    return sendSMS(clientPhone, message);
  }
}
