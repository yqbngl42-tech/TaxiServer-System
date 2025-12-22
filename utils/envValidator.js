// ===============================================
// 🔒 ENVIRONMENT VALIDATOR
// ===============================================
// Validates required environment variables on startup

function validateEnvironment() {
  console.log('\n🔍 Validating environment variables...\n');
  
  const required = {
    'ADMIN_PASSWORD_HASH': 'Required for admin authentication (bcrypt hash)',
    'JWT_SECRET': 'Required for JWT token generation and verification'
  };
  
  const warnings = {
    'MONGODB_URI': 'Database connection string',
    'PORT': 'Server port (defaults to 3000)'
  };
  
  let hasErrors = false;
  let hasWarnings = false;
  
  // Check required variables
  for (const [key, description] of Object.entries(required)) {
    if (!process.env[key]) {
      console.error(`❌ MISSING REQUIRED: ${key}`);
      console.error(`   ${description}`);
      hasErrors = true;
    } else {
      const value = process.env[key];
      const displayValue = key.includes('PASSWORD') || key.includes('SECRET') 
        ? `${value.substring(0, 10)}...` 
        : value;
      console.log(`✅ ${key}: ${displayValue}`);
    }
  }
  
  // Check warning variables
  for (const [key, description] of Object.entries(warnings)) {
    if (!process.env[key]) {
      console.warn(`⚠️  MISSING OPTIONAL: ${key}`);
      console.warn(`   ${description}`);
      hasWarnings = true;
    }
  }
  
  // Summary
  if (hasErrors) {
    console.error('\n🚨 CRITICAL: Missing required environment variables!');
    console.error('   Server will start but authentication WILL FAIL!');
    console.error('\n📝 How to fix:');
    console.error('   1. Create a .env file in the server directory');
    console.error('   2. Add the missing variables');
    console.error('   3. Restart the server');
    console.error('\n   Example .env file:');
    console.error('   ADMIN_PASSWORD_HASH=$2a$10$...');
    console.error('   JWT_SECRET=your-random-secret-key-here\n');
  } else {
    console.log('\n✅ All required environment variables are configured!');
  }
  
  if (hasWarnings) {
    console.warn('\n⚠️  Some optional variables are missing (using defaults)\n');
  }
  
  console.log(''); // Empty line for spacing
  
  return !hasErrors;
}

export default validateEnvironment;
