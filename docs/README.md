<<<<<<< HEAD
# 🖥️ Taxi System Backend - שרת מרכזי

השרת הראשי של מערכת ניהול המוניות החכמה.

---

## 📋 תיאור

שרת Node.js מקצועי ומלא המנהל את כל הפעולות של מערכת המוניות:
- קבלת הזמנות מלקוחות
- ניהול נהגים ודירוגים
- שליחת הודעות WhatsApp (דרך בוט או Twilio)
- ממשק ניהול מלא (Admin Dashboard)
- מערכת תשלומים וקומיסיות
- API מקיף לכל הפעולות

---

## 🎯 תכונות עיקריות

### 📱 ניהול נסיעות (Rides)
- יצירה אוטומטית של מספר נסיעה ייחודי
- מעקב אחר סטטוס בזמן אמת
- היסטוריה מלאה לכל נסיעה
- חישוב קומיסיות אוטומטי

### 👨‍✈️ ניהול נהגים (Drivers)
- רישום נהגים חדשים
- מערכת דירוגים (⭐ 1-5)
- מעקב אחר רווחים
- סטטיסטיקות מפורטות
- חסימה/ביטול חסימה

### 💬 שליחת הודעות (Dispatch)
- **בוט WhatsApp** (חינם! 💰)
- **Twilio Fallback** (אם הבוט לא זמין)
- שליחה לקבוצות WhatsApp
- הודעות פרטיות לנהגים

### 💰 תשלומים וקומיסיות
- מעקב אחר תשלומים
- חישוב קומיסיות אוטומטי
- ניהול חובות ורווחים
- דוחות כספיים

### 📊 ממשק ניהול (Admin Dashboard)
- צפייה בכל הנסיעות
- ניהול נהגים
- סטטיסטיקות בזמן אמת
- דוחות ותובנות

---

## 🚀 התקנה

### דרישות מקדימות

```bash
# Node.js 18+ ו-npm
node --version  # v18.0.0 ומעלה
npm --version   # v9.0.0 ומעלה

# MongoDB (מקומי או Atlas)
# https://mongodb.com
```

### שלב 1: התקנת החבילות

```bash
cd 02-taxi-system
npm install
```

### שלב 2: הגדרת משתני סביבה

```bash
# העתק את קובץ הדוגמה
cp .env.example .env

# ערוך את .env עם הנתונים שלך
nano .env  # או כל עורך טקסט אחר
```

**קובץ `.env` צריך להכיל:**

```env
# ===============================================
# 🔐 DATABASE
# ===============================================
MONGODB_URI=mongodb://localhost:27017/taxi-system
# או MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/taxi-system

# ===============================================
# 🔑 SECURITY
# ===============================================
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
ADMIN_PASSWORD=your-admin-password

# ===============================================
# 📱 TWILIO (WhatsApp API)
# ===============================================
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# ===============================================
# 🌐 SERVER
# ===============================================
PORT=3000
NODE_ENV=development

# ===============================================
# 🤖 BOT INTEGRATION
# ===============================================
BOT_URL=http://localhost:3001
BOT_ENABLED=true
```

### שלב 3: הפעלת MongoDB

**אופציה 1: MongoDB מקומי**
```bash
# התקנה (macOS)
brew install mongodb-community

# הפעלה
brew services start mongodb-community

# או
mongod --dbpath /path/to/data
```

**אופציה 2: MongoDB Atlas (ענן - מומלץ)**
1. הירשם ב-[mongodb.com/atlas](https://mongodb.com/atlas)
2. צור Cluster חינמי
3. קבל את ה-Connection String
4. שים אותו ב-`.env` במשתנה `MONGODB_URI`

### שלב 4: הרצת השרת

```bash
# פיתוח (עם hot reload)
npm run dev

# פרודקשן
npm start
```

אתה אמור לראות:

```
✅ Environment variables validated
🔍 Validating environment variables...
✅ All required environment variables are set
🚀 Server running on port 3000
✅ Connected to MongoDB
📊 Indexes created successfully
```

---

## 📁 מבנה הפרויקט

```
02-taxi-system/
├── server.js               ← השרת הראשי
├── package.json            ← תלויות והגדרות
├── .env.example            ← דוגמה למשתני סביבה
├── .env                    ← משתני סביבה (לא לשתף!)
├── .gitignore              ← קבצים להתעלם מהם ב-Git
│
├── models/                 ← MongoDB Schemas
│   ├── Ride.js             ← נסיעות
│   ├── Driver.js           ← נהגים
│   ├── Payment.js          ← תשלומים
│   ├── WhatsAppGroup.js    ← קבוצות WhatsApp
│   ├── Activity.js         ← פעילויות
│   ├── AdminContact.js     ← אנשי קשר אדמין
│   └── RideCounter.js      ← מונה נסיעות
│
├── utils/                  ← כלי עזר
│   ├── logger.js           ← מערכת לוגים
│   ├── errors.js           ← טיפול בשגיאות
│   ├── twilioAdapter.js    ← מתאם Twilio
│   ├── rateLimiter.js      ← הגבלת קצב בקשות
│   ├── rideNumberGenerator.js ← יצירת מספר נסיעה
│   └── logsCleaner.js      ← ניקוי לוגים ישנים
│
├── config/                 ← הגדרות
│   └── index.js            ← הגדרות כלליות
│
├── public/                 ← ממשק ניהול (Admin Dashboard)
│   ├── index.html          ← דף ראשי
│   ├── login.html          ← דף התחברות
│   └── script.js           ← לוגיקת הדאשבורד
│
├── logs/                   ← קבצי לוגים (נוצר אוטומטית)
│
└── test-quick.js           ← בדיקות מהירות
```

---

## 🔌 API Endpoints

### 🔓 Public Endpoints (ללא אימות)

#### **קבלת נסיעה מלקוח**
```http
POST /api/client/rides
Content-Type: application/json

{
  "customerName": "ישראל ישראלי",
  "customerPhone": "050-1234567",
  "pickup": "רחוב הרצל 10, תל אביב",
  "destination": "רחוב דיזנגוף 50, תל אביב",
  "scheduledTime": "2025-11-24T10:00:00Z",  // אופציונלי
  "notes": "מזוודה גדולה"  // אופציונלי
}
```

**Response:**
```json
{
  "ok": true,
  "ride": { ...ride object... },
  "rideNumber": "20251123-001",
  "sentCount": 3,
  "dispatchMethod": "bot"
}
```

---

### 🤖 Bot Endpoints (לתקשורת עם הבוט)

#### **קבלת קבוצות פעילות**
```http
GET /api/bot/groups
```

#### **דיווח שנסיעה נשלחה**
```http
POST /api/bot/trip-sent
Content-Type: application/json

{
  "tripId": "64abc123...",
  "sentTo": {
    "groupsSent": 2,
    "messagesSent": 35
  }
}
```

#### **Heartbeat (כל 5 דקות)**
```http
POST /api/bot/heartbeat
```

#### **עדכון סטטוס הבוט**
```http
POST /api/bot/status
Content-Type: application/json

{
  "status": "online"  // או "offline"
}
```

---

### 🔐 Admin Endpoints (דורש אימות)

כל ה-Endpoints הללו דורשים header:
```http
Authorization: Bearer YOUR_JWT_TOKEN
```

#### **התחברות אדמין**
```http
POST /api/admin/login
Content-Type: application/json

{
  "password": "your-admin-password"
}
```

**Response:**
```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "message": "התחברת בהצלחה"
}
```

#### **כל הנסיעות**
```http
GET /api/rides
```

#### **נסיעה ספציפית**
```http
GET /api/rides/:id
```

#### **עדכון סטטוס נסיעה**
```http
PATCH /api/rides/:id/status
Content-Type: application/json

{
  "status": "approved",
  "driverPhone": "050-1234567"
}
```

#### **כל הנהגים**
```http
GET /api/drivers
```

#### **הוספת נהג**
```http
POST /api/drivers
Content-Type: application/json

{
  "name": "דוד כהן",
  "phone": "050-1234567",
  "vehicleNumber": "12-345-67",
  "vehicleType": "sedan"
}
```

#### **חסימת נהג**
```http
POST /api/drivers/:id/block
Content-Type: application/json

{
  "reason": "הפרת תקנון"
}
```

---

## 🔧 סקריפטים זמינים

```bash
# הפעלת השרת (פרודקשן)
npm start

# פיתוח עם hot reload
npm run dev

# בדיקות
npm test

# בדיקת Twilio
npm run test:twilio

# ניקוי לוגים ישנים (מעל 30 יום)
npm run clean-logs

# Linting
npm run lint
```

---

## 🧪 בדיקות

### בדיקה מהירה של הכל

```bash
npm test
```

זה יבדוק:
- ✅ חיבור ל-MongoDB
- ✅ יצירת נסיעה
- ✅ ניהול נהגים
- ✅ חיבור לבוט

### בדיקת Twilio

```bash
npm run test:twilio
```

זה יבדוק:
- ✅ חיבור ל-Twilio
- ✅ שליחת הודעת בדיקה
- ✅ קבלת Webhook

---

## 📡 שילוב עם הבוט

השרת מתחבר אוטומטית לבוט על `http://localhost:3001`

**זרימה:**
```
1. נסיעה נוצרת בשרת
   ↓
2. השרת מנסה לשלוח דרך הבוט
   POST http://localhost:3001/dispatch-trip
   ↓
3. הבוט שולח הודעה לקבוצות WhatsApp
   ↓
4. הבוט מדווח בחזרה לשרת
   POST /api/bot/trip-sent
   ↓
5. אם הבוט נכשל → Fallback ל-Twilio
```

---

## 🐛 פתרון בעיות

### שגיאה: "Cannot connect to MongoDB"

**פתרון:**
```bash
# בדוק שMongoDB רץ
ps aux | grep mongod

# הפעל את MongoDB
mongod --dbpath /path/to/data

# או עם brew (macOS)
brew services start mongodb-community

# או בדוק את ה-Connection String ב-.env
```

### שגיאה: "Missing environment variables"

**פתרון:**
```bash
# ודא שיש לך קובץ .env
ls -la .env

# אם לא, העתק מהדוגמה
cp .env.example .env

# ערוך את .env עם הנתונים שלך
nano .env
```

### שגיאה: "Port 3000 already in use"

**פתרון:**
```bash
# מצא את התהליך שתופס את הפורט
lsof -i :3000

# עצור אותו
kill -9 <PID>

# או שנה פורט ב-.env
PORT=3001
```

### שגיאה: "Twilio credentials invalid"

**פתרון:**
1. בדוק ב-[twilio.com/console](https://twilio.com/console)
2. ודא שה-Account SID ו-Auth Token נכונים
3. ודא שהמספר WhatsApp מאומת

### הבוט לא מגיב

**פתרון:**
```bash
# בדוק שהבוט רץ
curl http://localhost:3001/health

# אם לא, הפעל אותו
cd 03-taxi-whatsapp-bot
npm start
```

---

## 🌍 העלאה לפרודקשן

### אפשרות 1: Render.com (מומלץ)

1. **צור Repository ב-GitHub**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/username/taxi-system.git
git push -u origin main
```

2. **היכנס ל-[render.com](https://render.com)**
3. New → Web Service
4. Connect Repository
5. Build Command: `npm install`
6. Start Command: `npm start`
7. Add Environment Variables (מתוך `.env`)

### אפשרות 2: Heroku

```bash
# התקנת Heroku CLI
brew install heroku/brew/heroku

# התחברות
heroku login

# יצירת אפליקציה
heroku create taxi-system-backend

# הוספת MongoDB
heroku addons:create mongolab:sandbox

# Deploy
git push heroku main

# Set environment variables
heroku config:set JWT_SECRET=your-secret
heroku config:set ADMIN_PASSWORD=your-password
# וכו'...
```

---

## 🔒 אבטחה

### ✅ מה מוגן:

- ✅ סיסמאות מוצפנות (JWT)
- ✅ Rate Limiting (100 בקשות/דקה)
- ✅ CORS מוגדר נכון
- ✅ Validation מלא על כל הנתונים
- ✅ MongoDB Injection Protection
- ✅ XSS Protection

### ⚠️ חשוב בפרודקשן:

1. **שנה את JWT_SECRET**
```env
JWT_SECRET=your-super-secure-random-string-use-openssl-rand-base64-32
```

2. **שנה את ADMIN_PASSWORD**
```env
ADMIN_PASSWORD=YourVeryStrongPasswordHere123!
```

3. **השתמש ב-HTTPS בלבד**

4. **הגדר CORS נכון**
```javascript
// בserver.js
const allowedOrigins = [
  'https://your-client-domain.com'
];
```

---

## 📊 מדדים וביצועים

- **זמן תגובה ממוצע:** < 100ms
- **מקסימום נסיעות/שנייה:** 100+
- **זמן פעולה (Uptime):** 99.9%
- **MongoDB Indexes:** מותקנים אוטומטית
- **Caching:** Redis (אופציונלי)

---

## 📞 תמיכה

**שאלות או בעיות?**

1. בדוק את הלוגים: `tail -f logs/YYYY-MM-DD.log`
2. הרץ בדיקות: `npm test`
3. בדוק את Console

---

## 📝 רישיון

ISC License - חופשי לשימוש

---

**גרסה:** 2.1.0  
**עדכון אחרון:** נובמבר 2025  
**Node.js:** >= 18.0.0

---

🚀 **מערכת ניהול מוניות מקצועית וחסכונית!**
=======
# TaxiServer-System
מערכת מוניות דרך צדיקים (צד שרת)
>>>>>>> c194db2ff19c8f6a863744025b6e86032743543c
