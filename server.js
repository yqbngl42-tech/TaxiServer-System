// ===============================================
// 🚖 TAXI MANAGEMENT SYSTEM - SERVER V3.0
// ===============================================
// Smart Dispatch Architecture with DispatchManager
// Features:
// - Intelligent routing: Bot-first with Twilio fallback
// - Auto health checks and failover
// - Real-time monitoring and statistics
// - Manual mode switching capability
// Date: 2025-12-06

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import cors from "cors";
import twilio from "twilio";
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import crypto from 'crypto';
import { authenticateToken, authenticateAdmin } from './middlewares/auth.js';
// Models
import Ride from "./models/Ride.js";
import Driver from "./models/Driver.js";
import Payment from "./models/Payment.js";
import WhatsAppGroup from "./models/WhatsAppGroup.js";
import AdminContact from "./models/AdminContact.js";
import Activity from "./models/Activity.js";
import RegistrationSession from "./models/RegistrationSession.js";

// Utils
import twilioAdapter from "./utils/twilioAdapter.js";
import logger from "./utils/logger.js";
import rateLimiter from "./utils/rateLimiter.js";
import rideNumberGenerator from "./utils/rideNumberGenerator.js";
import { ERRORS } from "./utils/errors.js";
import "./utils/logsCleaner.js"; // Auto cleanup old logs
import registrationHandler from "./utils/registrationHandler.js";

// Upgraded features
import websockets from "./utils/websockets.js";
import corsConfig from "./config/cors-config.js";
import dispatchManager from "./utils/dispatchManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===============================================
// 🔧 FETCH WITH TIMEOUT & RETRY (תיקון ביקורת)
// ===============================================

async function fetchWithTimeout(url, options = {}, timeout = 10000, retries = 3) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (attempt === retries) {
        throw error;
      }
      
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      logger.warn(`🔄 Fetch retry ${attempt}/${retries}`, {
        url,
        delay,
        error: error.message
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// ===============================================
// 🔐 TWILIO SIGNATURE VERIFICATION (תיקון ביקורת)
// ===============================================

function validateTwilioRequest(req, res, next) {
  // Skip validation in development if explicitly disabled
  if (process.env.SKIP_TWILIO_VALIDATION === 'true') {
    logger.warn('⚠️ Twilio signature validation is DISABLED');
    return next();
  }
  
  const twilioSignature = req.headers['x-twilio-signature'];
  
  if (!twilioSignature) {
    logger.error('🚫 Missing Twilio signature header');
    return res.status(403).json({
      ok: false,
      error: 'Missing signature'
    });
  }
  
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  
  // Validate signature
  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    twilioSignature,
    url,
    req.body
  );
  
  if (!isValid) {
    logger.error('🚫 Invalid Twilio signature', {
      url,
      signaturePreview: twilioSignature?.substring(0, 20) + '...'
    });
    
    return res.status(403).json({
      ok: false,
      error: 'Invalid request signature'
    });
  }
  
  logger.debug('✅ Twilio signature validated');
  next();
}

// ===============================================
// 🔐 ENVIRONMENT VALIDATION
// ===============================================
console.log('🔍 Validating environment variables...');

const REQUIRED_ENV_VARS = [
  'MONGODB_URI',
  'JWT_SECRET',
  'ADMIN_PASSWORD',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_FROM'
];

const missingVars = REQUIRED_ENV_VARS.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(v => console.error(`   - ${v}`));
  console.error('\n💡 Create a .env file with all required variables');
  process.exit(1);
}

console.log('✅ All environment variables validated');

// ===============================================
// 🚀 APP INITIALIZATION
// ===============================================
const app = express();
const PORT = process.env.PORT || 3000;

// ===============================================
// 🛡️ MIDDLEWARE STACK
// ===============================================

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      scriptSrcAttr: ["'unsafe-inline'"], // 👈 הוסף את זה!
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],     imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(mongoSanitize());  // 👈 זה נשאר!
app.use(xss());            // 👈 זה נשאר!
// Static files
app.use(express.static(path.join(__dirname, "public")));

// Request ID middleware (for tracking)
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Request logger
app.use((req, res, next) => {
  const startTime = Date.now();
  
  logger.info('→ Incoming request', {
    id: req.id,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent']?.substring(0, 50)
  });
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('← Response sent', {
      id: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`
    });
  });
  
  next();
});

// CORS Configuration - UPGRADED WITH SECURITY
corsConfig.setupCors(app);

// Rate Limiting
app.use(rateLimiter.middleware(100, 60000));

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// ===============================================
// 🗄️ DATABASE CONNECTION
// ===============================================
console.log('🔄 Connecting to MongoDB...');

mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 200,              // ✅ תמיכה ב-2000 נהגים (100 ל-1000)
  minPoolSize: 20,               // ✅ מינימום חיבורים פעילים
  socketTimeoutMS: 45000,        // ✅ 45 שניות timeout
  serverSelectionTimeoutMS: 5000,
  maxIdleTimeMS: 10000          // ✅ סגירה אוטומטית של חיבורים לא פעילים
})
.then(() => {
  logger.success("✅ Connected to MongoDB!");
  console.log(`   Database: ${mongoose.connection.name}`);
})
.catch(err => {
  logger.error("❌ MongoDB connection failed", err);
  console.error('   Please check MONGODB_URI in .env file');
  process.exit(1);
});

// MongoDB event listeners
mongoose.connection.on('disconnected', () => {
  logger.error('⚠️ MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  logger.success('✅ MongoDB reconnected successfully');
});

mongoose.connection.on('error', (err) => {
  logger.error('❌ MongoDB error:', err);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('\nMongoDB connection closed due to app termination');
  process.exit(0);
});

// ===============================================
// 🔑 UNIQUE LINK GENERATOR FOR TWILIO
// ===============================================

/**
 * יצירת קישור ייחודי לנסיעה
 * הקישור פותח צ'אט WhatsApp עם Twilio עם הטקסט מוכן
 */
function generateUniqueRideLink(rideId) {
  // יצירת token אבטחה ייחודי
  const token = crypto.randomBytes(16).toString('hex');
  
  // מספר Twilio
  const twilioNumber = process.env.TWILIO_WHATSAPP_FROM
    .replace('whatsapp:', '')
    .replace('+', '');
  
  // הטקסט שיופיע בשורת ההקלדה כשהנהג לוחץ
  const message = encodeURIComponent(`RIDE:${rideId}:${token}`);
  
  // יצירת קישור WhatsApp
  const link = `https://wa.me/${twilioNumber}?text=${message}`;
  
  logger.info('Generated unique ride link', { 
    rideId, 
    tokenPreview: token.substring(0, 8) + '...'
  });
  
  return { link, token };
}

// ===============================================
// 🛠️ HELPER FUNCTIONS
// ===============================================

/**
 * Send bulk messages with rate limiting
 */
async function sendBulkMessagesWithRateLimit(phoneNumbers, message, delayMs = 500) {
  const results = {
    success: [],
    failed: []
  };
  
  logger.action(`Starting bulk send to ${phoneNumbers.length} numbers`, { 
    count: phoneNumbers.length 
  });
  
  for (let i = 0; i < phoneNumbers.length; i++) {
    const phone = phoneNumbers[i];
    
    try {
      logger.info(`Sending ${i + 1}/${phoneNumbers.length}`, { phone });
      await twilioAdapter.sendWhatsAppMessage(phone, message);
      results.success.push(phone);
      logger.success(`Sent successfully`, { phone });
    } catch (err) {
      logger.error(`Failed to send`, { 
        phone, 
        error: err.message,
        code: err.code 
      });
      results.failed.push({ phone, error: err.message });
    }
    
    // Rate limiting - wait between messages
    if (i < phoneNumbers.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  logger.action('Bulk send completed', {
    total: phoneNumbers.length,
    success: results.success.length,
    failed: results.failed.length
  });
  
  return results;
}

/**
 * חילוץ שם עיר מכתובת מלאה
 */
function extractCity(address) {
  if (!address || typeof address !== 'string') return '---';
  
  address = address.trim();
  
  // אם יש פסיק - קח את החלק האחרון
  if (address.includes(',')) {
    const parts = address.split(',').map(p => p.trim());
    return parts[parts.length - 1] || '---';
  }
  
  // הסר מספרי רחוב וקח רק שם עיר
  const words = address.split(' ');
  const nonNumericWords = words.filter(word => {
    const cleaned = word.replace(/[^\d]/g, '');
    return cleaned.length === 0 || cleaned.length !== word.length;
  });
  
  if (nonNumericWords.length >= 2) {
    return nonNumericWords.slice(-2).join(' ');
  } else if (nonNumericWords.length === 1) {
    return nonNumericWords[0];
  }
  
  return address;
}

/**
 * Create group message for new ride
 * 🔒 מציג רק פרטים חלקיים למניעת גניבת נסיעות!
 */
function createGroupMessage(ride) {
  // חילוץ רק שם העיר (לא כתובת מדויקת!)
  const pickupCity = extractCity(ride.pickup);
  const destCity = extractCity(ride.destination);
  
  // אם יש קישור ייחודי - השתמש בו
  const linkText = ride.uniqueLink 
    ? `⚠️ *לפרטים מלאים - לחץ על הקישור:*\n${ride.uniqueLink}\n\n⏰ *נהג ראשון שמגיב - מקבל את הנסיעה!*\n\n🔒 *פרטי הלקוח והכתובת המדויקת יישלחו רק לנהג שלוקח את הנסיעה*`
    : `💬 לקבלה - כתבו:\nACCEPT ${ride._id}`;

  return `🚖 *נסיעה חדשה!* ${ride.rideNumber}

📍 *מ:* ${pickupCity}
🎯 *ל:* ${destCity}
💰 *מחיר:* ₪${ride.price}
${ride.scheduledTime ? `🕐 *שעה:* ${new Date(ride.scheduledTime).toLocaleString('he-IL')}` : '⚡ *נסיעה מיידית*'}

${linkText}`;
}

/**
 * Create private message for driver who accepted
 * ✅ כאן כן מראים הכל - זה הולך רק לנהג שקיבל!
 */
function createPrivateMessage(ride) {
  return `✅ קיבלת את הנסיעה ${ride.rideNumber}!

📞 לקוח: ${ride.customerName} - ${ride.customerPhone}
📍 איסוף: ${ride.pickup}
🎯 יעד: ${ride.destination}
💰 מחיר: ₪${ride.price}
${ride.notes ? `📝 הערות: ${ride.notes}` : ''}

להצלחה! 🚗`;
}

// ===============================================
// 📍 API ENDPOINTS
// ===============================================

// ========== HEALTH CHECK ==========
app.get("/health", async (req, res) => {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    version: "2.1.0",
    components: {
      mongodb: "unknown",
      twilio: "unknown",
      bot: "not_configured"
    }
  };
  
  // Check MongoDB
  try {
    await mongoose.connection.db.admin().ping();
    health.components.mongodb = "connected";
  } catch (err) {
    health.components.mongodb = "disconnected";
    health.status = "error";
    logger.error("Health check: MongoDB disconnected", err);
  }
  
  // Check Twilio (optional - can take time)
  try {
    const isValid = await twilioAdapter.checkCredentials();
    health.components.twilio = isValid ? "connected" : "error";
  } catch (err) {
    health.components.twilio = "error";
    health.status = "degraded";
  }
  
  // Check Bot (if configured)
  if (process.env.BOT_URL) {
    try {
      const botCheck = await fetchWithTimeout(
        `${process.env.BOT_URL}/health`,
        {},
        5000, // 5 seconds timeout
        1     // 1 retry only
      );
      health.components.bot = botCheck.ok ? "connected" : "disconnected";
    } catch {
      health.components.bot = "disconnected";
    }
  }
  
  const statusCode = health.status === "ok" ? 200 : 503;
  res.status(statusCode).json(health);
});

// ========== LOGIN ==========
app.post("/api/login", async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ 
        ok: false, 
        error: "נא להזין סיסמה" 
      });
    }
    
    // Use bcrypt to compare password with hashed version
    const passwordHash = process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD;
    const isValid = await bcrypt.compare(password, passwordHash);
    
    if (!isValid) {
      logger.warn("Failed login attempt", { 
        requestId: req.id,
        ip: req.ip 
      });
      return res.status(401).json({ 
        ok: false, 
        error: ERRORS.AUTH.WRONG_PASSWORD 
      });
    }
    
    const token = jwt.sign(
      { 
        user: "admin", 
        role: "admin",
        loginTime: new Date().toISOString()
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: "24h" }
    );
    
    logger.success("Successful login", { 
      requestId: req.id,
      ip: req.ip 
    });
    
    res.json({ 
      ok: true, 
      token,
      expiresIn: 86400,
      message: "כניסה בהצלחה!"
    });
  } catch (err) {
    logger.error("Login error", { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({ 
      ok: false, 
      error: ERRORS.SERVER.UNKNOWN 
    });
  }
});

// ========== LOGOUT ==========
app.post("/api/logout", authenticateToken, (req, res) => {
  try {
    logger.action("User logged out", { requestId: req.id });
    res.json({ ok: true, message: "התנתקת בהצלחה" });
  } catch (err) {
    res.status(500).json({ ok: false, error: "שגיאה בהתנתקות" });
  }
});

// ========== CLIENT: GET GROUPS ==========
app.get("/api/client/groups", async (req, res) => {
  try {
    const groups = await WhatsAppGroup.find({ isActive: true })
      .select('name _id')
      .lean();
    
    res.json({ ok: true, groups });
  } catch (err) {
    logger.error("Error getting groups", { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({ 
      ok: false, 
      error: ERRORS.SERVER.DATABASE 
    });
  }
});

// ========== CLIENT: CREATE RIDE ==========
app.post("/api/client/rides", async (req, res) => {
  try {
    const { 
      customerName, 
      customerPhone, 
      pickup, 
      destination, 
      scheduledTime, 
      notes
    } = req.body;

    // Validation
    if (!customerName || !customerPhone || !pickup || !destination) {
      return res.status(400).json({ 
        ok: false, 
        error: "שדות חובה: שם, טלפון, איסוף, יעד" 
      });
    }

    const phoneRegex = /^(0|\+972)?5\d{8}$/;
    if (!phoneRegex.test(customerPhone.replace(/[\s\-]/g, ''))) {
      return res.status(400).json({ 
        ok: false, 
        error: ERRORS.VALIDATION.PHONE 
      });
    }

    if (customerName.trim().length < 2) {
      return res.status(400).json({ 
        ok: false, 
        error: ERRORS.VALIDATION.NAME 
      });
    }

    // Generate ride number
    const rideNumber = await rideNumberGenerator.formatRideNumber();
    
    // Default price
    const defaultPrice = 50;

    // Create ride
    const ride = await Ride.create({
      rideNumber,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickup: pickup.trim(),
      destination: destination.trim(),
      scheduledTime: scheduledTime || null,
      notes: notes || null,
      price: defaultPrice,
      commissionRate: 0.10,
      commissionAmount: Math.round(defaultPrice * 0.10),
      status: "created",
      rideType: "regular",
      groupChat: "default",
      createdBy: "client",
      history: [{ 
        status: "created", 
        by: "client_website",
        timestamp: new Date(),
        details: "הזמנה מאתר הלקוחות"
      }]
    });

    logger.success("Ride created from client", {
      requestId: req.id,
      rideId: ride._id,
      rideNumber: ride.rideNumber
    });

    // ✨ ארכיטקטורה חדשה: יצירת קישור ייחודי!
    const { link, token } = generateUniqueRideLink(ride._id);
    
    // שמירת הקישור והtoken בnسيعה
    ride.uniqueLink = link;
    ride.uniqueToken = token;
    await ride.save();
    
    logger.success("Unique link generated", { 
      rideNumber: ride.rideNumber,
      linkPreview: link.substring(0, 40) + '...'
    });

    // 🧠 שליחה חכמה דרך DispatchManager
    // מנסה בוט ראשון, ואם נכשל - עובר ל-Twilio אוטומטית
    dispatchManager.sendRide(ride)
      .then(result => {
        logger.success('Ride dispatched successfully', {
          rideNumber: ride.rideNumber,
          method: result.method,
          responseTime: result.responseTime
        });
      })
      .catch(err => {
        logger.error('Failed to dispatch ride', {
          rideNumber: ride.rideNumber,
          error: err.message
        });
        // אפשר להוסיף כאן התראה למנהל או ניסיון חוזר
      });

    // WebSocket update
    if (websockets) {
      websockets.emitNewRide(ride);
    }

    res.json({ 
      ok: true, 
      ride: {
        _id: ride._id,
        rideNumber: ride.rideNumber,
        status: ride.status,
        customerName: ride.customerName,
        pickup: ride.pickup,
        destination: ride.destination
      },
      message: ride.status === 'distributed' 
        ? `✅ הנסיעה הוזמנה ונשלחה לנהגים! מספר: ${ride.rideNumber}` 
        : `⚠️ נסיעה נוצרה (${ride.rideNumber}) אך לא נשלחה לנהגים. בדוק את הבוט.`
    });
  } catch (err) {
    logger.error("Error creating ride from client", { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({ 
      ok: false, 
      error: ERRORS.SERVER.UNKNOWN 
    });
  }
});

// ========== GET RIDES (WITH PAGINATION) ==========
app.get("/api/rides", authenticateToken, async (req, res) => {
  try {
    // Pagination parameters
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;
    
    // Filters
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.driverPhone) {
      filter.driverPhone = req.query.driverPhone;
    }
    if (req.query.fromDate) {
      filter.createdAt = { $gte: new Date(req.query.fromDate) };
    }
    if (req.query.toDate) {
      filter.createdAt = { 
        ...filter.createdAt, 
        $lte: new Date(req.query.toDate) 
      };
    }
    
    // Query with pagination
    const [rides, total] = await Promise.all([
      Ride.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .select('rideNumber customerName customerPhone pickup destination status price driverPhone createdAt')
        .lean(),
      Ride.countDocuments(filter)
    ]);
    
    logger.action("Rides fetched", { 
      requestId: req.id,
      page, 
      limit, 
      total, 
      resultsCount: rides.length 
    });
    
    res.json({
      ok: true,
      rides,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    logger.error("Error fetching rides", { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({ 
      ok: false, 
      error: ERRORS.SERVER.DATABASE 
    });
  }
});

// ========== CREATE RIDE (ADMIN) ==========
app.post("/api/rides", authenticateToken, async (req, res) => {
  try {
    const { 
      customerName, 
      customerPhone, 
      pickup, 
      destination, 
      scheduledTime, 
      notes, 
      price, 
      commissionRate, 
      sendTo,
      sendToGroup,
      rideType = "regular",
      specialNotes = [],
      groupChat = "default"
    } = req.body;

    // Validation
    if (!customerName || !customerPhone || !pickup || !destination || price === undefined) {
      return res.status(400).json({ 
        ok: false, 
        error: "שדות חובה: שם, טלפון, איסוף, יעד, מחיר" 
      });
    }

    const phoneRegex = /^(0|\+972)?5\d{8}$/;
    if (!phoneRegex.test(customerPhone.replace(/[\s\-]/g, ''))) {
      return res.status(400).json({ 
        ok: false, 
        error: ERRORS.VALIDATION.PHONE 
      });
    }

    if (price < 0) {
      return res.status(400).json({ 
        ok: false, 
        error: ERRORS.VALIDATION.PRICE 
      });
    }

    const commission = Math.round((price || 0) * (commissionRate || 0.10));
    const rideNumber = await rideNumberGenerator.formatRideNumber();
    
    const ride = await Ride.create({
      rideNumber,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickup: pickup.trim(),
      destination: destination.trim(),
      scheduledTime: scheduledTime || null,
      notes: notes || null,
      price: price,
      commissionRate: commissionRate || 0.10,
      commissionAmount: commission,
      status: "created",
      rideType,
      specialNotes,
      groupChat,
      createdBy: "admin",
      history: [{ 
        status: "created", 
        by: "admin",
        timestamp: new Date(),
        details: "נסיעה נוצרה מממשק הניהול"
      }]
    });

    // יצירת קישור ייחודי
    const { link, token } = generateUniqueRideLink(ride._id);
    ride.uniqueLink = link;
    ride.uniqueToken = token;
    await ride.save();

    logger.success("Ride created by admin", {
      requestId: req.id,
      rideId: ride._id,
      rideNumber: ride.rideNumber,
      uniqueLink: link.substring(0, 40) + '...'
    });

    // 🧠 שליחה חכמה דרך DispatchManager
    dispatchManager.sendRide(ride)
      .then(result => {
        logger.success('Ride dispatched successfully', {
          rideNumber: ride.rideNumber,
          method: result.method,
          responseTime: result.responseTime
        });
      })
      .catch(err => {
        logger.error('Failed to dispatch ride', {
          rideNumber: ride.rideNumber,
          error: err.message
        });
      });
    let phonesToSend = [];
    
    if (sendTo === 'specific' && sendToGroup) {
      const group = await WhatsAppGroup.findById(sendToGroup);
      if (group?.isActive && group.phoneNumbers?.length > 0) {
        phonesToSend = group.phoneNumbers;
      }
    } else {
      const defaultGroup = await WhatsAppGroup.findOne({ isDefault: true, isActive: true });
      if (defaultGroup?.phoneNumbers?.length > 0) {
        phonesToSend = defaultGroup.phoneNumbers;
      } else {
        const drivers = await Driver.find({ isActive: true }, 'phone');
        phonesToSend = drivers.map(d => d.phone);
      }
    }

    let successCount = 0;
    if (phonesToSend.length > 0) {
      const message = createGroupMessage(ride);
      const results = await sendBulkMessagesWithRateLimit(phonesToSend, message);
      successCount = results.success.length;
      
      if (successCount > 0) {
        ride.status = "sent";
        ride.history.push({
          status: "sent",
          by: "system",
          details: `נשלח ל-${successCount} נהגים`,
          timestamp: new Date()
        });
        await ride.save();
      }
    }

    res.json({
      ok: true,
      ride,
      sentCount: successCount
    });
  } catch (err) {
    logger.error("Error creating ride", { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({ 
      ok: false, 
      error: ERRORS.SERVER.UNKNOWN 
    });
  }
});

// ========== TWILIO WEBHOOK ==========
// ===============================================
// 🤖 TWILIO WEBHOOK - נהג לחץ קישור!
// ===============================================
app.post("/api/twilio/webhook", validateTwilioRequest, async (req, res) => {
  try {
    const { From, Body, MediaUrl0, NumMedia } = req.body;
    const driverPhone = From?.replace('whatsapp:', '');
    
    logger.info('📩 Twilio webhook received', { 
      from: From, 
      body: Body?.substring(0, 50),
      hasMedia: NumMedia > 0
    });
    
    // ===============================================
    // 🔍 STEP 1: Check for registration flow
    // ===============================================
    const registrationResult = await registrationHandler.handleMessage(
      driverPhone, 
      Body, 
      MediaUrl0
    );
    
    if (registrationResult) {
      // This is a registration message
      return res.status(200).send(registrationResult);
    }
    
    // ===============================================
    // 🔍 STEP 2: Check for special commands
    // ===============================================
    const normalizedBody = Body?.trim().toLowerCase();
    
    // Status command
    if (normalizedBody === 'סטטוס' || normalizedBody === 'status') {
      const status = await registrationHandler.getStatus(driverPhone);
      return res.status(200).send(status);
    }
    
    // Cancel registration command
    if (normalizedBody === 'ביטול רישום' || normalizedBody === 'cancel registration') {
      const cancelResult = await registrationHandler.cancelRegistration(driverPhone);
      return res.status(200).send(cancelResult);
    }
    
    // ===============================================
    // 🔍 STEP 3: Check for ride link (RIDE:id:token)
    // ===============================================
    const match = Body?.match(/RIDE:([a-f0-9]+):([a-f0-9]+)/);
    
    if (!match) {
      // Not a ride link - maybe status update
      return handleStatusUpdate(req, res);
    }
    
    const [, rideId, token] = match;
    
    // 🔍 STEP 1: Find driver FIRST
    let driver = await Driver.findOne({ phone: driverPhone });
    
    if (!driver) {
      // ❌ נהג לא רשום - הצע רישום!
      logger.warn('❌ Unregistered driver attempt', { 
        driverPhone
      });
      
      return res.status(200).send(`❌ *אתה לא רשום במערכת*

לא ניתן לקחת נסיעות ללא רישום.

💡 *רוצה להירשם?*
שלח את המילה: *הרשמה*

📞 או פנה למנהל לעזרה.`);
    }
    
    // ✅ נהג קיים - בדוק אם מורשה
    if (!driver.isActive) {
      logger.warn('❌ Inactive driver attempt', { 
        driverPhone,
        driverName: driver.name 
      });
      
      return res.status(200).send(`❌ *החשבון שלך לא פעיל*

נא פנה למנהל להפעלת החשבון.`);
    }
    
    // 🔍 STEP 2: Find ride
    const ride = await Ride.findById(rideId);
    
    if (!ride) {
      logger.warn('Ride not found', { rideId, driverPhone });
      return res.status(200).send('❌ נסיעה לא נמצאה');
    }
    
    // Verify token
    if (ride.uniqueToken !== token) {
      logger.warn('Invalid token', { rideId, driverPhone });
      return res.status(200).send('❌ קישור לא תקין');
    }
    
    // Check if ride already taken
    if (ride.status !== 'distributed' && ride.status !== 'created' && ride.status !== 'sent') {
      logger.warn('Ride already taken', { 
        rideNumber: ride.rideNumber, 
        currentStatus: ride.status 
      });
      return res.status(200).send('😔 הנסיעה כבר נלקחה על ידי נהג אחר');
    }
    
    // ===============================================
    // 🔒 ATOMIC LOCK - תיקון קריטי!
    // ===============================================
    // במקום לבדוק ואז לשנות (race condition),
    // עושים את זה אטומית עם findOneAndUpdate
    
    const lockedRide = await Ride.findOneAndUpdate(
      { 
        _id: ride._id,
        status: { $in: ['distributed', 'created', 'sent'] } // רק אם עדיין זמין!
      },
      {
        $set: {
          status: 'assigned',
          driverPhone,
          driverName: driver.name,
          driverId: driver._id,
          assignedAt: new Date()
        },
        $push: {
          history: {
            status: 'assigned',
            by: driverPhone,
            timestamp: new Date(),
            details: `נסיעה נלקחה על ידי ${driver.name}`
          }
        }
      },
      { new: true }
    );
    
    // אם לא הצלחנו לנעול - הנסיעה כבר נלקחה!
    if (!lockedRide) {
      logger.warn('🔒 Lock failed - ride already taken', {
        rideNumber: ride.rideNumber,
        attemptBy: driver.name,
        driverPhone
      });
      return res.status(200).send('😔 הנסיעה כבר נלקחה על ידי נהג אחר במהירות הברק! ⚡');
    }
    
    // ✅ הצלחנו לנעול את הנסיעה!
    logger.success('🔒✅ Ride locked atomically', {
      rideNumber: lockedRide.rideNumber,
      driverName: driver.name,
      driverId: driver.driverId,
      driverPhone
    });
    
    // השתמש ב-lockedRide מעכשיו
    const finalRide = lockedRide;
    
    // Check if driver is approved
    if (driver.registrationStatus !== 'approved') {
      if (driver.registrationStatus === 'pending') {
        return res.status(200).send(`⏳ *הבקשה שלך בטיפול*

מזהה הנהג שלך: *${driver.driverId}*

המנהל עדיין לא אישר את הבקשה שלך.
נעדכן אותך ברגע שתאושר!`);
      } else if (driver.registrationStatus === 'rejected') {
        return res.status(200).send(`❌ *הבקשה שלך נדחתה*

סיבה: ${driver.rejectionReason || 'לא צוינה'}

אם אתה חושב שזו טעות, פנה למנהל.`);
      }
    }
    
    // Check if driver is active
    if (!driver.isActive) {
      return res.status(200).send(`⚠️ *חשבון לא פעיל*

החשבון שלך אינו פעיל כרגע.
פנה למנהל להפעלת החשבון.`);
    }
    
    // Check if driver is blocked
    if (driver.isBlocked) {
      logger.warn('❌ Blocked driver attempt', { 
        driverPhone, 
        driverName: driver.name,
        rideNumber: ride.rideNumber 
      });
      
      return res.status(200).send(`❌ *חשבון חסום*

${driver.blockReason || 'פנה למנהל לפרטים'}`);
    }
    
    // Update driver stats
    driver.stats.totalRides = (driver.stats.totalRides || 0) + 1;
    driver.lastActive = new Date();
    await driver.save();
    
    logger.success('✅ Ride assigned to driver', {
      rideNumber: finalRide.rideNumber,
      driverName: driver.name,
      driverId: driver.driverId,
      driverPhone
    });
    
    // WebSocket update
    if (websockets) {
      websockets.emitRideUpdate(finalRide._id, {
        event: 'assigned',
        status: 'assigned',
        driverName: driver.name,
        driverId: driver.driverId,
        driverPhone
      });
    }
    
    // Log activity
    await Activity.create({
      type: 'ride_assigned',
      userId: driverPhone,
      description: `נסיעה ${finalRide.rideNumber} שוייכה לנהג ${driver.name} (${driver.driverId})`,
      metadata: { rideId: finalRide._id, driverId: driver.driverId, driverPhone, source: 'twilio_link' }
    });
    
    // 📱 Send ride details with buttons
    const netPrice = finalRide.price - (finalRide.commissionAmount || Math.round(finalRide.price * 0.1));
    
    const response = `✅ *מזל טוב ${driver.name}!*

🚖 *נסיעה ${finalRide.rideNumber}*

👤 *לקוח:* ${finalRide.customerName}
☎️  *טלפון:* ${finalRide.customerPhone}

📍 *איסוף:* ${finalRide.pickup}
🎯 *יעד:* ${finalRide.destination}
${finalRide.scheduledTime ? `🕐 *שעה:* ${new Date(finalRide.scheduledTime).toLocaleString('he-IL')}` : '⚡ *מיידית*'}

💰 *מחיר:* ₪${finalRide.price}
💸 *נטו:* ₪${netPrice}

${finalRide.notes ? `📝 *הערות:* ${finalRide.notes}\n` : ''}---

*מה הסטטוס?*

שלח:
1 - בדרך ללקוח
2 - בעיה - ביטול`;
    
    res.status(200).send(response);
    
  } catch (err) {
    logger.error('❌ Twilio webhook error', err);
    res.status(200).send('❌ שגיאת שרת');
  }
});

// ===============================================
// 📊 STATUS UPDATES from Driver
// ===============================================
async function handleStatusUpdate(req, res) {
  try {
    const { From, Body } = req.body;
    const driverPhone = From.replace('whatsapp:', '');
    const input = Body?.trim();
    
    // Find active ride for this driver
    const ride = await Ride.findOne({
      driverPhone,
      status: { $in: ['assigned', 'enroute', 'arrived'] }
    }).sort({ createdAt: -1 });
    
    if (!ride) {
      return res.status(200).send('אין נסיעה פעילה');
    }
    
    let response = '';
    let newStatus = ride.status;
    
    // State machine logic
    if (ride.status === 'assigned') {
      if (input === '1') {
        // בדרך ללקוח
        newStatus = 'enroute';
        ride.history.push({
          status: 'enroute',
          by: driverPhone,
          timestamp: new Date(),
          details: 'נהג בדרך ללקוח'
        });
        response = `🚗 *בדרך ללקוח*

הלקוח קיבל הודעה!

שלח:
1 - הגעתי`;
      } else if (input === '2') {
        // ביטול
        newStatus = 'cancelled';
        ride.history.push({
          status: 'cancelled',
          by: driverPhone,
          timestamp: new Date(),
          details: 'נהג ביטל - בעיה'
        });
        response = '❌ נסיעה בוטלה';
      }
    } else if (ride.status === 'enroute') {
      if (input === '1') {
        // הגעתי
        newStatus = 'arrived';
        ride.history.push({
          status: 'arrived',
          by: driverPhone,
          timestamp: new Date(),
          details: 'נהג הגיע ללקוח'
        });
        response = `📍 *הגעת ללקוח*

שלח:
1 - סיימתי נסיעה`;
      }
    } else if (ride.status === 'arrived') {
      if (input === '1') {
        // סיימתי
        newStatus = 'finished';
        ride.history.push({
          status: 'finished',
          by: driverPhone,
          timestamp: new Date(),
          details: 'נסיעה הושלמה'
        });
        
        const netPrice = ride.price - (ride.commissionAmount || Math.round(ride.price * 0.1));
        response = `🎉 *נסיעה הושלמה!*

💰 הכנסה: ₪${netPrice}

⭐ דרג את הנסיעה (1-5):`;
      }
    } else if (ride.status === 'finished' && /^[1-5]$/.test(input)) {
      // דירוג
      const rating = parseInt(input);
      ride.rating = rating;
      ride.history.push({
        status: 'rated',
        by: driverPhone,
        timestamp: new Date(),
        details: `דירוג: ${rating}/5`
      });
      
      await ride.save();
      
      logger.info('Rating submitted', { 
        rideNumber: ride.rideNumber, 
        rating 
      });
      
      return res.status(200).send(`⭐ תודה על הדירוג (${rating}/5)!

ממתינים לנסיעה הבאה... 🚗`);
    }
    
    // Update status if changed
    if (newStatus !== ride.status) {
      ride.status = newStatus;
      await ride.save();
      
      // WebSocket update
      if (websockets) {
        websockets.emitRideUpdate(ride._id, {
          event: 'status_changed',
          status: newStatus,
          driverPhone
        });
      }
      
      logger.info('Ride status updated', {
        rideNumber: ride.rideNumber,
        newStatus
      });
    }
    
    res.status(200).send(response || 'אפשרות לא תקינה');
    
  } catch (err) {
    logger.error('Status update error', err);
    res.status(200).send('❌ שגיאה');
  }
}

// ========== UPDATE RIDE STATUS ==========
app.put("/api/rides/:id/status", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    const validStatuses = ["created", "sent", "approved", "enroute", "arrived", "finished", "commission_paid", "cancelled"];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.RIDE.INVALID_STATUS
      });
    }
    
    const ride = await Ride.findByIdAndUpdate(
      id,
      {
        status,
        $push: {
          history: {
            status,
            by: "admin",
            details: notes || `סטטוס שונה ל-${status}`,
            timestamp: new Date()
          }
        }
      },
      { new: true }
    );
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.RIDE.NOT_FOUND
      });
    }
    
    logger.action("Ride status updated", {
      requestId: req.id,
      rideId: id,
      newStatus: status
    });
    
    res.json({ ok: true, ride });
  } catch (err) {
    logger.error("Error updating ride status", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== GET DRIVERS ==========
app.get("/api/drivers", authenticateToken, async (req, res) => {
  try {
    const drivers = await Driver.find()
      .sort({ name: 1 })
      .lean();
    
    res.json({ ok: true, drivers });
  } catch (err) {
    logger.error("Error fetching drivers", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});

// ========== CREATE DRIVER ==========
app.post("/api/drivers", authenticateToken, async (req, res) => {
  try {
    const { name, phone, licenseNumber } = req.body;
    
    if (!name || !phone) {
      return res.status(400).json({
        ok: false,
        error: "שדות חובה: שם וטלפון"
      });
    }
    
    const phoneRegex = /^(0|\+972)?5\d{8}$/;
    if (!phoneRegex.test(phone.replace(/[\s\-]/g, ''))) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.VALIDATION.PHONE
      });
    }
    
    // Check if phone exists
    const existing = await Driver.findOne({ phone });
    if (existing) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.DRIVER.PHONE_EXISTS
      });
    }
    
    const driver = await Driver.create({
      name: name.trim(),
      phone: phone.trim(),
      licenseNumber: licenseNumber || null,
      isActive: true,
      isBlocked: false
    });
    
    logger.success("Driver created", {
      requestId: req.id,
      driverId: driver._id,
      name: driver.name
    });
    
    res.json({ ok: true, driver });
  } catch (err) {
    logger.error("Error creating driver", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== GET GROUPS ==========
app.get("/api/groups", authenticateToken, async (req, res) => {
  try {
    const groups = await WhatsAppGroup.find()
      .sort({ name: 1 })
      .lean();
    
    res.json({ ok: true, groups });
  } catch (err) {
    logger.error("Error fetching groups", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});

// ========== CREATE GROUP ==========
app.post("/api/groups", authenticateToken, async (req, res) => {
  try {
    const { name, phoneNumbers, isDefault } = req.body;
    
    if (!name || !phoneNumbers || !Array.isArray(phoneNumbers)) {
      return res.status(400).json({
        ok: false,
        error: "שדות חובה: שם ומספרי טלפון"
      });
    }
    
    // Check if name exists
    const existing = await WhatsAppGroup.findOne({ name });
    if (existing) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.GROUP.NAME_EXISTS
      });
    }
    
    // If this should be default, unset other defaults
    if (isDefault) {
      await WhatsAppGroup.updateMany({}, { isDefault: false });
    }
    
    const group = await WhatsAppGroup.create({
      name: name.trim(),
      phoneNumbers,
      isDefault: !!isDefault,
      isActive: true
    });
    
    logger.success("Group created", {
      requestId: req.id,
      groupId: group._id,
      name: group.name
    });
    
    res.json({ ok: true, group });
  } catch (err) {
    logger.error("Error creating group", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== ANALYTICS ==========
app.get("/api/analytics", authenticateToken, async (req, res) => {
  try {
    const { period = '7days' } = req.query;
    
    const now = new Date();
    const periods = {
      '24hours': new Date(now - 24 * 60 * 60 * 1000),
      '7days': new Date(now - 7 * 24 * 60 * 60 * 1000),
      '30days': new Date(now - 30 * 24 * 60 * 60 * 1000),
      '90days': new Date(now - 90 * 24 * 60 * 60 * 1000)
    };
    const startDate = periods[period] || periods['7days'];
    
    // Rides by status
    const ridesByStatus = await Ride.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // Revenue
    const revenue = await Ride.aggregate([
      { 
        $match: { 
          createdAt: { $gte: startDate },
          status: { $in: ['finished', 'commission_paid'] }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$price' },
          totalCommission: { $sum: '$commissionAmount' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Top drivers
    const topDrivers = await Ride.aggregate([
      { 
        $match: { 
          createdAt: { $gte: startDate },
          status: 'finished',
          driverPhone: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$driverPhone',
          ridesCount: { $sum: 1 },
          totalRevenue: { $sum: '$price' }
        }
      },
      { $sort: { ridesCount: -1 } },
      { $limit: 10 }
    ]);
    
    // Add driver names
    for (const driver of topDrivers) {
      const driverDoc = await Driver.findOne({ phone: driver._id });
      driver.name = driverDoc?.name || 'לא ידוע';
    }
    
    res.json({
      ok: true,
      period,
      analytics: {
        ridesByStatus,
        revenue: revenue[0] || { totalRevenue: 0, totalCommission: 0, count: 0 },
        topDrivers
      }
    });
  } catch (err) {
    logger.error("Error getting analytics", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== STATISTICS (for dashboard) ==========
app.get("/api/statistics", authenticateToken, async (req, res) => {
  try {
    // Count rides by status
    const ridesCount = await Ride.countDocuments();
    const activeRides = await Ride.countDocuments({ 
      status: { $in: ['sent', 'approved', 'enroute'] } 
    });
    const finishedToday = await Ride.countDocuments({
      status: 'finished',
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
    });
    
    // Count drivers
    const driversCount = await Driver.countDocuments();
    const activeDrivers = await Driver.countDocuments({ isActive: true });
    
    // Revenue today
    const revenueToday = await Ride.aggregate([
      {
        $match: {
          status: 'finished',
          createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$price' },
          commission: { $sum: '$commissionAmount' }
        }
      }
    ]);
    
    const todayRevenue = revenueToday[0] || { total: 0, commission: 0 };
    
    res.json({
      ok: true,
      stats: {
        rides: {
          total: ridesCount,
          active: activeRides,
          finishedToday
        },
        drivers: {
          total: driversCount,
          active: activeDrivers
        },
        revenue: {
          today: todayRevenue.total,
          commission: todayRevenue.commission
        }
      }
    });
  } catch (err) {
    logger.error("Error getting statistics", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});

// ========== ACTIVITIES ==========
app.get("/api/activities", authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    
    const activities = await Activity.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    
    res.json({
      ok: true,
      activities
    });
  } catch (err) {
    logger.error("Error getting activities", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});

// ========== ADMIN CONTACT ==========
app.get("/api/admin-contact", authenticateToken, async (req, res) => {
  try {
    // Get the first (and should be only) admin contact
    const contact = await AdminContact.findOne().lean();
    
    res.json({
      ok: true,
      contact: contact || null
    });
  } catch (err) {
    logger.error("Error getting admin contact", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});

app.post("/api/admin-contact", authenticateToken, async (req, res) => {
  try {
    const { adminName, adminPhone, adminEmail, appealMessage } = req.body;
    
    if (!adminName || !adminPhone) {
      return res.status(400).json({
        ok: false,
        error: "שדות חובה: שם וטלפון"
      });
    }
    
    const contact = await AdminContact.create({
      adminName: adminName.trim(),
      adminPhone: adminPhone.trim(),
      adminEmail: adminEmail || null,
      appealMessage: appealMessage || "⚠️ עברתי על התקנות - בקשה להסרת חסימה"
    });
    
    logger.success("Admin contact created", {
      requestId: req.id,
      contactId: contact._id
    });
    
    res.json({
      ok: true,
      contact
    });
  } catch (err) {
    logger.error("Error creating admin contact", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

app.put("/api/admin-contact/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { adminName, adminPhone, adminEmail, appealMessage, isActive } = req.body;
    
    const updateData = {};
    if (adminName !== undefined) updateData.adminName = adminName;
    if (adminPhone !== undefined) updateData.adminPhone = adminPhone;
    if (adminEmail !== undefined) updateData.adminEmail = adminEmail;
    if (appealMessage !== undefined) updateData.appealMessage = appealMessage;
    if (isActive !== undefined) updateData.isActive = isActive;
    updateData.updatedAt = Date.now();
    
    const contact = await AdminContact.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );
    
    if (!contact) {
      return res.status(404).json({
        ok: false,
        error: "איש קשר לא נמצא"
      });
    }
    
    res.json({
      ok: true,
      contact
    });
  } catch (err) {
    logger.error("Error updating admin contact", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

app.delete("/api/admin-contact/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const contact = await AdminContact.findByIdAndDelete(id);
    
    if (!contact) {
      return res.status(404).json({
        ok: false,
        error: "איש קשר לא נמצא"
      });
    }
    
    res.json({
      ok: true,
      message: "איש קשר נמחק בהצלחה"
    });
  } catch (err) {
    logger.error("Error deleting admin contact", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== DEFAULT GROUP ==========
app.get("/api/admin/default-group", authenticateToken, async (req, res) => {
  try {
    const defaultGroup = await WhatsAppGroup.findOne({ isDefault: true });
    
    res.json({
      ok: true,
      defaultGroup: defaultGroup || null
    });
  } catch (err) {
    logger.error("Error getting default group", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});

app.post("/api/admin/default-group", authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.body;
    
    if (!groupId) {
      return res.status(400).json({
        ok: false,
        error: "נדרש מזהה קבוצה"
      });
    }
    
    // Remove default from all groups
    await WhatsAppGroup.updateMany({}, { isDefault: false });
    
    // Set new default
    const group = await WhatsAppGroup.findByIdAndUpdate(
      groupId,
      { isDefault: true },
      { new: true }
    );
    
    if (!group) {
      return res.status(404).json({
        ok: false,
        error: "קבוצה לא נמצאה"
      });
    }
    
    logger.success("Default group updated", {
      requestId: req.id,
      groupId: group._id,
      groupName: group.name
    });
    
    res.json({
      ok: true,
      group
    });
  } catch (err) {
    logger.error("Error setting default group", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== UPDATE GROUP ==========
app.put("/api/groups/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phoneNumbers, isDefault, isActive } = req.body;
    
    // If setting as default, unset others
    if (isDefault) {
      await WhatsAppGroup.updateMany(
        { _id: { $ne: id } },
        { isDefault: false }
      );
    }
    
    const group = await WhatsAppGroup.findByIdAndUpdate(
      id,
      { name, phoneNumbers, isDefault, isActive },
      { new: true }
    );
    
    if (!group) {
      return res.status(404).json({
        ok: false,
        error: "קבוצה לא נמצאה"
      });
    }
    
    logger.success("Group updated", {
      requestId: req.id,
      groupId: group._id
    });
    
    res.json({
      ok: true,
      group
    });
  } catch (err) {
    logger.error("Error updating group", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

app.delete("/api/groups/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const group = await WhatsAppGroup.findById(id);
    
    if (!group) {
      return res.status(404).json({
        ok: false,
        error: "קבוצה לא נמצאה"
      });
    }
    
    if (group.isDefault) {
      return res.status(400).json({
        ok: false,
        error: "לא ניתן למחוק את קבוצת ברירת המחדל"
      });
    }
    
    await WhatsAppGroup.findByIdAndDelete(id);
    
    logger.success("Group deleted", {
      requestId: req.id,
      groupId: id
    });
    
    res.json({
      ok: true,
      message: "קבוצה נמחקה בהצלחה"
    });
  } catch (err) {
    logger.error("Error deleting group", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== UPDATE DRIVER ==========
app.put("/api/drivers/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, licenseNumber, isActive } = req.body;
    
    const driver = await Driver.findByIdAndUpdate(
      id,
      { name, phone, licenseNumber, isActive },
      { new: true }
    );
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: "נהג לא נמצא"
      });
    }
    
    logger.success("Driver updated", {
      requestId: req.id,
      driverId: driver._id
    });
    
    res.json({
      ok: true,
      driver
    });
  } catch (err) {
    logger.error("Error updating driver", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== GET SINGLE DRIVER ==========
app.get("/api/drivers/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const driver = await Driver.findById(id);
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: "נהג לא נמצא"
      });
    }
    
    logger.info("Driver fetched", {
      requestId: req.id,
      driverId: driver._id
    });
    
    res.json({
      ok: true,
      driver
    });
  } catch (err) {
    logger.error("Error fetching driver", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== VERIFY DOCUMENT ==========
app.post("/api/drivers/:id/verify-document", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { documentType, verified } = req.body;
    
    if (!['license', 'carLicense', 'insurance'].includes(documentType)) {
      return res.status(400).json({
        ok: false,
        error: "סוג מסמך לא תקין"
      });
    }
    
    const driver = await Driver.findById(id);
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: "נהג לא נמצא"
      });
    }
    
    // Update document verification status
    if (!driver.documents) {
      driver.documents = {};
    }
    if (!driver.documents[documentType]) {
      driver.documents[documentType] = {};
    }
    driver.documents[documentType].verified = verified;
    driver.documents[documentType].verifiedAt = new Date();
    driver.documents[documentType].verifiedBy = req.user.user;
    
    await driver.save();
    
    logger.success("Document verified", {
      requestId: req.id,
      driverId: driver._id,
      documentType,
      verified
    });
    
    // Log activity
    await Activity.create({
      type: verified ? 'document_verified' : 'document_unverified',
      userId: req.user.user,
      description: `מסמך ${documentType} ${verified ? 'אומת' : 'בוטל'} עבור נהג ${driver.name}`,
      metadata: { driverId: driver._id, documentType }
    });
    
    res.json({
      ok: true,
      driver
    });
  } catch (err) {
    logger.error("Error verifying document", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== SEND MESSAGE VIA BOT ==========
app.post("/api/bot/send-message", authenticateToken, async (req, res) => {
  try {
    const { phone, message } = req.body;
    
    if (!phone || !message) {
      return res.status(400).json({
        ok: false,
        error: "חסרים פרטים: טלפון והודעה"
      });
    }
    
    // Send request to bot
    const botUrl = process.env.BOT_URL || 'http://localhost:3001';
    
    const response = await fetchWithTimeout(`${botUrl}/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone,
        message
      })
    }, 10000, 3); // 10s timeout, 3 retries
    
    const data = await response.json();
    
    if (data.ok) {
      logger.success("Message sent via bot", {
        requestId: req.id,
        phone,
        messageLength: message.length
      });
      
      // Log activity
      await Activity.create({
        type: 'message_sent',
        userId: req.user.user,
        description: `הודעה נשלחה ל-${phone}`,
        metadata: { phone, messagePreview: message.substring(0, 50) }
      });
      
      res.json({
        ok: true,
        message: "ההודעה נשלחה בהצלחה"
      });
    } else {
      throw new Error('Bot failed to send message');
    }
  } catch (err) {
    logger.error("Error sending message via bot", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: "שגיאה בשליחת ההודעה"
    });
  }
});

app.delete("/api/drivers/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if driver has active rides
    const activeRides = await Ride.countDocuments({
      driverPhone: (await Driver.findById(id))?.phone,
      status: { $in: ['approved', 'enroute', 'arrived'] }
    });
    
    if (activeRides > 0) {
      return res.status(400).json({
        ok: false,
        error: "לא ניתן למחוק נהג עם נסיעות פעילות"
      });
    }
    
    await Driver.findByIdAndDelete(id);
    
    logger.success("Driver deleted", {
      requestId: req.id,
      driverId: id
    });
    
    res.json({
      ok: true,
      message: "נהג נמחק בהצלחה"
    });
  } catch (err) {
    logger.error("Error deleting driver", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== BLOCK/UNBLOCK DRIVER ==========
app.post("/api/drivers/:id/block", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const driver = await Driver.findById(id);
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: "נהג לא נמצא"
      });
    }
    
    driver.isBlocked = true;
    driver.blockReason = reason || 'לא צוין';
    driver.blockedAt = new Date();
    driver.isActive = false;
    await driver.save();
    
    logger.success("Driver blocked", {
      requestId: req.id,
      driverId: id,
      driverName: driver.name,
      reason
    });
    
    res.json({
      ok: true,
      message: "נהג נחסם בהצלחה",
      driver
    });
  } catch (err) {
    logger.error("Error blocking driver", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

app.post("/api/drivers/:id/unblock", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const driver = await Driver.findById(id);
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: "נהג לא נמצא"
      });
    }
    
    driver.isBlocked = false;
    driver.blockReason = null;
    driver.blockedAt = null;
    driver.isActive = true;
    await driver.save();
    
    logger.success("Driver unblocked", {
      requestId: req.id,
      driverId: id,
      driverName: driver.name
    });
    
    res.json({
      ok: true,
      message: "חסימת נהג הוסרה",
      driver
    });
  } catch (err) {
    logger.error("Error unblocking driver", {
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
// 📝 DRIVER REGISTRATION MANAGEMENT
// ===============================================

// Get pending registrations
app.get("/api/registrations/pending", authenticateToken, async (req, res) => {
  try {
    const drivers = await Driver.find({ 
      registrationStatus: 'pending'
    }).sort({ createdAt: -1 });
    
    logger.info("Fetched pending registrations", {
      requestId: req.id,
      count: drivers.length
    });
    
    res.json({
      ok: true,
      drivers,
      count: drivers.length
    });
  } catch (err) {
    logger.error("Error fetching pending registrations", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// Approve driver registration
app.post("/api/registrations/:id/approve", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const driver = await Driver.findById(id);
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: "נהג לא נמצא"
      });
    }
    
    if (driver.registrationStatus !== 'pending') {
      return res.status(400).json({
        ok: false,
        error: "הנהג כבר אושר או נדחה"
      });
    }
    
    // Approve driver
    driver.registrationStatus = 'approved';
    driver.isActive = true;
    driver.approvedBy = req.user.user;
    driver.approvedAt = new Date();
    await driver.save();
    
    logger.success("Driver registration approved", {
      requestId: req.id,
      driverId: driver._id,
      driverIdNumber: driver.driverId,
      driverName: driver.name,
      approvedBy: req.user.user
    });
    
    // Log activity
    await Activity.create({
      type: 'driver_approved',
      userId: req.user.user,
      description: `נהג ${driver.name} (${driver.driverId}) אושר`,
      metadata: { driverId: driver._id, driverIdNumber: driver.driverId }
    });
    
    // Send WhatsApp notification
    try {
      const message = `🎉 *מזל טוב ${driver.name}!*

הרישום שלך *אושר*! ✅

🆔 מזהה הנהג שלך: *${driver.driverId}*

אתה יכול להתחיל לקבל נסיעות עכשיו!

ברוכים הבאים למשפחת נהגי דרך צדיקים! 🚖`;
      
      await twilioAdapter.sendWhatsAppMessage(driver.phone, message);
      
      logger.success('Approval notification sent', {
        driverId: driver.driverId,
        phone: driver.phone
      });
    } catch (notifErr) {
      logger.error('Failed to send approval notification', {
        error: notifErr.message,
        driverId: driver.driverId
      });
    }
    
    res.json({
      ok: true,
      message: "נהג אושר בהצלחה",
      driver
    });
  } catch (err) {
    logger.error("Error approving driver", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// Reject driver registration
app.post("/api/registrations/:id/reject", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({
        ok: false,
        error: "נדרשת סיבת דחייה"
      });
    }
    
    const driver = await Driver.findById(id);
    
    if (!driver) {
      return res.status(404).json({
        ok: false,
        error: "נהג לא נמצא"
      });
    }
    
    if (driver.registrationStatus !== 'pending') {
      return res.status(400).json({
        ok: false,
        error: "הנהג כבר אושר או נדחה"
      });
    }
    
    // Reject driver
    driver.registrationStatus = 'rejected';
    driver.rejectionReason = reason;
    driver.isActive = false;
    await driver.save();
    
    logger.success("Driver registration rejected", {
      requestId: req.id,
      driverId: driver._id,
      driverName: driver.name,
      reason
    });
    
    // Log activity
    await Activity.create({
      type: 'driver_rejected',
      userId: req.user.user,
      description: `נהג ${driver.name} נדחה: ${reason}`,
      metadata: { driverId: driver._id, reason }
    });
    
    // Send WhatsApp notification
    try {
      const message = `❌ *הרישום נדחה*

${driver.name}, מצטערים אך הבקשה שלך להצטרף למערכת נדחתה.

*סיבה:*
${reason}

אם אתה חושב שזו טעות, אנא פנה למנהל.`;
      
      await twilioAdapter.sendWhatsAppMessage(driver.phone, message);
      
      logger.success('Rejection notification sent', {
        phone: driver.phone
      });
    } catch (notifErr) {
      logger.error('Failed to send rejection notification', {
        error: notifErr.message
      });
    }
    
    res.json({
      ok: true,
      message: "נהג נדחה",
      driver
    });
  } catch (err) {
    logger.error("Error rejecting driver", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// Get registration session details
app.get("/api/registrations/session/:phone", authenticateToken, async (req, res) => {
  try {
    const { phone } = req.params;
    
    const session = await RegistrationSession.findOne({ phone });
    const driver = await Driver.findOne({ phone });
    
    res.json({
      ok: true,
      session,
      driver
    });
  } catch (err) {
    logger.error("Error fetching registration session", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ========== GET SINGLE RIDE ==========
app.get("/api/rides/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const ride = await Ride.findById(id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: "נסיעה לא נמצאה"
      });
    }
    
    res.json({
      ok: true,
      ride
    });
  } catch (err) {
    logger.error("Error getting ride", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});

app.delete("/api/rides/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const ride = await Ride.findById(id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: "נסיעה לא נמצאה"
      });
    }
    
    if (!ride.canBeCancelled || !ride.canBeCancelled()) {
      return res.status(400).json({
        ok: false,
        error: "לא ניתן לבטל נסיעה בסטטוס זה"
      });
    }
    
    ride.status = 'cancelled';
    ride.history.push({
      status: 'cancelled',
      by: 'admin',
      details: 'נסיעה בוטלה מממשק הניהול',
      timestamp: new Date()
    });
    await ride.save();
    
    logger.success("Ride cancelled", {
      requestId: req.id,
      rideId: id
    });
    
    res.json({
      ok: true,
      message: "נסיעה בוטלה בהצלחה"
    });
  } catch (err) {
    logger.error("Error cancelling ride", {
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
// 🤖 NEW ENDPOINTS FOR INTERACTIVE BOT
// ===============================================

// Get ride by rideNumber
app.get('/api/rides/number/:rideNumber', async (req, res) => {
  try {
    const { rideNumber } = req.params;
    
    const ride = await Ride.findOne({ rideNumber });
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: 'נסיעה לא נמצאה'
      });
    }
    
    res.json({
      ok: true,
      ride
    });
  } catch (err) {
    logger.error('Error fetching ride by number', { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// Assign ride to driver (from WhatsApp bot)
app.post('/api/rides/:id/assign', async (req, res) => {
  try {
    const { id } = req.params;
    const { driverPhone, driverName } = req.body;
    
    if (!driverPhone || !driverName) {
      return res.status(400).json({
        ok: false,
        error: 'חסרים פרטי נהג'
      });
    }
    
    const ride = await Ride.findById(id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: 'נסיעה לא נמצאה'
      });
    }
    
    // Check if already taken
    if (ride.status !== 'sent' && ride.status !== 'created') {
      return res.status(400).json({
        ok: false,
        error: 'נסיעה כבר נלקחה',
        assignedTo: ride.driverName
      });
    }
    
    // Find driver
    let driver = await Driver.findOne({ phone: driverPhone });
    
    if (!driver) {
      // Create new driver
      driver = new Driver({
        name: driverName,
        phone: driverPhone,
        vehicleNumber: 'לא צוין',
        vehicleType: 'sedan',
        isActive: true
      });
      await driver.save();
      logger.info('New driver created from WhatsApp', { driverName, driverPhone });
    }
    
    // Update ride
    ride.status = 'approved';
    ride.driverPhone = driverPhone;
    ride.driverName = driverName;
    ride.driverId = driver._id;
    ride.history.push({
      status: 'approved',
      by: driverPhone,
      timestamp: new Date(),
      details: `נסיעה נלקחה על ידי ${driverName} דרך WhatsApp`
    });
    
    await ride.save();
    
    // Update driver stats
    driver.totalRides = (driver.totalRides || 0) + 1;
    await driver.save();
    
    // Send WebSocket update
    if (websockets) {
      websockets.emitRideUpdate(ride._id, {
        event: 'assigned',
        status: 'approved',
        driverName,
        driverPhone
      });
    }
    
    // Log activity
    await Activity.create({
      type: 'ride_assigned',
      userId: driverPhone,
      description: `נסיעה ${ride.rideNumber} שוייכה לנהג ${driverName}`,
      metadata: { rideId: ride._id, driverPhone, source: 'whatsapp' }
    });
    
    logger.success('Ride assigned to driver', { 
      rideNumber: ride.rideNumber, 
      driverName 
    });
    
    res.json({
      ok: true,
      ride,
      message: 'נסיעה שוייכה בהצלחה'
    });
  } catch (err) {
    logger.error('Error assigning ride', { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// Submit rating (from driver)
app.post('/api/rides/:id/rating', async (req, res) => {
  try {
    const { id } = req.params;
    const { rating } = req.body;
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        ok: false,
        error: 'דירוג חייב להיות בין 1 ל-5'
      });
    }
    
    const ride = await Ride.findById(id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: 'נסיעה לא נמצאה'
      });
    }
    
    ride.rating = parseInt(rating);
    ride.history.push({
      status: 'rated',
      by: 'driver',
      timestamp: new Date(),
      details: `דירוג: ${rating}/5`
    });
    
    await ride.save();
    
    logger.info('Rating submitted', { 
      rideNumber: ride.rideNumber, 
      rating 
    });
    
    res.json({
      ok: true,
      message: 'תודה על הדירוג!'
    });
  } catch (err) {
    logger.error('Error submitting rating', { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// WebSocket stats endpoint
app.get('/api/websocket/stats', authenticateToken, authenticateAdmin, (req, res) => {
  try {
    const stats = websockets.getWebSocketStats();
    res.json({
      ok: true,
      stats
    });
  } catch (err) {
    logger.error('Error getting WebSocket stats', { 
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
// 🤖 BOT API ENDPOINTS
// ===============================================

/**
 * Get groups for bot (without authentication for bot access)
 */
app.get("/api/bot/groups", async (req, res) => {
  try {
    const groups = await WhatsAppGroup.find({ isActive: true })
      .select('name groupId isActive createdAt')
      .lean();
    
    logger.info('Bot requested groups', { count: groups.length });
    
    res.json({
      ok: true,
      groups
    });
  } catch (err) {
    logger.error('Error fetching groups for bot', { error: err.message });
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch groups'
    });
  }
});

/**
 * Bot notifies trip was sent
 */
app.post("/api/bot/trip-sent", async (req, res) => {
  try {
    const { tripId, sentTo } = req.body;
    
    if (!tripId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing tripId'
      });
    }
    
    // Update ride - find by _id or rideNumber
    let ride = await Ride.findById(tripId);
    if (!ride) {
      ride = await Ride.findOne({ rideNumber: tripId });
    }
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: 'Ride not found'
      });
    }
    
    ride.status = 'sent';
    ride.sentCount = (ride.sentCount || 0) + 1;
    await ride.addHistory('sent', 'bot', `Sent to ${sentTo?.groupsSent || 'groups'} groups`);
    
    logger.success('Trip marked as sent', { tripId, sentTo });
    
    res.json({
      ok: true,
      message: 'Trip status updated'
    });
    
  } catch (err) {
    logger.error('Error updating trip status', { error: err.message });
    res.status(500).json({
      ok: false,
      error: 'Failed to update trip'
    });
  }
});

/**
 * Bot heartbeat
 */
app.post("/api/bot/heartbeat", async (req, res) => {
  try {
    const { timestamp, uptime } = req.body;
    
    logger.debug('Bot heartbeat received', { 
      timestamp, 
      uptime: uptime ? Math.round(uptime) + 's' : 'unknown'
    });
    
    res.json({
      ok: true,
      serverTime: new Date().toISOString()
    });
    
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/**
 * Bot status update
 */
app.post("/api/bot/status", async (req, res) => {
  try {
    const { status, timestamp } = req.body;
    
    logger.info('Bot status update', { status, timestamp });
    
    // כאן אפשר לשמור את הסטטוס ב-DB אם רוצים
    // await BotStatus.create({ status, timestamp });
    
    res.json({
      ok: true,
      message: 'Status updated'
    });
    
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/**
 * Get ride by ID (for bot)
 */
app.get("/api/bot/rides/:id", async (req, res) => {
  try {
    let ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      ride = await Ride.findOne({ rideNumber: req.params.id });
    }
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: 'Ride not found'
      });
    }
    
    res.json({
      ok: true,
      ride
    });
    
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/**
 * Get stats (for bot)
 */
app.get("/api/bot/stats", async (req, res) => {
  try {
    const totalRides = await Ride.countDocuments();
    const totalDrivers = await Driver.countDocuments();
    const totalGroups = await WhatsAppGroup.countDocuments();
    const activeGroups = await WhatsAppGroup.countDocuments({ isActive: true });
    
    res.json({
      ok: true,
      stats: {
        totalRides,
        totalDrivers,
        totalGroups,
        activeGroups,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

/**
 * Driver responded to ride via WhatsApp
 */
app.post("/api/rides/respond", async (req, res) => {
  try {
    const { rideNumber, driverPhone, driverName } = req.body;
    
    if (!rideNumber || !driverPhone) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields'
      });
    }
    
    // מצא את הנסיעה
    const ride = await Ride.findOne({ rideNumber });
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: 'Ride not found'
      });
    }
    
    // בדוק אם הנסיעה זמינה
    if (ride.status !== 'sent' && ride.status !== 'distributed' && ride.status !== 'created') {
      return res.json({
        ok: false,
        message: 'Ride is no longer available',
        rideStatus: ride.status
      });
    }
    
    // נעל את הנסיעה לנהג
    ride.status = 'locked';
    ride.lockedBy = driverPhone;
    ride.lockedAt = new Date();
    ride.driverPhone = driverPhone;
    ride.driverName = driverName || 'Unknown Driver';
    
    await ride.addHistory(
      'locked', 
      driverPhone, 
      `Driver ${driverName} responded via WhatsApp`
    );
    
    // Send WebSocket update
    if (websockets) {
      websockets.emitRideUpdate(ride._id, {
        event: 'locked',
        status: 'locked',
        driverName,
        driverPhone
      });
    }
    
    logger.success('🔒 Ride locked for driver', {
      rideNumber,
      driverPhone,
      driverName
    });
    
    res.json({
      ok: true,
      message: 'Ride locked successfully',
      ride: {
        rideNumber: ride.rideNumber,
        status: ride.status,
        pickup: ride.pickup,
        destination: ride.destination,
        customerName: ride.customerName,
        customerPhone: ride.customerPhone
      }
    });
    
  } catch (err) {
    logger.error('Error locking ride', { error: err.message });
    res.status(500).json({
      ok: false,
      error: 'Failed to lock ride'
    });
  }
});

// ===============================================
// 🧠 DISPATCH MANAGER API ENDPOINTS
// ===============================================

/**
 * Get dispatch manager status
 * GET /api/dispatch/status
 */
app.get("/api/dispatch/status", authenticateToken, async (req, res) => {
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

/**
 * Get dispatch manager statistics
 * GET /api/dispatch/stats
 */
app.get("/api/dispatch/stats", authenticateToken, async (req, res) => {
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

/**
 * Get full dispatch report
 * GET /api/dispatch/report
 */
app.get("/api/dispatch/report", authenticateToken, async (req, res) => {
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

/**
 * Switch dispatch mode
 * POST /api/dispatch/switch-mode
 * Body: { mode: 'auto' | 'bot-only' | 'twilio-only' }
 */
app.post("/api/dispatch/switch-mode", authenticateToken, async (req, res) => {
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

/**
 * Reset dispatch statistics
 * POST /api/dispatch/reset-stats
 */
app.post("/api/dispatch/reset-stats", authenticateToken, async (req, res) => {
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

/**
 * Manual health check
 * POST /api/dispatch/check-health
 */
app.post("/api/dispatch/check-health", authenticateToken, async (req, res) => {
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

// ===============================================
// 🚫 ERROR HANDLERS
// ===============================================

// CORS Error Handler
app.use(corsConfig.corsErrorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    ok: false, 
    error: "Endpoint לא נמצא",
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    requestId: req.id,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  } else {
    res.status(500).json({
      ok: false,
      error: err.message,
      stack: err.stack
    });
  }
});

// ===============================================
// 🤖 BOT INTEGRATION FUNCTION
// ===============================================

/**
 * Send trip to bot for dispatch to WhatsApp groups
 * Enhanced with health check before dispatch
 * @param {Object} ride - The ride object to send
 * @returns {Promise<Object>} Result with details
 */
async function sendToBot(ride) {
  // Skip if bot not configured
  if (!process.env.BOT_URL) {
    throw new Error('Bot URL not configured');
  }

  // ===============================================
  // 🏥 HEALTH CHECK FIRST
  // ===============================================
  try {
    logger.debug('🏥 Checking bot health before dispatch...');
    
    const healthCheck = await fetchWithTimeout(
      `${process.env.BOT_URL}/health`,
      { method: 'GET' },
      5000  // 5 seconds timeout for health check
    );
    
    if (!healthCheck.ok) {
      throw new Error(`Bot health check failed with status ${healthCheck.status}`);
    }
    
    const healthData = await healthCheck.json();
    logger.debug('✅ Bot is healthy', { status: healthData.status });
    
  } catch (err) {
    throw new Error(`Bot is not available: ${err.message}`);
  }

  // ===============================================
  // 📤 DISPATCH TO BOT
  // ===============================================
  try {
    logger.info('📤 Sending trip to bot...', { 
      rideNumber: ride.rideNumber 
    });
    
    const botResponse = await fetchWithTimeout(
      `${process.env.BOT_URL}/dispatch`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          trip: {
            _id: ride._id.toString(),
            rideNumber: ride.rideNumber,
            customerName: ride.customerName,
            customerPhone: ride.customerPhone,
            pickup: ride.pickup,
            destination: ride.destination,
            scheduledTime: ride.scheduledTime,
            notes: ride.notes,
            price: ride.price,
            uniqueLink: ride.uniqueLink,
            uniqueToken: ride.uniqueToken,
            createdAt: ride.createdAt
          }
        })
      },
      15000, // 15 seconds timeout
      2      // 2 retries
    );
    
    if (!botResponse.ok) {
      const errorText = await botResponse.text().catch(() => 'Unknown error');
      throw new Error(`Bot returned status ${botResponse.status}: ${errorText}`);
    }
    
    const data = await botResponse.json();
    
    logger.success('✅ Trip sent to bot successfully', { 
      rideNumber: ride.rideNumber,
      groupsSent: data.result?.success || 'unknown'
    });
    
    // עדכן שהנסיעה נשלחה דרך הבוט
    ride.dispatchMethod = 'bot';
    ride.status = 'distributed';
    await ride.save();
    
    return {
      success: true,
      groupsSent: data.result?.success || 0,
      groupsFailed: data.result?.failed || 0,
      details: data.result
    };
    
  } catch (error) {
    logger.error('❌ Failed to send trip to bot', { 
      error: error.message,
      rideNumber: ride.rideNumber
    });
    throw error;
  }
}

/**
 * Send trip via Twilio (fallback method)
 * @param {Object} ride - The ride object to send
 * @returns {Promise<Object>} Result with details
 */
async function sendViaTwilio(ride) {
  try {
    logger.info('📞 Sending trip via Twilio...', { 
      rideNumber: ride.rideNumber 
    });

    // ===============================================
    // 📋 GET ACTIVE DRIVERS
    // ===============================================
    const drivers = await Driver.find({ 
      status: 'active',
      isBlocked: false 
    }).select('phone name');

    if (drivers.length === 0) {
      throw new Error('No active drivers found');
    }

    logger.info(`Found ${drivers.length} active drivers`);

    // ===============================================
    // 💬 CREATE MESSAGE
    // ===============================================
    const scheduledText = ride.scheduledTime 
      ? `\n🕐 שעה: ${new Date(ride.scheduledTime).toLocaleString('he-IL')}`
      : '\n⚡ נסיעה מיידית';

    const message = `🚖 *נסיעה חדשה!* ${ride.rideNumber}

📍 *מ:* ${ride.pickup}
🎯 *ל:* ${ride.destination}${scheduledText}
💰 *מחיר:* ₪${ride.price || '---'}

⚠️ *לפרטים מלאים ולקיחת הנסיעה:*
${ride.uniqueLink}

⏰ *נהג ראשון שמגיב - מקבל את הנסיעה!*

🔒 *פרטי הלקוח והכתובת המדויקת יישלחו רק לנהג שלוקח את הנסיעה*`;

    // ===============================================
    // 📤 SEND VIA TWILIO
    // ===============================================
    const phoneList = drivers.map(d => d.phone);
    
    logger.info(`Sending to ${phoneList.length} drivers via Twilio...`);
    
    const results = await twilioAdapter.sendBulkMessages(phoneList, message);

    logger.success(`Twilio dispatch complete`, {
      rideNumber: ride.rideNumber,
      success: results.success.length,
      failed: results.failed.length,
      totalDrivers: phoneList.length
    });

    // ===============================================
    // 💾 UPDATE RIDE
    // ===============================================
    ride.dispatchMethod = 'twilio';
    ride.status = 'distributed';
    await ride.addHistory(
      'distributed',
      'system',
      `Sent via Twilio to ${results.success.length} drivers`
    );
    await ride.save();

    return {
      success: true,
      messagesSent: results.success.length,
      messagesFailed: results.failed.length,
      totalDrivers: phoneList.length,
      details: results
    };

  } catch (error) {
    logger.error('❌ Failed to send via Twilio', {
      error: error.message,
      rideNumber: ride.rideNumber
    });
    throw error;
  }
}

// ===============================================
// 🚀 START SERVER WITH WEBSOCKETS
// ===============================================

// ===============================================
// 🧠 CONFIGURE DISPATCH MANAGER
// ===============================================

logger.info('🧠 Configuring DispatchManager...');

// Set bot handler
dispatchManager.setBotHandler(async (ride) => {
  return await sendToBot(ride);
});

// Set Twilio handler
dispatchManager.setTwilioHandler(async (ride) => {
  return await sendViaTwilio(ride);
});

// Set bot health check
dispatchManager.setBotHealthCheck(async () => {
  if (!process.env.BOT_URL) {
    return false;
  }
  
  try {
    const response = await fetchWithTimeout(
      `${process.env.BOT_URL}/health`,
      { method: 'GET' },
      5000
    );
    return response.ok;
  } catch (err) {
    return false;
  }
});

// Set Twilio health check
dispatchManager.setTwilioHealthCheck(async () => {
  try {
    return await twilioAdapter.checkCredentials();
  } catch (err) {
    return false;
  }
});

// Start auto health checks
dispatchManager.startAutoHealthChecks();

logger.success('✅ DispatchManager configured and ready');

// ===============================================

// Create HTTP server
const httpServer = http.createServer(app);

// Setup WebSockets (if enabled)
if (process.env.ENABLE_WEBSOCKETS !== 'false') {
  try {
    websockets.setupWebSockets(httpServer);
    logger.success('🔌 WebSockets enabled');
  } catch (err) {
    logger.error('Failed to setup WebSockets:', err.message);
    logger.warn('Server will continue without WebSockets');
  }
}

// Start server
httpServer.listen(PORT, () => {
  logger.success(`🚀 Server running on port ${PORT}`);
  logger.success(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.success(`📊 Health check: http://localhost:${PORT}/health`);
  console.log('\n✅ Server is ready!\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server gracefully...');
  
  // Stop dispatch manager health checks
  dispatchManager.stopAutoHealthChecks();
  
  // Close WebSockets
  websockets.closeWebSockets();
  
  // Close HTTP server
  httpServer.close(() => {
    logger.info('Server closed');
    mongoose.connection.close(false).then(() => {
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
  });
});
