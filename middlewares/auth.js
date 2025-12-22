// ===============================================
// 🔓 TEMPORARY AUTH BYPASS - FOR TESTING ONLY!
// ===============================================

import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();

// ===============================================
// 🔓 LOGIN - ACCEPTS ANY PASSWORD
// ===============================================
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    
    console.log('⚠️ BYPASS MODE: Login attempt with password:', password);
    
    // Get JWT secret
    const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key';
    
    // Create token WITHOUT checking password
    const token = jwt.sign(
      { 
        username: 'admin',
        role: 'admin',
        bypass: true
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    console.log('✅ BYPASS MODE: Login successful!');
    
    res.json({
      ok: true,
      data: {
        token,
        user: {
          username: 'admin',
          role: 'admin'
        }
      }
    });
    
  } catch (error) {
    console.error('❌ BYPASS MODE: Login error:', error);
    res.status(500).json({
      ok: false,
      error: 'Login failed'
    });
  }
});

// ===============================================
// 🔓 LOGOUT
// ===============================================
router.post('/logout', (req, res) => {
  res.json({ ok: true });
});

// ===============================================
// 🔓 GET ME
// ===============================================
router.get('/me', (req, res) => {
  res.json({
    ok: true,
    data: {
      username: 'admin',
      role: 'admin'
    }
  });
});

// ===============================================
// 🔓 MIDDLEWARE - authenticateToken (BYPASS)
// ===============================================
export const authenticateToken = (req, res, next) => {
  console.log('⚠️ BYPASS MODE: authenticateToken bypassed');
  req.user = {
    username: 'admin',
    role: 'admin',
    bypass: true
  };
  next();
};

// ===============================================
// 🔓 MIDDLEWARE - authenticateAdmin (BYPASS)
// ===============================================
export const authenticateAdmin = (req, res, next) => {
  console.log('⚠️ BYPASS MODE: authenticateAdmin bypassed');
  req.user = {
    username: 'admin',
    role: 'admin',
    bypass: true
  };
  next();
};

// ===============================================
// 🔓 MIDDLEWARE - verifyToken (BYPASS)
// ===============================================
export const verifyToken = (req, res, next) => {
  console.log('⚠️ BYPASS MODE: verifyToken bypassed');
  req.user = {
    username: 'admin',
    role: 'admin',
    bypass: true
  };
  next();
};

// ===============================================
// 🔓 MIDDLEWARE - requireRole (BYPASS)
// ===============================================
export const requireRole = (role) => {
  return (req, res, next) => {
    console.log(`⚠️ BYPASS MODE: requireRole(${role}) bypassed`);
    req.user = {
      username: 'admin',
      role: 'admin',
      bypass: true
    };
    next();
  };
};

// ===============================================
// 🔓 EXPORTS
// ===============================================
export default router;