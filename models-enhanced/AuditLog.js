import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  username: String,
  action: {
    type: String,
    required: true,
    enum: [
      'login',
      'logout',
      'login_failed',
      'password_changed',
      'password_reset_requested',
      'user_created',
      'user_updated',
      'user_deleted',
      'ride_created',
      'ride_updated',
      'ride_cancelled',
      'driver_created',
      'driver_updated',
      'driver_blocked',
      'driver_unblocked',
      'payment_marked_paid',
      'registration_approved',
      'registration_rejected',
      'settings_updated'
    ]
  },
  details: mongoose.Schema.Types.Mixed,
  ipAddress: String,
  userAgent: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Indexes
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
