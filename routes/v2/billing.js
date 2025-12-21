import express from 'express';
import { authenticateToken } from './auth.js';

const router = express.Router();

// In-memory config (should be in DB in production)
let billingConfig = {
  stationMonthlyPrice: 500,
  externalCommissionPercent: 10,
  updatedAt: new Date(),
  updatedBy: null
};

// GET /api/v2/billing/config
router.get('/config', authenticateToken, async (req, res) => {
  try {
    res.json({
      ok: true,
      data: billingConfig
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// PUT /api/v2/billing/config
router.put('/config', authenticateToken, async (req, res) => {
  try {
    const { stationMonthlyPrice, externalCommissionPercent } = req.body;
    
    if (stationMonthlyPrice !== undefined) {
      billingConfig.stationMonthlyPrice = parseFloat(stationMonthlyPrice);
    }
    
    if (externalCommissionPercent !== undefined) {
      billingConfig.externalCommissionPercent = parseFloat(externalCommissionPercent);
    }
    
    billingConfig.updatedAt = new Date();
    billingConfig.updatedBy = 'admin';
    
    // TODO: Save to database
    
    res.json({
      ok: true,
      data: billingConfig
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

export default router;
