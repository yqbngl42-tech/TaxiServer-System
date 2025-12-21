import express from 'express';
import { authenticateToken } from './auth.js';
import Driver from '../../models/Driver.js';

const router = express.Router();

// GET /api/v2/drivers
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    
    const filter = {};
    if (req.query.status === 'active') filter.isActive = true;
    if (req.query.status === 'blocked') filter.isBlocked = true;
    if (req.query.q) {
      filter.$or = [
        { name: { $regex: req.query.q, $options: 'i' } },
        { phone: { $regex: req.query.q, $options: 'i' } }
      ];
    }
    
    const [items, total] = await Promise.all([
      Driver.find(filter).sort({ createdAt: -1 }).limit(limit).skip(skip).lean(),
      Driver.countDocuments(filter)
    ]);
    
    res.json({
      ok: true,
      data: {
        items,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'DATABASE_ERROR', message: err.message }
    });
  }
});

// POST /api/v2/drivers - Create new driver
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, phone, commissionPercent, idNumber, address } = req.body;
    
    if (!name || !phone) {
      return res.status(400).json({
        ok: false,
        error: { code: 'MISSING_FIELDS', message: 'שם וטלפון חובה' }
      });
    }
    
    // Check if driver exists
    const exists = await Driver.findOne({ phone });
    if (exists) {
      return res.status(400).json({
        ok: false,
        error: { code: 'DRIVER_EXISTS', message: 'נהג עם מספר זה כבר קיים' }
      });
    }
    
    const driver = await Driver.create({
      name: name.trim(),
      phone: phone.trim(),
      commissionPercent: commissionPercent || 10,
      idNumber: idNumber || null,
      address: address || null,
      isActive: true,
      isBlocked: false,
      totalRides: 0
    });
    
    res.json({ ok: true, data: { driver } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// GET /api/v2/drivers/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id).lean();
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
      error: { code: 'DATABASE_ERROR', message: err.message }
    });
  }
});

// PUT /api/v2/drivers/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
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

// POST /api/v2/drivers/:id/block
router.post('/:id/block', authenticateToken, async (req, res) => {
  try {
    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { $set: { isBlocked: true, isActive: false } },
      { new: true }
    );
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נהג לא נמצא' }
      });
    }
    
    res.json({ ok: true, data: {} });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// POST /api/v2/drivers/:id/unblock
router.post('/:id/unblock', authenticateToken, async (req, res) => {
  try {
    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { $set: { isBlocked: false, isActive: true } },
      { new: true }
    );
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נהג לא נמצא' }
      });
    }
    
    res.json({ ok: true, data: {} });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// POST /api/v2/drivers/:id/verify-document
router.post('/:id/verify-document', authenticateToken, async (req, res) => {
  try {
    const { documentType, verified } = req.body;
    
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נהג לא נמצא' }
      });
    }
    
    // Update document verification
    if (!driver.documents) driver.documents = [];
    const docIndex = driver.documents.findIndex(d => d.type === documentType);
    
    if (docIndex >= 0) {
      driver.documents[docIndex].verified = verified;
      driver.documents[docIndex].verifiedAt = new Date();
    } else {
      driver.documents.push({
        type: documentType,
        verified,
        verifiedAt: new Date()
      });
    }
    
    await driver.save();
    
    res.json({ ok: true, data: {} });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

export default router;
