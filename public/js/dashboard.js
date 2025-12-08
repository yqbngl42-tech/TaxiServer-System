// ============================================
// 📊 DASHBOARD LOGIC - מלא ומקצועי
// ============================================

class Dashboard {
  constructor() {
    this.stats = {
      todayRides: 0,
      activeDrivers: 0,
      todayRevenue: 0,
      pendingApprovals: 0
    };
    
    this.refreshInterval = null;
  }

  // ============================================
  // 📈 LOAD STATS
  // ============================================
  async loadStats() {
    try {
      const response = await fetch('/api/dashboard/stats');
      
      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }
      
      const data = await response.json();
      this.stats = data;
      
      // Update UI
      this.updateStatsUI();
      
    } catch (error) {
      console.error('Error loading stats:', error);
      this.showError('שגיאה בטעינת סטטיסטיקות');
    }
  }

  // ============================================
  // 🎨 UPDATE UI
  // ============================================
  updateStatsUI() {
    // Update stat cards
    this.updateElement('todayRides', this.stats.todayRides || 0);
    this.updateElement('activeDrivers', this.stats.activeDrivers || 0);
    this.updateElement('todayRevenue', this.stats.todayRevenue || 0);
    this.updateElement('pendingApprovals', this.stats.pendingApprovals || 0);
    
    // Update badges
    this.updateElement('activeRidesCount', this.stats.activeRides || 0);
    this.updateElement('pendingDriversCount', this.stats.pendingDrivers || 0);
  }

  updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
      
      // Add animation
      element.style.transform = 'scale(1.1)';
      setTimeout(() => {
        element.style.transform = 'scale(1)';
      }, 200);
    }
  }

  // ============================================
  // 📜 LOAD RECENT ACTIVITY
  // ============================================
  async loadRecentActivity() {
    const container = document.getElementById('recentActivity');
    if (!container) return;
    
    container.innerHTML = this.getLoadingHTML();
    
    try {
      const response = await fetch('/api/activity/recent?limit=10');
      
      if (!response.ok) {
        throw new Error('Failed to fetch activity');
      }
      
      const activities = await response.json();
      
      if (activities.length === 0) {
        container.innerHTML = this.getEmptyStateHTML('אין פעילות אחרונה');
        return;
      }
      
      container.innerHTML = this.buildActivityTable(activities);
      
    } catch (error) {
      console.error('Error loading activity:', error);
      container.innerHTML = this.getErrorHTML('שגיאה בטעינת נתונים');
    }
  }

  // ============================================
  // 🏗️ BUILD HTML
  // ============================================
  buildActivityTable(activities) {
    let html = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>זמן</th>
              <th>סוג</th>
              <th>פעולה</th>
              <th>משתמש</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    activities.forEach(activity => {
      const icon = this.getActivityIcon(activity.type);
      const statusClass = this.getActivityStatusClass(activity.type);
      
      html += `
        <tr>
          <td>${this.formatDate(activity.createdAt)}</td>
          <td>
            <span class="status ${statusClass}">
              <i class="${icon}"></i>
              ${this.translateActivityType(activity.type)}
            </span>
          </td>
          <td>${activity.description}</td>
          <td>${activity.userId || 'מערכת'}</td>
        </tr>
      `;
    });
    
    html += `
          </tbody>
        </table>
      </div>
    `;
    
    return html;
  }

  // ============================================
  // 🎨 HELPER FUNCTIONS
  // ============================================
  getActivityIcon(type) {
    const icons = {
      'ride_created': 'fas fa-plus-circle',
      'ride_assigned': 'fas fa-user-check',
      'ride_completed': 'fas fa-check-circle',
      'ride_cancelled': 'fas fa-times-circle',
      'driver_registered': 'fas fa-user-plus',
      'driver_approved': 'fas fa-thumbs-up',
      'driver_rejected': 'fas fa-thumbs-down',
      'payment_received': 'fas fa-dollar-sign'
    };
    return icons[type] || 'fas fa-info-circle';
  }

  getActivityStatusClass(type) {
    if (type.includes('completed') || type.includes('approved')) return 'success';
    if (type.includes('cancelled') || type.includes('rejected')) return 'danger';
    if (type.includes('created') || type.includes('registered')) return 'info';
    return 'warning';
  }

  translateActivityType(type) {
    const translations = {
      'ride_created': 'נסיעה נוצרה',
      'ride_assigned': 'נסיעה שוייכה',
      'ride_completed': 'נסיעה הושלמה',
      'ride_cancelled': 'נסיעה בוטלה',
      'driver_registered': 'נהג נרשם',
      'driver_approved': 'נהג אושר',
      'driver_rejected': 'נהג נדחה',
      'payment_received': 'תשלום התקבל'
    };
    return translations[type] || type;
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    // Less than 1 minute
    if (diff < 60000) {
      return 'עכשיו';
    }
    
    // Less than 1 hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `לפני ${minutes} דקות`;
    }
    
    // Less than 1 day
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `לפני ${hours} שעות`;
    }
    
    // More than 1 day
    return date.toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getLoadingHTML() {
    return `
      <div class="loading active">
        <div class="spinner"></div>
        <p>טוען נתונים...</p>
      </div>
    `;
  }

  getEmptyStateHTML(message) {
    return `
      <div class="empty-state">
        <i class="fas fa-inbox"></i>
        <h3>${message}</h3>
        <p>אין פעולות להצגה כרגע</p>
      </div>
    `;
  }

  getErrorHTML(message) {
    return `
      <div class="empty-state">
        <i class="fas fa-exclamation-circle" style="color: var(--danger);"></i>
        <h3>${message}</h3>
        <p>נסה לרענן את הדף</p>
      </div>
    `;
  }

  // ============================================
  // 🔄 AUTO REFRESH
  // ============================================
  startAutoRefresh() {
    // Clear existing interval
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    // Refresh every 30 seconds
    this.refreshInterval = setInterval(() => {
      this.loadStats();
      this.loadRecentActivity();
    }, 30000);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  // ============================================
  // 🚀 INIT
  // ============================================
  async init() {
    console.log('📊 Dashboard initializing...');
    
    await this.loadStats();
    await this.loadRecentActivity();
    this.startAutoRefresh();
    
    console.log('✅ Dashboard ready!');
  }

  // ============================================
  // 🗑️ CLEANUP
  // ============================================
  destroy() {
    this.stopAutoRefresh();
  }

  // ============================================
  // 🔔 NOTIFICATIONS
  // ============================================
  showError(message) {
    this.showNotification(message, 'danger');
  }

  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
      <span>${message}</span>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

// ============================================
// 📊 EXPORT
// ============================================
window.Dashboard = Dashboard;
