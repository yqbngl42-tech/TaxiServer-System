# 🔧 מדריך שילוב התיקונים ב-server.js

## 📋 סקירה כללית

קובץ זה מכיל את כל השינויים שצריך לבצע ב-`server.js` כדי לשלב את כל התיקונים.

---

## 1️⃣ IMPORTS - בראש הקובץ

### הוסף imports חדשים אחרי ה-imports הקיימים:

```javascript
// Validation
import {
  rideSchemas,
  driverSchemas,
  authSchemas,
  paymentSchemas,
  validateBody,
  validateQuery
} from './utils/validation.js';

// Refresh Tokens
import RefreshToken from './models/RefreshToken.js';

// Redis Rate Limiter (במקום הישן)
import rateLimiter from './utils/redisRateLimiter.js';

// 2FA
import twoFactorAuth from './utils/twoFactorAuth.js';

// Swagger
import setupSwagger from './config/swagger.js';

// Compression
import compression from 'compression';
```

---

## 2️⃣ PRODUCTION LOGGING CONFIG

### הוסף מיד אחרי ה-imports, לפני כל console.log:

```javascript
// ===============================================
// 🔒 PRODUCTION LOGGING CONFIGURATION
// ===============================================

if (process.env.NODE_ENV === 'production' && process.env.DISABLE_CONSOLE_LOG !== 'false') {
  // Disable console.log in production
  console.log = () => {};
  console.debug = () => {};
  
  // Keep console.error and console.warn but redirect to logger
  const originalError = console.error;
  const originalWarn = console.warn;
  
  console.error = (...args) => {
    logger.error(args.join(' '));
    if (process.env.DEBUG === 'true') {
      originalError(...args);
    }
  };
  
  console.warn = (...args) => {
    logger.warn(args.join(' '));
    if (process.env.DEBUG === 'true') {
      originalWarn(...args);
    }
  };
  
  logger.info('Production mode: console.log disabled');
}
```

---

## 3️⃣ MIDDLEWARE ADDITIONS

### מצא את הסעיף של middleware והוסף:

```javascript
// Compression (after body parser)
app.use(compression());

// Rate Limiting - UPDATED to use Redis
app.use(rateLimiter.middleware(
  parseInt(process.env.RATE_LIMIT_REQUESTS) || 100,
  parseInt(process.env.RATE_LIMIT_WINDOW) || 60000
));
```

---

## 4️⃣ SWAGGER SETUP

### הוסף אחרי הגדרת app אבל לפני routes:

```javascript
// Setup Swagger Documentation
setupSwagger(app);
```

---

## 5️⃣ HEALTH CHECK ENDPOINTS

### הוסף אחרי הגדרת app:

```javascript
// ===============================================
// 🏥 HEALTH CHECK ENDPOINTS
// ===============================================

// Basic health check (public)
app.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: '5.6.0'
    };
    
    // Check MongoDB
    try {
      await mongoose.connection.db.admin().ping();
      health.mongodb = 'connected';
      health.mongoPoolSize = mongoose.connection.client?.s?.options?.maxPoolSize || 'N/A';
    } catch (err) {
      health.mongodb = 'disconnected';
      health.status = 'degraded';
    }
    
    // Check Redis
    health.redis = rateLimiter.isRedisConnected() ? 'connected' : 'disconnected';
    health.rateLimiterStorage = rateLimiter.getStorageType();
    
    // Check Bot
    if (process.env.BOT_URL) {
      try {
        const botResponse = await fetchWithTimeout(
          `${process.env.BOT_URL}/health`,
          {},
          2000
        );
        const botData = await botResponse.json();
        health.bot = botData.status || 'unknown';
      } catch (err) {
        health.bot = 'down';
        health.status = 'degraded';
      }
    }
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
    
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: System health check
 *     tags: [System]
 *     description: Check the health status of the system and all its components
 *     responses:
 *       200:
 *         description: System is healthy
 *       503:
 *         description: System is unhealthy or degraded
 */

// Detailed metrics (protected)
app.get('/metrics', authenticateToken, async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      process: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version
      },
      database: {
        readyState: mongoose.connection.readyState,
        host: mongoose.connection.host,
        name: mongoose.connection.name,
        poolSize: mongoose.connection.client?.s?.options?.maxPoolSize || 'N/A'
      },
      rateLimiter: {
        storage: rateLimiter.getStorageType(),
        redisConnected: rateLimiter.isRedisConnected()
      },
      statistics: {
        totalRides: await Ride.countDocuments(),
        activeDrivers: await Driver.countDocuments({ isActive: true }),
        blockedDrivers: await Driver.countDocuments({ isBlocked: true }),
        pendingRides: await Ride.countDocuments({ status: 'pending' }),
        completedToday: await Ride.countDocuments({
          status: 'completed',
          createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
        }),
        activeSessions: await RefreshToken.countDocuments({
          expiresAt: { $gt: new Date() }
        })
      }
    };
    
    res.json(metrics);
  } catch (error) {
    logger.error('Failed to get metrics', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /metrics:
 *   get:
 *     summary: System metrics
 *     tags: [System]
 *     security:
 *       - bearerAuth: []
 *     description: Get detailed system metrics (requires authentication)
 *     responses:
 *       200:
 *         description: System metrics
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

// Readiness check (for Kubernetes/Docker)
app.get('/ready', async (req, res) => {
  try {
    await mongoose.connection.db.admin().ping();
    res.status(200).send('ready');
  } catch (error) {
    res.status(503).send('not ready');
  }
});

// Liveness check (for Kubernetes/Docker)
app.get('/live', (req, res) => {
  res.status(200).send('alive');
});
```

---

## 6️⃣ LOGIN ENDPOINT - עדכון מלא

### מצא את `/api/login` והחלף אותו לגמרי:

```javascript
/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: Admin login
 *     tags: [Authentication]
 *     description: Login with password and optional 2FA code
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 description: Admin password
 *               twoFactorToken:
 *                 type: string
 *                 description: 2FA code (if enabled)
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
app.post('/api/login', validateBody(authSchemas.login), async (req, res) => {
  try {
    const { password, twoFactorToken } = req.validatedBody;
    
    // Rate limiting for login attempts
    const loginRateLimit = parseInt(process.env.RATE_LIMIT_LOGIN) || 5;
    const ip = req.ip || req.connection.remoteAddress;
    const allowed = await rateLimiter.checkRateLimit(
      `login:${ip}`,
      loginRateLimit,
      60000 // 1 minute
    );
    
    if (!allowed) {
      logger.warn('Login rate limit exceeded', { ip });
      return res.status(429).json({
        ok: false,
        error: 'Too many login attempts',
        message: 'יותר מדי ניסיונות התחברות - נסה שוב בעוד דקה'
      });
    }
    
    // Verify password
    const passwordHash = process.env.ADMIN_PASSWORD_HASH;
    if (!passwordHash) {
      logger.error('ADMIN_PASSWORD_HASH not configured!');
      return res.status(500).json({
        ok: false,
        error: 'Server configuration error'
      });
    }
    
    const isValid = await bcrypt.compare(password, passwordHash);
    
    if (!isValid) {
      logger.warn('Login attempt with invalid password', { ip });
      return res.status(401).json({
        ok: false,
        error: 'Invalid password',
        message: 'סיסמה שגויה'
      });
    }
    
    // Check if 2FA is enabled
    const admin = await AdminContact.findOne({ role: 'admin' });
    const twoFactorEnabled = admin?.twoFactor?.enabled && twoFactorAuth.isEnabled();
    
    if (twoFactorEnabled) {
      if (!twoFactorToken) {
        // First step: password correct, need 2FA
        return res.json({
          ok: false,
          requiresTwoFactor: true,
          message: 'Please enter your 2FA code',
          messageHe: 'אנא הזן את קוד האימות הדו-שלבי'
        });
      }
      
      // Verify 2FA token
      const verified = twoFactorAuth.verifyToken(
        admin.twoFactor.secret,
        twoFactorToken
      );
      
      if (!verified) {
        logger.warn('Login attempt with invalid 2FA token', { ip });
        return res.status(401).json({
          ok: false,
          error: 'Invalid 2FA code',
          message: 'קוד אימות שגוי'
        });
      }
      
      // Update last verified
      admin.twoFactor.lastVerified = new Date();
      await admin.save();
      
      logger.info('2FA verified successfully', { ip });
    }
    
    // Generate Access Token (15 minutes)
    const accessToken = jwt.sign(
      { 
        username: 'admin',
        role: 'admin',
        type: 'access'
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRATION || '15m' }
    );
    
    // Generate Refresh Token (7 days)
    const refreshToken = jwt.sign(
      { 
        username: 'admin',
        role: 'admin',
        type: 'refresh'
      },
      process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRATION || '7d' }
    );
    
    // Save refresh token to database
    await RefreshToken.create({
      token: refreshToken,
      userId: 'admin',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      userAgent: req.headers['user-agent'],
      ip: ip
    });
    
    logger.success('Admin logged in successfully', { 
      ip,
      twoFactorUsed: twoFactorEnabled
    });
    
    res.json({
      ok: true,
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
      tokenType: 'Bearer'
    });
    
  } catch (error) {
    logger.error('Login error', error);
    res.status(500).json({
      ok: false,
      error: 'Internal server error',
      message: 'שגיאה פנימית'
    });
  }
});
```

---

## 7️⃣ הוסף REFRESH TOKEN ENDPOINT

### הוסף endpoint חדש:

```javascript
/**
 * @swagger
 * /api/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 *     description: Get a new access token using a refresh token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New access token generated
 *       401:
 *         description: Invalid or expired refresh token
 */
app.post('/api/refresh', validateBody(authSchemas.refresh), async (req, res) => {
  try {
    const { refreshToken } = req.validatedBody;
    
    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET
      );
    } catch (err) {
      logger.warn('Invalid refresh token', { error: err.message });
      return res.status(403).json({
        ok: false,
        error: 'Invalid refresh token'
      });
    }
    
    // Check if token exists in database
    const tokenDoc = await RefreshToken.findOne({ token: refreshToken });
    
    if (!tokenDoc) {
      logger.warn('Refresh token not found in database');
      return res.status(403).json({
        ok: false,
        error: 'Refresh token not found'
      });
    }
    
    // Check if expired
    if (tokenDoc.isExpired()) {
      await tokenDoc.deleteOne();
      logger.warn('Refresh token expired');
      return res.status(403).json({
        ok: false,
        error: 'Refresh token expired',
        message: 'טוקן פג תוקף - התחבר מחדש'
      });
    }
    
    // Generate new access token
    const accessToken = jwt.sign(
      { 
        username: decoded.username,
        role: decoded.role,
        type: 'access'
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRATION || '15m' }
    );
    
    // Update last used
    await tokenDoc.updateLastUsed();
    
    logger.info('Access token refreshed', {
      userId: tokenDoc.userId
    });
    
    res.json({
      ok: true,
      accessToken,
      expiresIn: 900, // 15 minutes
      tokenType: 'Bearer'
    });
    
  } catch (error) {
    logger.error('Token refresh error', error);
    res.status(500).json({
      ok: false,
      error: 'Internal server error'
    });
  }
});
```

---

## 8️⃣ הוסף LOGOUT ENDPOINT

```javascript
/**
 * @swagger
 * /api/logout:
 *   post:
 *     summary: Logout
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     description: Revoke refresh token and logout
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *               logoutAll:
 *                 type: boolean
 *                 description: Logout from all devices
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
app.post('/api/logout', authenticateToken, async (req, res) => {
  try {
    const { refreshToken, logoutAll } = req.body;
    
    if (logoutAll) {
      // Logout from all devices
      const count = await RefreshToken.deleteAllForUser(req.user.username);
      logger.info('Logged out from all devices', {
        userId: req.user.username,
        tokensRevoked: count
      });
    } else if (refreshToken) {
      // Logout from current device only
      await RefreshToken.deleteOne({ token: refreshToken });
      logger.info('Logged out from current device', {
        userId: req.user.username
      });
    }
    
    res.json({
      ok: true,
      message: 'Logged out successfully'
    });
    
  } catch (error) {
    logger.error('Logout error', error);
    res.status(500).json({
      ok: false,
      error: 'Internal server error'
    });
  }
});
```

---

## 9️⃣ עדכון CREATE RIDE ENDPOINT

### מצא את `POST /api/rides` והחלף:

```javascript
/**
 * @swagger
 * /api/rides:
 *   post:
 *     summary: Create new ride
 *     tags: [Rides]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customerName
 *               - customerPhone
 *               - pickupLocation
 *               - dropoffLocation
 *               - price
 *             properties:
 *               customerName:
 *                 type: string
 *               customerPhone:
 *                 type: string
 *               pickupLocation:
 *                 type: string
 *               dropoffLocation:
 *                 type: string
 *               price:
 *                 type: number
 *               passengers:
 *                 type: number
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Ride created successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
app.post('/api/rides', authenticateToken, validateBody(rideSchemas.create), async (req, res) => {
  try {
    const rideData = req.validatedBody; // Validated data!
    
    // Generate ride number
    const rideNumber = await rideNumberGenerator.generate();
    
    // Create ride
    const ride = await Ride.create({
      ...rideData,
      rideNumber,
      status: 'pending',
      createdBy: req.user.username
    });
    
    logger.action('Ride created', {
      rideId: ride._id,
      rideNumber,
      customer: rideData.customerName
    });
    
    // Send to drivers (existing logic...)
    // ...
    
    res.status(201).json({
      ok: true,
      ride,
      message: 'נסיעה נוצרה בהצלחה'
    });
    
  } catch (error) {
    logger.error('Failed to create ride', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to create ride',
      message: 'שגיאה ביצירת נסיעה'
    });
  }
});
```

---

## 🔟 GLOBAL ERROR HANDLER

### הוסף בסוף הקובץ, לפני server.listen():

```javascript
// ===============================================
// 🚨 ERROR HANDLING
// ===============================================

// 404 Handler
app.use((req, res) => {
  logger.warn('404 Not Found', {
    method: req.method,
    path: req.path,
    ip: req.ip
  });
  
  res.status(404).json({
    ok: false,
    error: 'Not Found',
    path: req.path,
    message: 'הדף המבוקש לא נמצא',
    requestId: req.id
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;
  
  logger.error('Unhandled error', {
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    requestId: req.id,
    method: req.method,
    path: req.path,
    ip: req.ip
  });
  
  res.status(statusCode).json({
    ok: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal Server Error' 
      : err.message,
    requestId: req.id,
    ...(process.env.NODE_ENV === 'development' && 
        process.env.ENABLE_STACK_TRACE === 'true' && { 
      stack: err.stack 
    })
  });
});

// Unhandled Promise Rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined
  });
  
  // Don't crash in production
  if (process.env.NODE_ENV === 'development') {
    process.exit(1);
  }
});

// Uncaught Exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  
  // Exit process (let PM2/Docker restart)
  process.exit(1);
});

// Graceful Shutdown
async function gracefulShutdown(signal) {
  logger.info(`${signal} received, starting graceful shutdown`);
  
  // Stop accepting new requests
  server.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      // Close database connection
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
      
      // Close Redis connection
      await rateLimiter.close();
      logger.info('Redis connection closed');
      
      logger.success('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', error);
      process.exit(1);
    }
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

---

## ✅ סיכום השינויים

עכשיו הקובץ server.js כולל:

1. ✅ Input validation מקיף עם Joi
2. ✅ JWT + Refresh tokens
3. ✅ Redis rate limiter
4. ✅ 2FA support (optional)
5. ✅ Swagger documentation
6. ✅ Health checks
7. ✅ Metrics endpoint
8. ✅ Global error handler
9. ✅ Graceful shutdown
10. ✅ Production logging

---

## 📝 הערות חשובות

1. **גיבוי** - תעשה גיבוי ל-server.js המקורי לפני השינויים!
2. **בדיקה** - תבדוק כל שינוי אחד אחד
3. **הדרגתיות** - אפשר לשלב חלק מהשינויים בכל פעם
4. **סביבה** - תבדוק קודם ב-development, אחר כך ב-production

---

**זמן מוערך לשילוב:** 2-3 שעות
**רמת קושי:** בינונית-גבוהה
**חשיבות:** קריטית! 🔴
