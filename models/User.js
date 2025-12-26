// ===============================================
// 👤 USER MODEL - for v2 Enhanced Routes
// ===============================================
// File location: models/User.js

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 50,
    index: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  passwordHash: {
    type: String,
    required: true,
    select: false // Don't return password by default
  },
  role: {
    type: String,
    enum: ['admin', 'manager', 'viewer', 'operator'],
    default: 'viewer',
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  lockUntil: {
    type: Date,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lastLogin: {
    type: Date,
    default: null
  },
  lastLoginIp: {
    type: String,
    default: null
  },
  createdBy: {
    type: String,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// ===============================================
// INDEXES
// ===============================================
UserSchema.index({ role: 1, isActive: 1 });
UserSchema.index({ isActive: 1, isLocked: 1 });
UserSchema.index({ createdAt: -1 });

// ===============================================
// PRE-SAVE MIDDLEWARE
// ===============================================
UserSchema.pre('save', async function(next) {
  // Update timestamp
  this.updatedAt = new Date();
  
  // Hash password if modified
  if (!this.isModified('passwordHash')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ===============================================
// INSTANCE METHODS
// ===============================================

/**
 * Compare password
 */
UserSchema.methods.comparePassword = async function(candidatePassword) {
  const user = await this.constructor.findById(this._id).select('+passwordHash');
  return await bcrypt.compare(candidatePassword, user.passwordHash);
};

/**
 * Increment login attempts
 */
UserSchema.methods.incLoginAttempts = async function() {
  // If lock has expired, restart count
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return await this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }
  
  // Otherwise increment attempts
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 attempts
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCK_TIME = 2 * 60 * 60 * 1000; // 2 hours
  
  if (this.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS) {
    updates.$set = { lockUntil: new Date(Date.now() + LOCK_TIME) };
  }
  
  return await this.updateOne(updates);
};

/**
 * Reset login attempts
 */
UserSchema.methods.resetLoginAttempts = async function() {
  return await this.updateOne({
    $set: { loginAttempts: 0 },
    $unset: { lockUntil: 1 }
  });
};

/**
 * Update last login
 */
UserSchema.methods.updateLastLogin = async function(ipAddress) {
  this.lastLogin = new Date();
  this.lastLoginIp = ipAddress || null;
  return await this.save();
};

/**
 * Check if account is locked
 */
UserSchema.methods.isLockedNow = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

/**
 * Get safe user object (without sensitive data)
 */
UserSchema.methods.toSafeObject = function() {
  return {
    id: this._id,
    username: this.username,
    email: this.email,
    role: this.role,
    isActive: this.isActive,
    lastLogin: this.lastLogin,
    createdAt: this.createdAt
  };
};

// ===============================================
// STATIC METHODS
// ===============================================

/**
 * Find by username or email
 */
UserSchema.statics.findByCredentials = function(usernameOrEmail) {
  return this.findOne({
    $or: [
      { username: usernameOrEmail },
      { email: usernameOrEmail }
    ]
  }).select('+passwordHash');
};

/**
 * Get active users
 */
UserSchema.statics.getActiveUsers = function() {
  return this.find({ isActive: true }).sort({ username: 1 });
};

/**
 * Get users by role
 */
UserSchema.statics.getUsersByRole = function(role) {
  return this.find({ role, isActive: true }).sort({ username: 1 });
};

/**
 * Count by role
 */
UserSchema.statics.countByRole = async function() {
  return await this.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$role', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
};

console.log('✅ User model loaded');

export default mongoose.model('User', UserSchema);
