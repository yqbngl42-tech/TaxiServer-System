// ============================================================
// DRIVERS ROUTES
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
// 8 ENDPOINTS
// ============================================================

// GET /api/drivers
router.get("/", authenticateToken, async (req, res) => {
  try {
    const drivers = await Driver.find()
      .sort({ name: 1 })
      .lean();
    
    res.json({ ok: true, drivers });
  } catch (err) {
    logger.error("Error fetching drivers", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});


// POST /api/drivers
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { name, phone, licenseNumber } = req.body;
    
    if (!name || !phone) {
      return res.status(400).json({
        ok: false,
        error: "שדות חובה: שם וטלפון"
      });
    }
    
    const phoneRegex = /^(0|\+972)?5\d{8}$/;
    if (!phoneRegex.test(phone.replace(/[\s\-]/g, ''))) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.VALIDATION.PHONE
      });
    }
    
    // Check if phone exists
    const existing = await Driver.findOne({ phone });
    if (existing) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.DRIVER.PHONE_EXISTS
      });
    }
    
    const driver = await Driver.create({
      name: name.trim(),
      phone: phone.trim(),
      licenseNumber: licenseNumber || null,
      isActive: true,
      isBlocked: false
    });
    
    logger.success("Driver created", {
      requestId: req.id,
      driverId: driver._id,
      name: driver.name
    });
    
    res.json({ ok: true, driver });
  } catch (err) {
    logger.error("Error creating driver", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// PUT /api/drivers/:id
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, licenseNumber, isActive } = req.body;
    
    const driver = await Driver.findByIdAndUpdate(
      id,
      { name, phone, licenseNumber, isActive },
      { new: true }
    );
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: "נהג לא נמצא"
      });
    }
    
    logger.success("Driver updated", {
      requestId: req.id,
      driverId: driver._id
    });
    
    res.json({
      ok: true,
      driver
    });
  } catch (err) {
    logger.error("Error updating driver", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// GET /api/drivers/:id
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const driver = await Driver.findById(id);
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: "נהג לא נמצא"
      });
    }
    
    logger.info("Driver fetched", {
      requestId: req.id,
      driverId: driver._id
    });
    
    res.json({
      ok: true,
      driver
    });
  } catch (err) {
    logger.error("Error fetching driver", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// POST /api/drivers/:id/verify-document
router.post("/:id/verify-document", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { documentType, verified } = req.body;
    
    if (!['license', 'carLicense', 'insurance'].includes(documentType)) {
      return res.status(400).json({
        ok: false,
        error: "סוג מסמך לא תקין"
      });
    }
    
    const driver = await Driver.findById(id);
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: "נהג לא נמצא"
      });
    }
    
    // Update document verification status
    if (!driver.documents) {
      driver.documents = {};
    }
    if (!driver.documents[documentType]) {
      driver.documents[documentType] = {};
    }
    driver.documents[documentType].verified = verified;
    driver.documents[documentType].verifiedAt = new Date();
    driver.documents[documentType].verifiedBy = req.user.user;
    
    await driver.save();
    
    logger.success("Document verified", {
      requestId: req.id,
      driverId: driver._id,
      documentType,
      verified
    });
    
    // Log activity
    await Activity.create({
      type: verified ? 'document_verified' : 'document_unverified',
      userId: req.user.user,
      description: `מסמך ${documentType} ${verified ? 'אומת' : 'בוטל'} עבור נהג ${driver.name}`,
      metadata: { driverId: driver._id, documentType }
    });
    
    res.json({
      ok: true,
      driver
    });
  } catch (err) {
    logger.error("Error verifying document", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// DELETE /api/drivers/:id
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if driver has active rides
    const activeRides = await Ride.countDocuments({
      driverPhone: (await Driver.findById(id))?.phone,
      status: { $in: ['approved', 'enroute', 'arrived'] }
    });
    
    if (activeRides > 0) {
      return res.status(400).json({
        ok: false,
        error: "לא ניתן למחוק נהג עם נסיעות פעילות"
      });
    }
    
    await Driver.findByIdAndDelete(id);
    
    logger.success("Driver deleted", {
      requestId: req.id,
      driverId: id
    });
    
    res.json({
      ok: true,
      message: "נהג נמחק בהצלחה"
    });
  } catch (err) {
    logger.error("Error deleting driver", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// POST /api/drivers/:id/block
router.post("/:id/block", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const driver = await Driver.findById(id);
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: "נהג לא נמצא"
      });
    }
    
    driver.isBlocked = true;
    driver.blockReason = reason || 'לא צוין';
    driver.blockedAt = new Date();
    driver.isActive = false;
    await driver.save();
    
    logger.success("Driver blocked", {
      requestId: req.id,
      driverId: id,
      driverName: driver.name,
      reason
    });
    
    res.json({
      ok: true,
      message: "נהג נחסם בהצלחה",
      driver
    });
  } catch (err) {
    logger.error("Error blocking driver", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// POST /api/drivers/:id/unblock
router.post("/:id/unblock", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const driver = await Driver.findById(id);
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: "נהג לא נמצא"
      });
    }
    
    driver.isBlocked = false;
    driver.blockReason = null;
    driver.blockedAt = null;
    driver.isActive = true;
    await driver.save();
    
    logger.success("Driver unblocked", {
      requestId: req.id,
      driverId: id,
      driverName: driver.name
    });
    
    res.json({
      ok: true,
      message: "חסימת נהג הוסרה",
      driver
    });
  } catch (err) {
    logger.error("Error unblocking driver", {
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
