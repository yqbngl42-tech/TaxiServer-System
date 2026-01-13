import express from 'express';
import { MessageTemplate } from '../models/index.js';
import { authenticateToken } from '../middlewares/auth.js';
import { requirePermission } from '../middlewares/rbac.js';

const router = express.Router();

// GET /api/templates - רשימת תבניות פעילות
router.get('/', authenticateToken, requirePermission('admin'), async (req, res) => {
  try {
    const templates = await MessageTemplate.find({ isActive: true }).sort({ createdAt: -1 });
    res.json({ ok: true, templates });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/templates - יצירת תבנית חדשה
router.post('/', authenticateToken, requirePermission('admin'), async (req, res) => {
  try {
    const template = new MessageTemplate(req.body);
    await template.save();
    res.json({ ok: true, template });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/templates/:id - תבנית ספציפית
router.get('/:id', authenticateToken, requirePermission('admin'), async (req, res) => {
  try {
    const template = await MessageTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ ok: false, error: 'Template not found' });
    }
    res.json({ ok: true, template });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// PUT /api/templates/:id - עדכון תבנית
router.put('/:id', authenticateToken, requirePermission('admin'), async (req, res) => {
  try {
    const template = await MessageTemplate.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!template) {
      return res.status(404).json({ ok: false, error: 'Template not found' });
    }
    res.json({ ok: true, template });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;
