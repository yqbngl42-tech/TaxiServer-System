# 🚖 מערכת ניהול מוניות "דרך צדיקים" - גרסה משודרגת 2.2.0

## 🎉 מה חדש בגרסה זו?

### ⭐ תכונות חדשות:

1. **🔒 אבטחה מתקדמת**
   - CORS מאובטח עם whitelist
   - בדיקות חוזק סיסמה
   - Headers אבטחה נוספים

2. **🔌 WebSockets - עדכונים בזמן אמת**
   - עדכוני נסיעות live
   - התראות למנהלים
   - Dashboard אינטראקטיבי

3. **🤖 בוט WhatsApp אינטראקטיבי**
   - כפתורים בWhatsApp
   - זרימת עבודה אוטומטית
   - עדכוני סטטוס מנהגים

4. **⚙️ ניהול תצורה מרכזי**
   - כל ההגדרות במקום אחד
   - קל לשינוי ועדכון

## 📦 התקנה

### דרישות מקדימות:
- Node.js 18+
- MongoDB
- Twilio Account

### שלבים:

```bash
# 1. התקן dependencies
npm install

# 2. צור קובץ .env
cp .env.example .env

# 3. צור סיסמה חזקה
npm run generate-password

# 4. ערוך את .env עם הערכים שלך

# 5. הרץ את השרת
npm start
```

## 🔐 יצירת סיסמה חזקה

```bash
npm run generate-password
```

תקבל תפריט אינטראקטיבי:

```
╔════════════════════════════════════════════════╗
║     🔐 מחולל סיסמאות - Taxi System            ║
╚════════════════════════════════════════════════╝

אפשרויות:
  1 - הכנס סיסמה שלך
  2 - צור סיסמה אוטומטית
  3 - צור JWT Secret
  4 - יציאה
```

## ⚙️ הגדרת .env

```env
# חובה
MONGODB_URI=mongodb://localhost:27017/taxi-system
JWT_SECRET=your-jwt-secret-here
ADMIN_PASSWORD=your-password-here

# Twilio
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# Server
PORT=3000
NODE_ENV=development

# CORS
FRONTEND_URL=https://your-domain.com
ALLOWED_ORIGINS=https://domain1.com,https://domain2.com

# Features
ENABLE_WEBSOCKETS=true
```

## 🚀 הרצה

### Development:
```bash
npm run dev
```

### Production:
```bash
NODE_ENV=production npm start
```

## 📡 API Endpoints חדשים

### קבלת נסיעה לפי מספר:
```http
GET /api/rides/number/:rideNumber
```

### שיוך נסיעה לנהג:
```http
POST /api/rides/:id/assign
Content-Type: application/json

{
  "driverPhone": "0501234567",
  "driverName": "דוד כהן"
}
```

### שליחת דירוג:
```http
POST /api/rides/:id/rating
Content-Type: application/json

{
  "rating": 5
}
```

### סטטיסטיקת WebSockets:
```http
GET /api/websocket/stats
Authorization: Bearer <JWT_TOKEN>
```

## 🔌 שימוש ב-WebSockets

### בצד הלקוח (Dashboard):

```html
<script src="/socket.io/socket.io.js"></script>

<script>
const token = localStorage.getItem('token');
const socket = io({
  auth: { token }
});

// חיבור הצליח
socket.on('connected', (data) => {
  console.log('✅ מחובר:', data);
});

// נסיעה חדשה
socket.on('ride:new', (data) => {
  console.log('🚖 נסיעה חדשה:', data.ride);
  addRideToTable(data.ride);
});

// עדכון נסיעה
socket.on('ride:updated', (data) => {
  console.log('🔄 עדכון:', data);
  updateRideInTable(data.rideId, data);
});

// הרשמה לכל הנסיעות
socket.emit('subscribe:all_rides');
</script>
```

## 🤖 אינטגרציה עם בוט

הבוט מוגדר בתיקייה `03-taxi-whatsapp-bot-UPGRADED`

ראה README בתיקייה לפרטים נוספים.

## 📊 ארכיטקטורה

```
┌─────────────┐
│   Client    │
│  (Browser)  │
└──────┬──────┘
       │ HTTP/WebSocket
       ↓
┌─────────────┐
│   Server    │ ←→ MongoDB
│  (Port 3000)│
└──────┬──────┘
       │ HTTP
       ↓
┌─────────────┐
│  WhatsApp   │
│    Bot      │ ←→ Twilio
│  (Port 3001)│
└─────────────┘
```

## 🔒 אבטחה

### 7 שכבות הגנה:

1. ✅ Input Validation (client + server)
2. ✅ Password Hashing (bcrypt)
3. ✅ JWT Authentication
4. ✅ Security Middleware (Helmet, XSS-Clean)
5. ✅ Rate Limiting (100 req/min)
6. ✅ CORS מוגבל
7. ✅ MongoDB Sanitization

## 📝 Scripts זמינים

```bash
npm start              # הרצת שרת
npm run dev            # פיתוח (auto-reload)
npm run generate-password  # יצירת סיסמה
npm test               # בדיקות
npm run clean-logs     # ניקוי לוגים ישנים
```

## 🆘 פתרון בעיות

### WebSockets לא עובד:
```bash
# בדוק ש-socket.io מותקן
npm list socket.io

# בדוק logs
tail -f logs/YYYY-MM-DD.log
```

### CORS חוסם:
```env
# הוסף את הדומיין ל-.env
ALLOWED_ORIGINS=https://your-domain.com
```

### MongoDB לא מתחבר:
```bash
# בדוק את החיבור
mongosh "mongodb://localhost:27017/taxi-system"
```

## 📄 קבצים חשובים

```
02-taxi-system-UPGRADED/
├── server.js                    # ← השרת הראשי (משודרג)
├── config/
│   ├── index.js                 # ← הגדרות מרכזיות
│   └── cors-config.js           # ← CORS חדש
├── utils/
│   └── websockets.js            # ← WebSockets חדש
├── generate-password-advanced.js # ← מחולל סיסמאות חדש
├── .env.example                 # ← תבנית .env
└── package.json                 # ← עם socket.io
```

## 🎯 זרימת עבודה עם הבוט החדש

```
1. לקוח מזמין נסיעה
   ↓
2. שרת יוצר נסיעה ושולח לבוט
   ↓
3. בוט שולח לקבוצה הודעה עם קישור
   ↓
4. נהג לוחץ על קישור → צ'אט פרטי עם Twilio
   ↓
5. בוט שולח כפתורים: "לקחת נסיעה" / "ביטול"
   ↓
6. נהג לוחץ "לקחת" → בוט מעדכן שרת
   ↓
7. בוט שולח כפתורי סטטוס: "בדרך" / "הגעתי" / "סיימתי"
   ↓
8. נהג מעדכן סטטוס → WebSocket מעדכן Dashboard
```

## 📞 תמיכה

אם נתקעת:
1. בדוק Logs: `logs/YYYY-MM-DD.log`
2. בדוק Console בדפדפן (F12)
3. בדוק שכל ה-env variables מוגדרים
4. בדוק חיבור MongoDB

## 📈 גרסאות

- **v2.2.0** - WebSockets, בוט אינטראקטיבי, CORS מאובטח
- **v2.1.0** - תיקוני אבטחה
- **v2.0.0** - גרסה ראשונה

## 📜 רישיון

ISC

---

**גרסה:** 2.2.0  
**תאריך:** 24 נובמבר 2025  
**סטטוס:** ✅ מוכן לפרודקשן

🚀 **בהצלחה!**
