// ===============================================
// 🚖 TAXI MANAGEMENT SYSTEM - SERVER V4.0
// ===============================================
// Refactored Architecture - Clean & Modular
// Date: 2025-12-25
// ===============================================

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

// Configuration
import { setupMiddlewares } from "./config/middlewares.js";
import { connectDatabase } from "./config/database.js";
import corsConfig from "./config/cors-config.js";

// Utils
import websockets from "./utils/websockets.js";
import logger from "./utils/logger.js";
import "./utils/logsCleaner.js"; // Auto cleanup old logs

// Routes - Clean API Routes
import authRoutes from "./routes/auth.js";
import ridesRoutes from "./routes/rides.js";
import driversRoutes from "./routes/drivers.js";
import groupsRoutes from "./routes/groups.js";
import paymentsRoutes from "./routes/payments.js";
import analyticsRoutes from "./routes/analytics.js";
import activitiesRoutes from "./routes/activities.js";
import adminRoutes from "./routes/admin.js";
import botRoutes from "./routes/bot.js";
import registrationsRoutes from "./routes/registrations.js";
import messagesRoutes from "./routes/messages.js";
import settingsRoutes from "./routes/settings.js";
import systemRoutes from "./routes/system.js";
import dispatchRoutes from "./routes/dispatch.js";
import financeRoutes from "./routes/finance.js";
import customersRoutes from "./routes/customers.js";
import websocketRoutes from "./routes/websocket.js";
import miscRoutes from "./routes/misc.js";

// Routes - Health & Dashboard
import dashboardRoutes from "./routes/dashboard.js";
import healthRoutes from "./routes/health.js";
import ridesExtraRoutes from "./routes/rides-extra.js";
import campaignsRoutes from "./routes/campaigns.js";
import messageTemplatesRoutes from "./routes/message-templates.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===============================================
// APP INITIALIZATION
// ===============================================

const app = express();
const server = http.createServer(app);

// Setup middlewares
setupMiddlewares(app);

// ===============================================
// DATABASE CONNECTION
// ===============================================

try {
  await connectDatabase();
} catch (error) {
  logger.error('Failed to connect to database:', error);
  process.exit(1);
}

// ===============================================
// WEBSOCKET SETUP
// ===============================================

websockets.setupWebSockets(server);

// ===============================================
// STATIC FILES
// ===============================================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// ===============================================
// API ROUTES
// ===============================================

// Core routes
app.use("/auth", authRoutes);
app.use("/api/rides", ridesRoutes);
app.use("/api/drivers", driversRoutes);
app.use("/api/groups", groupsRoutes);
app.use("/api/payments", paymentsRoutes);

// Management routes
app.use("/api/analytics", analyticsRoutes);
app.use("/api/activities", activitiesRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/registrations", registrationsRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/system", systemRoutes);
app.use("/api/dispatch", dispatchRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/customers", customersRoutes);
app.use("/api/campaigns", campaignsRoutes);
app.use("/api/templates", messageTemplatesRoutes);

// Integration routes
app.use("/api/bot", botRoutes);
app.use("/api/websocket", websocketRoutes);

// Legacy/Extra routes
app.use("/api/dashboard", dashboardRoutes);
app.use("/health", healthRoutes);
app.use("/api/rides", ridesExtraRoutes);

// Misc routes
app.use("/api", miscRoutes);

console.log("✅ All API Routes Registered:");
console.log("   🔐 /auth");
console.log("   🚗 /api/rides");
console.log("   👤 /api/drivers");
console.log("   👥 /api/groups");
console.log("   💰 /api/payments");
console.log("   📊 /api/analytics");
console.log("   📝 /api/activities");
console.log("   ⚙️  /api/admin");
console.log("   📋 /api/registrations");
console.log("   💬 /api/messages");
console.log("   🎛️  /api/settings");
console.log("   🖥️  /api/system");
console.log("   🚦 /api/dispatch");
console.log("   💵 /api/finance");
console.log("   👥 /api/customers");
console.log("   🤖 /api/bot");
console.log("   🔌 /api/websocket");
console.log("");

// ===============================================
// ERROR HANDLING
// ===============================================

// CORS error handler
app.use(corsConfig.corsErrorHandler);

// 404 handler
app.use((req, res) => {
  logger.warn(`404: ${req.method} ${req.url}`);
  res.status(404).json({
    ok: false,
    error: "Route not found"
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Server error:', {
    requestId: req.id,
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });
  
  res.status(err.status || 500).json({
    ok: false,
    error: err.message || "Internal server error",
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ===============================================
// SERVER STARTUP
// ===============================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("\n" + "=".repeat(70));
  console.log("🚖 TAXI MANAGEMENT SYSTEM - SERVER READY");
  console.log("=".repeat(70));
  console.log(`📍 Server:     http://localhost:${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 MongoDB:     Connected`);
  console.log(`🔌 WebSocket:   Enabled`);
  console.log("=".repeat(70) + "\n");
});

// ===============================================
// GRACEFUL SHUTDOWN
// ===============================================

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close database connection
    import('./config/database.js').then(({ disconnectDatabase }) => {
      disconnectDatabase().then(() => {
        logger.info('Database connection closed');
        process.exit(0);
      });
    });
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down');
  process.exit(0);
});

// ===============================================
// END OF SERVER.JS
// ===============================================
