// ===============================================
// Ride Helper Functions
// Extracted from server.js
// ===============================================

import crypto from 'crypto';
import logger from './logger.js';

export function generateUniqueRideLink(rideId) {
  // יצירת token אבטחה ייחודי
  const token = crypto.randomBytes(16).toString('hex');
  
  // מספר Twilio
  const twilioNumber = process.env.TWILIO_WHATSAPP_FROM
    .replace('whatsapp:', '')
    .replace('+', '');
  
  // הטקסט שיופיע בשורת ההקלדה כשהנהג לוחץ
  const message = encodeURIComponent(`RIDE:${rideId}:${token}`);
  
  // יצירת קישור WhatsApp
  const link = `https://wa.me/${twilioNumber}?text=${message}`;
  
  logger.info('Generated unique ride link', { 
    rideId, 
    tokenPreview: token.substring(0, 8) + '...'
  });
  
  return { link, token };
}


export function extractCity(address) {
  if (!address || typeof address !== 'string') return '---';
  
  address = address.trim();
  
  // אם יש פסיק - קח את החלק האחרון
  if (address.includes(',')) {
    const parts = address.split(',').map(p => p.trim());
    return parts[parts.length - 1] || '---';
  }
  
  // הסר מספרי רחוב וקח רק שם עיר
  const words = address.split(' ');
  const nonNumericWords = words.filter(word => {
    const cleaned = word.replace(/[^\d]/g, '');
    return cleaned.length === 0 || cleaned.length !== word.length;
  });
  
  if (nonNumericWords.length >= 2) {
    return nonNumericWords.slice(-2).join(' ');
  } else if (nonNumericWords.length === 1) {
    return nonNumericWords[0];
  }
  
  return address;
}

