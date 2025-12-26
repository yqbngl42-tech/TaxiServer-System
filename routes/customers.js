// ============================================================
// CUSTOMERS ROUTES
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
// 3 ENDPOINTS
// ============================================================

// GET /api/customers
router.get("/customers", authenticateToken, async (req, res) => {
  try {
    const { vip, search, limit = 100 } = req.query;
    
    let query = {};
    
    // Filter by VIP status
    if (vip === 'true') {
      query.isVIP = true;
    }
    
    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    const customers = await Ride.aggregate([
      {
        $group: {
          _id: "$customer.phone",
          name: { $first: "$customer.name" },
          phone: { $first: "$customer.phone" },
          totalRides: { $sum: 1 },
          totalSpent: { $sum: "$price" },
          lastRide: { $max: "$createdAt" },
          createdAt: { $min: "$createdAt" }
        }
      },
      {
        $project: {
          _id: 0,
          name: 1,
          phone: 1,
          totalRides: 1,
          totalSpent: 1,
          lastRide: 1,
          createdAt: 1,
          isVIP: { $gte: ["$totalRides", 10] }
        }
      },
      { $match: query },
      { $sort: { totalRides: -1 } },
      { $limit: parseInt(limit) }
    ]);
    
    res.json(customers);
  } catch (error) {
    logger.error('Error fetching customers:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/customers
router.get("/customers", authenticateToken, async (req, res) => {
  try {
    const { vip, search, limit = 100 } = req.query;
    
    const rides = await Ride.find({});
    const customersMap = new Map();
    
    rides.forEach(ride => {
      const phone = ride.customerPhone;
      if (!customersMap.has(phone)) {
        customersMap.set(phone, {
          phone,
          name: ride.customerName,
          totalRides: 0,
          totalSpent: 0,
          lastRide: ride.createdAt,
          firstRide: ride.createdAt,
          isVIP: false
        });
      }
      
      const customer = customersMap.get(phone);
      customer.totalRides++;
      customer.totalSpent += ride.price || 0;
      
      if (ride.createdAt > customer.lastRide) {
        customer.lastRide = ride.createdAt;
      }
      if (ride.createdAt < customer.firstRide) {
        customer.firstRide = ride.createdAt;
      }
      
      customer.isVIP = customer.totalRides >= 10;
    });
    
    let customers = Array.from(customersMap.values());
    
    if (vip === 'true') {
      customers = customers.filter(c => c.isVIP);
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      customers = customers.filter(c => 
        c.name.toLowerCase().includes(searchLower) ||
        c.phone.includes(search)
      );
    }
    
    customers.sort((a, b) => b.totalRides - a.totalRides);
    customers = customers.slice(0, parseInt(limit));
    
    res.json(customers);
    
  } catch (error) {
    logger.error('Error fetching customers:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/customers
router.get("/customers", authenticateToken, async (req, res) => {
  try {
    const { vip, search, limit = 100 } = req.query;
    
    const rides = await Ride.find({});
    const customersMap = new Map();
    
    rides.forEach(ride => {
      const phone = ride.customerPhone;
      if (!customersMap.has(phone)) {
        customersMap.set(phone, {
          phone,
          name: ride.customerName,
          totalRides: 0,
          totalSpent: 0,
          lastRide: ride.createdAt,
          isVIP: false
        });
      }
      
      const customer = customersMap.get(phone);
      customer.totalRides++;
      customer.totalSpent += ride.price || 0;
      if (ride.createdAt > customer.lastRide) {
        customer.lastRide = ride.createdAt;
      }
      customer.isVIP = customer.totalRides >= 10;
    });
    
    let customers = Array.from(customersMap.values());
    
    if (vip === 'true') {
      customers = customers.filter(c => c.isVIP);
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      customers = customers.filter(c => 
        c.name.toLowerCase().includes(searchLower) ||
        c.phone.includes(search)
      );
    }
    
    customers.sort((a, b) => b.totalRides - a.totalRides);
    customers = customers.slice(0, parseInt(limit));
    
    res.json(customers);
    
  } catch (error) {
    logger.error('Error fetching customers:', error);
    res.status(500).json({ error: error.message });
  }
});


export default router;
