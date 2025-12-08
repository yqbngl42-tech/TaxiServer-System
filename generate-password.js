#!/usr/bin/env node
import bcrypt from 'bcryptjs';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n🔐 Password Hash Generator\n');

rl.question('הכנס סיסמה: ', async (password) => {
  if (!password || password.length < 6) {
    console.log('❌ סיסמה חייבת להיות לפחות 6 תווים');
    rl.close();
    return;
  }
  
  const hash = await bcrypt.hash(password, 12);
  
  console.log('\n✅ Hash נוצר בהצלחה!\n');
  console.log('הוסף את זה ל-.env:\n');
  console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
  
  rl.close();
});
