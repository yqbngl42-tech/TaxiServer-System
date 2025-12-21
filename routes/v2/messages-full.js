import express from 'express';
import { authenticateToken } from './auth-enhanced.js';
import { requirePermission } from '../../middleware/rbac.js';
import MessageTemplate from '../../models/MessageTemplate.js';
import MessageLog from '../../models/MessageLog.js';
import Campaign from '../../models/Campaign.js';
import Driver from '../../models/Driver.js';

const router = express.Router();

// ===============================================
// TEMPLATES
// ===============================================
router.get('/templates', authenticateToken, requirePermission('messages:read'), async (req, res) => {
  try {
    const templates = await MessageTemplate.find({ isActive: true }).sort({ name: 1 });
    res.json({ ok: true, data: { items: templates } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

router.post('/templates', authenticateToken, requirePermission('messages:send'), async (req, res) => {
  try {
    const { name, text, variables, category } = req.body;
    
    const template = await MessageTemplate.create({
      name,
      text,
      variables: variables || [],
      category: category || 'general',
      createdBy: req.user.username
    });
    
    res.json({ ok: true, data: { template } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

router.put('/templates/:id', authenticateToken, requirePermission('messages:send'), async (req, res) => {
  try {
    const updates = req.body;
    updates.updatedAt = new Date();
    
    const template = await MessageTemplate.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    );
    
    if (!template) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'תבנית לא נמצאה' }
      });
    }
    
    res.json({ ok: true, data: { template } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

router.delete('/templates/:id', authenticateToken, requirePermission('messages:send'), async (req, res) => {
  try {
    await MessageTemplate.findByIdAndDelete(req.params.id);
    res.json({ ok: true, data: {} });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// SEND MESSAGES
// ===============================================
router.post('/send-single', authenticateToken, requirePermission('messages:send'), async (req, res) => {
  try {
    const { to, templateId, variables } = req.body;
    
    let text = req.body.text;
    
    if (templateId) {
      const template = await MessageTemplate.findById(templateId);
      if (template) {
        text = template.text;
        // Replace variables
        Object.keys(variables || {}).forEach(key => {
          text = text.replace(`{${key}}`, variables[key]);
        });
      }
    }
    
    const log = await MessageLog.create({
      to,
      text,
      templateId,
      status: 'sent',
      sentAt: new Date()
    });
    
    // TODO: Actually send via WhatsApp API
    
    res.json({ ok: true, data: { sent: true, logId: log._id } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

router.post('/broadcast', authenticateToken, requirePermission('messages:send'), async (req, res) => {
  try {
    const { templateId, targetFilters, variables } = req.body;
    
    // Get template
    const template = await MessageTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({
        ok: false,
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'תבנית לא נמצאה' }
      });
    }
    
    // Get target audience
    const filter = {};
    if (targetFilters.region) filter['region.code'] = targetFilters.region;
    if (targetFilters.status !== undefined) filter.isActive = targetFilters.status === 'active';
    
    const drivers = await Driver.find(filter).select('phone name');
    
    // Send to all
    const logs = [];
    for (const driver of drivers) {
      let text = template.text;
      text = text.replace('{driverName}', driver.name);
      Object.keys(variables || {}).forEach(key => {
        text = text.replace(`{${key}}`, variables[key]);
      });
      
      const log = await MessageLog.create({
        to: driver.phone,
        text,
        templateId: template._id,
        templateName: template.name,
        status: 'sent',
        sentAt: new Date()
      });
      
      logs.push(log);
    }
    
    res.json({ ok: true, data: { sent: logs.length, logs } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

router.post('/schedule', authenticateToken, requirePermission('messages:send'), async (req, res) => {
  try {
    const { templateId, targetFilters, scheduledFor, variables } = req.body;
    
    const campaign = await Campaign.create({
      name: `Campaign ${new Date().toISOString()}`,
      message: {
        templateId,
        variables
      },
      targetAudience: {
        filters: targetFilters
      },
      scheduledFor: new Date(scheduledFor),
      status: 'scheduled',
      createdBy: req.user.username
    });
    
    res.json({ ok: true, data: { campaign } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// CAMPAIGNS
// ===============================================
router.get('/campaigns', authenticateToken, requirePermission('messages:read'), async (req, res) => {
  try {
    const campaigns = await Campaign.find().sort({ createdAt: -1 });
    res.json({ ok: true, data: { items: campaigns } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

router.post('/campaigns', authenticateToken, requirePermission('messages:send'), async (req, res) => {
  try {
    const campaign = await Campaign.create({
      ...req.body,
      createdBy: req.user.username
    });
    
    res.json({ ok: true, data: { campaign } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

router.put('/campaigns/:id', authenticateToken, requirePermission('messages:send'), async (req, res) => {
  try {
    const campaign = await Campaign.findByIdAndUpdate(
      req.params.id,
      { $set: { ...req.body, updatedAt: new Date() } },
      { new: true }
    );
    
    res.json({ ok: true, data: { campaign } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// HISTORY
// ===============================================
router.get('/history', authenticateToken, requirePermission('messages:read'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      MessageLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      MessageLog.countDocuments()
    ]);

    res.json({
      ok: true,
      data: {
        items: messages,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
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
