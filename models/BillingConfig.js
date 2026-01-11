// ============================================================
// BILLING CONFIG MODEL
// Stores billing configuration (singleton - only one document)
// ============================================================

import mongoose from 'mongoose';

const billingConfigSchema = new mongoose.Schema({
  // Station monthly fee
  stationMonthlyPrice: {
    type: Number,
    required: true,
    default: 500,
    min: 0
  },
  
  // Commission percentages
  externalCommissionPercent: {
    type: Number,
    required: true,
    default: 10,
    min: 0,
    max: 100
  },
  
  internalCommissionPercent: {
    type: Number,
    required: true,
    default: 8,
    min: 0,
    max: 100
  },
  
  // Minimum commission per ride
  minimumCommission: {
    type: Number,
    default: 50,
    min: 0
  },
  
  // Currency
  currency: {
    type: String,
    default: 'ILS',
    enum: ['ILS', 'USD', 'EUR']
  },
  
  // Tax rate (VAT)
  taxRate: {
    type: Number,
    default: 17, // Israel VAT
    min: 0,
    max: 100
  },
  
  // Metadata
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  updatedBy: {
    type: String,
    default: 'system'
  }
}, {
  timestamps: true
});

// Ensure only one config exists
billingConfigSchema.statics.getConfig = async function() {
  let config = await this.findOne();
  
  if (!config) {
    config = await this.create({
      stationMonthlyPrice: 500,
      externalCommissionPercent: 10,
      internalCommissionPercent: 8,
      minimumCommission: 50,
      currency: 'ILS',
      taxRate: 17
    });
  }
  
  return config;
};

// Method to calculate commission
billingConfigSchema.methods.calculateCommission = function(amount, isExternal = false) {
  const commissionPercent = isExternal 
    ? this.externalCommissionPercent 
    : this.internalCommissionPercent;
  
  let commission = (amount * commissionPercent) / 100;
  
  // Apply minimum commission
  if (this.minimumCommission && commission < this.minimumCommission) {
    commission = this.minimumCommission;
  }
  
  return {
    amount,
    commissionPercent,
    commission,
    netAmount: amount - commission,
    tax: (commission * this.taxRate) / 100,
    minimumCommissionApplied: this.minimumCommission && commission === this.minimumCommission
  };
};

const BillingConfig = mongoose.model('BillingConfig', billingConfigSchema);

export default BillingConfig;