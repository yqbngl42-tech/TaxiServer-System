import express from 'express';
import { Campaign } from '../models/index.js';
import { authenticateToken } from '../middlewares/auth.js';
import { requirePermission } from '../middlewares/rbac.js';

const router = express.Router();

// GET /api/campaigns - רשימת כל הקמפיינים
router.get('/', authenticateToken, requirePermission('admin'), async (req, res) => {
  try {
    const campaigns = await Campaign.find().sort({ createdAt: -1 });
    res.json({ ok: true, campaigns });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/campaigns - יצירת קמפיין חדש
router.post('/', authenticateToken, requirePermission('admin'), async (req, res) => {
  try {
    const campaign = new Campaign(req.body);
    await campaign.save();
    res.json({ ok: true, campaign });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/campaigns/:id - קמפיין ספציפי
router.get('/:id', authenticateToken, requirePermission('admin'), async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ ok: false, error: 'Campaign not found' });
    }
    res.json({ ok: true, campaign });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
