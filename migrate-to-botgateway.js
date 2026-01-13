#!/usr/bin/env node

// ===============================================
// 🔄 MIGRATION SCRIPT - Bot Gateway Integration
// ===============================================
// מעביר את כל הפרויקט לשימוש ב-botGateway
// גיבוי אוטומטי + דוח שינויים

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===============================================
// ⚙️ CONFIGURATION
// ===============================================

const CONFIG = {
  projectRoot: path.join(__dirname, '..'), // TaxiServer root
  backupDir: path.join(__dirname, '..', 'backups', `migration-${Date.now()}`),
  dryRun: process.argv.includes('--dry-run'),
  verbose: process.argv.includes('--verbose'),
};

const FILES_TO_MIGRATE = [
  'utils/dispatchManager.js',
  'routes/bot.js',
  'routes/registrations.js',
  'routes/rides.js',
];

// ===============================================
// 📊 MIGRATION REPORT
// ===============================================

const report = {
  startTime: new Date(),
  filesProcessed: 0,
  filesModified: 0,
  changesMade: [],
  errors: [],
  warnings: [],
};

// ===============================================
// 🎨 COLORS FOR CONSOLE
// ===============================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60) + '\n');
}

// ===============================================
// 🔧 UTILITY FUNCTIONS
// ===============================================

/**
 * בדיקה אם קובץ קיים
 */
function fileExists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * קריאת קובץ
 */
function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * כתיבת קובץ
 */
function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * יצירת תיקייה
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * העתקת קובץ (גיבוי)
 */
function backupFile(filePath) {
  const relativePath = path.relative(CONFIG.projectRoot, filePath);
  const backupPath = path.join(CONFIG.backupDir, relativePath);
  const backupDir = path.dirname(backupPath);

  ensureDir(backupDir);
  fs.copyFileSync(filePath, backupPath);

  log(`  ✓ Backup: ${relativePath}`, 'green');
  return backupPath;
}

// ===============================================
// 🔍 PATTERN MATCHING
// ===============================================

const PATTERNS = {
  // fetch ל-BOT_URL
  botFetch: /await\s+fetch\s*\(\s*`?\$\{process\.env\.BOT_URL[^}]*\}[^`]*`?\s*,/g,

  // fetchWithTimeout
  fetchWithTimeout:
    /await\s+fetchWithTimeout\s*\(\s*`?\$\{[^}]*BOT_URL[^}]*\}[^`]*`?\s*,/g,

  // קריאות ישירות
  directFetch: /fetch\s*\(\s*['"`]http:\/\/localhost:3001/g,

  // import של fetch
  importFetch: /import\s+.*fetch.*from\s+['"]node-fetch['"]/,
};

// ===============================================
// 🔄 MIGRATION FUNCTIONS
// ===============================================

/**
 * העברת dispatchManager.js
 */
function migrateDispatchManager(content) {
  const changes = [];
  let modified = content;

  // החלפת _sendViaBot
  const sendViaBotPattern =
    /async\s+_sendViaBot\s*\(\s*ride\s*\)\s*{[\s\S]*?const response = await fetch\([^)]+\);[\s\S]*?return[^}]*}/;

  if (sendViaBotPattern.test(modified)) {
    modified = modified.replace(
      sendViaBotPattern,
      `async _sendViaBot(ride) {
    if (!this.sendViaBotHandler) {
      throw new Error('Bot handler not configured');
    }
    
    this.stats.bot.totalAttempts++;
    return await this.sendViaBotHandler(ride);
  }`
    );
    changes.push('Replaced _sendViaBot with handler pattern');
  }

  // הוספת import בראש הקובץ
  if (!modified.includes("import botGateway from './botGateway.js'")) {
    const importSection = modified.match(/^(import.*\n)+/);
    if (importSection) {
      modified = modified.replace(
        importSection[0],
        importSection[0] + "import botGateway from './botGateway.js';\n"
      );
      changes.push('Added botGateway import');
    }
  }

  // הוספת setBotHandler בקונסטרקטור או בהערה
  if (!modified.includes('botGateway.dispatch')) {
    const note = `
// ===============================================
// 🔧 SETUP BOT GATEWAY INTEGRATION
// ===============================================
// Add this in your server.js initialization:
//
// import botGateway from './utils/botGateway.js';
// 
// dispatchManager.setBotHandler(async (ride) => {
//   return await botGateway.dispatch(ride);
// });
`;
    modified = note + '\n' + modified;
    changes.push('Added setup instructions comment');
  }

  return { modified, changes };
}

/**
 * העברת routes/bot.js
 */
function migrateBotRoutes(content) {
  const changes = [];
  let modified = content;

  // הוספת import
  if (!modified.includes("import botGateway from '../utils/botGateway.js'")) {
    const importSection = modified.match(/^(import.*\n)+/);
    if (importSection) {
      modified = modified.replace(
        importSection[0],
        importSection[0] + "import botGateway from '../utils/botGateway.js';\n"
      );
      changes.push('Added botGateway import');
    }
  }

  // החלפת fetch calls
  const fetchPattern =
    /const\s+response\s+=\s+await\s+fetch(?:WithTimeout)?\s*\(\s*`?\$\{(?:process\.env\.)?BOT_URL[^}]*\}([^`]+)`?\s*,\s*{([^}]+)}\s*(?:,\s*\d+(?:,\s*\d+)?)?\s*\)/g;

  let match;
  while ((match = fetchPattern.exec(content)) !== null) {
    const endpoint = match[1];
    const options = match[2];

    // זיהוי איזה endpoint
    let replacement = '';
    if (endpoint.includes('/send-message')) {
      replacement = 'await botGateway.sendMessage(phone, message)';
      changes.push('Replaced /send-message with botGateway.sendMessage');
    } else if (endpoint.includes('/send-notification')) {
      replacement =
        'await botGateway.sendNotification({ phone, type, driverName, driverId, reason })';
      changes.push(
        'Replaced /send-notification with botGateway.sendNotification'
      );
    } else if (endpoint.includes('/health')) {
      replacement = 'await botGateway.checkHealth()';
      changes.push('Replaced /health with botGateway.checkHealth');
    }
  }

  return { modified, changes };
}

/**
 * העברת routes/rides.js
 */
function migrateRidesRoutes(content) {
  const changes = [];
  let modified = content;

  // בדיקה אם יש קריאות לבוט
  const hasBotCalls =
    content.includes('BOT_URL') || content.includes('localhost:3001');

  if (!hasBotCalls) {
    return { modified, changes: ['No bot calls found - skipped'] };
  }

  // הוספת import
  if (!modified.includes("import botGateway from '../utils/botGateway.js'")) {
    const importSection = modified.match(/^(import.*\n)+/);
    if (importSection) {
      modified = modified.replace(
        importSection[0],
        importSection[0] + "import botGateway from '../utils/botGateway.js';\n"
      );
      changes.push('Added botGateway import');
    }
  }

  return { modified, changes };
}

/**
 * העברת קובץ כללי
 */
function migrateGenericFile(content, fileName) {
  const changes = [];
  let modified = content;

  // בדיקה אם צריך migration
  const needsMigration =
    content.includes('BOT_URL') || content.includes('localhost:3001');

  if (!needsMigration) {
    return { modified, changes: ['No bot calls found - skipped'] };
  }

  // הוספת import
  const importPath = fileName.includes('routes/')
    ? '../utils/botGateway.js'
    : './botGateway.js';

  if (!modified.includes(`import botGateway from '${importPath}'`)) {
    const importSection = modified.match(/^(import.*\n)+/);
    if (importSection) {
      modified = modified.replace(
        importSection[0],
        importSection[0] + `import botGateway from '${importPath}';\n`
      );
      changes.push('Added botGateway import');
    }
  }

  // החלפות כלליות
  // TODO: כאן אפשר להוסיף החלפות נוספות

  return { modified, changes };
}

// ===============================================
// 🎯 MAIN MIGRATION
// ===============================================

/**
 * מעבד קובץ בודד
 */
function processFile(relativeFilePath) {
  const filePath = path.join(CONFIG.projectRoot, relativeFilePath);

  log(`\nProcessing: ${relativeFilePath}`, 'cyan');

  // בדיקה אם הקובץ קיים
  if (!fileExists(filePath)) {
    report.warnings.push(`File not found: ${relativeFilePath}`);
    log(`  ⚠ File not found - skipping`, 'yellow');
    return;
  }

  try {
    // גיבוי
    if (!CONFIG.dryRun) {
      backupFile(filePath);
    }

    // קריאת תוכן
    const content = readFile(filePath);
    report.filesProcessed++;

    // בחירת פונקציית migration
    let result;
    const fileName = path.basename(relativeFilePath);

    if (fileName === 'dispatchManager.js') {
      result = migrateDispatchManager(content);
    } else if (fileName === 'bot.js' && relativeFilePath.includes('routes')) {
      result = migrateBotRoutes(content);
    } else if (
      fileName === 'rides.js' &&
      relativeFilePath.includes('routes')
    ) {
      result = migrateRidesRoutes(content);
    } else {
      result = migrateGenericFile(content, relativeFilePath);
    }

    // בדיקה אם היו שינויים
    if (result.changes.length === 0) {
      log(`  ℹ No changes needed`, 'blue');
      return;
    }

    // כתיבת קובץ
    if (!CONFIG.dryRun) {
      writeFile(filePath, result.modified);
      log(`  ✓ File updated`, 'green');
    } else {
      log(`  ✓ Would update file (dry-run)`, 'yellow');
    }

    // תיעוד שינויים
    report.filesModified++;
    report.changesMade.push({
      file: relativeFilePath,
      changes: result.changes,
    });

    result.changes.forEach((change) => {
      log(`    - ${change}`, 'green');
    });
  } catch (error) {
    report.errors.push({
      file: relativeFilePath,
      error: error.message,
    });
    log(`  ✗ Error: ${error.message}`, 'red');
  }
}

/**
 * פונקציה ראשית
 */
async function main() {
  logSection('🚀 BOT GATEWAY MIGRATION');

  // הצגת מצב
  if (CONFIG.dryRun) {
    log('🧪 Running in DRY-RUN mode (no files will be modified)\n', 'yellow');
  } else {
    log('⚠️  Running in LIVE mode (files will be modified)\n', 'red');
  }

  // יצירת תיקיית גיבויים
  if (!CONFIG.dryRun) {
    ensureDir(CONFIG.backupDir);
    log(`📁 Backups will be saved to: ${CONFIG.backupDir}\n`, 'cyan');
  }

  // העתקת botGateway.js
  logSection('📦 Installing botGateway.js');

  const botGatewaySource = path.join(__dirname, 'botGateway.js');
  const botGatewayDest = path.join(
    CONFIG.projectRoot,
    'utils',
    'botGateway.js'
  );

  if (fileExists(botGatewaySource)) {
    if (!CONFIG.dryRun) {
      ensureDir(path.dirname(botGatewayDest));
      fs.copyFileSync(botGatewaySource, botGatewayDest);
      log('✓ botGateway.js installed to utils/', 'green');
    } else {
      log('✓ Would install botGateway.js (dry-run)', 'yellow');
    }
  } else {
    log('⚠ botGateway.js not found - please copy it manually', 'yellow');
  }

  // עיבוד קבצים
  logSection('🔄 Migrating Files');

  FILES_TO_MIGRATE.forEach((file) => {
    processFile(file);
  });

  // הצגת דוח
  logSection('📊 MIGRATION REPORT');

  const duration = ((new Date() - report.startTime) / 1000).toFixed(2);

  console.log(`Time taken:       ${duration}s`);
  console.log(`Files processed:  ${report.filesProcessed}`);
  console.log(`Files modified:   ${report.filesModified}`);
  console.log(`Errors:           ${report.errors.length}`);
  console.log(`Warnings:         ${report.warnings.length}`);

  if (report.changesMade.length > 0) {
    log('\n✅ Changes Made:', 'green');
    report.changesMade.forEach(({ file, changes }) => {
      console.log(`\n  ${file}:`);
      changes.forEach((change) => {
        console.log(`    - ${change}`);
      });
    });
  }

  if (report.errors.length > 0) {
    log('\n❌ Errors:', 'red');
    report.errors.forEach(({ file, error }) => {
      console.log(`  ${file}: ${error}`);
    });
  }

  if (report.warnings.length > 0) {
    log('\n⚠️  Warnings:', 'yellow');
    report.warnings.forEach((warning) => {
      console.log(`  ${warning}`);
    });
  }

  // שמירת דוח ל-JSON
  const reportPath = path.join(
    CONFIG.backupDir || __dirname,
    'migration-report.json'
  );
  if (!CONFIG.dryRun) {
    ensureDir(path.dirname(reportPath));
    writeFile(reportPath, JSON.stringify(report, null, 2));
    log(`\n📄 Full report saved: ${reportPath}`, 'cyan');
  }

  // הוראות לאחר migration
  logSection('📝 NEXT STEPS');

  console.log(`
1. Review the changes in your files
2. Add to server.js initialization:

   import botGateway from './utils/botGateway.js';
   
   // Setup dispatchManager
   dispatchManager.setBotHandler(async (ride) => {
     return await botGateway.dispatch(ride);
   });

3. Test the bot connection:

   npm start
   curl http://localhost:3000/api/bot/stats

4. If everything works, you can delete the backup:

   rm -rf ${CONFIG.backupDir}
`);

  log('✅ Migration complete!', 'green');
}

// ===============================================
// 🚀 RUN
// ===============================================

main().catch((error) => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
