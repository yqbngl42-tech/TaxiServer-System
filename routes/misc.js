// ============================================================
// MISC ROUTES
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
// 5 ENDPOINTS
// ============================================================

// GET /api/dashboard/stats
router.get("/dashboard/stats", authenticateToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayRides = await Ride.countDocuments({
      createdAt: { $gte: today }
    });
    
    const activeDrivers = await Driver.countDocuments({
      isActive: true,
      isBlocked: false
    });
    
    const todayRevenue = await Ride.aggregate([
      {
        $match: {
          createdAt: { $gte: today },
          status: 'finished'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$price' }
        }
      }
    ]);
    
    const pendingApprovals = await Driver.countDocuments({
      registrationStatus: 'pending'
    });
    
    const activeRides = await Ride.countDocuments({
      status: { $in: ['assigned', 'approved', 'enroute', 'arrived'] }
    });
    
    const pendingDrivers = await Driver.countDocuments({
      registrationStatus: 'pending'
    });
    
    res.json({
      todayRides,
      activeDrivers,
      todayRevenue: todayRevenue[0]?.total || 0,
      pendingApprovals,
      activeRides,
      pendingDrivers
    });
    
  } catch (error) {
    logger.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/dashboard/recent-activity
router.get("/dashboard/recent-activity", authenticateToken, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const activities = await Activity.find({})
      .sort('-timestamp')
      .limit(parseInt(limit));
    
    res.json(activities);
    
  } catch (error) {
    logger.error('Error fetching recent activity:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/activity/recent
router.get("/activity/recent", authenticateToken, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const activities = await Activity.find({})
      .sort('-timestamp')
      .limit(parseInt(limit));
    
    res.json(activities);
    
  } catch (error) {
    logger.error('Error fetching recent activity:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/activity/recent
router.get("/activity/recent", authenticateToken, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const activities = await Activity.find({})
      .sort('-timestamp')
      .limit(parseInt(limit));
    
    res.json(activities);
    
  } catch (error) {
    logger.error('Error fetching activities:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/dashboard/stats
router.get("/dashboard/stats", authenticateToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayRides = await Ride.countDocuments({ createdAt: { $gte: today } });
    const activeDrivers = await Driver.countDocuments({ isActive: true, isBlocked: false });
    
    const revenue = await Ride.aggregate([
      { $match: { createdAt: { $gte: today }, status: 'finished' } },
      { $group: { _id: null, total: { $sum: '$price' } } }
    ]);
    
    const activeRides = await Ride.countDocuments({
      status: { $in: ['assigned', 'approved', 'enroute', 'arrived'] }
    });
    
    res.json({
      todayRides,
      activeDrivers,
      todayRevenue: revenue[0]?.total || 0,
      activeRides,
      pendingApprovals: 0
    });
    
  } catch (error) {
    logger.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: error.message });
  }
});


export default router;
