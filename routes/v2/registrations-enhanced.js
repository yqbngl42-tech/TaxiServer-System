import express from 'express';
import { authenticateToken } from './auth-enhanced.js';
import { requirePermission } from '../../middleware/rbac.js';
import Registration from '../../models/Registration.js';
import Driver from '../../models/Driver.js';
import AuditLog from '../../models/AuditLog.js';

const router = express.Router();

// ===============================================
// GET ALL REGISTRATIONS
// ===============================================
router.get('/', authenticateToken, requirePermission('registrations:read'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const [registrations, total] = await Promise.all([
      Registration.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Registration.countDocuments(filter)
    ]);

    res.json({
      ok: true,
      data: {
        items: registrations,
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
      error: { code: 'DATABASE_ERROR', message: err.message }
    });
  }
});

// ===============================================
// APPROVE REGISTRATION
// ===============================================
router.post('/:id/approve', authenticateToken, requirePermission('registrations:approve'), async (req, res) => {
  try {
    const registration = await Registration.findById(req.params.id);
    
    if (!registration) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'רישום לא נמצא' }
      });
    }

    // Create driver
    const driver = await Driver.create({
      name: registration.name,
      phone: registration.phone,
      idNumber: registration.idNumber,
      address: registration.address
    });

    // Update registration
    registration.status = 'approved';
    registration.approvedAt = new Date();
    registration.approvedBy = req.user.username;
    await registration.save();

    await AuditLog.create({
      userId: req.user.userId,
      username: req.user.username,
      action: 'registration_approved',
      details: { registrationId: registration._id, driverId: driver._id }
    });
    
    res.json({ ok: true, data: { driver } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// REJECT REGISTRATION
// ===============================================
router.post('/:id/reject', authenticateToken, requirePermission('registrations:reject'), async (req, res) => {
  try {
    const { reason } = req.body;
    
    const registration = await Registration.findById(req.params.id);
    
    if (!registration) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'רישום לא נמצא' }
      });
    }

    registration.status = 'rejected';
    registration.rejectionReason = reason;
    registration.rejectedAt = new Date();
    registration.rejectedBy = req.user.username;
    await registration.save();

    await AuditLog.create({
      userId: req.user.userId,
      username: req.user.username,
      action: 'registration_rejected',
      details: { registrationId: registration._id, reason }
    });
    
    res.json({ ok: true, data: {} });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// RESEND VERIFICATION CODE
// ===============================================
router.post('/:id/resend-code', authenticateToken, requirePermission('registrations:approve'), async (req, res) => {
  try {
    const registration = await Registration.findById(req.params.id);
    
    if (!registration) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'רישום לא נמצא' }
      });
    }

    // Generate new code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    registration.verificationCode = code;
    registration.verificationCodeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    registration.updatedAt = new Date();
    
    registration.attempts.push({
      type: 'phone_verification',
      status: 'success',
      details: { action: 'code_resent' }
    });
    
    await registration.save();
    
    // TODO: Send code via WhatsApp/SMS
    
    res.json({ ok: true, data: { sent: true } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// CLEAR SESSION
// ===============================================
router.delete('/:id/clear-session', authenticateToken, requirePermission('registrations:approve'), async (req, res) => {
  try {
    const registration = await Registration.findById(req.params.id);
    
    if (!registration) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'רישום לא נמצא' }
      });
    }

    registration.sessionData = null;
    registration.verificationCode = null;
    registration.verificationCodeExpires = null;
    registration.verificationAttempts = 0;
    registration.updatedAt = new Date();
    
    await registration.save();
    
    res.json({ ok: true, data: {} });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// GET ATTEMPTS
// ===============================================
router.get('/:id/attempts', authenticateToken, requirePermission('registrations:read'), async (req, res) => {
  try {
    const registration = await Registration.findById(req.params.id).select('attempts');
    
    if (!registration) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'רישום לא נמצא' }
      });
    }
    
    res.json({ ok: true, data: { items: registration.attempts.reverse() } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// VERIFY DOCUMENT
// ===============================================
router.post('/:id/verify-document', authenticateToken, requirePermission('registrations:approve'), async (req, res) => {
  try {
    const { docType } = req.body;
    
    const registration = await Registration.findById(req.params.id);
    
    if (!registration) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'רישום לא נמצא' }
      });
    }

    if (registration.documentsStatus[docType]) {
      registration.documentsStatus[docType].verified = true;
      registration.documentsStatus[docType].verifiedAt = new Date();
      registration.documentsStatus[docType].verifiedBy = req.user.username;
    }
    
    registration.updatedAt = new Date();
    await registration.save();
    
    res.json({ ok: true, data: { documentsStatus: registration.documentsStatus } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// CONVERSION STATISTICS
// ===============================================
router.get('/statistics/conversion', authenticateToken, requirePermission('registrations:read'), async (req, res) => {
  try {
    const total = await Registration.countDocuments();
    const approved = await Registration.countDocuments({ status: 'approved' });
    const rejected = await Registration.countDocuments({ status: 'rejected' });
    const pending = await Registration.countDocuments({ status: 'pending' });
    const stuck = await Registration.countDocuments({ status: 'stuck' });
    
    const conversionRate = total > 0 ? (approved / total * 100).toFixed(2) : 0;
    
    const avgTimeToComplete = await Registration.aggregate([
      { $match: { status: 'approved', 'conversionData.timeToComplete': { $exists: true } } },
      { $group: { _id: null, avg: { $avg: '$conversionData.timeToComplete' } } }
    ]);
    
    res.json({
      ok: true,
      data: {
        total,
        approved,
        rejected,
        pending,
        stuck,
        conversionRate: parseFloat(conversionRate),
        avgTimeToComplete: avgTimeToComplete[0]?.avg || 0
      }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// GET STUCK REGISTRATIONS
// ===============================================
router.get('/stuck', authenticateToken, requirePermission('registrations:read'), async (req, res) => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const stuck = await Registration.find({
      status: 'pending',
      lastActivityAt: { $lt: oneDayAgo }
    }).sort({ lastActivityAt: 1 });
    
    res.json({ ok: true, data: { items: stuck } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

// ===============================================
// SEND ALERT
// ===============================================
router.post('/:id/alert', authenticateToken, requirePermission('registrations:approve'), async (req, res) => {
  try {
    const registration = await Registration.findById(req.params.id);
    
    if (!registration) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'רישום לא נמצא' }
      });
    }

    // TODO: Send WhatsApp/SMS alert
    
    res.json({ ok: true, data: { sent: true } });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'SERVER_ERROR', message: err.message }
    });
  }
});

export default router;
