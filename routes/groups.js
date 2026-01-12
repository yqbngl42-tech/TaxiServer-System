// ============================================================
// GROUPS ROUTES - FIXED
// ============================================================

import express from 'express';
import WhatsAppGroup from '../models/WhatsAppGroup.js';
import { authenticateToken } from '../middlewares/auth.js';
import { requirePermission } from '../middlewares/rbac.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Error messages
const ERRORS = {
  SERVER: {
    DATABASE: 'שגיאת מסד נתונים',
    UNKNOWN: 'שגיאת שרת'
  },
  GROUP: {
    NAME_EXISTS: 'שם הקבוצה כבר קיים',
    NOT_FOUND: 'קבוצה לא נמצאה'
  }
};

// ============================================================
// 6 ENDPOINTS
// ============================================================

// GET /api/client/groups
router.get("/api/client/groups", async (req, res) => {
  try {
    const groups = await WhatsAppGroup.find({ isActive: true })
      .select('name _id')
      .lean();
    
    res.json({ ok: true, groups });
  } catch (err) {
    logger.error("Error getting groups", { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({ 
      ok: false, 
      error: ERRORS.SERVER.DATABASE 
    });
  }
});


// GET /api/groups
router.get("/", authenticateToken, async (req, res) => {
  try {
    const groups = await WhatsAppGroup.find()
      .sort({ name: 1 })
      .lean();
    
    res.json({ ok: true, groups });
  } catch (err) {
    logger.error("Error fetching groups", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});


// POST /api/groups
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { name, phoneNumbers, isDefault } = req.body;
    
    if (!name || !phoneNumbers || !Array.isArray(phoneNumbers)) {
      return res.status(400).json({
        ok: false,
        error: "שדות חובה: שם ומספרי טלפון"
      });
    }
    
    // Check if name exists
    const existing = await WhatsAppGroup.findOne({ name });
    if (existing) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.GROUP.NAME_EXISTS
      });
    }
    
    // If this should be default, unset other defaults
    if (isDefault) {
      await WhatsAppGroup.updateMany({}, { isDefault: false });
    }
    
    const group = await WhatsAppGroup.create({
      name: name.trim(),
      phoneNumbers,
      isDefault: !!isDefault,
      isActive: true
    });
    
    logger.info("Group created", {
      requestId: req.id,
      groupId: group._id,
      name: group.name
    });
    
    res.json({ ok: true, group });
  } catch (err) {
    logger.error("Error creating group", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// PUT /api/groups/:id
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phoneNumbers, isDefault, isActive } = req.body;
    
    // If setting as default, unset others
    if (isDefault) {
      await WhatsAppGroup.updateMany(
        { _id: { $ne: id } },
        { isDefault: false }
      );
    }
    
    const group = await WhatsAppGroup.findByIdAndUpdate(
      id,
      { name, phoneNumbers, isDefault, isActive },
      { new: true }
    );
    
    if (!group) {
      return res.status(404).json({
        ok: false,
        error: "קבוצה לא נמצאה"
      });
    }
    
    logger.info("Group updated", {
      requestId: req.id,
      groupId: group._id
    });
    
    res.json({
      ok: true,
      group
    });
  } catch (err) {
    logger.error("Error updating group", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// DELETE /api/groups/:id
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const group = await WhatsAppGroup.findById(id);
    
    if (!group) {
      return res.status(404).json({
        ok: false,
        error: "קבוצה לא נמצאה"
      });
    }
    
    if (group.isDefault) {
      return res.status(400).json({
        ok: false,
        error: "לא ניתן למחוק את קבוצת ברירת המחדל"
      });
    }
    
    await WhatsAppGroup.findByIdAndDelete(id);
    
    logger.info("Group deleted", {
      requestId: req.id,
      groupId: id
    });
    
    res.json({
      ok: true,
      message: "קבוצה נמחקה בהצלחה"
    });
  } catch (err) {
    logger.error("Error deleting group", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// GET /api/bot/groups
router.get("/api/bot/groups", async (req, res) => {
  try {
    const groups = await WhatsAppGroup.find({ isActive: true })
      .select('name groupId isActive createdAt')
      .lean();
    
    logger.info('Bot requested groups', { count: groups.length });
    
    res.json({
      ok: true,
      groups
    });
  } catch (err) {
    logger.error('Error fetching groups for bot', { error: err.message });
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch groups'
    });
  }
});


export default router;