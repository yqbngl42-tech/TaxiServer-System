import mongoose from 'mongoose';

// ===============================================
// 💳 PENDING PAYMENT MODEL
// ===============================================
// תשלומים ממתינים עם קוד חד-פעמי
// נוצר כשנהג צריך לשלם עמלה

const pendingPaymentSchema = new mongoose.Schema({
  // ===============================================
  // 🔑 מזהים
  // ===============================================
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: true,
    index: true
  },
  
  // ===============================================
  // 💰 פרטי תשלום
  // ===============================================
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // קוד תשלום חד-פעמי (6 ספרות)
  paymentCode: {
    type: String,
    required: true,
    unique: true,
    index: true,
    match: /^\d{6}$/
  },
  
  // ===============================================
  // ⏰ זמנים
  // ===============================================
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  
  // ===============================================
  // 📊 סטטוס
  // ===============================================
  status: {
    type: String,
    enum: ['pending', 'verified', 'failed', 'expired', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  // ===============================================
  // 📸 תמונת אימות
  // ===============================================
  screenshotUrl: {
    type: String,
    default: null
  },
  
  screenshotUploadedAt: {
    type: Date,
    default: null
  },
  
  // ===============================================
  // 🔍 תוצאות OCR
  // ===============================================
  ocrResult: {
    extractedText: String,      // הטקסט המלא שנסרק
    detectedCode: String,        // הקוד שזוהה
    detectedAmount: Number,      // הסכום שזוהה
    detectedPhone: String,       // מספר טלפון שזוהה
    detectedDate: String,        // תאריך שזוהה
    confidence: Number,          // רמת ביטחון (0-1)
    processingTime: Number       // זמן עיבוד במילישניות
  },
  
  // ===============================================
  // ✅ אימות
  // ===============================================
  verification: {
    codeMatch: Boolean,          // האם הקוד תואם?
    amountMatch: Boolean,        // האם הסכום תואם?
    phoneMatch: Boolean,         // האם מספר הטלפון תואם?
    timeValid: Boolean,          // האם התשלום בזמן?
    overallValid: Boolean,       // אימות כללי
    failureReason: String        // סיבת כשל
  },
  
  // ===============================================
  // 📨 תזכורות
  // ===============================================
  reminders: [{
    sentAt: Date,
    type: {
      type: String,
      enum: ['first', 'second', 'third', 'final', 'block']
    },
    message: String
  }],
  
  remindersSent: {
    type: Number,
    default: 0
  },
  
  lastReminderAt: {
    type: Date,
    default: null
  },
  
  // ===============================================
  // 🔒 חסימה
  // ===============================================
  blockedAt: {
    type: Date,
    default: null
  },
  
  blockReason: {
    type: String,
    default: null
  },
  
  // ===============================================
  // 📝 הערות ומידע נוסף
  // ===============================================
  notes: {
    type: String,
    default: null
  },
  
  // פרטי העסקה
  transactionDetails: {
    bankName: String,
    transactionId: String,
    rawData: mongoose.Schema.Types.Mixed
  },
  
  // ===============================================
  // 🔧 אדמין
  // ===============================================
  manuallyVerified: {
    type: Boolean,
    default: false
  },
  
  manuallyVerifiedBy: {
    type: String,
    default: null
  },
  
  manuallyVerifiedAt: {
    type: Date,
    default: null
  },
  
  adminNotes: {
    type: String,
    default: null
  }
  
}, {
  timestamps: true
});

// ===============================================
// 📊 INDEXES
// ===============================================

pendingPaymentSchema.index({ driverId: 1, status: 1 });
pendingPaymentSchema.index({ paymentCode: 1 });
pendingPaymentSchema.index({ createdAt: -1 });
pendingPaymentSchema.index({ expiresAt: 1 });
pendingPaymentSchema.index({ status: 1, createdAt: -1 });

// ===============================================
// 🔧 METHODS
// ===============================================

/**
 * בדיקה האם הקוד פג תוקף
 */
pendingPaymentSchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

/**
 * הוספת תזכורת
 */
pendingPaymentSchema.methods.addReminder = function(type, message) {
  this.reminders.push({
    sentAt: new Date(),
    type,
    message
  });
  this.remindersSent++;
  this.lastReminderAt = new Date();
};

/**
 * סימון כמאומת
 */
pendingPaymentSchema.methods.markAsVerified = function(ocrData, verification) {
  this.status = 'verified';
  this.ocrResult = ocrData;
  this.verification = verification;
};

/**
 * סימון ככשל
 */
pendingPaymentSchema.methods.markAsFailed = function(reason) {
  this.status = 'failed';
  this.verification = {
    overallValid: false,
    failureReason: reason
  };
};

/**
 * סימון כפג תוקף
 */
pendingPaymentSchema.methods.markAsExpired = function() {
  this.status = 'expired';
};

/**
 * אימות ידני על ידי אדמין
 */
pendingPaymentSchema.methods.manualVerify = function(adminPhone, notes) {
  this.status = 'verified';
  this.manuallyVerified = true;
  this.manuallyVerifiedBy = adminPhone;
  this.manuallyVerifiedAt = new Date();
  this.adminNotes = notes;
};

// ===============================================
// 🔍 STATIC METHODS
// ===============================================

/**
 * מצא תשלום לפי קוד
 */
pendingPaymentSchema.statics.findByCode = function(code) {
  return this.findOne({ paymentCode: code });
};

/**
 * מצא תשלומים ממתינים לנהג
 */
pendingPaymentSchema.statics.findPendingForDriver = function(driverId) {
  return this.find({
    driverId,
    status: 'pending',
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: -1 });
};

/**
 * מצא תשלומים שפגי תוקף
 */
pendingPaymentSchema.statics.findExpired = function() {
  return this.find({
    status: 'pending',
    expiresAt: { $lt: new Date() }
  });
};

/**
 * מצא תשלומים שצריכים תזכורת
 */
pendingPaymentSchema.statics.findNeedingReminders = function() {
  const now = new Date();
  
  return this.find({
    status: 'pending',
    expiresAt: { $gt: now },
    $or: [
      // תזכורת ראשונה - אחרי 10 דקות
      {
        remindersSent: 0,
        createdAt: { $lt: new Date(now - 10 * 60 * 1000) }
      },
      // תזכורת שנייה - אחרי שעה
      {
        remindersSent: 1,
        createdAt: { $lt: new Date(now - 60 * 60 * 1000) }
      },
      // תזכורת שלישית - אחרי 12 שעות
      {
        remindersSent: 2,
        createdAt: { $lt: new Date(now - 12 * 60 * 60 * 1000) }
      },
      // תזכורת אחרונה - אחרי 48 שעות
      {
        remindersSent: 3,
        createdAt: { $lt: new Date(now - 48 * 60 * 60 * 1000) }
      }
    ]
  });
};

/**
 * סטטיסטיקות
 */
pendingPaymentSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);
  
  return {
    total: await this.countDocuments(),
    pending: stats.find(s => s._id === 'pending')?.count || 0,
    verified: stats.find(s => s._id === 'verified')?.count || 0,
    failed: stats.find(s => s._id === 'failed')?.count || 0,
    expired: stats.find(s => s._id === 'expired')?.count || 0,
    totalAmount: stats.reduce((sum, s) => sum + s.totalAmount, 0)
  };
};

// ===============================================
// 🔄 MIDDLEWARE
// ===============================================

// לפני שמירה - בדוק תפוגה
pendingPaymentSchema.pre('save', function(next) {
  if (this.isExpired() && this.status === 'pending') {
    this.status = 'expired';
  }
  next();
});

// ===============================================
// 📤 EXPORT
// ===============================================

const PendingPayment = mongoose.model('PendingPayment', pendingPaymentSchema);

export default PendingPayment;
