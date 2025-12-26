// ============================================================
// REGISTRATIONS ROUTES
// Auto-generated from server.js refactoring
// ============================================================

import express from 'express';

// Import what you need (adjust based on actual usage)
// import Ride from '../models/Ride.js';
// import Driver from '../models/Driver.js';
// import { authenticateToken } from '../middlewares/auth.js';
// import logger from '../utils/logger.js';

const router = express.Router();

// ============================================================
// 4 ENDPOINTS
// ============================================================

// GET /api/registrations/pending
router.get("/pending", authenticateToken, async (req, res) => {
  try {
    const drivers = await Driver.find({ 
      registrationStatus: 'pending'
    }).sort({ createdAt: -1 });
    
    logger.info("Fetched pending registrations", {
      requestId: req.id,
      count: drivers.length
    });
    
    res.json({
      ok: true,
      drivers,
      count: drivers.length
    });
  } catch (err) {
    logger.error("Error fetching pending registrations", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// POST /api/registrations/:id/approve
router.post("/:id/approve", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const driver = await Driver.findById(id);
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: "נהג לא נמצא"
      });
    }
    
    if (driver.registrationStatus !== 'pending') {
      return res.status(400).json({
        ok: false,
        error: "הנהג כבר אושר או נדחה"
      });
    }
    
    // Approve driver
    driver.registrationStatus = 'approved';
    driver.isActive = true;
    driver.approvedBy = req.user.user;
    driver.approvedAt = new Date();
    await driver.save();
    
    logger.success("Driver registration approved", {
      requestId: req.id,
      driverId: driver._id,
      driverIdNumber: driver.driverId,
      driverName: driver.name,
      approvedBy: req.user.user
    });
    
    // Log activity
    await Activity.create({
      type: 'driver_approved',
      userId: req.user.user,
      description: `נהג ${driver.name} (${driver.driverId}) אושר`,
      metadata: { driverId: driver._id, driverIdNumber: driver.driverId }
    });
    
    // Send WhatsApp notification
    try {
      const message = `🎉 *מזל טוב ${driver.name}!*

הרישום שלך *אושר*! ✅

🆔 מזהה הנהג שלך: *${driver.driverId}*

אתה יכול להתחיל לקבל נסיעות עכשיו!

ברוכים הבאים למשפחת נהגי דרך צדיקים! 🚖`;
      
      await twilioAdapter.sendWhatsAppMessage(driver.phone, message);
      
      logger.success('Approval notification sent', {
        driverId: driver.driverId,
        phone: driver.phone
      });
    } catch (notifErr) {
      logger.error('Failed to send approval notification', {
        error: notifErr.message,
        driverId: driver.driverId
      });
    }
    
    res.json({
      ok: true,
      message: "נהג אושר בהצלחה",
      driver
    });
  } catch (err) {
    logger.error("Error approving driver", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// POST /api/registrations/:id/reject
router.post("/:id/reject", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({
        ok: false,
        error: "נדרשת סיבת דחייה"
      });
    }
    
    const driver = await Driver.findById(id);
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: "נהג לא נמצא"
      });
    }
    
    if (driver.registrationStatus !== 'pending') {
      return res.status(400).json({
        ok: false,
        error: "הנהג כבר אושר או נדחה"
      });
    }
    
    // Reject driver
    driver.registrationStatus = 'rejected';
    driver.rejectionReason = reason;
    driver.isActive = false;
    await driver.save();
    
    logger.success("Driver registration rejected", {
      requestId: req.id,
      driverId: driver._id,
      driverName: driver.name,
      reason
    });
    
    // Log activity
    await Activity.create({
      type: 'driver_rejected',
      userId: req.user.user,
      description: `נהג ${driver.name} נדחה: ${reason}`,
      metadata: { driverId: driver._id, reason }
    });
    
    // Send WhatsApp notification
    try {
      const message = `❌ *הרישום נדחה*

${driver.name}, מצטערים אך הבקשה שלך להצטרף למערכת נדחתה.

*סיבה:*
${reason}

אם אתה חושב שזו טעות, אנא פנה למנהל.`;
      
      await twilioAdapter.sendWhatsAppMessage(driver.phone, message);
      
      logger.success('Rejection notification sent', {
        phone: driver.phone
      });
    } catch (notifErr) {
      logger.error('Failed to send rejection notification', {
        error: notifErr.message
      });
    }
    
    res.json({
      ok: true,
      message: "נהג נדחה",
      driver
    });
  } catch (err) {
    logger.error("Error rejecting driver", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// GET /api/registrations/session/:phone
router.get("/session/:phone", authenticateToken, async (req, res) => {
  try {
    const { phone } = req.params;
    
    const session = await RegistrationSession.findOne({ phone });
    const driver = await Driver.findOne({ phone });
    
    res.json({
      ok: true,
      session,
      driver
    });
  } catch (err) {
    logger.error("Error fetching registration session", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


export default router;
