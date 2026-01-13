// ===============================================
// 🚕 RIDES EXTRA API ROUTES
// ===============================================
// נתיבי API נוספים לניהול נסיעות
// Created: 24 דצמבר 2025

import express from 'express';
import { Activity, Driver, Ride } from '../models/index.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

// ===============================================
// 1️⃣ PUT /api/rides/:id
// ===============================================
// עדכון כללי של נסיעה (כל השדות)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    console.log('🔄 Updating ride:', id);
    
    const ride = await Ride.findById(id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: { message: 'נסיעה לא נמצאה' }
      });
    }
    
    // שדות שמותר לעדכן
    const allowedFields = [
      'customerName',
      'customerPhone',
      'pickup',
      'destination',
      'scheduledTime',
      'notes',
      'price',
      'commissionRate',
      'rideType',
      'specialNotes',
      'groupChat',
      'paymentMethod'
    ];
    
    // עדכן רק שדות מותרים
    const previousData = {};
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        previousData[field] = ride[field];
        ride[field] = updateData[field];
      }
    });
    
    // חשב עמלה מחדש אם המחיר השתנה
    if (updateData.price || updateData.commissionRate) {
      ride.commissionAmount = ride.price * ride.commissionRate;
    }
    
    ride.updatedAt = new Date();
    
    await ride.save();
    
    // הוסף להיסטוריה
    await ride.addHistory(
      ride.status,
      req.user?.username || 'admin',
      `Ride details updated`
    );
    
    // תיעוד פעילות
    await Activity.create({
      type: 'ride_updated',
      description: `Ride ${ride.rideNumber} updated`,
      relatedId: ride._id,
      data: {
        rideNumber: ride.rideNumber,
        updatedFields: Object.keys(previousData),
        updatedBy: req.user?.username || 'admin'
      }
    }).catch(err => console.log('Activity log failed:', err));
    
    console.log('✅ Ride updated successfully');
    
    res.json({
      ok: true,
      ride,
      message: 'הנסיעה עודכנה בהצלחה'
    });
    
  } catch (error) {
    console.error('❌ Error updating ride:', error);
    res.status(500).json({
      ok: false,
      error: { message: 'שגיאה בעדכון נסיעה', details: error.message }
    });
  }
});

// ===============================================
// 2️⃣ POST /api/rides/:id/cancel
// ===============================================
// ביטול נסיעה
router.post('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, cancelledBy } = req.body;
    
    console.log('❌ Cancelling ride:', id);
    
    const ride = await Ride.findById(id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: { message: 'נסיעה לא נמצאה' }
      });
    }
    
    // בדוק אם אפשר לבטל
    if (!ride.canBeCancelled()) {
      return res.status(400).json({
        ok: false,
        error: { 
          message: 'לא ניתן לבטל נסיעה בסטטוס הנוכחי',
          currentStatus: ride.status
        }
      });
    }
    
    const previousStatus = ride.status;
    
    ride.status = 'cancelled';
    ride.cancelledAt = new Date();
    ride.cancelledBy = cancelledBy || req.user?.username || 'admin';
    ride.cancellationReason = reason || 'ביטול ידני';
    
    // אם הנסיעה הייתה נעולה, שחרר את הנעילה
    if (ride.lockedBy) {
      ride.lockedBy = null;
      ride.lockedAt = null;
    }
    
    await ride.save();
    
    // הוסף להיסטוריה
    await ride.addHistory(
      'cancelled',
      cancelledBy || req.user?.username || 'admin',
      `Ride cancelled: ${reason || 'No reason provided'}`
    );
    
    // תיעוד פעילות
    await Activity.create({
      type: 'ride_cancelled',
      description: `Ride ${ride.rideNumber} cancelled`,
      relatedId: ride._id,
      data: {
        rideNumber: ride.rideNumber,
        previousStatus,
        reason,
        cancelledBy: ride.cancelledBy
      }
    }).catch(err => console.log('Activity log failed:', err));
    
    console.log('✅ Ride cancelled successfully');
    
    res.json({
      ok: true,
      ride,
      message: 'הנסיעה בוטלה בהצלחה'
    });
    
  } catch (error) {
    console.error('❌ Error cancelling ride:', error);
    res.status(500).json({
      ok: false,
      error: { message: 'שגיאה בביטול נסיעה', details: error.message }
    });
  }
});

// ===============================================
// 3️⃣ POST /api/rides/:id/lock
// ===============================================
// נעילת נסיעה (למנוע נהגים נוספים)
router.post('/:id/lock', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { driverPhone, driverName, lockReason } = req.body;
    
    console.log('🔒 Locking ride:', id);
    
    const ride = await Ride.findById(id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: { message: 'נסיעה לא נמצאה' }
      });
    }
    
    // בדוק שהנסיעה לא כבר נעולה או שויכה
    if (ride.status === 'locked') {
      return res.status(400).json({
        ok: false,
        error: { message: 'הנסיעה כבר נעולה' }
      });
    }
    
    if (ride.status === 'assigned' || ride.status === 'approved') {
      return res.status(400).json({
        ok: false,
        error: { message: 'הנסיעה כבר שויכה לנהג' }
      });
    }
    
    // נעל את הנסיעה
    ride.status = 'locked';
    ride.lockedBy = driverPhone || req.user?.username || 'admin';
    ride.lockedAt = new Date();
    ride.lockReason = lockReason || 'Manual lock';
    
    await ride.save();
    
    // הוסף להיסטוריה
    await ride.addHistory(
      'locked',
      ride.lockedBy,
      lockReason || 'Ride locked manually'
    );
    
    // תיעוד פעילות
    await Activity.create({
      type: 'ride_locked',
      description: `Ride ${ride.rideNumber} locked`,
      relatedId: ride._id,
      data: {
        rideNumber: ride.rideNumber,
        lockedBy: ride.lockedBy,
        reason: lockReason
      }
    }).catch(err => console.log('Activity log failed:', err));
    
    console.log('✅ Ride locked successfully');
    
    res.json({
      ok: true,
      ride,
      message: 'הנסיעה נעולה בהצלחה'
    });
    
  } catch (error) {
    console.error('❌ Error locking ride:', error);
    res.status(500).json({
      ok: false,
      error: { message: 'שגיאה בנעילת נסיעה', details: error.message }
    });
  }
});

// ===============================================
// 4️⃣ POST /api/rides/:id/unlock
// ===============================================
// פתיחת נעילה של נסיעה
router.post('/:id/unlock', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { unlockReason, force = false } = req.body;
    
    console.log('🔓 Unlocking ride:', id);
    
    const ride = await Ride.findById(id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: { message: 'נסיעה לא נמצאה' }
      });
    }
    
    // בדוק שהנסיעה נעולה
    if (ride.status !== 'locked') {
      return res.status(400).json({
        ok: false,
        error: { message: 'הנסיעה לא נעולה' }
      });
    }
    
    const previousLockedBy = ride.lockedBy;
    
    // שחרר נעילה
    ride.status = 'sent'; // חזור לסטטוס נשלח
    ride.lockedBy = null;
    ride.lockedAt = null;
    ride.unlockReason = unlockReason || 'Manual unlock';
    ride.unlockedAt = new Date();
    ride.unlockedBy = req.user?.username || 'admin';
    
    await ride.save();
    
    // הוסף להיסטוריה
    await ride.addHistory(
      'sent',
      req.user?.username || 'admin',
      `Ride unlocked: ${unlockReason || 'No reason provided'}`
    );
    
    // תיעוד פעילות
    await Activity.create({
      type: 'ride_unlocked',
      description: `Ride ${ride.rideNumber} unlocked`,
      relatedId: ride._id,
      data: {
        rideNumber: ride.rideNumber,
        previousLockedBy,
        unlockedBy: ride.unlockedBy,
        reason: unlockReason,
        force
      }
    }).catch(err => console.log('Activity log failed:', err));
    
    console.log('✅ Ride unlocked successfully');
    
    res.json({
      ok: true,
      ride,
      message: 'הנעילה שוחררה בהצלחה'
    });
    
  } catch (error) {
    console.error('❌ Error unlocking ride:', error);
    res.status(500).json({
      ok: false,
      error: { message: 'שגיאה בשחרור נעילה', details: error.message }
    });
  }
});

// ===============================================
// 5️⃣ POST /api/rides/:id/redispatch
// ===============================================
// שליחה מחדש של נסיעה (דרך הבוט)
router.post('/:id/redispatch', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { targetGroups, reason } = req.body;
    
    console.log('🔄 Redispatching ride:', id);
    
    const ride = await Ride.findById(id);
    
    if (!ride) {
      return res.status(404).json({
        ok: false,
        error: { message: 'נסיעה לא נמצאה' }
      });
    }
    
    // בדוק שהנסיעה לא הושלמה
    if (ride.isCompleted()) {
      return res.status(400).json({
        ok: false,
        error: { message: 'לא ניתן לשלוח מחדש נסיעה שהושלמה' }
      });
    }
    
    // אם הנסיעה נעולה, שחרר נעילה
    const wasLocked = ride.status === 'locked';
    if (wasLocked) {
      ride.lockedBy = null;
      ride.lockedAt = null;
    }
    
    // אפס שיוך נהג אם קיים
    const hadDriver = !!ride.driverPhone;
    if (hadDriver) {
      ride.driverPhone = null;
      ride.driverName = null;
      ride.driverId = null;
    }
    
    // עדכן סטטוס לנשלח מחדש
    ride.status = 'sent';
    ride.sentCount = (ride.sentCount || 0) + 1;
    ride.lastRedispatchAt = new Date();
    ride.redispatchReason = reason || 'Manual redispatch';
    ride.redispatchedBy = req.user?.username || 'admin';
    
    // שמור קבוצות יעד אם צוינו
    if (targetGroups) {
      ride.targetGroups = targetGroups;
    }
    
    await ride.save();
    
    // הוסף להיסטוריה
    await ride.addHistory(
      'sent',
      req.user?.username || 'admin',
      `Ride redispatched: ${reason || 'No reason provided'}`
    );
    
    // תיעוד פעילות
    await Activity.create({
      type: 'ride_redispatched',
      description: `Ride ${ride.rideNumber} redispatched`,
      relatedId: ride._id,
      data: {
        rideNumber: ride.rideNumber,
        wasLocked,
        hadDriver,
        targetGroups,
        reason,
        redispatchedBy: ride.redispatchedBy,
        sentCount: ride.sentCount
      }
    }).catch(err => console.log('Activity log failed:', err));
    
    console.log('✅ Ride redispatched successfully');
    
    res.json({
      ok: true,
      ride,
      message: 'הנסיעה נשלחה מחדש בהצלחה',
      info: {
        wasLocked,
        hadDriver,
        sentCount: ride.sentCount
      }
    });
    
  } catch (error) {
    console.error('❌ Error redispatching ride:', error);
    res.status(500).json({
      ok: false,
      error: { message: 'שגיאה בשליחה מחדש', details: error.message }
    });
  }
});

// ===============================================
// 🔧 BONUS: Batch operations
// ===============================================

// נעילה המונית
router.post('/batch/lock', authenticateToken, async (req, res) => {
  try {
    const { rideIds, lockReason } = req.body;
    
    if (!Array.isArray(rideIds) || rideIds.length === 0) {
      return res.status(400).json({
        ok: false,
        error: { message: 'נדרש מערך של מזהי נסיעות' }
      });
    }
    
    console.log(`🔒 Batch locking ${rideIds.length} rides`);
    
    const result = await Ride.updateMany(
      { 
        _id: { $in: rideIds },
        status: { $in: ['created', 'sent'] }
      },
      {
        $set: {
          status: 'locked',
          lockedBy: req.user?.username || 'admin',
          lockedAt: new Date(),
          lockReason: lockReason || 'Batch lock'
        }
      }
    );
    
    console.log('✅ Batch lock completed');
    
    res.json({
      ok: true,
      data: {
        updated: result.modifiedCount,
        total: rideIds.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error in batch lock:', error);
    res.status(500).json({
      ok: false,
      error: { message: 'שגיאה בנעילה המונית', details: error.message }
    });
  }
});

// ביטול המוני
router.post('/batch/cancel', authenticateToken, async (req, res) => {
  try {
    const { rideIds, reason } = req.body;
    
    if (!Array.isArray(rideIds) || rideIds.length === 0) {
      return res.status(400).json({
        ok: false,
        error: { message: 'נדרש מערך של מזהי נסיעות' }
      });
    }
    
    console.log(`❌ Batch cancelling ${rideIds.length} rides`);
    
    const result = await Ride.updateMany(
      { 
        _id: { $in: rideIds },
        status: { $in: ['created', 'sent', 'locked', 'approved'] }
      },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: req.user?.username || 'admin',
          cancellationReason: reason || 'Batch cancellation'
        }
      }
    );
    
    console.log('✅ Batch cancel completed');
    
    res.json({
      ok: true,
      data: {
        updated: result.modifiedCount,
        total: rideIds.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error in batch cancel:', error);
    res.status(500).json({
      ok: false,
      error: { message: 'שגיאה בביטול המוני', details: error.message }
    });
  }
});

console.log('✅ Rides extra routes loaded');

export default router;
