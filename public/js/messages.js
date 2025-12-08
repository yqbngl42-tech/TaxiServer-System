// ============================================
// 📱 MESSAGES LOGIC - ניהול הודעות מלא
// ============================================

class MessagesManager {
  constructor() {
    this.templates = [];
    this.history = [];
  }

  // ============================================
  // 📤 SEND MESSAGE
  // ============================================
  showSendForm() {
    const container = document.getElementById('sendMessageForm');
    if (!container) return;
    
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3><i class="fas fa-paper-plane"></i> שליחת הודעה</h3>
        </div>
        <div class="card-body">
          <div class="form-group">
            <label>שלח ל:</label>
            <select class="form-control" id="recipientType" onchange="messagesManager.updateRecipients()">
              <option value="">-- בחר --</option>
              <option value="single-driver">נהג בודד</option>
              <option value="all-drivers">כל הנהגים</option>
              <option value="active-drivers">נהגים פעילים בלבד</option>
              <option value="drivers-by-city">נהגים לפי עיר</option>
              <option value="single-customer">לקוח בודד</option>
              <option value="all-customers">כל הלקוחות</option>
              <option value="vip-customers">לקוחות VIP</option>
            </select>
          </div>

          <div class="form-group" id="recipientDetailsContainer" style="display:none;">
            <!-- Will be filled dynamically -->
          </div>

          <div class="form-group">
            <label>סוג הודעה:</label>
            <select class="form-control" id="messageType">
              <option value="text">טקסט בלבד</option>
              <option value="image">תמונה + טקסט</option>
              <option value="file">קובץ</option>
            </select>
          </div>

          <div class="form-group">
            <label>תוכן ההודעה:</label>
            <textarea class="form-control" id="messageContent" rows="6" 
                      placeholder="כתוב את ההודעה כאן...&#10;&#10;משתנים זמינים:&#10;{name} - שם&#10;{id} - מזהה&#10;{date} - תאריך"></textarea>
          </div>

          <div class="form-group" id="imageUpload" style="display:none;">
            <label>העלה תמונה:</label>
            <input type="file" class="form-control" id="messageImage" accept="image/*">
          </div>

          <div class="form-group">
            <label>תזמון:</label>
            <div class="radio-group">
              <label>
                <input type="radio" name="schedule" value="now" checked> שלח עכשיו
              </label>
              <label>
                <input type="radio" name="schedule" value="scheduled"> תזמן לשליחה
              </label>
            </div>
          </div>

          <div class="form-group" id="scheduleTime" style="display:none;">
            <label>תאריך ושעה:</label>
            <input type="datetime-local" class="form-control" id="scheduledTime">
          </div>

          <div class="form-group">
            <label>תבנית מוכנה:</label>
            <select class="form-control" id="templateSelect" onchange="messagesManager.loadTemplate()">
              <option value="">-- בחר תבנית --</option>
              <option value="welcome">ברוכים הבאים</option>
              <option value="reminder">תזכורת</option>
              <option value="update">עדכון</option>
              <option value="promo">מבצע</option>
            </select>
          </div>

          <div class="message-preview">
            <h4>תצוגה מקדימה:</h4>
            <div class="preview-box" id="messagePreview">
              <p>התצוגה המקדימה תופיע כאן...</p>
            </div>
          </div>

          <div class="form-actions">
            <button class="btn btn-primary" onclick="messagesManager.sendMessage()">
              <i class="fas fa-paper-plane"></i> שלח הודעה
            </button>
            <button class="btn btn-secondary" onclick="messagesManager.clearForm()">
              <i class="fas fa-eraser"></i> נקה
            </button>
          </div>
        </div>
      </div>
    `;

    this.loadTemplatesList();
    this.setupFormListeners();
  }

  setupFormListeners() {
    // Schedule radio buttons
    document.querySelectorAll('input[name="schedule"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const scheduleTime = document.getElementById('scheduleTime');
        scheduleTime.style.display = e.target.value === 'scheduled' ? 'block' : 'none';
      });
    });

    // Message type
    document.getElementById('messageType')?.addEventListener('change', (e) => {
      const imageUpload = document.getElementById('imageUpload');
      imageUpload.style.display = e.target.value === 'image' ? 'block' : 'none';
    });

    // Content change - update preview
    document.getElementById('messageContent')?.addEventListener('input', () => {
      this.updatePreview();
    });
  }

  updateRecipients() {
    const type = document.getElementById('recipientType').value;
    const container = document.getElementById('recipientDetailsContainer');
    
    if (!type) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';

    if (type === 'single-driver') {
      container.innerHTML = `
        <label>בחר נהג:</label>
        <select class="form-control" id="selectedDriver">
          <option value="">טוען...</option>
        </select>
      `;
      this.loadDriversList();
    } else if (type === 'drivers-by-city') {
      container.innerHTML = `
        <label>בחר עיר:</label>
        <select class="form-control" id="selectedCity">
          <option value="tel-aviv">תל אביב</option>
          <option value="jerusalem">ירושלים</option>
          <option value="haifa">חיפה</option>
          <option value="beersheba">באר שבע</option>
        </select>
      `;
    } else if (type === 'single-customer') {
      container.innerHTML = `
        <label>בחר לקוח:</label>
        <select class="form-control" id="selectedCustomer">
          <option value="">טוען...</option>
        </select>
      `;
      this.loadCustomersList();
    } else {
      container.innerHTML = `<p class="info-text">ההודעה תישלח לכל הקבוצה</p>`;
    }
  }

  async loadDriversList() {
    try {
      const response = await fetch('/api/drivers?active=true');
      if (!response.ok) throw new Error('Failed');
      
      const drivers = await response.json();
      const select = document.getElementById('selectedDriver');
      
      select.innerHTML = '<option value="">-- בחר נהג --</option>';
      drivers.forEach(driver => {
        select.innerHTML += `<option value="${driver._id}">${driver.name} (${driver.driverId})</option>`;
      });
      
    } catch (error) {
      console.error('Error:', error);
    }
  }

  async loadCustomersList() {
    try {
      const response = await fetch('/api/customers');
      if (!response.ok) throw new Error('Failed');
      
      const customers = await response.json();
      const select = document.getElementById('selectedCustomer');
      
      select.innerHTML = '<option value="">-- בחר לקוח --</option>';
      customers.forEach(customer => {
        select.innerHTML += `<option value="${customer._id}">${customer.name} (${customer.phone})</option>`;
      });
      
    } catch (error) {
      console.error('Error:', error);
    }
  }

  updatePreview() {
    const content = document.getElementById('messageContent')?.value || '';
    const preview = document.getElementById('messagePreview');
    
    if (!preview) return;

    let previewText = content;
    previewText = previewText.replace(/{name}/g, '<strong>דוד כהן</strong>');
    previewText = previewText.replace(/{id}/g, '<strong>DRV-001</strong>');
    previewText = previewText.replace(/{date}/g, '<strong>' + new Date().toLocaleDateString('he-IL') + '</strong>');
    
    preview.innerHTML = previewText.replace(/\n/g, '<br>');
  }

  async sendMessage() {
    const recipientType = document.getElementById('recipientType')?.value;
    const content = document.getElementById('messageContent')?.value;
    const messageType = document.getElementById('messageType')?.value;
    const schedule = document.querySelector('input[name="schedule"]:checked')?.value;

    if (!recipientType) {
      alert('יש לבחור נמען');
      return;
    }

    if (!content) {
      alert('יש להזין תוכן');
      return;
    }

    const data = {
      recipientType,
      content,
      messageType,
      schedule,
      scheduledTime: schedule === 'scheduled' ? document.getElementById('scheduledTime')?.value : null
    };

    // Add specific recipient if needed
    if (recipientType === 'single-driver') {
      data.recipientId = document.getElementById('selectedDriver')?.value;
    } else if (recipientType === 'single-customer') {
      data.recipientId = document.getElementById('selectedCustomer')?.value;
    } else if (recipientType === 'drivers-by-city') {
      data.city = document.getElementById('selectedCity')?.value;
    }

    try {
      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) throw new Error('Failed');

      const result = await response.json();
      alert(`✅ הודעה נשלחה בהצלחה ל-${result.count || 1} נמענים!`);
      this.clearForm();
      
    } catch (error) {
      console.error('Error:', error);
      alert('❌ שגיאה בשליחת הודעה');
    }
  }

  clearForm() {
    document.getElementById('recipientType').value = '';
    document.getElementById('messageContent').value = '';
    document.getElementById('messageType').value = 'text';
    document.getElementById('recipientDetailsContainer').style.display = 'none';
    this.updatePreview();
  }

  // ============================================
  // 📝 TEMPLATES
  // ============================================
  async loadTemplatesList() {
    try {
      const response = await fetch('/api/messages/templates');
      if (!response.ok) throw new Error('Failed');
      
      this.templates = await response.json();
      
    } catch (error) {
      console.error('Error:', error);
    }
  }

  loadTemplate() {
    const templateId = document.getElementById('templateSelect')?.value;
    if (!templateId) return;

    const templates = {
      'welcome': 'שלום {name}!\n\nברוך הבא למערכת המוניות שלנו.\nמזהה הנהג שלך: {id}\n\nבהצלחה!',
      'reminder': 'שלום {name},\n\nזו תזכורת שיש לך נסיעה מתוזמנת היום.\n\nתאריך: {date}\n\nבהצלחה!',
      'update': 'עדכון חשוב!\n\nהמערכת עברה שדרוג והיא כעת מהירה יותר.\n\nבהצלחה,\nצוות דרך צדיקים',
      'promo': '🎉 מבצע מיוחד!\n\nקבל 10% הנחה על הנסיעה הבאה!\n\nתוקף עד: {date}'
    };

    const content = templates[templateId] || '';
    document.getElementById('messageContent').value = content;
    this.updatePreview();
  }

  async showTemplatesPage() {
    const container = document.getElementById('templatesContainer');
    if (!container) return;
    
    await this.loadTemplatesList();
    
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3><i class="fas fa-file-alt"></i> תבניות הודעות</h3>
          <button class="btn btn-primary" onclick="messagesManager.showAddTemplate()">
            <i class="fas fa-plus"></i> תבנית חדשה
          </button>
        </div>
        <div class="card-body">
          <div class="templates-grid">
            ${this.renderTemplates()}
          </div>
        </div>
      </div>
    `;
  }

  renderTemplates() {
    if (this.templates.length === 0) {
      return '<div class="empty-state"><i class="fas fa-inbox"></i><p>אין תבניות</p></div>';
    }

    let html = '';
    this.templates.forEach(template => {
      html += `
        <div class="template-card">
          <div class="template-header">
            <h4>${template.name}</h4>
            <span class="template-type">${template.type}</span>
          </div>
          <div class="template-content">
            ${template.content.substring(0, 100)}...
          </div>
          <div class="template-actions">
            <button class="btn btn-sm btn-primary" onclick="messagesManager.useTemplate('${template._id}')">
              <i class="fas fa-paper-plane"></i> השתמש
            </button>
            <button class="btn btn-sm btn-secondary" onclick="messagesManager.editTemplate('${template._id}')">
              <i class="fas fa-edit"></i> ערוך
            </button>
            <button class="btn btn-sm btn-danger" onclick="messagesManager.deleteTemplate('${template._id}')">
              <i class="fas fa-trash"></i> מחק
            </button>
          </div>
        </div>
      `;
    });
    
    return html;
  }

  // ============================================
  // 📜 HISTORY
  // ============================================
  async loadHistory() {
    const container = document.getElementById('historyContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="loading active"><div class="spinner"></div></div>';
    
    try {
      const response = await fetch('/api/messages/history?limit=50');
      if (!response.ok) throw new Error('Failed');
      
      this.history = await response.json();
      this.renderHistory(container);
      
    } catch (error) {
      console.error('Error:', error);
      container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>שגיאה</h3></div>';
    }
  }

  renderHistory(container) {
    if (this.history.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-comments"></i><h3>אין הודעות</h3></div>';
      return;
    }

    let html = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>תאריך</th>
              <th>נמען/ים</th>
              <th>תוכן</th>
              <th>סטטוס</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
    `;

    this.history.forEach(msg => {
      html += `
        <tr>
          <td>${this.formatDateTime(msg.sentAt)}</td>
          <td>${msg.recipientCount} נמענים</td>
          <td>${this.truncate(msg.content, 50)}</td>
          <td>${this.getMessageStatus(msg.status)}</td>
          <td>
            ${msg.status === 'failed' ? `
              <button class="btn btn-sm btn-warning" onclick="messagesManager.resend('${msg._id}')">
                <i class="fas fa-redo"></i> שלח שוב
              </button>
            ` : ''}
            <button class="btn btn-sm btn-primary" onclick="messagesManager.viewMessage('${msg._id}')">
              <i class="fas fa-eye"></i> צפייה
            </button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  // ============================================
  // 🛠️ HELPERS
  // ============================================
  getMessageStatus(status) {
    const statuses = {
      'sent': '<span class="status success"><i class="fas fa-check"></i> נשלח</span>',
      'pending': '<span class="status warning"><i class="fas fa-clock"></i> ממתין</span>',
      'failed': '<span class="status danger"><i class="fas fa-times"></i> נכשל</span>'
    };
    return statuses[status] || status;
  }

  formatDateTime(dateString) {
    return new Date(dateString).toLocaleString('he-IL');
  }

  truncate(text, length) {
    if (!text) return '';
    return text.length > length ? text.substring(0, length) + '...' : text;
  }

  showAddTemplate() {
    alert('הוספת תבנית בפיתוח...');
  }

  editTemplate(id) {
    alert('עריכה בפיתוח...');
  }

  deleteTemplate(id) {
    if (confirm('למחוק תבנית?')) {
      alert('מחיקה בפיתוח...');
    }
  }

  useTemplate(id) {
    alert('שימוש בתבנית בפיתוח...');
  }

  resend(id) {
    if (confirm('לשלוח הודעה שוב?')) {
      alert('שליחה מחדש בפיתוח...');
    }
  }

  viewMessage(id) {
    alert('צפייה בפיתוח...');
  }
}

// ============================================
// 📤 EXPORT
// ============================================
window.MessagesManager = MessagesManager;
window.messagesManager = new MessagesManager();
