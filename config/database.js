// ============================================================
// DATABASE CONFIGURATION
// Extracted from server.js
// ============================================================

import mongoose from 'mongoose';
import logger from '../utils/logger.js';

export async function connectDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }
    
    await mongoose.connect(mongoUri, {
      // Modern mongoose doesn't need these options anymore
      // but keeping them for compatibility
    });
    
    logger.success('✅ MongoDB connected successfully');
    
    // Log database name
    const dbName = mongoose.connection.name;
    logger.info(`Database: ${dbName}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      logger.success('MongoDB reconnected');
    });
    
  } catch (error) {
    logger.error('❌ MongoDB connection failed:', error);
    throw error;
  }
}

export async function disconnectDatabase() {
  try {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  } catch (error) {
    logger.error('Error disconnecting from MongoDB:', error);
    throw error;
  }
}
