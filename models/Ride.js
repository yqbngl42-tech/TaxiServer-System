// ===============================================
// 🚖 RIDE MODEL - Enhanced Version + Production Fixes
// ===============================================

import mongoose from "mongoose";

const RideSchema = new mongoose.Schema({
  rideNumber: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    index: true
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  customerPhone: {
    type: String,
    required: true,
    trim: true
  },
  pickup: {
    type: String,
    required: true,
    trim: true
  },
  destination: {
    type: String,
    required: true,
    trim: true
  },
  scheduledTime: {
    type: String,
    default: null
  },
  notes: {
    type: String,
    default: null
  },
  price: {
    type: Number,
    default: 0,
    min: 0
  },
  commissionRate: {
    type: Number,
    default: 0.10,
    min: 0,
    max: 1
  },
  commissionAmount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ["created", "distributed", "sent", "locked", "assigned", "approved", "enroute", "arrived", "finished", "commission_paid", "cancelled", "completed"],
    default: "created",
    index: true
  },
  uniqueLink: {
    type: String,
    default: null
  },
  uniqueToken: {
    type: String,
    default: null,
    select: false
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  driverPhone: {
    type: String,
    default: null,
    index: true
  },
  driverName: {
    type: String,
    default: null
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    default: null
  },
  driverRating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  driverReview: {
    type: String,
    default: null
  },
  rideType: {
    type: String,
    enum: ["regular", "vip", "delivery", "recurring"],
    default: "regular"
  },
  specialNotes: {
    type: [String],
    default: []
  },
  groupChat: {
    type: String,
    default: "default"
  },
  createdBy: {
    type: String,
    default: "client"
  },
  dispatchMethod: {
    type: String,
    enum: ["bot", "twilio", "manual"],
    default: "bot"
  },
  sentCount: {
    type: Number,
    default: 0
  },
  paymentStatus: {
    type: String,
    enum: ["pending", "paid", "failed", "refunded"],
    default: "pending"
  },
  paymentMethod: {
    type: String,
    enum: ["cash", "card", "bank_transfer", "other"],
    default: "cash"
  },
  paymentDate: {
    type: Date,
    default: null
  },
  // ===============================================
  // 🆕 PRODUCTION FIELDS - Lock Management
  // ===============================================
  lockedBy: {
    type: String,
    default: null
  },
  lockedAt: {
    type: Date,
    default: null
  },
  lockReason: {
    type: String,
    default: null
  },
  // ===============================================
  // 🆕 PRODUCTION FIELDS - Assignment Tracking
  // ===============================================
  assignedBy: {
    type: String,
    default: null
  },
  assignedAt: {
    type: Date,
    default: null
  },
  // ===============================================
  // 🆕 PRODUCTION FIELDS - Cancellation Tracking
  // ===============================================
  cancelledAt: {
    type: Date,
    default: null
  },
  cancelledBy: {
    type: String,
    default: null
  },
  cancelReason: {
    type: String,
    default: null
  },
  // ===============================================
  // 🆕 PRODUCTION FIELDS - Timeline
  // ===============================================
  timeline: [{
    event: String,
    timestamp: { type: Date, default: Date.now },
    details: mongoose.Schema.Types.Mixed
  }],
  // ===============================================
  // 🆕 PRODUCTION FIELDS - Recurring Rides
  // ===============================================
  recurring: {
    enabled: { type: Boolean, default: false },
    frequency: { 
      type: String, 
      enum: ['daily', 'weekly', 'monthly'],
      default: null
    },
    time: { type: String, default: null },
    endDate: { type: Date, default: null },
    nextOccurrence: { type: Date, default: null },
    createdBy: { type: String, default: null }
  },
  // ===============================================
  // 🆕 PRODUCTION FIELDS - Issue Tracking
  // ===============================================
  issues: [{
    type: { type: String, required: true },
    description: { type: String, required: true },
    severity: { 
      type: String, 
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    reportedBy: { type: String, required: true },
    reportedAt: { type: Date, default: Date.now },
    resolved: { type: Boolean, default: false },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: String, default: null }
  }],
  // ===============================================
  // 🆕 PRODUCTION FIELDS - Advanced Pricing
  // ===============================================
  pricingDetails: {
    basePrice: { type: Number, default: 0 },
    distancePrice: { type: Number, default: 0 },
    timePrice: { type: Number, default: 0 },
    surgeMultiplier: { type: Number, default: 1 },
    discount: { type: Number, default: 0 },
    totalBeforeDiscount: { type: Number, default: 0 },
    finalTotal: { type: Number, default: 0 },
    calculatedAt: { type: Date, default: null },
    calculatedBy: { type: String, default: null }
  },
  // ===============================================
  // HISTORY - Legacy field (keep for backwards compatibility)
  // ===============================================
  history: [{
    status: String,
    by: String,
    timestamp: { type: Date, default: Date.now },
    details: String
  }],
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

// Basic indexes for frequent queries
RideSchema.index({ driverPhone: 1, status: 1 });
RideSchema.index({ paymentStatus: 1 });
RideSchema.index({ lockedBy: 1 });

RideSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  if (this.price && this.commissionRate) {
    this.commissionAmount = this.price * this.commissionRate;
  }
  next();
});

RideSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

RideSchema.statics.getStatistics = async function(startDate, endDate = new Date()) {
  return await this.aggregate([
    { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalRevenue: { $sum: '$price' },
        totalCommission: { $sum: '$commissionAmount' }
      }
    }
  ]);
};

RideSchema.statics.getDriverStats = async function(driverPhone, startDate, endDate = new Date()) {
  return await this.aggregate([
    { $match: { driverPhone, createdAt: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalRevenue: { $sum: '$price' },
        averageRating: { $avg: '$driverRating' }
      }
    }
  ]);
};

RideSchema.statics.getDailyStats = async function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return await this.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
        revenue: { $sum: '$price' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

RideSchema.methods.addHistory = function(status, by, details) {
  this.history.push({ status, by, details, timestamp: new Date() });
  return this.save();
};

RideSchema.methods.lockForDriver = async function(driverPhone) {
  if (this.status !== 'sent' && this.status !== 'created') {
    throw new Error('Ride cannot be locked in current status');
  }
  this.status = 'locked';
  this.lockedBy = driverPhone;
  this.lockedAt = new Date();
  await this.addHistory('locked', driverPhone, 'Driver expressed interest');
  return this.save();
};

RideSchema.methods.assignToDriver = async function(driverPhone, driverName) {
  this.status = 'approved';
  this.driverPhone = driverPhone;
  this.driverName = driverName;
  await this.addHistory('approved', driverPhone, 'Ride assigned to driver');
  return this.save();
};

RideSchema.methods.canBeCancelled = function() {
  return ['created', 'sent', 'locked', 'approved'].includes(this.status);
};

RideSchema.methods.isCompleted = function() {
  return ['finished', 'commission_paid', 'completed'].includes(this.status);
};

RideSchema.methods.isActive = function() {
  return !['cancelled', 'finished', 'commission_paid', 'completed'].includes(this.status);
};

// ===============================================
// 📊 PERFORMANCE INDEXES
// ===============================================

// Compound index for status + date (most common query)
RideSchema.index({ status: 1, createdAt: -1 });

// Index for driver queries
RideSchema.index({ driverId: 1, status: 1, createdAt: -1 });
RideSchema.index({ driverPhone: 1, createdAt: -1 });

// Index for customer queries
RideSchema.index({ customerPhone: 1, createdAt: -1 });

// Index for date range queries
RideSchema.index({ createdAt: -1 });
RideSchema.index({ updatedAt: -1 });

// Index for price queries
RideSchema.index({ price: 1 });

// Text search on customer name and locations
RideSchema.index({
  customerName: 'text',
  pickup: 'text',
  destination: 'text'
}, {
  weights: {
    customerName: 10,
    pickup: 5,
    destination: 5
  },
  name: 'ride_text_search'
});

// Index for scheduled rides
RideSchema.index({ scheduledTime: 1, status: 1 });

// Compound index for analytics
RideSchema.index({ status: 1, updatedAt: -1 });
RideSchema.index({ driverId: 1, status: 1, createdAt: 1 });

// 🆕 New indexes for production fields
RideSchema.index({ assignedBy: 1, assignedAt: -1 });
RideSchema.index({ cancelledBy: 1, cancelledAt: -1 });
RideSchema.index({ 'recurring.enabled': 1, 'recurring.nextOccurrence': 1 });
RideSchema.index({ 'issues.resolved': 1, 'issues.severity': 1 });

console.log('✅ Ride model loaded with production enhancements');

export default mongoose.model("Ride", RideSchema);