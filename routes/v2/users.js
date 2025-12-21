import express from 'express';
import bcrypt from 'bcryptjs';
import { authenticateToken } from './auth-enhanced.js';
import { requirePermission } from '../../middleware/rbac.js';
import User from '../../models/User.js';
import AuditLog from '../../models/AuditLog.js';

const router = express.Router();

// ===============================================
// GET ALL USERS
// ===============================================
router.get('/', authenticateToken, requirePermission('users:read'), async (req, res) => {
  try {
    const users = await User.find().select('-passwordHash -passwordResetToken').sort({ createdAt: -1 });
    res.json({ ok: true, data: { items: users } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// GET SINGLE USER
// ===============================================
router.get('/:id', authenticateToken, requirePermission('users:read'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-passwordHash -passwordResetToken');
    
    if (!user) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'משתמש לא נמצא' }
      });
    }
    
    res.json({ ok: true, data: { user } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// CREATE USER
// ===============================================
router.post('/', authenticateToken, requirePermission('users:create'), async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({
        ok: false,
        error: { code: 'MISSING_FIELDS', message: 'חסרים שדות חובה' }
      });
    }

    // Check if exists
    const exists = await User.findOne({ $or: [{ username }, { email }] });
    if (exists) {
      return res.status(400).json({
        ok: false,
        error: { code: 'USER_EXISTS', message: 'משתמש קיים' }
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      username,
      email,
      passwordHash,
      role: role || 'viewer',
      createdBy: req.user.username
    });

    await AuditLog.create({
      userId: req.user.userId,
      username: req.user.username,
      action: 'user_created',
      details: { newUserId: user._id, newUsername: user.username, role: user.role }
    });
    
    res.json({ ok: true, data: { user: { id: user._id, username: user.username, email: user.email, role: user.role } } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// UPDATE USER
// ===============================================
router.put('/:id', authenticateToken, requirePermission('users:update'), async (req, res) => {
  try {
    const updates = {};
    if (req.body.email) updates.email = req.body.email;
    if (req.body.role) updates.role = req.body.role;
    if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
    
    updates.updatedAt = new Date();

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).select('-passwordHash -passwordResetToken');
    
    if (!user) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'משתמש לא נמצא' }
      });
    }

    await AuditLog.create({
      userId: req.user.userId,
      username: req.user.username,
      action: 'user_updated',
      details: { updatedUserId: user._id, updates }
    });
    
    res.json({ ok: true, data: { user } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// DELETE USER
// ===============================================
router.delete('/:id', authenticateToken, requirePermission('users:delete'), async (req, res) => {
  try {
    // Cannot delete yourself
    if (req.params.id === req.user.userId) {
      return res.status(400).json({
        ok: false,
        error: { code: 'CANNOT_DELETE_SELF', message: 'לא ניתן למחוק את עצמך' }
      });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'משתמש לא נמצא' }
      });
    }

    await AuditLog.create({
      userId: req.user.userId,
      username: req.user.username,
      action: 'user_deleted',
      details: { deletedUserId: user._id, deletedUsername: user.username }
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
// RESET USER PASSWORD (ADMIN)
// ===============================================
router.post('/:id/reset-password', authenticateToken, requirePermission('users:update'), async (req, res) => {
  try {
    const { newPassword } = req.body;
    
    if (!newPassword) {
      return res.status(400).json({
        ok: false,
        error: { code: 'MISSING_PASSWORD', message: 'חסרה סיסמה' }
      });
    }

    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'משתמש לא נמצא' }
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    user.updatedAt = new Date();
    await user.save();

    await AuditLog.create({
      userId: req.user.userId,
      username: req.user.username,
      action: 'user_password_reset',
      details: { targetUserId: user._id, targetUsername: user.username }
    });
    
    res.json({ ok: true, data: {} });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

export default router;
