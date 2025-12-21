// ===============================================
// 📊 DASHBOARD ROUTES - NEW CLEAN API
// ===============================================

import express from 'express';
import { authenticateToken } from './auth.js';
import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import RegistrationSession from '../models/RegistrationSession.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ===============================================
// GET /dashboard/summary - Dashboard summary stats
// ===============================================
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Run all queries in parallel
    const [
      todayRides,
      activeDrivers,
      pendingRegistrations,
      todayRevenue,
      recentRides
    ] = await Promise.all([
      // Today's rides count
      Ride.countDocuments({
        createdAt: { $gte: today, $lt: tomorrow }
      }),
      
      // Active drivers count
      Driver.countDocuments({ isActive: true }),
      
      // Pending registrations count
      RegistrationSession.countDocuments({ 
        status: 'pending' 
      }),
      
      // Today's revenue
      Ride.aggregate([
        {
          $match: {
            createdAt: { $gte: today, $lt: tomorrow },
            status: { $in: ['finished', 'approved'] }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$price' }
          }
        }
      ]),
      
      // Recent rides (last 10)
      Ride.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select('rideNumber customerName pickup destination status driverName createdAt')
        .lean()
    ]);
    
    res.json({
      ok: true,
      data: {
        stats: {
          todayRides,
          activeDrivers,
          pendingRegistrations,
          todayRevenue: todayRevenue[0]?.total || 0
        },
        recentRides
      }
    });
    
  } catch (err) {
    logger.error('Error fetching dashboard summary', { 
      error: err.message 
    });
    
    res.status(500).json({
      ok: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'שגיאה בטעינת נתוני Dashboard'
      }
    });
  }
});

export default router;
