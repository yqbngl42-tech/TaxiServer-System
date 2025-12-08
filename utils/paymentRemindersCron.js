import cron from 'node-cron';
import PendingPayment from '../models/PendingPayment.js';
import Driver from '../models/Driver.js';
import PaymentCodeGenerator from './paymentCodeGenerator.js';
import logger from './logger.js';

// ===============================================
// ⏰ PAYMENT REMINDERS CRON JOBS
// ===============================================
// תזכורות אוטומטיות לתשלומים ממתינים

class PaymentRemindersCron {
  constructor() {
    this.isRunning = false;
    this.jobs = [];
  }
  
  /**
   * התחלת כל ה-Cron Jobs
   */
  start() {
    if (this.isRunning) {
      logger.warn('⚠️ Payment reminders cron already running');
      return;
    }
    
    logger.info('⏰ Starting payment reminders cron jobs...');
    
    // Job 1: תזכורות (כל 5 דקות)
    const remindersJob = cron.schedule('*/5 * * * *', async () => {
      await this.sendReminders();
    });
    
    // Job 2: חסימות אוטומטיות (כל 10 דקות)
    const blockingJob = cron.schedule('*/10 * * * *', async () => {
      await this.autoBlockDrivers();
    });
    
    // Job 3: סימון תשלומים שפג תוקפם (כל שעה)
    const expiryJob = cron.schedule('0 * * * *', async () => {
      await this.markExpiredPayments();
    });
    
    this.jobs = [remindersJob, blockingJob, expiryJob];
    this.isRunning = true;
    
    logger.success('✅ Payment reminders cron jobs started');
  }
  
  /**
   * עצירת כל ה-Cron Jobs
   */
  stop() {
    if (!this.isRunning) {
      return;
    }
    
    logger.info('⏰ Stopping payment reminders cron jobs...');
    
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    this.isRunning = false;
    
    logger.success('✅ Payment reminders cron jobs stopped');
  }
  
  /**
   * שליחת תזכורות לתשלומים ממתינים
   */
  async sendReminders() {
    try {
      logger.debug('🔍 Checking for payments needing reminders...');
      
      const paymentsNeedingReminders = await PendingPayment.findNeedingReminders();
      
      if (paymentsNeedingReminders.length === 0) {
        logger.debug('✅ No payments need reminders');
        return;
      }
      
      logger.info(`📨 Found ${paymentsNeedingReminders.length} payments needing reminders`);
      
      for (const payment of paymentsNeedingReminders) {
        await this.sendReminderForPayment(payment);
      }
      
      logger.success(`✅ Sent reminders for ${paymentsNeedingReminders.length} payments`);
      
    } catch (error) {
      logger.error('❌ Error sending reminders', {
        error: error.message
      });
    }
  }
  
  /**
   * שליחת תזכורת לתשלום בודד
   * @param {Object} payment - תשלום ממתין
   */
  async sendReminderForPayment(payment) {
    try {
      const driver = await Driver.findById(payment.driverId);
      
      if (!driver) {
        logger.warn('⚠️ Driver not found for payment reminder', {
          paymentId: payment._id,
          driverId: payment.driverId
        });
        return;
      }
      
      // קבע את סוג התזכורת לפי מספר התזכורות
      const reminderNumber = payment.remindersSent + 1;
      const reminderType = this.getReminderType(reminderNumber);
      
      // צור הודעת תזכורת
      const message = PaymentCodeGenerator.createReminderMessage(
        reminderNumber,
        payment.paymentCode,
        payment.amount
      );
      
      // הוסף תזכורת לרשומה
      payment.addReminder(reminderType, message);
      await payment.save();
      
      // שלח לנהג דרך הבוט
      await this.sendToBot(driver.phone, message);
      
      logger.info('📨 Reminder sent', {
        paymentId: payment._id,
        driverId: payment.driverId,
        reminderNumber,
        type: reminderType
      });
      
    } catch (error) {
      logger.error('❌ Failed to send reminder', {
        error: error.message,
        paymentId: payment._id
      });
    }
  }
  
  /**
   * קבלת סוג תזכורת לפי מספר
   * @param {number} number - מספר תזכורת
   * @returns {string}
   */
  getReminderType(number) {
    const types = {
      1: 'first',
      2: 'second',
      3: 'third',
      4: 'final'
    };
    return types[number] || 'final';
  }
  
  /**
   * חסימה אוטומטית של נהגים שלא שילמו
   */
  async autoBlockDrivers() {
    try {
      logger.debug('🔍 Checking for drivers to auto-block...');
      
      const now = new Date();
      const blockThreshold = new Date(now - 48 * 60 * 60 * 1000); // 48 שעות
      
      // מצא תשלומים ממתינים ישנים
      const overduePayments = await PendingPayment.find({
        status: 'pending',
        createdAt: { $lt: blockThreshold },
        blockedAt: null
      });
      
      if (overduePayments.length === 0) {
        logger.debug('✅ No drivers need blocking');
        return;
      }
      
      logger.warn(`🚨 Found ${overduePayments.length} drivers to block`);
      
      for (const payment of overduePayments) {
        await this.blockDriver(payment);
      }
      
      logger.success(`✅ Blocked ${overduePayments.length} drivers`);
      
    } catch (error) {
      logger.error('❌ Error in auto-blocking', {
        error: error.message
      });
    }
  }
  
  /**
   * חסימת נהג
   * @param {Object} payment - תשלום ממתין
   */
  async blockDriver(payment) {
    try {
      const driver = await Driver.findById(payment.driverId);
      
      if (!driver) {
        logger.warn('⚠️ Driver not found for blocking', {
          paymentId: payment._id,
          driverId: payment.driverId
        });
        return;
      }
      
      // חסום את הנהג
      driver.isBlocked = true;
      driver.blockReason = 'Unpaid commission';
      driver.blockedAt = new Date();
      await driver.save();
      
      // עדכן את התשלום
      payment.blockedAt = new Date();
      payment.blockReason = 'Auto-blocked after 48 hours';
      payment.status = 'expired';
      await payment.save();
      
      // שלח הודעת חסימה
      const message = PaymentCodeGenerator.createBlockMessage();
      await this.sendToBot(driver.phone, message);
      
      // הוסף תזכורת אחרונה לרשומה
      payment.addReminder('block', message);
      await payment.save();
      
      logger.warn('🔒 Driver blocked', {
        driverId: payment.driverId,
        driverPhone: driver.phone,
        paymentId: payment._id,
        amount: payment.amount
      });
      
    } catch (error) {
      logger.error('❌ Failed to block driver', {
        error: error.message,
        paymentId: payment._id
      });
    }
  }
  
  /**
   * סימון תשלומים שפג תוקפם
   */
  async markExpiredPayments() {
    try {
      logger.debug('🔍 Checking for expired payments...');
      
      const expiredPayments = await PendingPayment.findExpired();
      
      if (expiredPayments.length === 0) {
        logger.debug('✅ No expired payments');
        return;
      }
      
      logger.info(`⏰ Found ${expiredPayments.length} expired payments`);
      
      for (const payment of expiredPayments) {
        payment.markAsExpired();
        await payment.save();
      }
      
      logger.success(`✅ Marked ${expiredPayments.length} payments as expired`);
      
    } catch (error) {
      logger.error('❌ Error marking expired payments', {
        error: error.message
      });
    }
  }
  
  /**
   * שליחת הודעה לבוט
   * @param {string} phone - מספר טלפון נהג
   * @param {string} message - הודעה
   */
  async sendToBot(phone, message) {
    try {
      // בדוק אם BOT_URL מוגדר
      if (!process.env.BOT_URL) {
        logger.warn('⚠️ BOT_URL not configured, skipping bot message');
        return;
      }
      
      // שלח POST ל-bot
      const response = await fetch(`${process.env.BOT_URL}/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone,
          message
        })
      });
      
      if (!response.ok) {
        throw new Error(`Bot returned status ${response.status}`);
      }
      
      logger.debug('✅ Message sent to bot', { phone });
      
    } catch (error) {
      logger.error('❌ Failed to send message to bot', {
        error: error.message,
        phone
      });
    }
  }
  
  /**
   * הרצה ידנית של כל התהליכים
   */
  async runManually() {
    logger.info('▶️ Running payment reminders manually...');
    
    await this.sendReminders();
    await this.autoBlockDrivers();
    await this.markExpiredPayments();
    
    logger.success('✅ Manual run completed');
  }
}

// ===============================================
// 📤 EXPORT SINGLETON
// ===============================================

const paymentRemindersCron = new PaymentRemindersCron();

export default paymentRemindersCron;
