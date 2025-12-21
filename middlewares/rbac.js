// Role-Based Access Control Middleware

const PERMISSIONS = {
  admin: [
    'users:create',
    'users:read',
    'users:update',
    'users:delete',
    'drivers:create',
    'drivers:read',
    'drivers:update',
    'drivers:delete',
    'drivers:block',
    'rides:create',
    'rides:read',
    'rides:update',
    'rides:delete',
    'rides:cancel',
    'payments:create',
    'payments:read',
    'payments:update',
    'payments:mark_paid',
    'registrations:read',
    'registrations:approve',
    'registrations:reject',
    'messages:send',
    'messages:read',
    'settings:read',
    'settings:update',
    'system:backup',
    'system:logs',
    'audit:read'
  ],
  manager: [
    'drivers:read',
    'drivers:update',
    'drivers:block',
    'rides:create',
    'rides:read',
    'rides:update',
    'rides:cancel',
    'payments:read',
    'payments:update',
    'registrations:read',
    'registrations:approve',
    'messages:send',
    'messages:read',
    'settings:read'
  ],
  viewer: [
    'drivers:read',
    'rides:read',
    'payments:read',
    'registrations:read',
    'messages:read'
  ]
};

export function requirePermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'לא מחובר' }
      });
    }

    const userRole = req.user.role || 'viewer';
    const userPermissions = PERMISSIONS[userRole] || [];

    const hasPermission = permissions.every(p => userPermissions.includes(p));

    if (!hasPermission) {
      return res.status(403).json({
        ok: false,
        error: { code: 'FORBIDDEN', message: 'אין הרשאה לפעולה זו' }
      });
    }

    next();
  };
}

export function hasPermission(role, permission) {
  const rolePermissions = PERMISSIONS[role] || [];
  return rolePermissions.includes(permission);
}

export { PERMISSIONS };
