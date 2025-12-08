import ocrService from './ocrService.js';
import PendingPayment from '../models/PendingPayment.js';
import Driver from '../models/Driver.js';
import logger from './logger.js';
import PaymentCodeGenerator from './paymentCodeGenerator.js';

// ===============================================
// ✅ PAYMENT VERIFICATION SERVICE
// ===============================================
// אימות תשלומים דרך OCR

class PaymentVerificationService {
  
  /**
   * אימות תשלום מתמונה
   * @param {string} driverId - מזהה נהג
   * @param {Buffer} imageBuffer - תמונת צילום מסך
   * @param {string} expectedPhone - מספר טלפון צפוי
   * @returns {Promise<Object>} תוצאות אימות
   */
  async verifyPayment(driverId, imageBuffer, expectedPhone = '0509630017') {
    logger.info('🔍 Starting payment verification', { driverId });
    
    try {
      // 1. מצא תשלומים ממתינים לנהג
      const pendingPayments = await PendingPayment.findPendingForDriver(driverId);
      
      if (!pendingPayments || pendingPayments.length === 0) {
        logger.warn('⚠️ No pending payments found', { driverId });
        return {
          success: false,
          error: 'no_pending_payment',
          message: 'לא נמצא תשלום ממתין עבור נהג זה'
        };
      }
      
      const pendingPayment = pendingPayments[0];
      
      // 2. בדוק אם פג תוקף
      if (pendingPayment.isExpired()) {
        logger.warn('⚠️ Payment code expired', { code: pendingPayment.paymentCode });
        await pendingPayment.markAsExpired();
        await pendingPayment.save();
        
        return {
          success: false,
          error: 'expired',
          message: 'הקוד פג תוקף',
          pendingPayment
        };
      }
      
      // 3. עיבוד התמונה ב-OCR
      logger.info('📸 Processing screenshot with OCR...');
      const ocrResult = await ocrService.processPaymentScreenshot(imageBuffer);
      
      if (!ocrResult.success) {
        logger.error('❌ OCR processing failed', { error: ocrResult.error });
        return {
          success: false,
          error: 'invalid_image',
          message: 'לא הצלחתי לקרוא את התמונה'
        };
      }
      
      const extracted = ocrResult.extractedData;
      
      // 4. אימות נתונים
      const verification = await this.validateExtractedData(
        extracted,
        pendingPayment,
        expectedPhone
      );
      
      // 5. שמירת תוצאות OCR
      pendingPayment.ocrResult = {
        extractedText: extracted.fullText,
        detectedCode: extracted.paymentCode,
        detectedAmount: extracted.amount,
        detectedPhone: extracted.phoneNumber,
        detectedDate: extracted.date,
        confidence: extracted.confidence,
        processingTime: extracted.processingTime
      };
      
      pendingPayment.verification = verification;
      
      // 6. אם כל הבדיקות עברו - אשר
      if (verification.overallValid) {
        logger.success('✅ Payment verified successfully', {
          driverId,
          code: pendingPayment.paymentCode
        });
        
        // סמן כמאומת
        await pendingPayment.markAsVerified(
          pendingPayment.ocrResult,
          verification
        );
        
        // פתח את הנהג
        const driver = await Driver.findById(driverId);
        if (driver) {
          driver.isBlocked = false;
          driver.balance = (driver.balance || 0) - pendingPayment.amount;
          await driver.save();
          
          logger.info('✅ Driver unblocked', { driverId });
        }
        
        await pendingPayment.save();
        
        return {
          success: true,
          verified: true,
          message: 'התשלום אומת בהצלחה',
          pendingPayment,
          driver
        };
        
      } else {
        // נכשל
        logger.warn('❌ Payment verification failed', {
          driverId,
          reason: verification.failureReason
        });
        
        await pendingPayment.markAsFailed(verification.failureReason);
        await pendingPayment.save();
        
        return {
          success: false,
          verified: false,
          error: verification.failureReason,
          message: PaymentCodeGenerator.createFailureMessage(verification.failureReason),
          pendingPayment,
          verification
        };
      }
      
    } catch (error) {
      logger.error('❌ Payment verification error', {
        error: error.message,
        driverId
      });
      
      return {
        success: false,
        error: 'system_error',
        message: 'שגיאת מערכת באימות תשלום',
        details: error.message
      };
    }
  }
  
  /**
   * אימות נתונים שחולצו
   * @param {Object} extracted - נתונים מ-OCR
   * @param {Object} pendingPayment - תשלום ממתין
   * @param {string} expectedPhone - מספר טלפון צפוי
   * @returns {Object} תוצאות אימות
   */
  async validateExtractedData(extracted, pendingPayment, expectedPhone) {
    const verification = {
      codeMatch: false,
      amountMatch: false,
      phoneMatch: false,
      timeValid: false,
      overallValid: false,
      failureReason: null
    };
    
    // 1. בדיקת קוד תשלום
    if (!extracted.paymentCode) {
      verification.failureReason = 'code_not_found';
      return verification;
    }
    
    verification.codeMatch = extracted.paymentCode === pendingPayment.paymentCode;
    
    if (!verification.codeMatch) {
      verification.failureReason = 'code_mismatch';
      return verification;
    }
    
    // 2. בדיקת סכום
    if (!extracted.amount) {
      verification.failureReason = 'amount_not_found';
      return verification;
    }
    
    // אפשר סטייה של עד 1 ש"ח
    const amountDiff = Math.abs(extracted.amount - pendingPayment.amount);
    verification.amountMatch = amountDiff <= 1;
    
    if (!verification.amountMatch) {
      verification.failureReason = 'amount_mismatch';
      return verification;
    }
    
    // 3. בדיקת מספר טלפון
    if (extracted.phoneNumber) {
      // נקה את שני המספרים
      const cleanExpected = expectedPhone.replace(/[\s-]/g, '');
      const cleanExtracted = extracted.phoneNumber.replace(/[\s-]/g, '');
      
      verification.phoneMatch = 
        cleanExtracted.includes(cleanExpected) ||
        cleanExpected.includes(cleanExtracted);
      
      if (!verification.phoneMatch) {
        verification.failureReason = 'phone_mismatch';
        return verification;
      }
    } else {
      // אם לא מצאנו מספר, נתעלם (לא תמיד מופיע ברור)
      verification.phoneMatch = true;
    }
    
    // 4. בדיקת זמן - התשלום צריך להיות בטווח הזמן הנכון
    if (extracted.date && extracted.time) {
      try {
        // נסה לפרסר את התאריך
        const paymentDate = this.parseDateTime(extracted.date, extracted.time);
        const now = new Date();
        const createdAt = pendingPayment.createdAt;
        
        // התשלום צריך להיות אחרי יצירת הקוד ולפני עכשיו
        verification.timeValid = 
          paymentDate >= createdAt &&
          paymentDate <= now;
        
        if (!verification.timeValid) {
          verification.failureReason = 'old_screenshot';
          return verification;
        }
      } catch (err) {
        // אם לא הצלחנו לפרסר, נתעלם
        verification.timeValid = true;
      }
    } else {
      // אם לא מצאנו תאריך/שעה, נתעלם
      verification.timeValid = true;
    }
    
    // 5. אם הכל עבר - מאומת!
    verification.overallValid = 
      verification.codeMatch &&
      verification.amountMatch &&
      verification.phoneMatch &&
      verification.timeValid;
    
    return verification;
  }
  
  /**
   * פרסור תאריך ושעה
   * @param {string} dateStr - תאריך
   * @param {string} timeStr - שעה
   * @returns {Date}
   */
  parseDateTime(dateStr, timeStr) {
    // פשוט - נסה כמה פורמטים
    try {
      // אם יש תאריך בפורמט DD/MM/YYYY או DD-MM-YYYY
      const dateParts = dateStr.split(/[\/\-\.]/);
      if (dateParts.length === 3) {
        const [day, month, year] = dateParts;
        const timeParts = timeStr.split(':');
        const [hours, minutes] = timeParts;
        
        return new Date(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          parseInt(hours),
          parseInt(minutes)
        );
      }
    } catch (err) {
      // נופל ל-catch
    }
    
    throw new Error('Failed to parse date/time');
  }
  
  /**
   * אימות ידני על ידי אדמין
   * @param {string} paymentId - מזהה תשלום
   * @param {string} adminPhone - טלפון אדמין
   * @param {string} notes - הערות
   * @returns {Promise<Object>}
   */
  async manualVerify(paymentId, adminPhone, notes) {
    try {
      const pendingPayment = await PendingPayment.findById(paymentId);
      
      if (!pendingPayment) {
        return {
          success: false,
          error: 'payment_not_found',
          message: 'תשלום לא נמצא'
        };
      }
      
      // אמת ידנית
      pendingPayment.manualVerify(adminPhone, notes);
      
      // פתח נהג
      const driver = await Driver.findById(pendingPayment.driverId);
      if (driver) {
        driver.isBlocked = false;
        driver.balance = (driver.balance || 0) - pendingPayment.amount;
        await driver.save();
      }
      
      await pendingPayment.save();
      
      logger.info('✅ Payment manually verified', {
        paymentId,
        driverId: pendingPayment.driverId,
        adminPhone
      });
      
      return {
        success: true,
        verified: true,
        message: 'תשלום אומת ידנית בהצלחה',
        pendingPayment,
        driver
      };
      
    } catch (error) {
      logger.error('❌ Manual verification failed', {
        error: error.message,
        paymentId
      });
      
      return {
        success: false,
        error: 'system_error',
        message: 'שגיאה באימות ידני',
        details: error.message
      };
    }
  }
  
  /**
   * ביטול תשלום
   * @param {string} paymentId - מזהה תשלום
   * @param {string} reason - סיבת ביטול
   * @returns {Promise<Object>}
   */
  async cancelPayment(paymentId, reason) {
    try {
      const pendingPayment = await PendingPayment.findById(paymentId);
      
      if (!pendingPayment) {
        return {
          success: false,
          error: 'payment_not_found'
        };
      }
      
      pendingPayment.status = 'cancelled';
      pendingPayment.notes = reason;
      await pendingPayment.save();
      
      logger.info('✅ Payment cancelled', {
        paymentId,
        reason
      });
      
      return {
        success: true,
        message: 'תשלום בוטל',
        pendingPayment
      };
      
    } catch (error) {
      logger.error('❌ Payment cancellation failed', {
        error: error.message,
        paymentId
      });
      
      return {
        success: false,
        error: 'system_error',
        details: error.message
      };
    }
  }
}

// ===============================================
// 📤 EXPORT SINGLETON
// ===============================================

const paymentVerificationService = new PaymentVerificationService();

export default paymentVerificationService;
