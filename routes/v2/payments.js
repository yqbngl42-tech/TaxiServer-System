import express from 'express';
import { authenticateToken } from './auth.js';
import Payment from '../../models/Payment.js';

const router = express.Router();

// GET /api/v2/payments
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.driverId) filter.driverId = req.query.driverId;
    if (req.query.from) filter.createdAt = { $gte: new Date(req.query.from) };
    if (req.query.to) filter.createdAt = { ...filter.createdAt, $lte: new Date(req.query.to) };
    
    const [items, total] = await Promise.all([
      Payment.find(filter).sort({ createdAt: -1 }).limit(limit).skip(skip).lean(),
      Payment.countDocuments(filter)
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

// GET /api/v2/payments/reports/summary
router.get('/reports/summary', authenticateToken, async (req, res) => {
  try {
    const filter = {};
    if (req.query.from) filter.createdAt = { $gte: new Date(req.query.from) };
    if (req.query.to) filter.createdAt = { ...filter.createdAt, $lte: new Date(req.query.to) };
    
    const [totalRevenue, paidRevenue, unpaidRevenue] = await Promise.all([
      Payment.aggregate([
        { $match: filter },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.aggregate([
        { $match: { ...filter, status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.aggregate([
        { $match: { ...filter, status: 'unpaid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);
    
    res.json({
      ok: true,
      data: {
        totalRevenue: totalRevenue[0]?.total || 0,
        paid: paidRevenue[0]?.total || 0,
        unpaid: unpaidRevenue[0]?.total || 0
      }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'DATABASE_ERROR', message: err.message }
    });
  }
});

// PUT /api/v2/payments/:id/mark-paid
router.put('/:id/mark-paid', authenticateToken, async (req, res) => {
  try {
    const payment = await Payment.findByIdAndUpdate(
      req.params.id,
      { 
        $set: { 
          status: 'paid',
          paidAt: new Date(),
          paidBy: 'admin'
        }
      },
      { new: true }
    );
    
    if (!payment) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'תשלום לא נמצא' }
      });
    }
    
    res.json({ ok: true, data: { payment } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// POST /api/v2/payments/:id/reminder
router.post('/:id/reminder', authenticateToken, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    
    if (!payment) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'תשלום לא נמצא' }
      });
    }
    
    // TODO: Send actual reminder via WhatsApp/SMS
    
    payment.reminderSent = true;
    payment.lastReminderAt = new Date();
    await payment.save();
    
    res.json({ ok: true, data: { sent: true } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

export default router;
