// ============================================================
// MIDDLEWARE CONFIGURATION
// Extracted from server.js
// ============================================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import rateLimiter from '../utils/rateLimiter.js';
import corsConfig from './cors-config.js';

export function setupMiddlewares(app) {
  // ============================================================
  // BASIC MIDDLEWARE
  // ============================================================
  
  // JSON parsing with 15MB limit
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: true, limit: "15mb" }));
  
  // Security - Helmet with custom CSP
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            "https://cdn.jsdelivr.net",
            "https://cdnjs.cloudflare.com",
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://cdn.jsdelivr.net",
            "https://cdnjs.cloudflare.com",
          ],
          fontSrc: [
            "'self'",
            "https://cdn.jsdelivr.net",
            "https://cdnjs.cloudflare.com",
          ],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  
  // MongoDB injection protection
  app.use(mongoSanitize());
  
  // XSS protection
  app.use(xss());
  
  // Static files
  app.use(express.static('public'));
  
  // ============================================================
  // REQUEST LOGGING
  // ============================================================
  
  app.use((req, res, next) => {
    req.id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    console.log(`→ ${req.method} ${req.url} [${req.id}]`);
    next();
  });
  
  // CORS with timing info
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`← ${req.method} ${req.url} ${res.statusCode} (${duration}ms)`);
    });
    next();
  });
  
  // ============================================================
  // CORS CONFIGURATION
  // ============================================================
  
  app.use(cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        'http://localhost:5500',
        'http://localhost:3000',
        'http://127.0.0.1:5500',
        'http://127.0.0.1:3000',
      ];
      
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  
  // ============================================================
  // RATE LIMITING
  // ============================================================
  
  app.use(rateLimiter.middleware(100, 60000));
  
  // ============================================================
  // REQUEST ID
  // ============================================================
  
  app.use((req, res, next) => {
    if (!req.id) {
      req.id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    next();
  });
}
