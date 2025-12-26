// ============================================================
// ACTIVITIES ROUTES
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
