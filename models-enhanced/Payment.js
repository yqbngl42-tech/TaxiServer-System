import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  driverId: {
    type: String,
    required: true
  },
  driverName: String,
  driverPhone: String,
  amount: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ['commission', 'subscription', 'ride', 'penalty', 'bonus', 'other'],
    default: 'commission'
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'unpaid', 'overdue', 'disputed'],
    default: 'unpaid'
  },
  description: String,
  rideId: String,
  rideNumber: String,
  
  // ADVANCED FEATURES
  receipt: {
    filename: String,
    url: String,
    uploadedAt: Date,
    uploadedBy: String
  },
  
  ocrData: {
    extractedAmount: Number,
    extractedDate: Date,
    vendor: String,
    confidence: Number,
    extractedAt: Date,
    rawText: String
  },
  
  overdueStatus: {
    isOverdue: { type: Boolean, default: false },
    daysPastDue: { type: Number, default: 0 },
    overdueAmount: Number,
    lateFee: { type: Number, default: 0 },
    alertsSent: { type: Number, default: 0 },
    lastAlertSent: Date,
    nextAlertDate: Date
  },
  
  commissionDetails: {
    period: String,
    rideCount: Number,
    totalRidesAmount: Number,
    commissionRate: Number,
    breakdown: [{
      rideId: String,
      rideNumber: String,
      rideAmount: Number,
      commissionAmount: Number,
      date: Date
    }]
  },
  
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'credit_card', 'check', 'other']
  },
  
  transactionId: String,
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date,
  dueDate: Date,
  paidAt: Date,
  paidBy: String
});

paymentSchema.index({ driverId: 1, createdAt: -1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ dueDate: 1 });
paymentSchema.index({ 'overdueStatus.isOverdue': 1 });

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
