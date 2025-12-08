// ============================================
// 🚗 RIDES LOGIC - ניהול נסיעות מלא
// ============================================

class RidesManager {
  constructor() {
    this.rides = [];
    this.drivers = [];
    this.filters = {
      status: 'all',
      driver: 'all',
      dateFrom: null,
      dateTo: null,
      search: ''
    };
    this.currentPage = 1;
    this.pageSize = 20;
  }

  // ============================================
  // 📥 LOAD ACTIVE RIDES
  // ============================================
  async loadActiveRides() {
    const container = document.getElementById('ridesActiveTable');
    if (!container) return;
    
    container.innerHTML = this.getLoadingHTML();
    
    try {
      const response = await fetch('/api/rides?status=active,assigned,created,distributed');
      
      if (!response.ok) {
        throw new Error('Failed to fetch rides');
      }
      
      this.rides = await response.json();
      this.renderRidesTable(container);
      
    } catch (error) {
      console.error('Error loading rides:', error);
      container.innerHTML = this.getErrorHTML('שגיאה בטעינת נסיעות');
    }
  }

  // ============================================
  // 🎨 RENDER RIDES TABLE
  // ============================================
  renderRidesTable(container) {
    if (this.rides.length === 0) {
      container.innerHTML = this.getEmptyStateHTML('אין נסיעות פעילות');
      return;
    }

    let html = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>מספר נסיעה</th>
              <th>לקוח</th>
              <th>איסוף</th>
              <th>יעד</th>
              <th>מחיר</th>
              <th>נהג</th>
              <th>סטטוס</th>
              <th>זמן</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
    `;

    this.rides.forEach(ride => {
      html += `
        <tr data-ride-id="${ride._id}">
          <td><strong>${ride.rideNumber}</strong></td>
          <td>
            <div>${ride.customerName}</div>
            <div style="font-size: 12px; color: var(--gray);">${ride.customerPhone}</div>
          </td>
          <td>${this.truncate(ride.pickup, 30)}</td>
          <td>${this.truncate(ride.destination, 30)}</td>
          <td><strong>₪${ride.price}</strong></td>
          <td>${ride.driverName || '<span style="color: var(--gray);">לא משויך</span>'}</td>
          <td>${this.getStatusBadge(ride.status)}</td>
          <td>${this.formatTime(ride.createdAt)}</td>
          <td>
            <div class="action-menu">
              <button class="action-btn" onclick="ridesManager.showRideActions('${ride._id}')">
                <i class="fas fa-ellipsis-v"></i>
              </button>
              <div class="action-dropdown" id="actions-${ride._id}">
                <div class="action-dropdown-item" onclick="ridesManager.viewRide('${ride._id}')">
                  <i class="fas fa-eye"></i>
                  צפייה
                </div>
                <div class="action-dropdown-item" onclick="ridesManager.assignDriver('${ride._id}')">
                  <i class="fas fa-user-plus"></i>
                  שיוך נהג
                </div>
                <div class="action-dropdown-item" onclick="ridesManager.editRide('${ride._id}')">
                  <i class="fas fa-edit"></i>
                  עריכה
                </div>
                <div class="action-dropdown-item" onclick="ridesManager.cancelRide('${ride._id}')">
                  <i class="fas fa-times"></i>
                  ביטול
                </div>
              </div>
            </div>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;
  }

  // ============================================
  // ➕ CREATE NEW RIDE
  // ============================================
  async createRide(formData) {
    try {
      const response = await fetch('/api/rides', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        throw new Error('Failed to create ride');
      }

      const ride = await response.json();
      this.showSuccess('נסיעה נוצרה בהצלחה!');
      
      // Refresh list
      this.loadActiveRides();
      
      return ride;
      
    } catch (error) {
      console.error('Error creating ride:', error);
      this.showError('שגיאה ביצירת נסיעה');
      throw error;
    }
  }

  // ============================================
  // 👁️ VIEW RIDE DETAILS
  // ============================================
  async viewRide(rideId) {
    try {
      const response = await fetch(`/api/rides/${rideId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch ride');
      }
      
      const ride = await response.json();
      this.showRideModal(ride);
      
    } catch (error) {
      console.error('Error viewing ride:', error);
      this.showError('שגיאה בטעינת פרטי נסיעה');
    }
  }

  showRideModal(ride) {
    const modal = document.getElementById('rideModal');
    if (!modal) return;

    const modalBody = modal.querySelector('.modal-body');
    modalBody.innerHTML = `
      <div class="grid-2">
        <div class="form-group">
          <label>מספר נסיעה</label>
          <div><strong>${ride.rideNumber}</strong></div>
        </div>
        <div class="form-group">
          <label>סטטוס</label>
          <div>${this.getStatusBadge(ride.status)}</div>
        </div>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label>שם לקוח</label>
          <div>${ride.customerName}</div>
        </div>
        <div class="form-group">
          <label>טלפון לקוח</label>
          <div>${ride.customerPhone}</div>
        </div>
      </div>

      <div class="form-group">
        <label>נקודת איסוף</label>
        <div>${ride.pickup}</div>
      </div>

      <div class="form-group">
        <label>יעד</label>
        <div>${ride.destination}</div>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label>מחיר</label>
          <div><strong style="font-size: 20px;">₪${ride.price}</strong></div>
        </div>
        <div class="form-group">
          <label>זמן יצירה</label>
          <div>${this.formatDateTime(ride.createdAt)}</div>
        </div>
      </div>

      ${ride.driverName ? `
        <div class="grid-2">
          <div class="form-group">
            <label>נהג</label>
            <div>${ride.driverName} (${ride.driverId})</div>
          </div>
          <div class="form-group">
            <label>טלפון נהג</label>
            <div>${ride.driverPhone}</div>
          </div>
        </div>
      ` : ''}

      ${ride.notes ? `
        <div class="form-group">
          <label>הערות</label>
          <div>${ride.notes}</div>
        </div>
      ` : ''}
    `;

    modal.classList.add('active');
  }

  // ============================================
  // 👨‍✈️ ASSIGN DRIVER
  // ============================================
  async assignDriver(rideId) {
    // Load available drivers
    await this.loadDriversList();

    const modal = document.getElementById('assignDriverModal');
    if (!modal) return;

    const modalBody = modal.querySelector('.modal-body');
    modalBody.innerHTML = `
      <div class="form-group">
        <label>בחר נהג</label>
        <select class="form-control" id="selectDriver">
          <option value="">-- בחר נהג --</option>
          ${this.drivers.map(driver => `
            <option value="${driver._id}">
              ${driver.name} (${driver.driverId}) - ${driver.vehicleType}
            </option>
          `).join('')}
        </select>
      </div>

      <div class="form-group">
        <label>הערות</label>
        <textarea class="form-control" id="assignNotes" placeholder="הערות לנהג (אופציונלי)"></textarea>
      </div>
    `;

    modal.classList.add('active');
    modal.dataset.rideId = rideId;
  }

  async confirmAssignDriver() {
    const modal = document.getElementById('assignDriverModal');
    const rideId = modal.dataset.rideId;
    const driverId = document.getElementById('selectDriver').value;
    const notes = document.getElementById('assignNotes').value;

    if (!driverId) {
      this.showError('יש לבחור נהג');
      return;
    }

    try {
      const response = await fetch(`/api/rides/${rideId}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ driverId, notes })
      });

      if (!response.ok) {
        throw new Error('Failed to assign driver');
      }

      this.showSuccess('נהג שויך בהצלחה!');
      modal.classList.remove('active');
      this.loadActiveRides();
      
    } catch (error) {
      console.error('Error assigning driver:', error);
      this.showError('שגיאה בשיוך נהג');
    }
  }

  // ============================================
  // ❌ CANCEL RIDE
  // ============================================
  async cancelRide(rideId) {
    if (!confirm('האם אתה בטוח שברצונך לבטל את הנסיעה?')) {
      return;
    }

    try {
      const response = await fetch(`/api/rides/${rideId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: 'בוטל על ידי מנהל' })
      });

      if (!response.ok) {
        throw new Error('Failed to cancel ride');
      }

      this.showSuccess('נסיעה בוטלה בהצלחה!');
      this.loadActiveRides();
      
    } catch (error) {
      console.error('Error cancelling ride:', error);
      this.showError('שגיאה בביטול נסיעה');
    }
  }

  // ============================================
  // 🔍 SEARCH & FILTER
  // ============================================
  applyFilters() {
    let filtered = [...this.rides];

    // Status filter
    if (this.filters.status !== 'all') {
      filtered = filtered.filter(r => r.status === this.filters.status);
    }

    // Driver filter
    if (this.filters.driver !== 'all') {
      filtered = filtered.filter(r => r.driverId === this.filters.driver);
    }

    // Search
    if (this.filters.search) {
      const search = this.filters.search.toLowerCase();
      filtered = filtered.filter(r => 
        r.rideNumber.toLowerCase().includes(search) ||
        r.customerName.toLowerCase().includes(search) ||
        r.customerPhone.includes(search) ||
        r.pickup.toLowerCase().includes(search) ||
        r.destination.toLowerCase().includes(search)
      );
    }

    return filtered;
  }

  // ============================================
  // 🛠️ HELPER FUNCTIONS
  // ============================================
  getStatusBadge(status) {
    const statuses = {
      'created': { text: 'נוצרה', class: 'info', icon: 'fa-plus' },
      'distributed': { text: 'חולקה', class: 'warning', icon: 'fa-paper-plane' },
      'assigned': { text: 'משויכת', class: 'success', icon: 'fa-user-check' },
      'started': { text: 'בדרך', class: 'info', icon: 'fa-car' },
      'completed': { text: 'הושלמה', class: 'success', icon: 'fa-check-circle' },
      'cancelled': { text: 'בוטלה', class: 'danger', icon: 'fa-times-circle' }
    };

    const s = statuses[status] || { text: status, class: 'info', icon: 'fa-circle' };
    return `<span class="status ${s.class}"><i class="fas ${s.icon}"></i> ${s.text}</span>`;
  }

  truncate(text, length) {
    if (!text) return '';
    return text.length > length ? text.substring(0, length) + '...' : text;
  }

  formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  }

  formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('he-IL');
  }

  async loadDriversList() {
    try {
      const response = await fetch('/api/drivers?active=true');
      if (response.ok) {
        this.drivers = await response.json();
      }
    } catch (error) {
      console.error('Error loading drivers:', error);
    }
  }

  showRideActions(rideId) {
    // Close all other dropdowns
    document.querySelectorAll('.action-dropdown').forEach(el => {
      el.classList.remove('active');
    });

    // Toggle this dropdown
    const dropdown = document.getElementById(`actions-${rideId}`);
    if (dropdown) {
      dropdown.classList.toggle('active');
    }
  }

  getLoadingHTML() {
    return `
      <div class="loading active">
        <div class="spinner"></div>
        <p>טוען נסיעות...</p>
      </div>
    `;
  }

  getEmptyStateHTML(message) {
    return `
      <div class="empty-state">
        <i class="fas fa-car"></i>
        <h3>${message}</h3>
      </div>
    `;
  }

  getErrorHTML(message) {
    return `
      <div class="empty-state">
        <i class="fas fa-exclamation-circle" style="color: var(--danger);"></i>
        <h3>${message}</h3>
      </div>
    `;
  }

  showSuccess(message) {
    // Implementation similar to Dashboard
    console.log('✅', message);
    alert(message); // Temporary
  }

  showError(message) {
    console.error('❌', message);
    alert(message); // Temporary
  }
}

// ============================================
// 📤 EXPORT
// ============================================
window.RidesManager = RidesManager;
window.ridesManager = new RidesManager();
