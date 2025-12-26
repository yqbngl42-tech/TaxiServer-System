// ============================================================
// MESSAGES ROUTES
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
// 8 ENDPOINTS
// ============================================================

// GET /api/messages/templates
router.get("/templates", authenticateToken, async (req, res) => {
  try {
    // For now, return default templates
    // TODO: Store in database
    const templates = [
      {
        _id: '1',
        name: 'ברוכים הבאים',
        content: 'שלום {{name}}, ברוך הבא למערכת המוניות שלנו! 🚖'
      },
      {
        _id: '2',
        name: 'תזכורת נסיעה',
        content: 'היי {{name}}, הנסיעה שלך מתוזמנת ל-{{time}}. נהג יחכה לך!'
      },
      {
        _id: '3',
        name: 'תודה',
        content: 'תודה {{name}} על השימוש בשירות! נשמח לראותך שוב 😊'
      }
    ];
    
    res.json(templates);
  } catch (error) {
    logger.error('Error fetching message templates:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/messages/history
router.get("/history", authenticateToken, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    // Get from activity logs
    const messages = await Activity.find({
      type: { $in: ['message_sent', 'notification_sent'] }
    })
      .sort('-createdAt')
      .limit(parseInt(limit))
      .select('createdAt description metadata');
    
    const formattedMessages = messages.map(msg => ({
      _id: msg._id,
      sentAt: msg.createdAt,
      recipient: msg.metadata?.recipient || {},
      content: msg.description,
      status: msg.metadata?.status || 'sent',
      error: msg.metadata?.error || null
    }));
    
    res.json(formattedMessages);
  } catch (error) {
    logger.error('Error fetching messages history:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/messages/templates
router.get("/templates", authenticateToken, async (req, res) => {
  try {
    const templates = [
      {
        _id: '1',
        name: 'ברוכים הבאים',
        content: 'שלום {{name}}, ברוך הבא למערכת המוניות שלנו! 🚖\nנשמח לשרת אותך.',
        category: 'general',
        createdAt: new Date()
      },
      {
        _id: '2',
        name: 'תזכורת נסיעה',
        content: 'היי {{name}}! 👋\nהנסיעה שלך מתוזמנת ל-{{time}}.\nהנהג יחכה לך ב-{{pickup}}.',
        category: 'reminder',
        createdAt: new Date()
      },
      {
        _id: '3',
        name: 'תודה על הנסיעה',
        content: 'תודה {{name}} על השימוש בשירות! 🙏\nנשמח לראותך שוב. דרג את הנסיעה: {{ratingLink}}',
        category: 'thanks',
        createdAt: new Date()
      },
      {
        _id: '4',
        name: 'נהג בדרך',
        content: '🚗 הנהג בדרך אליך!\nשם הנהג: {{driverName}}\nטלפון: {{driverPhone}}\nETA: {{eta}} דקות',
        category: 'status',
        createdAt: new Date()
      },
      {
        _id: '5',
        name: 'ביטול נסיעה',
        content: 'נסיעה #{{rideNumber}} בוטלה.\nסיבה: {{reason}}\nצריך עזרה? צור קשר: {{supportPhone}}',
        category: 'cancellation',
        createdAt: new Date()
      }
    ];
    
    res.json(templates);
    
  } catch (error) {
    logger.error('Error fetching templates:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/messages/history
router.get("/history", authenticateToken, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const messages = await Activity.find({
      type: { $in: ['customer', 'system'] },
      message: { $regex: /שלח|נשלח|הודעה/i }
    })
      .sort('-timestamp')
      .limit(parseInt(limit));
    
    const formattedMessages = messages.map(msg => ({
      _id: msg._id,
      sentAt: msg.timestamp,
      recipient: {
        name: msg.details || 'לא צוין',
        phone: ''
      },
      content: msg.message,
      status: 'sent',
      error: null
    }));
    
    res.json(formattedMessages);
    
  } catch (error) {
    logger.error('Error fetching messages history:', error);
    res.status(500).json({ error: error.message });
  }
});


// POST /api/messages/send
router.post("/send", authenticateToken, async (req, res) => {
  try {
    const { recipients, message, templateId } = req.body;
    
    if (!recipients || !recipients.length) {
      return res.status(400).json({ error: 'No recipients provided' });
    }
    
    if (!message) {
      return res.status(400).json({ error: 'No message provided' });
    }
    
    const results = {
      success: recipients.length,
      failed: 0,
      details: recipients.map(r => ({
        phone: r,
        status: 'sent'
      }))
    };
    
    await Activity.create({
      timestamp: new Date(),
      message: `נשלחו ${recipients.length} הודעות`,
      type: 'system',
      emoji: '📨',
      details: message.substring(0, 100),
      user: req.user?.username || 'admin'
    });
    
    res.json(results);
    
  } catch (error) {
    logger.error('Error sending messages:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/messages/templates
router.get("/templates", authenticateToken, async (req, res) => {
  try {
    const templates = [
      {
        _id: '1',
        name: 'ברוכים הבאים',
        content: 'שלום {{name}}, ברוך הבא למערכת המוניות! 🚖',
        category: 'general'
      },
      {
        _id: '2',
        name: 'תזכורת נסיעה',
        content: 'היי {{name}}! הנסיעה שלך מתוזמנת ל-{{time}}.',
        category: 'reminder'
      },
      {
        _id: '3',
        name: 'תודה על הנסיעה',
        content: 'תודה {{name}} על השימוש בשירות! 🙏',
        category: 'thanks'
      }
    ];
    
    res.json(templates);
    
  } catch (error) {
    logger.error('Error fetching templates:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/messages/history
router.get("/history", authenticateToken, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const messages = await Activity.find({
      type: { $in: ['customer', 'system'] },
      message: { $regex: /שלח|נשלח|הודעה/i }
    })
      .sort('-timestamp')
      .limit(parseInt(limit));
    
    const formatted = messages.map(msg => ({
      _id: msg._id,
      sentAt: msg.timestamp,
      recipient: { name: msg.details || 'לא צוין' },
      content: msg.message,
      status: 'sent'
    }));
    
    res.json(formatted);
    
  } catch (error) {
    logger.error('Error fetching messages:', error);
    res.status(500).json({ error: error.message });
  }
});


// POST /api/messages/send
router.post("/send", authenticateToken, async (req, res) => {
  try {
    const { recipients, message } = req.body;
    
    if (!recipients || !recipients.length) {
      return res.status(400).json({ error: 'אין נמענים' });
    }
    
    // כאן תוסיף שליחה אמיתית
    await Activity.create({
      timestamp: new Date(),
      message: `נשלחו ${recipients.length} הודעות`,
      type: 'system',
      emoji: '📨',
      user: req.user?.username || 'admin'
    });
    
    res.json({
      success: recipients.length,
      failed: 0
    });
    
  } catch (error) {
    logger.error('Error sending messages:', error);
    res.status(500).json({ error: error.message });
  }
});


export default router;
