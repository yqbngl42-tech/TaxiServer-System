// ===============================================
// 💰 PAYMENT MODEL - ULTIMATE MERGED VERSION v2.0
// ===============================================
// Fixed: timestamps, driverId, status separation
// ===============================================

import mongoose from "mongoose";

const PaymentSchema = new mongoose.Schema({
  // ============================================
  // CORE REFERENCES
  // ============================================
  
  ride: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Ride",
    required: true,
    index: true
  },
  
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Driver",
    index: true
  },
  
  driverPhone: {
    type: String,
    required: true,
    trim: true
  },
  
  driverName: {
    type: String,
    trim: true
  },
  
  // ============================================
  // PAYMENT DETAILS
  // ============================================
  
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  
  type: {
    type: String,
    enum: ['commission', 'subscription', 'ride', 'penalty', 'bonus', 'other'],
    default: 'ride'
  },
  
  description: {
    type: String,
    trim: true
  },
  
  notes: {
    type: String,
    default: null
  },
  
  rideNumber: {
    type: String,
    trim: true
  },
  
  transactionId: {
    type: String,
    trim: true
  },
  
  // ============================================
  // STATUS - SEPARATED (approval vs payment)
  // ============================================
  
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },
  
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'paid', 'overdue', 'disputed'],
    default: 'unpaid',
    index: true
  },
  
  // Backward compatibility - computed from approvalStatus + paymentStatus
  // DO NOT SET DIRECTLY - use approvalStatus and paymentStatus instead
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'paid', 'unpaid', 'overdue', 'disputed'],
    default: 'pending'
  },
  
  // ============================================
  // PAYMENT METHOD
  // ============================================
  
  paymentMethod: {
    type: String,
    enum: [
      'cash',
      'transfer',
      'bank_transfer',
      'card',
      'credit_card',
      'check',
      'other'
    ],
    default: "cash"
  },
  
  // ============================================
  // RECEIPT
  // ============================================
  
  receipt: {
    filename: String,
    url: String,
    uploadedAt: Date,
    uploadedBy: String
  },
  
  // ============================================
  // OCR DATA
  // ============================================
  
  ocrData: {
    extractedAmount: Number,
    extractedDate: Date,
    vendor: String,
    confidence: {
      type: Number,
      min: 0,
      max: 1
    },
    extractedAt: Date,
    rawText: String
  },
  
  // ============================================
  // OVERDUE TRACKING
  // ============================================
  
  overdueStatus: {
    isOverdue: { 
      type: Boolean, 
      default: false,
      index: true
    },
    daysPastDue: { 
      type: Number, 
      default: 0,
      min: 0
    },
    overdueAmount: {
      type: Number,
      min: 0
    },
    lateFee: { 
      type: Number, 
      default: 0,
      min: 0
    },
    alertsSent: { 
      type: Number, 
      default: 0,
      min: 0
    },
    lastAlertSent: Date,
    nextAlertDate: Date
  },
  
  // ============================================
  // COMMISSION DETAILS
  // ============================================
  
  commissionDetails: {
    period: String,
    rideCount: {
      type: Number,
      min: 0
    },
    totalRidesAmount: {
      type: Number,
      min: 0
    },
    commissionRate: {
      type: Number,
      min: 0,
      max: 1
    },
    breakdown: [{
      rideId: String,
      rideNumber: String,
      rideAmount: Number,
      commissionAmount: Number,
      date: Date
    }]
  },
  
  // ============================================
  // DATES
  // ============================================
  
  dueDate: {
    type: Date,
    index: true
  },
  
  paidAt: Date,
  
  paidBy: String
  
}, {
  timestamps: true // Auto-creates createdAt and updatedAt
});

// ============================================
// INDEXES (for performance)
// ============================================

PaymentSchema.index({ driver: 1, createdAt: -1 });
PaymentSchema.index({ approvalStatus: 1 });
PaymentSchema.index({ paymentStatus: 1 });
PaymentSchema.index({ dueDate: 1 });
PaymentSchema.index({ 'overdueStatus.isOverdue': 1 });
PaymentSchema.index({ ride: 1 });
PaymentSchema.index({ type: 1 });

// ============================================
// VIRTUAL - COMPUTED STATUS
// ============================================

PaymentSchema.virtual('computedStatus').get(function() {
  // If rejected - always rejected
  if (this.approvalStatus === 'rejected') {
    return 'rejected';
  }
  
  // If pending approval
  if (this.approvalStatus === 'pending') {
    return 'pending';
  }
  
  // Approved - return payment status
  return this.paymentStatus;
});

// ============================================
// METHODS
// ============================================

// Check if payment is overdue
PaymentSchema.methods.checkOverdue = function() {
  if (!this.dueDate || this.paymentStatus === 'paid') {
    return false;
  }
  
  const now = new Date();
  return now > this.dueDate;
};

// Calculate days past due
PaymentSchema.methods.getDaysPastDue = function() {
  if (!this.dueDate || this.paymentStatus === 'paid') {
    return 0;
  }
  
  const now = new Date();
  if (now <= this.dueDate) {
    return 0;
  }
  
  const diffTime = Math.abs(now - this.dueDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

// Update overdue status (safe - doesn't override user actions)
PaymentSchema.methods.updateOverdueStatus = function() {
  // CRITICAL: Only auto-update if not manually set to paid/rejected
  if (['paid', 'rejected', 'disputed'].includes(this.paymentStatus)) {
    return this; // Don't touch finalized payments
  }
  
  if (this.checkOverdue()) {
    this.overdueStatus.isOverdue = true;
    this.overdueStatus.daysPastDue = this.getDaysPastDue();
    this.paymentStatus = 'overdue';
  }
  
  return this;
};

// ============================================
// MIDDLEWARE
// ============================================

// Sync old 'status' field with new separated statuses
PaymentSchema.pre('save', function(next) {
  // Auto-calculate overdue status (safe - won't override manual actions)
  if (this.dueDate && this.approvalStatus === 'approved') {
    this.updateOverdueStatus();
  }
  
  // Sync backward-compatible 'status' field
  if (this.approvalStatus === 'rejected') {
    this.status = 'rejected';
  } else if (this.approvalStatus === 'pending') {
    this.status = 'pending';
  } else if (this.approvalStatus === 'approved') {
    // Approved - use payment status
    this.status = this.paymentStatus;
  }
  
  next();
});

// ============================================
// STATICS
// ============================================

// Find overdue payments
PaymentSchema.statics.findOverdue = function() {
  return this.find({
    'overdueStatus.isOverdue': true,
    paymentStatus: { $ne: 'paid' }
  });
};

// Find pending approvals
PaymentSchema.statics.findPendingApproval = function() {
  return this.find({
    approvalStatus: 'pending'
  });
};

// ============================================
// EXPORT
// ============================================

export default mongoose.model("Payment", PaymentSchema);