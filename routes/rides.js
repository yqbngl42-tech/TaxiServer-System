// ============================================================
// RIDES ROUTES - ULTIMATE ENHANCED VERSION
// Merged from routes/rides.js + v2/rides.js + v2/rides-enhanced.js
// ============================================================

import express from 'express';
import { authenticateToken } from '../middlewares/auth.js';
import { requirePermission } from '../middlewares/rbac.js';
import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import AuditLog from '../models/AuditLog.js';
import logger from '../utils/logger.js';

// Utils (if available)
// import { rideNumberGenerator } from '../utils/rideNumberGenerator.js';
// import { generateUniqueRideLink } from '../utils/linkGenerator.js';
// import { dispatchManager } from '../services/dispatchManager.js';
// import { websockets } from '../services/websockets.js';

const router = express.Router();

// ============================================================
// ERROR MESSAGES
// ============================================================

const ERRORS = {
  RIDE: {
    NOT_FOUND: 'נסיעה לא נמצאה',
    MISSING_FIELDS: 'חסרים שדות חובה',
    ALREADY_LOCKED: 'נסיעה כבר נעולה',
    NOT_LOCKED: 'נסיעה לא נעולה',
    CANNOT_DELETE_ACTIVE: 'לא ניתן למחוק נסיעה פעילה',
    INVALID_STATUS: 'סטטוס לא תקין',
    ALREADY_CANCELLED: 'נסיעה כבר בוטלה',
    CANNOT_CANCEL: 'לא ניתן לבטל נסיעה בסטטוס זה',
    ALREADY_ASSIGNED: 'נסיעה כבר הוקצתה לנהג',
    NOT_ASSIGNED: 'נסיעה לא הוקצתה לנהג'
  },
  VALIDATION: {
    PHONE: 'מספר טלפון לא תקין',
    NAME: 'שם חייב להכיל לפחות 2 תווים',
    PRICE: 'מחיר חייב להיות חיובי',
    RATING: 'דירוג חייב להיות בין 1 ל-5',
    INVALID_STATUS: 'סטטוס לא תקין'
  },
  SERVER: {
    DATABASE: 'שגיאת בסיס נתונים',
    UNKNOWN: 'שגיאה לא צפויה'
  }
};

// ============================================================
// VALID STATUSES
// ============================================================

// ============================================================
// STATE MACHINE - STRICT TRANSITIONS
// ============================================================

const VALID_STATUSES = [
  'created',
  'distributed',  // הופץ לנהגים
  'sent',         // נשלח בפועל
  'locked',       // נעול על ידי נהג
  'approved',     // אושר
  'enroute',      // בדרך
  'arrived',      // הגיע
  'completed',    // הושלם (סטטוס יחיד!)
  'cancelled'     // בוטל
];

const ACTIVE_STATUSES = ['locked', 'approved', 'enroute', 'arrived'];
const FINAL_STATUSES = ['completed', 'cancelled'];

// ✅ CRITICAL FIX: Strict state transition map
const STATE_TRANSITIONS = {
  created: ['distributed', 'sent', 'cancelled', 'locked'],
  distributed: ['sent', 'locked', 'cancelled'],
  sent: ['locked', 'cancelled'],
  locked: ['approved', 'cancelled', 'created'], // can unlock back to created
  approved: ['enroute', 'cancelled'],
  enroute: ['arrived', 'cancelled'],
  arrived: ['completed', 'cancelled'],
  completed: [], // terminal state
  cancelled: []  // terminal state
};

// ✅ CRITICAL FIX: Actor-based permissions
const ACTOR_PERMISSIONS = {
  system: ['*'], // can do anything
  admin: ['*'],  // can do anything
  bot: ['locked', 'approved'], // can only lock or approve
  driver: ['enroute', 'arrived', 'completed'], // can only update progress
  client: ['created'] // can only create
};

/**
 * ✅ CRITICAL FIX: Validate status transition with actor permissions
 */
function canTransition(currentStatus, newStatus, actorRole = 'system') {
  // Terminal states cannot transition
  if (FINAL_STATUSES.includes(currentStatus)) {
    return false;
  }
  
  // Check if transition is allowed in state machine
  const allowedTransitions = STATE_TRANSITIONS[currentStatus] || [];
  if (!allowedTransitions.includes(newStatus)) {
    return false;
  }
  
  // Check actor permissions
  const actorAllowed = ACTOR_PERMISSIONS[actorRole] || [];
  if (actorAllowed.includes('*')) {
    return true; // admin/system can do anything
  }
  
  // Check if actor can transition TO this status
  return actorAllowed.includes(newStatus);
}

/**
 * Validate status transition (legacy - use canTransition instead)
 * @deprecated Use canTransition with actorRole
 */
function isValidStatusTransition(currentStatus, newStatus) {
  return canTransition(currentStatus, newStatus, 'system');
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Generate ride number
 */
function generateRideNumber() {
  // Fallback if rideNumberGenerator not available
  return `R${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
}

/**
 * Add history entry
 */
function addHistoryEntry(ride, action, by, details = {}) {
  if (!Array.isArray(ride.history)) {
    ride.history = [];
  }
  ride.history.push({
    action,
    status: ride.status,
    by,
    timestamp: new Date(),
    details
  });
}

/**
 * Add timeline entry
 */
function addTimelineEntry(ride, event, details = {}) {
  if (!Array.isArray(ride.timeline)) {
    ride.timeline = [];
  }
  ride.timeline.push({
    event,
    timestamp: new Date(),
    details
  });
}

// ============================================================
// PUBLIC CLIENT API (no auth)
// ============================================================

// ===============================================
// POST /api/client/rides - יצירת נסיעה מלקוח
// ===============================================
router.post("/api/client/rides", async (req, res) => {
  try {
    const { 
      customerName, 
      customerPhone, 
      pickup, 
      destination, 
      scheduledTime, 
      notes
    } = req.body;

    // Validation
    if (!customerName || !customerPhone || !pickup || !destination) {
      return res.status(400).json({ 
        ok: false, 
        error: "שדות חובה: שם, טלפון, איסוף, יעד" 
      });
    }

    const phoneRegex = /^(0|\+972)?5\d{8}$/;
    if (!phoneRegex.test(customerPhone.replace(/[\s\-]/g, ''))) {
      return res.status(400).json({ 
        ok: false, 
        error: ERRORS.VALIDATION.PHONE 
      });
    }

    if (customerName.trim().length < 2) {
      return res.status(400).json({ 
        ok: false, 
        error: ERRORS.VALIDATION.NAME 
      });
    }

    // Generate ride number
    const rideNumber = generateRideNumber();
    
    // Default price
    const defaultPrice = 50;
    const commissionRate = 0.10;

    // Create ride
    const ride = await Ride.create({
      rideNumber,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickup: pickup.trim(),
      destination: destination.trim(),
      scheduledTime: scheduledTime || null,
      notes: notes || null,
      price: defaultPrice,
      commissionRate,
      commissionAmount: Math.round(defaultPrice * commissionRate),
      status: "created",
      rideType: "regular",
      groupChat: "default",
      createdBy: "client"
    });

    // Add history
    addHistoryEntry(ride, 'created', 'client_website', { source: 'web' });
    addTimelineEntry(ride, 'created', { source: 'client_website' });

    await ride.save();

    logger.success("Ride created from client", {
      requestId: req.id || null,
      rideId: ride._id,
      rideNumber: ride.rideNumber
    });

    // TODO: Dispatch ride if dispatchManager available
    // if (typeof dispatchManager !== 'undefined') {
    //   dispatchManager.sendRide(ride).catch(err => logger.error('Dispatch error:', err));
    // }

    // TODO: WebSocket update if available
    // if (typeof websockets !== 'undefined') {
    //   websockets.emitNewRide(ride);
    // }

    res.json({ 
      ok: true, 
      ride: {
        _id: ride._id,
        rideNumber: ride.rideNumber,
        status: ride.status,
        customerName: ride.customerName,
        pickup: ride.pickup,
        destination: ride.destination
      },
      message: `נסיעה ${ride.rideNumber} נוצרה בהצלחה`
    });
  } catch (err) {
    logger.error("Error creating ride from client", { 
      requestId: req.id || null,
      error: err.message 
    });
    res.status(500).json({ 
      ok: false, 
      error: ERRORS.SERVER.UNKNOWN 
    });
  }
});

// ============================================================
// AUTHENTICATED CRUD OPERATIONS
// ============================================================

// ===============================================
// GET /api/rides - רשימת נסיעות + pagination + search
// ===============================================
router.get("/", authenticateToken, requirePermission('rides:read'), async (req, res) => {
  try {
    // Pagination
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;
    
    // Filters
    const filter = {};
    
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    if (req.query.driverPhone) {
      filter.driverPhone = req.query.driverPhone;
    }
    
    if (req.query.driverId) {
      filter.driverId = req.query.driverId;
    }
    
    // Search
    if (req.query.q) {
      filter.$or = [
        { rideNumber: { $regex: req.query.q, $options: 'i' } },
        { customerName: { $regex: req.query.q, $options: 'i' } },
        { customerPhone: { $regex: req.query.q, $options: 'i' } }
      ];
    }
    
    // Date range
    if (req.query.fromDate || req.query.toDate) {
      filter.createdAt = {};
      if (req.query.fromDate) {
        filter.createdAt.$gte = new Date(req.query.fromDate);
      }
      if (req.query.toDate) {
        filter.createdAt.$lte = new Date(req.query.toDate);
      }
    }
    
    // Query with pagination
    const [rides, total] = await Promise.all([
      Ride.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .select('rideNumber customerName customerPhone pickup destination status price driverPhone driverId createdAt')
        .lean(),
      Ride.countDocuments(filter)
    ]);
    
    logger.info("Rides fetched", { 
      requestId: req.id || null,
      page, 
      limit, 
      total, 
      resultsCount: rides.length,
      filters: Object.keys(filter)
    });
    
    res.json({
      ok: true,
      rides,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    logger.error("Error fetching rides", { 
      requestId: req.id || null,
      error: err.message 
    });
    res.status(500).json({ 
      ok: false, 
      error: ERRORS.SERVER.DATABASE 
    });
  }
});

// ===============================================
// POST /api/rides - יצירת נסיעה מממשק ניהול
// ===============================================
router.post("/", authenticateToken, requirePermission('rides:create'), async (req, res) => {
  try {
    const { 
      customerName, 
      customerPhone, 
      pickup, 
      destination, 
      scheduledTime, 
      notes, 
      price, 
      commissionRate, 
      sendTo,
      sendToGroup,
      rideType = "regular",
      specialNotes = [],
      groupChat = "default"
    } = req.body;

    // Validation
    if (!customerName || !customerPhone || !pickup || !destination || price === undefined) {
      return res.status(400).json({ 
        ok: false, 
        error: ERRORS.RIDE.MISSING_FIELDS
      });
    }

    const phoneRegex = /^(0|\+972)?5\d{8}$/;
    if (!phoneRegex.test(customerPhone.replace(/[\s\-]/g, ''))) {
      return res.status(400).json({ 
        ok: false, 
        error: ERRORS.VALIDATION.PHONE 
      });
    }

    if (customerName.trim().length < 2) {
      return res.status(400).json({ 
        ok: false, 
        error: ERRORS.VALIDATION.NAME 
      });
    }

    if (price < 0) {
      return res.status(400).json({ 
        ok: false, 
        error: ERRORS.VALIDATION.PRICE 
      });
    }

    const commission = Math.round((price || 0) * (commissionRate || 0.10));
    const rideNumber = generateRideNumber();
    
    const ride = await Ride.create({
      rideNumber,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickup: pickup.trim(),
      destination: destination.trim(),
      scheduledTime: scheduledTime || null,
      notes: notes || null,
      price: price,
      commissionRate: commissionRate || 0.10,
      commissionAmount: commission,
      status: "created",
      rideType,
      specialNotes,
      groupChat,
      createdBy: "admin"
    });

    // Add history
    addHistoryEntry(ride, 'created', req.user.username || req.user.user, {
      source: 'admin_panel'
    });
    addTimelineEntry(ride, 'created', {
      by: req.user.username || req.user.user
    });

    await ride.save();

    // Audit log
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'ride_created',
      details: { rideId: ride._id, rideNumber }
    }).catch(err => logger.error('AuditLog error:', err));

    logger.success("Ride created by admin", {
      requestId: req.id || null,
      rideId: ride._id,
      rideNumber: ride.rideNumber,
      createdBy: req.user.username || req.user.user
    });

    // ============================================================
    // 🚀 DISPATCH TO DRIVERS VIA WHATSAPP GROUPS
    // ============================================================
    let phonesToSend = [];
    let successCount = 0;
    
    try {
      if (sendTo === 'specific' && sendToGroup) {
        // Send to specific group
        const WhatsAppGroup = (await import('../models/WhatsAppGroup.js').catch(() => null))?.default;
        if (WhatsAppGroup) {
          const group = await WhatsAppGroup.findById(sendToGroup);
          if (group?.isActive && group.phoneNumbers?.length > 0) {
            phonesToSend = group.phoneNumbers;
          }
        }
      } else {
        // Send to default group or all active drivers
        const WhatsAppGroup = (await import('../models/WhatsAppGroup.js').catch(() => null))?.default;
        if (WhatsAppGroup) {
          const defaultGroup = await WhatsAppGroup.findOne({ isDefault: true, isActive: true });
          if (defaultGroup?.phoneNumbers?.length > 0) {
            phonesToSend = defaultGroup.phoneNumbers;
          }
        }
        
        // Fallback: send to all active drivers
        if (phonesToSend.length === 0) {
          const drivers = await Driver.find({ isActive: true, isBlocked: { $ne: true } }, 'phone');
          phonesToSend = drivers.map(d => d.phone).filter(Boolean);
        }
      }

      // Send messages if we have phones
      if (phonesToSend.length > 0) {
        // Try to use dispatchManager if available
        if (typeof dispatchManager !== 'undefined') {
          const result = await dispatchManager.sendRide(ride);
          successCount = result.successCount || phonesToSend.length;
        } else {
          // Fallback: manual dispatch (requires WhatsApp service)
          const { sendBulkMessagesWithRateLimit, createGroupMessage } = await import('../services/whatsapp.js').catch(() => ({}));
          if (sendBulkMessagesWithRateLimit && createGroupMessage) {
            const message = createGroupMessage(ride);
            const results = await sendBulkMessagesWithRateLimit(phonesToSend, message);
            successCount = results.success?.length || 0;
          }
        }
        
        if (successCount > 0) {
          ride.status = "sent";
          addHistoryEntry(ride, 'sent', 'system', {
            sentTo: successCount,
            totalDrivers: phonesToSend.length
          });
          await ride.save();
          
          logger.success('Ride dispatched to drivers', {
            rideNumber: ride.rideNumber,
            successCount,
            totalDrivers: phonesToSend.length
          });
        }
      }
    } catch (dispatchError) {
      logger.error('Error dispatching ride', {
        rideNumber: ride.rideNumber,
        error: dispatchError.message
      });
      // Don't fail the request - ride is still created
    }

    res.json({ 
      ok: true, 
      ride,
      sentCount: successCount
    });
  } catch (err) {
    logger.error("Error creating ride", { 
      requestId: req.id || null,
      error: err.message 
    });
    res.status(500).json({ 
      ok: false, 
      error: ERRORS.SERVER.UNKNOWN 
    });
  }
});

// ===============================================
// GET /api/rides/:id - פרטי נסיעה
// ===============================================
router.get("/:id", authenticateToken, requirePermission('rides:read'), async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.RIDE.NOT_FOUND
      });
    }
    
    logger.info("Ride fetched", {
      requestId: req.id || null,
      rideId: ride._id
    });
    
    res.json({ ok: true, ride });
  } catch (err) {
    logger.error("Error fetching ride", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});

// ===============================================
// GET /api/rides/number/:rideNumber - חיפוש לפי מספר
// ===============================================
router.get("/number/:rideNumber", async (req, res) => {
  try {
    const { rideNumber } = req.params;
    
    const ride = await Ride.findOne({ rideNumber });
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.RIDE.NOT_FOUND
      });
    }
    
    logger.info("Ride found by number", {
      requestId: req.id || null,
      rideNumber
    });
    
    res.json({ ok: true, ride });
  } catch (err) {
    logger.error("Error finding ride by number", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});

// ===============================================
// DELETE /api/rides/:id - מחיקת נסיעה
// ===============================================
router.delete("/:id", authenticateToken, requirePermission('rides:delete'), async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.RIDE.NOT_FOUND
      });
    }
    
    // ✅ FIX: Can't delete active rides
    if (ACTIVE_STATUSES.includes(ride.status)) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.RIDE.CANNOT_DELETE_ACTIVE
      });
    }
    
    await Ride.findByIdAndDelete(req.params.id);
    
    // Audit log
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'ride_deleted',
      details: { 
        rideId: req.params.id,
        rideNumber: ride.rideNumber,
        status: ride.status
      }
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success("Ride deleted", {
      requestId: req.id || null,
      rideId: req.params.id,
      rideNumber: ride.rideNumber
    });
    
    res.json({
      ok: true,
      message: "נסיעה נמחקה בהצלחה"
    });
  } catch (err) {
    logger.error("Error deleting ride", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// STATUS MANAGEMENT
// ============================================================

// ===============================================
// PUT /api/rides/:id/status - עדכון סטטוס (עם actor validation)
// ===============================================
router.put("/:id/status", authenticateToken, requirePermission('rides:update'), async (req, res) => {
  try {
    const { status, notes, actorRole = 'admin' } = req.body;
    
    if (!status) {
      return res.status(400).json({
        ok: false,
        error: 'סטטוס חובה'
      });
    }
    
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.VALIDATION.INVALID_STATUS
      });
    }
    
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.RIDE.NOT_FOUND
      });
    }
    
    // ✅ CRITICAL FIX: Validate with actor permissions
    if (!canTransition(ride.status, status, actorRole)) {
      return res.status(403).json({
        ok: false,
        error: `${actorRole} לא יכול לעבור מסטטוס ${ride.status} ל-${status}`,
        details: {
          currentStatus: ride.status,
          requestedStatus: status,
          actorRole,
          allowedStatuses: STATE_TRANSITIONS[ride.status] || []
        }
      });
    }
    
    const oldStatus = ride.status;
    ride.status = status;
    ride.updatedAt = new Date();
    
    // Add history
    addHistoryEntry(ride, 'status_changed', req.user.username || req.user.user, {
      oldStatus,
      newStatus: status,
      notes,
      actorRole
    });
    
    addTimelineEntry(ride, 'status_changed', {
      from: oldStatus,
      to: status,
      by: req.user.username || req.user.user
    });
    
    await ride.save();
    
    // Audit log
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'ride_status_changed',
      details: { 
        rideId: ride._id,
        rideNumber: ride.rideNumber,
        oldStatus,
        newStatus: status,
        actorRole
      }
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success("Ride status updated", {
      requestId: req.id || null,
      rideId: ride._id,
      oldStatus,
      newStatus: status,
      actorRole
    });
    
    // WebSocket update
    try {
      if (typeof websockets !== 'undefined') {
        websockets.emitRideUpdate(ride._id, {
          event: 'status_changed',
          oldStatus,
          newStatus: status
        });
      }
    } catch (err) {
      logger.error('WebSocket error:', err);
    }
    
    res.json({ ok: true, ride });
  } catch (err) {
    logger.error("Error updating ride status", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// POST /api/rides/:id/cancel - ביטול נסיעה
// ===============================================
router.post("/:id/cancel", authenticateToken, requirePermission('rides:cancel'), async (req, res) => {
  try {
    const { reason } = req.body;
    
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.RIDE.NOT_FOUND
      });
    }
    
    // ✅ FIX: State guard - can't cancel already cancelled
    if (ride.status === 'cancelled') {
      return res.status(400).json({
        ok: false,
        error: ERRORS.RIDE.ALREADY_CANCELLED
      });
    }
    
    // ✅ FIX: Can't cancel completed rides
    if (ride.status === 'completed') {
      return res.status(400).json({
        ok: false,
        error: ERRORS.RIDE.CANNOT_CANCEL
      });
    }
    
    const oldStatus = ride.status;
    ride.status = 'cancelled';
    ride.cancelledAt = new Date();
    ride.cancelReason = reason || 'לא צוין';
    ride.cancelledBy = req.user.username || req.user.user;
    ride.updatedAt = new Date();
    
    // Add history
    addHistoryEntry(ride, 'cancelled', req.user.username || req.user.user, {
      oldStatus,
      reason: reason || 'לא צוין'
    });
    
    addTimelineEntry(ride, 'cancelled', {
      by: req.user.username || req.user.user,
      reason: reason || 'לא צוין'
    });
    
    await ride.save();
    
    // Audit log
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'ride_cancelled',
      details: { 
        rideId: ride._id,
        rideNumber: ride.rideNumber,
        reason: reason || 'לא צוין'
      }
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success("Ride cancelled", {
      requestId: req.id || null,
      rideId: ride._id,
      rideNumber: ride.rideNumber,
      reason
    });
    
    res.json({ 
      ok: true, 
      ride,
      message: "נסיעה בוטלה בהצלחה"
    });
  } catch (err) {
    logger.error("Error cancelling ride", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// LOCK / UNLOCK
// ============================================================

// ===============================================
// POST /api/rides/:id/lock - נעילת נסיעה
// ===============================================
router.post("/:id/lock", authenticateToken, requirePermission('rides:update'), async (req, res) => {
  try {
    const { reason } = req.body;
    
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.RIDE.NOT_FOUND
      });
    }
    
    // ✅ FIX: State guard - can't lock already locked
    if (ride.status === 'locked') {
      return res.status(400).json({
        ok: false,
        error: ERRORS.RIDE.ALREADY_LOCKED
      });
    }
    
    const oldStatus = ride.status;
    ride.status = 'locked';
    ride.lockedAt = new Date();
    ride.lockedBy = req.user.username || req.user.user;
    ride.lockReason = reason || 'לא צוין';
    ride.updatedAt = new Date();
    
    // Add history
    addHistoryEntry(ride, 'locked', req.user.username || req.user.user, {
      oldStatus,
      reason: reason || 'לא צוין'
    });
    
    addTimelineEntry(ride, 'locked', {
      by: req.user.username || req.user.user,
      reason: reason || 'לא צוין'
    });
    
    await ride.save();
    
    // Audit log
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'ride_locked',
      details: { 
        rideId: ride._id,
        rideNumber: ride.rideNumber,
        reason: reason || 'לא צוין'
      }
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success("Ride locked", {
      requestId: req.id || null,
      rideId: ride._id,
      rideNumber: ride.rideNumber
    });
    
    res.json({ ok: true, ride });
  } catch (err) {
    logger.error("Error locking ride", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// POST /api/rides/:id/unlock - ביטול נעילה
// ===============================================
router.post("/:id/unlock", authenticateToken, requirePermission('rides:update'), async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.RIDE.NOT_FOUND
      });
    }
    
    // ✅ FIX: State guard - can't unlock non-locked
    if (ride.status !== 'locked') {
      return res.status(400).json({
        ok: false,
        error: ERRORS.RIDE.NOT_LOCKED
      });
    }
    
    ride.status = 'created';
    ride.lockedAt = null;
    ride.lockedBy = null;
    ride.lockReason = null;
    ride.updatedAt = new Date();
    
    // Add history
    addHistoryEntry(ride, 'unlocked', req.user.username || req.user.user, {});
    addTimelineEntry(ride, 'unlocked', {
      by: req.user.username || req.user.user
    });
    
    await ride.save();
    
    // Audit log
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'ride_unlocked',
      details: { 
        rideId: ride._id,
        rideNumber: ride.rideNumber
      }
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success("Ride unlocked", {
      requestId: req.id || null,
      rideId: ride._id,
      rideNumber: ride.rideNumber
    });
    
    res.json({ ok: true, ride });
  } catch (err) {
    logger.error("Error unlocking ride", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// DRIVER ASSIGNMENT
// ============================================================

// ===============================================
// POST /api/rides/:id/assign - הקצאה לנהג (אטומי!)
// ===============================================
router.post("/:id/assign", authenticateToken, requirePermission('rides:update'), async (req, res) => {
  try {
    const { driverPhone, driverId, driverName } = req.body;
    
    if (!driverPhone && !driverId) {
      return res.status(400).json({
        ok: false,
        error: 'נדרש מספר טלפון או ID של נהג'
      });
    }
    
    let driver;
    let actualDriverPhone, actualDriverId, actualDriverName;
    
    // Verify/create driver FIRST (before atomic update)
    if (driverId) {
      // Admin flow - verify driver exists
      driver = await Driver.findById(driverId);
      if (!driver) {
        return res.status(404).json({
          ok: false,
          error: 'נהג לא נמצא'
        });
      }
      
      if (driver.isBlocked) {
        return res.status(400).json({
          ok: false,
          error: 'נהג חסום'
        });
      }
      
      actualDriverPhone = driver.phone;
      actualDriverId = driverId;
      actualDriverName = driver.name;
      
    } else {
      // ✅ WhatsApp flow - verify or auto-create driver
      
      // ✅ SECURITY FIX: Rate limit check (basic - should use Redis in production)
      const recentDrivers = await Driver.countDocuments({
        phone: driverPhone,
        createdAt: { $gte: new Date(Date.now() - 60000) } // last minute
      });
      
      if (recentDrivers > 3) {
        return res.status(429).json({
          ok: false,
          error: 'יותר מדי נסיונות יצירת נהג. נסה שוב מאוחר יותר'
        });
      }
      
      driver = await Driver.findOne({ phone: driverPhone });
      
      if (!driver) {
        // ✅ SECURITY FIX: Phone validation before auto-create
        const phoneRegex = /^(0|\+972)?5\d{8}$/;
        if (!phoneRegex.test(driverPhone.replace(/[\s\-]/g, ''))) {
          return res.status(400).json({
            ok: false,
            error: 'מספר טלפון לא תקין'
          });
        }
        
        // Create new driver automatically
        driver = new Driver({
          name: driverName || 'נהג חדש',
          phone: driverPhone,
          vehicleNumber: 'לא צוין',
          vehicleType: 'sedan',
          isActive: true,
          isBlocked: false,
          totalRides: 0,
          source: 'whatsapp_auto', // ✅ SECURITY FIX: Mark source
          autoCreated: true,
          autoCreatedAt: new Date()
        });
        await driver.save();
        
        logger.info('New driver created automatically from assignment', {
          driverName: driver.name,
          driverPhone: driverPhone,
          source: 'whatsapp',
          requestId: req.id || null
        });
      }
      
      actualDriverPhone = driverPhone;
      actualDriverId = driver._id;
      actualDriverName = driver.name;
    }
    
    // ✅✅✅ CRITICAL FIX: ATOMIC UPDATE - prevents race condition!
    const ride = await Ride.findOneAndUpdate(
      {
        _id: req.params.id,
        // ✅ RACE CONDITION FIX: Only update if status allows assignment
        status: { $in: ['sent', 'created', 'distributed'] }
      },
      {
        $set: {
          status: 'approved',
          driverPhone: actualDriverPhone,
          driverId: actualDriverId,
          driverName: actualDriverName,
          assignedAt: new Date(),
          assignedBy: req.user?.username || req.user?.user || 'system',
          updatedAt: new Date()
        },
        $push: {
          history: {
            action: 'assigned',
            status: 'approved',
            by: req.user?.username || req.user?.user || 'system',
            timestamp: new Date(),
            details: {
              driverPhone: actualDriverPhone,
              driverId: actualDriverId,
              driverName: actualDriverName,
              source: driverId ? 'admin_panel' : 'whatsapp'
            }
          },
          timeline: {
            event: 'assigned',
            timestamp: new Date(),
            details: {
              driver: actualDriverName || actualDriverPhone,
              by: req.user?.username || req.user?.user || 'system'
            }
          }
        }
      },
      { new: true }
    );
    
    // ✅ RACE CONDITION CHECK: If ride is null, someone else took it!
    if (!ride) {
      return res.status(409).json({
        ok: false,
        error: 'נסיעה כבר נלקחה על ידי נהג אחר',
        code: 'ALREADY_ASSIGNED'
      });
    }
    
    // ✅ Update driver totalRides (not critical if fails)
    if (!driver.stats) driver.stats = {};
    driver.stats.totalRides = (driver.stats.totalRides || 0) + 1;
    await driver.save().catch(err => {
      logger.error('Failed to update driver stats', {
        driverId: driver._id,
        error: err.message
      });
    });
    
    // Log to Activity (for driver-facing audit)
    try {
      const Activity = (await import('../models/Activity.js').catch(() => null))?.default;
      if (Activity) {
        await Activity.create({
          type: 'ride',
          user: driver.phone,
          message: `נסיעה ${ride.rideNumber} שוייכה לנהג ${driver.name}`,
          details: JSON.stringify({ 
            rideId: ride._id, 
            driverPhone: driver.phone,
            source: driverId ? 'admin_panel' : 'whatsapp'
          }),
          emoji: '🚖'
        });
      }
    } catch (err) {
      logger.error('Activity error:', err);
    }
    
    // Audit log
    await AuditLog.create({
      userId: req.user?.userId || req.user?.user || 'system',
      username: req.user?.username || req.user?.user || 'system',
      action: 'ride_assigned',
      details: { 
        rideId: ride._id,
        rideNumber: ride.rideNumber,
        driverPhone: ride.driverPhone,
        driverId: ride.driverId,
        driverName: ride.driverName
      }
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success("Ride assigned to driver (atomic)", {
      requestId: req.id || null,
      rideId: ride._id,
      rideNumber: ride.rideNumber,
      driverPhone: ride.driverPhone,
      driverName: ride.driverName,
      totalRides: driver.totalRides
    });
    
    // ✅ WebSocket update
    try {
      if (typeof websockets !== 'undefined') {
        websockets.emitRideUpdate(ride._id, {
          event: 'assigned',
          status: 'approved',
          driverName: ride.driverName,
          driverPhone: ride.driverPhone
        });
      }
    } catch (err) {
      logger.error('WebSocket error:', err);
    }
    
    res.json({ 
      ok: true, 
      ride,
      message: 'נסיעה שוייכה בהצלחה'
    });
  } catch (err) {
    logger.error("Error assigning ride", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// POST /api/rides/:id/redispatch - שליחה מחדש
// ===============================================
router.post("/:id/redispatch", authenticateToken, requirePermission('rides:update'), async (req, res) => {
  try {
    const { reason } = req.body;
    
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.RIDE.NOT_FOUND
      });
    }
    
    // Clear driver assignment
    const oldDriverPhone = ride.driverPhone;
    ride.driverPhone = null;
    ride.driverId = null;
    ride.driverName = null;
    ride.status = 'created';
    ride.updatedAt = new Date();
    
    // Add history
    addHistoryEntry(ride, 'redispatched', req.user.username || req.user.user, {
      oldDriverPhone,
      reason: reason || 'לא צוין'
    });
    
    addTimelineEntry(ride, 'redispatched', {
      by: req.user.username || req.user.user,
      reason: reason || 'לא צוין'
    });
    
    await ride.save();
    
    // Audit log
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'ride_redispatched',
      details: { 
        rideId: ride._id,
        rideNumber: ride.rideNumber,
        oldDriverPhone,
        reason: reason || 'לא צוין'
      }
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success("Ride redispatched", {
      requestId: req.id || null,
      rideId: ride._id,
      rideNumber: ride.rideNumber
    });
    
    // TODO: Dispatch again
    // if (typeof dispatchManager !== 'undefined') {
    //   dispatchManager.sendRide(ride);
    // }
    
    res.json({ ok: true, ride });
  } catch (err) {
    logger.error("Error redispatching ride", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// RATING & FEEDBACK
// ============================================================

// ===============================================
// POST /api/rides/:id/rating - דירוג נסיעה
// ===============================================
router.post("/:id/rating", authenticateToken, requirePermission('rides:update'), async (req, res) => {
  try {
    const { rating, comment, ratedBy } = req.body;
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.VALIDATION.RATING
      });
    }
    
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.RIDE.NOT_FOUND
      });
    }
    
    // ✅ FIX: Only rate completed rides
    if (ride.status !== 'completed') {
      return res.status(400).json({
        ok: false,
        error: 'ניתן לדרג רק נסיעות שהושלמו'
      });
    }
    
    // ✅ FIX: Prevent duplicate rating
    if (ride.rating) {
      return res.status(400).json({
        ok: false,
        error: 'נסיעה זו כבר דורגה'
      });
    }
    
    ride.rating = {
      score: rating,
      comment: comment || null,
      ratedBy: ratedBy || req.user.username || req.user.user,
      ratedAt: new Date()
    };
    
    ride.updatedAt = new Date();
    
    // Add history
    addHistoryEntry(ride, 'rated', req.user.username || req.user.user, {
      rating,
      comment
    });
    
    await ride.save();
    
    logger.success("Ride rated", {
      requestId: req.id || null,
      rideId: ride._id,
      rideNumber: ride.rideNumber,
      rating
    });
    
    res.json({ ok: true, ride });
  } catch (err) {
    logger.error("Error rating ride", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// ADVANCED PRICING
// ============================================================

// ===============================================
// POST /api/rides/:id/pricing - חישוב מחיר מתקדם
// ===============================================
router.post("/:id/pricing", authenticateToken, requirePermission('rides:update'), async (req, res) => {
  try {
    const { basePrice, distancePrice, timePrice, surgeMultiplier, discount } = req.body;
    
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.RIDE.NOT_FOUND
      });
    }
    
    // Calculate pricing
    const totalBeforeDiscount = (
      (basePrice || 0) + 
      (distancePrice || 0) + 
      (timePrice || 0)
    ) * (surgeMultiplier || 1);
    
    const finalTotal = Math.max(0, totalBeforeDiscount - (discount || 0));
    const commissionAmount = Math.round(finalTotal * (ride.commissionRate || 0.10));
    
    ride.pricingDetails = {
      basePrice: basePrice || 0,
      distancePrice: distancePrice || 0,
      timePrice: timePrice || 0,
      surgeMultiplier: surgeMultiplier || 1,
      discount: discount || 0,
      totalBeforeDiscount,
      finalTotal,
      calculatedAt: new Date(),
      calculatedBy: req.user.username || req.user.user
    };
    
    ride.price = finalTotal;
    ride.commissionAmount = commissionAmount;
    ride.updatedAt = new Date();
    
    // Add history
    addHistoryEntry(ride, 'pricing_calculated', req.user.username || req.user.user, {
      oldPrice: ride.price,
      newPrice: finalTotal,
      pricingDetails: ride.pricingDetails
    });
    
    await ride.save();
    
    logger.success("Ride pricing calculated", {
      requestId: req.id || null,
      rideId: ride._id,
      rideNumber: ride.rideNumber,
      finalPrice: finalTotal
    });
    
    res.json({ ok: true, pricingDetails: ride.pricingDetails, ride });
  } catch (err) {
    logger.error("Error calculating pricing", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// RECURRING RIDES
// ============================================================

// ===============================================
// POST /api/rides/recurring - יצירת נסיעה חוזרת
// ===============================================
router.post("/recurring", authenticateToken, requirePermission('rides:create'), async (req, res) => {
  try {
    const { 
      customerName, 
      customerPhone, 
      pickup, 
      destination, 
      price, 
      frequency,  // 'daily', 'weekly', 'monthly'
      time,       // HH:MM
      endDate,
      notes
    } = req.body;
    
    // Validation
    if (!customerName || !customerPhone || !pickup || !destination || !price) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.RIDE.MISSING_FIELDS
      });
    }
    
    if (!frequency || !['daily', 'weekly', 'monthly'].includes(frequency)) {
      return res.status(400).json({
        ok: false,
        error: 'תדירות לא תקינה (daily/weekly/monthly)'
      });
    }
    
    const rideNumber = `RR${Date.now()}`;
    
    const ride = await Ride.create({
      rideNumber,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickup: pickup.trim(),
      destination: destination.trim(),
      price,
      notes,
      status: 'created',
      rideType: 'recurring',
      recurring: {
        enabled: true,
        frequency,
        time: time || '08:00',
        endDate: endDate ? new Date(endDate) : null,
        nextOccurrence: new Date(),
        createdBy: req.user.username || req.user.user
      }
    });
    
    // Add history
    addHistoryEntry(ride, 'created_recurring', req.user.username || req.user.user, {
      frequency,
      time,
      endDate
    });
    
    await ride.save();
    
    // Audit log
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'recurring_ride_created',
      details: { 
        rideId: ride._id,
        rideNumber,
        frequency
      }
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success("Recurring ride created", {
      requestId: req.id || null,
      rideId: ride._id,
      rideNumber,
      frequency
    });
    
    res.json({ ok: true, ride });
  } catch (err) {
    logger.error("Error creating recurring ride", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// ISSUES & PROBLEMS
// ============================================================

// ===============================================
// POST /api/rides/:id/issues - דיווח על בעיה
// ===============================================
router.post("/:id/issues", authenticateToken, requirePermission('rides:update'), async (req, res) => {
  try {
    const { type, description, severity } = req.body;
    
    if (!type || !description) {
      return res.status(400).json({
        ok: false,
        error: 'סוג ותיאור הבעיה חובה'
      });
    }
    
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.RIDE.NOT_FOUND
      });
    }
    
    // Initialize issues array
    if (!Array.isArray(ride.issues)) {
      ride.issues = [];
    }
    
    ride.issues.push({
      type: type.trim(),
      description: description.trim(),
      severity: severity || 'medium',
      reportedBy: req.user.username || req.user.user,
      reportedAt: new Date(),
      resolved: false
    });
    
    ride.updatedAt = new Date();
    
    // Add history
    addHistoryEntry(ride, 'issue_reported', req.user.username || req.user.user, {
      type,
      severity: severity || 'medium'
    });
    
    await ride.save();
    
    // Audit log
    await AuditLog.create({
      userId: req.user.userId || req.user.user,
      username: req.user.username || req.user.user,
      action: 'ride_issue_reported',
      details: { 
        rideId: ride._id,
        rideNumber: ride.rideNumber,
        issueType: type,
        severity: severity || 'medium'
      }
    }).catch(err => logger.error('AuditLog error:', err));
    
    logger.success("Issue reported on ride", {
      requestId: req.id || null,
      rideId: ride._id,
      rideNumber: ride.rideNumber,
      issueType: type
    });
    
    res.json({ ok: true, issues: ride.issues });
  } catch (err) {
    logger.error("Error reporting issue", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// HISTORY & TIMELINE
// ============================================================

// ===============================================
// GET /api/rides/:id/history - היסטוריית פעולות
// ===============================================
router.get("/:id/history", authenticateToken, requirePermission('rides:read'), async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id).select('history');
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.RIDE.NOT_FOUND
      });
    }
    
    res.json({ 
      ok: true, 
      history: (ride.history || []).reverse() 
    });
  } catch (err) {
    logger.error("Error fetching ride history", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ===============================================
// GET /api/rides/:id/timeline - ציר זמן
// ===============================================
router.get("/:id/timeline", authenticateToken, requirePermission('rides:read'), async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id).select('timeline');
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.RIDE.NOT_FOUND
      });
    }
    
    res.json({ 
      ok: true, 
      timeline: ride.timeline || [] 
    });
  } catch (err) {
    logger.error("Error fetching ride timeline", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});

// ============================================================
// BOT & EXTERNAL APIs (minimal auth)
// ============================================================

// ===============================================
// GET /api/bot/rides/:id - קבלת פרטי נסיעה לבוט (משופר)
// ===============================================
router.get("/api/bot/rides/:id", async (req, res) => {
  try {
    // ✅ FEATURE: Try to find by ID first, then by rideNumber
    let ride = await Ride.findById(req.params.id)
      .select('rideNumber customerName pickup destination status price driverPhone driverName');
    
    if (!ride) {
      // Try to find by rideNumber
      ride = await Ride.findOne({ rideNumber: req.params.id })
        .select('rideNumber customerName pickup destination status price driverPhone driverName');
    }
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: 'Ride not found'
      });
    }
    
    res.json({ ok: true, ride });
  } catch (err) {
    logger.error("Error fetching ride for bot", {
      requestId: req.id || null,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

// ===============================================
// POST /api/rides/respond - תגובת נהג מבוט (אטומי!)
// ===============================================
router.post("/respond", async (req, res) => {
  try {
    const { rideId, rideNumber, driverPhone, driverName, response } = req.body;
    
    if ((!rideId && !rideNumber) || !driverPhone) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: (rideId or rideNumber) and driverPhone'
      });
    }
    
    // Handle response type
    if (response === 'accept' || !response) {
      // ✅✅✅ CRITICAL FIX: ATOMIC LOCK - prevents race condition!
      const ride = await Ride.findOneAndUpdate(
        {
          // Find by ID or rideNumber
          ...(rideId ? { _id: rideId } : { rideNumber }),
          // ✅ RACE CONDITION FIX: Only lock if status allows
          status: { $in: ['sent', 'distributed', 'created'] }
        },
        {
          $set: {
            status: 'locked',
            lockedBy: driverPhone,
            lockedAt: new Date(),
            driverPhone: driverPhone,
            driverName: driverName || 'Unknown Driver',
            updatedAt: new Date()
          },
          $push: {
            history: {
              action: 'locked',
              status: 'locked',
              by: driverPhone,
              timestamp: new Date(),
              details: {
                source: 'whatsapp',
                driverName: driverName || driverPhone
              }
            },
            timeline: {
              event: 'locked',
              timestamp: new Date(),
              details: {
                driver: driverName || driverPhone,
                source: 'whatsapp'
              }
            }
          }
        },
        { new: true }
      );
      
      // ✅ RACE CONDITION CHECK: If ride is null, someone else took it!
      if (!ride) {
        // Try to find the ride to check why it failed
        const existingRide = rideId 
          ? await Ride.findById(rideId)
          : await Ride.findOne({ rideNumber });
        
        if (!existingRide) {
          return res.status(404).json({
            ok: false,
            error: 'Ride not found'
          });
        }
        
        // Ride exists but status doesn't allow locking
        return res.status(409).json({
          ok: false,
          message: 'Ride is no longer available',
          rideStatus: existingRide.status,
          assignedTo: existingRide.driverName || existingRide.driverPhone,
          code: 'ALREADY_TAKEN'
        });
      }
      
      // ✅ WebSocket update
      try {
        if (typeof websockets !== 'undefined') {
          websockets.emitRideUpdate(ride._id, {
            event: 'locked',
            status: 'locked',
            driverName,
            driverPhone
          });
        }
      } catch (err) {
        logger.error('WebSocket error:', err);
      }
      
      logger.success('🔒 Ride locked for driver (atomic)', {
        rideNumber: ride.rideNumber,
        driverPhone,
        driverName
      });
      
      res.json({
        ok: true,
        message: 'Ride locked successfully',
        ride: {
          _id: ride._id,
          rideNumber: ride.rideNumber,
          status: ride.status,
          pickup: ride.pickup,
          destination: ride.destination,
          customerName: ride.customerName,
          customerPhone: ride.customerPhone,
          price: ride.price
        }
      });
      
    } else if (response === 'reject') {
      // ✅ Driver rejected - just log it (no race condition here)
      const ride = rideId 
        ? await Ride.findById(rideId)
        : await Ride.findOne({ rideNumber });
      
      if (!ride) {
        return res.status(404).json({
          ok: false,
          error: 'Ride not found'
        });
      }
      
      addHistoryEntry(ride, 'rejected', driverPhone, { 
        driverName: driverName || driverPhone,
        source: 'whatsapp'
      });
      
      await ride.save();
      
      logger.info('Driver rejected ride', {
        rideNumber: ride.rideNumber,
        driverPhone,
        driverName
      });
      
      res.json({ 
        ok: true, 
        message: 'Response recorded',
        ride: {
          rideNumber: ride.rideNumber,
          status: ride.status
        }
      });
    }
  } catch (err) {
    logger.error("Error processing bot response", {
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: 'Failed to process response'
    });
  }
});

// ============================================================
// EXPORT
// ============================================================

export default router;