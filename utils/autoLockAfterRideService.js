import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import PaymentCodeGenerator from './paymentCodeGenerator.js';
import logger from './logger.js';

// ===============================================
// 🔒 AUTO LOCK AFTER RIDE SERVICE
// ===============================================
// נעילה אוטומטית של נהג אחרי נסיעה + יצירת תשלום

class AutoLockAfterRideService {
  
  /**
   * טיפול בסיום נסיעה - נעילה אוטומטית
   * @param {string} rideId - מזהה נסיעה
   * @param {string} driverId - מזהה נהג
   * @returns {Promise<Object>}
   */
  async handleRideCompletion(rideId, driverId) {
    try {
      logger.info('🚗 Handling ride completion', { rideId, driverId });
      
      // 1. מצא את הנסיעה
      const ride = await Ride.findById(rideId);
      if (!ride) {
        throw new Error('Ride not found');
      }
      
      // 2. מצא את הנהג
      const driver = await Driver.findById(driverId);
      if (!driver) {
        throw new Error('Driver not found');
      }
      
      // 3. חשב עמלה
      const commissionPercentage = parseFloat(process.env.COMMISSION_PERCENTAGE || 12);
      const ridePrice = ride.price || 0;
      const commissionAmount = Math.round((ridePrice * commissionPercentage) / 100);
      
      logger.info('💰 Calculated commission', {
        ridePrice,
        commissionPercentage,
        commissionAmount
      });
      
      // 4. נעל את הנהג מיד!
      driver.isBlocked = true;
      driver.blockReason = `Ride completed - payment required (${commissionAmount} ₪)`;
      driver.blockedAt = new Date();
      await driver.save();
      
      logger.warn('🔒 Driver locked automatically', {
        driverId,
        driverPhone: driver.phone
      });
      
      // 5. צור תשלום ממתין
      const expiryMinutes = parseInt(process.env.PAYMENT_CODE_EXPIRY_MINUTES || 10);
      const payment = await PaymentCodeGenerator.createPendingPayment(
        driverId,
        commissionAmount,
        expiryMinutes
      );
      
      logger.success('✅ Payment created', {
        code: payment.code,
        amount: commissionAmount
      });
      
      // 6. צור הודעה לנהג
      const paymentPhone = process.env.PAYMENT_PHONE || '050-9630017';
      const message = this.createImmediatePaymentMessage(
        payment.code,
        commissionAmount,
        ridePrice,
        paymentPhone,
        expiryMinutes
      );
      
      // 7. שלח הודעה לנהג דרך הבוט
      await this.sendToBot(driver.phone, message);
      
      logger.success('📨 Payment message sent to driver', {
        driverId,
        driverPhone: driver.phone
      });
      
      return {
        success: true,
        locked: true,
        payment: {
          code: payment.code,
          amount: commissionAmount,
          expiresAt: payment.expiresAt
        },
        message
      };
      
    } catch (error) {
      logger.error('❌ Failed to handle ride completion', {
        error: error.message,
        rideId,
        driverId
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * יצירת הודעת תשלום מיידית
   * @param {string} code - קוד תשלום
   * @param {number} amount - סכום
   * @param {number} ridePrice - מחיר הנסיעה
   * @param {string} phone - מספר טלפון
   * @param {number} expiryMinutes - דקות עד תפוגה
   * @returns {string}
   */
  createImmediatePaymentMessage(code, amount, ridePrice, phone, expiryMinutes) {
    return `🔒 *הגישה שלך ננעלה*

סיימת נסיעה בהצלחה! 🎉
💰 מחיר הנסיעה: ${ridePrice} ₪

*כדי להמשיך לקבל נסיעות, עליך לשלם עמלה:*

💵 *סכום לתשלום:* ${amount} ₪ (${process.env.COMMISSION_PERCENTAGE || 12}% עמלה)
📱 *מספר להעברה:* ${phone}

📝 *חשוב!* יש לרשום בהערת התשלום:
🔑 *קוד תשלום:* ${code}

⏰ *הקוד תקף ל:* ${expiryMinutes} דקות

*אחרי התשלום:*
1️⃣ צלם מסך של העברת הכסף (כולל הקוד בהערות)
2️⃣ שלח את התמונה לכאן
3️⃣ המערכת תאמת אוטומטית ותפתח לך גישה מיד!

⚠️ *עד אז לא תוכל לקבל נסיעות חדשות*

📞 לבעיות: ${phone}`;
  }
  
  /**
   * שליחת הודעה לבוט
   * @param {string} phone - מספר טלפון
   * @param {string} message - הודעה
   */
  async sendToBot(phone, message) {
    try {
      if (!process.env.BOT_URL) {
        logger.warn('⚠️ BOT_URL not configured, skipping message');
        return;
      }
      
      const response = await fetch(`${process.env.BOT_URL}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message })
      });
      
      if (!response.ok) {
        throw new Error(`Bot returned status ${response.status}`);
      }
      
      logger.debug('✅ Message sent to bot', { phone });
      
    } catch (error) {
      logger.error('❌ Failed to send message to bot', {
        error: error.message,
        phone
      });
      // לא לזרוק שגיאה - זה לא קריטי
    }
  }
  
  /**
   * בדיקה אם נהג צריך לשלם לפני לקיחת נסיעה
   * @param {string} driverId - מזהה נהג
   * @returns {Promise<Object>}
   */
  async checkBeforeTakingRide(driverId) {
    try {
      const driver = await Driver.findById(driverId);
      
      if (!driver) {
        return {
          canTake: false,
          reason: 'Driver not found'
        };
      }
      
      // בדוק אם נעול
      if (driver.isBlocked) {
        // מצא תשלום ממתין
        const PendingPayment = (await import('../models/PendingPayment.js')).default;
        const pendingPayment = await PendingPayment.findOne({
          driverId,
          status: 'pending'
        }).sort({ createdAt: -1 });
        
        if (pendingPayment) {
          return {
            canTake: false,
            reason: 'payment_required',
            message: `🔒 הגישה שלך נעולה
            
אתה חייב לשלם עמלה על הנסיעה האחרונה.

💰 סכום: ${pendingPayment.amount} ₪
🔑 קוד תשלום: ${pendingPayment.paymentCode}

שלם ושלח צילום מסך כדי לפתוח גישה.`,
            payment: {
              code: pendingPayment.paymentCode,
              amount: pendingPayment.amount
            }
          };
        }
        
        return {
          canTake: false,
          reason: 'blocked',
          message: '🔒 הגישה שלך נעולה. פנה למנהל: 050-9630017'
        };
      }
      
      return {
        canTake: true
      };
      
    } catch (error) {
      logger.error('❌ Error checking driver before ride', {
        error: error.message,
        driverId
      });
      
      return {
        canTake: false,
        reason: 'system_error'
      };
    }
  }
}

// ===============================================
// 📤 EXPORT SINGLETON
// ===============================================

const autoLockAfterRideService = new AutoLockAfterRideService();

export default autoLockAfterRideService;
