import express from 'express';
import { authenticateToken } from './auth-enhanced.js';
import { requirePermission } from '../../middleware/rbac.js';
import Driver from '../../models/Driver.js';
import AuditLog from '../../models/AuditLog.js';

const router = express.Router();

// Copy all basic routes from drivers.js, then add:

// ===============================================
// NOTES
// ===============================================
router.post('/:id/notes', authenticateToken, requirePermission('drivers:update'), async (req, res) => {
  try {
    const { text, isPrivate } = req.body;
    
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נהג לא נמצא' }
      });
    }
    
    driver.notes.push({
      text,
      createdBy: req.user.username,
      isPrivate: isPrivate || false
    });
    
    await driver.save();
    
    await AuditLog.create({
      userId: req.user.userId,
      username: req.user.username,
      action: 'driver_updated',
      details: { driverId: driver._id, action: 'note_added' }
    });
    
    res.json({ ok: true, data: { notes: driver.notes } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// STATUS HISTORY
// ===============================================
router.get('/:id/status-history', authenticateToken, requirePermission('drivers:read'), async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id).select('statusHistory');
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נהג לא נמצא' }
      });
    }
    
    res.json({ 
      ok: true, 
      data: { 
        items: driver.statusHistory.reverse() 
      } 
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// RATING
// ===============================================
router.post('/:id/rating', authenticateToken, requirePermission('drivers:update'), async (req, res) => {
  try {
    const { rating, comment, rideId } = req.body;
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_RATING', message: 'דירוג חייב להיות בין 1 ל-5' }
      });
    }
    
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נהג לא נמצא' }
      });
    }
    
    driver.rating.reviews.push({
      rating,
      comment,
      rideId
    });
    
    // Recalculate average
    driver.rating.count = driver.rating.reviews.length;
    driver.rating.average = driver.rating.reviews.reduce((sum, r) => sum + r.rating, 0) / driver.rating.count;
    
    await driver.save();
    
    res.json({ ok: true, data: { rating: driver.rating } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// DOCUMENTS
// ===============================================
router.post('/:id/documents/upload', authenticateToken, requirePermission('drivers:update'), async (req, res) => {
  try {
    const { type, filename, url, expiresAt } = req.body;
    
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נהג לא נמצא' }
      });
    }
    
    driver.documents.push({
      type,
      filename,
      url,
      expiresAt: expiresAt ? new Date(expiresAt) : null
    });
    
    await driver.save();
    
    res.json({ ok: true, data: { documents: driver.documents } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

router.get('/:id/documents', authenticateToken, requirePermission('drivers:read'), async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id).select('documents');
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נהג לא נמצא' }
      });
    }
    
    res.json({ ok: true, data: { items: driver.documents } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

router.post('/:id/documents/:docId/verify', authenticateToken, requirePermission('drivers:update'), async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נהג לא נמצא' }
      });
    }
    
    const doc = driver.documents.id(req.params.docId);
    if (!doc) {
      return res.status(404).json({
        ok: false,
        error: { code: 'DOCUMENT_NOT_FOUND', message: 'מסמך לא נמצא' }
      });
    }
    
    doc.verified = true;
    doc.verifiedBy = req.user.username;
    doc.verifiedAt = new Date();
    
    await driver.save();
    
    res.json({ ok: true, data: { document: doc } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// STATISTICS
// ===============================================
router.get('/:id/statistics', authenticateToken, requirePermission('drivers:read'), async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id).select('statistics rating');
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נהג לא נמצא' }
      });
    }
    
    res.json({ 
      ok: true, 
      data: { 
        statistics: driver.statistics,
        rating: driver.rating
      } 
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// REGION
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
        error: { code: 'NOT_FOUND', message: 'נהג לא נמצא' }
      });
    }
    
    res.json({ ok: true, data: { driver } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

export default router;
