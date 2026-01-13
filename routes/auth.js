// ============================================================
// AUTH ROUTES - ENHANCED VERSION (FIXED)
// Merged from routes/auth.js + v2/auth-enhanced.js
// Fixed: isLocked → lockUntil, user existence checks, ERRORS usage
// ============================================================

import express from 'express';
import { AuditLog, User } from '../models/index.js';
import logger from '../utils/logger.js';

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const router = express.Router();

// Constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 2 * 60 * 60 * 1000; // 2 hours

// Error messages - centralized for consistency
const ERRORS = {
  AUTH: {
    MISSING_CREDENTIALS: 'נא להזין שם משתמש וסיסמה',
    INVALID_CREDENTIALS: 'שם משתמש או סיסמה שגויים',
    ACCOUNT_LOCKED: 'חשבון נעול זמנית. נסה שוב מאוחר יותר',
    ACCOUNT_DISABLED: 'חשבון מושבת',
    NO_TOKEN: 'גישה נדחתה: חסר טוקן',
    INVALID_TOKEN: 'טוקן לא תקין או פג תוקף',
    USER_NOT_FOUND: 'משתמש לא נמצא',
    USER_DELETED: 'משתמש לא נמצא - הטוקן אינו תקף עוד'
  },
  PASSWORD: {
    MISSING_FIELDS: 'נא להזין סיסמה נוכחית וסיסמה חדשה',
    TOO_SHORT: 'סיסמה חדשה חייבת להכיל לפחות 6 תווים',
    CURRENT_INVALID: 'סיסמה נוכחית שגויה',
    RESET_MISSING_EMAIL: 'נא להזין כתובת אימייל',
    RESET_MISSING_FIELDS: 'חסרים שדות חובה',
    RESET_INVALID_TOKEN: 'טוקן לא תקין או פג תוקף'
  },
  SERVER: {
    INTERNAL: 'שגיאת שרת פנימית',
    LOGIN_ERROR: 'שגיאה בהתחברות',
    LOGOUT_ERROR: 'שגיאה בהתנתקות',
    PASSWORD_CHANGE_ERROR: 'שגיאה בשינוי סיסמה',
    PASSWORD_RESET_REQUEST_ERROR: 'שגיאה בבקשת איפוס סיסמה',
    PASSWORD_RESET_ERROR: 'שגיאה באיפוס סיסמה',
    USER_INFO_ERROR: 'שגיאה בטעינת פרטי משתמש'
  }
};

// ============================================================
// MIDDLEWARE - Authenticate Token
// ============================================================

/**
 * פונקציית אימות הטוקן - מיוצאת כדי שתוכל להיקרא מקבצים אחרים
 */
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      ok: false, 
      error: ERRORS.AUTH.NO_TOKEN
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ 
      ok: false, 
      error: ERRORS.AUTH.INVALID_TOKEN
    });
  }
};

// ============================================================
// ENDPOINTS
// ============================================================

// ===============================================
// POST /auth/login - התחברות
// ===============================================
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validation
    if (!username || !password) {
      return res.status(400).json({ 
        ok: false, 
        error: ERRORS.AUTH.MISSING_CREDENTIALS
      });
    }
    
    // Find user
    const user = await User.findOne({ username });
    
    if (!user) {
      // Log failed attempt
      await AuditLog.create({
        userId: 'unknown',
        username,
        action: 'login_failed',
        details: { reason: 'user_not_found' },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }).catch(err => logger.error('AuditLog error:', err));
      
      logger.warn("Failed login attempt - user not found", { username, ip: req.ip });
      
      return res.status(401).json({ 
        ok: false, 
        error: ERRORS.AUTH.INVALID_CREDENTIALS
      });
    }
    
    // ✅ FIX #1: Check if account is locked using lockUntil
    if (user.lockUntil && user.lockUntil > Date.now()) {
      await AuditLog.create({
        userId: user._id.toString(),
        username: user.username,
        action: 'login_failed',
        details: { reason: 'account_locked', lockedUntil: user.lockUntil },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }).catch(err => logger.error('AuditLog error:', err));
      
      logger.warn("Login attempt on locked account", { 
        username, 
        lockedUntil: user.lockUntil,
        ip: req.ip 
      });
      
      return res.status(423).json({ 
        ok: false, 
        error: ERRORS.AUTH.ACCOUNT_LOCKED
      });
    }
    
    // Check if active
    if (!user.isActive) {
      logger.warn("Login attempt on disabled account", { username, ip: req.ip });
      
      return res.status(403).json({ 
        ok: false, 
        error: ERRORS.AUTH.ACCOUNT_DISABLED
      });
    }
    
    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    
    if (!isValid) {
      // Increment login attempts
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      
      if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_TIME);
        logger.warn("Account locked due to too many failed attempts", { 
          username, 
          attempts: user.loginAttempts 
        });
      }
      
      await user.save();
      
      await AuditLog.create({
        userId: user._id.toString(),
        username: user.username,
        action: 'login_failed',
        details: { reason: 'invalid_password', attempts: user.loginAttempts },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }).catch(err => logger.error('AuditLog error:', err));
      
      logger.warn("Failed login attempt - invalid password", { 
        username, 
        attempts: user.loginAttempts,
        ip: req.ip 
      });
      
      return res.status(401).json({ 
        ok: false, 
        error: ERRORS.AUTH.INVALID_CREDENTIALS
      });
    }
    
    // Successful login - Reset login attempts
    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = new Date();
    await user.save();
    
    // Create token
    const token = jwt.sign(
      { 
        userId: user._id.toString(),
        username: user.username, 
        user: user.username, // for backward compatibility
        role: user.role,
        loginTime: new Date().toISOString()
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: "24h" }
    );
    
    // Log successful login
    await AuditLog.create({
      userId: user._id.toString(),
      username: user.username,
      action: 'login',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.info("Successful login", { 
      username: user.username,
      userId: user._id,
      ip: req.ip 
    });
    
    res.json({ 
      ok: true, 
      token,
      expiresIn: 86400,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      message: "כניסה בהצלחה!"
    });
  } catch (err) {
    logger.error("Login error", { error: err.message, stack: err.stack });
    res.status(500).json({ 
      ok: false, 
      error: ERRORS.SERVER.LOGIN_ERROR
    });
  }
});

// ===============================================
// GET /auth/me - קבלת פרטי המשתמש המחובר
// ===============================================
router.get("/me", authenticateToken, async (req, res) => {
  try {
    // ✅ FIX #2: Check if user still exists and is active
    const user = await User.findById(req.user.userId).select('-passwordHash -__v');
    
    if (!user) {
      logger.warn("Token valid but user not found", { userId: req.user.userId });
      return res.status(404).json({
        ok: false,
        error: ERRORS.AUTH.USER_DELETED
      });
    }
    
    if (!user.isActive) {
      logger.warn("Token valid but user is inactive", { userId: req.user.userId });
      return res.status(403).json({
        ok: false,
        error: ERRORS.AUTH.ACCOUNT_DISABLED
      });
    }
    
    res.json({
      ok: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    });
  } catch (err) {
    logger.error("Error fetching user info", { error: err.message });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.USER_INFO_ERROR
    });
  }
});

// ===============================================
// POST /auth/logout - התנתקות
// ===============================================
router.post("/logout", authenticateToken, async (req, res) => {
  try {
    // ✅ FIX #3: TODO for token revocation
    // TODO: implement token revocation if session-based auth is added
    // For now, this is stateless - client should delete token
    // Future options:
    // - Maintain token blacklist in Redis
    // - Use session-based auth with server-side state
    // - Implement refresh token rotation
    
    // Log logout
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'logout',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.info("User logged out", { 
      username: req.user.username || req.user.user 
    });
    
    res.json({ 
      ok: true, 
      message: "התנתקת בהצלחה" 
    });
  } catch (err) {
    logger.error("Logout error", { error: err.message });
    res.status(500).json({ 
      ok: false, 
      error: ERRORS.SERVER.LOGOUT_ERROR
    });
  }
});

// ===============================================
// POST /auth/change-password - שינוי סיסמה
// ===============================================
router.post("/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.PASSWORD.MISSING_FIELDS
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.PASSWORD.TOO_SHORT
      });
    }
    
    // ✅ FIX #4: TODO for advanced password validation
    // TODO: Add advanced password validation for production:
    // - At least one uppercase letter
    // - At least one lowercase letter  
    // - At least one number
    // - At least one special character
    // Example regex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
    // Recommended library: zxcvbn for password strength estimation
    
    // ✅ FIX #2: Find user and verify still exists/active
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      logger.warn("Password change attempt - user not found", { userId: req.user.userId });
      return res.status(404).json({
        ok: false,
        error: ERRORS.AUTH.USER_NOT_FOUND
      });
    }
    
    if (!user.isActive) {
      logger.warn("Password change attempt - user inactive", { userId: req.user.userId });
      return res.status(403).json({
        ok: false,
        error: ERRORS.AUTH.ACCOUNT_DISABLED
      });
    }
    
    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    
    if (!isValid) {
      logger.warn("Failed password change attempt", { 
        username: user.username,
        reason: "invalid_current_password" 
      });
      
      return res.status(401).json({
        ok: false,
        error: ERRORS.PASSWORD.CURRENT_INVALID
      });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    user.updatedAt = new Date();
    await user.save();
    
    // Log password change
    await AuditLog.create({
      userId: user._id.toString(),
      username: user.username,
      action: 'password_changed',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.info("Password changed successfully", { 
      username: user.username 
    });
    
    res.json({ 
      ok: true, 
      message: "סיסמה שונתה בהצלחה" 
    });
  } catch (err) {
    logger.error("Password change error", { error: err.message });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.PASSWORD_CHANGE_ERROR
    });
  }
});

// ===============================================
// POST /auth/request-reset - בקשת איפוס סיסמה
// ===============================================
router.post("/request-reset", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.PASSWORD.RESET_MISSING_EMAIL
      });
    }
    
    const user = await User.findOne({ email });
    
    if (!user) {
      // Don't reveal that user doesn't exist - security best practice
      logger.info("Password reset requested for non-existent email", { email });
      return res.json({ 
        ok: true, 
        message: "אם האימייל קיים במערכת, נשלח אליו קישור לאיפוס סיסמה" 
      });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();
    
    // Log password reset request
    await AuditLog.create({
      userId: user._id.toString(),
      username: user.username,
      action: 'password_reset_requested',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.info("Password reset requested", { 
      username: user.username,
      email: user.email 
    });
    
    // TODO: Send email with reset link
    // const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;
    // await sendEmail(user.email, 'Password Reset', `Click here to reset: ${resetUrl}`);
    
    res.json({ 
      ok: true, 
      message: "אם האימייל קיים במערכת, נשלח אליו קישור לאיפוס סיסמה",
      // TODO: Remove in production - only for testing
      ...(process.env.NODE_ENV === 'development' && { resetToken })
    });
  } catch (err) {
    logger.error("Password reset request error", { error: err.message });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.PASSWORD_RESET_REQUEST_ERROR
    });
  }
});

// ===============================================
// POST /auth/reset-password - איפוס סיסמה
// ===============================================
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.PASSWORD.RESET_MISSING_FIELDS
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.PASSWORD.TOO_SHORT
      });
    }
    
    // TODO: Add advanced password validation (same as change-password)
    
    // Hash the token to compare with database
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    // Find user with valid reset token
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      logger.warn("Invalid or expired password reset token");
      
      return res.status(400).json({
        ok: false,
        error: ERRORS.PASSWORD.RESET_INVALID_TOKEN
      });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.updatedAt = new Date();
    await user.save();
    
    // Log password reset
    await AuditLog.create({
      userId: user._id.toString(),
      username: user.username,
      action: 'password_reset_completed',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.info("Password reset completed", { 
      username: user.username 
    });
    
    res.json({ 
      ok: true, 
      message: "סיסמה אופסה בהצלחה" 
    });
  } catch (err) {
    logger.error("Password reset error", { error: err.message });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.PASSWORD_RESET_ERROR
    });
  }
});

// ============================================================
// EXPORT
// ============================================================

export default router;