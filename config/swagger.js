// ===============================================
// 📚 SWAGGER API DOCUMENTATION
// ===============================================
// Comprehensive API documentation using OpenAPI 3.0

import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import logger from '../utils/logger.js';

// ===============================================
// 🔧 SWAGGER OPTIONS
// ===============================================

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Taxi Management System API',
      version: '5.6.0',
      description: `
# 🚖 מערכת ניהול מוניות חכמה

API מקיף לניהול מערכת מוניות עם תמיכה מלאה ב:
- ניהול נהגים ונסיעות
- אינטגרציה עם WhatsApp
- מערכת תשלומים
- דוחות וסטטיסטיקות
- אבטחה מתקדמת

## 🔐 Authentication

רוב ה-endpoints דורשים JWT authentication.

לקבלת token, השתמש ב-endpoint \`/api/login\` עם סיסמת האדמין.

הוסף את ה-token לכל בקשה בheader:
\`\`\`
Authorization: Bearer YOUR_JWT_TOKEN
\`\`\`

## 🚀 Getting Started

1. התקן dependencies: \`npm install\`
2. הגדר .env file
3. הפעל: \`npm start\`
4. בדוק ב: http://localhost:3000/api-docs

## 📞 Support

- Email: support@taxi-system.com
- GitHub: https://github.com/yourusername/taxi-system
      `,
      contact: {
        name: 'API Support',
        email: 'support@taxi-system.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://api.yourdomain.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token obtained from /api/login'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            ok: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'string',
              example: 'Error message'
            },
            details: {
              type: 'array',
              items: {
                type: 'object'
              }
            }
          }
        },
        Ride: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              example: '507f1f77bcf86cd799439011'
            },
            rideNumber: {
              type: 'string',
              example: 'R000001'
            },
            customerName: {
              type: 'string',
              example: 'יוסי כהן'
            },
            customerPhone: {
              type: 'string',
              example: '0501234567'
            },
            pickupLocation: {
              type: 'string',
              example: 'רחוב הרצל 1, תל אביב'
            },
            dropoffLocation: {
              type: 'string',
              example: 'רחוב דיזנגוף 100, תל אביב'
            },
            price: {
              type: 'number',
              example: 50
            },
            status: {
              type: 'string',
              enum: ['pending', 'accepted', 'in_progress', 'completed', 'cancelled'],
              example: 'pending'
            },
            driverId: {
              type: 'string',
              example: '507f1f77bcf86cd799439011'
            },
            driverName: {
              type: 'string',
              example: 'דוד לוי'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Driver: {
          type: 'object',
          properties: {
            _id: {
              type: 'string'
            },
            name: {
              type: 'string',
              example: 'דוד לוי'
            },
            phone: {
              type: 'string',
              example: '0501234567'
            },
            driverId: {
              type: 'string',
              example: 'DRV-000001'
            },
            vehicleNumber: {
              type: 'string',
              example: '12-345-67'
            },
            vehicleType: {
              type: 'string',
              enum: ['sedan', 'minivan', 'suv', 'luxury', 'van'],
              example: 'sedan'
            },
            isActive: {
              type: 'boolean',
              example: true
            },
            isBlocked: {
              type: 'boolean',
              example: false
            },
            rating: {
              type: 'object',
              properties: {
                average: {
                  type: 'number',
                  example: 4.8
                },
                count: {
                  type: 'number',
                  example: 25
                }
              }
            },
            stats: {
              type: 'object',
              properties: {
                totalRides: {
                  type: 'number',
                  example: 150
                },
                completedRides: {
                  type: 'number',
                  example: 145
                }
              }
            }
          }
        },
        Payment: {
          type: 'object',
          properties: {
            _id: {
              type: 'string'
            },
            amount: {
              type: 'number',
              example: 500
            },
            method: {
              type: 'string',
              enum: ['cash', 'credit', 'bit', 'paypal', 'bank_transfer'],
              example: 'cash'
            },
            driverId: {
              type: 'string'
            },
            rideId: {
              type: 'string'
            },
            status: {
              type: 'string',
              enum: ['pending', 'completed', 'failed'],
              example: 'completed'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                ok: false,
                error: 'No token provided'
              }
            }
          }
        },
        ForbiddenError: {
          description: 'Invalid or expired token',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                ok: false,
                error: 'Invalid token'
              }
            }
          }
        },
        ValidationError: {
          description: 'Invalid input data',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                ok: false,
                error: 'Invalid input',
                details: [
                  {
                    field: 'customerPhone',
                    message: 'מספר טלפון חייב להיות בפורמט 05XXXXXXXX'
                  }
                ]
              }
            }
          }
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                ok: false,
                error: 'Not found'
              }
            }
          }
        },
        ServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                ok: false,
                error: 'Internal server error'
              }
            }
          }
        },
        TooManyRequests: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                ok: false,
                error: 'Too Many Requests',
                message: 'יותר מדי בקשות - נסה שוב בעוד דקה',
                retryAfter: '60 seconds'
              }
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'אימות והתחברות'
      },
      {
        name: 'Rides',
        description: 'ניהול נסיעות'
      },
      {
        name: 'Drivers',
        description: 'ניהול נהגים'
      },
      {
        name: 'Payments',
        description: 'ניהול תשלומים'
      },
      {
        name: 'Statistics',
        description: 'דוחות וסטטיסטיקות'
      },
      {
        name: 'System',
        description: 'מידע על המערכת'
      }
    ]
  },
  apis: ['./server.js', './routes/*.js']
};

// ===============================================
// 📖 GENERATE SPECS
// ===============================================

const specs = swaggerJsdoc(options);

// ===============================================
// 🚀 SETUP FUNCTION
// ===============================================

/**
 * Setup Swagger UI
 */
export default function setupSwagger(app) {
  // Check if Swagger is enabled
  if (process.env.ENABLE_SWAGGER === 'false') {
    logger.info('Swagger documentation is disabled');
    return;
  }

  // Custom CSS for better UI
  const customCss = `
    .swagger-ui .topbar { 
      display: none; 
    }
    .swagger-ui .info .title {
      font-size: 2.5em;
    }
    .swagger-ui .scheme-container {
      background: #f7f7f7;
      padding: 20px;
    }
  `;

  // Swagger UI options
  const swaggerOptions = {
    customCss,
    customSiteTitle: 'Taxi System API Docs',
    customfavIcon: '/favicon.ico',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      syntaxHighlight: {
        activate: true,
        theme: 'monokai'
      }
    }
  };

  // Serve Swagger UI
  app.use('/api-docs', swaggerUi.serve);
  app.get('/api-docs', swaggerUi.setup(specs, swaggerOptions));

  // Serve raw OpenAPI spec as JSON
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });

  logger.success('✅ Swagger documentation available at /api-docs');
  console.log('📚 API Documentation: http://localhost:' + (process.env.PORT || 3000) + '/api-docs');
}

// ===============================================
// 📝 EXPORT SPECS FOR TESTING
// ===============================================

export { specs };
