import mongoose from 'mongoose';

const driverSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  idNumber: String,
  address: String,
  commissionPercent: { type: Number, default: 10 },
  isActive: { type: Boolean, default: true },
  isBlocked: { type: Boolean, default: false },
  totalRides: { type: Number, default: 0 },
  
  // ADVANCED FEATURES
  notes: [{
    text: String,
    createdBy: String,
    createdAt: { type: Date, default: Date.now },
    isPrivate: { type: Boolean, default: false }
  }],
  
  statusHistory: [{
    status: String,
    changedBy: String,
    changedAt: { type: Date, default: Date.now },
    reason: String
  }],
  
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 },
    reviews: [{
      rating: Number,
      comment: String,
      rideId: String,
      createdAt: { type: Date, default: Date.now }
    }]
  },
  
  documents: [{
    type: { type: String, enum: ['license', 'id', 'insurance', 'vehicle', 'other'] },
    filename: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now },
    verified: { type: Boolean, default: false },
    verifiedBy: String,
    verifiedAt: Date,
    expiresAt: Date
  }],
  
  statistics: {
    successRate: { type: Number, default: 0 },
    avgResponseTime: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    completedRides: { type: Number, default: 0 },
    cancelledRides: { type: Number, default: 0 },
    lastRideDate: Date
  },
  
  region: {
    name: String,
    code: String
  },
  
  subscriptionPlan: { type: String, default: 'standard' },
  lastRideDate: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date
});

driverSchema.index({ phone: 1 });
driverSchema.index({ isActive: 1, isBlocked: 1 });
driverSchema.index({ 'region.code': 1 });

const Driver = mongoose.model('Driver', driverSchema);
export default Driver;
