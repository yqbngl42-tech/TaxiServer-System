// ===============================================
// 📝 DRIVER REGISTRATION HANDLER
// ===============================================
// מנהל את תהליך הרישום של נהגים דרך WhatsApp

import RegistrationSession from '../models/RegistrationSession.js';
import Driver from '../models/Driver.js';
import logger from './logger.js';

// ===============================================
// 📊 REGISTRATION FLOW
// ===============================================

const REGISTRATION_STEPS = {
  awaiting_name: {
    question: '👋 *שלום! ברוך הבא למערכת נהגי דרך צדיקים*\n\nכדי להירשם כנהג, אנא שלח את *שמך המלא*:',
    next: 'awaiting_id',
    validate: (value) => value && value.trim().length >= 2
  },
  awaiting_id: {
    question: 'מצוין! 👍\n\nעכשיו שלח את *מספר תעודת הזהות* שלך:\n(9 ספרות)',
    next: 'awaiting_car_type',
    validate: (value) => /^\d{9}$/.test(value.replace(/\D/g, ''))
  },
  awaiting_car_type: {
    question: 'תודה! 🚗\n\nאיזה *סוג רכב* יש לך?\n(לדוגמה: טויוטה קורולה, יונדאי i35, וכו\')',
    next: 'awaiting_car_number',
    validate: (value) => value && value.trim().length >= 2
  },
  awaiting_car_number: {
    question: 'מעולה! 🔢\n\nמה *מספר הרכב*?\n(לדוגמה: 12-345-67)',
    next: 'awaiting_work_area',
    validate: (value) => value && value.trim().length >= 5
  },
  awaiting_work_area: {
    question: 'נהדר! 📍\n\nמה *אזור העבודה* המועדף עליך?\n(לדוגמה: תל אביב, ירושלים, חיפה, או כל הארץ)',
    next: 'awaiting_city',
    validate: (value) => value && value.trim().length >= 2
  },
  awaiting_city: {
    question: '🏠 *באיזו עיר אתה מתגורר?*\n(לדוגמה: תל אביב, ירושלים, חיפה)',
    next: 'awaiting_id_document_photo',
    validate: (value) => value && value.trim().length >= 2
  },
  awaiting_id_document_photo: {
    question: '📸 *שלח צילום של אחד מהמסמכים הבאים:*\n\n✅ רישיון נהיגה\n*או*\n✅ תעודת זהות\n\n(בחר מסמך אחד בלבד - הצילום חייב להיות ברור וקריא)',
    next: 'awaiting_profile_photo',
    validate: null  // Images validated differently
  },
  awaiting_profile_photo: {
    question: '📸 *שלח תמונת פרופיל שלך*\n\n(תמונה ברורה של הפנים - תשמש לזיהוי במערכת)',
    next: 'awaiting_car_photo',
    validate: null
  },
  awaiting_car_photo: {
    question: '📸 *שלח תמונה של הרכב שלך*\n\n(תמונה ברורה של הרכב מבחוץ)',
    next: 'completed',
    validate: null
  }
};

// ===============================================
// 🔧 REGISTRATION HANDLER CLASS
// ===============================================

class RegistrationHandler {
  
  /**
   * Handle registration message
   */
  async handleMessage(phone, message, mediaUrl = null) {
    try {
      // Get or create session
      let session = await RegistrationSession.findOne({ phone });
      
      // Check if this is a new registration request
      if (!session && this.isRegistrationCommand(message)) {
        return await this.startRegistration(phone);
      }
      
      // If no active session, ignore
      if (!session || session.status !== 'in_progress') {
        return null;
      }
      
      // Handle current step
      return await this.processStep(session, message, mediaUrl);
      
    } catch (err) {
      logger.error('Registration handler error', { phone, error: err.message });
      return '❌ אירעה שגיאה. אנא נסה שוב או פנה למנהל.';
    }
  }
  
  /**
   * Check if message is registration command
   */
  isRegistrationCommand(message) {
    const commands = ['הרשמה', 'רישום', 'registration', 'register', 'sign up', 'signup'];
    const normalized = message.trim().toLowerCase();
    return commands.some(cmd => normalized.includes(cmd));
  }
  
  /**
   * Start new registration
   */
  async startRegistration(phone) {
    // Check if driver already exists
    const existingDriver = await Driver.findOne({ phone });
    if (existingDriver) {
      if (existingDriver.registrationStatus === 'approved') {
        return `✅ *אתה כבר רשום במערכת!*\n\nמזהה הנהג שלך: *${existingDriver.driverId}*\n\nאם יש לך בעיה, פנה למנהל.`;
      } else if (existingDriver.registrationStatus === 'pending') {
        return '⏳ *הבקשה שלך בטיפול*\n\nהמנהל יאשר אותה בקרוב. נעדכן אותך כשהבקשה תאושר!';
      } else if (existingDriver.registrationStatus === 'rejected') {
        return `❌ *הבקשה שלך נדחתה*\n\nסיבה: ${existingDriver.rejectionReason || 'לא צוינה סיבה'}\n\nאם אתה חושב שזו טעות, פנה למנהל.`;
      }
    }
    
    // Delete old session if exists
    await RegistrationSession.deleteOne({ phone });
    
    // Create new session
    const session = await RegistrationSession.create({
      phone,
      currentStep: 'awaiting_name',
      status: 'in_progress'
    });
    
    logger.info('Registration started', { phone });
    
    return REGISTRATION_STEPS.awaiting_name.question;
  }
  
  /**
   * Process current step
   */
  async processStep(session, message, mediaUrl) {
    const step = REGISTRATION_STEPS[session.currentStep];
    
    if (!step) {
      return '❌ שגיאת מערכת. אנא התחל רישום מחדש על ידי שליחת המילה "הרשמה".';
    }
    
    // Handle photo steps
    if (session.currentStep.includes('photo')) {
      if (!mediaUrl) {
        return '📸 אנא שלח תמונה של המסמך. אם אתה מתקשה, פנה למנהל.';
      }
      
      return await this.handlePhotoStep(session, mediaUrl);
    }
    
    // Handle text input steps
    return await this.handleTextStep(session, message, step);
  }
  
  /**
   * Handle text input step
   */
  async handleTextStep(session, message, step) {
    const value = message.trim();
    
    // Validate input
    if (step.validate && !step.validate(value)) {
      return '❌ הקלט לא תקין. אנא נסה שוב.';
    }
    
    // Save data
    const fieldMap = {
      awaiting_name: 'name',
      awaiting_id: 'idNumber',
      awaiting_car_type: 'carType',
      awaiting_car_number: 'carNumber',
      awaiting_work_area: 'workArea',
      awaiting_city: 'city'  // 🆕 שדה חדש!
    };
    
    const field = fieldMap[session.currentStep];
    if (field) {
      session.data[field] = value;
    }
    
    // Move to next step
    session.currentStep = step.next;
    await session.save();
    
    logger.info('Registration step completed', {
      phone: session.phone,
      completedStep: Object.keys(fieldMap).find(k => fieldMap[k] === field),
      nextStep: step.next
    });
    
    // If completed, finalize registration
    if (session.currentStep === 'completed') {
      return await this.finalizeRegistration(session);
    }
    
    // Return next question
    return REGISTRATION_STEPS[session.currentStep].question;
  }
  
  /**
   * Handle photo upload step
   */
  async handlePhotoStep(session, mediaUrl) {
    // Save photo URL
    const photoFieldMap = {
      awaiting_id_document_photo: 'idDocument',      // רישיון או ת.ז.
      awaiting_profile_photo: 'profilePhoto',        // תמונת פרופיל
      awaiting_car_photo: 'carPhoto'                 // תמונת רכב
    };
    
    const field = photoFieldMap[session.currentStep];
    if (field) {
      session.documents[field] = {
        url: mediaUrl,
        uploadedAt: new Date()
      };
    }
    
    const step = REGISTRATION_STEPS[session.currentStep];
    session.currentStep = step.next;
    await session.save();
    
    logger.info('Registration photo uploaded', {
      phone: session.phone,
      document: field
    });
    
    // If completed, finalize registration
    if (session.currentStep === 'completed') {
      return await this.finalizeRegistration(session);
    }
    
    // Return next question
    return REGISTRATION_STEPS[session.currentStep].question;
  }
  
  /**
   * Finalize registration
   */
  async finalizeRegistration(session) {
    try {
      // Generate driver ID
      const driverId = await Driver.generateDriverId();
      
      // Create driver
      const driver = await Driver.create({
        driverId,
        phone: session.phone,
        name: session.data.name,
        idNumber: session.data.idNumber,
        vehicleType: session.data.carType,
        vehicleNumber: session.data.carNumber,
        workArea: session.data.workArea,
        city: session.data.city,              // 🆕 עיר מגורים
        documents: session.documents,
        registrationStatus: 'pending',
        isActive: false
      });
      
      // Update session
      session.status = 'pending_approval';
      session.completedAt = new Date();
      await session.save();
      
      logger.success('Registration completed', {
        phone: session.phone,
        driverId,
        driverName: session.data.name
      });
      
      return `✅ *הרישום הושלם בהצלחה!*

🎉 תודה ${session.data.name}!

מזהה הנהג שלך: *${driverId}*

⏳ *הבקשה שלך נשלחה לאישור המנהל*

נעדכן אותך ברגע שהבקשה תאושר ותוכל להתחיל לעבוד!

📞 אם יש לך שאלות, פנה למנהל.`;
      
    } catch (err) {
      logger.error('Registration finalization error', {
        phone: session.phone,
        error: err.message
      });
      return '❌ אירעה שגיאה בשמירת הרישום. אנא פנה למנהל.';
    }
  }
  
  /**
   * Get registration status
   */
  async getStatus(phone) {
    const session = await RegistrationSession.findOne({ phone });
    const driver = await Driver.findOne({ phone });
    
    if (driver) {
      if (driver.registrationStatus === 'approved') {
        return `✅ *אתה רשום במערכת*\n\nמזהה: *${driver.driverId}*\nסטטוס: *פעיל*`;
      } else if (driver.registrationStatus === 'pending') {
        return '⏳ *הבקשה שלך בטיפול*\n\nהמנהל יאשר בקרוב!';
      } else if (driver.registrationStatus === 'rejected') {
        return `❌ *הבקשה נדחתה*\n\nסיבה: ${driver.rejectionReason}`;
      }
    }
    
    if (session && session.status === 'in_progress') {
      return `⏳ *הרישום בתהליך*\n\nשלב נוכחי: ${this.getStepName(session.currentStep)}`;
    }
    
    return '❌ לא נמצא רישום פעיל. שלח "הרשמה" כדי להתחיל.';
  }
  
  /**
   * Get step name in Hebrew
   */
  getStepName(step) {
    const names = {
      awaiting_name: 'שם מלא',
      awaiting_id: 'מספר תעודת זהות',
      awaiting_car_type: 'סוג רכב',
      awaiting_car_number: 'מספר רכב',
      awaiting_work_area: 'אזור עבודה',
      awaiting_license_photo: 'צילום רישיון נהיגה',
      awaiting_car_license_photo: 'צילום רישיון רכב',
      awaiting_insurance_photo: 'צילום ביטוח'
    };
    return names[step] || step;
  }
  
  /**
   * Cancel registration
   */
  async cancelRegistration(phone) {
    await RegistrationSession.deleteOne({ phone });
    logger.info('Registration cancelled', { phone });
    return '❌ *הרישום בוטל*\n\nאם תרצה להירשם שוב, שלח "הרשמה".';
  }
}

// ===============================================
// 📤 EXPORT
// ===============================================

const registrationHandler = new RegistrationHandler();

export default registrationHandler;
