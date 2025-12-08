// middlewares/auth.js
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';

/**
 * Middleware לאימות JWT Token
 * בודק שיש token תקף ומוסיף את req.user
 * @param {Request} req 
 * @param {Response} res 
 * @param {NextFunction} next 
 */
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ 
      ok: false, 
      error: 'נדרש טוקן אימות' 
    });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return res.status(401).json({ 
        ok: false, 
        error: 'הטוקן פג תוקף' 
      });
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    logger.error("Token verification failed", { 
      error: err.message 
    });
    return res.status(403).json({ 
      ok: false, 
      error: 'טוקן לא תקין' 
    });
  }
};

/**
 * Middleware לאימות תפקיד אדמין
 * חייב לרוץ אחרי authenticateToken!
 * @param {Request} req 
 * @param {Response} res 
 * @param {NextFunction} next 
 */
export const authenticateAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      ok: false,
      error: 'גישה נדחתה. רק אדמינים מורשים.'
    });
  }
  next();
};

/**
 * Middleware לאימות תפקיד נהג
 * חייב לרוץ אחרי authenticateToken!
 * @param {Request} req 
 * @param {Response} res 
 * @param {NextFunction} next 
 */
export const authenticateDriver = (req, res, next) => {
  if (!req.user || req.user.role !== 'driver') {
    return res.status(403).json({
      ok: false,
      error: 'גישה נדחתה. רק נהגים מורשים.'
    });
  }
  next();
};

/**
 * Middleware כללי לבדיקת תפקידים מרובים
 * חייב לרוץ אחרי authenticateToken!
 * @param {...string} roles - רשימת תפקידים מורשים
 * @returns {Function} middleware function
 * 
 * @example
 * app.get('/api/route', authenticateToken, requireRole('admin', 'driver'), handler);
 */
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        ok: false,
        error: `גישה נדחתה. נדרש אחד מהתפקידים: ${roles.join(', ')}`
      });
    }
    next();
  };
};