// ===============================================
// 🔐 TWO-FACTOR AUTHENTICATION (2FA)
// ===============================================
// TOTP-based 2FA using Google Authenticator

import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import logger from './logger.js';

// ===============================================
// 🔧 2FA MANAGER
// ===============================================

class TwoFactorAuth {
  /**
   * Generate a new 2FA secret for a user
   */
  generateSecret(username, issuer = 'Taxi Management System') {
    try {
      const secret = speakeasy.generateSecret({
        name: `${issuer} (${username})`,
        issuer: issuer,
        length: 32
      });

      logger.info('2FA secret generated', { username });

      return {
        secret: secret.base32,
        otpauthUrl: secret.otpauth_url
      };
    } catch (error) {
      logger.error('Failed to generate 2FA secret', error);
      throw new Error('Failed to generate 2FA secret');
    }
  }

  /**
   * Generate QR code for 2FA setup
   */
  async generateQRCode(otpauthUrl) {
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
      logger.info('QR code generated');
      return qrCodeDataUrl;
    } catch (error) {
      logger.error('Failed to generate QR code', error);
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Verify a TOTP token
   */
  verifyToken(secret, token, window = 2) {
    try {
      // Remove any spaces or dashes from token
      const cleanToken = token.replace(/[\s-]/g, '');

      const verified = speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: cleanToken,
        window: window // Allow 2 time steps before/after
      });

      if (verified) {
        logger.info('2FA token verified successfully');
      } else {
        logger.warn('2FA token verification failed');
      }

      return verified;
    } catch (error) {
      logger.error('Failed to verify 2FA token', error);
      return false;
    }
  }

  /**
   * Generate backup codes for 2FA
   */
  generateBackupCodes(count = 10) {
    const codes = [];
    const crypto = require('crypto');

    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric code
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
    }

    logger.info('Backup codes generated', { count });
    return codes;
  }

  /**
   * Verify a backup code
   */
  verifyBackupCode(code, hashedCodes) {
    const bcrypt = require('bcryptjs');

    for (const hashedCode of hashedCodes) {
      if (bcrypt.compareSync(code.toUpperCase(), hashedCode)) {
        logger.info('Backup code verified successfully');
        return true;
      }
    }

    logger.warn('Backup code verification failed');
    return false;
  }

  /**
   * Hash backup codes for storage
   */
  async hashBackupCodes(codes) {
    const bcrypt = require('bcryptjs');
    const hashedCodes = [];

    for (const code of codes) {
      const hash = await bcrypt.hash(code.toUpperCase(), 10);
      hashedCodes.push(hash);
    }

    return hashedCodes;
  }

  /**
   * Check if 2FA is enabled for environment
   */
  isEnabled() {
    return process.env.ENABLE_2FA === 'true';
  }

  /**
   * Generate current TOTP token (for testing)
   */
  generateCurrentToken(secret) {
    return speakeasy.totp({
      secret: secret,
      encoding: 'base32'
    });
  }
}

// ===============================================
// 🗄️ 2FA USER MODEL EXTENSION
// ===============================================

/**
 * Schema fields to add to User/Admin model:
 * 
 * twoFactor: {
 *   enabled: { type: Boolean, default: false },
 *   secret: { type: String, default: null },
 *   backupCodes: [{ type: String }],
 *   lastVerified: { type: Date, default: null }
 * }
 */

// ===============================================
// 🚀 EXPORT SINGLETON
// ===============================================

const twoFactorAuth = new TwoFactorAuth();

console.log('✅ Two-Factor Authentication loaded');

export default twoFactorAuth;

// ===============================================
// 📝 USAGE EXAMPLES
// ===============================================

/**
 * SETUP 2FA (Admin endpoint):
 * 
 * app.post('/api/admin/2fa/setup', authenticateToken, async (req, res) => {
 *   try {
 *     // Generate secret
 *     const { secret, otpauthUrl } = twoFactorAuth.generateSecret('admin');
 *     
 *     // Generate QR code
 *     const qrCode = await twoFactorAuth.generateQRCode(otpauthUrl);
 *     
 *     // Generate backup codes
 *     const backupCodes = twoFactorAuth.generateBackupCodes();
 *     const hashedBackupCodes = await twoFactorAuth.hashBackupCodes(backupCodes);
 *     
 *     // Save to database (don't enable yet)
 *     await Admin.updateOne(
 *       { username: 'admin' },
 *       {
 *         'twoFactor.secret': secret,
 *         'twoFactor.backupCodes': hashedBackupCodes,
 *         'twoFactor.enabled': false // Will be enabled after verification
 *       }
 *     );
 *     
 *     res.json({
 *       ok: true,
 *       qrCode,
 *       backupCodes, // Show only once!
 *       secret // For manual entry
 *     });
 *   } catch (error) {
 *     res.status(500).json({ ok: false, error: error.message });
 *   }
 * });
 */

/**
 * VERIFY & ENABLE 2FA:
 * 
 * app.post('/api/admin/2fa/verify', authenticateToken, async (req, res) => {
 *   try {
 *     const { token } = req.body;
 *     
 *     const admin = await Admin.findOne({ username: 'admin' });
 *     
 *     if (!admin.twoFactor.secret) {
 *       return res.status(400).json({ ok: false, error: '2FA not set up' });
 *     }
 *     
 *     const verified = twoFactorAuth.verifyToken(admin.twoFactor.secret, token);
 *     
 *     if (verified) {
 *       // Enable 2FA
 *       await Admin.updateOne(
 *         { username: 'admin' },
 *         { 'twoFactor.enabled': true }
 *       );
 *       
 *       res.json({ ok: true, message: '2FA enabled successfully' });
 *     } else {
 *       res.status(400).json({ ok: false, error: 'Invalid token' });
 *     }
 *   } catch (error) {
 *     res.status(500).json({ ok: false, error: error.message });
 *   }
 * });
 */

/**
 * LOGIN WITH 2FA:
 * 
 * app.post('/api/login', async (req, res) => {
 *   try {
 *     const { password, twoFactorToken } = req.body;
 *     
 *     // Verify password first
 *     const isValidPassword = await bcrypt.compare(password, passwordHash);
 *     if (!isValidPassword) {
 *       return res.status(401).json({ ok: false, error: 'Invalid password' });
 *     }
 *     
 *     // Check if 2FA is enabled
 *     const admin = await Admin.findOne({ username: 'admin' });
 *     
 *     if (admin.twoFactor.enabled) {
 *       if (!twoFactorToken) {
 *         // First step: password correct, need 2FA
 *         return res.json({
 *           ok: false,
 *           requiresTwoFactor: true,
 *           message: 'Please enter your 2FA code'
 *         });
 *       }
 *       
 *       // Verify 2FA token
 *       const verified = twoFactorAuth.verifyToken(
 *         admin.twoFactor.secret,
 *         twoFactorToken
 *       );
 *       
 *       if (!verified) {
 *         return res.status(401).json({ ok: false, error: 'Invalid 2FA code' });
 *       }
 *       
 *       // Update last verified
 *       await Admin.updateOne(
 *         { username: 'admin' },
 *         { 'twoFactor.lastVerified': new Date() }
 *       );
 *     }
 *     
 *     // Generate tokens
 *     const accessToken = jwt.sign(...);
 *     const refreshToken = jwt.sign(...);
 *     
 *     res.json({ ok: true, accessToken, refreshToken });
 *   } catch (error) {
 *     res.status(500).json({ ok: false, error: error.message });
 *   }
 * });
 */

/**
 * DISABLE 2FA:
 * 
 * app.post('/api/admin/2fa/disable', authenticateToken, async (req, res) => {
 *   try {
 *     const { password, token } = req.body;
 *     
 *     // Verify password
 *     const isValid = await bcrypt.compare(password, passwordHash);
 *     if (!isValid) {
 *       return res.status(401).json({ ok: false, error: 'Invalid password' });
 *     }
 *     
 *     const admin = await Admin.findOne({ username: 'admin' });
 *     
 *     // Verify 2FA token
 *     const verified = twoFactorAuth.verifyToken(admin.twoFactor.secret, token);
 *     if (!verified) {
 *       return res.status(401).json({ ok: false, error: 'Invalid 2FA code' });
 *     }
 *     
 *     // Disable 2FA
 *     await Admin.updateOne(
 *       { username: 'admin' },
 *       {
 *         'twoFactor.enabled': false,
 *         'twoFactor.secret': null,
 *         'twoFactor.backupCodes': []
 *       }
 *     );
 *     
 *     res.json({ ok: true, message: '2FA disabled successfully' });
 *   } catch (error) {
 *     res.status(500).json({ ok: false, error: error.message });
 *   }
 * });
 */
