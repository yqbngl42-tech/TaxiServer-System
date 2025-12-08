// ===============================================
// 🔐 REFRESH TOKEN MODEL
// ===============================================
// Manages JWT refresh tokens for secure authentication

import mongoose from 'mongoose';

const RefreshTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUsedAt: {
    type: Date,
    default: Date.now
  },
  userAgent: {
    type: String,
    default: null
  },
  ip: {
    type: String,
    default: null
  }
});

// ===============================================
// 📊 INDEXES
// ===============================================

// Auto-delete expired tokens
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for user lookup
RefreshTokenSchema.index({ userId: 1, expiresAt: 1 });

// ===============================================
// 🔧 METHODS
// ===============================================

/**
 * Check if token is expired
 */
RefreshTokenSchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

/**
 * Update last used timestamp
 */
RefreshTokenSchema.methods.updateLastUsed = function() {
  this.lastUsedAt = new Date();
  return this.save();
};

// ===============================================
// 📈 STATIC METHODS
// ===============================================

/**
 * Delete all expired tokens for cleanup
 */
RefreshTokenSchema.statics.deleteExpired = async function() {
  const now = new Date();
  const result = await this.deleteMany({ expiresAt: { $lt: now } });
  return result.deletedCount;
};

/**
 * Delete all tokens for a user (logout from all devices)
 */
RefreshTokenSchema.statics.deleteAllForUser = async function(userId) {
  const result = await this.deleteMany({ userId });
  return result.deletedCount;
};

/**
 * Count active tokens for a user
 */
RefreshTokenSchema.statics.countActiveForUser = async function(userId) {
  const now = new Date();
  return await this.countDocuments({
    userId,
    expiresAt: { $gt: now }
  });
};

console.log('✅ RefreshToken model loaded');

export default mongoose.model('RefreshToken', RefreshTokenSchema);
