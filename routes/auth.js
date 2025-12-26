// ============================================================
// AUTH ROUTES
// Auto-generated from server.js refactoring
// ============================================================

import express from 'express';

// Import what you need (adjust based on actual usage)
// import Ride from '../models/Ride.js';
// import Driver from '../models/Driver.js';
// import { authenticateToken } from '../middlewares/auth.js';
// import logger from '../utils/logger.js';

const router = express.Router();

// ============================================================
// 2 ENDPOINTS
// ============================================================

// POST /api/login
router.post("/login", async (req, res) => {
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


// POST /api/logout
router.post("/logout", authenticateToken, (req, res) => {
  try {
    logger.action("User logged out", { requestId: req.id });
    res.json({ ok: true, message: "התנתקת בהצלחה" });
  } catch (err) {
    res.status(500).json({ ok: false, error: "שגיאה בהתנתקות" });
  }
});


export default router;
