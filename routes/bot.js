// ============================================================
// BOT ROUTES
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
// 9 ENDPOINTS
// ============================================================

// POST /api/twilio/webhook
router.post("/api/twilio/webhook", validateTwilioRequest, async (req, res) => {
  try {
    const { From, Body, MediaUrl0, NumMedia } = req.body;
    const driverPhone = From?.replace('whatsapp:', '');
    
    logger.info('📩 Twilio webhook received', { 
      from: From, 
      body: Body?.substring(0, 50),
      hasMedia: NumMedia > 0
    });
    
    // ===============================================
    // 🔍 STEP 1: Check for registration flow
    // ===============================================
    const registrationResult = await registrationHandler.handleMessage(
      driverPhone, 
      Body, 
      MediaUrl0
    );
    
    if (registrationResult) {
      // This is a registration message
      return res.status(200).send(registrationResult);
    }
    
    // ===============================================
    // 🔍 STEP 2: Check for special commands
    // ===============================================
    const normalizedBody = Body?.trim().toLowerCase();
    
    // Status command
    if (normalizedBody === 'סטטוס' || normalizedBody === 'status') {
      const status = await registrationHandler.getStatus(driverPhone);
      return res.status(200).send(status);
    }
    
    // Cancel registration command
    if (normalizedBody === 'ביטול רישום' || normalizedBody === 'cancel registration') {
      const cancelResult = await registrationHandler.cancelRegistration(driverPhone);
      return res.status(200).send(cancelResult);
    }
    
    // ===============================================
    // 🔍 STEP 3: Check for ride link (RIDE:id:token)
    // ===============================================
    const match = Body?.match(/RIDE:([a-f0-9]+):([a-f0-9]+)/);
    
    if (!match) {
      // Not a ride link - maybe status update
      return handleStatusUpdate(req, res);
    }
    
    const [, rideId, token] = match;
    
    // 🔍 STEP 1: Find driver FIRST
    let driver = await Driver.findOne({ phone: driverPhone });
    
    if (!driver) {
      // ❌ נהג לא רשום - הצע רישום!
      logger.warn('❌ Unregistered driver attempt', { 
        driverPhone
      });
      
      return res.status(200).send(`❌ *אתה לא רשום במערכת*

לא ניתן לקחת נסיעות ללא רישום.

💡 *רוצה להירשם?*
שלח את המילה: *הרשמה*

📞 או פנה למנהל לעזרה.`);
    }
    
    // ✅ נהג קיים - בדוק אם מורשה
    if (!driver.isActive) {
      logger.warn('❌ Inactive driver attempt', { 
        driverPhone,
        driverName: driver.name 
      });
      
      return res.status(200).send(`❌ *החשבון שלך לא פעיל*

נא פנה למנהל להפעלת החשבון.`);
    }
    
    // 🔍 STEP 2: Find ride
    const ride = await Ride.findById(rideId);
    
    if (!ride) {
      logger.warn('Ride not found', { rideId, driverPhone });
      return res.status(200).send('❌ נסיעה לא נמצאה');
    }
    
    // Verify token
    if (ride.uniqueToken !== token) {
      logger.warn('Invalid token', { rideId, driverPhone });
      return res.status(200).send('❌ קישור לא תקין');
    }
    
    // Check if ride already taken
    if (ride.status !== 'distributed' && ride.status !== 'created' && ride.status !== 'sent') {
      logger.warn('Ride already taken', { 
        rideNumber: ride.rideNumber, 
        currentStatus: ride.status 
      });
      return res.status(200).send('😔 הנסיעה כבר נלקחה על ידי נהג אחר');
    }
    
    // ===============================================
    // 🔒 ATOMIC LOCK - תיקון קריטי!
    // ===============================================
    // במקום לבדוק ואז לשנות (race condition),
    // עושים את זה אטומית עם findOneAndUpdate
    
    const lockedRide = await Ride.findOneAndUpdate(
      { 
        _id: ride._id,
        status: { $in: ['distributed', 'created', 'sent'] } // רק אם עדיין זמין!
      },
      {
        $set: {
          status: 'assigned',
          driverPhone,
          driverName: driver.name,
          driverId: driver._id,
          assignedAt: new Date()
        },
        $push: {
          history: {
            status: 'assigned',
            by: driverPhone,
            timestamp: new Date(),
            details: `נסיעה נלקחה על ידי ${driver.name}`
          }
        }
      },
      { new: true }
    );
    
    // אם לא הצלחנו לנעול - הנסיעה כבר נלקחה!
    if (!lockedRide) {
      logger.warn('🔒 Lock failed - ride already taken', {
        rideNumber: ride.rideNumber,
        attemptBy: driver.name,
        driverPhone
      });
      return res.status(200).send('😔 הנסיעה כבר נלקחה על ידי נהג אחר במהירות הברק! ⚡');
    }
    
    // ✅ הצלחנו לנעול את הנסיעה!
    logger.success('🔒✅ Ride locked atomically', {
      rideNumber: lockedRide.rideNumber,
      driverName: driver.name,
      driverId: driver.driverId,
      driverPhone
    });
    
    // השתמש ב-lockedRide מעכשיו
    const finalRide = lockedRide;
    
    // Check if driver is approved
    if (driver.registrationStatus !== 'approved') {
      if (driver.registrationStatus === 'pending') {
        return res.status(200).send(`⏳ *הבקשה שלך בטיפול*

מזהה הנהג שלך: *${driver.driverId}*

המנהל עדיין לא אישר את הבקשה שלך.
נעדכן אותך ברגע שתאושר!`);
      } else if (driver.registrationStatus === 'rejected') {
        return res.status(200).send(`❌ *הבקשה שלך נדחתה*

סיבה: ${driver.rejectionReason || 'לא צוינה'}

אם אתה חושב שזו טעות, פנה למנהל.`);
      }
    }
    
    // Check if driver is active
    if (!driver.isActive) {
      return res.status(200).send(`⚠️ *חשבון לא פעיל*

החשבון שלך אינו פעיל כרגע.
פנה למנהל להפעלת החשבון.`);
    }
    
    // Check if driver is blocked
    if (driver.isBlocked) {
      logger.warn('❌ Blocked driver attempt', { 
        driverPhone, 
        driverName: driver.name,
        rideNumber: ride.rideNumber 
      });
      
      return res.status(200).send(`❌ *חשבון חסום*

${driver.blockReason || 'פנה למנהל לפרטים'}`);
    }
    
    // Update driver stats
    driver.stats.totalRides = (driver.stats.totalRides || 0) + 1;
    driver.lastActive = new Date();
    await driver.save();
    
    logger.success('✅ Ride assigned to driver', {
      rideNumber: finalRide.rideNumber,
      driverName: driver.name,
      driverId: driver.driverId,
      driverPhone
    });
    
    // WebSocket update
    if (websockets) {
      websockets.emitRideUpdate(finalRide._id, {
        event: 'assigned',
        status: 'assigned',
        driverName: driver.name,
        driverId: driver.driverId,
        driverPhone
      });
    }
    
    // Log activity
    await Activity.create({
      type: 'ride_assigned',
      userId: driverPhone,
      description: `נסיעה ${finalRide.rideNumber} שוייכה לנהג ${driver.name} (${driver.driverId})`,
      metadata: { rideId: finalRide._id, driverId: driver.driverId, driverPhone, source: 'twilio_link' }
    });
    
    // 📱 Send ride details with buttons
    const netPrice = finalRide.price - (finalRide.commissionAmount || Math.round(finalRide.price * 0.1));
    
    const response = `✅ *מזל טוב ${driver.name}!*

🚖 *נסיעה ${finalRide.rideNumber}*

👤 *לקוח:* ${finalRide.customerName}
☎️  *טלפון:* ${finalRide.customerPhone}

📍 *איסוף:* ${finalRide.pickup}
🎯 *יעד:* ${finalRide.destination}
${finalRide.scheduledTime ? `🕐 *שעה:* ${new Date(finalRide.scheduledTime).toLocaleString('he-IL')}` : '⚡ *מיידית*'}

💰 *מחיר:* ₪${finalRide.price}
💸 *נטו:* ₪${netPrice}

${finalRide.notes ? `📝 *הערות:* ${finalRide.notes}\n` : ''}---

*מה הסטטוס?*

שלח:
1 - בדרך ללקוח
2 - בעיה - ביטול`;
    
    res.status(200).send(response);
    
  } catch (err) {
    logger.error('❌ Twilio webhook error', err);
    res.status(200).send('❌ שגיאת שרת');
  }
});


// POST /api/bot/send-message
router.post("/send-message", authenticateToken, async (req, res) => {
  try {
    const { phone, message } = req.body;
    
    if (!phone || !message) {
      return res.status(400).json({
        ok: false,
        error: "חסרים פרטים: טלפון והודעה"
      });
    }
    
    // Send request to bot
    const botUrl = process.env.BOT_URL || 'http://localhost:3001';
    
    const response = await fetchWithTimeout(`${botUrl}/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone,
        message
      })
    }, 10000, 3); // 10s timeout, 3 retries
    
    const data = await response.json();
    
    if (data.ok) {
      logger.success("Message sent via bot", {
        requestId: req.id,
        phone,
        messageLength: message.length
      });
      
      // Log activity
      await Activity.create({
        type: 'message_sent',
        userId: req.user.user,
        description: `הודעה נשלחה ל-${phone}`,
        metadata: { phone, messagePreview: message.substring(0, 50) }
      });
      
      res.json({
        ok: true,
        message: "ההודעה נשלחה בהצלחה"
      });
    } else {
      throw new Error('Bot failed to send message');
    }
  } catch (err) {
    logger.error("Error sending message via bot", {
      requestId: req.id,
      error: err.message
    });
    res.status(500).json({
      ok: false,
      error: "שגיאה בשליחת ההודעה"
    });
  }
});


// POST /api/bot/trip-sent
router.post("/trip-sent", async (req, res) => {
  try {
    const { tripId, sentTo } = req.body;
    
    if (!tripId) {
      return res.status(400).json({
        ok: false,
        error: 'Missing tripId'
      });
    }
    
    // Update ride - find by _id or rideNumber
    let ride = await Ride.findById(tripId);
    if (!ride) {
      ride = await Ride.findOne({ rideNumber: tripId });
    }
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: 'Ride not found'
      });
    }
    
    ride.status = 'sent';
    ride.sentCount = (ride.sentCount || 0) + 1;
    await ride.addHistory('sent', 'bot', `Sent to ${sentTo?.groupsSent || 'groups'} groups`);
    
    logger.success('Trip marked as sent', { tripId, sentTo });
    
    res.json({
      ok: true,
      message: 'Trip status updated'
    });
    
  } catch (err) {
    logger.error('Error updating trip status', { error: err.message });
    res.status(500).json({
      ok: false,
      error: 'Failed to update trip'
    });
  }
});


// POST /api/bot/heartbeat
router.post("/heartbeat", async (req, res) => {
  try {
    const { timestamp, uptime } = req.body;
    
    logger.debug('Bot heartbeat received', { 
      timestamp, 
      uptime: uptime ? Math.round(uptime) + 's' : 'unknown'
    });
    
    res.json({
      ok: true,
      serverTime: new Date().toISOString()
    });
    
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});


// POST /api/bot/status
router.post("/status", async (req, res) => {
  try {
    const { status, timestamp } = req.body;
    
    logger.info('Bot status update', { status, timestamp });
    
    // כאן אפשר לשמור את הסטטוס ב-DB אם רוצים
    // await BotStatus.create({ status, timestamp });
    
    res.json({
      ok: true,
      message: 'Status updated'
    });
    
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});


// GET /api/bot/stats
router.get("/stats", async (req, res) => {
  try {
    const totalRides = await Ride.countDocuments();
    const totalDrivers = await Driver.countDocuments();
    const totalGroups = await WhatsAppGroup.countDocuments();
    const activeGroups = await WhatsAppGroup.countDocuments({ isActive: true });
    
    res.json({
      ok: true,
      stats: {
        totalRides,
        totalDrivers,
        totalGroups,
        activeGroups,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});


// POST /api/bot/registration/message
router.post("/registration/message", async (req, res) => {
  try {
    const { phone, message, mediaUrl } = req.body;

    logger.info("📝 Bot registration message received", {
      phone,
      hasMessage: !!message,
      hasMedia: !!mediaUrl,
    });

    if (!phone) {
      return res.status(400).json({ ok: false, error: "Missing phone number" });
    }

    const reply = await registrationHandler.handleMessage(phone, message || "", mediaUrl);

    if (!reply) {
      return res.status(500).json({ ok: false, error: "Failed to process message" });
    }

    const session = await RegistrationSession.findOne({ phone });

    return res.json({
      ok: true,
      reply,
      currentStep: session?.currentStep,
      status: session?.status,
    });
  } catch (err) {
    logger.error("Error in bot registration message", { error: err.message, stack: err.stack });
    return res.status(500).json({
      ok: false,
      error: err.message,
      reply: "❌ אירעה שגיאה טכנית. אנא נסה שוב.",
    });
  }
});


// POST /api/bot/registration/upload-media
router.post("/registration/upload-media", async (req, res) => {
  try {
    const { phone, media } = req.body;

    if (!phone || !media || !media.data) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    logger.info("📸 Uploading media from bot", {
      phone,
      mimetype: media.mimetype,
      filename: media.filename,
    });

    const timestamp = Date.now();
    const extension = media.mimetype?.split("/")[1] || "jpg";
    const filename = `${phone}_${timestamp}.${extension}`;

    // ✅ שמירה בתוך public/uploads כדי שה-URL יעבוד דרך express.static(public)
    const uploadsDir = path.join(__dirname, "public", "uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const uploadPath = path.join(uploadsDir, filename);

    const buffer = Buffer.from(media.data, "base64");
    fs.writeFileSync(uploadPath, buffer);

    const mediaUrl = `/uploads/${filename}`;

    logger.success("✅ Media uploaded successfully", { phone, filename, url: mediaUrl });

    return res.json({ ok: true, url: mediaUrl, filename });
  } catch (err) {
    logger.error("Error uploading media", { error: err.message, stack: err.stack });
    return res.status(500).json({ ok: false, error: err.message });
  }
});


// POST /api/bot/registration/send-notification
router.post("/registration/send-notification", async (req, res) => {
  try {
    const { phone, type, driverName, driverId, reason } = req.body;

    if (!phone || !type) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    logger.info("📤 Sending registration notification via bot", { phone, type });

    const botUrl = process.env.BOT_URL || "http://localhost:3001";

    // ✅ מומלץ: fetchWithTimeout (אם קיים אצלך כבר בשרת)
    const response = await fetchWithTimeout(`${botUrl}/send-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, type, driverName, driverId, reason }),
    });

    if (!response.ok) {
      throw new Error(`Bot returned status ${response.status}`);
    }

    const result = await response.json();

    logger.success("✅ Notification sent via bot", { phone, type });

    return res.json({ ok: true, result });
  } catch (err) {
    logger.error("Error sending notification via bot", { error: err.message });
    return res.status(500).json({ ok: false, error: err.message });
  }
});


export default router;
