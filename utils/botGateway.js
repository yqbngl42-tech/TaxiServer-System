// ===============================================
// 🤖 BOT GATEWAY - Central Bot Communication Hub
// ===============================================
// נקודת כניסה מרכזית לכל תקשורת עם WhatsApp Bot
// מנהל: שליחות, קבלות, retries, errors, logging

import fetch from 'node-fetch';
import logger from './logger.js';

class BotGateway {
  constructor() {
    // ===============================================
    // ⚙️ CONFIGURATION
    // ===============================================
    this.botUrl = process.env.BOT_URL || 'http://localhost:3001';
    this.timeout = parseInt(process.env.BOT_TIMEOUT) || 10000; // 10s
    this.maxRetries = parseInt(process.env.BOT_MAX_RETRIES) || 3;
    this.retryDelay = parseInt(process.env.BOT_RETRY_DELAY) || 2000; // 2s
    this.isEnabled = !!process.env.BOT_URL;

    // ===============================================
    // 📊 STATISTICS
    // ===============================================
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalRetries: 0,
      averageResponseTime: 0,
      lastRequest: null,
      lastSuccess: null,
      lastFailure: null,
    };

    logger.info('🤖 BotGateway initialized', {
      botUrl: this.botUrl,
      timeout: this.timeout,
      maxRetries: this.maxRetries,
      enabled: this.isEnabled,
    });
  }

  // ===============================================
  // 📤 OUTGOING - שליחות לבוט
  // ===============================================

  /**
   * שליחת נסיעה חדשה לבוט
   * @param {Object} ride - אובייקט הנסיעה
   * @returns {Promise<Object>} - תוצאה
   */
  async dispatch(ride) {
    logger.info('📤 Dispatching ride to bot', {
      rideNumber: ride.rideNumber,
    });

    const payload = {
      rideNumber: ride.rideNumber,
      pickup: ride.pickup,
      destination: ride.destination,
      price: ride.price,
      customerName: ride.customerName,
      customerPhone: ride.customerPhone,
      scheduledTime: ride.scheduledTime,
      notes: ride.notes,
      uniqueLink: ride.uniqueLink,
      _id: ride._id || ride.rideNumber,
    };

    return this._makeRequest('/dispatch', {
      method: 'POST',
      body: payload,
    });
  }

  /**
   * שליחת הודעה ישירה לנהג
   * @param {string} phone - מספר טלפון
   * @param {string} message - תוכן ההודעה
   * @returns {Promise<Object>}
   */
  async sendMessage(phone, message) {
    logger.info('📨 Sending message to driver', {
      phone,
      messageLength: message.length,
    });

    return this._makeRequest('/send-message', {
      method: 'POST',
      body: { phone, message },
    });
  }

  /**
   * שליחת התראת רישום (אישור/דחייה)
   * @param {Object} data - נתוני ההתראה
   * @returns {Promise<Object>}
   */
  async sendNotification(data) {
    const { phone, type, driverName, driverId, reason } = data;

    logger.info('🔔 Sending registration notification', {
      phone,
      type,
      driverName,
    });

    return this._makeRequest('/send-notification', {
      method: 'POST',
      body: { phone, type, driverName, driverId, reason },
    });
  }

  /**
   * שליחת הודעת בדיקה לקבוצה
   * @param {string} groupId - מזהה הקבוצה
   * @returns {Promise<Object>}
   */
  async sendTestMessage(groupId) {
    logger.info('🧪 Sending test message', { groupId });

    return this._makeRequest('/test-message', {
      method: 'POST',
      body: { groupId },
    });
  }

  // ===============================================
  // 📥 INCOMING - קבלות מהבוט
  // ===============================================

  /**
   * קבלת רשימת קבוצות WhatsApp
   * @returns {Promise<Array>}
   */
  async getGroups() {
    logger.info('📋 Fetching groups from bot');

    const result = await this._makeRequest('/groups', {
      method: 'GET',
    });

    return result.groups || [];
  }

  /**
   * קבלת סטטיסטיקות הבוט
   * @returns {Promise<Object>}
   */
  async getStats() {
    logger.info('📊 Fetching bot stats');

    return this._makeRequest('/stats', {
      method: 'GET',
    });
  }

  /**
   * בדיקת בריאות הבוט
   * @returns {Promise<boolean>}
   */
  async checkHealth() {
    try {
      const result = await this._makeRequest('/health', {
        method: 'GET',
        timeout: 5000, // shorter timeout for health checks
      });

      const isHealthy = result.ok && result.status === 'ready';

      logger.debug('🏥 Bot health check', {
        healthy: isHealthy,
        status: result.status,
        uptime: result.uptime,
      });

      return isHealthy;
    } catch (error) {
      logger.warn('⚠️ Bot health check failed', {
        error: error.message,
      });
      return false;
    }
  }

  // ===============================================
  // 🔧 INTERNAL - פונקציות פנימיות
  // ===============================================

  /**
   * ביצוע בקשה HTTP לבוט
   * @param {string} endpoint - נתיב ה-API
   * @param {Object} options - אפשרויות הבקשה
   * @returns {Promise<Object>}
   */
  async _makeRequest(endpoint, options = {}) {
    if (!this.isEnabled) {
      throw new Error('Bot is not enabled (BOT_URL not configured)');
    }

    const startTime = Date.now();
    this.stats.totalRequests++;
    this.stats.lastRequest = new Date();

    const url = `${this.botUrl}${endpoint}`;
    const method = options.method || 'GET';
    const timeout = options.timeout || this.timeout;

    logger.debug(`🔗 Bot request: ${method} ${endpoint}`);

    try {
      // ניסיון עם retries
      const result = await this._retry(
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          try {
            const fetchOptions = {
              method,
              headers: {
                'Content-Type': 'application/json',
                'X-Request-ID': this._generateRequestId(),
              },
              signal: controller.signal,
            };

            if (options.body && method !== 'GET') {
              fetchOptions.body = JSON.stringify(options.body);
            }

            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);

            // בדיקת HTTP status
            if (!response.ok) {
              const errorBody = await response.text();
              throw new Error(
                `Bot returned ${response.status}: ${errorBody}`
              );
            }

            const data = await response.json();
            return data;
          } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
              throw new Error(`Request timeout after ${timeout}ms`);
            }
            throw error;
          }
        },
        this.maxRetries,
        this.retryDelay
      );

      // עדכון סטטיסטיקות
      const responseTime = Date.now() - startTime;
      this._recordSuccess(responseTime);

      logger.success(`✅ Bot request successful: ${method} ${endpoint}`, {
        responseTime: `${responseTime}ms`,
      });

      return result;
    } catch (error) {
      this._recordFailure();

      logger.error(`❌ Bot request failed: ${method} ${endpoint}`, {
        error: error.message,
        endpoint,
        retries: this.stats.totalRetries,
      });

      throw new BotGatewayError(error.message, {
        endpoint,
        method,
        originalError: error,
      });
    }
  }

  /**
   * ביצוע פונקציה עם ניסיונות חוזרים
   * @param {Function} fn - הפונקציה לביצוע
   * @param {number} maxRetries - מספר ניסיונות מקסימלי
   * @param {number} delay - השהיה בין ניסיונות (ms)
   * @returns {Promise<*>}
   */
  async _retry(fn, maxRetries, delay) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt < maxRetries) {
          this.stats.totalRetries++;

          logger.warn(`🔄 Retry attempt ${attempt}/${maxRetries}`, {
            error: error.message,
            nextRetryIn: `${delay}ms`,
          });

          // Exponential backoff
          const waitTime = delay * Math.pow(2, attempt - 1);
          await this._sleep(waitTime);
        }
      }
    }

    throw lastError;
  }

  /**
   * המתנה (sleep)
   * @param {number} ms - מילישניות
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * יצירת Request ID ייחודי
   * @returns {string}
   */
  _generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * רישום בקשה מוצלחת
   * @param {number} responseTime - זמן תגובה (ms)
   */
  _recordSuccess(responseTime) {
    this.stats.successfulRequests++;
    this.stats.lastSuccess = new Date();

    // חישוב ממוצע זמן תגובה
    const total =
      this.stats.averageResponseTime * (this.stats.successfulRequests - 1);
    this.stats.averageResponseTime =
      (total + responseTime) / this.stats.successfulRequests;
  }

  /**
   * רישום בקשה כושלת
   */
  _recordFailure() {
    this.stats.failedRequests++;
    this.stats.lastFailure = new Date();
  }

  // ===============================================
  // 📊 STATUS & STATISTICS
  // ===============================================

  /**
   * קבלת סטטוס Gateway
   * @returns {Object}
   */
  getStatus() {
    return {
      enabled: this.isEnabled,
      botUrl: this.botUrl,
      timeout: this.timeout,
      maxRetries: this.maxRetries,
      stats: this.getStats(),
    };
  }

  /**
   * קבלת סטטיסטיקות
   * @returns {Object}
   */
  getStats() {
    const successRate =
      this.stats.totalRequests > 0
        ? (
            (this.stats.successfulRequests / this.stats.totalRequests) *
            100
          ).toFixed(2)
        : 0;

    return {
      ...this.stats,
      successRate: `${successRate}%`,
      averageResponseTime: Math.round(this.stats.averageResponseTime),
    };
  }

  /**
   * איפוס סטטיסטיקות
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalRetries: 0,
      averageResponseTime: 0,
      lastRequest: null,
      lastSuccess: null,
      lastFailure: null,
    };

    logger.info('📊 BotGateway stats reset');
  }

  // ===============================================
  // 🔧 CONFIGURATION
  // ===============================================

  /**
   * עדכון URL של הבוט
   * @param {string} newUrl
   */
  setBotUrl(newUrl) {
    this.botUrl = newUrl;
    this.isEnabled = !!newUrl;
    logger.info('🔧 Bot URL updated', { botUrl: newUrl });
  }

  /**
   * עדכון timeout
   * @param {number} ms
   */
  setTimeout(ms) {
    this.timeout = ms;
    logger.info('🔧 Timeout updated', { timeout: ms });
  }

  /**
   * עדכון מספר ניסיונות
   * @param {number} retries
   */
  setMaxRetries(retries) {
    this.maxRetries = retries;
    logger.info('🔧 Max retries updated', { maxRetries: retries });
  }
}

// ===============================================
// ❌ CUSTOM ERROR CLASS
// ===============================================

class BotGatewayError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'BotGatewayError';
    this.details = details;
    this.timestamp = new Date();
  }
}

// ===============================================
// 📤 EXPORT SINGLETON
// ===============================================

const botGateway = new BotGateway();

export default botGateway;
export { BotGatewayError };