// ===============================================
// 🔐 PASSWORD GENERATOR - מחולל סיסמאות חזקות
// ===============================================

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function checkPasswordStrength(password) {
  const checks = {
    length: password.length >= 12,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    numbers: /\d/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
  };

  const score = Object.values(checks).filter(Boolean).length;
  const passed = Object.values(checks).every(Boolean);

  return { checks, score, passed, total: Object.keys(checks).length };
}

function generateStrongPassword(length = 16) {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  const all = lowercase + uppercase + numbers + special;
  
  let password = '';
  password += lowercase[crypto.randomInt(lowercase.length)];
  password += uppercase[crypto.randomInt(uppercase.length)];
  password += numbers[crypto.randomInt(numbers.length)];
  password += special[crypto.randomInt(special.length)];
  
  for (let i = password.length; i < length; i++) {
    password += all[crypto.randomInt(all.length)];
  }
  
  return password.split('').sort(() => 0.5 - Math.random()).join('');
}

async function hashPassword(password) {
  console.log(`\n${colors.cyan}⏳ יוצר hash...${colors.reset}`);
  const hash = await bcrypt.hash(password, 12);
  console.log(`${colors.green}✅ Hash נוצר!${colors.reset}`);
  return hash;
}

function displayResults(password, hash, strength) {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bright}📊 תוצאות:${colors.reset}`);
  console.log('='.repeat(60));
  
  console.log(`\n${colors.cyan}🔑 סיסמה:${colors.reset}`);
  console.log(`   ${colors.bright}${password}${colors.reset}`);
  
  const strengthLabel = strength.passed ? `${colors.green}מצוין!` : `${colors.yellow}טוב`;
  console.log(`\n${colors.cyan}💪 חוזק:${colors.reset} ${strengthLabel}${colors.reset} (${strength.score}/${strength.total})`);
  
  console.log(`\n${colors.cyan}🔐 Hash:${colors.reset}`);
  console.log(`   ${hash}`);
  
  console.log(`\n${colors.yellow}📝 הדבק בקובץ .env:${colors.reset}`);
  console.log(`   ${colors.green}ADMIN_PASSWORD_HASH=${hash}${colors.reset}`);
  console.log('\n' + '='.repeat(60) + '\n');
}

function showMenu() {
  console.clear();
  console.log(`${colors.bright}${colors.cyan}`);
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║     🔐 מחולל סיסמאות - Taxi System            ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(colors.reset);
  console.log(`${colors.bright}אפשרויות:${colors.reset}`);
  console.log(`  ${colors.green}1${colors.reset} - הכנס סיסמה שלך`);
  console.log(`  ${colors.green}2${colors.reset} - צור סיסמה אוטומטית`);
  console.log(`  ${colors.green}3${colors.reset} - צור JWT Secret`);
  console.log(`  ${colors.red}4${colors.reset} - יציאה\n`);
}

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function handleUserPassword() {
  const password = await ask(`${colors.cyan}הכנס סיסמה: ${colors.reset}`);
  
  if (password.length < 8) {
    console.log(`${colors.red}❌ סיסמה חייבת להיות לפחות 8 תווים!${colors.reset}`);
    await ask('לחץ Enter...');
    return;
  }
  
  const strength = checkPasswordStrength(password);
  const hash = await hashPassword(password);
  displayResults(password, hash, strength);
  await ask('לחץ Enter...');
}

async function handleAutoPassword() {
  const length = await ask(`${colors.cyan}אורך (ברירת מחדל: 16): ${colors.reset}`);
  const parsedLength = parseInt(length) || 16;
  
  const password = generateStrongPassword(parsedLength);
  const strength = checkPasswordStrength(password);
  const hash = await hashPassword(password);
  displayResults(password, hash, strength);
  await ask('לחץ Enter...');
}

async function handleJwtSecret() {
  const secret = crypto.randomBytes(32).toString('base64');
  
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bright}🔑 JWT Secret:${colors.reset}`);
  console.log('='.repeat(60));
  console.log(`\n${colors.green}${secret}${colors.reset}`);
  console.log(`\n${colors.yellow}📝 הדבק ב-.env:${colors.reset}`);
  console.log(`   ${colors.green}JWT_SECRET=${secret}${colors.reset}`);
  console.log('\n' + '='.repeat(60) + '\n');
  await ask('לחץ Enter...');
}

async function main() {
  while (true) {
    showMenu();
    const choice = await ask(`${colors.bright}בחר (1-4): ${colors.reset}`);
    
    switch (choice) {
      case '1':
        await handleUserPassword();
        break;
      case '2':
        await handleAutoPassword();
        break;
      case '3':
        await handleJwtSecret();
        break;
      case '4':
        console.log(`\n${colors.green}👋 להתראות!${colors.reset}\n`);
        rl.close();
        process.exit(0);
      default:
        console.log(`${colors.red}❌ אפשרות לא תקינה!${colors.reset}`);
        await ask('לחץ Enter...');
    }
  }
}

main().catch(err => {
  console.error(`${colors.red}❌ שגיאה: ${err.message}${colors.reset}`);
  rl.close();
  process.exit(1);
});
