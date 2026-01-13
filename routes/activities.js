// ============================================================
// ACTIVITIES ROUTES
// Auto-generated from server.js refactoring
// ============================================================

import express from 'express';
import { Activity, Driver, Ride } from '../models/index.js';
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
// 1 ENDPOINTS
// ============================================================

// GET /api/activities
router.get("/", authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    
    const activities = await Activity.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    
    res.json({
      ok: true,
      activities
    });
  } catch (err) {
    logger.error("Error getting activities", {
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
