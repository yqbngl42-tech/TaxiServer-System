// ===============================================
// 👥 USERS ROUTES - Production Ready
// ===============================================
// Based on:
// - v2/users.js (223 lines, 6 endpoints)
// Result: 6 endpoints enhanced with pagination, logging, validation
// ===============================================

import express from 'express';
import { Activity, AuditLog, User } from '../models/index.js';
import { authenticateToken } from '../middlewares/auth.js';
import { requirePermission } from '../middlewares/rbac.js';
import logger from '../utils/logger.js';

import bcrypt from 'bcryptjs';

const router = express.Router();

// ============================================================
// ERROR MESSAGES
// ============================================================

const ERRORS = {
  USER: {
    NOT_FOUND: 'משתמש לא נמצא',
    ALREADY_EXISTS: 'משתמש עם שם משתמש או אימייל זה כבר קיים',
    MISSING_FIELDS: 'חסרים שדות חובה',
    MISSING_PASSWORD: 'חסרה סיסמה',
    WEAK_PASSWORD: 'סיסמה חלשה מדי (מינימום 6 תווים)',
    CANNOT_DELETE_SELF: 'לא ניתן למחוק את עצמך',
    INVALID_EMAIL: 'כתובת אימייל לא תקינה',
    INVALID_ROLE: 'תפקיד לא תקין'
  },
  SERVER: {
    DATABASE: 'שגיאת מסד נתונים',
    UNKNOWN: 'שגיאת שרת'
  }
};

const VALID_ROLES = ['admin', 'manager', 'dispatcher', 'viewer'];

// ============================================================
// VALIDATION HELPERS
// ============================================================

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
function isStrongPassword(password) {
  // Minimum 6 characters
  return password && password.length >= 6;
}

// ===============================================
// GET /api/users - קבלת משתמשים
// ===============================================
router.get("/", authenticateToken, requirePermission('users:read'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;
    const { role, isActive, search } = req.query;
    
    // Build filter
    const filter = {};
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-passwordHash -passwordResetToken')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter)
    ]);
    
    res.json({
      ok: true,
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (err) {
    logger.error('Error fetching users', {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// GET /api/users/:id - קבלת משתמש בודד
// ===============================================
router.get("/:id", authenticateToken, requirePermission('users:read'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-passwordHash -passwordResetToken');
    
    if (!user) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.USER.NOT_FOUND
      });
    }
    
    res.json({
      ok: true,
      user
    });
  } catch (err) {
    logger.error('Error fetching user', {
      requestId: req.id || null,
      userId: req.params.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// POST /api/users - יצירת משתמש
// ===============================================
router.post("/", authenticateToken, requirePermission('users:create'), async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    
    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.USER.MISSING_FIELDS
      });
    }
    
    if (!isValidEmail(email)) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.USER.INVALID_EMAIL
      });
    }
    
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.USER.WEAK_PASSWORD
      });
    }
    
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.USER.INVALID_ROLE,
        validRoles: VALID_ROLES
      });
    }
    
    // Check if user exists
    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });
    
    if (existingUser) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.USER.ALREADY_EXISTS
      });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Create user
    const user = await User.create({
      username,
      email,
      passwordHash,
      role: role || 'viewer',
      isActive: true,
      createdBy: req.user.username || req.user.user
    });
    
    logger.success('User created', {
      requestId: req.id || null,
      userId: user._id,
      username: user.username,
      role: user.role,
      createdBy: req.user.username || req.user.user
    });
    
    // Activity log
    await Activity.create({
      timestamp: new Date(),
      type: 'system',
      user: req.user.username || req.user.user,
      message: `משתמש חדש נוצר: ${user.username} (${user.role})`,
      details: JSON.stringify({
        userId: user._id,
        username: user.username,
        role: user.role
      }),
      emoji: '👤'
    }).catch(err => logger.error('Activity error:', err));
    
    // Audit log
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'user_created',
      details: {
        newUserId: user._id,
        newUsername: user.username,
        role: user.role
      }
    }).catch(err => logger.error('AuditLog error:', err));
    
    res.json({
      ok: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive
      }
    });
  } catch (err) {
    logger.error('Error creating user', {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// PUT /api/users/:id - עדכון משתמש
// ===============================================
router.put("/:id", authenticateToken, requirePermission('users:update'), async (req, res) => {
  try {
    const updates = {};
    
    // Build updates object
    if (req.body.email) {
      if (!isValidEmail(req.body.email)) {
        return res.status(400).json({
          ok: false,
          error: ERRORS.USER.INVALID_EMAIL
        });
      }
      updates.email = req.body.email;
    }
    
    if (req.body.role) {
      if (!VALID_ROLES.includes(req.body.role)) {
        return res.status(400).json({
          ok: false,
          error: ERRORS.USER.INVALID_ROLE,
          validRoles: VALID_ROLES
        });
      }
      updates.role = req.body.role;
    }
    
    if (req.body.isActive !== undefined) {
      updates.isActive = req.body.isActive;
    }
    
    updates.updatedAt = new Date();
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).select('-passwordHash -passwordResetToken');
    
    if (!user) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.USER.NOT_FOUND
      });
    }
    
    logger.success('User updated', {
      requestId: req.id || null,
      userId: user._id,
      updates,
      updatedBy: req.user.username || req.user.user
    });
    
    // Activity log
    await Activity.create({
      timestamp: new Date(),
      type: 'system',
      user: req.user.username || req.user.user,
      message: `משתמש עודכן: ${user.username}`,
      details: JSON.stringify({
        userId: user._id,
        updates
      }),
      emoji: '✏️'
    }).catch(err => logger.error('Activity error:', err));
    
    // Audit log
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'user_updated',
      details: {
        updatedUserId: user._id,
        updates
      }
    }).catch(err => logger.error('AuditLog error:', err));
    
    res.json({
      ok: true,
      user
    });
  } catch (err) {
    logger.error('Error updating user', {
      requestId: req.id || null,
      userId: req.params.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// DELETE /api/users/:id - מחיקת משתמש
// ===============================================
router.delete("/:id", authenticateToken, requirePermission('users:delete'), async (req, res) => {
  try {
    // Cannot delete yourself
    if (req.params.id === req.user.userId || req.params.id === req.user.user) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.USER.CANNOT_DELETE_SELF
      });
    }
    
    const user = await User.findByIdAndDelete(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.USER.NOT_FOUND
      });
    }
    
    logger.success('User deleted', {
      requestId: req.id || null,
      deletedUserId: user._id,
      deletedUsername: user.username,
      deletedBy: req.user.username || req.user.user
    });
    
    // Activity log
    await Activity.create({
      timestamp: new Date(),
      type: 'system',
      user: req.user.username || req.user.user,
      message: `משתמש נמחק: ${user.username}`,
      details: JSON.stringify({
        userId: user._id,
        username: user.username
      }),
      emoji: '🗑️'
    }).catch(err => logger.error('Activity error:', err));
    
    // Audit log
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'user_deleted',
      details: {
        deletedUserId: user._id,
        deletedUsername: user.username
      }
    }).catch(err => logger.error('AuditLog error:', err));
    
    res.json({
      ok: true,
      message: 'משתמש נמחק בהצלחה'
    });
  } catch (err) {
    logger.error('Error deleting user', {
      requestId: req.id || null,
      userId: req.params.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// POST /api/users/:id/reset-password - איפוס סיסמה (Admin)
// ===============================================
router.post("/:id/reset-password", authenticateToken, requirePermission('users:update'), async (req, res) => {
  try {
    const { newPassword } = req.body;
    
    if (!newPassword) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.USER.MISSING_PASSWORD
      });
    }
    
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.USER.WEAK_PASSWORD
      });
    }
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.USER.NOT_FOUND
      });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    user.updatedAt = new Date();
    await user.save();
    
    logger.success('User password reset by admin', {
      requestId: req.id || null,
      targetUserId: user._id,
      targetUsername: user.username,
      resetBy: req.user.username || req.user.user
    });
    
    // Activity log
    await Activity.create({
      timestamp: new Date(),
      type: 'system',
      user: req.user.username || req.user.user,
      message: `סיסמה אופסה למשתמש: ${user.username}`,
      details: JSON.stringify({
        targetUserId: user._id,
        targetUsername: user.username
      }),
      emoji: '🔑'
    }).catch(err => logger.error('Activity error:', err));
    
    // Audit log
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'user_password_reset',
      details: {
        targetUserId: user._id,
        targetUsername: user.username
      }
    }).catch(err => logger.error('AuditLog error:', err));
    
    res.json({
      ok: true,
      message: 'סיסמה אופסה בהצלחה'
    });
  } catch (err) {
    logger.error('Error resetting password', {
      requestId: req.id || null,
      userId: req.params.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

console.log('✅ Users routes loaded - 6 endpoints');

export default router;
