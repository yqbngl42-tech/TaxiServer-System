// ============================================================
// RIDES ROUTES
// Auto-generated from server.js refactoring
// ============================================================

import express from 'express';

// Import what you need (adjust based on actual usage)
// import Ride from '../models/Ride.js';
// import Driver from '../models/Driver.js';
// import { authenticateToken } from '../middlewares/auth.js';
// import logger from '../utils/logger.js';

const router = express.Router();

// ============================================================
// 11 ENDPOINTS
// ============================================================

// POST /api/client/rides
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
    const rideNumber = await rideNumberGenerator.formatRideNumber();
    
    // Default price
    const defaultPrice = 50;

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
      commissionRate: 0.10,
      commissionAmount: Math.round(defaultPrice * 0.10),
      status: "created",
      rideType: "regular",
      groupChat: "default",
      createdBy: "client",
      history: [{ 
        status: "created", 
        by: "client_website",
        timestamp: new Date(),
        details: "הזמנה מאתר הלקוחות"
      }]
    });

    logger.success("Ride created from client", {
      requestId: req.id,
      rideId: ride._id,
      rideNumber: ride.rideNumber
    });

    // ✨ ארכיטקטורה חדשה: יצירת קישור ייחודי!
    const { link, token } = generateUniqueRideLink(ride._id);
    
    // שמירת הקישור והtoken בnسيعה
    ride.uniqueLink = link;
    ride.uniqueToken = token;
    await ride.save();
    
    logger.success("Unique link generated", { 
      rideNumber: ride.rideNumber,
      linkPreview: link.substring(0, 40) + '...'
    });

    // 🧠 שליחה חכמה דרך DispatchManager
    // מנסה בוט ראשון, ואם נכשל - עובר ל-Twilio אוטומטית
    dispatchManager.sendRide(ride)
      .then(result => {
        logger.success('Ride dispatched successfully', {
          rideNumber: ride.rideNumber,
          method: result.method,
          responseTime: result.responseTime
        });
      })
      .catch(err => {
        logger.error('Failed to dispatch ride', {
          rideNumber: ride.rideNumber,
          error: err.message
        });
        // אפשר להוסיף כאן התראה למנהל או ניסיון חוזר
      });

    // WebSocket update
    if (websockets) {
      websockets.emitNewRide(ride);
    }

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
      message: ride.status === 'distributed' 
        ? `✅ הנסיעה הוזמנה ונשלחה לנהגים! מספר: ${ride.rideNumber}` 
        : `⚠️ נסיעה נוצרה (${ride.rideNumber}) אך לא נשלחה לנהגים. בדוק את הבוט.`
    });
  } catch (err) {
    logger.error("Error creating ride from client", { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({ 
      ok: false, 
      error: ERRORS.SERVER.UNKNOWN 
    });
  }
});


// GET /api/rides
router.get("/", authenticateToken, async (req, res) => {
  try {
    // Pagination parameters
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
    if (req.query.fromDate) {
      filter.createdAt = { $gte: new Date(req.query.fromDate) };
    }
    if (req.query.toDate) {
      filter.createdAt = { 
        ...filter.createdAt, 
        $lte: new Date(req.query.toDate) 
      };
    }
    
    // Query with pagination
    const [rides, total] = await Promise.all([
      Ride.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .select('rideNumber customerName customerPhone pickup destination status price driverPhone createdAt')
        .lean(),
      Ride.countDocuments(filter)
    ]);
    
    logger.action("Rides fetched", { 
      requestId: req.id,
      page, 
      limit, 
      total, 
      resultsCount: rides.length 
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
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({ 
      ok: false, 
      error: ERRORS.SERVER.DATABASE 
    });
  }
});


// POST /api/rides
router.post("/", authenticateToken, async (req, res) => {
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
        error: "שדות חובה: שם, טלפון, איסוף, יעד, מחיר" 
      });
    }

    const phoneRegex = /^(0|\+972)?5\d{8}$/;
    if (!phoneRegex.test(customerPhone.replace(/[\s\-]/g, ''))) {
      return res.status(400).json({ 
        ok: false, 
        error: ERRORS.VALIDATION.PHONE 
      });
    }

    if (price < 0) {
      return res.status(400).json({ 
        ok: false, 
        error: ERRORS.VALIDATION.PRICE 
      });
    }

    const commission = Math.round((price || 0) * (commissionRate || 0.10));
    const rideNumber = await rideNumberGenerator.formatRideNumber();
    
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
      createdBy: "admin",
      history: [{ 
        status: "created", 
        by: "admin",
        timestamp: new Date(),
        details: "נסיעה נוצרה מממשק הניהול"
      }]
    });

    // יצירת קישור ייחודי
    const { link, token } = generateUniqueRideLink(ride._id);
    ride.uniqueLink = link;
    ride.uniqueToken = token;
    await ride.save();

    logger.success("Ride created by admin", {
      requestId: req.id,
      rideId: ride._id,
      rideNumber: ride.rideNumber,
      uniqueLink: link.substring(0, 40) + '...'
    });

    // 🧠 שליחה חכמה דרך DispatchManager
    dispatchManager.sendRide(ride)
      .then(result => {
        logger.success('Ride dispatched successfully', {
          rideNumber: ride.rideNumber,
          method: result.method,
          responseTime: result.responseTime
        });
      })
      .catch(err => {
        logger.error('Failed to dispatch ride', {
          rideNumber: ride.rideNumber,
          error: err.message
        });
      });
    let phonesToSend = [];
    
    if (sendTo === 'specific' && sendToGroup) {
      const group = await WhatsAppGroup.findById(sendToGroup);
      if (group?.isActive && group.phoneNumbers?.length > 0) {
        phonesToSend = group.phoneNumbers;
      }
    } else {
      const defaultGroup = await WhatsAppGroup.findOne({ isDefault: true, isActive: true });
      if (defaultGroup?.phoneNumbers?.length > 0) {
        phonesToSend = defaultGroup.phoneNumbers;
      } else {
        const drivers = await Driver.find({ isActive: true }, 'phone');
        phonesToSend = drivers.map(d => d.phone);
      }
    }

    let successCount = 0;
    if (phonesToSend.length > 0) {
      const message = createGroupMessage(ride);
      const results = await sendBulkMessagesWithRateLimit(phonesToSend, message);
      successCount = results.success.length;
      
      if (successCount > 0) {
        ride.status = "sent";
        ride.history.push({
          status: "sent",
          by: "system",
          details: `נשלח ל-${successCount} נהגים`,
          timestamp: new Date()
        });
        await ride.save();
      }
    }

    res.json({
      ok: true,
      ride,
      sentCount: successCount
    });
  } catch (err) {
    logger.error("Error creating ride", { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({ 
      ok: false, 
      error: ERRORS.SERVER.UNKNOWN 
    });
  }
});


// PUT /api/rides/:id/status
router.put("/:id/status", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    const validStatuses = ["created", "sent", "approved", "enroute", "arrived", "finished", "commission_paid", "cancelled"];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        ok: false,
        error: ERRORS.RIDE.INVALID_STATUS
      });
    }
    
    const ride = await Ride.findByIdAndUpdate(
      id,
      {
        status,
        $push: {
          history: {
            status,
            by: "admin",
            details: notes || `סטטוס שונה ל-${status}`,
            timestamp: new Date()
          }
        }
      },
      { new: true }
    );
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: ERRORS.RIDE.NOT_FOUND
      });
    }
    
    logger.action("Ride status updated", {
      requestId: req.id,
      rideId: id,
      newStatus: status
    });
    
    res.json({ ok: true, ride });
  } catch (err) {
    logger.error("Error updating ride status", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// GET /api/rides/:id
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const ride = await Ride.findById(id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: "נסיעה לא נמצאה"
      });
    }
    
    res.json({
      ok: true,
      ride
    });
  } catch (err) {
    logger.error("Error getting ride", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.DATABASE
    });
  }
});


// DELETE /api/rides/:id
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const ride = await Ride.findById(id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: "נסיעה לא נמצאה"
      });
    }
    
    if (!ride.canBeCancelled || !ride.canBeCancelled()) {
      return res.status(400).json({
        ok: false,
        error: "לא ניתן לבטל נסיעה בסטטוס זה"
      });
    }
    
    ride.status = 'cancelled';
    ride.history.push({
      status: 'cancelled',
      by: 'admin',
      details: 'נסיעה בוטלה מממשק הניהול',
      timestamp: new Date()
    });
    await ride.save();
    
    logger.success("Ride cancelled", {
      requestId: req.id,
      rideId: id
    });
    
    res.json({
      ok: true,
      message: "נסיעה בוטלה בהצלחה"
    });
  } catch (err) {
    logger.error("Error cancelling ride", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// GET /api/rides/number/:rideNumber
router.get("/number/:rideNumber", async (req, res) => {
  try {
    const { rideNumber } = req.params;
    
    const ride = await Ride.findOne({ rideNumber });
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: 'נסיעה לא נמצאה'
      });
    }
    
    res.json({
      ok: true,
      ride
    });
  } catch (err) {
    logger.error('Error fetching ride by number', { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// POST /api/rides/:id/assign
router.post("/:id/assign", async (req, res) => {
  try {
    const { id } = req.params;
    const { driverPhone, driverName } = req.body;
    
    if (!driverPhone || !driverName) {
      return res.status(400).json({
        ok: false,
        error: 'חסרים פרטי נהג'
      });
    }
    
    const ride = await Ride.findById(id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: 'נסיעה לא נמצאה'
      });
    }
    
    // Check if already taken
    if (ride.status !== 'sent' && ride.status !== 'created') {
      return res.status(400).json({
        ok: false,
        error: 'נסיעה כבר נלקחה',
        assignedTo: ride.driverName
      });
    }
    
    // Find driver
    let driver = await Driver.findOne({ phone: driverPhone });
    
    if (!driver) {
      // Create new driver
      driver = new Driver({
        name: driverName,
        phone: driverPhone,
        vehicleNumber: 'לא צוין',
        vehicleType: 'sedan',
        isActive: true
      });
      await driver.save();
      logger.info('New driver created from WhatsApp', { driverName, driverPhone });
    }
    
    // Update ride
    ride.status = 'approved';
    ride.driverPhone = driverPhone;
    ride.driverName = driverName;
    ride.driverId = driver._id;
    ride.history.push({
      status: 'approved',
      by: driverPhone,
      timestamp: new Date(),
      details: `נסיעה נלקחה על ידי ${driverName} דרך WhatsApp`
    });
    
    await ride.save();
    
    // Update driver stats
    driver.totalRides = (driver.totalRides || 0) + 1;
    await driver.save();
    
    // Send WebSocket update
    if (websockets) {
      websockets.emitRideUpdate(ride._id, {
        event: 'assigned',
        status: 'approved',
        driverName,
        driverPhone
      });
    }
    
    // Log activity
    await Activity.create({
      type: 'ride_assigned',
      userId: driverPhone,
      description: `נסיעה ${ride.rideNumber} שוייכה לנהג ${driverName}`,
      metadata: { rideId: ride._id, driverPhone, source: 'whatsapp' }
    });
    
    logger.success('Ride assigned to driver', { 
      rideNumber: ride.rideNumber, 
      driverName 
    });
    
    res.json({
      ok: true,
      ride,
      message: 'נסיעה שוייכה בהצלחה'
    });
  } catch (err) {
    logger.error('Error assigning ride', { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// POST /api/rides/:id/rating
router.post("/:id/rating", async (req, res) => {
  try {
    const { id } = req.params;
    const { rating } = req.body;
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        ok: false,
        error: 'דירוג חייב להיות בין 1 ל-5'
      });
    }
    
    const ride = await Ride.findById(id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: 'נסיעה לא נמצאה'
      });
    }
    
    ride.rating = parseInt(rating);
    ride.history.push({
      status: 'rated',
      by: 'driver',
      timestamp: new Date(),
      details: `דירוג: ${rating}/5`
    });
    
    await ride.save();
    
    logger.info('Rating submitted', { 
      rideNumber: ride.rideNumber, 
      rating 
    });
    
    res.json({
      ok: true,
      message: 'תודה על הדירוג!'
    });
  } catch (err) {
    logger.error('Error submitting rating', { 
      requestId: req.id, 
      error: err.message 
    });
    res.status(500).json({
      ok: false,
      error: ERRORS.SERVER.UNKNOWN
    });
  }
});


// GET /api/bot/rides/:id
router.get("/api/bot/rides/:id", async (req, res) => {
  try {
    let ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      ride = await Ride.findOne({ rideNumber: req.params.id });
    }
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: 'Ride not found'
      });
    }
    
    res.json({
      ok: true,
      ride
    });
    
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});


// POST /api/rides/respond
router.post("/respond", async (req, res) => {
  try {
    const { rideNumber, driverPhone, driverName } = req.body;
    
    if (!rideNumber || !driverPhone) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields'
      });
    }
    
    // מצא את הנסיעה
    const ride = await Ride.findOne({ rideNumber });
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: 'Ride not found'
      });
    }
    
    // בדוק אם הנסיעה זמינה
    if (ride.status !== 'sent' && ride.status !== 'distributed' && ride.status !== 'created') {
      return res.json({
        ok: false,
        message: 'Ride is no longer available',
        rideStatus: ride.status
      });
    }
    
    // נעל את הנסיעה לנהג
    ride.status = 'locked';
    ride.lockedBy = driverPhone;
    ride.lockedAt = new Date();
    ride.driverPhone = driverPhone;
    ride.driverName = driverName || 'Unknown Driver';
    
    await ride.addHistory(
      'locked', 
      driverPhone, 
      `Driver ${driverName} responded via WhatsApp`
    );
    
    // Send WebSocket update
    if (websockets) {
      websockets.emitRideUpdate(ride._id, {
        event: 'locked',
        status: 'locked',
        driverName,
        driverPhone
      });
    }
    
    logger.success('🔒 Ride locked for driver', {
      rideNumber,
      driverPhone,
      driverName
    });
    
    res.json({
      ok: true,
      message: 'Ride locked successfully',
      ride: {
        rideNumber: ride.rideNumber,
        status: ride.status,
        pickup: ride.pickup,
        destination: ride.destination,
        customerName: ride.customerName,
        customerPhone: ride.customerPhone
      }
    });
    
  } catch (err) {
    logger.error('Error locking ride', { error: err.message });
    res.status(500).json({
      ok: false,
      error: 'Failed to lock ride'
    });
  }
});


export default router;
