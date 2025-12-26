// ============================================================
// SYSTEM ROUTES
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
// 9 ENDPOINTS
// ============================================================

// GET /api/system/logs
router.get("/logs", authenticateToken, async (req, res) => {
  try {
    const { level, limit = 100 } = req.query;
    
    let query = {};
    if (level && level !== 'all') {
      query.level = level;
    }
    
    // Get from activities
    const logs = await Activity.find(query)
      .sort('-createdAt')
      .limit(parseInt(limit))
      .select('createdAt type description metadata level');
    
    const formattedLogs = logs.map(log => ({
      timestamp: log.createdAt,
      level: log.metadata?.level || 'info',
      message: log.description,
      meta: log.metadata
    }));
    
    res.json(formattedLogs);
  } catch (error) {
    logger.error('Error fetching system logs:', error);
    res.status(500).json({ error: error.message });
  }
});


// DELETE /api/system/logs
router.delete("/logs", authenticateToken, async (req, res) => {
  try {
    // Clear old logs (older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const result = await Activity.deleteMany({
      createdAt: { $lt: thirtyDaysAgo }
    });
    
    logger.info('Logs cleared', { deleted: result.deletedCount });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    logger.error('Error clearing logs:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/system/backups
router.get("/backups", authenticateToken, async (req, res) => {
  try {
    // Return mock backups for now
    // TODO: Implement real backup system
    res.json([
      {
        _id: '1',
        createdAt: new Date(Date.now() - 86400000),
        size: 2500000,
        type: 'auto',
        status: 'completed'
      },
      {
        _id: '2',
        createdAt: new Date(Date.now() - 604800000),
        size: 2400000,
        type: 'manual',
        status: 'completed'
      }
    ]);
  } catch (error) {
    logger.error('Error fetching backups:', error);
    res.status(500).json({ error: error.message });
  }
});


// POST /api/system/backups
router.post("/backups", authenticateToken, async (req, res) => {
  try {
    // TODO: Implement real backup
    logger.info('Backup created');
    res.json({
      success: true,
      message: 'Backup created successfully',
      backup: {
        _id: Date.now().toString(),
        createdAt: new Date(),
        size: 2500000,
        type: 'manual',
        status: 'completed'
      }
    });
  } catch (error) {
    logger.error('Error creating backup:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/system/logs
router.get("/logs", authenticateToken, async (req, res) => {
  try {
    const { level, limit = 100 } = req.query;
    
    let query = {};
    
    if (level && level !== 'all') {
      query.type = level === 'error' ? 'system' : 
                   level === 'warning' ? 'system' : 
                   level;
    }
    
    const logs = await Activity.find(query)
      .sort('-timestamp')
      .limit(parseInt(limit));
    
    const formattedLogs = logs.map(log => ({
      timestamp: log.timestamp,
      level: log.type === 'system' ? 'info' : log.type,
      message: log.message,
      details: log.details,
      user: log.user,
      emoji: log.emoji
    }));
    
    res.json(formattedLogs);
    
  } catch (error) {
    logger.error('Error fetching system logs:', error);
    res.status(500).json({ error: error.message });
  }
});


// DELETE /api/system/logs
router.delete("/logs", authenticateToken, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const result = await Activity.deleteMany({
      timestamp: { $lt: thirtyDaysAgo }
    });
    
    logger.info('Logs cleared', { deleted: result.deletedCount });
    
    res.json({ 
      success: true, 
      deleted: result.deletedCount,
      message: `נמחקו ${result.deletedCount} רשומות ישנות`
    });
  } catch (error) {
    logger.error('Error clearing logs:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/system/backups
router.get("/backups", authenticateToken, async (req, res) => {
  try {
    res.json([
      {
        _id: '1',
        filename: 'backup_' + new Date().toISOString().split('T')[0] + '.zip',
        createdAt: new Date(Date.now() - 86400000),
        size: 2547896,
        type: 'auto',
        status: 'completed'
      },
      {
        _id: '2',
        filename: 'backup_' + new Date(Date.now() - 604800000).toISOString().split('T')[0] + '.zip',
        createdAt: new Date(Date.now() - 604800000),
        size: 2421043,
        type: 'manual',
        status: 'completed'
      }
    ]);
  } catch (error) {
    logger.error('Error fetching backups:', error);
    res.status(500).json({ error: error.message });
  }
});


// POST /api/system/backups
router.post("/backups", authenticateToken, async (req, res) => {
  try {
    logger.info('Backup created');
    
    const backup = {
      _id: Date.now().toString(),
      filename: 'backup_' + new Date().toISOString().split('T')[0] + '.zip',
      createdAt: new Date(),
      size: 2547896,
      type: 'manual',
      status: 'completed'
    };
    
    res.json({
      success: true,
      message: 'הגיבוי נוצר בהצלחה',
      backup
    });
  } catch (error) {
    logger.error('Error creating backup:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/system/health
router.get("/health", async (req, res) => {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date(),
      uptime: process.uptime(),
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      }
    };
    
    res.json(health);
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});


export default router;
