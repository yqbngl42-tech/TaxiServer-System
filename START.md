# 🚀 התחלה מהירה - 5 דקות

מדריך מהיר להפעלת השרת המרכזי.

---

## ⚡ 3 צעדים פשוטים

### 1️⃣ התקנה
```bash
cd 02-taxi-system
npm install
```
*(2-3 דקות)*

---

### 2️⃣ הגדרות
```bash
# העתק את הדוגמה
cp .env.example .env

# ערוך את .env
nano .env  # או notepad .env בWindows
```

**מינימום נדרש ב-.env:**
```env
MONGODB_URI=mongodb://localhost:27017/taxi-system
JWT_SECRET=change-this-secret-key
ADMIN_PASSWORD=1122334455
PORT=3000
```

---

### 3️⃣ הפעלה
```bash
npm start
```

**אתה אמור לראות:**
```
✅ All required environment variables are set
🚀 Server running on port 3000
✅ Connected to MongoDB
```

---

## 🎯 בדיקה שהכל עובד

### בדיקה 1: השרת חי
```bash
curl http://localhost:3000/health
```
**תוצאה:**
```json
{"status":"ok","uptime":123}
```

### בדיקה 2: התחברות אדמין
פתח בדפדפן:
```
http://localhost:3000/login.html
```
**סיסמה:** `1122334455` (או מה שהגדרת ב-.env)

### בדיקה 3: יצירת נסיעה
```bash
curl -X POST http://localhost:3000/api/client/rides \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "ישראל ישראלי",
    "customerPhone": "050-1234567",
    "pickup": "תל אביב",
    "destination": "ירושלים"
  }'
```

---

## 🐛 בעיות נפוצות

### "Cannot connect to MongoDB"

**פתרון מהיר - MongoDB מקומי:**
```bash
# macOS
brew install mongodb-community
brew services start mongodb-community

# או הורד מ-
# https://mongodb.com/try/download/community
```

**פתרון חלופי - MongoDB Atlas (ענן, חינם):**
1. הירשם ב-[mongodb.com/atlas](https://mongodb.com/atlas)
2. צור Cluster
3. לחץ "Connect" → "Connect your application"
4. העתק את ה-Connection String
5. שים אותו ב-`.env`:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/taxi-system
```

### "Port 3000 already in use"

**פתרון:**
```bash
# שנה פורט ב-.env
PORT=3001
```

### "Missing Twilio credentials"

**אין בעיה!** 
- הבוט יעבוד בלי Twilio
- Twilio זה רק fallback
- אם רוצה להוסיף Twilio - הירשם ב-[twilio.com](https://twilio.com)

---

## ✅ מה הלאה?

1. **✅ השרת רץ?** מעולה!
2. **🚖 הפעל את ממשק הלקוח** (01-taxi-client)
3. **🤖 הפעל את הבוט** (03-taxi-whatsapp-bot)

---

## 📖 למידע נוסף

ראה את [README.md](README.md) המלא למדריך מקיף.

---

**זמן התקנה: ~5 דקות ⚡**  
**זמן הבנה: ~10 דקות 📚**
