// ===============================================
// 🚖 RIDE MODEL - Enhanced Version
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
    // index: composite index defined below
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
    enum: ["created", "distributed", "sent", "locked", "assigned", "approved", "enroute", "arrived", "finished", "commission_paid", "cancelled"],
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
    enum: ["regular", "vip", "delivery"],
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
  lockedBy: {
    type: String,
    default: null
  },
  lockedAt: {
    type: Date,
    default: null
  },
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
// Note: Compound indexes below cover status and customerPhone
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
  return ['finished', 'commission_paid'].includes(this.status);
};

RideSchema.methods.isActive = function() {
  return !['cancelled', 'finished', 'commission_paid'].includes(this.status);
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
RideSchema.index({ completedAt: -1 });

// Index for price queries
RideSchema.index({ price: 1 });

// Text search on customer name and locations
RideSchema.index({
  customerName: 'text',
  pickupLocation: 'text',
  dropoffLocation: 'text'
}, {
  weights: {
    customerName: 10,
    pickupLocation: 5,
    dropoffLocation: 5
  },
  name: 'ride_text_search'
});

// Index for scheduled rides
RideSchema.index({ scheduledFor: 1, status: 1 });

// Compound index for analytics
RideSchema.index({ status: 1, completedAt: -1 });
RideSchema.index({ driverId: 1, status: 1, createdAt: 1 });

console.log('✅ Ride model loaded with indexes and methods');

export default mongoose.model("Ride", RideSchema);