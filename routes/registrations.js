// ===============================================
// 🎓 REGISTRATIONS ROUTES - Production Ready
// ===============================================
// Merged from:
// - routes/registrations.js (253 lines, 4 endpoints + WhatsApp)
// - v2/registrations.js (87 lines, 3 endpoints)
// - v2/registrations-enhanced.js (340 lines, 10 endpoints)
// Result: 12 unique endpoints, RBAC, WhatsApp, validation
// ===============================================

import express from 'express';
import { Activity, AuditLog, Driver, RegistrationSession } from '../models/index.js';
import { authenticateToken } from '../middlewares/auth.js';
import { requirePermission } from '../middlewares/rbac.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ============================================================
// ERROR MESSAGES
// ============================================================

const ERRORS = {
  REGISTRATION: {
    NOT_FOUND: 'רישום לא נמצא',
    ALREADY_PROCESSED: 'הרישום כבר עובד',
    MISSING_REASON: 'נדרשת סיבת דחייה',
    INVALID_STATUS: 'סטטוס לא תקין'
  },
  DRIVER: {
    ALREADY_EXISTS: 'נהג עם מספר טלפון זה כבר קיים',
    CREATION_FAILED: 'יצירת נהג נכשלה'
  },
  DOCUMENT: {
    INVALID_TYPE: 'סוג מסמך לא תקין',
    NOT_FOUND: 'מסמך לא נמצא'
  },
  SERVER: {
    DATABASE: 'שגיאת מסד נתונים',
    UNKNOWN: 'שגיאת שרת'
  }
};

const REGISTRATION_STATUSES = ['pending', 'approved', 'rejected', 'stuck', 'expired'];
const DOCUMENT_TYPES = ['idDocument', 'profilePhoto', 'carPhoto', 'license', 'carLicense', 'insurance'];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Try to load RegistrationSession model (fallback to Driver if not available)
 */
async function getRegistrationModel() {
  try {
    const RegistrationSession = (await import('../models/RegistrationSession.js').catch(() => null))?.default;
    return RegistrationSession || null;
  } catch {
    return null;
  }
}

/**
 * Send WhatsApp notification (with fallback)
 */
async function sendWhatsAppNotification(phone, message) {
  try {
    // Try to load WhatsApp adapter
    const twilioAdapter = (await import('../services/twilio-adapter.js').catch(() => null))?.default;
    
    if (twilioAdapter && twilioAdapter.sendWhatsAppMessage) {
      await twilioAdapter.sendWhatsAppMessage(phone, message);
      return true;
    } else {
      logger.warn('WhatsApp adapter not available', { phone });
      return false;
    }
  } catch (err) {
    logger.error('Failed to send WhatsApp notification', {
      phone,
      error: err.message
    });
    return false;
  }
}

// ===============================================
// GET /api/registrations - קבלת רישומים
// ===============================================
router.get("/", authenticateToken, requirePermission('registrations:read'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const { status } = req.query;
    
    const RegistrationSession = await getRegistrationModel();
    
    let registrations, total;
    
    if (RegistrationSession) {
      // Use RegistrationSession model
      const filter = {};
      if (status) filter.status = status;
      
      [registrations, total] = await Promise.all([
        RegistrationSession.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        RegistrationSession.countDocuments(filter)
      ]);
    } else {
      // Fallback: use Driver model with registrationStatus
      const filter = { registrationStatus: { $exists: true } };
      if (status) {
        // Map registration status to driver status
        if (status === 'pending') filter.registrationStatus = 'pending';
        else if (status === 'approved') filter.registrationStatus = 'approved';
        else if (status === 'rejected') filter.registrationStatus = 'rejected';
      }
      
      [registrations, total] = await Promise.all([
        Driver.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Driver.countDocuments(filter)
      ]);
      
      logger.warn('Using Driver model fallback for registrations', {
        requestId: req.id || null
      });
    }
    
    res.json({
      ok: true,
      registrations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (err) {
    logger.error("Error fetching registrations", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// GET /api/registrations/pending - רישומים ממתינים
// ===============================================
router.get("/pending", authenticateToken, requirePermission('registrations:read'), async (req, res) => {
  try {
    const RegistrationSession = await getRegistrationModel();
    
    let drivers;
    
    if (RegistrationSession) {
      drivers = await RegistrationSession.find({ status: 'pending' })
        .sort({ createdAt: -1 });
    } else {
      // Fallback to Driver model
      drivers = await Driver.find({ registrationStatus: 'pending' })
        .sort({ createdAt: -1 });
    }
    
    logger.info("Fetched pending registrations", {
      requestId: req.id || null,
      count: drivers.length
    });
    
    res.json({
      ok: true,
      drivers,
      count: drivers.length
    });
  } catch (err) {
    logger.error("Error fetching pending registrations", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// GET /api/registrations/stuck - רישומים תקועים
// ===============================================
router.get("/stuck", authenticateToken, requirePermission('registrations:read'), async (req, res) => {
  try {
    const RegistrationSession = await getRegistrationModel();
    
    if (!RegistrationSession) {
      return res.json({
        ok: true,
        registrations: [],
        message: 'RegistrationSession model not available'
      });
    }
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const stuck = await RegistrationSession.find({
      status: 'pending',
      lastActivityAt: { $lt: oneDayAgo }
    }).sort({ lastActivityAt: 1 });
    
    res.json({
      ok: true,
      registrations: stuck,
      count: stuck.length
    });
  } catch (err) {
    logger.error("Error fetching stuck registrations", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// GET /api/registrations/statistics - סטטיסטיקות
// ===============================================
router.get("/statistics/conversion", authenticateToken, requirePermission('registrations:read'), async (req, res) => {
  try {
    const RegistrationSession = await getRegistrationModel();
    
    let stats;
    
    if (RegistrationSession) {
      const [total, approved, rejected, pending, stuck] = await Promise.all([
        RegistrationSession.countDocuments(),
        RegistrationSession.countDocuments({ status: 'approved' }),
        RegistrationSession.countDocuments({ status: 'rejected' }),
        RegistrationSession.countDocuments({ status: 'pending' }),
        RegistrationSession.countDocuments({ status: 'stuck' })
      ]);
      
      const conversionRate = total > 0 ? ((approved / total) * 100).toFixed(2) : 0;
      
      const avgTimeToComplete = await RegistrationSession.aggregate([
        { $match: { status: 'approved', 'conversionData.timeToComplete': { $exists: true } } },
        { $group: { _id: null, avg: { $avg: '$conversionData.timeToComplete' } } }
      ]);
      
      stats = {
        total,
        approved,
        rejected,
        pending,
        stuck,
        conversionRate: parseFloat(conversionRate),
        avgTimeToComplete: avgTimeToComplete[0]?.avg || 0
      };
    } else {
      // Fallback to Driver model
      const [total, approved, rejected, pending] = await Promise.all([
        Driver.countDocuments({ registrationStatus: { $exists: true } }),
        Driver.countDocuments({ registrationStatus: 'approved' }),
        Driver.countDocuments({ registrationStatus: 'rejected' }),
        Driver.countDocuments({ registrationStatus: 'pending' })
      ]);
      
      const conversionRate = total > 0 ? ((approved / total) * 100).toFixed(2) : 0;
      
      stats = {
        total,
        approved,
        rejected,
        pending,
        stuck: 0,
        conversionRate: parseFloat(conversionRate),
        avgTimeToComplete: 0
      };
    }
    
    res.json({
      ok: true,
      statistics: stats
    });
  } catch (err) {
    logger.error("Error fetching statistics", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// GET /api/registrations/:id - רישום בודד
// ===============================================
router.get("/:id", authenticateToken, requirePermission('registrations:read'), async (req, res) => {
  try {
    const RegistrationSession = await getRegistrationModel();
    
    let registration;
    
    if (RegistrationSession) {
      registration = await RegistrationSession.findById(req.params.id);
    } else {
      registration = await Driver.findById(req.params.id);
    }
    
    if (!registration) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.REGISTRATION.NOT_FOUND
      });
    }
    
    res.json({
      ok: true,
      registration
    });
  } catch (err) {
    logger.error("Error fetching registration", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// GET /api/registrations/session/:phone - סשן לפי טלפון
// ===============================================
router.get("/session/:phone", authenticateToken, requirePermission('registrations:read'), async (req, res) => {
  try {
    const { phone } = req.params;
    
    const RegistrationSession = await getRegistrationModel();
    
    let session = null;
    let driver = null;
    
    if (RegistrationSession) {
      session = await RegistrationSession.findOne({ phone });
    }
    
    driver = await Driver.findOne({ phone });
    
    res.json({
      ok: true,
      session,
      driver
    });
  } catch (err) {
    logger.error("Error fetching registration session", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// GET /api/registrations/:id/attempts - ניסיונות
// ===============================================
router.get("/:id/attempts", authenticateToken, requirePermission('registrations:read'), async (req, res) => {
  try {
    const RegistrationSession = await getRegistrationModel();
    
    if (!RegistrationSession) {
      return res.json({
        ok: true,
        attempts: [],
        message: 'RegistrationSession model not available'
      });
    }
    
    const registration = await RegistrationSession.findById(req.params.id).select('attempts');
    
    if (!registration) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.REGISTRATION.NOT_FOUND
      });
    }
    
    res.json({
      ok: true,
      attempts: [...(registration.attempts || [])].reverse()  // ✅ Non-mutating
    });
  } catch (err) {
    logger.error("Error fetching attempts", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// POST /api/registrations/:id/approve - אישור רישום
// ===============================================
router.post("/:id/approve", authenticateToken, requirePermission('registrations:approve'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if driver already exists
    const existingDriver = await Driver.findById(id);
    
    if (existingDriver) {
      // Driver already exists (from RegistrationSession → Driver conversion or direct registration)
      if (existingDriver.registrationStatus === 'approved') {
        return res.status(400).json({
          ok: false,
          error: ERRORS.REGISTRATION.ALREADY_PROCESSED
        });
      }
      
      // Approve driver
      existingDriver.registrationStatus = 'approved';
      existingDriver.isActive = true;
      existingDriver.approvedBy = req.user.username || req.user.user;
      existingDriver.approvedAt = new Date();
      await existingDriver.save();
      
      const driver = existingDriver;
      
      logger.success("Driver registration approved", {
        requestId: req.id || null,
        driverId: driver._id,
        driverIdNumber: driver.driverId,
        driverName: driver.name,
        approvedBy: req.user.username || req.user.user
      });
      
      // Log to Activity
      await Activity.create({
        timestamp: new Date(),
        type: 'system',
        user: req.user.username || req.user.user,
        message: `נהג ${driver.name} (${driver.driverId || driver.phone}) אושר`,
        details: { driverId: driver._id, driverIdNumber: driver.driverId },  // ✅ Object, not string
        emoji: '✅'
      }).catch(err => logger.error('Activity error:', err));
      
      // Audit log
      await AuditLog.create({
        userId: req.user.userId || req.user.user,
        username: req.user.username || req.user.user,
        action: 'registration_approved',
        details: { 
          driverId: driver._id,
          driverName: driver.name,
          phone: driver.phone
        }
      }).catch(err => logger.error('AuditLog error:', err));
      
      // Send WhatsApp notification
      const message = `🎉 *מזל טוב ${driver.name}!*

הרישום שלך *אושר*! ✅

🆔 מזהה הנהג שלך: *${driver.driverId || 'ממתין להקצאה'}*

אתה יכול להתחיל לקבל נסיעות עכשיו!

ברוכים הבאים למשפחת נהגי דרך צדיקים! 🚖`;
      
      const sent = await sendWhatsAppNotification(driver.phone, message);
      
      if (sent) {
        logger.success('Approval notification sent', {
          driverId: driver.driverId,
          phone: driver.phone
        });
      }
      
      return res.json({
        ok: true,
        message: "נהג אושר בהצלחה",
        driver
      });
    }
    
    // Check if RegistrationSession exists
    const RegistrationSession = await getRegistrationModel();
    
    if (!RegistrationSession) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.REGISTRATION.NOT_FOUND
      });
    }
    
    const registration = await RegistrationSession.findById(id);
    
    if (!registration) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.REGISTRATION.NOT_FOUND
      });
    }
    
    if (registration.status !== 'pending') {
      return res.status(400).json({
        ok: false,
        error: ERRORS.REGISTRATION.ALREADY_PROCESSED
      });
    }
    
    // 🔴 CRITICAL: Check if driver with this phone already exists
    const existingDriverByPhone = await Driver.findOne({ phone: registration.phone });
    
    if (existingDriverByPhone) {
      logger.warn('Driver with phone already exists', {
        phone: registration.phone,
        existingDriverId: existingDriverByPhone._id
      });
      
      return res.status(400).json({
        ok: false,
        error: 'נהג עם מספר טלפון זה כבר קיים במערכת',
        existingDriver: {
          id: existingDriverByPhone._id,
          name: existingDriverByPhone.name,
          status: existingDriverByPhone.registrationStatus
        }
      });
    }
    
    // Create driver from registration
    const driver = await Driver.create({
      name: registration.name,
      phone: registration.phone,
      idNumber: registration.idNumber,
      address: registration.address,
      registrationStatus: 'approved',
      isActive: true,
      approvedBy: req.user.username || req.user.user,
      approvedAt: new Date(),
      source: 'registration'
    });
    
    // Update registration
    registration.status = 'approved';
    registration.approvedAt = new Date();
    registration.approvedBy = req.user.username || req.user.user;
    await registration.save();
    
    logger.success("Registration approved and driver created", {
      requestId: req.id || null,
      registrationId: registration._id,
      driverId: driver._id
    });
    
    // Audit log
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'registration_approved',
      details: { 
        registrationId: registration._id,
        driverId: driver._id,
        driverName: driver.name
      }
    }).catch(err => logger.error('AuditLog error:', err));
    
    // Send WhatsApp notification
    const message = `🎉 *מזל טוב ${driver.name}!*

הרישום שלך *אושר*! ✅

ברוכים הבאים למשפחת נהגי דרך צדיקים! 🚖`;
    
    await sendWhatsAppNotification(driver.phone, message);
    
    res.json({
      ok: true,
      message: "נהג אושר בהצלחה",
      driver
    });
  } catch (err) {
    logger.error("Error approving registration", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// POST /api/registrations/:id/reject - דחיית רישום
// ===============================================
router.post("/:id/reject", authenticateToken, requirePermission('registrations:reject'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.REGISTRATION.MISSING_REASON
      });
    }
    
    // Check if driver already exists
    const existingDriver = await Driver.findById(id);
    
    if (existingDriver) {
      if (existingDriver.registrationStatus === 'rejected') {
        return res.status(400).json({
          ok: false,
          error: ERRORS.REGISTRATION.ALREADY_PROCESSED
        });
      }
      
      // Reject driver
      existingDriver.registrationStatus = 'rejected';
      existingDriver.rejectionReason = reason;
      existingDriver.isActive = false;
      await existingDriver.save();
      
      const driver = existingDriver;
      
      logger.success("Driver registration rejected", {
        requestId: req.id || null,
        driverId: driver._id,
        driverName: driver.name,
        reason
      });
      
      // Log to Activity
      await Activity.create({
        timestamp: new Date(),
        type: 'system',
        user: req.user.username || req.user.user,
        message: `נהג ${driver.name} נדחה: ${reason}`,
        details: { driverId: driver._id, reason },  // ✅ Object, not string
        emoji: '❌'
      }).catch(err => logger.error('Activity error:', err));
      
      // Audit log
      await AuditLog.create({
        userId: req.user.userId || req.user.user,
        username: req.user.username || req.user.user,
        action: 'registration_rejected',
        details: { 
          driverId: driver._id,
          driverName: driver.name,
          reason
        }
      }).catch(err => logger.error('AuditLog error:', err));
      
      // Send WhatsApp notification
      const message = `❌ *הרישום נדחה*

${driver.name}, מצטערים אך הבקשה שלך להצטרף למערכת נדחתה.

*סיבה:*
${reason}

אם אתה חושב שזו טעות, אנא פנה למנהל.`;
      
      await sendWhatsAppNotification(driver.phone, message);
      
      return res.json({
        ok: true,
        message: "נהג נדחה",
        driver
      });
    }
    
    // Check RegistrationSession
    const RegistrationSession = await getRegistrationModel();
    
    if (!RegistrationSession) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.REGISTRATION.NOT_FOUND
      });
    }
    
    const registration = await RegistrationSession.findById(id);
    
    if (!registration) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.REGISTRATION.NOT_FOUND
      });
    }
    
    if (registration.status !== 'pending') {
      return res.status(400).json({
        ok: false,
        error: ERRORS.REGISTRATION.ALREADY_PROCESSED
      });
    }
    
    // Reject registration
    registration.status = 'rejected';
    registration.rejectionReason = reason;
    registration.rejectedAt = new Date();
    registration.rejectedBy = req.user.username || req.user.user;
    await registration.save();
    
    logger.success("Registration rejected", {
      requestId: req.id || null,
      registrationId: registration._id,
      reason
    });
    
    // Audit log
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'registration_rejected',
      details: { 
        registrationId: registration._id,
        reason
      }
    }).catch(err => logger.error('AuditLog error:', err));
    
    // Send WhatsApp notification
    const message = `❌ *הרישום נדחה*

${registration.name}, מצטערים אך הבקשה שלך להצטרף למערכת נדחתה.

*סיבה:*
${reason}

אם אתה חושב שזו טעות, אנא פנה למנהל.`;
    
    await sendWhatsAppNotification(registration.phone, message);
    
    res.json({
      ok: true,
      message: "רישום נדחה"
    });
  } catch (err) {
    logger.error("Error rejecting registration", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// POST /api/registrations/:id/resend-code - שליחת קוד מחדש
// ===============================================
router.post("/:id/resend-code", authenticateToken, requirePermission('registrations:approve'), async (req, res) => {
  try {
    const RegistrationSession = await getRegistrationModel();
    
    if (!RegistrationSession) {
      return res.status(501).json({
        ok: false,
        error: 'RegistrationSession model not available'
      });
    }
    
    const registration = await RegistrationSession.findById(req.params.id);
    
    if (!registration) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.REGISTRATION.NOT_FOUND
      });
    }
    
    // Generate new code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    registration.verificationCode = code;
    registration.verificationCodeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    registration.updatedAt = new Date();
    
    if (!Array.isArray(registration.attempts)) {
      registration.attempts = [];
    }
    
    registration.attempts.push({
      type: 'phone_verification',
      status: 'success',
      details: { action: 'code_resent' },
      timestamp: new Date()
    });
    
    await registration.save();
    
    // Send code via WhatsApp
    const message = `🔐 קוד אימות חדש: *${code}*

הקוד תקף ל-15 דקות.`;
    
    await sendWhatsAppNotification(registration.phone, message);
    
    logger.success("Verification code resent", {
      requestId: req.id || null,
      registrationId: registration._id
    });
    
    res.json({
      ok: true,
      sent: true
    });
  } catch (err) {
    logger.error("Error resending code", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// DELETE /api/registrations/:id/clear-session - ניקוי סשן
// ===============================================
router.delete("/:id/clear-session", authenticateToken, requirePermission('registrations:approve'), async (req, res) => {
  try {
    const RegistrationSession = await getRegistrationModel();
    
    if (!RegistrationSession) {
      return res.status(501).json({
        ok: false,
        error: 'RegistrationSession model not available'
      });
    }
    
    const registration = await RegistrationSession.findById(req.params.id);
    
    if (!registration) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.REGISTRATION.NOT_FOUND
      });
    }
    
    registration.sessionData = null;
    registration.verificationCode = null;
    registration.verificationCodeExpires = null;
    registration.verificationAttempts = 0;
    registration.updatedAt = new Date();
    
    await registration.save();
    
    logger.success("Session cleared", {
      requestId: req.id || null,
      registrationId: registration._id
    });
    
    res.json({
      ok: true,
      message: 'סשן נוקה בהצלחה'
    });
  } catch (err) {
    logger.error("Error clearing session", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// POST /api/registrations/:id/verify-document - אימות מסמך
// ===============================================
router.post("/:id/verify-document", authenticateToken, requirePermission('registrations:approve'), async (req, res) => {
  try {
    const { docType } = req.body;
    
    if (!DOCUMENT_TYPES.includes(docType)) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.DOCUMENT.INVALID_TYPE,
        validTypes: DOCUMENT_TYPES
      });
    }
    
    const RegistrationSession = await getRegistrationModel();
    
    if (!RegistrationSession) {
      return res.status(501).json({
        ok: false,
        error: 'RegistrationSession model not available'
      });
    }
    
    const registration = await RegistrationSession.findById(req.params.id);
    
    if (!registration) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.REGISTRATION.NOT_FOUND
      });
    }
    
    if (!registration.documentsStatus) {
      registration.documentsStatus = {};
    }
    
    if (!registration.documentsStatus[docType]) {
      registration.documentsStatus[docType] = {};
    }
    
    registration.documentsStatus[docType].verified = true;
    registration.documentsStatus[docType].verifiedAt = new Date();
    registration.documentsStatus[docType].verifiedBy = req.user.username || req.user.user;
    registration.updatedAt = new Date();
    
    await registration.save();
    
    logger.success("Document verified", {
      requestId: req.id || null,
      registrationId: registration._id,
      docType
    });
    
    res.json({
      ok: true,
      documentsStatus: registration.documentsStatus
    });
  } catch (err) {
    logger.error("Error verifying document", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// POST /api/registrations/:id/alert - שליחת התראה
// ===============================================
router.post("/:id/alert", authenticateToken, requirePermission('registrations:approve'), async (req, res) => {
  try {
    const { message: customMessage } = req.body;
    
    const RegistrationSession = await getRegistrationModel();
    
    if (!RegistrationSession) {
      return res.status(501).json({
        ok: false,
        error: 'RegistrationSession model not available'
      });
    }
    
    const registration = await RegistrationSession.findById(req.params.id);
    
    if (!registration) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.REGISTRATION.NOT_FOUND
      });
    }
    
    const message = customMessage || `⚠️ *תזכורת מערכת*

${registration.name}, זו תזכורת להשלים את תהליך הרישום.

נשמח לראותך כחלק מהצוות! 🚖`;
    
    const sent = await sendWhatsAppNotification(registration.phone, message);
    
    logger.success("Alert sent", {
      requestId: req.id || null,
      registrationId: registration._id
    });
    
    res.json({
      ok: true,
      sent
    });
  } catch (err) {
    logger.error("Error sending alert", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

console.log('✅ Registrations routes loaded - 12 endpoints');

export default router;