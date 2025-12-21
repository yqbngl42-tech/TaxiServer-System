import express from 'express';
import { authenticateToken } from './auth-enhanced.js';
import { requirePermission } from '../../middleware/rbac.js';
import Ride from '../../models/Ride.js';
import Driver from '../../models/Driver.js';
import AuditLog from '../../models/AuditLog.js';

const router = express.Router();

// ===============================================
// GET ALL RIDES
// ===============================================
router.get('/', authenticateToken, requirePermission('rides:read'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.driverPhone) filter.driverPhone = req.query.driverPhone;
    if (req.query.q) {
      filter.$or = [
        { rideNumber: { $regex: req.query.q, $options: 'i' } },
        { customerName: { $regex: req.query.q, $options: 'i' } },
        { customerPhone: { $regex: req.query.q, $options: 'i' } }
      ];
    }
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }

    const [rides, total] = await Promise.all([
      Ride.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Ride.countDocuments(filter)
    ]);

    res.json({
      ok: true,
      data: {
        items: rides,
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
// GET SINGLE RIDE
// ===============================================
router.get('/:id', authenticateToken, requirePermission('rides:read'), async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נסיעה לא נמצאה' }
      });
    }
    
    res.json({ ok: true, data: { ride } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// CREATE RIDE
// ===============================================
router.post('/', authenticateToken, requirePermission('rides:create'), async (req, res) => {
  try {
    const { customerName, customerPhone, pickup, destination, price, notes } = req.body;
    
    if (!customerName || !customerPhone || !pickup || !destination || !price) {
      return res.status(400).json({
        ok: false,
        error: { code: 'MISSING_FIELDS', message: 'חסרים שדות חובה' }
      });
    }

    const rideNumber = `R${Date.now()}`;
    
    const ride = await Ride.create({
      rideNumber,
      customerName,
      customerPhone,
      pickup,
      destination,
      price,
      notes,
      actionHistory: [{
        action: 'created',
        performedBy: req.user.username,
        details: { createdBy: req.user.username }
      }],
      timeline: [{
        event: 'created',
        details: { by: req.user.username }
      }]
    });

    await AuditLog.create({
      userId: req.user.userId,
      username: req.user.username,
      action: 'ride_created',
      details: { rideId: ride._id, rideNumber }
    });
    
    res.json({ ok: true, data: { ride } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// UPDATE RIDE STATUS
// ===============================================
router.put('/:id/status', authenticateToken, requirePermission('rides:update'), async (req, res) => {
  try {
    const { status } = req.body;
    
    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נסיעה לא נמצאה' }
      });
    }

    ride.status = status;
    ride.updatedAt = new Date();
    
    ride.actionHistory.push({
      action: 'status_changed',
      performedBy: req.user.username,
      details: { oldStatus: ride.status, newStatus: status }
    });
    
    ride.timeline.push({
      event: status,
      details: { by: req.user.username }
    });
    
    if (status === 'finished') {
      ride.completedAt = new Date();
    }
    
    await ride.save();

    await AuditLog.create({
      userId: req.user.userId,
      username: req.user.username,
      action: 'ride_updated',
      details: { rideId: ride._id, status }
    });
    
    res.json({ ok: true, data: { ride } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// CANCEL RIDE
// ===============================================
router.post('/:id/cancel', authenticateToken, requirePermission('rides:cancel'), async (req, res) => {
  try {
    const { reason } = req.body;
    
    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נסיעה לא נמצאה' }
      });
    }

    ride.status = 'cancelled';
    ride.cancelReason = reason;
    ride.cancelledAt = new Date();
    ride.updatedAt = new Date();
    
    ride.actionHistory.push({
      action: 'cancelled',
      performedBy: req.user.username,
      details: { reason }
    });
    
    ride.timeline.push({
      event: 'cancelled',
      details: { reason, by: req.user.username }
    });
    
    await ride.save();

    await AuditLog.create({
      userId: req.user.userId,
      username: req.user.username,
      action: 'ride_cancelled',
      details: { rideId: ride._id, reason }
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
// REDISPATCH RIDE (ADVANCED)
// ===============================================
router.post('/:id/redispatch', authenticateToken, requirePermission('rides:update'), async (req, res) => {
  try {
    const { priority, notes, excludeDrivers } = req.body;
    
    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נסיעה לא נמצאה' }
      });
    }

    ride.status = 'created';
    ride.driverPhone = null;
    ride.driverName = null;
    ride.updatedAt = new Date();
    
    ride.actionHistory.push({
      action: 'redispatched',
      performedBy: req.user.username,
      details: { priority, notes, excludeDrivers }
    });
    
    ride.timeline.push({
      event: 'redispatched',
      details: { by: req.user.username, priority, notes }
    });
    
    await ride.save();

    await AuditLog.create({
      userId: req.user.userId,
      username: req.user.username,
      action: 'ride_updated',
      details: { rideId: ride._id, action: 'redispatch' }
    });
    
    res.json({ ok: true, data: { ride } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// LOCK/UNLOCK RIDE
// ===============================================
router.post('/:id/lock', authenticateToken, requirePermission('rides:update'), async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נסיעה לא נמצאה' }
      });
    }

    ride.status = 'locked';
    ride.updatedAt = new Date();
    
    ride.actionHistory.push({
      action: 'locked',
      performedBy: req.user.username
    });
    
    await ride.save();
    
    res.json({ ok: true, data: { ride } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

router.post('/:id/unlock', authenticateToken, requirePermission('rides:update'), async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נסיעה לא נמצאה' }
      });
    }

    ride.status = 'created';
    ride.updatedAt = new Date();
    
    ride.actionHistory.push({
      action: 'unlocked',
      performedBy: req.user.username
    });
    
    await ride.save();
    
    res.json({ ok: true, data: { ride } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// GET RIDE HISTORY
// ===============================================
router.get('/:id/history', authenticateToken, requirePermission('rides:read'), async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id).select('actionHistory');
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נסיעה לא נמצאה' }
      });
    }
    
    res.json({ ok: true, data: { items: ride.actionHistory.reverse() } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// CALCULATE ADVANCED PRICING
// ===============================================
router.post('/:id/pricing', authenticateToken, requirePermission('rides:update'), async (req, res) => {
  try {
    const { basePrice, distancePrice, timePrice, surgeMultiplier, discount } = req.body;
    
    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נסיעה לא נמצאה' }
      });
    }

    const totalBeforeDiscount = (basePrice + distancePrice + timePrice) * (surgeMultiplier || 1);
    const finalTotal = totalBeforeDiscount - (discount || 0);
    
    ride.pricingDetails = {
      basePrice,
      distancePrice,
      timePrice,
      surgeMultiplier: surgeMultiplier || 1,
      discount: discount || 0,
      totalBeforeDiscount,
      finalTotal,
      calculatedAt: new Date()
    };
    
    ride.price = finalTotal;
    ride.updatedAt = new Date();
    
    await ride.save();
    
    res.json({ ok: true, data: { pricingDetails: ride.pricingDetails } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// CREATE RECURRING RIDE
// ===============================================
router.post('/recurring', authenticateToken, requirePermission('rides:create'), async (req, res) => {
  try {
    const { customerName, customerPhone, pickup, destination, price, frequency, time, endDate } = req.body;
    
    const rideNumber = `RR${Date.now()}`;
    
    const ride = await Ride.create({
      rideNumber,
      customerName,
      customerPhone,
      pickup,
      destination,
      price,
      recurring: {
        enabled: true,
        frequency,
        time,
        endDate: new Date(endDate),
        nextOccurrence: new Date()
      }
    });
    
    res.json({ ok: true, data: { ride } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// REPORT ISSUE
// ===============================================
router.post('/:id/issues', authenticateToken, requirePermission('rides:update'), async (req, res) => {
  try {
    const { type, description, severity } = req.body;
    
    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נסיעה לא נמצאה' }
      });
    }

    ride.issues.push({
      type,
      description,
      severity: severity || 'medium',
      reportedBy: req.user.username
    });
    
    ride.actionHistory.push({
      action: 'issue_reported',
      performedBy: req.user.username,
      details: { type, severity }
    });
    
    await ride.save();
    
    res.json({ ok: true, data: { issues: ride.issues } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// GET TIMELINE
// ===============================================
router.get('/:id/timeline', authenticateToken, requirePermission('rides:read'), async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id).select('timeline');
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נסיעה לא נמצאה' }
      });
    }
    
    res.json({ ok: true, data: { items: ride.timeline } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

export default router;
