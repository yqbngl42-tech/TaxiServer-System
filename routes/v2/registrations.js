import express from 'express';
import { authenticateToken } from './auth.js';
import RegistrationSession from '../../models/RegistrationSession.js';

const router = express.Router();

// GET /api/v2/registrations
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    
    const [items, total] = await Promise.all([
      RegistrationSession.find(filter).sort({ createdAt: -1 }).limit(limit).skip(skip).lean(),
      RegistrationSession.countDocuments(filter)
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

// POST /api/v2/registrations/:id/approve
router.post('/:id/approve', authenticateToken, async (req, res) => {
  try {
    const registration = await RegistrationSession.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'approved' } },
      { new: true }
    );
    
    if (!registration) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'רישום לא נמצא' }
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

// POST /api/v2/registrations/:id/reject
router.post('/:id/reject', authenticateToken, async (req, res) => {
  try {
    const registration = await RegistrationSession.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'rejected', rejectionReason: req.body.reason } },
      { new: true }
    );
    
    if (!registration) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'רישום לא נמצא' }
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

export default router;
