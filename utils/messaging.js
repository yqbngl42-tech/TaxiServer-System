// ===============================================
// Messaging Helper Functions
// Extracted from server.js
// ===============================================

import twilioAdapter from './twilioAdapter.js';
import logger from './logger.js';
import { extractCity } from './rideHelpers.js';

export async function sendBulkMessagesWithRateLimit(phoneNumbers, message, delayMs = 500) {
  const results = {
    success: [],
    failed: []
  };
  
  logger.action(`Starting bulk send to ${phoneNumbers.length} numbers`, { 
    count: phoneNumbers.length 
  });
  
  for (let i = 0; i < phoneNumbers.length; i++) {
    const phone = phoneNumbers[i];
    
    try {
      logger.info(`Sending ${i + 1}/${phoneNumbers.length}`, { phone });
      await twilioAdapter.sendWhatsAppMessage(phone, message);
      results.success.push(phone);
      logger.success(`Sent successfully`, { phone });
    } catch (err) {
      logger.error(`Failed to send`, { 
        phone, 
        error: err.message,
        code: err.code 
      });
      results.failed.push({ phone, error: err.message });
    }
    
    // Rate limiting - wait between messages
    if (i < phoneNumbers.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  logger.action('Bulk send completed', {
    total: phoneNumbers.length,
    success: results.success.length,
    failed: results.failed.length
  });
  
  return results;
}


export function createGroupMessage(ride) {
  // חילוץ רק שם העיר (לא כתובת מדויקת!)
  const pickupCity = extractCity(ride.pickup);
  const destCity = extractCity(ride.destination);
  
  // אם יש קישור ייחודי - השתמש בו
  const linkText = ride.uniqueLink 
    ? `⚠️ *לפרטים מלאים - לחץ על הקישור:*\n${ride.uniqueLink}\n\n⏰ *נהג ראשון שמגיב - מקבל את הנסיעה!*\n\n🔒 *פרטי הלקוח והכתובת המדויקת יישלחו רק לנהג שלוקח את הנסיעה*`
    : `💬 לקבלה - כתבו:\nACCEPT ${ride._id}`;

  return `🚖 *נסיעה חדשה!* ${ride.rideNumber}

📍 *מ:* ${pickupCity}
🎯 *ל:* ${destCity}
💰 *מחיר:* ₪${ride.price}
${ride.scheduledTime ? `🕐 *שעה:* ${new Date(ride.scheduledTime).toLocaleString('he-IL')}` : '⚡ *נסיעה מיידית*'}

${linkText}`;
}


export function createPrivateMessage(ride) {
  return `✅ קיבלת את הנסיעה ${ride.rideNumber}!

📞 לקוח: ${ride.customerName} - ${ride.customerPhone}
📍 איסוף: ${ride.pickup}
🎯 יעד: ${ride.destination}
💰 מחיר: ₪${ride.price}
${ride.notes ? `📝 הערות: ${ride.notes}` : ''}

להצלחה! 🚗`;
}

