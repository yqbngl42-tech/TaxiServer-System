import express from 'express';
import { authenticateToken } from './auth.js';
import Ride from '../../models/Ride.js';
import Driver from '../../models/Driver.js';
import rideNumberGenerator from '../../utils/rideNumberGenerator.js';
import dispatchManager from '../../utils/dispatchManager.js';

const router = express.Router();

// GET /api/v2/rides
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.driverPhone) filter.driverPhone = req.query.driverPhone;
    if (req.query.from) filter.createdAt = { $gte: new Date(req.query.from) };
    if (req.query.to) filter.createdAt = { ...filter.createdAt, $lte: new Date(req.query.to) };
    if (req.query.q) {
      filter.$or = [
        { rideNumber: { $regex: req.query.q, $options: 'i' } },
        { customerName: { $regex: req.query.q, $options: 'i' } },
        { customerPhone: { $regex: req.query.q, $options: 'i' } }
      ];
    }
    
    const [items, total] = await Promise.all([
      Ride.find(filter).sort({ createdAt: -1 }).limit(limit).skip(skip).lean(),
      Ride.countDocuments(filter)
    ]);
    
    res.json({
      ok: true,
      data: {
        items,
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

// GET /api/v2/rides/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id).lean();
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
      error: { code: 'DATABASE_ERROR', message: err.message }
    });
  }
});

// POST /api/v2/rides
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { customerName, customerPhone, pickup, destination, price = 50, notes } = req.body;
    
    if (!customerName || !customerPhone || !pickup || !destination) {
      return res.status(400).json({
        ok: false,
        error: { code: 'MISSING_FIELDS', message: 'חסרים שדות חובה' }
      });
    }
    
    const rideNumber = await rideNumberGenerator.formatRideNumber();
    
    const ride = await Ride.create({
      rideNumber,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickup: pickup.trim(),
      destination: destination.trim(),
      price,
      notes: notes || null,
      commissionRate: 0.10,
      commissionAmount: Math.round(price * 0.10),
      status: 'created',
      createdBy: 'admin',
      history: [{ status: 'created', by: 'admin', timestamp: new Date() }]
    });
    
    // Dispatch async
    dispatchManager.sendRide(ride).catch(err => console.error('Dispatch failed:', err));
    
    res.json({ ok: true, data: { ride } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// PUT /api/v2/rides/:id/status
router.put('/:id/status', authenticateToken, async (req, res) => {
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
    ride.history.push({ status, by: 'admin', timestamp: new Date() });
    await ride.save();
    
    res.json({ ok: true, data: { ride } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// POST /api/v2/rides/:id/cancel
router.post('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'נסיעה לא נמצאה' }
      });
    }
    
    ride.status = 'cancelled';
    ride.history.push({ status: 'cancelled', by: 'admin', timestamp: new Date(), details: req.body.reason });
    await ride.save();
    
    res.json({ ok: true, data: { ride } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// POST /api/v2/rides/:id/redispatch
router.post('/:id/redispatch', authenticateToken, async (req, res) => {
  try {
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
    ride.lockedBy = null;
    ride.lockedAt = null;
    ride.history.push({ status: 'redispatch', by: 'admin', timestamp: new Date() });
    await ride.save();
    
    await dispatchManager.sendRide(ride);
    
    res.json({ ok: true, data: { ride } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

export default router;
