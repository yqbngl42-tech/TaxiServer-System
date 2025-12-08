// ===============================================
// ✅ INPUT VALIDATION SCHEMAS
// ===============================================
// Comprehensive validation for all API endpoints using Joi

import Joi from 'joi';

// ===============================================
// 🔧 CUSTOM VALIDATORS
// ===============================================

// Israeli phone number validation
const israeliPhone = Joi.string()
  .pattern(/^05\d{8}$/)
  .messages({
    'string.pattern.base': 'מספר טלפון חייב להיות בפורמט 05XXXXXXXX'
  });

// Israeli ID number validation (with checksum)
const israeliId = Joi.string()
  .length(9)
  .pattern(/^\d{9}$/)
  .custom((value, helpers) => {
    // Luhn algorithm for Israeli ID
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let digit = parseInt(value[i]);
      if (i % 2 === 0) {
        digit *= 1;
      } else {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    if (sum % 10 !== 0) {
      return helpers.error('any.invalid');
    }
    return value;
  })
  .messages({
    'any.invalid': 'תעודת זהות לא תקינה'
  });

// ===============================================
// 📝 RIDE SCHEMAS
// ===============================================

export const rideSchemas = {
  // Create ride
  create: Joi.object({
    customerName: Joi.string()
      .min(2)
      .max(100)
      .trim()
      .required()
      .messages({
        'string.min': 'שם לקוח חייב להכיל לפחות 2 תווים',
        'string.max': 'שם לקוח לא יכול להכיל יותר מ-100 תווים',
        'any.required': 'שם לקוח הוא שדה חובה'
      }),
    
    customerPhone: israeliPhone.required(),
    
    pickupLocation: Joi.string()
      .min(3)
      .max(500)
      .trim()
      .required()
      .messages({
        'string.min': 'מיקום איסוף חייב להכיל לפחות 3 תווים',
        'any.required': 'מיקום איסוף הוא שדה חובה'
      }),
    
    dropoffLocation: Joi.string()
      .min(3)
      .max(500)
      .trim()
      .required()
      .messages({
        'string.min': 'מיקום יעד חייב להכיל לפחות 3 תווים',
        'any.required': 'מיקום יעד הוא שדה חובה'
      }),
    
    price: Joi.number()
      .min(0)
      .max(10000)
      .required()
      .messages({
        'number.min': 'מחיר לא יכול להיות שלילי',
        'number.max': 'מחיר לא יכול לעלות על 10,000 ש"ח',
        'any.required': 'מחיר הוא שדה חובה'
      }),
    
    passengers: Joi.number()
      .integer()
      .min(1)
      .max(8)
      .default(1)
      .messages({
        'number.min': 'מספר נוסעים חייב להיות לפחות 1',
        'number.max': 'מספר נוסעים לא יכול לעלות על 8'
      }),
    
    notes: Joi.string()
      .max(1000)
      .allow('', null)
      .trim()
      .messages({
        'string.max': 'הערות לא יכולות להכיל יותר מ-1000 תווים'
      }),
    
    scheduledFor: Joi.date()
      .min('now')
      .allow(null)
      .messages({
        'date.min': 'תאריך הזמנה חייב להיות בעתיד'
      })
  }),
  
  // Update ride
  update: Joi.object({
    status: Joi.string()
      .valid('pending', 'accepted', 'in_progress', 'completed', 'cancelled')
      .messages({
        'any.only': 'סטטוס לא תקין'
      }),
    
    driverId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .allow(null)
      .messages({
        'string.pattern.base': 'מזהה נהג לא תקין'
      }),
    
    price: Joi.number().min(0).max(10000),
    notes: Joi.string().max(1000).allow('', null).trim(),
    completedAt: Joi.date().allow(null),
    cancelledReason: Joi.string().max(500).allow('', null).trim()
  }).min(1) // At least one field must be provided
};

// ===============================================
// 👨‍✈️ DRIVER SCHEMAS
// ===============================================

export const driverSchemas = {
  // Create/Register driver
  create: Joi.object({
    name: Joi.string()
      .min(2)
      .max(100)
      .trim()
      .required()
      .messages({
        'string.min': 'שם נהג חייב להכיל לפחות 2 תווים',
        'any.required': 'שם נהג הוא שדה חובה'
      }),
    
    phone: israeliPhone.required(),
    
    idNumber: israeliId.optional(),
    
    licenseNumber: Joi.string()
      .min(5)
      .max(20)
      .trim()
      .optional()
      .messages({
        'string.min': 'מספר רישיון חייב להכיל לפחות 5 תווים'
      }),
    
    vehicleNumber: Joi.string()
      .min(6)
      .max(10)
      .pattern(/^\d{2,3}-\d{2,3}-\d{2,3}$/)
      .trim()
      .optional()
      .messages({
        'string.pattern.base': 'מספר רכב חייב להיות בפורמט XX-XXX-XX'
      }),
    
    vehicleType: Joi.string()
      .valid('sedan', 'minivan', 'suv', 'luxury', 'van')
      .default('sedan'),
    
    workArea: Joi.string()
      .max(200)
      .trim()
      .allow('', null),
    
    city: Joi.string()
      .max(100)
      .trim()
      .allow('', null),
    
    email: Joi.string()
      .email()
      .allow('', null)
      .messages({
        'string.email': 'כתובת אימייל לא תקינה'
      }),
    
    notes: Joi.string()
      .max(1000)
      .allow('', null)
      .trim()
  }),
  
  // Update driver
  update: Joi.object({
    name: Joi.string().min(2).max(100).trim(),
    phone: israeliPhone,
    idNumber: israeliId,
    licenseNumber: Joi.string().min(5).max(20).trim(),
    vehicleNumber: Joi.string().min(6).max(10).trim(),
    vehicleType: Joi.string().valid('sedan', 'minivan', 'suv', 'luxury', 'van'),
    workArea: Joi.string().max(200).trim().allow('', null),
    city: Joi.string().max(100).trim().allow('', null),
    isActive: Joi.boolean(),
    notes: Joi.string().max(1000).allow('', null).trim()
  }).min(1),
  
  // Block driver
  block: Joi.object({
    reason: Joi.string()
      .min(5)
      .max(500)
      .trim()
      .required()
      .messages({
        'string.min': 'סיבת חסימה חייבת להכיל לפחות 5 תווים',
        'any.required': 'סיבת חסימה היא שדה חובה'
      })
  })
};

// ===============================================
// 🔐 AUTHENTICATION SCHEMAS
// ===============================================

export const authSchemas = {
  // Login
  login: Joi.object({
    password: Joi.string()
      .min(8)
      .required()
      .messages({
        'string.min': 'סיסמה חייבת להכיל לפחות 8 תווים',
        'any.required': 'סיסמה היא שדה חובה'
      }),
    
    twoFactorToken: Joi.string()
      .length(6)
      .pattern(/^\d{6}$/)
      .optional()
      .messages({
        'string.length': 'קוד אימות חייב להכיל 6 ספרות',
        'string.pattern.base': 'קוד אימות חייב להכיל רק ספרות'
      })
  }),
  
  // Refresh token
  refresh: Joi.object({
    refreshToken: Joi.string()
      .required()
      .messages({
        'any.required': 'Refresh token הוא שדה חובה'
      })
  }),
  
  // Change password
  changePassword: Joi.object({
    oldPassword: Joi.string()
      .min(8)
      .required()
      .messages({
        'any.required': 'סיסמה ישנה היא שדה חובה'
      }),
    
    newPassword: Joi.string()
      .min(8)
      .max(128)
      .required()
      .invalid(Joi.ref('oldPassword'))
      .messages({
        'string.min': 'סיסמה חדשה חייבת להכיל לפחות 8 תווים',
        'any.invalid': 'סיסמה חדשה חייבת להיות שונה מהישנה',
        'any.required': 'סיסמה חדשה היא שדה חובה'
      })
  })
};

// ===============================================
// 💰 PAYMENT SCHEMAS
// ===============================================

export const paymentSchemas = {
  // Create payment
  create: Joi.object({
    amount: Joi.number()
      .min(0)
      .max(100000)
      .required()
      .messages({
        'number.min': 'סכום לא יכול להיות שלילי',
        'number.max': 'סכום לא יכול לעלות על 100,000 ש"ח',
        'any.required': 'סכום הוא שדה חובה'
      }),
    
    method: Joi.string()
      .valid('cash', 'credit', 'bit', 'paypal', 'bank_transfer')
      .required()
      .messages({
        'any.only': 'אמצעי תשלום לא תקין',
        'any.required': 'אמצעי תשלום הוא שדה חובה'
      }),
    
    driverId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        'string.pattern.base': 'מזהה נהג לא תקין',
        'any.required': 'מזהה נהג הוא שדה חובה'
      }),
    
    rideId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .allow(null)
      .messages({
        'string.pattern.base': 'מזהה נסיעה לא תקין'
      }),
    
    notes: Joi.string()
      .max(500)
      .allow('', null)
      .trim()
  })
};

// ===============================================
// 📱 WHATSAPP GROUP SCHEMAS
// ===============================================

export const groupSchemas = {
  // Create group
  create: Joi.object({
    name: Joi.string()
      .min(2)
      .max(100)
      .trim()
      .required()
      .messages({
        'string.min': 'שם קבוצה חייב להכיל לפחות 2 תווים',
        'any.required': 'שם קבוצה הוא שדה חובה'
      }),
    
    whatsappGroupId: Joi.string()
      .pattern(/^\d+@g\.us$/)
      .required()
      .messages({
        'string.pattern.base': 'מזהה קבוצת WhatsApp לא תקין',
        'any.required': 'מזהה קבוצה הוא שדה חובה'
      }),
    
    description: Joi.string()
      .max(500)
      .allow('', null)
      .trim()
  }),
  
  // Add member
  addMember: Joi.object({
    driverId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        'string.pattern.base': 'מזהה נהג לא תקין',
        'any.required': 'מזהה נהג הוא שדה חובה'
      })
  })
};

// ===============================================
// 📊 QUERY VALIDATION
// ===============================================

export const querySchemas = {
  // Pagination
  pagination: Joi.object({
    page: Joi.number()
      .integer()
      .min(1)
      .default(1)
      .messages({
        'number.min': 'מספר עמוד חייב להיות לפחות 1'
      }),
    
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(20)
      .messages({
        'number.min': 'מספר תוצאות חייב להיות לפחות 1',
        'number.max': 'מספר תוצאות לא יכול לעלות על 100'
      }),
    
    sortBy: Joi.string()
      .valid('createdAt', 'updatedAt', 'name', 'price', 'rating')
      .default('createdAt'),
    
    sortOrder: Joi.string()
      .valid('asc', 'desc')
      .default('desc')
  }),
  
  // Date range
  dateRange: Joi.object({
    startDate: Joi.date()
      .iso()
      .optional()
      .messages({
        'date.format': 'תאריך התחלה חייב להיות בפורמט ISO'
      }),
    
    endDate: Joi.date()
      .iso()
      .min(Joi.ref('startDate'))
      .optional()
      .messages({
        'date.min': 'תאריך סיום חייב להיות אחרי תאריך התחלה'
      })
  }),
  
  // Search
  search: Joi.object({
    q: Joi.string()
      .min(1)
      .max(200)
      .trim()
      .optional()
      .messages({
        'string.min': 'חיפוש חייב להכיל לפחות תו אחד'
      })
  })
};

// ===============================================
// 🛡️ VALIDATION MIDDLEWARE
// ===============================================

/**
 * Create validation middleware for request body
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      errors: {
        wrap: {
          label: ''
        }
      }
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));
      
      return res.status(400).json({
        ok: false,
        error: 'Invalid input',
        message: 'הקלט שהוזן אינו תקין',
        details: errors
      });
    }
    
    req.validatedBody = value;
    next();
  };
}

/**
 * Create validation middleware for query parameters
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      errors: {
        wrap: {
          label: ''
        }
      }
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));
      
      return res.status(400).json({
        ok: false,
        error: 'Invalid query parameters',
        message: 'פרמטרי החיפוש אינם תקינים',
        details: errors
      });
    }
    
    req.validatedQuery = value;
    next();
  };
}

/**
 * Create validation middleware for URL parameters
 */
export function validateParams(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));
      
      return res.status(400).json({
        ok: false,
        error: 'Invalid URL parameters',
        message: 'פרמטרי ה-URL אינם תקינים',
        details: errors
      });
    }
    
    req.validatedParams = value;
    next();
  };
}

console.log('✅ Validation schemas and middleware loaded');

export default {
  rideSchemas,
  driverSchemas,
  authSchemas,
  paymentSchemas,
  groupSchemas,
  querySchemas,
  validateBody,
  validateQuery,
  validateParams
};
