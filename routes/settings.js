// ============================================================
// SETTINGS ROUTES
// Auto-generated from server.js refactoring
// ============================================================

import express from 'express';
import { Driver, Ride, WhatsAppGroup } from '../models/index.js';
import { authenticateToken } from '../middlewares/auth.js';
import logger from '../utils/logger.js';

// Import what you need (adjust based on actual usage)
// import Ride from '../models/Ride.js';
// import Driver from '../models/Driver.js';
// import { authenticateToken } from '../middlewares/auth.js';
// import logger from '../utils/logger.js';

const router = express.Router();

// ============================================================
// 18 ENDPOINTS
// ============================================================

// GET /api/settings/general
router.get("/general", authenticateToken, async (req, res) => {
  try {
    // Return default settings
    // TODO: Store in database
    res.json({
      companyName: process.env.COMPANY_NAME || 'מערכת מוניות',
      companyPhone: process.env.COMPANY_PHONE || '03-1234567',
      companyEmail: process.env.COMPANY_EMAIL || 'info@taxi.com',
      workingHours: '24/7'
    });
  } catch (error) {
    logger.error('Error fetching general settings:', error);
    res.status(500).json({ error: error.message });
  }
});


// POST /api/settings/general
router.post("/general", authenticateToken, async (req, res) => {
  try {
    const settings = req.body;
    // TODO: Save to database
    logger.info('General settings updated', settings);
    res.json({ success: true, message: 'Settings saved' });
  } catch (error) {
    logger.error('Error saving general settings:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/settings/pricing
router.get("/pricing", authenticateToken, async (req, res) => {
  try {
    // Return default pricing
    // TODO: Store in database
    res.json({
      basePrice: process.env.BASE_PRICE || 15,
      pricePerKm: process.env.PRICE_PER_KM || 5,
      pricePerMinute: process.env.PRICE_PER_MINUTE || 1,
      nightSurcharge: process.env.NIGHT_SURCHARGE || 25,
      commissionPercent: process.env.COMMISSION_PERCENT || 20
    });
  } catch (error) {
    logger.error('Error fetching pricing settings:', error);
    res.status(500).json({ error: error.message });
  }
});


// POST /api/settings/pricing
router.post("/pricing", authenticateToken, async (req, res) => {
  try {
    const pricing = req.body;
    // TODO: Save to database
    logger.info('Pricing settings updated', pricing);
    res.json({ success: true, message: 'Pricing updated' });
  } catch (error) {
    logger.error('Error saving pricing settings:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/bot/settings
router.get("/api/bot/settings", authenticateToken, async (req, res) => {
  try {
    res.json({
      enabled: !!process.env.BOT_URL,
      autoAssign: true,
      autoReply: true,
      responseDelay: 2
    });
  } catch (error) {
    logger.error('Error fetching bot settings:', error);
    res.status(500).json({ error: error.message });
  }
});


// POST /api/bot/settings
router.post("/api/bot/settings", authenticateToken, async (req, res) => {
  try {
    const settings = req.body;
    // TODO: Save to database
    logger.info('Bot settings updated', settings);
    res.json({ success: true, message: 'Bot settings updated' });
  } catch (error) {
    logger.error('Error saving bot settings:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/settings/general
router.get("/general", authenticateToken, async (req, res) => {
  try {
    res.json({
      companyName: process.env.COMPANY_NAME || 'מערכת ניהול מוניות',
      companyPhone: process.env.COMPANY_PHONE || '03-1234567',
      companyEmail: process.env.COMPANY_EMAIL || 'info@taxi.com',
      companyAddress: process.env.COMPANY_ADDRESS || 'תל אביב, ישראל',
      workingHours: process.env.WORKING_HOURS || '24/7',
      supportPhone: process.env.SUPPORT_PHONE || '03-1234567',
      emergencyPhone: process.env.EMERGENCY_PHONE || '03-1234567'
    });
  } catch (error) {
    logger.error('Error fetching general settings:', error);
    res.status(500).json({ error: error.message });
  }
});


// POST /api/settings/general
router.post("/general", authenticateToken, async (req, res) => {
  try {
    const settings = req.body;
    logger.info('General settings updated', settings);
    
    res.json({ 
      success: true, 
      message: 'ההגדרות נשמרו בהצלחה',
      settings 
    });
  } catch (error) {
    logger.error('Error saving general settings:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/settings/pricing
router.get("/pricing", authenticateToken, async (req, res) => {
  try {
    res.json({
      basePrice: parseFloat(process.env.BASE_PRICE) || 15,
      pricePerKm: parseFloat(process.env.PRICE_PER_KM) || 5,
      pricePerMinute: parseFloat(process.env.PRICE_PER_MINUTE) || 1,
      nightSurcharge: parseFloat(process.env.NIGHT_SURCHARGE) || 25,
      commissionPercent: parseFloat(process.env.COMMISSION_PERCENT) || 20,
      minimumRidePrice: parseFloat(process.env.MINIMUM_RIDE_PRICE) || 20,
      cancellationFee: parseFloat(process.env.CANCELLATION_FEE) || 0
    });
  } catch (error) {
    logger.error('Error fetching pricing settings:', error);
    res.status(500).json({ error: error.message });
  }
});


// POST /api/settings/pricing
router.post("/pricing", authenticateToken, async (req, res) => {
  try {
    const pricing = req.body;
    logger.info('Pricing settings updated', pricing);
    
    res.json({ 
      success: true, 
      message: 'הגדרות המחירים נשמרו בהצלחה',
      pricing 
    });
  } catch (error) {
    logger.error('Error saving pricing settings:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/bot/settings
router.get("/api/bot/settings", authenticateToken, async (req, res) => {
  try {
    res.json({
      enabled: !!process.env.BOT_URL,
      botUrl: process.env.BOT_URL || '',
      autoAssign: process.env.BOT_AUTO_ASSIGN === 'true',
      autoReply: process.env.BOT_AUTO_REPLY === 'true',
      responseDelay: parseInt(process.env.BOT_RESPONSE_DELAY) || 2,
      maxRetries: parseInt(process.env.BOT_MAX_RETRIES) || 3
    });
  } catch (error) {
    logger.error('Error fetching bot settings:', error);
    res.status(500).json({ error: error.message });
  }
});


// POST /api/bot/settings
router.post("/api/bot/settings", authenticateToken, async (req, res) => {
  try {
    const settings = req.body;
    logger.info('Bot settings updated', settings);
    
    res.json({ 
      success: true, 
      message: 'הגדרות הבוט נשמרו בהצלחה',
      settings 
    });
  } catch (error) {
    logger.error('Error saving bot settings:', error);
    res.status(500).json({ error: error.message });
  }
});


// POST /api/finance/commissions/settings
router.post("/api/finance/commissions/settings", authenticateToken, async (req, res) => {
  try {
    const { defaultRate } = req.body;
    // כאן תוכל לשמור להגדרות במסד נתונים
    logger.info('Commission settings updated', { defaultRate });
    
    res.json({ 
      success: true, 
      message: 'ההגדרות נשמרו בהצלחה',
      defaultRate 
    });
  } catch (error) {
    logger.error('Error saving commission settings:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/settings/general
router.get("/general", authenticateToken, async (req, res) => {
  try {
    res.json({
      companyName: process.env.COMPANY_NAME || 'מערכת ניהול מוניות',
      companyPhone: process.env.COMPANY_PHONE || '03-1234567',
      companyEmail: process.env.COMPANY_EMAIL || 'info@taxi.com',
      supportPhone: process.env.SUPPORT_PHONE || '03-1234567'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// POST /api/settings/general
router.post("/general", authenticateToken, async (req, res) => {
  try {
    const settings = req.body;
    logger.info('General settings updated', settings);
    
    res.json({ 
      success: true, 
      message: 'ההגדרות נשמרו',
      settings 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// GET /api/settings/pricing
router.get("/pricing", authenticateToken, async (req, res) => {
  try {
    res.json({
      basePrice: parseFloat(process.env.BASE_PRICE) || 15,
      pricePerKm: parseFloat(process.env.PRICE_PER_KM) || 5,
      pricePerMinute: parseFloat(process.env.PRICE_PER_MINUTE) || 1,
      commissionPercent: parseFloat(process.env.COMMISSION_PERCENT) || 20
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// POST /api/settings/pricing
router.post("/pricing", authenticateToken, async (req, res) => {
  try {
    const pricing = req.body;
    logger.info('Pricing updated', pricing);
    
    res.json({ 
      success: true, 
      message: 'המחירים נשמרו',
      pricing 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// GET /api/settings/groups
router.get("/groups", authenticateToken, async (req, res) => {
  try {
    const groups = await WhatsAppGroup.find({ isActive: true });
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


export default router;
