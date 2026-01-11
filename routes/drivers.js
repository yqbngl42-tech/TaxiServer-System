// ============================================================
// DRIVERS ROUTES - ENHANCED VERSION
// Merged from routes/drivers.js + v2/drivers.js + v2/drivers-enhanced.js
// ============================================================

import express from 'express';
import { authenticateToken } from '../middlewares/auth.js';
import { requirePermission } from '../middlewares/rbac.js';
import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import AuditLog from '../models/AuditLog.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Error messages
const ERRORS = {
  DRIVER: {
    NOT_FOUND: 'נהג לא נמצא',
    PHONE_EXISTS: 'מספר טלפון זה כבר קיים במערכת',
    HAS_ACTIVE_RIDES: 'לא ניתן למחוק נהג עם נסיעות פעילות',
    MISSING_FIELDS: 'שדות חובה: שם וטלפון',
    INVALID_DOCUMENT_TYPE: 'סוג מסמך לא תקין',
    DOCUMENT_NOT_FOUND: 'מסמך לא נמצא',
    INVALID_RATING: 'דירוג חייב להיות בין 1 ל-5'
  },
  VALIDATION: {
    PHONE: 'מספר טלפון לא תקין'
  },
  SERVER: {
    DATABASE: 'שגיאת בסיס נתונים',
    UNKNOWN: 'שגיאה לא צפויה'
  }
};

// ============================================================
// LIST & SEARCH
// ============================================================

// ===============================================
// GET /api/drivers - רשימת נהגים + חיפוש + pagination
// ===============================================
router.get("/", authenticateToken, requirePermission('drivers:read'), async (req, res) => {
  try {
    // Pagination
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    
    // Filters
    const filter = {};
    if (req.query.status === 'active') filter.isActive = true;
    if (req.query.status === 'blocked') filter.isBlocked = true;
    if (req.query.status === 'inactive') filter.isActive = false;
    
    // Search
    if (req.query.q) {
      filter.$or = [
        { name: { $regex: req.query.q, $options: 'i' } },
        { phone: { $regex: req.query.q, $options: 'i' } },
        { driverId: { $regex: req.query.q, $options: 'i' } }
      ];
    }
    
    // Execute queries in parallel
    const [drivers, total] = await Promise.all([
      Driver.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean(),
      Driver.countDocuments(filter)
    ]);
    
    logger.info('Drivers list fetched', {
      requestId: req.id || null,
      count: drivers.length,
      total,
      page,
      filters: req.query
    });
    
    res.json({ 
      ok: true, 
      drivers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    logger.error("Error fetching drivers", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});

// ============================================================
// CRUD OPERATIONS
// ============================================================

// ===============================================
// POST /api/drivers - יצירת נהג חדש
// ===============================================
router.post("/", authenticateToken, requirePermission('drivers:create'), async (req, res) => {
  try {
    const { name, phone, licenseNumber, commissionPercent, idNumber, address } = req.body;
    
    // Validation
    if (!name || !phone) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.DRIVER.MISSING_FIELDS
      });
    }
    
    // Phone validation
    const phoneRegex = /^(0|\+972)?5\d{8}$/;
    if (!phoneRegex.test(phone.replace(/[\s\-]/g, ''))) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.VALIDATION.PHONE
      });
    }
    
    // Check if phone exists
    const existing = await Driver.findOne({ phone: phone.trim() });
    if (existing) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.DRIVER.PHONE_EXISTS
      });
    }
    
    // Create driver
    const driver = await Driver.create({
      name: name.trim(),
      phone: phone.trim(),
      licenseNumber: licenseNumber || null,
      commissionPercent: commissionPercent || 10,
      idNumber: idNumber || null,
      address: address || null,
      isActive: true,
      isBlocked: false,
      totalRides: 0
    });
    
    // Log activity
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'driver_created',
      details: { driverId: driver._id, name: driver.name }
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success("Driver created", {
      requestId: req.id || null,
      driverId: driver._id,
      name: driver.name
    });
    
    res.json({ ok: true, driver });
  } catch (err) {
    logger.error("Error creating driver", {
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
// GET /api/drivers/:id - פרטי נהג
// ===============================================
router.get("/:id", authenticateToken, requirePermission('drivers:read'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const driver = await Driver.findById(id);
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.DRIVER.NOT_FOUND
      });
    }
    
    logger.info("Driver fetched", {
      requestId: req.id || null,
      driverId: driver._id
    });
    
    res.json({
      ok: true,
      driver
    });
  } catch (err) {
    logger.error("Error fetching driver", {
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
// PUT /api/drivers/:id - עדכון נהג
// ===============================================
router.put("/:id", authenticateToken, requirePermission('drivers:update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, licenseNumber, isActive, commissionPercent, idNumber, address } = req.body;
    
    const driver = await Driver.findById(id);
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.DRIVER.NOT_FOUND
      });
    }
    
    // ✅ FIX #3: Phone validation + uniqueness check if phone is changing
    if (phone && phone !== driver.phone) {
      const phoneRegex = /^(0|\+972)?5\d{8}$/;
      if (!phoneRegex.test(phone.replace(/[\s\-]/g, ''))) {
        return res.status(400).json({
          ok: false,
          error: ERRORS.VALIDATION.PHONE
        });
      }
      
      // Check uniqueness (exclude current driver)
      const existing = await Driver.findOne({ 
        phone: phone.trim(),
        _id: { $ne: id }
      });
      
      if (existing) {
        return res.status(400).json({
          ok: false,
          error: ERRORS.DRIVER.PHONE_EXISTS
        });
      }
    }
    
    // Build update object
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (phone !== undefined) updates.phone = phone.trim();
    if (licenseNumber !== undefined) updates.licenseNumber = licenseNumber;
    if (isActive !== undefined) updates.isActive = isActive;
    if (commissionPercent !== undefined) updates.commissionPercent = commissionPercent;
    if (idNumber !== undefined) updates.idNumber = idNumber;
    if (address !== undefined) updates.address = address;
    
    const updatedDriver = await Driver.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    
    // Log activity
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'driver_updated',
      details: { driverId: id, updates: Object.keys(updates) }
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success("Driver updated", {
      requestId: req.id || null,
      driverId: id,
      updatedFields: Object.keys(updates)
    });
    
    res.json({
      ok: true,
      driver: updatedDriver
    });
  } catch (err) {
    logger.error("Error updating driver", {
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
// DELETE /api/drivers/:id - מחיקת נהג
// ===============================================
router.delete("/:id", authenticateToken, requirePermission('drivers:delete'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const driver = await Driver.findById(id);
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.DRIVER.NOT_FOUND
      });
    }
    
    // ✅ FIX #2: Check active rides by driverId (not phone - phones can change!)
    const activeRides = await Ride.countDocuments({
      driverId: id,
      status: { $in: ['approved', 'enroute', 'arrived'] }
    });
    
    if (activeRides > 0) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.DRIVER.HAS_ACTIVE_RIDES
      });
    }
    
    await Driver.findByIdAndDelete(id);
    
    // Log activity
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'driver_deleted',
      details: { driverId: id, name: driver.name }
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success("Driver deleted", {
      requestId: req.id || null,
      driverId: id
    });
    
    res.json({
      ok: true,
      message: "נהג נמחק בהצלחה"
    });
  } catch (err) {
    logger.error("Error deleting driver", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// BLOCKING / UNBLOCKING
// ============================================================

// ===============================================
// POST /api/drivers/:id/block - חסימת נהג
// ===============================================
router.post("/:id/block", authenticateToken, requirePermission('drivers:update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const driver = await Driver.findById(id);
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.DRIVER.NOT_FOUND
      });
    }
    
    // ✅ FIX #5: State guard - don't block already blocked driver
    if (driver.isBlocked) {
      return res.status(400).json({
        ok: false,
        error: 'נהג כבר חסום'
      });
    }
    
    driver.isBlocked = true;
    driver.blockReason = reason || 'לא צוין';
    driver.blockedAt = new Date();
    driver.isActive = false;
    
    // Add to status history
    if (!Array.isArray(driver.statusHistory)) {
      driver.statusHistory = [];
    }
    driver.statusHistory.push({
      status: 'blocked',
      reason: reason || 'לא צוין',
      changedBy: req.user.username || req.user.user,
      changedAt: new Date()
    });
    
    await driver.save();
    
    // Log activity
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'driver_blocked',
      details: { driverId: id, reason: reason || 'לא צוין' }
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success("Driver blocked", {
      requestId: req.id || null,
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
// POST /api/drivers/:id/unblock - ביטול חסימת נהג
// ===============================================
router.post("/:id/unblock", authenticateToken, requirePermission('drivers:update'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const driver = await Driver.findById(id);
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.DRIVER.NOT_FOUND
      });
    }
    
    // ✅ FIX #5: State guard - don't unblock non-blocked driver
    if (!driver.isBlocked) {
      return res.status(400).json({
        ok: false,
        error: 'נהג לא חסום'
      });
    }
    
    driver.isBlocked = false;
    driver.blockReason = null;
    driver.blockedAt = null;
    driver.isActive = true;
    
    // Add to status history
    if (!Array.isArray(driver.statusHistory)) {
      driver.statusHistory = [];
    }
    driver.statusHistory.push({
      status: 'active',
      reason: 'חסימה הוסרה',
      changedBy: req.user.username || req.user.user,
      changedAt: new Date()
    });
    
    await driver.save();
    
    // Log activity
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'driver_unblocked',
      details: { driverId: id }
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success("Driver unblocked", {
      requestId: req.id || null,
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
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// DOCUMENTS
// ============================================================

// ===============================================
// POST /api/drivers/:id/verify-document - אימות מסמך לפי type
// ===============================================
router.post("/:id/verify-document", authenticateToken, requirePermission('drivers:update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { documentType, verified } = req.body;
    
    if (!['license', 'carLicense', 'insurance'].includes(documentType)) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.DRIVER.INVALID_DOCUMENT_TYPE
      });
    }
    
    const driver = await Driver.findById(id);
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.DRIVER.NOT_FOUND
      });
    }
    
    // ✅ FIX: documents as ARRAY consistently
    if (!Array.isArray(driver.documents)) {
      driver.documents = [];
    }
    
    // Find existing document by type
    const docIndex = driver.documents.findIndex(d => d.type === documentType);
    
    if (docIndex >= 0) {
      // Update existing
      driver.documents[docIndex].verified = verified;
      driver.documents[docIndex].verifiedAt = new Date();
      driver.documents[docIndex].verifiedBy = req.user.username || req.user.user;
    } else {
      // Create new entry
      driver.documents.push({
        type: documentType,
        verified,
        verifiedAt: new Date(),
        verifiedBy: req.user.username || req.user.user
      });
    }
    
    await driver.save();
    
    logger.success("Document verified", {
      requestId: req.id || null,
      driverId: driver._id,
      documentType,
      verified
    });
    
    // Log activity - using AuditLog for consistency
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: verified ? 'document_verified' : 'document_unverified',
      details: { driverId: driver._id, documentType }
    }).catch(err => logger.error('AuditLog error:', err));
    
    res.json({
      ok: true,
      driver
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
// POST /api/drivers/:id/documents/upload - העלאת מסמך
// ===============================================
router.post('/:id/documents/upload', authenticateToken, requirePermission('drivers:update'), async (req, res) => {
  try {
    const { type, filename, url, expiresAt } = req.body;
    
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.DRIVER.NOT_FOUND
      });
    }
    
    if (!Array.isArray(driver.documents)) {
      driver.documents = [];
    }
    
    driver.documents.push({
      type,
      filename,
      url,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      uploadedAt: new Date()
    });
    
    await driver.save();
    
    logger.success('Document uploaded', {
      requestId: req.id || null,
      driverId: driver._id,
      documentType: type
    });
    
    res.json({ ok: true, documents: driver.documents });
  } catch (err) {
    logger.error('Error uploading document', {
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
// GET /api/drivers/:id/documents - רשימת מסמכים
// ===============================================
router.get('/:id/documents', authenticateToken, requirePermission('drivers:read'), async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id).select('documents');
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.DRIVER.NOT_FOUND
      });
    }
    
    res.json({ ok: true, documents: driver.documents || [] });
  } catch (err) {
    logger.error('Error fetching documents', {
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
// POST /api/drivers/:id/documents/:docId/verify - אימות מסמך ספציפי
// ===============================================
router.post('/:id/documents/:docId/verify', authenticateToken, requirePermission('drivers:update'), async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.DRIVER.NOT_FOUND
      });
    }
    
    const doc = driver.documents.id(req.params.docId);
    if (!doc) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.DRIVER.DOCUMENT_NOT_FOUND
      });
    }
    
    doc.verified = true;
    doc.verifiedBy = req.user.username || req.user.user;
    doc.verifiedAt = new Date();
    
    await driver.save();
    
    logger.success('Document verified', {
      requestId: req.id || null,
      driverId: driver._id,
      documentId: req.params.docId
    });
    
    res.json({ ok: true, document: doc });
  } catch (err) {
    logger.error('Error verifying document', {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// NOTES
// ============================================================

// ===============================================
// POST /api/drivers/:id/notes - הוספת הערה
// ===============================================
router.post('/:id/notes', authenticateToken, requirePermission('drivers:update'), async (req, res) => {
  try {
    const { text, isPrivate } = req.body;
    
    if (!text || !text.trim()) {
      return res.status(400).json({
        ok: false,
        error: 'טקסט ההערה חובה'
      });
    }
    
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.DRIVER.NOT_FOUND
      });
    }
    
    if (!Array.isArray(driver.notes)) {
      driver.notes = [];
    }
    
    driver.notes.push({
      text: text.trim(),
      createdBy: req.user.username || req.user.user,
      isPrivate: isPrivate || false,
      createdAt: new Date()
    });
    
    await driver.save();
    
    // Log activity
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'driver_updated',
      details: { driverId: driver._id, action: 'note_added' }
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success('Note added to driver', {
      requestId: req.id || null,
      driverId: driver._id
    });
    
    res.json({ ok: true, notes: driver.notes });
  } catch (err) {
    logger.error('Error adding note', {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// RATING
// ============================================================

// ===============================================
// POST /api/drivers/:id/rating - הוספת דירוג
// ===============================================
router.post('/:id/rating', authenticateToken, requirePermission('drivers:update'), async (req, res) => {
  try {
    const { rating, comment, rideId } = req.body;
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.DRIVER.INVALID_RATING
      });
    }
    
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.DRIVER.NOT_FOUND
      });
    }
    
    // Initialize rating structure if needed
    if (!driver.rating) {
      driver.rating = { reviews: [], count: 0, average: 0 };
    }
    if (!Array.isArray(driver.rating.reviews)) {
      driver.rating.reviews = [];
    }
    
    // ✅ FIX #4: Prevent duplicate ratings for same ride
    if (rideId) {
      const existingRating = driver.rating.reviews.find(r => r.rideId && r.rideId.toString() === rideId.toString());
      if (existingRating) {
        return res.status(400).json({
          ok: false,
          error: 'נסיעה זו כבר דורגה'
        });
      }
    }
    
    driver.rating.reviews.push({
      rating,
      comment,
      rideId,
      createdAt: new Date(),
      createdBy: req.user.username || req.user.user
    });
    
    // Recalculate average
    driver.rating.count = driver.rating.reviews.length;
    driver.rating.average = driver.rating.reviews.reduce((sum, r) => sum + r.rating, 0) / driver.rating.count;
    
    await driver.save();
    
    logger.success('Rating added to driver', {
      requestId: req.id || null,
      driverId: driver._id,
      rating,
      rideId
    });
    
    res.json({ ok: true, rating: driver.rating });
  } catch (err) {
    logger.error('Error adding rating', {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// STATUS & HISTORY
// ============================================================

// ===============================================
// GET /api/drivers/:id/status-history - היסטוריית סטטוס
// ===============================================
router.get('/:id/status-history', authenticateToken, requirePermission('drivers:read'), async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id).select('statusHistory');
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.DRIVER.NOT_FOUND
      });
    }
    
    res.json({ 
      ok: true, 
      statusHistory: (driver.statusHistory || []).reverse()
    });
  } catch (err) {
    logger.error('Error fetching status history', {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// STATISTICS
// ============================================================

// ===============================================
// GET /api/drivers/:id/statistics - סטטיסטיקות נהג
// ===============================================
router.get('/:id/statistics', authenticateToken, requirePermission('drivers:read'), async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id).select('statistics rating totalRides');
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.DRIVER.NOT_FOUND
      });
    }
    
    res.json({ 
      ok: true, 
      statistics: driver.statistics || {},
      rating: driver.rating || { count: 0, average: 0 },
      totalRides: driver.totalRides || 0
    });
  } catch (err) {
    logger.error('Error fetching statistics', {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// REGION
// ============================================================

// ===============================================
// PUT /api/drivers/:id/region - עדכון אזור
// ===============================================
router.put('/:id/region', authenticateToken, requirePermission('drivers:update'), async (req, res) => {
  try {
    const { name, code } = req.body;
    
    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { $set: { region: { name, code } } },
      { new: true }
    );
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.DRIVER.NOT_FOUND
      });
    }
    
    logger.success('Driver region updated', {
      requestId: req.id || null,
      driverId: driver._id,
      region: { name, code }
    });
    
    res.json({ ok: true, driver });
  } catch (err) {
    logger.error('Error updating region', {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// EXPORT
// ============================================================

export default router;