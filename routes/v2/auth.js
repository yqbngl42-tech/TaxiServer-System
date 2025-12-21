import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = express.Router();

// POST /api/v2/auth/login
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'MISSING_PASSWORD',
          message: 'נא להזין סיסמה'
        }
      });
    }
    
    const passwordHash = process.env.ADMIN_PASSWORD_HASH;
    const isValid = await bcrypt.compare(password, passwordHash);
    
    if (!isValid) {
      return res.status(401).json({
        ok: false,
        error: {
          code: 'INVALID_PASSWORD',
          message: 'סיסמה שגויה'
        }
      });
    }
    
    const token = jwt.sign(
      { user: 'admin', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      ok: true,
      data: {
        token,
        user: { id: 'admin', role: 'admin' }
      }
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: {
        code: 'SERVER_ERROR',
        message: err.message
      }
    });
  }
});

// GET /api/v2/auth/me
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    ok: true,
    data: {
      user: { id: req.user.user, role: req.user.role }
    }
  });
});

// POST /api/v2/auth/logout
router.post('/logout', authenticateToken, (req, res) => {
  res.json({
    ok: true,
    data: {}
  });
});

// Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      ok: false,
      error: { code: 'NO_TOKEN', message: 'אין token' }
    });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({
      ok: false,
      error: { code: 'INVALID_TOKEN', message: 'token לא תקין' }
    });
  }
}

export { authenticateToken };
export default router;
