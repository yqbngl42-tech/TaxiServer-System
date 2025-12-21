import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../../models/User.js';
import AuditLog from '../../models/AuditLog.js';
import { requirePermission } from '../../middleware/rbac.js';

const router = express.Router();

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 2 * 60 * 60 * 1000; // 2 hours

// ===============================================
// LOGIN
// ===============================================
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        error: { code: 'MISSING_FIELDS', message: 'נא להזין שם משתמש וסיסמה' }
      });
    }
    
    // Find user
    const user = await User.findOne({ username });
    
    if (!user) {
      await AuditLog.create({
        userId: 'unknown',
        username,
        action: 'login_failed',
        details: { reason: 'user_not_found' },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      return res.status(401).json({
        ok: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'שם משתמש או סיסמה שגויים' }
      });
    }
    
    // Check if account is locked
    if (user.isLocked) {
      await AuditLog.create({
        userId: user._id.toString(),
        username: user.username,
        action: 'login_failed',
        details: { reason: 'account_locked' },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      return res.status(423).json({
        ok: false,
        error: { code: 'ACCOUNT_LOCKED', message: 'חשבון נעול זמנית' }
      });
    }
    
    // Check if active
    if (!user.isActive) {
      return res.status(403).json({
        ok: false,
        error: { code: 'ACCOUNT_DISABLED', message: 'חשבון מושבת' }
      });
    }
    
    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    
    if (!isValid) {
      // Increment login attempts
      user.loginAttempts += 1;
      
      if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_TIME);
      }
      
      await user.save();
      
      await AuditLog.create({
        userId: user._id.toString(),
        username: user.username,
        action: 'login_failed',
        details: { reason: 'invalid_password', attempts: user.loginAttempts },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      return res.status(401).json({
        ok: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'שם משתמש או סיסמה שגויים' }
      });
    }
    
    // Reset login attempts
    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = new Date();
    await user.save();
    
    // Create token
    const token = jwt.sign(
      { 
        userId: user._id.toString(),
        username: user.username, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Log successful login
    await AuditLog.create({
      userId: user._id.toString(),
      username: user.username,
      action: 'login',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    res.json({
      ok: true,
      data: {
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// ME
// ===============================================
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    ok: true,
    data: {
      user: {
        id: req.user.userId,
        username: req.user.username,
        role: req.user.role
      }
    }
  });
});

// ===============================================
// LOGOUT
// ===============================================
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await AuditLog.create({
      userId: req.user.userId,
      username: req.user.username,
      action: 'logout',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    res.json({ ok: true, data: {} });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// CHANGE PASSWORD
// ===============================================
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        ok: false,
        error: { code: 'MISSING_FIELDS', message: 'חסרים שדות' }
      });
    }
    
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        ok: false,
        error: { code: 'USER_NOT_FOUND', message: 'משתמש לא נמצא' }
      });
    }
    
    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    
    if (!isValid) {
      return res.status(401).json({
        ok: false,
        error: { code: 'INVALID_PASSWORD', message: 'סיסמה נוכחית שגויה' }
      });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    user.updatedAt = new Date();
    await user.save();
    
    await AuditLog.create({
      userId: user._id.toString(),
      username: user.username,
      action: 'password_changed',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    res.json({ ok: true, data: {} });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// REQUEST PASSWORD RESET
// ===============================================
router.post('/request-reset', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        ok: false,
        error: { code: 'MISSING_EMAIL', message: 'נא להזין אימייל' }
      });
    }
    
    const user = await User.findOne({ email });
    
    if (!user) {
      // Don't reveal that user doesn't exist
      return res.json({ ok: true, data: {} });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();
    
    await AuditLog.create({
      userId: user._id.toString(),
      username: user.username,
      action: 'password_reset_requested',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    // TODO: Send email with reset link
    // For now, just return success
    
    res.json({ ok: true, data: { resetToken } }); // Remove in production
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// RESET PASSWORD
// ===============================================
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({
        ok: false,
        error: { code: 'MISSING_FIELDS', message: 'חסרים שדות' }
      });
    }
    
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_TOKEN', message: 'טוקן לא תקין או פג תוקף' }
      });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.updatedAt = new Date();
    await user.save();
    
    res.json({ ok: true, data: {} });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// Middleware
// ===============================================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      ok: false,
      error: { code: 'NO_TOKEN', message: 'אין token' }
    });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({
      ok: false,
      error: { code: 'INVALID_TOKEN', message: 'token לא תקין' }
    });
  }
}

export { authenticateToken };
export default router;
