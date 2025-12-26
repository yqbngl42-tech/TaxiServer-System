// ===============================================
// 📝 AUDIT LOG MODEL - for v2 Enhanced Routes
// ===============================================
// File location: models/AuditLog.js

import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  username: {
    type: String,
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    index: true,
    // Examples: 'login', 'logout', 'driver_created', 'ride_updated', 
    //           'payment_marked_paid', 'user_created', etc.
  },
  resource: {
    type: String,
    default: null,
    index: true
    // What was affected: 'driver', 'ride', 'payment', 'user', etc.
  },
  resourceId: {
    type: String,
    default: null,
    index: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
    // Any additional info about the action
    // Examples: { oldValue: 'active', newValue: 'blocked' }
    //           { amount: 100, method: 'cash' }
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['success', 'failure', 'error'],
    default: 'success',
    index: true
  },
  errorMessage: {
    type: String,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// ===============================================
// INDEXES FOR PERFORMANCE
// ===============================================

// Most common query: get logs for a user
AuditLogSchema.index({ userId: 1, timestamp: -1 });

// Query logs by action type
AuditLogSchema.index({ action: 1, timestamp: -1 });

// Query logs for specific resource
AuditLogSchema.index({ resource: 1, resourceId: 1, timestamp: -1 });

// Query recent logs
AuditLogSchema.index({ timestamp: -1 });

// Query failed actions
AuditLogSchema.index({ status: 1, timestamp: -1 });

// Combined index for admin dashboard
AuditLogSchema.index({ action: 1, status: 1, timestamp: -1 });

// ===============================================
// STATIC METHODS
// ===============================================

/**
 * Get logs for specific user
 */
AuditLogSchema.statics.getUserLogs = function(userId, limit = 50, skip = 0) {
  return this.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

/**
 * Get logs for specific resource
 */
AuditLogSchema.statics.getResourceLogs = function(resource, resourceId, limit = 50) {
  return this.find({ resource, resourceId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
};

/**
 * Get recent actions (last N hours)
 */
AuditLogSchema.statics.getRecentActions = function(hours = 24, limit = 100) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.find({ timestamp: { $gte: since } })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
};

/**
 * Get failed login attempts
 */
AuditLogSchema.statics.getFailedLogins = function(hours = 24, limit = 100) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.find({
    action: 'login_failed',
    timestamp: { $gte: since }
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
};

/**
 * Get logs by action type
 */
AuditLogSchema.statics.getActionLogs = function(action, limit = 100, skip = 0) {
  return this.find({ action })
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

/**
 * Get statistics for time period
 */
AuditLogSchema.statics.getStatistics = async function(startDate, endDate) {
  const match = {
    timestamp: {
      $gte: startDate,
      $lte: endDate || new Date()
    }
  };
  
  const [actionStats, userStats, statusStats] = await Promise.all([
    // Actions breakdown
    this.aggregate([
      { $match: match },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]),
    
    // Most active users
    this.aggregate([
      { $match: match },
      { $group: { _id: '$username', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]),
    
    // Status breakdown
    this.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])
  ]);
  
  return {
    period: {
      start: startDate,
      end: endDate || new Date()
    },
    totalActions: actionStats.reduce((sum, item) => sum + item.count, 0),
    byAction: actionStats,
    byUser: userStats,
    byStatus: statusStats
  };
};

/**
 * Get activity timeline (hourly)
 */
AuditLogSchema.statics.getActivityTimeline = async function(hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return await this.aggregate([
    { $match: { timestamp: { $gte: since } } },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d %H:00',
            date: '$timestamp'
          }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

/**
 * Clean old logs (older than N days)
 */
AuditLogSchema.statics.cleanOldLogs = async function(daysToKeep = 90) {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
  
  const result = await this.deleteMany({
    timestamp: { $lt: cutoffDate }
  });
  
  return {
    deleted: result.deletedCount,
    cutoffDate
  };
};

// ===============================================
// INSTANCE METHODS
// ===============================================

/**
 * Get formatted log entry
 */
AuditLogSchema.methods.format = function() {
  return {
    id: this._id,
    user: {
      id: this.userId,
      username: this.username
    },
    action: this.action,
    resource: this.resource ? {
      type: this.resource,
      id: this.resourceId
    } : null,
    details: this.details,
    status: this.status,
    error: this.errorMessage,
    metadata: {
      ip: this.ipAddress,
      userAgent: this.userAgent
    },
    timestamp: this.timestamp
  };
};

// ===============================================
// HELPER FUNCTION
// ===============================================

/**
 * Quick log creation helper
 * @param {Object} data - Log data
 * @returns {Promise<AuditLog>}
 */
export async function logAction(data) {
  try {
    return await AuditLog.create({
      userId: data.userId || 'system',
      username: data.username || 'system',
      action: data.action,
      resource: data.resource || null,
      resourceId: data.resourceId || null,
      details: data.details || {},
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
      status: data.status || 'success',
      errorMessage: data.error || null
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw - we don't want audit logging to break the app
    return null;
  }
}

console.log('✅ AuditLog model loaded');

const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
export default AuditLog;
