// ============================================================
// ANALYTICS ROUTES
// Auto-generated from server.js refactoring
// ============================================================

import express from 'express';
import { Driver, Ride } from '../models/index.js';
import { authenticateToken } from '../middlewares/auth.js';
import logger from '../utils/logger.js';

// Import what you need (adjust based on actual usage)
// import Ride from '../models/Ride.js';
// import Driver from '../models/Driver.js';
// import { authenticateToken } from '../middlewares/auth.js';
// import logger from '../utils/logger.js';

const router = express.Router();

const ERRORS = {
  SERVER: {
    UNKNOWN: 'שגיאת שרת',
    DATABASE: 'שגיאת מסד נתונים',
    INTERNAL: 'שגיאה פנימית'
  },
  AUTH: {
    UNAUTHORIZED: 'לא מורשה',
    FORBIDDEN: 'אין הרשאה',
    INVALID_TOKEN: 'טוקן לא תקין'
  },
  GROUP: {
    NAME_EXISTS: 'שם הקבוצה כבר קיים',
    NOT_FOUND: 'קבוצה לא נמצאה',
    INVALID: 'קבוצה לא תקינה'
  },
  DRIVER: {
    NOT_FOUND: 'נהג לא נמצא',
    ALREADY_EXISTS: 'נהג כבר קיים',
    INACTIVE: 'נהג לא פעיל'
  },
  RIDE: {
    NOT_FOUND: 'נסיעה לא נמצאה',
    INVALID_STATUS: 'סטטוס לא תקין',
    ALREADY_ASSIGNED: 'נסיעה כבר משובצת'
  },
  PAYMENT: {
    NOT_FOUND: 'תשלום לא נמצא',
    ALREADY_PAID: 'תשלום כבר בוצע',
    INVALID_AMOUNT: 'סכום לא תקין'
  },
  VALIDATION: {
    MISSING_FIELDS: 'שדות חובה חסרים',
    INVALID_FORMAT: 'פורמט לא תקין',
    INVALID_DATA: 'נתונים לא תקינים'
  }
};


// ============================================================
// 2 ENDPOINTS
// ============================================================

// GET /api/analytics
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { period = '7days' } = req.query;
    
    const now = new Date();
    const periods = {
      '24hours': new Date(now - 24 * 60 * 60 * 1000),
      '7days': new Date(now - 7 * 24 * 60 * 60 * 1000),
      '30days': new Date(now - 30 * 24 * 60 * 60 * 1000),
      '90days': new Date(now - 90 * 24 * 60 * 60 * 1000)
    };
    const startDate = periods[period] || periods['7days'];
    
    // Rides by status
    const ridesByStatus = await Ride.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // Revenue
    const revenue = await Ride.aggregate([
      { 
        $match: { 
          createdAt: { $gte: startDate },
          status: { $in: ['finished', 'commission_paid'] }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$price' },
          totalCommission: { $sum: '$commissionAmount' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Top drivers
    const topDrivers = await Ride.aggregate([
      { 
        $match: { 
          createdAt: { $gte: startDate },
          status: 'finished',
          driverPhone: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$driverPhone',
          ridesCount: { $sum: 1 },
          totalRevenue: { $sum: '$price' }
        }
      },
      { $sort: { ridesCount: -1 } },
      { $limit: 10 }
    ]);
    
    // Add driver names
    for (const driver of topDrivers) {
      const driverDoc = await Driver.findOne({ phone: driver._id });
      driver.name = driverDoc?.name || 'לא ידוע';
    }
    
    res.json({
      ok: true,
      period,
      analytics: {
        ridesByStatus,
        revenue: revenue[0] || { totalRevenue: 0, totalCommission: 0, count: 0 },
        topDrivers
      }
    });
  } catch (err) {
    logger.error("Error getting analytics", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// GET /api/statistics
router.get("/api/statistics", authenticateToken, async (req, res) => {
  try {
    // Count rides by status
    const ridesCount = await Ride.countDocuments();
    const activeRides = await Ride.countDocuments({ 
      status: { $in: ['sent', 'approved', 'enroute'] } 
    });
    const finishedToday = await Ride.countDocuments({
      status: 'finished',
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
    });
    
    // Count drivers
    const driversCount = await Driver.countDocuments();
    const activeDrivers = await Driver.countDocuments({ isActive: true });
    
    // Revenue today
    const revenueToday = await Ride.aggregate([
      {
        $match: {
          status: 'finished',
          createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$price' },
          commission: { $sum: '$commissionAmount' }
        }
      }
    ]);
    
    const todayRevenue = revenueToday[0] || { total: 0, commission: 0 };
    
    res.json({
      ok: true,
      stats: {
        rides: {
          total: ridesCount,
          active: activeRides,
          finishedToday
        },
        drivers: {
          total: driversCount,
          active: activeDrivers
        },
        revenue: {
          today: todayRevenue.total,
          commission: todayRevenue.commission
        }
      }
    });
  } catch (err) {
    logger.error("Error getting statistics", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});


export default router;
