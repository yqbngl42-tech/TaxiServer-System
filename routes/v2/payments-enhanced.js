import express from 'express';
import { authenticateToken } from './auth-enhanced.js';
import { requirePermission } from '../../middleware/rbac.js';
import Payment from '../../models/Payment.js';
import AuditLog from '../../models/AuditLog.js';

const router = express.Router();

// ===============================================
// GET ALL PAYMENTS
// ===============================================
router.get('/', authenticateToken, requirePermission('payments:read'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.driverId) filter.driverId = req.query.driverId;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }

    const [payments, total] = await Promise.all([
      Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Payment.countDocuments(filter)
    ]);

    res.json({
      ok: true,
      data: {
        items: payments,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'DATABASE_ERROR', message: err.message }
    });
  }
});

// ===============================================
// CREATE PAYMENT
// ===============================================
router.post('/', authenticateToken, requirePermission('payments:create'), async (req, res) => {
  try {
    const { driverId, driverName, driverPhone, amount, type, description, dueDate } = req.body;
    
    if (!driverId || !amount) {
      return res.status(400).json({
        ok: false,
        error: { code: 'MISSING_FIELDS', message: 'חסרים שדות חובה' }
      });
    }

    const payment = await Payment.create({
      driverId,
      driverName,
      driverPhone,
      amount,
      type: type || 'commission',
      description,
      dueDate: dueDate ? new Date(dueDate) : null
    });

    await AuditLog.create({
      userId: req.user.userId,
      username: req.user.username,
      action: 'payment_created',
      details: { paymentId: payment._id, amount }
    });
    
    res.json({ ok: true, data: { payment } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// UPDATE PAYMENT
// ===============================================
router.put('/:id', authenticateToken, requirePermission('payments:update'), async (req, res) => {
  try {
    const updates = req.body;
    updates.updatedAt = new Date();
    
    const payment = await Payment.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
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

// ===============================================
// DELETE PAYMENT
// ===============================================
router.delete('/:id', authenticateToken, requirePermission('payments:delete'), async (req, res) => {
  try {
    const payment = await Payment.findByIdAndDelete(req.params.id);
    
    if (!payment) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'תשלום לא נמצא' }
      });
    }

    await AuditLog.create({
      userId: req.user.userId,
      username: req.user.username,
      action: 'payment_deleted',
      details: { paymentId: payment._id }
    });
    
    res.json({ ok: true, data: {} });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// MARK AS PAID
// ===============================================
router.put('/:id/mark-paid', authenticateToken, requirePermission('payments:mark_paid'), async (req, res) => {
  try {
    const payment = await Payment.findByIdAndUpdate(
      req.params.id,
      { 
        $set: { 
          status: 'paid',
          paidAt: new Date(),
          paidBy: req.user.username,
          updatedAt: new Date()
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

    await AuditLog.create({
      userId: req.user.userId,
      username: req.user.username,
      action: 'payment_marked_paid',
      details: { paymentId: payment._id }
    });
    
    res.json({ ok: true, data: { payment } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// UPLOAD RECEIPT
// ===============================================
router.post('/:id/receipt-upload', authenticateToken, requirePermission('payments:update'), async (req, res) => {
  try {
    const { filename, url } = req.body;
    
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'תשלום לא נמצא' }
      });
    }

    payment.receipt = {
      filename,
      url,
      uploadedAt: new Date(),
      uploadedBy: req.user.username
    };
    payment.updatedAt = new Date();
    
    await payment.save();
    
    res.json({ ok: true, data: { receipt: payment.receipt } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// OCR EXTRACT
// ===============================================
router.post('/:id/ocr-extract', authenticateToken, requirePermission('payments:update'), async (req, res) => {
  try {
    const { extractedAmount, extractedDate, vendor, confidence, rawText } = req.body;
    
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'תשלום לא נמצא' }
      });
    }

    payment.ocrData = {
      extractedAmount,
      extractedDate: extractedDate ? new Date(extractedDate) : null,
      vendor,
      confidence,
      rawText,
      extractedAt: new Date()
    };
    payment.updatedAt = new Date();
    
    await payment.save();
    
    res.json({ ok: true, data: { ocrData: payment.ocrData } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// GET OVERDUE PAYMENTS
// ===============================================
router.get('/overdue', authenticateToken, requirePermission('payments:read'), async (req, res) => {
  try {
    const now = new Date();
    
    const payments = await Payment.find({
      status: { $in: ['unpaid', 'pending'] },
      dueDate: { $lt: now }
    }).sort({ dueDate: 1 });

    // Update overdue status
    for (const payment of payments) {
      const daysPastDue = Math.floor((now - payment.dueDate) / (1000 * 60 * 60 * 24));
      payment.overdueStatus = {
        isOverdue: true,
        daysPastDue,
        overdueAmount: payment.amount
      };
      await payment.save();
    }
    
    res.json({ ok: true, data: { items: payments } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// SEND PAYMENT ALERT
// ===============================================
router.post('/:id/send-alert', authenticateToken, requirePermission('payments:update'), async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'תשלום לא נמצא' }
      });
    }

    if (!payment.overdueStatus) {
      payment.overdueStatus = {};
    }
    
    payment.overdueStatus.alertsSent = (payment.overdueStatus.alertsSent || 0) + 1;
    payment.overdueStatus.lastAlertSent = new Date();
    payment.updatedAt = new Date();
    
    await payment.save();
    
    // TODO: Actually send WhatsApp/SMS alert
    
    res.json({ ok: true, data: { sent: true } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// REPORTS - BY DRIVER
// ===============================================
router.get('/reports/by-driver', authenticateToken, requirePermission('payments:read'), async (req, res) => {
  try {
    const { driverId } = req.query;
    
    if (!driverId) {
      return res.status(400).json({
        ok: false,
        error: { code: 'MISSING_DRIVER_ID', message: 'נא לציין מזהה נהג' }
      });
    }

    const payments = await Payment.find({ driverId });
    
    const stats = {
      total: payments.reduce((sum, p) => sum + p.amount, 0),
      paid: payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0),
      unpaid: payments.filter(p => p.status === 'unpaid').reduce((sum, p) => sum + p.amount, 0),
      count: payments.length
    };
    
    res.json({ ok: true, data: { stats, payments } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// REPORTS - BY PERIOD
// ===============================================
router.get('/reports/by-period', authenticateToken, requirePermission('payments:read'), async (req, res) => {
  try {
    const { from, to } = req.query;
    
    const filter = {};
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const payments = await Payment.find(filter);
    
    const stats = {
      total: payments.reduce((sum, p) => sum + p.amount, 0),
      paid: payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0),
      unpaid: payments.filter(p => p.status === 'unpaid').reduce((sum, p) => sum + p.amount, 0),
      count: payments.length,
      byType: {}
    };
    
    // Group by type
    payments.forEach(p => {
      if (!stats.byType[p.type]) {
        stats.byType[p.type] = { count: 0, total: 0 };
      }
      stats.byType[p.type].count++;
      stats.byType[p.type].total += p.amount;
    });
    
    res.json({ ok: true, data: { stats, payments } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// GET PAYMENT SUMMARY
// ===============================================
router.get('/reports/summary', authenticateToken, requirePermission('payments:read'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }
    
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

export default router;
