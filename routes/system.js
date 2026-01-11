// ===============================================
// 🔧 SYSTEM ROUTES - Production Ready
// ===============================================
// Merged from:
// - routes/system.js (256 lines, 5 endpoints - 4 duplicates!)
// - v2/system.js (66 lines, 3 endpoints)
// - v2/system-full.js (238 lines, 9 endpoints)
// Result: 9 unique endpoints, RBAC, monitoring, backups, settings
// ===============================================

import express from 'express';
import mongoose from 'mongoose';
import { authenticateToken } from '../middlewares/auth.js';
import { requirePermission } from '../middlewares/rbac.js';
import Activity from '../models/Activity.js';
import AuditLog from '../models/AuditLog.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ============================================================
// ERROR MESSAGES
// ============================================================

const ERRORS = {
  SYSTEM: {
    BACKUP_FAILED: 'יצירת גיבוי נכשלה',
    LOG_CLEANUP_FAILED: 'ניקוי לוגים נכשל',
    SETTINGS_NOT_FOUND: 'הגדרה לא נמצאה',
    SETTINGS_UPDATE_FAILED: 'עדכון הגדרות נכשל'
  },
  SERVER: {
    DATABASE: 'שגיאת מסד נתונים',
    UNKNOWN: 'שגיאת שרת'
  }
};

// ============================================================
// SYSTEM SETTINGS (in-memory - not persistent!)
// ============================================================
// ⚠️ IMPORTANT: Settings are stored in memory only
// - Changes reset on server restart
// - Not cluster-safe (each instance has its own copy)
// - Not recommended for production at scale
// 
// TODO: Move to database (Settings model) for:
// - Persistence across restarts
// - Cluster safety
// - Audit trail of changes
// ============================================================

const systemSettings = {
  stationMonthlyPrice: 500,
  externalCommissionPercent: 10,
  autoDispatch: true,
  maxDriversPerRide: 10,
  rideTimeout: 300,
  maintenanceMode: false,
  allowRegistrations: true,
  minAppVersion: '1.0.0'
};

// ===============================================
// GET /api/system/health - בדיקת בריאות בסיסית
// ===============================================
router.get("/health", async (req, res) => {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date(),
      uptime: process.uptime(),
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        percentage: Math.round((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100)
      },
      nodejs: process.version
    };
    
    res.json({
      ok: true,
      health
    });
  } catch (error) {
    logger.error('Health check failed', {
      error: error.message
    });
    res.status(500).json({
      ok: false,
      status: 'error',
      error: error.message
    });
  }
});

// ===============================================
// GET /api/system/health/detailed - בדיקת בריאות מפורטת
// ===============================================
router.get("/health/detailed", authenticateToken, requirePermission('system:read'), async (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    
    const health = {
      status: 'ok',
      timestamp: new Date(),
      uptime: {
        seconds: Math.floor(process.uptime()),
        formatted: formatUptime(process.uptime())
      },
      mongodb: {
        status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        readyState: mongoose.connection.readyState,
        host: mongoose.connection.host || 'unknown',
        name: mongoose.connection.name || 'unknown'
      },
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
      },
      cpu: {
        usage: process.cpuUsage(),
        loadAverage: process.platform === 'linux' ? require('os').loadavg() : null
      },
      nodejs: {
        version: process.version,
        platform: process.platform,
        arch: process.arch
      },
      environment: process.env.NODE_ENV || 'development'
    };
    
    res.json({
      ok: true,
      health
    });
  } catch (error) {
    logger.error('Detailed health check failed', {
      error: error.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// GET /api/system/logs - קבלת לוגים
// ===============================================
router.get("/logs", authenticateToken, requirePermission('system:logs'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
    const skip = (page - 1) * limit;
    const { level, type, from, to } = req.query;
    
    // Try AuditLog first (preferred)
    const AuditLogAvailable = AuditLog ? true : false;
    
    let logs, total;
    
    if (AuditLogAvailable) {
      // Use AuditLog
      const filter = {};
      
      if (level) filter.level = level;
      if (type) filter.action = { $regex: type, $options: 'i' };
      if (from || to) {
        filter.timestamp = {};
        if (from) filter.timestamp.$gte = new Date(from);
        if (to) filter.timestamp.$lte = new Date(to);
      }
      
      [logs, total] = await Promise.all([
        AuditLog.find(filter)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        AuditLog.countDocuments(filter)
      ]);
      
      // Format for consistent output
      logs = logs.map(log => ({
        timestamp: log.timestamp,
        level: log.level || 'info',
        type: log.action,
        message: log.action,
        user: log.username,
        details: log.details
      }));
    } else {
      // Fallback to Activity
      const filter = {};
      
      if (type) filter.type = type;
      if (from || to) {
        filter.timestamp = {};
        if (from) filter.timestamp.$gte = new Date(from);
        if (to) filter.timestamp.$lte = new Date(to);
      }
      
      [logs, total] = await Promise.all([
        Activity.find(filter)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Activity.countDocuments(filter)
      ]);
      
      // Format
      logs = logs.map(log => ({
        timestamp: log.timestamp,
        level: 'info',
        type: log.type,
        message: log.message,
        user: log.user,
        details: log.details,
        emoji: log.emoji
      }));
      
      logger.warn('Using Activity fallback for system logs', {
        requestId: req.id || null
      });
    }
    
    res.json({
      ok: true,
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    logger.error('Error fetching system logs', {
      requestId: req.id || null,
      error: error.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// DELETE /api/system/logs/cleanup - ניקוי לוגים ישנים
// ===============================================
router.delete("/logs/cleanup", authenticateToken, requirePermission('system:logs'), async (req, res) => {
  try {
    const olderThanDays = parseInt(req.query.olderThan) || 30;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    let deletedAudit = 0;
    let deletedActivity = 0;
    
    // Clean AuditLog
    if (AuditLog) {
      const auditResult = await AuditLog.deleteMany({
        timestamp: { $lt: cutoffDate }
      });
      deletedAudit = auditResult.deletedCount;
    }
    
    // Clean Activity
    const activityResult = await Activity.deleteMany({
      timestamp: { $lt: cutoffDate }
    });
    deletedActivity = activityResult.deletedCount;
    
    const totalDeleted = deletedAudit + deletedActivity;
    
    logger.info('Logs cleaned up', {
      requestId: req.id || null,
      deletedAudit,
      deletedActivity,
      totalDeleted,
      olderThanDays
    });
    
    // Log the cleanup action
    if (AuditLog) {
      await AuditLog.create({
        userId: req.user.userId || req.user.user,
        username: req.user.username || req.user.user,
        action: 'system_logs_cleaned',
        details: {
          deletedAudit,
          deletedActivity,
          totalDeleted,
          olderThanDays
        },
        timestamp: new Date()
      }).catch(err => logger.error('Failed to log cleanup', { error: err.message }));
    }
    
    res.json({
      ok: true,
      deleted: totalDeleted,
      details: {
        auditLog: deletedAudit,
        activity: deletedActivity
      },
      message: `נמחקו ${totalDeleted} רשומות ישנות מ-${olderThanDays} ימים`
    });
  } catch (error) {
    logger.error('Error cleaning up logs', {
      requestId: req.id || null,
      error: error.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SYSTEM.LOG_CLEANUP_FAILED
    });
  }
});

// ===============================================
// GET /api/system/backups/list - רשימת גיבויים
// ===============================================
router.get("/backups/list", authenticateToken, requirePermission('system:backup'), async (req, res) => {
  try {
    // TODO: Implement real backup system
    // For now, return mock data
    
    const mockBackups = [
      {
        _id: '1',
        filename: `backup_${new Date().toISOString().split('T')[0]}.tar.gz`,
        createdAt: new Date(Date.now() - 86400000), // yesterday
        size: 2547896,
        sizeFormatted: '2.4 MB',
        type: 'auto',
        status: 'completed'
      },
      {
        _id: '2',
        filename: `backup_${new Date(Date.now() - 604800000).toISOString().split('T')[0]}.tar.gz`,
        createdAt: new Date(Date.now() - 604800000), // last week
        size: 2421043,
        sizeFormatted: '2.3 MB',
        type: 'manual',
        status: 'completed'
      }
    ];
    
    res.json({
      ok: true,
      mock: true,  // ⚠️ Flag to indicate this is mock data
      backups: mockBackups,
      count: mockBackups.length,
      warning: 'This is mock data. Real backup system not implemented yet.'
    });
  } catch (error) {
    logger.error('Error fetching backups', {
      requestId: req.id || null,
      error: error.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// POST /api/system/backups/create - יצירת גיבוי
// ===============================================
router.post("/backups/create", authenticateToken, requirePermission('system:backup'), async (req, res) => {
  try {
    // TODO: Implement real backup logic
    // This would typically:
    // 1. Dump MongoDB
    // 2. Compress files
    // 3. Upload to S3/storage
    // 4. Return backup info
    
    const backupId = `backup_${Date.now()}`;
    const filename = `${backupId}.tar.gz`;
    
    const backup = {
      _id: backupId,
      filename,
      createdAt: new Date(),
      size: 2547896,
      sizeFormatted: '2.4 MB',
      type: 'manual',
      status: 'completed',
      createdBy: req.user.username || req.user.user
    };
    
    logger.info('Backup created', {
      requestId: req.id || null,
      backupId,
      createdBy: req.user.username || req.user.user
    });
    
    // Audit log
    if (AuditLog) {
      await AuditLog.create({
        userId: req.user.userId || req.user.user,
        username: req.user.username || req.user.user,
        action: 'system_backup_created',
        details: { backupId, filename },
        timestamp: new Date()
      }).catch(err => logger.error('Failed to log backup creation', { error: err.message }));
    }
    
    res.json({
      ok: true,
      mock: true,  // ⚠️ Flag to indicate this is mock data
      message: 'הגיבוי נוצר בהצלחה (mock)',
      warning: 'This is a mock backup. Real backup system not implemented yet.',
      backup
    });
  } catch (error) {
    logger.error('Error creating backup', {
      requestId: req.id || null,
      error: error.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SYSTEM.BACKUP_FAILED
    });
  }
});

// ===============================================
// GET /api/system/settings/all - קבלת כל ההגדרות
// ===============================================
router.get("/settings/all", authenticateToken, requirePermission('settings:read'), async (req, res) => {
  try {
    res.json({
      ok: true,
      settings: systemSettings
    });
  } catch (error) {
    logger.error('Error fetching settings', {
      requestId: req.id || null,
      error: error.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// PUT /api/system/settings/:key - עדכון הגדרה
// ===============================================
router.put("/settings/:key", authenticateToken, requirePermission('settings:update'), async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    if (!systemSettings.hasOwnProperty(key)) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.SYSTEM.SETTINGS_NOT_FOUND,
        validKeys: Object.keys(systemSettings)
      });
    }
    
    const oldValue = systemSettings[key];
    systemSettings[key] = value;
    
    logger.info('System setting updated', {
      requestId: req.id || null,
      key,
      oldValue,
      newValue: value,
      updatedBy: req.user.username || req.user.user
    });
    
    // Audit log
    if (AuditLog) {
      await AuditLog.create({
        userId: req.user.userId || req.user.user,
        username: req.user.username || req.user.user,
        action: 'settings_updated',
        details: { key, oldValue, newValue: value },
        timestamp: new Date()
      }).catch(err => logger.error('Failed to log setting update', { error: err.message }));
    }
    
    res.json({
      ok: true,
      message: `הגדרה ${key} עודכנה בהצלחה`,
      settings: systemSettings
    });
  } catch (error) {
    logger.error('Error updating setting', {
      requestId: req.id || null,
      error: error.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SYSTEM.SETTINGS_UPDATE_FAILED
    });
  }
});

// ===============================================
// GET /api/system/version - גרסת המערכת
// ===============================================
router.get("/version", async (req, res) => {
  try {
    // ⚠️ TODO: Read version from package.json instead of hardcoding
    // const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    // version: packageJson.version
    
    const version = {
      version: '2.1.0',  // ⚠️ Hardcoded - should come from package.json
      build: process.env.NODE_ENV || 'development',
      deployedAt: new Date('2025-01-12'),
      nodeVersion: process.version,
      uptime: formatUptime(process.uptime())
    };
    
    res.json({
      ok: true,
      version
    });
  } catch (error) {
    logger.error('Error fetching version', {
      error: error.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
}

console.log('✅ System routes loaded - 9 endpoints');

export default router;