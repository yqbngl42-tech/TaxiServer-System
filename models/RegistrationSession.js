// ===============================================
// 📝 REGISTRATION SESSION MODEL
// ===============================================
// מנהל את תהליך הרישום של נהגים דרך WhatsApp

import mongoose from "mongoose";

const RegistrationSessionSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  currentStep: {
    type: String,
    enum: [
      'awaiting_name',
      'awaiting_id',
      'awaiting_car_type',
      'awaiting_car_number',
      'awaiting_work_area',
      'awaiting_city',                    // 🆕
      'awaiting_id_document_photo',       // 🆕 (רישיון או ת.ז.)
      'awaiting_profile_photo',           // 🆕
      'awaiting_car_photo',               // 🆕
      // שלבים ישנים (לתמיכה לאחור)
      'awaiting_license_photo',
      'awaiting_car_license_photo',
      'awaiting_insurance_photo',
      'completed'
    ],
    default: 'awaiting_name'
  },
  data: {
    name: {
      type: String,
      default: null
    },
    idNumber: {
      type: String,
      default: null
    },
    carType: {
      type: String,
      default: null
    },
    carNumber: {
      type: String,
      default: null
    },
    workArea: {
      type: String,
      default: null
    },
    city: {                    // 🆕 עיר מגורים
      type: String,
      default: null
    }
  },
  documents: {
    idDocument: {              // 🆕 רישיון נהיגה או ת.ז.
      url: String,
      uploadedAt: Date
    },
    profilePhoto: {            // 🆕 תמונת פרופיל
      url: String,
      uploadedAt: Date
    },
    carPhoto: {                // 🆕 תמונת רכב
      url: String,
      uploadedAt: Date
    },
    // שדות ישנים (לתמיכה לאחור)
    license: {
      url: String,
      uploadedAt: Date
    },
    carLicense: {
      url: String,
      uploadedAt: Date
    },
    insurance: {
      url: String,
      uploadedAt: Date
    }
  },
  status: {
    type: String,
    enum: ['in_progress', 'pending_approval', 'approved', 'rejected'],
    default: 'in_progress'
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: null
  },
  lastActivityAt: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    default: null
  }
});

// Index for cleanup of old sessions
RegistrationSessionSchema.index({ lastActivityAt: 1 });

// Update lastActivityAt on save
RegistrationSessionSchema.pre('save', function(next) {
  this.lastActivityAt = new Date();
  next();
});

// Clean up old sessions (older than 24 hours)
RegistrationSessionSchema.statics.cleanupOldSessions = async function() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return await this.deleteMany({
    status: 'in_progress',
    lastActivityAt: { $lt: oneDayAgo }
  });
};

console.log('✅ RegistrationSession model loaded');

export default mongoose.model("RegistrationSession", RegistrationSessionSchema);
