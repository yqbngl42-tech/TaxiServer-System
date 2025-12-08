import PendingPayment from '../models/PendingPayment.js';
import crypto from 'crypto';

// ===============================================
// 💳 PAYMENT CODE GENERATOR
// ===============================================
// יוצר קודי תשלום חד-פעמיים ייחודיים

class PaymentCodeGenerator {
  
  /**
   * יצירת קוד תשלום חדש (6 ספרות)
   * @returns {string} קוד 6 ספרות
   */
  static generate() {
    // יצירת 6 ספרות אקראיות
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    return code;
  }
  
  /**
   * יצירת קוד ייחודי (בדיקה שלא קיים ב-DB)
   * @returns {Promise<string>} קוד ייחודי
   */
  static async generateUnique() {
    let code;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      code = this.generate();
      
      // בדוק אם הקוד כבר קיים
      const existing = await PendingPayment.findByCode(code);
      
      if (!existing) {
        return code;
      }
      
      attempts++;
    }
    
    // אם לא הצלחנו אחרי 10 ניסיונות, השתמש בcrypto
    const randomBytes = crypto.randomBytes(3);
    code = (parseInt(randomBytes.toString('hex'), 16) % 900000 + 100000).toString();
    
    return code;
  }
  
  /**
   * אימות פורמט קוד
   * @param {string} code 
   * @returns {boolean}
   */
  static isValid(code) {
    return /^\d{6}$/.test(code);
  }
  
  /**
   * יצירת תשלום ממתין מלא
   * @param {string} driverId - מזהה נהג
   * @param {number} amount - סכום לתשלום
   * @param {number} expiryMinutes - דקות עד תפוגה (ברירת מחדל 10)
   * @returns {Promise<Object>} אובייקט תשלום ממתין
   */
  static async createPendingPayment(driverId, amount, expiryMinutes = 10) {
    const code = await this.generateUnique();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiryMinutes * 60 * 1000);
    
    const pendingPayment = new PendingPayment({
      driverId,
      amount,
      paymentCode: code,
      createdAt: now,
      expiresAt,
      status: 'pending'
    });
    
    await pendingPayment.save();
    
    return {
      code,
      amount,
      expiresAt,
      expiryMinutes,
      payment: pendingPayment
    };
  }
  
  /**
   * חישוב סכום עמלה
   * @param {number} totalRides - מספר נסיעות
   * @param {number} percentageFee - אחוז עמלה (ברירת מחדל 12)
   * @param {number} pricePerRide - מחיר ממוצע לנסיעה (ברירת מחדל 100)
   * @returns {number} סכום עמלה
   */
  static calculateCommission(totalRides, percentageFee = 12, pricePerRide = 100) {
    const totalRevenue = totalRides * pricePerRide;
    const commission = (totalRevenue * percentageFee) / 100;
    return Math.round(commission);
  }
  
  /**
   * בדיקה אם נהג צריך לשלם
   * @param {Object} driver - אובייקט נהג
   * @returns {Promise<Object|null>} פרטי תשלום אם צריך, null אם לא
   */
  static async checkDriverNeedsPayment(driver) {
    // לדוגמה: נהג צריך לשלם כל 10 נסיעות
    const ridesThreshold = 10;
    const percentageFee = 12;
    
    // בדוק אם יש תשלום ממתין
    const existingPending = await PendingPayment.findPendingForDriver(driver._id);
    
    if (existingPending && existingPending.length > 0) {
      return {
        needsPayment: true,
        reason: 'existing_pending',
        existingPayment: existingPending[0]
      };
    }
    
    // בדוק אם הגיע לסף נסיעות
    if (driver.completedRides >= ridesThreshold) {
      const amount = this.calculateCommission(driver.completedRides, percentageFee);
      
      return {
        needsPayment: true,
        reason: 'rides_threshold',
        ridesCount: driver.completedRides,
        amount
      };
    }
    
    return null;
  }
  
  /**
   * יצירת הודעת תשלום לנהג
   * @param {string} code - קוד תשלום
   * @param {number} amount - סכום
   * @param {string} phone - מספר טלפון ליעד
   * @param {number} expiryMinutes - דקות עד תפוגה
   * @returns {string} הודעה מעוצבת
   */
  static createPaymentMessage(code, amount, phone = '050-9630017', expiryMinutes = 10) {
    return `🔔 *דרוש תשלום עמלה*

כדי להמשיך לקבל נסיעות, עליך לשלם את עמלת המערכת.

💰 *סכום לתשלום:* ${amount} ₪
📱 *מספר להעברה:* ${phone}

📝 *חשוב!* יש לרשום בהערת התשלום:
🔑 *קוד תשלום:* ${code}

⏰ *הקוד תקף ל:* ${expiryMinutes} דקות

*אחרי התשלום:*
1. צלם מסך של העברת הכסף (כולל הקוד בהערות)
2. שלח את התמונה לכאן
3. המערכת תאמת אוטומטית ותפתח לך גישה

⚠️ *הקוד משתנה בכל תשלום - לא ניתן למחזור קודים ישנים*`;
  }
  
  /**
   * יצירת הודעת תזכורת
   * @param {number} reminderNumber - מספר התזכורת (1-4)
   * @param {string} code - קוד תשלום
   * @param {number} amount - סכום
   * @returns {string} הודעת תזכורת
   */
  static createReminderMessage(reminderNumber, code, amount) {
    const messages = {
      1: `⏰ *תזכורת ראשונה*

עדיין לא ביצעת תשלום עמלה.

🔑 קוד תשלום: ${code}
💰 סכום: ${amount} ₪

נא להשלים התשלום כדי להמשיך לקבל נסיעות.`,
      
      2: `⚠️ *תזכורת שנייה*

שעה עברה ועדיין לא שילמת.

🔑 קוד תשלום: ${code}
💰 סכום: ${amount} ₪

*נא להשלים תשלום בהקדם כדי להמשיך לעבוד.*`,
      
      3: `🚨 *אזהרה!*

12 שעות עברו ועדיין לא שילמת!

🔑 קוד תשלום: ${code}
💰 סכום: ${amount} ₪

*אם לא תשלים תשלום בקרוב, הגישה שלך תיחסם!*`,
      
      4: `❌ *אזהרה סופית!*

48 שעות עברו ללא תשלום.

🔑 קוד תשלום: ${code}
💰 סכום: ${amount} ₪

*הגישה שלך תיחסם תוך שעה אם לא תשלם מיד!*

📞 לבעיות: 050-9630017`
    };
    
    return messages[reminderNumber] || messages[1];
  }
  
  /**
   * הודעת חסימה
   * @returns {string}
   */
  static createBlockMessage() {
    return `🔒 *הגישה שלך נחסמה*

הגישה שלך נחסמה עקב אי תשלום עמלה בזמן.

📞 *לפתיחה יש ליצור קשר עם המנהל:*
050-9630017`;
  }
  
  /**
   * הודעת אישור תשלום
   * @returns {string}
   */
  static createSuccessMessage() {
    return `✅ *התשלום אומת בהצלחה!*

הגישה שלך נפתחה.
אפשר להמשיך לקבל נסיעות.

תודה! 🙏`;
  }
  
  /**
   * הודעת שגיאה באימות
   * @param {string} reason - סיבת השגיאה
   * @returns {string}
   */
  static createFailureMessage(reason) {
    const messages = {
      code_not_found: '❌ לא הצלחתי למצוא את קוד התשלום בתמונה.\nודא שהקוד מופיע בהערות התשלום.',
      code_mismatch: '❌ הקוד שזוהה אינו תואם לקוד שקיבלת.\nודא שהעתקת את הקוד הנכון.',
      amount_mismatch: '❌ הסכום בתמונה אינו תואם את הסכום הנדרש.\nודא שהעברת את הסכום המדויק.',
      phone_mismatch: '❌ מספר היעד בתמונה שגוי.\nודא שהעברת למספר הנכון.',
      expired: '❌ הקוד פג תוקף.\nקבל קוד חדש ונסה שוב.',
      old_screenshot: '❌ צילום המסך ישן מדי.\nהעבר תשלום חדש ושלח צילום מסך עדכני.',
      invalid_image: '❌ לא הצלחתי לקרוא את התמונה.\nודא שהתמונה ברורה וקריאה.'
    };
    
    return messages[reason] || `❌ לא הצלחתי לאמת את התשלום.\n\nסיבה: ${reason}\n\nנא לוודא שהעלית צילום מסך תקין ושהקוד מופיע בהערות.`;
  }
}

// ===============================================
// 📤 EXPORT
// ===============================================

export default PaymentCodeGenerator;
