// middlewares/auth.js

export const authenticateAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      ok: false,
      error: 'גישה נדחתה. רק אדמינים מורשים.'
    });
  }

  next();
};