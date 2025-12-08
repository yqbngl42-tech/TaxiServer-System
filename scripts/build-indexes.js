// ===============================================
// 🔧 BUILD DATABASE INDEXES
// ===============================================
// Run this script to build all MongoDB indexes

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Import all models
import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import Payment from '../models/Payment.js';
import WhatsAppGroup from '../models/WhatsAppGroup.js';
import Activity from '../models/Activity.js';
import RegistrationSession from '../models/RegistrationSession.js';
import RideCounter from '../models/RideCounter.js';
import AdminContact from '../models/AdminContact.js';
import RefreshToken from '../models/RefreshToken.js';

async function buildIndexes() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000
    });
    
    console.log('✅ Connected to MongoDB');
    console.log(`📊 Database: ${mongoose.connection.name}\n`);

    const models = [
      { name: 'Driver', model: Driver },
      { name: 'Ride', model: Ride },
      { name: 'Payment', model: Payment },
      { name: 'WhatsAppGroup', model: WhatsAppGroup },
      { name: 'Activity', model: Activity },
      { name: 'RegistrationSession', model: RegistrationSession },
      { name: 'RideCounter', model: RideCounter },
      { name: 'AdminContact', model: AdminContact },
      { name: 'RefreshToken', model: RefreshToken }
    ];

    console.log('🔨 Building indexes...\n');

    for (const { name, model } of models) {
      try {
        console.log(`⏳ Building indexes for ${name}...`);
        await model.createIndexes();
        
        // Get index info
        const indexes = await model.collection.indexes();
        console.log(`✅ ${name}: ${indexes.length} indexes created`);
        
        // Show index details
        indexes.forEach(idx => {
          const keys = Object.keys(idx.key).join(', ');
          const unique = idx.unique ? ' [UNIQUE]' : '';
          const text = idx.textIndexVersion ? ' [TEXT]' : '';
          console.log(`   - ${idx.name}: {${keys}}${unique}${text}`);
        });
        
        console.log('');
      } catch (error) {
        console.error(`❌ Error building indexes for ${name}:`, error.message);
      }
    }

    console.log('✅ All indexes built successfully!\n');

    // Show database stats
    console.log('📊 Database Statistics:');
    const stats = await mongoose.connection.db.stats();
    console.log(`   - Collections: ${stats.collections}`);
    console.log(`   - Data Size: ${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   - Index Size: ${(stats.indexSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   - Documents: ${stats.objects}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n💡 Make sure:');
    console.error('   1. MongoDB is running');
    console.error('   2. MONGODB_URI is correct in .env');
    console.error('   3. You have network connection');
    process.exit(1);
  }
}

// Run the script
console.log('🚀 MongoDB Index Builder\n');
buildIndexes();
