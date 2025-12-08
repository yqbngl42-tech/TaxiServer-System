// ============================================
// 🔧 SYSTEM LOGIC - לוגים וגיבויים
// ============================================

class SystemManager {
  constructor() {
    this.logs = [];
    this.backups = [];
  }

  // ============================================
  // 📋 LOGS
  // ============================================
  async loadLogs() {
    const container = document.getElementById('logsContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="loading active"><div class="spinner"></div></div>';
    
    try {
      const filters = this.getLogFilters();
      const response = await fetch(`/api/system/logs?${new URLSearchParams(filters)}`);
      if (!response.ok) throw new Error('Failed');
      
      this.logs = await response.json();
      this.renderLogs(container);
      
    } catch (error) {
      console.error('Error:', error);
      container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>שגיאה</h3></div>';
    }
  }

  getLogFilters() {
    return {
      type: document.getElementById('logType')?.value || '',
      level: document.getElementById('logLevel')?.value || '',
      from: document.getElementById('logDateFrom')?.value || '',
      to: document.getElementById('logDateTo')?.value || '',
      search: document.getElementById('logSearch')?.value || ''
    };
  }

  renderLogs(container) {
    const filtersHTML = `
      <div class="filters-bar">
        <div class="filters-row">
          <div class="filter-group">
            <label>סוג</label>
            <select class="form-control" id="logType" onchange="systemManager.loadLogs()">
              <option value="">הכל</option>
              <option value="info">מידע</option>
              <option value="warning">אזהרה</option>
              <option value="error">שגיאה</option>
              <option value="success">הצלחה</option>
            </select>
          </div>
          <div class="filter-group">
            <label>רמה</label>
            <select class="form-control" id="logLevel" onchange="systemManager.loadLogs()">
              <option value="">הכל</option>
              <option value="system">מערכת</option>
              <option value="user">משתמש</option>
              <option value="api">API</option>
            </select>
          </div>
          <div class="filter-group">
            <label>מתאריך</label>
            <input type="date" class="form-control" id="logDateFrom" onchange="systemManager.loadLogs()">
          </div>
          <div class="filter-group">
            <label>עד תאריך</label>
            <input type="date" class="form-control" id="logDateTo" onchange="systemManager.loadLogs()">
          </div>
          <div class="filter-group">
            <label>חיפוש</label>
            <input type="text" class="form-control" id="logSearch" 
                   placeholder="חפש..." onkeyup="systemManager.searchLogs()">
          </div>
          <div class="filter-group">
            <label>&nbsp;</label>
            <button class="btn btn-secondary" onclick="systemManager.clearFilters()">
              <i class="fas fa-times"></i> נקה
            </button>
            <button class="btn btn-primary" onclick="systemManager.exportLogs()">
              <i class="fas fa-download"></i> ייצוא
            </button>
          </div>
        </div>
      </div>
    `;

    if (this.logs.length === 0) {
      container.innerHTML = filtersHTML + '<div class="empty-state"><i class="fas fa-clipboard-list"></i><h3>אין לוגים</h3></div>';
      return;
    }

    let tableHTML = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>זמן</th>
              <th>סוג</th>
              <th>הודעה</th>
              <th>משתמש</th>
              <th>IP</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
    `;

    this.logs.forEach(log => {
      tableHTML += `
        <tr>
          <td>${this.formatDateTime(log.timestamp)}</td>
          <td>${this.getLogTypeBadge(log.type, log.level)}</td>
          <td>${log.message}</td>
          <td>${log.user || 'מערכת'}</td>
          <td>${log.ip || '-'}</td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="systemManager.viewLogDetails('${log._id}')">
              <i class="fas fa-eye"></i> פרטים
            </button>
          </td>
        </tr>
      `;
    });

    tableHTML += '</tbody></table></div>';
    container.innerHTML = filtersHTML + tableHTML;
  }

  getLogTypeBadge(type, level) {
    const badges = {
      'info': '<span class="status info"><i class="fas fa-info-circle"></i> מידע</span>',
      'warning': '<span class="status warning"><i class="fas fa-exclamation-triangle"></i> אזהרה</span>',
      'error': '<span class="status danger"><i class="fas fa-times-circle"></i> שגיאה</span>',
      'success': '<span class="status success"><i class="fas fa-check-circle"></i> הצלחה</span>'
    };
    return badges[type] || type;
  }

  searchLogs() {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.loadLogs();
    }, 500);
  }

  clearFilters() {
    document.getElementById('logType').value = '';
    document.getElementById('logLevel').value = '';
    document.getElementById('logDateFrom').value = '';
    document.getElementById('logDateTo').value = '';
    document.getElementById('logSearch').value = '';
    this.loadLogs();
  }

  async exportLogs() {
    try {
      const filters = this.getLogFilters();
      const response = await fetch(`/api/system/logs/export?${new URLSearchParams(filters)}`);
      if (!response.ok) throw new Error('Failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs-${new Date().toISOString()}.csv`;
      a.click();

      alert('✅ לוגים יוצאו בהצלחה!');
      
    } catch (error) {
      console.error('Error:', error);
      alert('❌ שגיאה בייצוא לוגים');
    }
  }

  viewLogDetails(logId) {
    // Show modal with full log details
    alert('צפייה בפרטים בפיתוח...');
  }

  // ============================================
  // 💾 BACKUPS
  // ============================================
  async loadBackups() {
    const container = document.getElementById('backupsContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="loading active"><div class="spinner"></div></div>';
    
    try {
      const response = await fetch('/api/system/backups');
      if (!response.ok) throw new Error('Failed');
      
      this.backups = await response.json();
      this.renderBackups(container);
      
    } catch (error) {
      console.error('Error:', error);
      container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>שגיאה</h3></div>';
    }
  }

  renderBackups(container) {
    const actionsHTML = `
      <div class="card">
        <div class="card-header">
          <h3><i class="fas fa-database"></i> ניהול גיבויים</h3>
        </div>
        <div class="card-body">
          <div class="backup-actions">
            <button class="btn btn-primary" onclick="systemManager.createBackup()">
              <i class="fas fa-save"></i> צור גיבוי עכשיו
            </button>
            <button class="btn btn-secondary" onclick="systemManager.showScheduleSettings()">
              <i class="fas fa-clock"></i> הגדרות אוטומטיות
            </button>
          </div>

          <div class="backup-schedule">
            <h4>גיבוי אוטומטי</h4>
            <div class="form-group">
              <label>
                <input type="checkbox" id="autoBackup" onchange="systemManager.toggleAutoBackup()">
                הפעל גיבוי אוטומטי
              </label>
            </div>
            <div class="form-group">
              <label>תדירות</label>
              <select class="form-control" id="backupFrequency">
                <option value="daily">יומי</option>
                <option value="weekly">שבועי</option>
                <option value="monthly">חודשי</option>
              </select>
            </div>
            <div class="form-group">
              <label>שמור גיבויים ל:</label>
              <select class="form-control" id="backupRetention">
                <option value="7">7 ימים</option>
                <option value="30">30 ימים</option>
                <option value="90">90 ימים</option>
                <option value="180">180 ימים</option>
              </select>
            </div>
            <button class="btn btn-success" onclick="systemManager.saveBackupSettings()">
              <i class="fas fa-save"></i> שמור הגדרות
            </button>
          </div>
        </div>
      </div>
    `;

    if (this.backups.length === 0) {
      container.innerHTML = actionsHTML + '<div class="empty-state"><i class="fas fa-database"></i><h3>אין גיבויים</h3></div>';
      return;
    }

    let listHTML = `
      <div class="card">
        <div class="card-header">
          <h3><i class="fas fa-history"></i> גיבויים קיימים</h3>
        </div>
        <div class="card-body">
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>גודל</th>
                  <th>סוג</th>
                  <th>סטטוס</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
    `;

    this.backups.forEach(backup => {
      listHTML += `
        <tr>
          <td>${this.formatDateTime(backup.createdAt)}</td>
          <td>${this.formatSize(backup.size)}</td>
          <td>${this.getBackupType(backup.type)}</td>
          <td>${this.getBackupStatus(backup.status)}</td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="systemManager.downloadBackup('${backup._id}')">
              <i class="fas fa-download"></i> הורד
            </button>
            <button class="btn btn-sm btn-warning" onclick="systemManager.restoreBackup('${backup._id}')">
              <i class="fas fa-undo"></i> שחזר
            </button>
            <button class="btn btn-sm btn-danger" onclick="systemManager.deleteBackup('${backup._id}')">
              <i class="fas fa-trash"></i> מחק
            </button>
          </td>
        </tr>
      `;
    });

    listHTML += '</tbody></table></div></div></div>';
    container.innerHTML = actionsHTML + listHTML;
  }

  async createBackup() {
    if (!confirm('ליצור גיבוי? זה עלול לקחת כמה דקות...')) return;
    
    try {
      const response = await fetch('/api/system/backups/create', {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Failed');

      alert('✅ גיבוי נוצר בהצלחה!');
      this.loadBackups();
      
    } catch (error) {
      console.error('Error:', error);
      alert('❌ שגיאה ביצירת גיבוי');
    }
  }

  async downloadBackup(backupId) {
    try {
      const response = await fetch(`/api/system/backups/${backupId}/download`);
      if (!response.ok) throw new Error('Failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-${backupId}.zip`;
      a.click();
      
    } catch (error) {
      console.error('Error:', error);
      alert('❌ שגיאה בהורדת גיבוי');
    }
  }

  async restoreBackup(backupId) {
    if (!confirm('⚠️ שחזור גיבוי ימחק את כל הנתונים הנוכחיים!\n\nהאם אתה בטוח?')) return;
    if (!confirm('האם אתה בטוח לחלוטין? פעולה זו אינה הפיכה!')) return;
    
    try {
      const response = await fetch(`/api/system/backups/${backupId}/restore`, {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Failed');

      alert('✅ גיבוי משוחזר! המערכת תתאפס תוך 5 שניות...');
      
      setTimeout(() => {
        window.location.reload();
      }, 5000);
      
    } catch (error) {
      console.error('Error:', error);
      alert('❌ שגיאה בשחזור גיבוי');
    }
  }

  async deleteBackup(backupId) {
    if (!confirm('למחוק גיבוי זה?')) return;
    
    try {
      const response = await fetch(`/api/system/backups/${backupId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed');

      alert('✅ גיבוי נמחק');
      this.loadBackups();
      
    } catch (error) {
      console.error('Error:', error);
      alert('❌ שגיאה במחיקת גיבוי');
    }
  }

  async toggleAutoBackup() {
    const enabled = document.getElementById('autoBackup').checked;
    
    try {
      const response = await fetch('/api/system/backups/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });

      if (!response.ok) throw new Error('Failed');

      alert(`✅ גיבוי אוטומטי ${enabled ? 'הופעל' : 'הושבת'}`);
      
    } catch (error) {
      console.error('Error:', error);
      alert('❌ שגיאה');
    }
  }

  async saveBackupSettings() {
    const settings = {
      frequency: document.getElementById('backupFrequency').value,
      retention: parseInt(document.getElementById('backupRetention').value)
    };

    try {
      const response = await fetch('/api/system/backups/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (!response.ok) throw new Error('Failed');

      alert('✅ הגדרות נשמרו!');
      
    } catch (error) {
      console.error('Error:', error);
      alert('❌ שגיאה בשמירה');
    }
  }

  // ============================================
  // 🛠️ HELPERS
  // ============================================
  getBackupType(type) {
    const types = {
      'manual': '<i class="fas fa-hand-pointer"></i> ידני',
      'auto': '<i class="fas fa-clock"></i> אוטומטי',
      'scheduled': '<i class="fas fa-calendar"></i> מתוזמן'
    };
    return types[type] || type;
  }

  getBackupStatus(status) {
    const statuses = {
      'completed': '<span class="status success">הושלם</span>',
      'in_progress': '<span class="status warning">בתהליך</span>',
      'failed': '<span class="status danger">נכשל</span>'
    };
    return statuses[status] || status;
  }

  formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  formatDateTime(dateString) {
    return new Date(dateString).toLocaleString('he-IL');
  }

  showScheduleSettings() {
    alert('הגדרות תזמון בפיתוח...');
  }
}

// ============================================
// 📤 EXPORT
// ============================================
window.SystemManager = SystemManager;
window.systemManager = new SystemManager();
