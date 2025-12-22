// ===============================================
// 🔐 AUTH ROUTES - NEW CLEAN API
// ===============================================

import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import logger from '../utils/logger.js';
import { ERRORS } from '../utils/errors.js';

const router = express.Router();

// ===============================================
// POST /auth/login - Login (wrapper על הקיים)
// ===============================================
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'MISSING_PASSWORD',
          message: 'נא להזין סיסמה'
        }
      });
    }
    
    // Get password hash from environment
    const passwordHash = process.env.ADMIN_PASSWORD_HASH;
    
    if (!passwordHash) {
      logger.error('ADMIN_PASSWORD_HASH not configured');
      return res.status(500).json({
        ok: false,
        error: {
          code: 'SERVER_MISCONFIGURED',
          message: 'שגיאת שרת - הגדרות אבטחה חסרות'
        }
      });
    }
    
    // Compare password with hash using bcrypt
    const isValid = await bcrypt.compare(password, passwordHash);
    
    if (!isValid) {
      logger.warn('Failed login attempt (new API)', { 
        ip: req.ip 
      });
      
      return res.status(401).json({
        ok: false,
        error: {
          code: 'INVALID_PASSWORD',
          message: 'סיסמה שגויה'
        }
      });
    }
    
    // Validate JWT_SECRET is configured
    if (!process.env.JWT_SECRET) {
      logger.error('JWT_SECRET not configured');
      return res.status(500).json({
        ok: false,
        error: {
          code: 'SERVER_MISCONFIGURED',
          message: 'שגיאת שרת - הגדרות אבטחה חסרות'
        }
      });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        user: 'admin', 
        role: 'admin',
        loginTime: new Date().toISOString()
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '24h' }
    );
    
    logger.success('Successful login (new API)', { 
      ip: req.ip 
    });
    
    res.json({
      ok: true,
      data: {
        token,
        expiresIn: 86400, // 24 hours in seconds
        user: {
          username: 'admin',
          role: 'admin'
        }
      }
    });
    
  } catch (err) {
    logger.error('Login error (new API)', { 
      error: err.message 
    });
    
    res.status(500).json({
      ok: false,
      error: {
        code: 'SERVER_ERROR',
        message: ERRORS.SERVER.UNKNOWN
      }
    });
  }
});

// ===============================================
// GET /auth/me - Get current user
// ===============================================
router.get('/me', authenticateToken, (req, res) => {
  try {
    res.json({
      ok: true,
      data: {
        username: req.user.user || 'admin',
        role: req.user.role || 'admin',
        loginTime: req.user.loginTime
      }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: {
        code: 'SERVER_ERROR',
        message: err.message
      }
    });
  }
});

// ===============================================
// POST /auth/logout - Logout
// ===============================================
router.post('/logout', authenticateToken, (req, res) => {
  try {
    logger.action('User logged out (new API)', { 
      user: req.user.user 
    });
    
    res.json({
      ok: true,
      data: {
        message: 'התנתקת בהצלחה'
      }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: {
        code: 'SERVER_ERROR',
        message: err.message
      }
    });
  }
});

// ===============================================
// MIDDLEWARE - Authenticate Token
// ===============================================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      ok: false,
      error: {
        code: 'NO_TOKEN',
        message: ERRORS.AUTH.NO_TOKEN
      }
    });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return res.status(401).json({
        ok: false,
        error: {
          code: 'EXPIRED_TOKEN',
          message: ERRORS.AUTH.EXPIRED_TOKEN
        }
      });
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    logger.error('Token verification failed (new API)', { 
      error: err.message 
    });
    
    return res.status(403).json({
      ok: false,
      error: {
        code: 'INVALID_TOKEN',
        message: ERRORS.AUTH.INVALID_TOKEN
      }
    });
  }
}

// Export router and middleware
export { authenticateToken };
export default router;
