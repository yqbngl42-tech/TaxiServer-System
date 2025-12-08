// ===============================================
// 🛡️ CORS CONFIGURATION - Production Ready
// ===============================================

import cors from 'cors';
import logger from '../utils/logger.js';

// ===============================================
// 🌐 ALLOWED ORIGINS
// ===============================================

function getAllowedOrigins() {
  const baseOrigins = [
    // Development
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5500',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:5500',
    // Production
    'https://taxiserver-system.onrender.com'
  ];

  // Production origins from env
  const envOrigins = [];
  
  if (process.env.FRONTEND_URL) {
    envOrigins.push(process.env.FRONTEND_URL);
  }
  
  if (process.env.ALLOWED_ORIGINS) {
    const additionalOrigins = process.env.ALLOWED_ORIGINS
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean);
    
    envOrigins.push(...additionalOrigins);
  }

  // בפרודקשן - רק origins מה-env
  if (process.env.NODE_ENV === 'production') {
    return [...new Set(envOrigins)];
  }

  // בפיתוח - כולם
  return [...new Set([...baseOrigins, ...envOrigins])];
}

// ===============================================
// 🔍 ORIGIN CHECKER
// ===============================================

function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // Subdomain matching
  const allowedDomains = process.env.ALLOWED_DOMAINS?.split(',') || [];
  
  for (const domain of allowedDomains) {
    const regex = new RegExp(`^https?://(.+\\.)?${domain.replace('.', '\\.')}$`);
    if (regex.test(origin)) {
      return true;
    }
  }

  return false;
}

// ===============================================
// ⚙️ CORS OPTIONS
// ===============================================

function getCorsOptions() {
  const allowedOrigins = getAllowedOrigins();

  logger.info('CORS allowed origins:', { 
    count: allowedOrigins.length,
    origins: allowedOrigins,
    env: process.env.NODE_ENV 
  });

  return {
    origin: function (origin, callback) {
      if (isOriginAllowed(origin, allowedOrigins)) {
        logger.debug('CORS allowed:', { origin });
        callback(null, true);
      } else {
        logger.warn('CORS blocked:', { origin });
        callback(new Error(`CORS not allowed for origin: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-Requested-With',
      'Accept',
      'Origin'
    ],
    exposedHeaders: [
      'X-Request-ID',
      'X-Total-Count',
      'X-Page-Count'
    ],
    maxAge: 86400,
    preflightContinue: false,
    optionsSuccessStatus: 204
  };
}

// ===============================================
// 🚀 CORS MIDDLEWARE
// ===============================================

export function setupCors(app) {
  const corsOptions = getCorsOptions();
  
  app.use(cors(corsOptions));
  
  app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    if (process.env.NODE_ENV === 'production') {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
    }
    
    next();
  });
  
  logger.success('✅ CORS configured successfully');
}

// ===============================================
// 🔧 CORS ERROR HANDLER
// ===============================================

export function corsErrorHandler(err, req, res, next) {
  if (err.message.includes('CORS')) {
    logger.error('CORS error:', {
      origin: req.headers.origin,
      method: req.method,
      path: req.path
    });
    
    return res.status(403).json({
      ok: false,
      error: 'CORS policy violation',
      message: 'הדומיין שלך אינו מורשה לגשת ל-API'
    });
  }
  
  next(err);
}

export default {
  setupCors,
  corsErrorHandler,
  getAllowedOrigins
};