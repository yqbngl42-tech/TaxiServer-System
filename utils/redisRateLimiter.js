// ===============================================
// ⚡ REDIS RATE LIMITER - Production Ready
// ===============================================
// Advanced rate limiting with Redis for scalability

import Redis from 'ioredis';
import logger from './logger.js';

// ===============================================
// 🔧 REDIS CLIENT
// ===============================================

let redis = null;
let isRedisAvailable = false;

// Fallback in-memory store (when Redis is unavailable)
const memoryStore = new Map();

// Initialize Redis
try {
  const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    retryStrategy: (times) => {
      if (times > 3) {
        logger.error('Redis connection failed after 3 retries');
        return null; // Stop retrying
      }
      const delay = Math.min(times * 100, 3000);
      logger.info(`Redis retry attempt ${times}, waiting ${delay}ms`);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true
  };

  // Add password if provided
  if (process.env.REDIS_PASSWORD) {
    redisConfig.password = process.env.REDIS_PASSWORD;
  }

  redis = new Redis(redisConfig);

  redis.on('connect', () => {
    logger.success('✅ Connected to Redis');
    isRedisAvailable = true;
  });

  redis.on('ready', () => {
    logger.info('Redis is ready');
    isRedisAvailable = true;
  });

  redis.on('error', (err) => {
    logger.error('Redis error', { error: err.message });
    isRedisAvailable = false;
  });

  redis.on('close', () => {
    logger.warn('Redis connection closed');
    isRedisAvailable = false;
  });

  redis.on('reconnecting', () => {
    logger.info('Redis reconnecting...');
  });

  // Connect to Redis
  redis.connect().catch(err => {
    logger.error('Failed to connect to Redis', { error: err.message });
    isRedisAvailable = false;
  });

} catch (error) {
  logger.error('Failed to initialize Redis', { error: error.message });
  redis = null;
  isRedisAvailable = false;
}

// ===============================================
// 🛡️ RATE LIMITER CLASS
// ===============================================

class RateLimiter {
  /**
   * Check rate limit using Redis (with fallback to memory)
   */
  async checkRateLimit(identifier, maxRequests = 30, windowMs = 60000) {
    const key = `ratelimit:${identifier}`;
    const windowSeconds = Math.ceil(windowMs / 1000);

    // Try Redis first
    if (isRedisAvailable && redis) {
      try {
        const current = await redis.incr(key);

        if (current === 1) {
          await redis.expire(key, windowSeconds);
        }

        const allowed = current <= maxRequests;

        if (!allowed) {
          logger.warn('Rate limit exceeded (Redis)', {
            identifier,
            current,
            max: maxRequests
          });
        }

        return allowed;

      } catch (error) {
        logger.error('Redis rate limit check failed, falling back to memory', {
          error: error.message
        });
        // Fall through to memory store
      }
    }

    // Fallback to in-memory store
    return this._checkRateLimitMemory(identifier, maxRequests, windowMs);
  }

  /**
   * In-memory rate limiting (fallback)
   */
  _checkRateLimitMemory(identifier, maxRequests, windowMs) {
    const now = Date.now();

    if (!memoryStore.has(identifier)) {
      memoryStore.set(identifier, []);
    }

    let requests = memoryStore.get(identifier);

    // Remove old requests outside the window
    requests = requests.filter(time => now - time < windowMs);
    memoryStore.set(identifier, requests);

    if (requests.length >= maxRequests) {
      logger.warn('Rate limit exceeded (Memory)', {
        identifier,
        current: requests.length,
        max: maxRequests
      });
      return false;
    }

    requests.push(now);
    return true;
  }

  /**
   * Express middleware for rate limiting
   */
  middleware(maxRequests = 100, windowMs = 60000) {
    return async (req, res, next) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const endpoint = req.path;
      const identifier = `${ip}:${endpoint}`;

      try {
        const allowed = await this.checkRateLimit(
          identifier,
          maxRequests,
          windowMs
        );

        if (!allowed) {
          const retryAfter = Math.ceil(windowMs / 1000);

          res.setHeader('Retry-After', retryAfter);
          res.setHeader('X-RateLimit-Limit', maxRequests);
          res.setHeader('X-RateLimit-Remaining', 0);

          return res.status(429).json({
            ok: false,
            error: 'Too Many Requests',
            message: 'יותר מדי בקשות - נסה שוב בעוד דקה',
            retryAfter: `${retryAfter} seconds`
          });
        }

        // Add rate limit headers
        const remaining = await this.getRemainingRequests(
          identifier,
          maxRequests,
          windowMs
        );

        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));

        next();

      } catch (error) {
        logger.error('Rate limiter middleware error', {
          error: error.message,
          identifier
        });

        // On error, allow the request (fail open)
        next();
      }
    };
  }

  /**
   * Get remaining requests for an identifier
   */
  async getRemainingRequests(identifier, maxRequests, windowMs) {
    const key = `ratelimit:${identifier}`;

    if (isRedisAvailable && redis) {
      try {
        const current = await redis.get(key);
        const remaining = maxRequests - (parseInt(current) || 0);
        return Math.max(0, remaining);
      } catch (error) {
        logger.error('Failed to get remaining requests from Redis', {
          error: error.message
        });
      }
    }

    // Fallback to memory
    const requests = memoryStore.get(identifier) || [];
    const now = Date.now();
    const validRequests = requests.filter(time => now - time < windowMs);
    return Math.max(0, maxRequests - validRequests.length);
  }

  /**
   * Reset rate limit for an identifier
   */
  async resetRateLimit(identifier) {
    const key = `ratelimit:${identifier}`;

    if (isRedisAvailable && redis) {
      try {
        await redis.del(key);
        logger.info('Rate limit reset (Redis)', { identifier });
        return true;
      } catch (error) {
        logger.error('Failed to reset rate limit in Redis', {
          error: error.message
        });
      }
    }

    // Fallback to memory
    memoryStore.delete(identifier);
    logger.info('Rate limit reset (Memory)', { identifier });
    return true;
  }

  /**
   * Get rate limit info for an identifier
   */
  async getRateLimitInfo(identifier, maxRequests, windowMs) {
    const key = `ratelimit:${identifier}`;
    const windowSeconds = Math.ceil(windowMs / 1000);

    if (isRedisAvailable && redis) {
      try {
        const current = parseInt(await redis.get(key)) || 0;
        const ttl = await redis.ttl(key);

        return {
          current,
          max: maxRequests,
          remaining: Math.max(0, maxRequests - current),
          resetAt: ttl > 0 ? new Date(Date.now() + ttl * 1000) : null,
          storage: 'redis'
        };
      } catch (error) {
        logger.error('Failed to get rate limit info from Redis', {
          error: error.message
        });
      }
    }

    // Fallback to memory
    const requests = memoryStore.get(identifier) || [];
    const now = Date.now();
    const validRequests = requests.filter(time => now - time < windowMs);
    const oldestRequest = validRequests[0];
    const resetAt = oldestRequest
      ? new Date(oldestRequest + windowMs)
      : null;

    return {
      current: validRequests.length,
      max: maxRequests,
      remaining: Math.max(0, maxRequests - validRequests.length),
      resetAt,
      storage: 'memory'
    };
  }

  /**
   * Clear all rate limits (admin function)
   */
  async clearAll() {
    if (isRedisAvailable && redis) {
      try {
        const keys = await redis.keys('ratelimit:*');
        if (keys.length > 0) {
          await redis.del(...keys);
          logger.info('Cleared all rate limits from Redis', {
            count: keys.length
          });
        }
        return keys.length;
      } catch (error) {
        logger.error('Failed to clear rate limits from Redis', {
          error: error.message
        });
      }
    }

    // Fallback to memory
    const count = memoryStore.size;
    memoryStore.clear();
    logger.info('Cleared all rate limits from memory', { count });
    return count;
  }

  /**
   * Get storage type being used
   */
  getStorageType() {
    return isRedisAvailable ? 'redis' : 'memory';
  }

  /**
   * Check if Redis is available
   */
  isRedisConnected() {
    return isRedisAvailable;
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (redis) {
      await redis.quit();
      logger.info('Redis connection closed');
    }
  }
}

// ===============================================
// 🚀 EXPORT SINGLETON INSTANCE
// ===============================================

const rateLimiter = new RateLimiter();

// Cleanup on process exit
process.on('SIGINT', async () => {
  await rateLimiter.close();
});

process.on('SIGTERM', async () => {
  await rateLimiter.close();
});

// Log storage type on startup
setTimeout(() => {
  const storageType = rateLimiter.getStorageType();
  logger.info(`Rate limiter using ${storageType.toUpperCase()} storage`);
}, 2000);

console.log('✅ Redis Rate Limiter loaded');

export default rateLimiter;
