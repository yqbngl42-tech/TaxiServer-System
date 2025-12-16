# 🚖 מערכת ניהול מוניות חכמה - שרת Backend

## 📦 גרסה 2.1.0 - FIXED & ENHANCED

### ✨ מה חדש בגרסה זו

- ✅ **תיקון מלא של התקשורת עם הבוט** - כל ה-API endpoints מוכנים ועובדים
- ✅ **אינטגרציה אוטומטית** - נסיעות חדשות נשלחות לבוט באופן אוטומטי
- ✅ **טיפול בתגובות נהגים** - נהגים יכולים להגיב ולתפוס נסיעות דרך WhatsApp
- ✅ **Health Check משופר** - מוודא שהשרת, MongoDB והבוט פועלים
- ✅ **MongoDB Pool מותאם** - תמיכה ב-2000 נהגים בו-זמנית
- ✅ **Security Updates** - אבטחה משופרת ו-validation טוב יותר

---

## 🚀 התקנה מהירה

### 1. התקנת Dependencies

```bash
npm install
```

### 2. הגדרת Environment Variables

```bash
# העתק את קובץ הדוגמה
cp .env.example .env

# ערוך את .env עם הערכים שלך
nano .env
```

**חובה להגדיר:**
- `MONGODB_URI` - כתובת MongoDB שלך
- `JWT_SECRET` - מפתח סודי (32+ תווים)
- `ADMIN_PASSWORD` - סיסמת מנהל חזקה
- `TWILIO_ACCOUNT_SID` - Twilio Account SID
- `TWILIO_AUTH_TOKEN` - Twilio Auth Token
- `TWILIO_WHATSAPP_FROM` - מספר WhatsApp של Twilio
- `BOT_URL` - כתובת הבוט (בדרך כלל `http://localhost:3001`)

### 3. הפעלת השרת

```bash
# פיתוח (עם auto-reload)
npm run dev

# פרודקשן
npm start
```

השרת יפעל על: **http://localhost:3000**

---

## 📡 API Endpoints

### 🔐 Authentication
- `POST /api/login` - התחברות למערכת
- `POST /api/logout` - התנתקות

### 🚖 Rides (נסיעות)
- `POST /api/client/rides` - יצירת נסיעה (ללא authentication)
- `GET /api/rides` - קבלת כל הנסיעות (עם pagination)
- `POST /api/rides` - יצירת נסיעה (admin)
- `PUT /api/rides/:id/status` - עדכון סטטוס נסיעה
- `POST /api/rides/respond` - נהג מגיב על נסיעה (מהבוט)
- `POST /api/rides/:id/assign` - שיוך נסיעה לנהג
- `POST /api/rides/:id/rating` - דירוג נסיעה

### 🤖 Bot Integration
- `GET /api/bot/groups` - קבלת קבוצות WhatsApp פעילות
- `POST /api/bot/trip-sent` - עדכון שנסיעה נשלחה
- `POST /api/bot/heartbeat` - heartbeat מהבוט
- `POST /api/bot/status` - עדכון סטטוס הבוט
- `GET /api/bot/rides/:id` - קבלת נסיעה לפי ID
- `GET /api/bot/stats` - סטטיסטיקות מערכת

### 👨‍✈️ Drivers (נהגים)
- `GET /api/drivers` - קבלת כל הנהגים
- `POST /api/drivers` - רישום נהג חדש
- `PUT /api/drivers/:id` - עדכון נהג
- `POST /api/drivers/:id/block` - חסימת נהג
- `POST /api/drivers/:id/unblock` - ביטול חסימה
- `POST /api/drivers/:id/verify-document` - אימות מסמך

### 👥 Groups (קבוצות)
- `GET /api/groups` - קבלת כל הקבוצות
- `POST /api/groups` - יצירת קבוצה
- `PUT /api/groups/:id` - עדכון קבוצה
- `DELETE /api/groups/:id` - מחיקת קבוצה

### 📊 Stats & Health
- `GET /health` - בדיקת תקינות המערכת
- `GET /api/stats` - סטטיסטיקות כלליות
- `GET /api/analytics/rides` - ניתוח נסיעות

---

## 🔧 Scripts זמינים

```bash
# הפעלת השרת (פיתוח)
npm run dev

# הפעלת השרת (פרודקשן)
npm start

# הרצת טסטים
npm test

# בדיקת חיבור Twilio
npm run test:twilio

# ניקוי קבצי לוג ישנים
npm run clean-logs

# יצירת hash לסיסמה
npm run generate-hash

# יצירת סיסמה חזקה
npm run generate-password
```

---

## 🔐 אבטחה

המערכת כוללת:
- ✅ JWT Authentication
- ✅ Helmet.js (HTTP headers security)
- ✅ Rate Limiting
- ✅ MongoDB Sanitization
- ✅ XSS Protection
- ✅ CORS Configuration
- ✅ Twilio Signature Validation

---

## 📊 MongoDB Configuration

המערכת מוגדרת לתמוך ב-**2000 נהגים בו-זמנית**:

```javascript
{
  maxPoolSize: 200,    // מספר חיבורים מקסימלי
  minPoolSize: 20,     // מספר חיבורים מינימלי
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: 5000,
  maxIdleTimeMS: 10000
}
```

---

## 🤖 אינטגרציה עם הבוט

כאשר נסיעה חדשה נוצרת:
1. השרת שומר את הנסיעה ב-MongoDB
2. השרת שולח את הנסיעה לבוט ב-`POST /dispatch`
3. הבוט מפיץ את הנסיעה לכל הקבוצות ב-WhatsApp
4. נהג מגיב עם מספר הנסיעה
5. הבוט מעביר את התגובה לשרת ב-`POST /api/rides/respond`
6. השרת נועל את הנסיעה לנהג הראשון שהגיב

---

## 🔄 WebSockets (אופציונלי)

להפעלת עדכונים בזמן אמת:

```bash
# ב-.env
ENABLE_WEBSOCKETS=true
```

Events זמינים:
- `new-ride` - נסיעה חדשה נוצרה
- `ride-update` - נסיעה עודכנה
- `driver-online` - נהג התחבר
- `driver-offline` - נהג התנתק

---

## 📝 Logging

המערכת כוללת logging מקצועי:
- **Console logs** - כל הפעילות
- **File logs** - נשמר ב-`logs/` directory
- **Auto cleanup** - קבצים ישנים מנוקים אוטומטית

רמות Log:
- `debug` - הכל
- `info` - מידע כללי (ברירת מחדל)
- `warn` - אזהרות
- `error` - שגיאות בלבד

---

## 🧪 Testing

```bash
# טסט כללי
npm test

# טסט Twilio
npm run test:twilio

# בדיקת Health
curl http://localhost:3000/health

# בדיקת Login
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"password":"your-password"}'
```

---

## 🐛 Troubleshooting

### הבוט לא מקבל נסיעות
- ✅ בדוק ש-`BOT_URL` מוגדר ב-.env
- ✅ בדוק שהבוט פועל על אותו port
- ✅ בדוק `/health` endpoint של השרת והבוט

### MongoDB Connection Failed
- ✅ בדוק ש-MongoDB פועל: `systemctl status mongod`
- ✅ בדוק את ה-`MONGODB_URI` ב-.env
- ✅ בדוק שיש לך גישה ל-database

### Twilio לא עובד
- ✅ בדוק credentials ב-.env
- ✅ הרץ: `npm run test:twilio`
- ✅ בדוק את ה-webhook URL בTwilio Console

---

## 📚 תיעוד נוסף

- [COMPLETE-GUIDE.md](./COMPLETE-GUIDE.md) - מדריך מקיף מלא
- [DASHBOARD-GUIDE.md](./DASHBOARD-GUIDE.md) - מדריך Dashboard
- [REGISTRATION-GUIDE.md](./REGISTRATION-GUIDE.md) - מדריך רישום נהגים
- [SECURITY-FIXES.md](./SECURITY-FIXES.md) - תיקוני אבטחה

---

## 🆘 תמיכה

בעיות? שאלות?
1. בדוק את הלוגים: `logs/combined.log`
2. הרץ health check: `curl http://localhost:3000/health`
3. בדוק את התיעוד המלא

---

## 📄 רישיון

ISC License

---

**מערכת מוניות חכמה v2.1.0 - מוכן לפרודקשן! 🚀**
