// ============================================================
// BILLING ROUTES - ENHANCED VERSION
// Manages billing configuration and calculations
// ============================================================

import express from 'express';
import { AuditLog, BillingConfig, Driver, Payment } from '../models/index.js';
import { authenticateToken } from '../middlewares/auth.js';
import { requirePermission } from '../middlewares/rbac.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Error messages
const ERRORS = {
  BILLING: {
    CONFIG_NOT_FOUND: 'הגדרות חיוב לא נמצאו',
    INVALID_PRICE: 'מחיר לא תקין',
    INVALID_PERCENT: 'אחוז לא תקין',
    MISSING_FIELDS: 'חסרים שדות חובה'
  },
  SERVER: {
    DATABASE: 'שגיאת בסיס נתונים',
    UNKNOWN: 'שגיאה לא צפויה'
  }
};

// ============================================================
// CONFIGURATION ENDPOINTS
// ============================================================

// ===============================================
// GET /api/billing/config - קבלת הגדרות חיוב
// ===============================================
router.get('/config', authenticateToken, requirePermission('billing:read'), async (req, res) => {
  try {
    // Get current config or create default
    let config = await BillingConfig.findOne();
    
    if (!config) {
      logger.info('Creating default billing config');
      
      // Create default config
      config = await BillingConfig.create({
        stationMonthlyPrice: 500,
        externalCommissionPercent: 10,
        internalCommissionPercent: 8,
        minimumCommission: 50,
        currency: 'ILS',
        taxRate: 17, // VAT in Israel
        updatedBy: req.user.username || 'system'
      });
    }
    
    logger.info('Billing config fetched', {
      requestId: req.id,
      userId: req.user.userId
    });
    
    res.json({
      ok: true,
      config: {
        id: config._id,
        stationMonthlyPrice: config.stationMonthlyPrice,
        externalCommissionPercent: config.externalCommissionPercent,
        internalCommissionPercent: config.internalCommissionPercent,
        minimumCommission: config.minimumCommission,
        currency: config.currency,
        taxRate: config.taxRate,
        updatedAt: config.updatedAt,
        updatedBy: config.updatedBy
      }
    });
  } catch (err) {
    logger.error('Error fetching billing config', {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});

// ===============================================
// PUT /api/billing/config - עדכון הגדרות חיוב
// ===============================================
router.put('/config', authenticateToken, requirePermission('billing:update'), async (req, res) => {
  try {
    const {
      stationMonthlyPrice,
      externalCommissionPercent,
      internalCommissionPercent,
      minimumCommission,
      currency,
      taxRate
    } = req.body;
    
    // Validation
    if (stationMonthlyPrice !== undefined && (isNaN(stationMonthlyPrice) || stationMonthlyPrice < 0)) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.BILLING.INVALID_PRICE
      });
    }
    
    if (externalCommissionPercent !== undefined && 
        (isNaN(externalCommissionPercent) || externalCommissionPercent < 0 || externalCommissionPercent > 100)) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.BILLING.INVALID_PERCENT
      });
    }
    
    if (internalCommissionPercent !== undefined && 
        (isNaN(internalCommissionPercent) || internalCommissionPercent < 0 || internalCommissionPercent > 100)) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.BILLING.INVALID_PERCENT
      });
    }
    
    if (taxRate !== undefined && 
        (isNaN(taxRate) || taxRate < 0 || taxRate > 100)) {
      return res.status(400).json({
        ok: false,
        error: 'מע"מ לא תקין'
      });
    }
    
    // Get or create config
    let config = await BillingConfig.findOne();
    
    if (!config) {
      config = new BillingConfig();
    }
    
    // Store old values for audit
    const oldValues = {
      stationMonthlyPrice: config.stationMonthlyPrice,
      externalCommissionPercent: config.externalCommissionPercent,
      internalCommissionPercent: config.internalCommissionPercent,
      minimumCommission: config.minimumCommission,
      currency: config.currency,
      taxRate: config.taxRate
    };
    
    // Update values
    if (stationMonthlyPrice !== undefined) {
      config.stationMonthlyPrice = parseFloat(stationMonthlyPrice);
    }
    if (externalCommissionPercent !== undefined) {
      config.externalCommissionPercent = parseFloat(externalCommissionPercent);
    }
    if (internalCommissionPercent !== undefined) {
      config.internalCommissionPercent = parseFloat(internalCommissionPercent);
    }
    if (minimumCommission !== undefined) {
      config.minimumCommission = parseFloat(minimumCommission);
    }
    if (currency) {
      config.currency = currency;
    }
    if (taxRate !== undefined) {
      config.taxRate = parseFloat(taxRate);
    }
    
    config.updatedAt = new Date();
    config.updatedBy = req.user.username || 'admin';
    
    await config.save();
    
    // Log the change
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || 'admin',
      action: 'billing_config_updated',
      details: {
        oldValues,
        newValues: {
          stationMonthlyPrice: config.stationMonthlyPrice,
          externalCommissionPercent: config.externalCommissionPercent,
          internalCommissionPercent: config.internalCommissionPercent,
          minimumCommission: config.minimumCommission,
          currency: config.currency,
          taxRate: config.taxRate
        }
      }
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success('Billing config updated', {
      requestId: req.id,
      userId: req.user.userId,
      changes: Object.keys(req.body)
    });
    
    res.json({
      ok: true,
      config: {
        id: config._id,
        stationMonthlyPrice: config.stationMonthlyPrice,
        externalCommissionPercent: config.externalCommissionPercent,
        internalCommissionPercent: config.internalCommissionPercent,
        minimumCommission: config.minimumCommission,
        currency: config.currency,
        taxRate: config.taxRate,
        updatedAt: config.updatedAt,
        updatedBy: config.updatedBy
      },
      message: 'הגדרות חיוב עודכנו בהצלחה'
    });
  } catch (err) {
    logger.error('Error updating billing config', {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// CALCULATION ENDPOINTS
// ============================================================

// ===============================================
// POST /api/billing/calculate-commission - חישוב עמלה
// ===============================================
router.post('/calculate-commission', authenticateToken, requirePermission('billing:read'), async (req, res) => {
  try {
    const { amount, isExternal = false } = req.body;
    
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.BILLING.INVALID_PRICE
      });
    }
    
    const config = await BillingConfig.findOne();
    
    if (!config) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.BILLING.CONFIG_NOT_FOUND
      });
    }
    
    const commissionPercent = isExternal 
      ? config.externalCommissionPercent 
      : config.internalCommissionPercent;
    
    let commission = (parseFloat(amount) * commissionPercent) / 100;
    
    // Apply minimum commission if exists
    if (config.minimumCommission && commission < config.minimumCommission) {
      commission = config.minimumCommission;
    }
    
    const netAmount = parseFloat(amount) - commission;
    const tax = (commission * config.taxRate) / 100;
    
    logger.info('Commission calculated', {
      requestId: req.id,
      amount,
      commission,
      isExternal
    });
    
    res.json({
      ok: true,
      calculation: {
        amount: parseFloat(amount),
        commissionPercent,
        commission,
        minimumCommissionApplied: config.minimumCommission && commission === config.minimumCommission,
        netAmount,
        tax,
        currency: config.currency
      }
    });
  } catch (err) {
    logger.error('Error calculating commission', {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// GET /api/billing/driver-monthly/:driverId - חיוב חודשי לנהג
// ===============================================
router.get('/driver-monthly/:driverId', authenticateToken, requirePermission('billing:read'), async (req, res) => {
  try {
    const { driverId } = req.params;
    const { month, year } = req.query;
    
    // Validate driver exists
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: 'נהג לא נמצא'
      });
    }
    
    const config = await BillingConfig.findOne();
    
    // Calculate date range
    const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);
    
    // Get all payments for this driver in the period
    const payments = await Payment.find({
      driverId,
      createdAt: {
        $gte: startDate,
        $lte: endDate
      }
    });
    
    const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalPaid = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalPending = payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.amount || 0), 0);
    
    res.json({
      ok: true,
      billing: {
        driver: {
          id: driver._id,
          name: driver.name,
          phone: driver.phone
        },
        period: {
          month: targetMonth,
          year: targetYear,
          startDate,
          endDate
        },
        stationFee: config?.stationMonthlyPrice || 0,
        commissions: {
          total: totalAmount,
          paid: totalPaid,
          pending: totalPending
        },
        total: (config?.stationMonthlyPrice || 0) + totalAmount,
        currency: config?.currency || 'ILS'
      }
    });
  } catch (err) {
    logger.error('Error calculating driver monthly billing', {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// GET /api/billing/summary - סיכום חיוב כללי
// ===============================================
router.get('/summary', authenticateToken, requirePermission('billing:read'), async (req, res) => {
  try {
    const { month, year } = req.query;
    
    const config = await BillingConfig.findOne();
    
    // Calculate date range
    const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);
    
    // Get all payments in period
    const payments = await Payment.find({
      createdAt: {
        $gte: startDate,
        $lte: endDate
      }
    });
    
    // Get active drivers count
    const activeDrivers = await Driver.countDocuments({ isActive: true });
    
    const totalCommissions = payments.reduce((sum, p) => sum + (p.commissionAmount || 0), 0);
    const totalPaid = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalPending = payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.amount || 0), 0);
    
    const stationFees = activeDrivers * (config?.stationMonthlyPrice || 0);
    
    res.json({
      ok: true,
      summary: {
        period: {
          month: targetMonth,
          year: targetYear
        },
        activeDrivers,
        stationFees: {
          perDriver: config?.stationMonthlyPrice || 0,
          total: stationFees
        },
        commissions: {
          total: totalCommissions,
          paid: totalPaid,
          pending: totalPending
        },
        grandTotal: stationFees + totalCommissions,
        currency: config?.currency || 'ILS'
      }
    });
  } catch (err) {
    logger.error('Error generating billing summary', {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// EXPORT
// ============================================================

export default router;