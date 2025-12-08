// ===============================================
// 🔌 WEBSOCKETS - Real-time Updates with Socket.IO
// ===============================================

import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import logger from './logger.js';
import config from '../config/index.js';

let io = null;
const connectedClients = new Map();

// ===============================================
// 🔐 AUTHENTICATION MIDDLEWARE
// ===============================================

function authenticateSocket(socket, next) {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  
  if (!token) {
    logger.warn('Socket connection rejected - no token', {
      socketId: socket.id
    });
    return next(new Error('Authentication required'));
  }
  
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return next(new Error('Token expired'));
    }
    
    socket.user = decoded;
    
    logger.info('Socket authenticated', {
      socketId: socket.id,
      user: decoded.user,
      role: decoded.role
    });
    
    next();
  } catch (err) {
    logger.error('Socket authentication failed', {
      socketId: socket.id,
      error: err.message
    });
    next(new Error('Invalid token'));
  }
}

// ===============================================
// 🚀 SETUP SOCKET.IO
// ===============================================

export function setupWebSockets(httpServer) {
  const allowedOrigins = config.cors.origins || ['http://localhost:3000', 'http://localhost:5500'];
  
  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
  });
  
  // Authentication middleware
  io.use(authenticateSocket);
  
  // Connection handler
  io.on('connection', (socket) => {
    handleConnection(socket);
  });
  
  logger.success('✅ WebSocket server initialized');
  
  return io;
}

// ===============================================
// 🔗 CONNECTION HANDLER
// ===============================================

function handleConnection(socket) {
  const { user, role } = socket.user;
  
  logger.info('Client connected', {
    socketId: socket.id,
    user,
    role,
    transport: socket.conn.transport.name
  });
  
  // Store client
  connectedClients.set(socket.id, {
    user,
    role,
    connectedAt: new Date(),
    rooms: new Set()
  });
  
  // Join user-specific room
  socket.join(`user:${user}`);
  
  // Join role-specific room
  socket.join(`role:${role}`);
  
  // Send connection success
  socket.emit('connected', {
    socketId: socket.id,
    user,
    role,
    timestamp: new Date().toISOString()
  });
  
  // Subscribe to ride updates
  socket.on('subscribe:ride', (rideId) => {
    socket.join(`ride:${rideId}`);
    logger.debug('Client subscribed to ride', { socketId: socket.id, rideId });
    socket.emit('subscribed', { type: 'ride', id: rideId });
  });
  
  // Subscribe to driver updates
  socket.on('subscribe:driver', (driverId) => {
    socket.join(`driver:${driverId}`);
    logger.debug('Client subscribed to driver', { socketId: socket.id, driverId });
    socket.emit('subscribed', { type: 'driver', id: driverId });
  });
  
  // Subscribe to all rides (admin only)
  socket.on('subscribe:all_rides', () => {
    if (role === 'admin') {
      socket.join('all_rides');
      logger.debug('Admin subscribed to all rides', { socketId: socket.id });
      socket.emit('subscribed', { type: 'all_rides' });
    } else {
      socket.emit('error', { message: 'Unauthorized' });
    }
  });
  
  // Unsubscribe
  socket.on('unsubscribe', ({ type, id }) => {
    const room = id ? `${type}:${id}` : type;
    socket.leave(room);
    logger.debug('Client unsubscribed', { socketId: socket.id, room });
    socket.emit('unsubscribed', { type, id });
  });
  
  // Ping-pong
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });
  
  // Disconnect handler
  socket.on('disconnect', (reason) => {
    logger.info('Client disconnected', {
      socketId: socket.id,
      user,
      reason
    });
    
    connectedClients.delete(socket.id);
  });
  
  // Error handler
  socket.on('error', (err) => {
    logger.error('Socket error', {
      socketId: socket.id,
      error: err.message
    });
  });
}

// ===============================================
// 📡 EMIT EVENTS
// ===============================================

export function emitRideUpdate(rideId, data) {
  if (!io) return;
  
  io.to(`ride:${rideId}`).emit('ride:updated', {
    rideId,
    ...data,
    timestamp: new Date().toISOString()
  });
  
  io.to('all_rides').emit('ride:updated', {
    rideId,
    ...data,
    timestamp: new Date().toISOString()
  });
  
  logger.debug('Ride update emitted', { rideId, event: data.event });
}

export function emitNewRide(ride) {
  if (!io) return;
  
  io.to('all_rides').emit('ride:new', {
    ride,
    timestamp: new Date().toISOString()
  });
  
  logger.debug('New ride notification sent', { rideId: ride._id });
}

export function emitDriverUpdate(driverId, data) {
  if (!io) return;
  
  io.to(`driver:${driverId}`).emit('driver:updated', {
    driverId,
    ...data,
    timestamp: new Date().toISOString()
  });
  
  logger.debug('Driver update emitted', { driverId });
}

export function emitSystemNotification(message, level = 'info') {
  if (!io) return;
  
  io.to('role:admin').emit('system:notification', {
    message,
    level,
    timestamp: new Date().toISOString()
  });
  
  logger.debug('System notification sent', { message, level });
}

export function emitUserNotification(userId, notification) {
  if (!io) return;
  
  io.to(`user:${userId}`).emit('notification', {
    ...notification,
    timestamp: new Date().toISOString()
  });
  
  logger.debug('User notification sent', { userId });
}

// ===============================================
// 📊 STATISTICS
// ===============================================

export function getWebSocketStats() {
  if (!io) {
    return {
      enabled: false,
      clients: 0
    };
  }
  
  const rooms = Array.from(io.sockets.adapter.rooms.keys());
  const sockets = Array.from(io.sockets.sockets.keys());
  
  const clientsByRole = {};
  connectedClients.forEach(client => {
    clientsByRole[client.role] = (clientsByRole[client.role] || 0) + 1;
  });
  
  return {
    enabled: true,
    totalClients: connectedClients.size,
    connectedSockets: sockets.length,
    rooms: rooms.length,
    clientsByRole,
    transports: {
      websocket: Array.from(io.sockets.sockets.values())
        .filter(s => s.conn.transport.name === 'websocket').length,
      polling: Array.from(io.sockets.sockets.values())
        .filter(s => s.conn.transport.name === 'polling').length
    }
  };
}

// ===============================================
// 🧹 CLEANUP
// ===============================================

export function closeWebSockets() {
  if (io) {
    io.close();
    connectedClients.clear();
    logger.info('WebSocket server closed');
  }
}

export default {
  setupWebSockets,
  emitRideUpdate,
  emitNewRide,
  emitDriverUpdate,
  emitSystemNotification,
  emitUserNotification,
  getWebSocketStats,
  closeWebSockets
};
