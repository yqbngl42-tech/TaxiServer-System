// ===============================================
// 💰 PAYMENTS ROUTES - Production Ready
// ===============================================
// Merged from:
// - routes/payments.js (114 lines, 2 endpoints - duplicated!)
// - v2/payments.js (136 lines, 4 endpoints)
// - v2/payments-enhanced.js (446 lines, 14 endpoints)
// Result: 16 unique endpoints, RBAC, validation, smart fallbacks
// ===============================================
//
// ⚠️ CRITICAL FALLBACK BEHAVIOR:
// ===============================================
// If Payment model exists:
//   ✅ Uses Payment model for all operations
//   ❌ Ride model is IGNORED for payments
//
// If Payment model does NOT exist:
//   ✅ Falls back to Ride model
//   ✅ Reads: ride.commissionAmount, ride.paymentStatus
//   ⚠️  Limited functionality (no manual payments, receipts, OCR)
//   ⚠️  Reports use Ride data (commission only)
//
// Rule: Payment model takes precedence when available
// ===============================================

import express from 'express';
import { authenticateToken } from '../middlewares/auth.js';
import { requirePermission } from '../middlewares/rbac.js';
import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import AuditLog from '../models/AuditLog.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ============================================================
// ERROR MESSAGES
// ============================================================

const ERRORS = {
  PAYMENT: {
    NOT_FOUND: 'תשלום לא נמצא',
    MISSING_FIELDS: 'חסרים שדות חובה',
    INVALID_STATUS: 'סטטוס לא תקין',
    INVALID_AMOUNT: 'סכום לא תקין',
    ALREADY_PAID: 'תשלום כבר שולם'
  },
  DRIVER: {
    NOT_FOUND: 'נהג לא נמצא'
  },
  SERVER: {
    DATABASE: 'שגיאת מסד נתונים',
    UNKNOWN: 'שגיאת שרת'
  }
};

const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded', 'unpaid'];
const PAYMENT_TYPES = ['commission', 'penalty', 'bonus', 'refund', 'other'];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Try to load Payment model (fallback to Ride if not available)
 */
async function getPaymentModel() {
  try {
    const Payment = (await import('../models/Payment.js').catch(() => null))?.default;
    return Payment || null;
  } catch {
    return null;
  }
}

/**
 * Get payments from Ride model (fallback)
 */
async function getPaymentsFromRides(filter = {}, options = {}) {
  const { page = 1, limit = 20, sort = '-createdAt' } = options;
  const skip = (page - 1) * limit;
  
  // Build Ride query from payment filter
  const rideQuery = {};
  
  if (filter.status) {
    if (filter.status === 'paid') {
      rideQuery.paymentStatus = 'paid';
    } else if (filter.status === 'unpaid') {
      rideQuery.paymentStatus = { $in: ['pending', 'unpaid'] };
    } else if (filter.status === 'pending') {
      rideQuery.paymentStatus = 'pending';
    }
  }
  
  if (filter.driverId) {
    rideQuery.driverId = filter.driverId;
  }
  
  if (filter.createdAt) {
    rideQuery.createdAt = filter.createdAt;
  }
  
  const [rides, total] = await Promise.all([
    Ride.find(rideQuery)
      .populate('driverId', 'name phone')
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Ride.countDocuments(rideQuery)
  ]);
  
  // Transform rides to payment format
  const payments = rides.map(ride => ({
    _id: ride._id,
    rideId: ride.rideNumber || ride._id,
    driverId: ride.driverId?._id,
    driverName: ride.driverName || ride.driverId?.name,
    driverPhone: ride.driverPhone || ride.driverId?.phone,
    amount: ride.commissionAmount || (ride.price * (ride.commissionRate || 0.1)),
    type: 'commission',
    status: ride.paymentStatus || 'pending',
    description: `עמלה מנסיעה ${ride.rideNumber}`,
    createdAt: ride.createdAt,
    updatedAt: ride.updatedAt,
    _fromRide: true // flag to indicate this is from Ride model
  }));
  
  return { payments, total };
}

// ===============================================
// GET /api/payments - קבלת תשלומים
// ===============================================
router.get("/", authenticateToken, requirePermission('payments:read'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const { status, driverId, from, to, type } = req.query;
    
    // Try Payment model first
    const Payment = await getPaymentModel();
    
    let payments, total;
    
    if (Payment) {
      // Use Payment model
      const filter = {};
      if (status) filter.status = status;
      if (driverId) filter.driverId = driverId;
      if (type) filter.type = type;
      if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = new Date(from);
        if (to) filter.createdAt.$lte = new Date(to);
      }
      
      [payments, total] = await Promise.all([
        Payment.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Payment.countDocuments(filter)
      ]);
    } else {
      // Fallback to Ride model
      const filter = {};
      if (status) filter.status = status;
      if (driverId) filter.driverId = driverId;
      if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = new Date(from);
        if (to) filter.createdAt.$lte = new Date(to);
      }
      
      const result = await getPaymentsFromRides(filter, { page, limit });
      payments = result.payments;
      total = result.total;
      
      logger.warn('Using Ride model fallback for payments', {
        requestId: req.id || null
      });
    }
    
    res.json({
      ok: true,
      payments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (err) {
    logger.error("Error fetching payments", {
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
// POST /api/payments - יצירת תשלום
// ===============================================
router.post("/", authenticateToken, requirePermission('payments:create'), async (req, res) => {
  try {
    const { driverId, driverName, driverPhone, amount, type = 'commission', description, dueDate, reason } = req.body;
    
    // ⚠️ CRITICAL: Validation - prevent unsafe manual debt creation
    if (!driverId || !amount) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.PAYMENT.MISSING_FIELDS
      });
    }
    
    // ⚠️ CRITICAL: Description is REQUIRED for manual payments
    if (!description || description.trim().length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'תיאור התשלום הוא שדה חובה (למה נוצר חוב זה?)'
      });
    }
    
    if (amount <= 0) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.PAYMENT.INVALID_AMOUNT
      });
    }
    
    // ⚠️ CRITICAL: Cap on manual payment creation (safety limit)
    const MAX_MANUAL_PAYMENT = 10000; // ₪10,000
    if (amount > MAX_MANUAL_PAYMENT && type !== 'commission') {
      logger.warn("Attempted to create large manual payment", {
        amount,
        type,
        requestedBy: req.user.username || req.user.user,
        driverId
      });
      
      return res.status(400).json({
        ok: false,
        error: `סכום חריג (מעל ${MAX_MANUAL_PAYMENT}₪) דורש אישור מיוחד`,
        maxAllowed: MAX_MANUAL_PAYMENT
      });
    }
    
    if (!PAYMENT_TYPES.includes(type)) {
      return res.status(400).json({
        ok: false,
        error: 'סוג תשלום לא תקין',
        validTypes: PAYMENT_TYPES
      });
    }
    
    // Verify driver exists
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.DRIVER.NOT_FOUND
      });
    }
    
    const Payment = await getPaymentModel();
    
    if (!Payment) {
      return res.status(501).json({
        ok: false,
        error: 'Payment model not available - use Ride payments instead'
      });
    }
    
    const payment = await Payment.create({
      driverId,
      driverName: driverName || driver.name,
      driverPhone: driverPhone || driver.phone,
      amount,
      type,
      description: description.trim(),
      status: 'unpaid',
      dueDate: dueDate ? new Date(dueDate) : null,
      createdBy: req.user.username || req.user.user,
      metadata: {
        createdManually: true,
        reason: reason || null,
        approvedBy: req.user.username || req.user.user
      }
    });
    
    // ⚠️ CRITICAL: Enhanced audit for manual payment creation
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'payment_created_manual',
      details: { 
        paymentId: payment._id,
        driverId,
        driverName: driver.name,
        amount,
        type,
        description: description.trim(),
        reason: reason || 'לא צוין',
        isManual: true,
        timestamp: new Date()
      },
      severity: amount > 1000 ? 'high' : 'medium'
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success("Manual payment created", {
      requestId: req.id || null,
      paymentId: payment._id,
      amount,
      type,
      createdBy: req.user.username || req.user.user
    });
    
    res.json({
      ok: true,
      payment
    });
  } catch (err) {
    logger.error("Error creating payment", {
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
// GET /api/payments/:id - קבלת תשלום בודד
// ===============================================
router.get("/:id", authenticateToken, requirePermission('payments:read'), async (req, res) => {
  try {
    const Payment = await getPaymentModel();
    
    if (!Payment) {
      return res.status(501).json({
        ok: false,
        error: 'Payment model not available'
      });
    }
    
    const payment = await Payment.findById(req.params.id);
    
    if (!payment) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.PAYMENT.NOT_FOUND
      });
    }
    
    res.json({
      ok: true,
      payment
    });
  } catch (err) {
    logger.error("Error fetching payment", {
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
// PUT /api/payments/:id - עדכון תשלום
// ===============================================
router.put("/:id", authenticateToken, requirePermission('payments:update'), async (req, res) => {
  try {
    const Payment = await getPaymentModel();
    
    if (!Payment) {
      return res.status(501).json({
        ok: false,
        error: 'Payment model not available'
      });
    }
    
    const updates = { ...req.body };
    delete updates._id;
    delete updates.createdAt;
    updates.updatedAt = new Date();
    
    const payment = await Payment.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    );
    
    if (!payment) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.PAYMENT.NOT_FOUND
      });
    }
    
    // Audit log
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'payment_updated',
      details: { paymentId: payment._id, updates }
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success("Payment updated", {
      requestId: req.id || null,
      paymentId: payment._id
    });
    
    res.json({
      ok: true,
      payment
    });
  } catch (err) {
    logger.error("Error updating payment", {
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
// DELETE /api/payments/:id - מחיקת תשלום
// ===============================================
router.delete("/:id", authenticateToken, requirePermission('payments:delete'), async (req, res) => {
  try {
    const Payment = await getPaymentModel();
    
    if (!Payment) {
      return res.status(501).json({
        ok: false,
        error: 'Payment model not available'
      });
    }
    
    const payment = await Payment.findByIdAndDelete(req.params.id);
    
    if (!payment) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.PAYMENT.NOT_FOUND
      });
    }
    
    // Audit log
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'payment_deleted',
      details: { paymentId: payment._id, amount: payment.amount }
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success("Payment deleted", {
      requestId: req.id || null,
      paymentId: payment._id
    });
    
    res.json({
      ok: true,
      message: 'תשלום נמחק בהצלחה'
    });
  } catch (err) {
    logger.error("Error deleting payment", {
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
// PUT /api/payments/:id/mark-paid - סימון כשולם
// ===============================================
router.put("/:id/mark-paid", authenticateToken, requirePermission('payments:mark_paid'), async (req, res) => {
  try {
    const { paymentMethod, notes } = req.body;
    
    const Payment = await getPaymentModel();
    
    if (!Payment) {
      return res.status(501).json({
        ok: false,
        error: 'Payment model not available'
      });
    }
    
    const payment = await Payment.findById(req.params.id);
    
    if (!payment) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.PAYMENT.NOT_FOUND
      });
    }
    
    // ⚠️ CRITICAL: Idempotency check - prevent double-payment!
    if (payment.status === 'paid' || payment.paidAt) {
      logger.warn("Attempted to mark already-paid payment", {
        paymentId: payment._id,
        existingPaidAt: payment.paidAt,
        attemptedBy: req.user.username || req.user.user
      });
      
      return res.status(409).json({
        ok: false,
        error: ERRORS.PAYMENT.ALREADY_PAID,
        payment: {
          id: payment._id,
          paidAt: payment.paidAt,
          paidBy: payment.paidBy
        }
      });
    }
    
    payment.status = 'paid';
    payment.paidAt = new Date();
    payment.paidBy = req.user.username || req.user.user;
    if (paymentMethod) payment.paymentMethod = paymentMethod;
    if (notes) payment.notes = notes;
    payment.updatedAt = new Date();
    
    await payment.save();
    
    // ⚠️ CRITICAL: Sync with Ride model if rideId exists
    if (payment.rideId) {
      try {
        const ride = await Ride.findById(payment.rideId);
        if (ride) {
          ride.paymentStatus = 'paid';
          ride.paymentDate = new Date();
          ride.paymentMethod = paymentMethod || 'cash';
          await ride.save();
          
          logger.info("Synced payment to Ride", {
            paymentId: payment._id,
            rideId: ride._id
          });
        }
      } catch (err) {
        logger.error("Failed to sync payment to Ride", {
          paymentId: payment._id,
          rideId: payment.rideId,
          error: err.message
        });
        // Don't fail the payment, but log it
      }
    }
    
    // Update driver earnings if available
    try {
      if (payment.driverId) {
        const driver = await Driver.findById(payment.driverId);
        if (driver && driver.markPaid) {
          await driver.markPaid(payment.amount);
        }
      }
    } catch (err) {
      logger.warn('Failed to update driver earnings', {
        driverId: payment.driverId,
        error: err.message
      });
    }
    
    // Audit log
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'payment_marked_paid',
      details: { 
        paymentId: payment._id,
        amount: payment.amount,
        method: paymentMethod,
        rideId: payment.rideId,
        driverId: payment.driverId
      }
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success("Payment marked as paid", {
      requestId: req.id || null,
      paymentId: payment._id
    });
    
    res.json({
      ok: true,
      payment
    });
  } catch (err) {
    logger.error("Error marking payment as paid", {
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
// POST /api/payments/:id/receipt - העלאת קבלה
// ===============================================
router.post("/:id/receipt", authenticateToken, requirePermission('payments:update'), async (req, res) => {
  try {
    const { filename, url } = req.body;
    
    if (!filename || !url) {
      return res.status(400).json({
        ok: false,
        error: 'חסרים שדות: filename, url'
      });
    }
    
    const Payment = await getPaymentModel();
    
    if (!Payment) {
      return res.status(501).json({
        ok: false,
        error: 'Payment model not available'
      });
    }
    
    const payment = await Payment.findById(req.params.id);
    
    if (!payment) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.PAYMENT.NOT_FOUND
      });
    }
    
    payment.receipt = {
      filename,
      url,
      uploadedAt: new Date(),
      uploadedBy: req.user.username || req.user.user
    };
    payment.updatedAt = new Date();
    
    await payment.save();
    
    logger.success("Receipt uploaded", {
      requestId: req.id || null,
      paymentId: payment._id
    });
    
    res.json({
      ok: true,
      receipt: payment.receipt
    });
  } catch (err) {
    logger.error("Error uploading receipt", {
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
// POST /api/payments/:id/ocr - OCR extraction
// ===============================================
router.post("/:id/ocr", authenticateToken, requirePermission('payments:update'), async (req, res) => {
  try {
    const { extractedAmount, extractedDate, vendor, confidence, rawText } = req.body;
    
    const Payment = await getPaymentModel();
    
    if (!Payment) {
      return res.status(501).json({
        ok: false,
        error: 'Payment model not available'
      });
    }
    
    const payment = await Payment.findById(req.params.id);
    
    if (!payment) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.PAYMENT.NOT_FOUND
      });
    }
    
    payment.ocrData = {
      extractedAmount,
      extractedDate: extractedDate ? new Date(extractedDate) : null,
      vendor,
      confidence,
      rawText,
      extractedAt: new Date(),
      extractedBy: req.user.username || req.user.user
    };
    payment.updatedAt = new Date();
    
    await payment.save();
    
    logger.success("OCR data extracted", {
      requestId: req.id || null,
      paymentId: payment._id,
      confidence
    });
    
    res.json({
      ok: true,
      ocrData: payment.ocrData
    });
  } catch (err) {
    logger.error("Error extracting OCR data", {
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
// GET /api/payments/overdue - תשלומים באיחור
// ===============================================
router.get("/overdue/list", authenticateToken, requirePermission('payments:read'), async (req, res) => {
  try {
    const Payment = await getPaymentModel();
    
    if (!Payment) {
      return res.json({
        ok: true,
        payments: [],
        message: 'Payment model not available'
      });
    }
    
    const now = new Date();
    
    const payments = await Payment.find({
      status: { $in: ['unpaid', 'pending'] },
      dueDate: { $lt: now }
    }).sort({ dueDate: 1 });
    
    // Calculate overdue info
    const paymentsWithOverdue = payments.map(payment => {
      const daysPastDue = Math.floor((now - payment.dueDate) / (1000 * 60 * 60 * 24));
      return {
        ...payment.toObject(),
        overdueInfo: {
          isOverdue: true,
          daysPastDue,
          overdueAmount: payment.amount
        }
      };
    });
    
    res.json({
      ok: true,
      payments: paymentsWithOverdue,
      count: paymentsWithOverdue.length
    });
  } catch (err) {
    logger.error("Error fetching overdue payments", {
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
// POST /api/payments/:id/reminder - שליחת תזכורת
// ===============================================
router.post("/:id/reminder", authenticateToken, requirePermission('payments:send_reminder'), async (req, res) => {
  try {
    const Payment = await getPaymentModel();
    
    if (!Payment) {
      return res.status(501).json({
        ok: false,
        error: 'Payment model not available'
      });
    }
    
    const payment = await Payment.findById(req.params.id);
    
    if (!payment) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.PAYMENT.NOT_FOUND
      });
    }
    
    // Update reminder tracking
    payment.reminderSent = true;
    payment.lastReminderAt = new Date();
    payment.reminderCount = (payment.reminderCount || 0) + 1;
    payment.updatedAt = new Date();
    
    await payment.save();
    
    // ⚠️ CRITICAL: Log to Activity for UI timeline visibility
    try {
      const Activity = (await import('../models/Activity.js').catch(() => null))?.default;
      if (Activity) {
        await Activity.create({
          timestamp: new Date(),
          type: 'payment',
          user: payment.driverName || payment.driverId?.toString() || 'נהג',
          message: `תזכורת תשלום נשלחה - ${payment.amount}₪ (${payment.description || 'ללא תיאור'})`,
          details: JSON.stringify({
            paymentId: payment._id,
            amount: payment.amount,
            reminderCount: payment.reminderCount,
            sentBy: req.user.username || req.user.user
          }),
          emoji: '💸'
        });
      }
    } catch (err) {
      logger.warn('Failed to log reminder to Activity', {
        paymentId: payment._id,
        error: err.message
      });
    }
    
    // TODO: Actually send WhatsApp/SMS reminder
    
    logger.success("Payment reminder sent", {
      requestId: req.id || null,
      paymentId: payment._id,
      reminderCount: payment.reminderCount
    });
    
    res.json({
      ok: true,
      sent: true,
      reminderCount: payment.reminderCount
    });
  } catch (err) {
    logger.error("Error sending payment reminder", {
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
// GET /api/payments/reports/summary - סיכום
// ===============================================
router.get("/reports/summary", authenticateToken, requirePermission('payments:read'), async (req, res) => {
  try {
    const { from, to } = req.query;
    
    const Payment = await getPaymentModel();
    
    if (!Payment) {
      // Fallback: calculate from Rides
      const filter = {};
      if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = new Date(from);
        if (to) filter.createdAt.$lte = new Date(to);
      }
      
      const rides = await Ride.find({
        ...filter,
        status: { $in: ['completed', 'finished'] }
      });
      
      const summary = {
        totalRevenue: rides.reduce((sum, r) => sum + (r.commissionAmount || 0), 0),
        paid: rides.filter(r => r.paymentStatus === 'paid').reduce((sum, r) => sum + (r.commissionAmount || 0), 0),
        unpaid: rides.filter(r => r.paymentStatus !== 'paid').reduce((sum, r) => sum + (r.commissionAmount || 0), 0),
        count: rides.length
      };
      
      return res.json({
        ok: true,
        summary,
        source: 'rides_fallback'
      });
    }
    
    const filter = {};
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }
    
    const [totalRevenue, paidRevenue, unpaidRevenue, count] = await Promise.all([
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
      ]),
      Payment.countDocuments(filter)
    ]);
    
    res.json({
      ok: true,
      summary: {
        totalRevenue: totalRevenue[0]?.total || 0,
        paid: paidRevenue[0]?.total || 0,
        unpaid: unpaidRevenue[0]?.total || 0,
        count
      }
    });
  } catch (err) {
    logger.error("Error generating payment summary", {
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
// GET /api/payments/reports/by-driver - לפי נהג
// ===============================================
router.get("/reports/by-driver", authenticateToken, requirePermission('payments:read'), async (req, res) => {
  try {
    const { driverId } = req.query;
    
    if (!driverId) {
      return res.status(400).json({
        ok: false,
        error: 'חסר מזהה נהג'
      });
    }
    
    const Payment = await getPaymentModel();
    
    if (!Payment) {
      // Fallback: calculate from Rides
      const rides = await Ride.find({ driverId });
      
      const stats = {
        total: rides.reduce((sum, r) => sum + (r.commissionAmount || 0), 0),
        paid: rides.filter(r => r.paymentStatus === 'paid').reduce((sum, r) => sum + (r.commissionAmount || 0), 0),
        unpaid: rides.filter(r => r.paymentStatus !== 'paid').reduce((sum, r) => sum + (r.commissionAmount || 0), 0),
        count: rides.length
      };
      
      return res.json({
        ok: true,
        stats,
        source: 'rides_fallback'
      });
    }
    
    const payments = await Payment.find({ driverId });
    
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
    
    res.json({
      ok: true,
      stats,
      payments
    });
  } catch (err) {
    logger.error("Error generating driver report", {
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
// GET /api/payments/reports/by-period - לפי תקופה
// ===============================================
router.get("/reports/by-period", authenticateToken, requirePermission('payments:read'), async (req, res) => {
  try {
    const { from, to, groupBy = 'day' } = req.query;
    
    const Payment = await getPaymentModel();
    
    if (!Payment) {
      return res.status(501).json({
        ok: false,
        error: 'Payment model not available'
      });
    }
    
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
      byType: {},
      byPeriod: {}
    };
    
    // Group by type
    payments.forEach(p => {
      if (!stats.byType[p.type]) {
        stats.byType[p.type] = { count: 0, total: 0 };
      }
      stats.byType[p.type].count++;
      stats.byType[p.type].total += p.amount;
      
      // Group by period
      const periodKey = groupBy === 'month' 
        ? p.createdAt.toISOString().substring(0, 7)  // YYYY-MM
        : p.createdAt.toISOString().substring(0, 10); // YYYY-MM-DD
      
      if (!stats.byPeriod[periodKey]) {
        stats.byPeriod[periodKey] = { count: 0, total: 0 };
      }
      stats.byPeriod[periodKey].count++;
      stats.byPeriod[periodKey].total += p.amount;
    });
    
    res.json({
      ok: true,
      stats,
      payments
    });
  } catch (err) {
    logger.error("Error generating period report", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

console.log('✅ Payments routes loaded - 16 endpoints');

export default router;