// ===============================================
// 🚗 RIDES ROUTES - NEW CLEAN API
// ===============================================

import express from 'express';
import { authenticateToken } from './auth.js';
import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import logger from '../utils/logger.js';
import rideNumberGenerator from '../utils/rideNumberGenerator.js';
import dispatchManager from '../utils/dispatchManager.js';
import websockets from '../utils/websockets.js';

const router = express.Router();

// ===============================================
// GET /rides - Get all rides (with pagination)
// ===============================================
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;
    
    // Filters
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.driverPhone) {
      filter.driverPhone = req.query.driverPhone;
    }
    if (req.query.fromDate) {
      filter.createdAt = { $gte: new Date(req.query.fromDate) };
    }
    if (req.query.toDate) {
      filter.createdAt = { 
        ...filter.createdAt, 
        $lte: new Date(req.query.toDate) 
      };
    }
    
    // Search
    if (req.query.search) {
      const search = req.query.search;
      filter.$or = [
        { rideNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Query with pagination
    const [rides, total] = await Promise.all([
      Ride.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean(),
      Ride.countDocuments(filter)
    ]);
    
    logger.info('Rides fetched (new API)', { 
      page, 
      limit, 
      total, 
      count: rides.length 
    });
    
    res.json({
      ok: true,
      data: rides,
      meta: {
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      }
    });
  } catch (err) {
    logger.error('Error fetching rides (new API)', { 
      error: err.message 
    });
    
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'שגיאה בטעינת נסיעות'
      }
    });
  }
});

// ===============================================
// GET /rides/:id - Get single ride
// ===============================================
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id).lean();
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'נסיעה לא נמצאה'
        }
      });
    }
    
    res.json({
      ok: true,
      data: ride
    });
  } catch (err) {
    logger.error('Error fetching ride (new API)', { 
      error: err.message 
    });
    
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'שגיאה בטעינת נסיעה'
      }
    });
  }
});

// ===============================================
// POST /rides - Create new ride
// ===============================================
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { 
      customerName, 
      customerPhone, 
      pickup, 
      destination, 
      scheduledTime, 
      notes, 
      price = 50
    } = req.body;

    // Validation
    if (!customerName || !customerPhone || !pickup || !destination) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'שדות חובה: שם, טלפון, איסוף, יעד'
        }
      });
    }

    const phoneRegex = /^(0|\+972)?5\d{8}$/;
    if (!phoneRegex.test(customerPhone.replace(/[\s\-]/g, ''))) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_PHONE',
          message: 'מספר טלפון לא תקין'
        }
      });
    }

    // Generate ride number
    const rideNumber = await rideNumberGenerator.formatRideNumber();
    
    // Create ride
    const ride = await Ride.create({
      rideNumber,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickup: pickup.trim(),
      destination: destination.trim(),
      scheduledTime: scheduledTime || null,
      notes: notes || null,
      price: price,
      commissionRate: 0.10,
      commissionAmount: Math.round(price * 0.10),
      status: 'created',
      rideType: 'regular',
      groupChat: 'default',
      createdBy: 'admin',
      history: [{ 
        status: 'created', 
        by: 'admin',
        timestamp: new Date(),
        details: 'נסיעה נוצרה מממשק הניהול החדש'
      }]
    });

    logger.success('Ride created (new API)', {
      rideId: ride._id,
      rideNumber: ride.rideNumber
    });

    // Smart dispatch
    dispatchManager.sendRide(ride)
      .then(result => {
        logger.success('Ride dispatched', {
          rideNumber: ride.rideNumber,
          method: result.method
        });
      })
      .catch(err => {
        logger.error('Failed to dispatch ride', {
          rideNumber: ride.rideNumber,
          error: err.message
        });
      });

    // WebSocket update
    if (websockets) {
      websockets.emitNewRide(ride);
    }

    res.json({
      ok: true,
      data: ride,
      meta: {
        message: 'נסיעה נוצרה בהצלחה'
      }
    });
  } catch (err) {
    logger.error('Error creating ride (new API)', { 
      error: err.message 
    });
    
    res.status(500).json({
      ok: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'שגיאה ביצירת נסיעה'
      }
    });
  }
});

// ===============================================
// POST /rides/:id/cancel - Cancel ride
// ===============================================
router.post('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const { reason } = req.body;
    
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'נסיעה לא נמצאה'
        }
      });
    }
    
    // Check if can cancel
    const canCancel = ['created', 'sent', 'locked', 'assigned'].includes(ride.status);
    if (!canCancel) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'CANNOT_CANCEL',
          message: 'לא ניתן לבטל נסיעה בסטטוס זה'
        }
      });
    }
    
    // Update ride
    ride.status = 'cancelled';
    ride.history.push({
      status: 'cancelled',
      by: 'admin',
      timestamp: new Date(),
      details: reason || 'בוטל על ידי מנהל'
    });
    
    await ride.save();
    
    logger.action('Ride cancelled (new API)', {
      rideId: ride._id,
      rideNumber: ride.rideNumber,
      reason
    });
    
    // WebSocket update
    if (websockets) {
      websockets.emitRideUpdate(ride);
    }
    
    res.json({
      ok: true,
      data: ride,
      meta: {
        message: 'נסיעה בוטלה בהצלחה'
      }
    });
  } catch (err) {
    logger.error('Error cancelling ride (new API)', { 
      error: err.message 
    });
    
    res.status(500).json({
      ok: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'שגיאה בביטול נסיעה'
      }
    });
  }
});

// ===============================================
// POST /rides/:id/redispatch - Redispatch ride
// ===============================================
router.post('/:id/redispatch', authenticateToken, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'נסיעה לא נמצאה'
        }
      });
    }
    
    // Reset ride status
    ride.status = 'created';
    ride.driverPhone = null;
    ride.driverName = null;
    ride.lockedBy = null;
    ride.lockedAt = null;
    
    ride.history.push({
      status: 'redispatch',
      by: 'admin',
      timestamp: new Date(),
      details: 'נשלח מחדש על ידי מנהל'
    });
    
    await ride.save();
    
    // Redispatch
    await dispatchManager.sendRide(ride);
    
    logger.action('Ride redispatched (new API)', {
      rideId: ride._id,
      rideNumber: ride.rideNumber
    });
    
    // WebSocket update
    if (websockets) {
      websockets.emitRideUpdate(ride);
    }
    
    res.json({
      ok: true,
      data: ride,
      meta: {
        message: 'נסיעה נשלחה מחדש'
      }
    });
  } catch (err) {
    logger.error('Error redispatching ride (new API)', { 
      error: err.message 
    });
    
    res.status(500).json({
      ok: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'שגיאה בשליחה מחדש'
      }
    });
  }
});

// ===============================================
// POST /rides/:id/assign - Assign ride to driver
// ===============================================
router.post('/:id/assign', authenticateToken, async (req, res) => {
  try {
    const { driverId } = req.body;
    
    const ride = await Ride.findById(req.params.id);
    const driver = await Driver.findById(driverId);
    
    if (!ride || !driver) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'נסיעה או נהג לא נמצאו'
        }
      });
    }
    
    // Update ride
    ride.status = 'assigned';
    ride.driverPhone = driver.phone;
    ride.driverName = driver.name;
    
    ride.history.push({
      status: 'assigned',
      by: 'admin',
      timestamp: new Date(),
      details: `שובץ לנהג ${driver.name}`
    });
    
    await ride.save();
    
    logger.action('Ride assigned (new API)', {
      rideId: ride._id,
      driverId: driver._id
    });
    
    // WebSocket update
    if (websockets) {
      websockets.emitRideUpdate(ride);
    }
    
    res.json({
      ok: true,
      data: ride,
      meta: {
        message: 'נסיעה שובצה בהצלחה'
      }
    });
  } catch (err) {
    logger.error('Error assigning ride (new API)', { 
      error: err.message 
    });
    
    res.status(500).json({
      ok: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'שגיאה בשיבוץ נסיעה'
      }
    });
  }
});

export default router;
