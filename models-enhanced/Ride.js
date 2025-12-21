import mongoose from 'mongoose';

const rideSchema = new mongoose.Schema({
  rideNumber: {
    type: String,
    required: true,
    unique: true
  },
  customerName: {
    type: String,
    required: true
  },
  customerPhone: {
    type: String,
    required: true
  },
  pickup: {
    type: String,
    required: true
  },
  destination: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['created', 'sent', 'locked', 'assigned', 'approved', 'enroute', 'arrived', 'finished', 'cancelled'],
    default: 'created'
  },
  driverPhone: String,
  driverName: String,
  commissionAmount: Number,
  notes: String,
  cancelReason: String,
  
  // ADVANCED FEATURES
  actionHistory: [{
    action: {
      type: String,
      enum: ['created', 'sent', 'locked', 'assigned', 'cancelled', 'redispatched', 'completed', 'issue_reported']
    },
    performedBy: String,
    timestamp: { type: Date, default: Date.now },
    details: mongoose.Schema.Types.Mixed
  }],
  
  pricingDetails: {
    basePrice: Number,
    distancePrice: Number,
    timePrice: Number,
    surgeMultiplier: { type: Number, default: 1 },
    discount: { type: Number, default: 0 },
    totalBeforeDiscount: Number,
    finalTotal: Number,
    calculatedAt: Date
  },
  
  recurring: {
    enabled: { type: Boolean, default: false },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly']
    },
    dayOfWeek: Number,
    dayOfMonth: Number,
    time: String,
    nextOccurrence: Date,
    endDate: Date,
    totalOccurrences: Number,
    remainingOccurrences: Number
  },
  
  issues: [{
    type: {
      type: String,
      enum: ['customer_complaint', 'driver_issue', 'payment_dispute', 'route_problem', 'other']
    },
    description: String,
    reportedBy: String,
    reportedAt: { type: Date, default: Date.now },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    resolved: { type: Boolean, default: false },
    resolvedBy: String,
    resolvedAt: Date,
    resolution: String
  }],
  
  timeline: [{
    event: {
      type: String,
      enum: ['created', 'dispatched', 'driver_assigned', 'driver_accepted', 'driver_enroute', 'driver_arrived', 'ride_started', 'ride_completed', 'payment_received']
    },
    timestamp: { type: Date, default: Date.now },
    location: {
      lat: Number,
      lng: Number,
      address: String
    },
    details: mongoose.Schema.Types.Mixed
  }],
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date,
  completedAt: Date,
  cancelledAt: Date
});

rideSchema.index({ rideNumber: 1 });
rideSchema.index({ status: 1 });
rideSchema.index({ customerPhone: 1 });
rideSchema.index({ driverPhone: 1 });
rideSchema.index({ createdAt: -1 });
rideSchema.index({ 'recurring.enabled': 1, 'recurring.nextOccurrence': 1 });

const Ride = mongoose.model('Ride', rideSchema);
export default Ride;
