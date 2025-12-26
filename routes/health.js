// ===============================================
// ❤️ HEALTH CHECK ROUTE
// ===============================================
// נתיב בסיסי לבדיקת תקינות השרת
// Created: 24 דצמבר 2025

import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

// ===============================================
// GET /health
// ===============================================
// בדיקת תקינות בסיסית של השרת
router.get('/', async (req, res) => {
  try {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    
    // בדוק חיבור למסד נתונים
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      database: dbStatus,
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB'
      },
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version
    };
    
    // אם הכל תקין - 200
    if (dbStatus === 'connected') {
      res.status(200).json(health);
    } else {
      // אם אין חיבור למסד נתונים - 503
      health.status = 'degraded';
      res.status(503).json(health);
    }
    
  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

console.log('✅ Health check route loaded');

export default router;
