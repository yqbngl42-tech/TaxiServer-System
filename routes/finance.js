// ============================================================
// FINANCE ROUTES
// Auto-generated from server.js refactoring
// ============================================================

import express from 'express';
import { Driver, Ride } from '../models/index.js';
import { authenticateToken } from '../middlewares/auth.js';
import logger from '../utils/logger.js';

// Import what you need (adjust based on actual usage)
// import Ride from '../models/Ride.js';
// import Driver from '../models/Driver.js';
// import { authenticateToken } from '../middlewares/auth.js';
// import logger from '../utils/logger.js';

const router = express.Router();

// ============================================================
// 8 ENDPOINTS
// ============================================================

// GET /api/finance/commissions
router.get("/commissions", authenticateToken, async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let startDate = new Date();
    if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    }
    
    const commissions = await Ride.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: "$driver",
          ridesCount: { $sum: 1 },
          totalRevenue: { $sum: "$price" }
        }
      },
      {
        $lookup: {
          from: 'drivers',
          localField: '_id',
          foreignField: '_id',
          as: 'driverInfo'
        }
      },
      {
        $unwind: '$driverInfo'
      },
      {
        $project: {
          driver: {
            _id: '$driverInfo._id',
            name: '$driverInfo.name',
            phone: '$driverInfo.phone'
          },
          ridesCount: 1,
          totalRevenue: 1,
          commissionPercent: 20,
          amount: { $multiply: ['$totalRevenue', 0.20] },
          paid: false
        }
      }
    ]);
    
    res.json(commissions);
  } catch (error) {
    logger.error('Error fetching commissions:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/finance/reports
router.get("/reports", authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    
    // Monthly stats
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyRides = await Ride.find({
      status: 'completed',
      createdAt: { $gte: monthStart }
    });
    
    // Yearly stats
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearlyRides = await Ride.find({
      status: 'completed',
      createdAt: { $gte: yearStart }
    });
    
    // Driver stats
    const activeDrivers = await Driver.countDocuments({ status: 'active' });
    const totalCommissions = monthlyRides.reduce((sum, r) => sum + (r.price * 0.20), 0);
    
    // Payment stats
    const failedPayments = await Ride.countDocuments({
      status: 'failed',
      createdAt: { $gte: monthStart }
    });
    
    res.json({
      monthly: {
        revenue: monthlyRides.reduce((sum, r) => sum + r.price, 0),
        rides: monthlyRides.length
      },
      yearly: {
        revenue: yearlyRides.reduce((sum, r) => sum + r.price, 0),
        rides: yearlyRides.length
      },
      drivers: {
        active: activeDrivers,
        commissions: totalCommissions
      },
      payments: {
        count: monthlyRides.length,
        failed: failedPayments
      }
    });
  } catch (error) {
    logger.error('Error generating finance reports:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/finance/overview
router.get("/overview", authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayRides = await Ride.find({
      createdAt: { $gte: todayStart },
      status: 'finished'
    });
    
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    const weekRides = await Ride.find({
      createdAt: { $gte: weekStart },
      status: 'finished'
    });
    
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthRides = await Ride.find({
      createdAt: { $gte: monthStart },
      status: 'finished'
    });
    
    const calculateStats = (rides) => ({
      revenue: rides.reduce((sum, r) => sum + (r.price || 0), 0),
      commissions: rides.reduce((sum, r) => sum + (r.commissionAmount || 0), 0),
      rides: rides.length
    });
    
    res.json({
      today: calculateStats(todayRides),
      week: calculateStats(weekRides),
      month: calculateStats(monthRides),
      debts: {
        total: 0
      }
    });
    
  } catch (error) {
    logger.error('Error fetching finance overview:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/finance/commissions
router.get("/commissions", authenticateToken, async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let startDate = new Date();
    if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'today') {
      startDate.setHours(0, 0, 0, 0);
    }
    
    const rides = await Ride.find({
      status: 'finished',
      createdAt: { $gte: startDate }
    }).populate('driverId', 'name phone');
    
    const commissionsMap = new Map();
    
    rides.forEach(ride => {
      if (!ride.driverId) return;
      
      const driverId = ride.driverId._id.toString();
      if (!commissionsMap.has(driverId)) {
        commissionsMap.set(driverId, {
          driver: {
            _id: ride.driverId._id,
            name: ride.driverId.name,
            phone: ride.driverId.phone
          },
          ridesCount: 0,
          totalRevenue: 0,
          commissionPercent: 20,
          amount: 0,
          paid: false
        });
      }
      
      const commission = commissionsMap.get(driverId);
      commission.ridesCount++;
      commission.totalRevenue += ride.price || 0;
      commission.amount = commission.totalRevenue * 0.20;
    });
    
    res.json(Array.from(commissionsMap.values()));
    
  } catch (error) {
    logger.error('Error fetching commissions:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/finance/reports
router.get("/reports", authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyRides = await Ride.find({
      status: 'finished',
      createdAt: { $gte: monthStart }
    });
    
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearlyRides = await Ride.find({
      status: 'finished',
      createdAt: { $gte: yearStart }
    });
    
    const activeDrivers = await Driver.countDocuments({ 
      isActive: true,
      isBlocked: false 
    });
    
    const totalCommissions = monthlyRides.reduce((sum, r) => 
      sum + (r.commissionAmount || r.price * 0.20 || 0), 0
    );
    
    const failedPayments = await Ride.countDocuments({
      status: 'cancelled',
      createdAt: { $gte: monthStart }
    });
    
    res.json({
      monthly: {
        revenue: monthlyRides.reduce((sum, r) => sum + (r.price || 0), 0),
        rides: monthlyRides.length,
        avgRidePrice: monthlyRides.length > 0 ? 
          monthlyRides.reduce((sum, r) => sum + (r.price || 0), 0) / monthlyRides.length : 0
      },
      yearly: {
        revenue: yearlyRides.reduce((sum, r) => sum + (r.price || 0), 0),
        rides: yearlyRides.length,
        avgRidePrice: yearlyRides.length > 0 ?
          yearlyRides.reduce((sum, r) => sum + (r.price || 0), 0) / yearlyRides.length : 0
      },
      drivers: {
        active: activeDrivers,
        commissions: totalCommissions
      },
      payments: {
        count: monthlyRides.length,
        failed: failedPayments
      }
    });
    
  } catch (error) {
    logger.error('Error generating finance reports:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/finance/overview
router.get("/overview", authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    
    // היום
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayRides = await Ride.find({
      createdAt: { $gte: todayStart },
      status: 'finished'
    });
    
    // שבוע
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    const weekRides = await Ride.find({
      createdAt: { $gte: weekStart },
      status: 'finished'
    });
    
    // חודש
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthRides = await Ride.find({
      createdAt: { $gte: monthStart },
      status: 'finished'
    });
    
    const calculateStats = (rides) => ({
      revenue: rides.reduce((sum, r) => sum + (r.price || 0), 0),
      commissions: rides.reduce((sum, r) => sum + (r.commissionAmount || 0), 0),
      rides: rides.length
    });
    
    res.json({
      today: calculateStats(todayRides),
      week: calculateStats(weekRides),
      month: calculateStats(monthRides),
      debts: { total: 0 }
    });
    
  } catch (error) {
    logger.error('Error fetching finance overview:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/finance/payments
router.get("/payments", authenticateToken, async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    
    let query = {};
    if (status === 'completed') {
      query.status = 'finished';
    } else if (status === 'pending') {
      query.status = { $in: ['created', 'assigned', 'approved', 'enroute'] };
    }
    
    const rides = await Ride.find(query)
      .populate('driverId', 'name phone')
      .sort('-createdAt')
      .limit(parseInt(limit));
    
    const payments = rides.map(ride => ({
      _id: ride._id,
      rideId: ride.rideNumber,
      customer: { name: ride.customerName, phone: ride.customerPhone },
      driver: ride.driverId ? { name: ride.driverId.name, phone: ride.driverId.phone } : null,
      amount: ride.price || 0,
      method: ride.paymentMethod || 'cash',
      status: ride.status === 'finished' ? 'completed' : 'pending',
      createdAt: ride.createdAt
    }));
    
    res.json(payments);
    
  } catch (error) {
    logger.error('Error fetching payments:', error);
    res.status(500).json({ error: error.message });
  }
});


// POST /api/finance/reports/generate
router.post("/reports/generate", authenticateToken, async (req, res) => {
  try {
    const { type, startDate, endDate } = req.body;
    
    const rides = await Ride.find({
      createdAt: { 
        $gte: new Date(startDate), 
        $lte: new Date(endDate) 
      },
      status: 'finished'
    });
    
    const report = {
      type,
      period: { startDate, endDate },
      totalRides: rides.length,
      totalRevenue: rides.reduce((sum, r) => sum + (r.price || 0), 0),
      totalCommissions: rides.reduce((sum, r) => sum + (r.commissionAmount || 0), 0),
      generatedAt: new Date()
    };
    
    res.json(report);
    
  } catch (error) {
    logger.error('Error generating report:', error);
    res.status(500).json({ error: error.message });
  }
});


export default router;
