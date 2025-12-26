// ============================================================
// PAYMENTS ROUTES
// Auto-generated from server.js refactoring
// ============================================================

import express from 'express';

// Import what you need (adjust based on actual usage)
// import Ride from '../models/Ride.js';
// import Driver from '../models/Driver.js';
// import { authenticateToken } from '../middlewares/auth.js';
// import logger from '../utils/logger.js';

const router = express.Router();

// ============================================================
// 2 ENDPOINTS
// ============================================================

// GET /api/payments
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { status, method, limit = 50, sort = '-createdAt' } = req.query;
    
    let query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (method) {
      query.paymentMethod = method;
    }
    
    const rides = await Ride.find(query)
      .populate('driver', 'name phone')
      .sort(sort)
      .limit(parseInt(limit))
      .select('rideNumber customer driver price paymentMethod status createdAt');
    
    const payments = rides.map(ride => ({
      _id: ride._id,
      rideId: ride.rideNumber,
      customer: ride.customer,
      driver: ride.driver,
      amount: ride.price,
      method: ride.paymentMethod || 'cash',
      status: ride.status === 'completed' ? 'completed' : 'pending',
      createdAt: ride.createdAt
    }));
    
    res.json(payments);
  } catch (error) {
    logger.error('Error fetching payments:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/payments
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { status, method, limit = 50, sort = '-createdAt' } = req.query;
    
    let query = {};
    
    if (status) {
      if (status === 'completed') {
        query.status = 'finished';
      } else if (status === 'pending') {
        query.status = { $in: ['created', 'assigned', 'approved', 'enroute', 'arrived'] };
      } else if (status === 'failed') {
        query.status = 'cancelled';
      }
    }
    
    if (method) {
      query.paymentMethod = method;
    }
    
    const rides = await Ride.find(query)
      .populate('driverId', 'name phone')
      .sort(sort)
      .limit(parseInt(limit))
      .select('rideNumber customerName customerPhone driverId price paymentMethod status createdAt');
    
    const payments = rides.map(ride => ({
      _id: ride._id,
      rideId: ride.rideNumber,
      customer: {
        name: ride.customerName,
        phone: ride.customerPhone
      },
      driver: ride.driverId ? {
        name: ride.driverId.name,
        phone: ride.driverId.phone
      } : null,
      amount: ride.price || 0,
      method: ride.paymentMethod || 'cash',
      status: ride.status === 'finished' ? 'completed' : 
              ride.status === 'cancelled' ? 'failed' : 'pending',
      createdAt: ride.createdAt
    }));
    
    res.json(payments);
    
  } catch (error) {
    logger.error('Error fetching payments:', error);
    res.status(500).json({ error: error.message });
  }
});


export default router;
