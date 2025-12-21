import express from 'express';
import { authenticateToken } from './auth.js';

const router = express.Router();

// POST /api/v2/messages/send
router.post('/send', authenticateToken, async (req, res) => {
  try {
    const { to, text } = req.body;
    
    if (!to || !text) {
      return res.status(400).json({
        ok: false,
        error: { code: 'MISSING_FIELDS', message: 'חסרים שדות' }
      });
    }
    
    // TODO: Implement actual message sending via bot/twilio
    const messageId = `msg_${Date.now()}`;
    
    res.json({
      ok: true,
      data: { messageId }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// GET /api/v2/messages/templates
router.get('/templates', authenticateToken, async (req, res) => {
  try {
    // TODO: Load from database or config
    const templates = [
      { id: '1', name: 'נסיעה חדשה', text: 'נסיעה חדשה זמינה...' },
      { id: '2', name: 'אישור נסיעה', text: 'הנסיעה אושרה...' }
    ];
    
    res.json({
      ok: true,
      data: { items: templates }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// GET /api/v2/messages/history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    
    // TODO: Load from database
    const items = [];
    const total = 0;
    
    res.json({
      ok: true,
      data: {
        items,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

export default router;
