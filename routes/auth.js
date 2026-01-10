// ============================================================
// AUTH ROUTES
// Updated to fix export and missing dependencies
// ============================================================

import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * פונקציית אימות הטוקן - מיוצאת כדי שתוכל להיקרא מקבצים אחרים
 */
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ ok: false, error: "גישה נדחתה: חסר טוקן" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ ok: false, error: "טוקן לא תקין או פג תוקף" });
    }
    req.user = user;
    next();
  });
};

// ============================================================
// ENDPOINTS
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
    
    // שליפת הסיסמה המוצפנת מהגדרות השרת
    const passwordHash = process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD;
    
    // השוואת סיסמה
    const isValid = await bcrypt.compare(password, passwordHash);
    
    if (!isValid) {
      logger.warn("Failed login attempt", { ip: req.ip });
      return res.status(401).json({ 
        ok: false, 
        error: "סיסמה שגויה" 
      });
    }
    
    // יצירת טוקן
    const token = jwt.sign(
      { 
        user: "admin", 
        role: "admin",
        loginTime: new Date().toISOString()
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: "24h" }
    );
    
    logger.info("Successful login", { ip: req.ip });
    
    res.json({ 
      ok: true, 
      token,
      expiresIn: 86400,
      message: "כניסה בהצלחה!"
    });
  } catch (err) {
    logger.error("Login error", { error: err.message });
    res.status(500).json({ 
      ok: false, 
      error: "שגיאת שרת פנימית" 
    });
  }
});


// POST /api/logout
router.post("/logout", authenticateToken, (req, res) => {
  try {
    logger.info("User logged out");
    res.json({ ok: true, message: "התנתקת בהצלחה" });
  } catch (err) {
    res.status(500).json({ ok: false, error: "שגיאה בהתנתקות" });
  }
});


export default router;