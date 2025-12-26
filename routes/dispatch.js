// ============================================================
// DISPATCH ROUTES
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
// 6 ENDPOINTS
// ============================================================

// GET /api/dispatch/status
router.get("/status", authenticateToken, async (req, res) => {
  try {
    const status = dispatchManager.getStatus();
    
    res.json({
      ok: true,
      status
    });
    
  } catch (err) {
    logger.error('Error getting dispatch status', { error: err.message });
    res.status(500).json({
      ok: false,
      error: 'Failed to get dispatch status'
    });
  }
});


// GET /api/dispatch/stats
router.get("/stats", authenticateToken, async (req, res) => {
  try {
    const stats = dispatchManager.getStats();
    
    res.json({
      ok: true,
      stats
    });
    
  } catch (err) {
    logger.error('Error getting dispatch stats', { error: err.message });
    res.status(500).json({
      ok: false,
      error: 'Failed to get dispatch stats'
    });
  }
});


// GET /api/dispatch/report
router.get("/report", authenticateToken, async (req, res) => {
  try {
    const report = dispatchManager.getFullReport();
    
    res.json({
      ok: true,
      report
    });
    
  } catch (err) {
    logger.error('Error getting dispatch report', { error: err.message });
    res.status(500).json({
      ok: false,
      error: 'Failed to get dispatch report'
    });
  }
});


// POST /api/dispatch/switch-mode
router.post("/switch-mode", authenticateToken, async (req, res) => {
  try {
    const { mode } = req.body;
    
    if (!mode) {
      return res.status(400).json({
        ok: false,
        error: 'Mode is required'
      });
    }
    
    const result = dispatchManager.switchMode(mode);
    
    logger.info('Dispatch mode switched', {
      by: req.user.phone,
      from: result.oldMode,
      to: result.newMode
    });
    
    res.json({
      ok: true,
      message: `Switched from ${result.oldMode} to ${result.newMode}`,
      result
    });
    
  } catch (err) {
    logger.error('Error switching dispatch mode', { error: err.message });
    res.status(400).json({
      ok: false,
      error: err.message
    });
  }
});


// POST /api/dispatch/reset-stats
router.post("/reset-stats", authenticateToken, async (req, res) => {
  try {
    dispatchManager.resetStats();
    
    logger.info('Dispatch stats reset', {
      by: req.user.phone
    });
    
    res.json({
      ok: true,
      message: 'Statistics reset successfully'
    });
    
  } catch (err) {
    logger.error('Error resetting dispatch stats', { error: err.message });
    res.status(500).json({
      ok: false,
      error: 'Failed to reset statistics'
    });
  }
});


// POST /api/dispatch/check-health
router.post("/check-health", authenticateToken, async (req, res) => {
  try {
    const botHealth = await dispatchManager.checkBotHealth();
    const twilioHealth = await dispatchManager.checkTwilioHealth();
    
    res.json({
      ok: true,
      health: {
        bot: botHealth ? 'online' : 'offline',
        twilio: twilioHealth ? 'online' : 'offline'
      },
      timestamp: new Date()
    });
    
  } catch (err) {
    logger.error('Error checking health', { error: err.message });
    res.status(500).json({
      ok: false,
      error: 'Failed to check health'
    });
  }
});


export default router;
