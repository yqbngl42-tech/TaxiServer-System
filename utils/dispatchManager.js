// ===============================================
// 🧠 DISPATCH MANAGER - Smart Routing System
// ===============================================
// המוח המרכזי שמחליט איך לשלוח נסיעות:
// - נסיון ראשון: בוט (whatsapp-web.js)
// - אם נכשל: Twilio (fallback)
// - מעקב אחר ביצועים והחלפה אוטומטית

import logger from './logger.js';
import config from '../config/index.js';

class DispatchManager {
  constructor() {
    // ===============================================
    // 🎛️ CONFIGURATION
    // ===============================================
    this.mode = process.env.DISPATCH_MODE || 'auto';  // auto | bot-only | twilio-only
    this.maxBotFailures = parseInt(process.env.MAX_BOT_FAILURES || '3');
    this.maxTwilioFailures = parseInt(process.env.MAX_TWILIO_FAILURES || '3');
    this.healthCheckInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'); // 30s
    
    // ===============================================
    // 📊 STATE TRACKING
    // ===============================================
    this.botStatus = 'unknown';  // unknown | online | offline
    this.twilioStatus = 'unknown';
    this.consecutiveBotFailures = 0;
    this.consecutiveTwilioFailures = 0;
    this.lastBotCheck = null;
    this.lastTwilioCheck = null;
    
    // ===============================================
    // 📈 STATISTICS
    // ===============================================
    this.stats = {
      bot: {
        totalAttempts: 0,
        successful: 0,
        failed: 0,
        lastSuccess: null,
        lastFailure: null,
        averageResponseTime: 0
      },
      twilio: {
        totalAttempts: 0,
        successful: 0,
        failed: 0,
        lastSuccess: null,
        lastFailure: null,
        averageResponseTime: 0
      },
      total: {
        ridesDispatched: 0,
        failedDispatches: 0
      }
    };
    
    // ===============================================
    // 🔧 HANDLERS
    // ===============================================
    this.sendViaBotHandler = null;
    this.sendViaTwilioHandler = null;
    this.botHealthCheckHandler = null;
    this.twilioHealthCheckHandler = null;
    
    // ===============================================
    // ⏰ AUTO HEALTH CHECKS
    // ===============================================
    this.healthCheckTimer = null;
    
    logger.info('🧠 DispatchManager initialized', {
      mode: this.mode,
      maxBotFailures: this.maxBotFailures,
      maxTwilioFailures: this.maxTwilioFailures
    });
  }

  // ===============================================
  // 🎯 MAIN DISPATCH FUNCTION
  // ===============================================
  
  /**
   * שלח נסיעה - הפונקציה המרכזית
   * @param {Object} ride - אובייקט הנסיעה
   * @returns {Promise<Object>} - תוצאה: { method, success, error }
   */
  async sendRide(ride) {
    const startTime = Date.now();
    
    logger.info('📤 Dispatching ride...', {
      rideNumber: ride.rideNumber,
      mode: this.mode,
      botStatus: this.botStatus
    });

    let result = null;
    let error = null;

    // ===============================================
    // 🤖 TRY BOT FIRST (if applicable)
    // ===============================================
    if (this.shouldTryBot()) {
      try {
        logger.info('🤖 Attempting dispatch via Bot...');
        const botResult = await this._sendViaBot(ride);
        
        const responseTime = Date.now() - startTime;
        this._recordBotSuccess(responseTime);
        
        result = {
          method: 'bot',
          success: true,
          responseTime,
          details: botResult
        };
        
        logger.success('✅ Ride dispatched via Bot', {
          rideNumber: ride.rideNumber,
          responseTime: `${responseTime}ms`
        });
        
        return result;
        
      } catch (err) {
        error = err;
        this._recordBotFailure(err);
        
        logger.warn('⚠️ Bot dispatch failed', {
          rideNumber: ride.rideNumber,
          error: err.message,
          consecutiveFailures: this.consecutiveBotFailures
        });
        
        // אם הגענו למקסימום כישלונות - עבור ל-Twilio mode
        if (this.consecutiveBotFailures >= this.maxBotFailures) {
          this._switchToTwilioMode();
        }
      }
    }

    // ===============================================
    // 📞 TRY TWILIO (if bot failed or twilio-only mode)
    // ===============================================
    if (this.shouldTryTwilio()) {
      try {
        logger.info('📞 Attempting dispatch via Twilio...');
        const twilioResult = await this._sendViaTwilio(ride);
        
        const responseTime = Date.now() - startTime;
        this._recordTwilioSuccess(responseTime);
        
        result = {
          method: 'twilio',
          success: true,
          responseTime,
          details: twilioResult,
          fallback: error ? true : false
        };
        
        logger.success('✅ Ride dispatched via Twilio', {
          rideNumber: ride.rideNumber,
          responseTime: `${responseTime}ms`,
          fallback: error ? 'yes' : 'no'
        });
        
        return result;
        
      } catch (err) {
        this._recordTwilioFailure(err);
        
        logger.error('❌ Twilio dispatch failed', {
          rideNumber: ride.rideNumber,
          error: err.message,
          consecutiveFailures: this.consecutiveTwilioFailures
        });
        
        // שני הערוצים נכשלו!
        this.stats.total.failedDispatches++;
        
        throw new Error(
          `Both dispatch methods failed. Bot: ${error?.message || 'N/A'}, Twilio: ${err.message}`
        );
      }
    }

    // אם הגענו לכאן - אין אפשרות לשלוח
    this.stats.total.failedDispatches++;
    throw new Error('No dispatch method available');
  }

  // ===============================================
  // 🤖 BOT DISPATCH
  // ===============================================
  
  async _sendViaBot(ride) {
    if (!this.sendViaBotHandler) {
      throw new Error('Bot handler not configured');
    }
    
    this.stats.bot.totalAttempts++;
    return await this.sendViaBotHandler(ride);
  }

  // ===============================================
  // 📞 TWILIO DISPATCH
  // ===============================================
  
  async _sendViaTwilio(ride) {
    if (!this.sendViaTwilioHandler) {
      throw new Error('Twilio handler not configured');
    }
    
    this.stats.twilio.totalAttempts++;
    return await this.sendViaTwilioHandler(ride);
  }

  // ===============================================
  // 🎯 DECISION LOGIC
  // ===============================================
  
  shouldTryBot() {
    // אם bot-only mode - תמיד נסה
    if (this.mode === 'bot-only') {
      return true;
    }
    
    // אם twilio-only mode - אל תנסה
    if (this.mode === 'twilio-only') {
      return false;
    }
    
    // במצב auto - נסה רק אם הבוט לא offline
    return this.mode === 'auto' && this.botStatus !== 'offline';
  }

  shouldTryTwilio() {
    // אם twilio-only mode - תמיד נסה
    if (this.mode === 'twilio-only') {
      return true;
    }
    
    // אם bot-only mode - אל תנסה
    if (this.mode === 'bot-only') {
      return false;
    }
    
    // במצב auto - נסה כ-fallback
    return this.mode === 'auto';
  }

  // ===============================================
  // 📊 STATISTICS TRACKING
  // ===============================================
  
  _recordBotSuccess(responseTime) {
    this.stats.bot.successful++;
    this.stats.bot.lastSuccess = new Date();
    this.consecutiveBotFailures = 0;
    this.botStatus = 'online';
    
    // עדכן ממוצע זמן תגובה
    const total = this.stats.bot.averageResponseTime * (this.stats.bot.successful - 1);
    this.stats.bot.averageResponseTime = (total + responseTime) / this.stats.bot.successful;
    
    this.stats.total.ridesDispatched++;
  }

  _recordBotFailure(error) {
    this.stats.bot.failed++;
    this.stats.bot.lastFailure = new Date();
    this.consecutiveBotFailures++;
    this.botStatus = 'offline';
  }

  _recordTwilioSuccess(responseTime) {
    this.stats.twilio.successful++;
    this.stats.twilio.lastSuccess = new Date();
    this.consecutiveTwilioFailures = 0;
    this.twilioStatus = 'online';
    
    // עדכן ממוצע זמן תגובה
    const total = this.stats.twilio.averageResponseTime * (this.stats.twilio.successful - 1);
    this.stats.twilio.averageResponseTime = (total + responseTime) / this.stats.twilio.successful;
    
    this.stats.total.ridesDispatched++;
  }

  _recordTwilioFailure(error) {
    this.stats.twilio.failed++;
    this.stats.twilio.lastFailure = new Date();
    this.consecutiveTwilioFailures++;
    this.twilioStatus = 'offline';
  }

  // ===============================================
  // 🔄 MODE SWITCHING
  // ===============================================
  
  _switchToTwilioMode() {
    logger.warn('🔄 Auto-switching to Twilio mode', {
      reason: 'Bot consecutive failures exceeded limit',
      failures: this.consecutiveBotFailures,
      limit: this.maxBotFailures
    });
    
    this.mode = 'twilio-only';
    this.botStatus = 'offline';
  }

  switchMode(newMode) {
    const validModes = ['auto', 'bot-only', 'twilio-only'];
    
    if (!validModes.includes(newMode)) {
      throw new Error(`Invalid mode: ${newMode}. Must be one of: ${validModes.join(', ')}`);
    }
    
    const oldMode = this.mode;
    this.mode = newMode;
    
    // אפס את מונה הכישלונות
    this.consecutiveBotFailures = 0;
    this.consecutiveTwilioFailures = 0;
    
    logger.info('🔄 Dispatch mode changed', {
      from: oldMode,
      to: newMode
    });
    
    return {
      oldMode,
      newMode,
      timestamp: new Date()
    };
  }

  // ===============================================
  // 🏥 HEALTH CHECKS
  // ===============================================
  
  async checkBotHealth() {
    if (!this.botHealthCheckHandler) {
      logger.warn('Bot health check handler not configured');
      return false;
    }
    
    try {
      const isHealthy = await this.botHealthCheckHandler();
      this.lastBotCheck = new Date();
      
      if (isHealthy) {
        this.botStatus = 'online';
        
        // אם הבוט חזר והיינו ב-twilio-only, חזור ל-auto
        if (this.mode === 'twilio-only') {
          logger.info('🔄 Bot is back online, switching to auto mode');
          this.mode = 'auto';
          this.consecutiveBotFailures = 0;
        }
      } else {
        this.botStatus = 'offline';
      }
      
      return isHealthy;
      
    } catch (err) {
      logger.error('Bot health check failed', { error: err.message });
      this.botStatus = 'offline';
      this.lastBotCheck = new Date();
      return false;
    }
  }

  async checkTwilioHealth() {
    if (!this.twilioHealthCheckHandler) {
      logger.warn('Twilio health check handler not configured');
      return false;
    }
    
    try {
      const isHealthy = await this.twilioHealthCheckHandler();
      this.lastTwilioCheck = new Date();
      this.twilioStatus = isHealthy ? 'online' : 'offline';
      return isHealthy;
      
    } catch (err) {
      logger.error('Twilio health check failed', { error: err.message });
      this.twilioStatus = 'offline';
      this.lastTwilioCheck = new Date();
      return false;
    }
  }

  startAutoHealthChecks() {
    if (this.healthCheckTimer) {
      logger.warn('Health checks already running');
      return;
    }
    
    logger.info('🏥 Starting auto health checks', {
      interval: `${this.healthCheckInterval}ms`
    });
    
    this.healthCheckTimer = setInterval(async () => {
      logger.debug('Running health checks...');
      
      await this.checkBotHealth();
      await this.checkTwilioHealth();
      
      logger.debug('Health check complete', {
        bot: this.botStatus,
        twilio: this.twilioStatus
      });
    }, this.healthCheckInterval);
  }

  stopAutoHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      logger.info('🏥 Auto health checks stopped');
    }
  }

  // ===============================================
  // ⚙️ CONFIGURATION
  // ===============================================
  
  /**
   * הגדר handler לשליחה דרך בוט
   */
  setBotHandler(handler) {
    this.sendViaBotHandler = handler;
    logger.debug('Bot dispatch handler configured');
  }

  /**
   * הגדר handler לשליחה דרך Twilio
   */
  setTwilioHandler(handler) {
    this.sendViaTwilioHandler = handler;
    logger.debug('Twilio dispatch handler configured');
  }

  /**
   * הגדר handler לבדיקת בריאות הבוט
   */
  setBotHealthCheck(handler) {
    this.botHealthCheckHandler = handler;
    logger.debug('Bot health check handler configured');
  }

  /**
   * הגדר handler לבדיקת בריאות Twilio
   */
  setTwilioHealthCheck(handler) {
    this.twilioHealthCheckHandler = handler;
    logger.debug('Twilio health check handler configured');
  }

  // ===============================================
  // 📊 STATUS & STATISTICS
  // ===============================================
  
  getStatus() {
    return {
      mode: this.mode,
      botStatus: this.botStatus,
      twilioStatus: this.twilioStatus,
      consecutiveBotFailures: this.consecutiveBotFailures,
      consecutiveTwilioFailures: this.consecutiveTwilioFailures,
      lastBotCheck: this.lastBotCheck,
      lastTwilioCheck: this.lastTwilioCheck,
      healthChecksRunning: this.healthCheckTimer !== null
    };
  }

  getStats() {
    return {
      ...this.stats,
      successRate: {
        bot: this.stats.bot.totalAttempts > 0
          ? (this.stats.bot.successful / this.stats.bot.totalAttempts * 100).toFixed(2) + '%'
          : 'N/A',
        twilio: this.stats.twilio.totalAttempts > 0
          ? (this.stats.twilio.successful / this.stats.twilio.totalAttempts * 100).toFixed(2) + '%'
          : 'N/A',
        total: this.stats.total.ridesDispatched > 0
          ? ((this.stats.total.ridesDispatched / (this.stats.total.ridesDispatched + this.stats.total.failedDispatches)) * 100).toFixed(2) + '%'
          : 'N/A'
      }
    };
  }

  getFullReport() {
    return {
      status: this.getStatus(),
      stats: this.getStats(),
      config: {
        maxBotFailures: this.maxBotFailures,
        maxTwilioFailures: this.maxTwilioFailures,
        healthCheckInterval: this.healthCheckInterval
      }
    };
  }

  // ===============================================
  // 🔄 RESET
  // ===============================================
  
  resetStats() {
    this.stats = {
      bot: {
        totalAttempts: 0,
        successful: 0,
        failed: 0,
        lastSuccess: null,
        lastFailure: null,
        averageResponseTime: 0
      },
      twilio: {
        totalAttempts: 0,
        successful: 0,
        failed: 0,
        lastSuccess: null,
        lastFailure: null,
        averageResponseTime: 0
      },
      total: {
        ridesDispatched: 0,
        failedDispatches: 0
      }
    };
    
    this.consecutiveBotFailures = 0;
    this.consecutiveTwilioFailures = 0;
    
    logger.info('📊 Statistics reset');
  }
}

// ===============================================
// 📤 EXPORT SINGLETON
// ===============================================

const dispatchManager = new DispatchManager();

export default dispatchManager;
