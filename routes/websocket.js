// ============================================================
// WEBSOCKET ROUTES
// Auto-generated from server.js refactoring
// ============================================================

import express from 'express';
import { authenticateToken, authenticateAdmin } from '../middlewares/auth.js';
import logger from '../utils/logger.js';
import websockets from '../utils/websockets.js';

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

// GET /api/websocket/stats
router.get("/websocket/stats", authenticateAdmin, (req, res) => {
  try {
    const stats = websockets.getWebSocketStats();
    res.json({
      ok: true,
      stats
    });
  } catch (err) {
    logger.error('Error getting WebSocket stats', { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


export default router;
