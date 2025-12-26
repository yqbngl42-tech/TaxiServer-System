// ===============================================
// 👤 CREATE ADMIN USER - Migration Script
// ===============================================
// File location: scripts/create-admin-user.js
// Usage: node scripts/create-admin-user.js

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import models
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';

// ===============================================
// CONFIGURATION
// ===============================================

const DEFAULT_ADMIN = {
  username: 'admin',
  email: 'admin@taxisystem.com',
  password: 'Admin123!',
  role: 'admin'
};

// ===============================================
// MAIN FUNCTION
// ===============================================

async function createAdminUser() {
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  🚀 TAXI SYSTEM - Admin User Setup');
  console.log('═══════════════════════════════════════');
  console.log('');

  try {
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      console.error('❌ Error: MONGODB_URI not found in .env');
      console.log('');
      console.log('Please add MONGODB_URI to your .env file:');
      console.log('  MONGODB_URI=mongodb://localhost:27017/taxi-system');
      console.log('');
      process.exit(1);
    }
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    console.log('');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ username: DEFAULT_ADMIN.username });
    
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists!');
      console.log('');
      console.log('Current admin details:');
      console.log('  Username:', existingAdmin.username);
      console.log('  Email:', existingAdmin.email);
      console.log('  Role:', existingAdmin.role);
      console.log('  Created:', existingAdmin.createdAt.toISOString());
      console.log('  Active:', existingAdmin.isActive ? 'Yes' : 'No');
      console.log('  Locked:', existingAdmin.isLocked ? 'Yes' : 'No');
      console.log('');
      
      // Ask if user wants to reset password
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise((resolve) => {
        rl.question('Do you want to reset the password? (yes/no): ', (ans) => {
          rl.close();
          resolve(ans.trim().toLowerCase());
        });
      });
      
      if (answer === 'yes' || answer === 'y') {
        // Reset password
        console.log('');
        console.log('🔄 Resetting password...');
        
        const salt = await bcrypt.genSalt(12);
        existingAdmin.passwordHash = await bcrypt.hash(DEFAULT_ADMIN.password, salt);
        existingAdmin.loginAttempts = 0;
        existingAdmin.lockUntil = null;
        existingAdmin.isLocked = false;
        existingAdmin.updatedAt = new Date();
        
        await existingAdmin.save();
        
        // Log the password reset
        await AuditLog.create({
          userId: existingAdmin._id.toString(),
          username: 'system',
          action: 'password_reset',
          resource: 'user',
          resourceId: existingAdmin._id.toString(),
          details: { resetBy: 'migration_script' },
          ipAddress: 'localhost'
        });
        
        console.log('✅ Password reset successfully!');
        console.log('');
        console.log('═══════════════════════════════════════');
        console.log('  🔑 NEW LOGIN CREDENTIALS');
        console.log('═══════════════════════════════════════');
        console.log('  Username:', DEFAULT_ADMIN.username);
        console.log('  Password:', DEFAULT_ADMIN.password);
        console.log('═══════════════════════════════════════');
        console.log('');
        console.log('⚠️  IMPORTANT: Change this password immediately after first login!');
        
      } else {
        console.log('');
        console.log('❌ Password reset cancelled');
      }
      
    } else {
      // Create new admin user
      console.log('👤 Creating new admin user...');
      console.log('');
      
      const adminUser = new User({
        username: DEFAULT_ADMIN.username,
        email: DEFAULT_ADMIN.email,
        passwordHash: DEFAULT_ADMIN.password, // Will be hashed by pre-save hook
        role: DEFAULT_ADMIN.role,
        isActive: true,
        createdBy: 'system'
      });
      
      await adminUser.save();
      
      // Log the creation
      await AuditLog.create({
        userId: adminUser._id.toString(),
        username: 'system',
        action: 'user_created',
        resource: 'user',
        resourceId: adminUser._id.toString(),
        details: { 
          role: DEFAULT_ADMIN.role, 
          createdBy: 'migration_script',
          isFirstAdmin: true
        },
        ipAddress: 'localhost'
      });
      
      console.log('✅ Admin user created successfully!');
      console.log('');
      console.log('═══════════════════════════════════════');
      console.log('  🔑 LOGIN CREDENTIALS');
      console.log('═══════════════════════════════════════');
      console.log('  Username:', DEFAULT_ADMIN.username);
      console.log('  Password:', DEFAULT_ADMIN.password);
      console.log('  Email:   ', DEFAULT_ADMIN.email);
      console.log('  Role:    ', DEFAULT_ADMIN.role);
      console.log('═══════════════════════════════════════');
      console.log('');
      console.log('⚠️  IMPORTANT SECURITY NOTES:');
      console.log('  1. Change this password immediately after first login!');
      console.log('  2. Use a strong, unique password');
      console.log('  3. Enable 2FA if available');
      console.log('  4. Do not share these credentials');
      console.log('');
      console.log('📝 Next steps:');
      console.log('  1. Start your server: npm start');
      console.log('  2. Login at: http://localhost:3000/');
      console.log('  3. Change your password in Settings');
      console.log('');
    }
    
    // Show statistics
    console.log('📊 Current users in system:');
    const userCount = await User.countDocuments();
    const roleStats = await User.countByRole();
    console.log('  Total users:', userCount);
    roleStats.forEach(stat => {
      console.log(`  ${stat._id}:`, stat.count);
    });
    console.log('');
    
    // Disconnect
    await mongoose.disconnect();
    console.log('✅ Done! Database connection closed.');
    console.log('');
    process.exit(0);
    
  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
    console.error('');
    
    if (error.code === 11000) {
      console.error('Duplicate key error - user might already exist with this email/username');
    }
    
    console.error('Stack trace:');
    console.error(error.stack);
    console.error('');
    
    process.exit(1);
  }
}

// ===============================================
// ADDITIONAL HELPER: Create Multiple Users
// ===============================================

async function createMultipleUsers(users) {
  console.log(`Creating ${users.length} users...`);
  
  for (const userData of users) {
    try {
      const user = new User(userData);
      await user.save();
      
      await AuditLog.create({
        userId: user._id.toString(),
        username: 'system',
        action: 'user_created',
        resource: 'user',
        resourceId: user._id.toString(),
        details: { role: userData.role, createdBy: 'batch_script' },
        ipAddress: 'localhost'
      });
      
      console.log(`✅ Created: ${userData.username} (${userData.role})`);
    } catch (error) {
      console.error(`❌ Failed to create ${userData.username}:`, error.message);
    }
  }
}

// ===============================================
// EXAMPLES OF ADDITIONAL USERS
// ===============================================

const EXAMPLE_USERS = [
  {
    username: 'manager1',
    email: 'manager@taxisystem.com',
    passwordHash: 'Manager123!',
    role: 'manager'
  },
  {
    username: 'operator1',
    email: 'operator@taxisystem.com',
    passwordHash: 'Operator123!',
    role: 'operator'
  },
  {
    username: 'viewer1',
    email: 'viewer@taxisystem.com',
    passwordHash: 'Viewer123!',
    role: 'viewer'
  }
];

// ===============================================
// RUN
// ===============================================

// Run the main function
createAdminUser();

// To create additional users, uncomment this:
// createMultipleUsers(EXAMPLE_USERS);
