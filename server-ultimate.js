// ===============================================
// 🚀 TAXI SYSTEM - ULTIMATE INTEGRATED SERVER
// ===============================================

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Original routes
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import ridesRoutes from './routes/rides.js';

// Enhanced V2 routes
import authEnhancedRoutes from './routes/v2/auth-enhanced.js';
import usersRoutes from './routes/v2/users.js';
import driversEnhancedRoutes from './routes/v2/drivers-enhanced.js';
import ridesEnhancedRoutes from './routes/v2/rides-enhanced.js';
import paymentsEnhancedRoutes from './routes/v2/payments-enhanced.js';
import registrationsEnhancedRoutes from './routes/v2/registrations-enhanced.js';
import messagesFullRoutes from './routes/v2/messages-full.js';
import systemFullRoutes from './routes/v2/system-full.js';
import billingRoutes from './routes/v2/billing.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================================
// MIDDLEWARE
// ===============================================
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use(express.static('public'));

// ===============================================
// MONGODB CONNECTION
// ===============================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/taxi-system';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('✅ MongoDB Connected Successfully');
  console.log(`📊 Database: ${MONGODB_URI.split('/').pop()}`);
})
.catch((err) => {
  console.error('❌ MongoDB Connection Error:', err);
  process.exit(1);
});

// ===============================================
// ROUTES - V1 (ORIGINAL)
// ===============================================
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/rides', ridesRoutes);

// ===============================================
// ROUTES - V2 (ENHANCED)
// ===============================================
app.use('/api/v2/auth', authEnhancedRoutes);
app.use('/api/v2/users', usersRoutes);
app.use('/api/v2/drivers', driversEnhancedRoutes);
app.use('/api/v2/rides', ridesEnhancedRoutes);
app.use('/api/v2/payments', paymentsEnhancedRoutes);
app.use('/api/v2/registrations', registrationsEnhancedRoutes);
app.use('/api/v2/messages', messagesFullRoutes);
app.use('/api/v2/system', systemFullRoutes);
app.use('/api/v2/billing', billingRoutes);

// ===============================================
// HEALTH CHECK
// ===============================================
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    version: '4.0-ULTIMATE',
    features: {
      rbac: true,
      auditLogs: true,
      darkMode: true,
      advancedDrivers: true,
      advancedRides: true,
      fullPayments: true,
      messagingSystem: true,
      systemManagement: true
    }
  });
});

// ===============================================
// ERROR HANDLING
// ===============================================
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(err.status || 500).json({
    ok: false,
    error: {
      code: err.code || 'SERVER_ERROR',
      message: err.message || 'Internal server error'
    }
  });
});

// ===============================================
// 404 HANDLER
// ===============================================
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.url} not found`
    }
  });
});

// ===============================================
// START SERVER
// ===============================================
app.listen(PORT, () => {
  console.log('\n');
  console.log('🚖 ===============================================');
  console.log('🚖  TAXI SYSTEM - ULTIMATE INTEGRATED');
  console.log('🚖 ===============================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📊 MongoDB: ${MONGODB_URI.split('/').pop()}`);
  console.log('');
  console.log('✅ Features Enabled:');
  console.log('  - RBAC (Role-Based Access Control)');
  console.log('  - Audit Logging');
  console.log('  - Advanced Drivers (Notes, Ratings, Documents)');
  console.log('  - Advanced Rides (History, Pricing, Recurring)');
  console.log('  - Full Payments (OCR, Overdue, Reports)');
  console.log('  - Messaging System (Templates, Campaigns)');
  console.log('  - System Management (Health, Backups, Logs)');
  console.log('  - Dark Mode UI');
  console.log('  - Keyboard Shortcuts');
  console.log('🚖 ===============================================');
  console.log('\n');
});

export default app;
