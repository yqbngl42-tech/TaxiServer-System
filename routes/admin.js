// ============================================================
// ADMIN ROUTES
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
// 6 ENDPOINTS
// ============================================================

// GET /api/admin-contact
router.get("/", authenticateToken, async (req, res) => {
  try {
    // Get the first (and should be only) admin contact
    const contact = await AdminContact.findOne().lean();
    
    res.json({
      ok: true,
      contact: contact || null
    });
  } catch (err) {
    logger.error("Error getting admin contact", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});


// POST /api/admin-contact
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { adminName, adminPhone, adminEmail, appealMessage } = req.body;
    
    if (!adminName || !adminPhone) {
      return res.status(400).json({
        ok: false,
        error: "שדות חובה: שם וטלפון"
      });
    }
    
    const contact = await AdminContact.create({
      adminName: adminName.trim(),
      adminPhone: adminPhone.trim(),
      adminEmail: adminEmail || null,
      appealMessage: appealMessage || "⚠️ עברתי על התקנות - בקשה להסרת חסימה"
    });
    
    logger.success("Admin contact created", {
      requestId: req.id,
      contactId: contact._id
    });
    
    res.json({
      ok: true,
      contact
    });
  } catch (err) {
    logger.error("Error creating admin contact", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// PUT /api/admin-contact/:id
router.put("-contact/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { adminName, adminPhone, adminEmail, appealMessage, isActive } = req.body;
    
    const updateData = {};
    if (adminName !== undefined) updateData.adminName = adminName;
    if (adminPhone !== undefined) updateData.adminPhone = adminPhone;
    if (adminEmail !== undefined) updateData.adminEmail = adminEmail;
    if (appealMessage !== undefined) updateData.appealMessage = appealMessage;
    if (isActive !== undefined) updateData.isActive = isActive;
    updateData.updatedAt = Date.now();
    
    const contact = await AdminContact.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );
    
    if (!contact) {
      return res.status(404).json({
        ok: false,
        error: "איש קשר לא נמצא"
      });
    }
    
    res.json({
      ok: true,
      contact
    });
  } catch (err) {
    logger.error("Error updating admin contact", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// DELETE /api/admin-contact/:id
router.delete("-contact/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const contact = await AdminContact.findByIdAndDelete(id);
    
    if (!contact) {
      return res.status(404).json({
        ok: false,
        error: "איש קשר לא נמצא"
      });
    }
    
    res.json({
      ok: true,
      message: "איש קשר נמחק בהצלחה"
    });
  } catch (err) {
    logger.error("Error deleting admin contact", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// GET /api/admin/default-group
router.get("/default-group", authenticateToken, async (req, res) => {
  try {
    const defaultGroup = await WhatsAppGroup.findOne({ isDefault: true });
    
    res.json({
      ok: true,
      defaultGroup: defaultGroup || null
    });
  } catch (err) {
    logger.error("Error getting default group", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});


// POST /api/admin/default-group
router.post("/default-group", authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.body;
    
    if (!groupId) {
      return res.status(400).json({
        ok: false,
        error: "נדרש מזהה קבוצה"
      });
    }
    
    // Remove default from all groups
    await WhatsAppGroup.updateMany({}, { isDefault: false });
    
    // Set new default
    const group = await WhatsAppGroup.findByIdAndUpdate(
      groupId,
      { isDefault: true },
      { new: true }
    );
    
    if (!group) {
      return res.status(404).json({
        ok: false,
        error: "קבוצה לא נמצאה"
      });
    }
    
    logger.success("Default group updated", {
      requestId: req.id,
      groupId: group._id,
      groupName: group.name
    });
    
    res.json({
      ok: true,
      group
    });
  } catch (err) {
    logger.error("Error setting default group", {
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
