import express from 'express';
import { authenticateToken } from './auth.js';
import Ride from '../../models/Ride.js';
import Driver from '../../models/Driver.js';
import RegistrationSession from '../../models/RegistrationSession.js';

const router = express.Router();

// GET /api/v2/dashboard/stats
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const [
      totalRides,
      activeRides,
      lockedRides,
      completedRides,
      cancelledRides,
      totalDrivers,
      activeDrivers,
      blockedDrivers,
      pendingRegistrations,
      todayRevenue
    ] = await Promise.all([
      Ride.countDocuments(),
      Ride.countDocuments({ status: { $in: ['sent', 'assigned', 'approved', 'enroute', 'arrived'] } }),
      Ride.countDocuments({ status: 'locked' }),
      Ride.countDocuments({ status: 'finished' }),
      Ride.countDocuments({ status: 'cancelled' }),
      Driver.countDocuments(),
      Driver.countDocuments({ isActive: true }),
      Driver.countDocuments({ isBlocked: true }),
      RegistrationSession.countDocuments({ status: 'pending' }),
      Ride.aggregate([
        { $match: { createdAt: { $gte: today, $lt: tomorrow }, status: 'finished' } },
        { $group: { _id: null, total: { $sum: '$price' } } }
      ])
    ]);
    
    res.json({
      ok: true,
      data: {
        rides: {
          total: totalRides,
          active: activeRides,
          locked: lockedRides,
          completed: completedRides,
          cancelled: cancelledRides
        },
        drivers: {
          total: totalDrivers,
          active: activeDrivers,
          blocked: blockedDrivers
        },
        registrations: {
          pending: pendingRegistrations
        },
        payments: {
          monthRevenue: todayRevenue[0]?.total || 0
        },
        system: {
          mongo: 'ok',
          bot: 'ok'
        }
      }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'DATABASE_ERROR', message: err.message }
    });
  }
});

export default router;
