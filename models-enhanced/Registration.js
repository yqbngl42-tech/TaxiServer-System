import mongoose from 'mongoose';

const registrationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true,
    unique: true
  },
  idNumber: String,
  address: String,
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'in_progress', 'stuck'],
    default: 'pending'
  },
  rejectionReason: String,
  
  // ADVANCED FEATURES
  attempts: [{
    type: {
      type: String,
      enum: ['phone_verification', 'document_upload', 'id_verification', 'form_submission']
    },
    status: {
      type: String,
      enum: ['success', 'failed', 'partial']
    },
    timestamp: { type: Date, default: Date.now },
    details: mongoose.Schema.Types.Mixed,
    errorMessage: String
  }],
  
  documentsStatus: {
    license: {
      uploaded: { type: Boolean, default: false },
      verified: { type: Boolean, default: false },
      url: String,
      uploadedAt: Date,
      verifiedAt: Date,
      verifiedBy: String,
      rejectionReason: String
    },
    idCard: {
      uploaded: { type: Boolean, default: false },
      verified: { type: Boolean, default: false },
      url: String,
      uploadedAt: Date,
      verifiedAt: Date,
      verifiedBy: String,
      rejectionReason: String
    },
    insurance: {
      uploaded: { type: Boolean, default: false },
      verified: { type: Boolean, default: false },
      url: String,
      uploadedAt: Date,
      verifiedAt: Date,
      verifiedBy: String,
      rejectionReason: String
    },
    vehicle: {
      uploaded: { type: Boolean, default: false },
      verified: { type: Boolean, default: false },
      url: String,
      uploadedAt: Date,
      verifiedAt: Date,
      verifiedBy: String,
      rejectionReason: String
    }
  },
  
  conversionData: {
    source: String,
    campaign: String,
    landingPage: String,
    referrer: String,
    timeToComplete: Number,
    currentStep: String,
    droppedAtStep: String,
    completionPercentage: Number,
    sessionId: String
  },
  
  verificationCode: String,
  verificationCodeExpires: Date,
  verificationAttempts: { type: Number, default: 0 },
  
  sessionData: mongoose.Schema.Types.Mixed,
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date,
  approvedAt: Date,
  approvedBy: String,
  rejectedAt: Date,
  rejectedBy: String,
  lastActivityAt: Date
});

registrationSchema.index({ phone: 1 });
registrationSchema.index({ status: 1 });
registrationSchema.index({ createdAt: -1 });
registrationSchema.index({ lastActivityAt: -1 });

const Registration = mongoose.model('Registration', registrationSchema);
export default Registration;
