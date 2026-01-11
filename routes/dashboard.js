// ============================================================
// DASHBOARD ROUTES - ENHANCED VERSION
// Merged from routes/dashboard.js + v2/dashboard.js
// ============================================================

import express from 'express';
import { authenticateToken } from '../middlewares/auth.js';
import { requirePermission } from '../middlewares/rbac.js';
import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import RegistrationSession from '../models/RegistrationSession.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Error messages
const ERRORS = {
  DASHBOARD: {
    STATS_ERROR: 'שגיאה בטעינת נתוני Dashboard'
  },
  SERVER: {
    DATABASE: 'שגיאת בסיס נתונים',
    UNKNOWN: 'שגיאה לא צפויה'
  }
};

// ============================================================
// DASHBOARD ENDPOINTS
// ============================================================

// ===============================================
// GET /api/dashboard/summary - Dashboard comprehensive stats
// ===============================================
router.get('/summary', authenticateToken, requirePermission('dashboard:read'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Run all queries in parallel for performance
    const [
      // Rides stats
      totalRides,
      activeRides,
      lockedRides,
      completedRides,
      cancelledRides,
      todayRides,
      
      // Drivers stats
      totalDrivers,
      activeDrivers,
      blockedDrivers,
      
      // Registrations
      pendingRegistrations,
      approvedRegistrationsToday,
      
      // Revenue
      todayRevenue,
      monthRevenue,
      
      // Recent data
      recentRides,
      recentDrivers
    ] = await Promise.all([
      // Rides counts
      Ride.countDocuments(),
      Ride.countDocuments({ 
        status: { $in: ['sent', 'assigned', 'approved', 'enroute', 'arrived'] } 
      }),
      Ride.countDocuments({ locked: true }),
      Ride.countDocuments({ status: 'finished' }),
      Ride.countDocuments({ status: 'cancelled' }),
      Ride.countDocuments({
        createdAt: { $gte: today, $lt: tomorrow }
      }),
      
      // Drivers counts
      Driver.countDocuments(),
      Driver.countDocuments({ isActive: true, isBlocked: { $ne: true } }), // ✅ FIX: exclude blocked
      Driver.countDocuments({ isBlocked: true }),
      
      // Registrations
      RegistrationSession.countDocuments({ status: 'pending' }),
      RegistrationSession.countDocuments({
        status: 'approved',
        updatedAt: { $gte: today, $lt: tomorrow }
      }),
      
      // Revenue - Today
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
            total: { $sum: '$price' },
            commission: { $sum: '$commission' }
          }
        }
      ]),
      
      // Revenue - This month
      Ride.aggregate([
        {
          $match: {
            createdAt: { 
              $gte: new Date(today.getFullYear(), today.getMonth(), 1),
              $lt: tomorrow
            },
            status: { $in: ['finished', 'approved'] }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$price' },
            commission: { $sum: '$commission' }
          }
        }
      ]),
      
      // Recent rides (last 10)
      Ride.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select('rideNumber customerName pickup destination status driverName price createdAt')
        .lean(),
      
      // Recently active drivers (last 5)
      Driver.find({ isActive: true })
        .sort({ updatedAt: -1 })
        .limit(5)
        .select('name phone driverId rating totalRides')
        .lean()
    ]);
    
    // Prepare response
    const response = {
      ok: true,
      data: {
        // Overview stats
        overview: {
          todayRides,
          activeDrivers,
          pendingRegistrations,
          todayRevenue: todayRevenue[0]?.total || 0,
          todayCommission: todayRevenue[0]?.commission || 0
        },
        
        // Detailed rides breakdown
        rides: {
          total: totalRides,
          active: activeRides,
          locked: lockedRides,
          completed: completedRides,
          cancelled: cancelledRides,
          today: todayRides
        },
        
        // Detailed drivers breakdown
        drivers: {
          total: totalDrivers,
          active: activeDrivers,
          blocked: blockedDrivers,
          inactive: totalDrivers - activeDrivers - blockedDrivers
        },
        
        // Registrations
        registrations: {
          pending: pendingRegistrations,
          approvedToday: approvedRegistrationsToday
        },
        
        // Revenue breakdown
        revenue: {
          today: {
            total: todayRevenue[0]?.total || 0,
            commission: todayRevenue[0]?.commission || 0
          },
          month: {
            total: monthRevenue[0]?.total || 0,
            commission: monthRevenue[0]?.commission || 0
          }
        },
        
        // Recent activity
        recent: {
          rides: recentRides,
          drivers: recentDrivers
        },
        
        // System health
        system: {
          database: 'connected',
          timestamp: new Date()
        }
      }
    };
    
    logger.info('Dashboard summary fetched', {
      requestId: req.id || null, // ✅ FIX: fallback if no middleware sets req.id
      userId: req.user.userId
    });
    
    res.json(response);
    
  } catch (err) {
    logger.error('Error fetching dashboard summary', {
      requestId: req.id || null,
      error: err.message,
      stack: err.stack
    });
    
    res.status(500).json({
      ok: false,
      error: ERRORS.DASHBOARD.STATS_ERROR
    });
  }
});

// ===============================================
// GET /api/dashboard/stats - Alias for /summary (backward compatibility)
// ===============================================
router.get('/stats', authenticateToken, requirePermission('dashboard:read'), (req, res) => {
  // ✅ FIX: Use redirect instead of url manipulation for cleaner approach
  return res.redirect(307, '/api/dashboard/summary');
});

// ===============================================
// GET /api/dashboard/quick - Quick stats (minimal data)
// ===============================================
router.get('/quick', authenticateToken, requirePermission('dashboard:read'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const [
      todayRides,
      activeDrivers,
      pendingRegistrations
    ] = await Promise.all([
      Ride.countDocuments({
        createdAt: { $gte: today, $lt: tomorrow }
      }),
      Driver.countDocuments({ isActive: true }),
      RegistrationSession.countDocuments({ status: 'pending' })
    ]);
    
    res.json({
      ok: true,
      data: {
        todayRides,
        activeDrivers,
        pendingRegistrations
      }
    });
    
  } catch (err) {
    logger.error('Error fetching quick stats', {
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
// GET /api/dashboard/trends - Trends over time
// ===============================================
router.get('/trends', authenticateToken, requirePermission('dashboard:read'), async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const daysNum = Math.min(parseInt(days) || 7, 30); // Max 30 days
    
    // TODO: PERFORMANCE OPTIMIZATION NEEDED FOR PRODUCTION
    // Current implementation: N queries × days (60 queries for 30 days)
    // Recommended: Single aggregation with $group by day
    // Example:
    // Ride.aggregate([
    //   { $match: { createdAt: { $gte: startDate } } },
    //   { $group: { 
    //     _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
    //     rides: { $sum: 1 },
    //     revenue: { $sum: "$price" }
    //   }},
    //   { $sort: { _id: 1 } }
    // ])
    
    const trends = [];
    
    for (let i = daysNum - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const [ridesCount, revenue] = await Promise.all([
        Ride.countDocuments({
          createdAt: { $gte: date, $lt: nextDate }
        }),
        Ride.aggregate([
          {
            $match: {
              createdAt: { $gte: date, $lt: nextDate },
              status: { $in: ['finished', 'approved'] }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$price' }
            }
          }
        ])
      ]);
      
      trends.push({
        date: date.toISOString().split('T')[0],
        rides: ridesCount,
        revenue: revenue[0]?.total || 0
      });
    }
    
    logger.info('Dashboard trends fetched', {
      requestId: req.id || null,
      days: daysNum
    });
    
    res.json({
      ok: true,
      data: {
        period: `${daysNum} days`,
        trends
      }
    });
    
  } catch (err) {
    logger.error('Error fetching trends', {
      requestId: req.id || null,
      error: err.message
    });
    
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// EXPORT
// ============================================================

export default router;