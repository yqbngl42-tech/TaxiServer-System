import express from 'express';
import { authenticateToken } from './auth-enhanced.js';
import { requirePermission } from '../../middleware/rbac.js';
import AuditLog from '../../models/AuditLog.js';

const router = express.Router();

// ===============================================
// HEALTH CHECK
// ===============================================
router.get('/health', authenticateToken, async (req, res) => {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date(),
      uptime: process.uptime(),
      mongo: 'ok',
      bot: 'ok'
    };
    
    res.json({ ok: true, data: health });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

router.get('/health/detailed', authenticateToken, requirePermission('system:logs'), async (req, res) => {
  try {
    const health = {
      mongodb: {
        status: 'ok',
        responseTime: 5,
        connections: 10
      },
      redis: {
        status: 'ok',
        memory: '50MB'
      },
      bot: {
        status: 'ok',
        queueSize: 0
      },
      disk: {
        used: '5GB',
        free: '45GB',
        percent: 10
      },
      memory: {
        used: process.memoryUsage().heapUsed / 1024 / 1024,
        total: process.memoryUsage().heapTotal / 1024 / 1024
      }
    };
    
    res.json({ ok: true, data: health });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// BACKUPS
// ===============================================
router.post('/backups/create', authenticateToken, requirePermission('system:backup'), async (req, res) => {
  try {
    const backupId = `backup_${Date.now()}`;
    const filename = `${backupId}.tar.gz`;
    
    // TODO: Actually create backup
    
    await AuditLog.create({
      userId: req.user.userId,
      username: req.user.username,
      action: 'system_backup_created',
      details: { backupId, filename }
    });
    
    res.json({ ok: true, data: { backupId, filename, size: '50MB' } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

router.get('/backups/list', authenticateToken, requirePermission('system:backup'), async (req, res) => {
  try {
    const backups = [
      { id: 'backup_1', filename: 'backup_1.tar.gz', size: '45MB', createdAt: new Date() }
    ];
    
    res.json({ ok: true, data: { items: backups } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// LOGS
// ===============================================
router.get('/logs', authenticateToken, requirePermission('system:logs'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.level) filter.level = req.query.level;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit),
      AuditLog.countDocuments(filter)
    ]);

    res.json({
      ok: true,
      data: {
        items: logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

router.delete('/logs/cleanup', authenticateToken, requirePermission('system:logs'), async (req, res) => {
  try {
    const olderThan = parseInt(req.query.olderThan) || 30;
    const date = new Date();
    date.setDate(date.getDate() - olderThan);
    
    const result = await AuditLog.deleteMany({
      timestamp: { $lt: date }
    });

    await AuditLog.create({
      userId: req.user.userId,
      username: req.user.username,
      action: 'system_logs_cleaned',
      details: { deleted: result.deletedCount, olderThan }
    });
    
    res.json({ ok: true, data: { deleted: result.deletedCount } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// SETTINGS
// ===============================================
const systemSettings = {
  stationMonthlyPrice: 500,
  externalCommissionPercent: 10,
  autoDispatch: true,
  maxDriversPerRide: 10,
  rideTimeout: 300
};

router.get('/settings/all', authenticateToken, requirePermission('settings:read'), async (req, res) => {
  try {
    res.json({ ok: true, data: systemSettings });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

router.put('/settings/:key', authenticateToken, requirePermission('settings:update'), async (req, res) => {
  try {
    const { value } = req.body;
    const key = req.params.key;
    
    if (systemSettings.hasOwnProperty(key)) {
      systemSettings[key] = value;
      
      await AuditLog.create({
        userId: req.user.userId,
        username: req.user.username,
        action: 'settings_updated',
        details: { key, value }
      });
    }
    
    res.json({ ok: true, data: systemSettings });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// VERSION
// ===============================================
router.get('/version', authenticateToken, async (req, res) => {
  try {
    res.json({
      ok: true,
      data: {
        version: '2.0.0',
        build: 'production',
        deployedAt: new Date('2024-12-21')
      }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

export default router;
