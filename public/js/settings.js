// ============================================
// ⚙️ SETTINGS LOGIC - הגדרות מערכת
// ============================================

class SettingsManager {
  constructor() {
    this.settings = {};
  }

  // ============================================
  // 🔧 GENERAL SETTINGS
  // ============================================
  async loadGeneralSettings() {
    const container = document.getElementById('generalSettingsContainer');
    if (!container) return;
    
    try {
      const response = await fetch('/api/settings/general');
      if (!response.ok) throw new Error('Failed');
      
      this.settings = await response.json();
      this.renderGeneralSettings(container);
      
    } catch (error) {
      console.error('Error:', error);
    }
  }

  renderGeneralSettings(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3><i class="fas fa-cog"></i> הגדרות כלליות</h3>
        </div>
        <div class="card-body">
          <div class="form-group">
            <label>שם המערכת</label>
            <input type="text" class="form-control" id="systemName" 
                   value="${this.settings.systemName || 'מערכת מוניות'}">
          </div>

          <div class="form-group">
            <label>מספר טלפון תמיכה</label>
            <input type="tel" class="form-control" id="supportPhone" 
                   value="${this.settings.supportPhone || ''}">
          </div>

          <div class="form-group">
            <label>אימייל תמיכה</label>
            <input type="email" class="form-control" id="supportEmail" 
                   value="${this.settings.supportEmail || ''}">
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label>אזור זמן</label>
              <select class="form-control" id="timezone">
                <option value="Asia/Jerusalem">ישראל (UTC+2/+3)</option>
              </select>
            </div>
            <div class="form-group">
              <label>מטבע</label>
              <select class="form-control" id="currency">
                <option value="ILS">שקל (₪)</option>
                <option value="USD">דולר ($)</option>
                <option value="EUR">יורו (€)</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>
              <input type="checkbox" id="maintenanceMode" 
                     ${this.settings.maintenanceMode ? 'checked' : ''}>
              מצב תחזוקה (המערכת לא תקבל נסיעות חדשות)
            </label>
          </div>

          <button class="btn btn-primary" onclick="settingsManager.saveGeneralSettings()">
            <i class="fas fa-save"></i> שמור שינויים
          </button>
        </div>
      </div>
    `;
  }

  async saveGeneralSettings() {
    const data = {
      systemName: document.getElementById('systemName').value,
      supportPhone: document.getElementById('supportPhone').value,
      supportEmail: document.getElementById('supportEmail').value,
      timezone: document.getElementById('timezone').value,
      currency: document.getElementById('currency').value,
      maintenanceMode: document.getElementById('maintenanceMode').checked
    };

    try {
      const response = await fetch('/api/settings/general', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) throw new Error('Failed');

      alert('✅ הגדרות נשמרו!');
      
    } catch (error) {
      console.error('Error:', error);
      alert('❌ שגיאה בשמירה');
    }
  }

  // ============================================
  // 💰 PRICING
  // ============================================
  async loadPricingSettings() {
    const container = document.getElementById('pricingContainer');
    if (!container) return;
    
    try {
      const response = await fetch('/api/settings/pricing');
      if (!response.ok) throw new Error('Failed');
      
      const pricing = await response.json();
      this.renderPricingSettings(container, pricing);
      
    } catch (error) {
      console.error('Error:', error);
    }
  }

  renderPricingSettings(container, pricing = {}) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3><i class="fas fa-tags"></i> מחירון בסיסי</h3>
        </div>
        <div class="card-body">
          <div class="grid-3">
            <div class="form-group">
              <label>מחיר בסיס</label>
              <div class="input-group">
                <span class="input-addon">₪</span>
                <input type="number" class="form-control" id="basePrice" 
                       value="${pricing.basePrice || 15}" step="0.5">
              </div>
            </div>
            <div class="form-group">
              <label>מחיר לק"מ</label>
              <div class="input-group">
                <span class="input-addon">₪</span>
                <input type="number" class="form-control" id="pricePerKm" 
                       value="${pricing.pricePerKm || 3}" step="0.1">
              </div>
            </div>
            <div class="form-group">
              <label>תוספת המתנה (דקה)</label>
              <div class="input-group">
                <span class="input-addon">₪</span>
                <input type="number" class="form-control" id="waitingPrice" 
                       value="${pricing.waitingPrice || 1}" step="0.1">
              </div>
            </div>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label>תוספת לילה (20:00-06:00)</label>
              <div class="input-group">
                <input type="number" class="form-control" id="nightSurcharge" 
                       value="${pricing.nightSurcharge || 25}">
                <span class="input-addon">%</span>
              </div>
            </div>
            <div class="form-group">
              <label>תוספת שישי/שבת</label>
              <div class="input-group">
                <input type="number" class="form-control" id="weekendSurcharge" 
                       value="${pricing.weekendSurcharge || 20}">
                <span class="input-addon">%</span>
              </div>
            </div>
          </div>

          <button class="btn btn-primary" onclick="settingsManager.savePricing()">
            <i class="fas fa-save"></i> שמור מחירון
          </button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3><i class="fas fa-map-marked-alt"></i> מחירון לפי אזורים</h3>
          <button class="btn btn-sm btn-primary" onclick="settingsManager.addRoute()">
            <i class="fas fa-plus"></i> הוסף מסלול
          </button>
        </div>
        <div class="card-body">
          <div id="routesList">
            ${this.renderRoutes(pricing.routes || [])}
          </div>
        </div>
      </div>
    `;
  }

  renderRoutes(routes) {
    if (routes.length === 0) {
      return '<div class="empty-state"><i class="fas fa-route"></i><p>אין מסלולים מוגדרים</p></div>';
    }

    let html = '<div class="routes-list">';
    routes.forEach((route, index) => {
      html += `
        <div class="route-item">
          <div class="route-info">
            <strong>${route.from}</strong> → <strong>${route.to}</strong>
            <span class="price-tag">₪${route.price}</span>
          </div>
          <div class="route-actions">
            <button class="btn btn-sm btn-secondary" onclick="settingsManager.editRoute(${index})">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-sm btn-danger" onclick="settingsManager.deleteRoute(${index})">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    });
    html += '</div>';
    
    return html;
  }

  async savePricing() {
    const data = {
      basePrice: parseFloat(document.getElementById('basePrice').value),
      pricePerKm: parseFloat(document.getElementById('pricePerKm').value),
      waitingPrice: parseFloat(document.getElementById('waitingPrice').value),
      nightSurcharge: parseFloat(document.getElementById('nightSurcharge').value),
      weekendSurcharge: parseFloat(document.getElementById('weekendSurcharge').value)
    };

    try {
      const response = await fetch('/api/settings/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) throw new Error('Failed');

      alert('✅ מחירון נשמר!');
      
    } catch (error) {
      console.error('Error:', error);
      alert('❌ שגיאה בשמירה');
    }
  }

  // ============================================
  // 👥 WHATSAPP GROUPS
  // ============================================
  async loadGroupsSettings() {
    const container = document.getElementById('groupsContainer');
    if (!container) return;
    
    try {
      const response = await fetch('/api/settings/groups');
      if (!response.ok) throw new Error('Failed');
      
      const groups = await response.json();
      this.renderGroups(container, groups);
      
    } catch (error) {
      console.error('Error:', error);
    }
  }

  renderGroups(container, groups) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3><i class="fas fa-users-cog"></i> קבוצות WhatsApp</h3>
          <button class="btn btn-primary" onclick="settingsManager.addGroup()">
            <i class="fas fa-plus"></i> הוסף קבוצה
          </button>
        </div>
        <div class="card-body">
          ${this.renderGroupsList(groups)}
        </div>
      </div>
    `;
  }

  renderGroupsList(groups) {
    if (!groups || groups.length === 0) {
      return '<div class="empty-state"><i class="fas fa-users"></i><h3>אין קבוצות</h3></div>';
    }

    let html = '<div class="groups-grid">';
    groups.forEach(group => {
      html += `
        <div class="group-card">
          <div class="group-header">
            <h4>${group.name}</h4>
            <span class="status ${group.isActive ? 'success' : 'warning'}">
              ${group.isActive ? 'פעיל' : 'לא פעיל'}
            </span>
          </div>
          <div class="group-details">
            <div><i class="fas fa-users"></i> ${group.driverCount || 0} נהגים</div>
            <div><i class="fas fa-map-marker-alt"></i> ${group.area || 'כל הארץ'}</div>
          </div>
          <div class="group-actions">
            <button class="btn btn-sm btn-primary" onclick="settingsManager.viewGroup('${group._id}')">
              <i class="fas fa-eye"></i> צפייה
            </button>
            <button class="btn btn-sm btn-secondary" onclick="settingsManager.editGroup('${group._id}')">
              <i class="fas fa-edit"></i> עריכה
            </button>
            <button class="btn btn-sm btn-success" onclick="settingsManager.syncGroup('${group._id}')">
              <i class="fas fa-sync"></i> סנכרון
            </button>
          </div>
        </div>
      `;
    });
    html += '</div>';
    
    return html;
  }

  // ============================================
  // 🔐 ADMINS
  // ============================================
  async loadAdmins() {
    const container = document.getElementById('adminsContainer');
    if (!container) return;
    
    try {
      const response = await fetch('/api/settings/admins');
      if (!response.ok) throw new Error('Failed');
      
      const admins = await response.json();
      this.renderAdmins(container, admins);
      
    } catch (error) {
      console.error('Error:', error);
    }
  }

  renderAdmins(container, admins) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3><i class="fas fa-user-shield"></i> ניהול מנהלים</h3>
          <button class="btn btn-primary" onclick="settingsManager.addAdmin()">
            <i class="fas fa-user-plus"></i> הוסף מנהל
          </button>
        </div>
        <div class="card-body">
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>שם</th>
                  <th>אימייל</th>
                  <th>תפקיד</th>
                  <th>תאריך הצטרפות</th>
                  <th>סטטוס</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                ${this.renderAdminRows(admins)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  renderAdminRows(admins) {
    if (!admins || admins.length === 0) {
      return '<tr><td colspan="6"><div class="empty-state"><i class="fas fa-users"></i><p>אין מנהלים</p></div></td></tr>';
    }

    let html = '';
    admins.forEach(admin => {
      html += `
        <tr>
          <td><strong>${admin.name}</strong></td>
          <td>${admin.email}</td>
          <td>${this.getRoleBadge(admin.role)}</td>
          <td>${new Date(admin.createdAt).toLocaleDateString('he-IL')}</td>
          <td>${admin.isActive ? '<span class="status success">פעיל</span>' : '<span class="status warning">לא פעיל</span>'}</td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="settingsManager.editAdmin('${admin._id}')">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-sm btn-warning" onclick="settingsManager.resetPassword('${admin._id}')">
              <i class="fas fa-key"></i>
            </button>
            ${admin.role !== 'super_admin' ? `
              <button class="btn btn-sm btn-danger" onclick="settingsManager.deleteAdmin('${admin._id}')">
                <i class="fas fa-trash"></i>
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    });
    
    return html;
  }

  getRoleBadge(role) {
    const roles = {
      'super_admin': '<span class="status danger"><i class="fas fa-crown"></i> Super Admin</span>',
      'admin': '<span class="status success"><i class="fas fa-user-shield"></i> Admin</span>',
      'manager': '<span class="status info"><i class="fas fa-user-tie"></i> Manager</span>',
      'viewer': '<span class="status warning"><i class="fas fa-eye"></i> Viewer</span>'
    };
    return roles[role] || role;
  }

  // ============================================
  // 🛠️ ACTIONS
  // ============================================
  addRoute() {
    alert('הוספת מסלול בפיתוח...');
  }

  editRoute(index) {
    alert(`עריכת מסלול ${index} בפיתוח...`);
  }

  deleteRoute(index) {
    if (confirm('למחוק מסלול?')) {
      alert('מחיקה בפיתוח...');
    }
  }

  addGroup() {
    alert('הוספת קבוצה בפיתוח...');
  }

  viewGroup(id) {
    alert('צפייה בקבוצה בפיתוח...');
  }

  editGroup(id) {
    alert('עריכת קבוצה בפיתוח...');
  }

  syncGroup(id) {
    if (confirm('לסנכרן קבוצה עם הבוט?')) {
      alert('סנכרון בפיתוח...');
    }
  }

  addAdmin() {
    alert('הוספת מנהל בפיתוח...');
  }

  editAdmin(id) {
    alert('עריכת מנהל בפיתוח...');
  }

  resetPassword(id) {
    if (confirm('לאפס סיסמה?')) {
      alert('איפוס בפיתוח...');
    }
  }

  deleteAdmin(id) {
    if (confirm('למחוק מנהל?')) {
      alert('מחיקה בפיתוח...');
    }
  }
}

// ============================================
// 📤 EXPORT
// ============================================
window.SettingsManager = SettingsManager;
window.settingsManager = new SettingsManager();
