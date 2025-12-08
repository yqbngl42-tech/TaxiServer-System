import vision from '@google-cloud/vision';
import logger from './logger.js';

// ===============================================
// 🔍 OCR SERVICE
// ===============================================
// זיהוי טקסט מתמונות עם Google Cloud Vision

class OCRService {
  constructor() {
    // יצירת client
    // הגדרות נלקחות מ-GOOGLE_APPLICATION_CREDENTIALS בסביבה
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    this.client = new vision.ImageAnnotatorClient({ credentials });
    logger.info(`✅ Google Vision client loaded for: ${credentials.client_email}`);
  }
  
  /**
   * זיהוי טקסט מתמונה
   * @param {Buffer|string} image - Buffer של תמונה או נתיב
   * @returns {Promise<Object>} תוצאות OCR
   */
  async extractText(image) {
    const startTime = Date.now();
    
    try {
      logger.info('🔍 Starting OCR processing...');
      
      // שליחה ל-Google Vision
      const [result] = await this.client.textDetection(image);
      
      const processingTime = Date.now() - startTime;
      
      // בדיקה אם נמצא טקסט
      const detections = result.textAnnotations;
      
      if (!detections || detections.length === 0) {
        logger.warn('⚠️ No text detected in image');
        return {
          success: false,
          error: 'No text detected',
          fullText: '',
          confidence: 0,
          processingTime
        };
      }
      
      // הטקסט המלא נמצא באלמנט הראשון
      const fullText = detections[0].description || '';
      
      // רמת ביטחון ממוצעת
      const avgConfidence = detections
        .filter(d => d.confidence)
        .reduce((sum, d, i, arr) => sum + d.confidence / arr.length, 0);
      
      logger.success('✅ OCR completed', {
        textLength: fullText.length,
        confidence: avgConfidence.toFixed(2),
        processingTime: `${processingTime}ms`
      });
      
      return {
        success: true,
        fullText,
        confidence: avgConfidence,
        processingTime,
        detections: detections.slice(1) // כל הזיהויים מלבד הראשון
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('❌ OCR processing failed', {
        error: error.message,
        processingTime: `${processingTime}ms`
      });
      
      return {
        success: false,
        error: error.message,
        fullText: '',
        confidence: 0,
        processingTime
      };
    }
  }
  
  /**
   * חילוץ קוד תשלום מטקסט
   * @param {string} text - טקסט מלא
   * @returns {string|null} קוד שזוהה או null
   */
  extractPaymentCode(text) {
    // חיפוש דפוסים שונים:
    // "קוד תשלום: 123456"
    // "קוד: 123456"
    // "תשלום: 123456"
    // רק 6 ספרות
    
    const patterns = [
      /קוד\s*תשלום\s*:?\s*(\d{6})/i,
      /תשלום\s*:?\s*(\d{6})/i,
      /קוד\s*:?\s*(\d{6})/i,
      /code\s*:?\s*(\d{6})/i,
      /payment\s*:?\s*(\d{6})/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        logger.debug('✅ Payment code found', { code: match[1] });
        return match[1];
      }
    }
    
    // אם לא מצאנו עם המילים, נחפש פשוט 6 ספרות
    const simpleMatch = text.match(/\b(\d{6})\b/);
    if (simpleMatch && simpleMatch[1]) {
      logger.debug('⚠️ Possible payment code found (without keywords)', { 
        code: simpleMatch[1] 
      });
      return simpleMatch[1];
    }
    
    logger.warn('❌ No payment code found in text');
    return null;
  }
  
  /**
   * חילוץ סכום מטקסט
   * @param {string} text - טקסט מלא
   * @returns {number|null} סכום שזוהה או null
   */
  extractAmount(text) {
    // חיפוש דפוסים שונים:
    // "100 ₪"
    // "₪100"
    // "100.00"
    // "100 שקלים"
    
    const patterns = [
      /(\d{1,5})(?:\.\d{2})?\s*₪/,
      /₪\s*(\d{1,5})(?:\.\d{2})?/,
      /(\d{1,5})(?:\.\d{2})?\s*שקלים/i,
      /סכום\s*:?\s*(\d{1,5})(?:\.\d{2})?/i,
      /amount\s*:?\s*(\d{1,5})(?:\.\d{2})?/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const amount = parseFloat(match[1]);
        logger.debug('✅ Amount found', { amount });
        return amount;
      }
    }
    
    logger.warn('❌ No amount found in text');
    return null;
  }
  
  /**
   * חילוץ מספר טלפון מטקסט
   * @param {string} text - טקסט מלא
   * @returns {string|null} מספר טלפון שזוהה או null
   */
  extractPhoneNumber(text) {
    // דפוסים למספרי טלפון ישראליים
    const patterns = [
      /05[0-9]-?\d{7}/,           // 050-1234567 או 0501234567
      /05[0-9]\s*-?\s*\d{7}/,     // 050 1234567
      /\+?972-?5[0-9]-?\d{7}/     // +972-50-1234567
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[0]) {
        // נקה את המספר - הסר רווחים ומקפים
        const phone = match[0].replace(/[\s-]/g, '');
        logger.debug('✅ Phone number found', { phone });
        return phone;
      }
    }
    
    logger.warn('❌ No phone number found in text');
    return null;
  }
  
  /**
   * חילוץ תאריך מטקסט
   * @param {string} text - טקסט מלא
   * @returns {string|null} תאריך שזוהה או null
   */
  extractDate(text) {
    // דפוסים לתאריכים
    const patterns = [
      /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/,  // 06/12/2025 או 06-12-25
      /(\d{1,2}\s+\w+\s+\d{4})/,                   // 6 December 2025
      /(\d{4}-\d{2}-\d{2})/                         // 2025-12-06
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        logger.debug('✅ Date found', { date: match[1] });
        return match[1];
      }
    }
    
    logger.warn('❌ No date found in text');
    return null;
  }
  
  /**
   * חילוץ זמן מטקסט
   * @param {string} text - טקסט מלא
   * @returns {string|null} זמן שזוהה או null
   */
  extractTime(text) {
    // דפוסים לזמן
    const patterns = [
      /(\d{1,2}:\d{2}(?::\d{2})?)/,  // 14:30 או 14:30:45
      /(\d{1,2}\s*:\s*\d{2})/         // 14 : 30
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        logger.debug('✅ Time found', { time: match[1] });
        return match[1];
      }
    }
    
    return null;
  }
  
  /**
   * עיבוד מלא של תמונת תשלום
   * @param {Buffer|string} image - תמונה
   * @returns {Promise<Object>} כל הנתונים שזוהו
   */
  async processPaymentScreenshot(image) {
    logger.info('📸 Processing payment screenshot...');
    
    // חילוץ טקסט
    const ocrResult = await this.extractText(image);
    
    if (!ocrResult.success) {
      return {
        success: false,
        error: ocrResult.error,
        extractedData: null
      };
    }
    
    const text = ocrResult.fullText;
    
    // חילוץ כל הנתונים
    const extractedData = {
      paymentCode: this.extractPaymentCode(text),
      amount: this.extractAmount(text),
      phoneNumber: this.extractPhoneNumber(text),
      date: this.extractDate(text),
      time: this.extractTime(text),
      fullText: text,
      confidence: ocrResult.confidence,
      processingTime: ocrResult.processingTime
    };
    
    logger.success('✅ Screenshot processed', {
      hasCode: !!extractedData.paymentCode,
      hasAmount: !!extractedData.amount,
      hasPhone: !!extractedData.phoneNumber
    });
    
    return {
      success: true,
      extractedData
    };
  }
  
  /**
   * בדיקת זיוף תמונה (פשוטה)
   * @param {Buffer|string} image - תמונה
   * @returns {Promise<Object>} תוצאות בדיקה
   */
  async detectFraud(image) {
    try {
      // Google Vision יכול לזהות גם Safe Search
      const [result] = await this.client.safeSearchDetection(image);
      const safe = result.safeSearchAnnotation;
      
      // בדיקה בסיסית
      const isSuspicious = 
        safe.adult === 'VERY_LIKELY' ||
        safe.violence === 'VERY_LIKELY' ||
        safe.racy === 'VERY_LIKELY';
      
      return {
        isSuspicious,
        safeSearch: safe
      };
      
    } catch (error) {
      logger.error('❌ Fraud detection failed', { error: error.message });
      return {
        isSuspicious: false,
        error: error.message
      };
    }
  }
}

// ===============================================
// 📤 EXPORT SINGLETON
// ===============================================

const ocrService = new OCRService();

export default ocrService;
