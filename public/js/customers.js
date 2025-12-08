// ============================================
// 👤 CUSTOMERS LOGIC - ניהול לקוחות מלא
// ============================================

class CustomersManager {
  constructor() {
    this.customers = [];
    this.filters = {
      status: 'all',
      search: ''
    };
  }

  // ============================================
  // 📥 LOAD CUSTOMERS
  // ============================================
  async loadCustomers() {
    const container = document.getElementById('customersListContainer');
    if (!container) return;
    
    container.innerHTML = this.getLoadingHTML();
    
    try {
      let url = '/api/customers?';
      if (this.filters.status !== 'all') url += `status=${this.filters.status}&`;
      if (this.filters.search) url += `search=${this.filters.search}&`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch customers');
      
      this.customers = await response.json();
      this.renderCustomersTable(container);
      
    } catch (error) {
      console.error('Error:', error);
      container.innerHTML = this.getErrorHTML('שגיאה בטעינת לקוחות');
    }
  }

  // ============================================
  // 🎨 RENDER TABLE
  // ============================================
  renderCustomersTable(container) {
    if (this.customers.length === 0) {
      container.innerHTML = this.getEmptyStateHTML('אין לקוחות');
      return;
    }

    let html = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>שם</th>
              <th>טלפון</th>
              <th>אימייל</th>
              <th>נסיעות</th>
              <th>סה"כ הוצאות</th>
              <th>סטטוס</th>
              <th>תאריך הצטרפות</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
    `;

    this.customers.forEach(customer => {
      const stats = customer.stats || {};
      html += `
        <tr>
          <td>
            <strong>${customer.name}</strong>
            ${customer.isVIP ? '<span class="status warning" style="font-size: 11px; margin-right: 8px;"><i class="fas fa-star"></i> VIP</span>' : ''}
          </td>
          <td>${customer.phone}</td>
          <td>${customer.email || '-'}</td>
          <td><strong>${stats.totalRides || 0}</strong></td>
          <td><strong>₪${stats.totalSpent || 0}</strong></td>
          <td>${this.getCustomerStatus(customer)}</td>
          <td>${this.formatDate(customer.createdAt)}</td>
          <td>
            <div class="action-menu">
              <button class="action-btn" onclick="customersManager.showActions('${customer._id}')">
                <i class="fas fa-ellipsis-v"></i>
              </button>
              <div class="action-dropdown" id="cust-actions-${customer._id}">
                <div class="action-dropdown-item" onclick="customersManager.viewCustomer('${customer._id}')">
                  <i class="fas fa-eye"></i> צפייה
                </div>
                <div class="action-dropdown-item" onclick="customersManager.editCustomer('${customer._id}')">
                  <i class="fas fa-edit"></i> עריכה
                </div>
                <div class="action-dropdown-item" onclick="customersManager.viewHistory('${customer._id}')">
                  <i class="fas fa-history"></i> היסטוריה
                </div>
                ${!customer.isVIP ? `
                  <div class="action-dropdown-item" onclick="customersManager.makeVIP('${customer._id}')">
                    <i class="fas fa-star"></i> שדרוג ל-VIP
                  </div>
                ` : ''}
                <div class="action-dropdown-item" onclick="customersManager.addNote('${customer._id}')">
                  <i class="fas fa-sticky-note"></i> הוסף הערה
                </div>
              </div>
            </div>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  }

  // ============================================
  // ➕ ADD CUSTOMER
  // ============================================
  showAddCustomerForm() {
    const modal = document.getElementById('addCustomerModal');
    if (!modal) return;
    
    modal.querySelector('.modal-body').innerHTML = `
      <div class="form-group">
        <label>שם מלא *</label>
        <input type="text" class="form-control" id="customerName" required>
      </div>
      
      <div class="grid-2">
        <div class="form-group">
          <label>טלפון *</label>
          <input type="tel" class="form-control" id="customerPhone" required placeholder="05X-XXXXXXX">
        </div>
        <div class="form-group">
          <label>אימייל</label>
          <input type="email" class="form-control" id="customerEmail" placeholder="example@mail.com">
        </div>
      </div>

      <div class="form-group">
        <label>כתובת ברירת מחדל</label>
        <input type="text" class="form-control" id="customerAddress" placeholder="רחוב 123, עיר">
      </div>

      <div class="form-group">
        <label>סוג לקוח</label>
        <select class="form-control" id="customerType">
          <option value="regular">רגיל</option>
          <option value="vip">VIP (הנחה 10%)</option>
          <option value="business">עסקי (חשבונית)</option>
        </select>
      </div>

      <div class="form-group">
        <label>הערות</label>
        <textarea class="form-control" id="customerNotes" rows="3"></textarea>
      </div>
    `;
    
    modal.classList.add('active');
  }

  async saveCustomer() {
    const data = {
      name: document.getElementById('customerName').value,
      phone: document.getElementById('customerPhone').value,
      email: document.getElementById('customerEmail').value,
      defaultAddress: document.getElementById('customerAddress').value,
      type: document.getElementById('customerType').value,
      notes: document.getElementById('customerNotes').value,
      isVIP: document.getElementById('customerType').value === 'vip'
    };

    if (!data.name || !data.phone) {
      alert('שם וטלפון הם שדות חובה');
      return;
    }

    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) throw new Error('Failed');

      this.showSuccess('✅ לקוח נוסף בהצלחה!');
      document.getElementById('addCustomerModal').classList.remove('active');
      this.loadCustomers();
      
    } catch (error) {
      console.error('Error:', error);
      this.showError('❌ שגיאה בהוספת לקוח');
    }
  }

  // ============================================
  // 👁️ VIEW CUSTOMER
  // ============================================
  async viewCustomer(customerId) {
    try {
      const response = await fetch(`/api/customers/${customerId}`);
      if (!response.ok) throw new Error('Failed');
      
      const customer = await response.json();
      this.showCustomerModal(customer);
      
    } catch (error) {
      console.error('Error:', error);
      this.showError('שגיאה בטעינת פרטי לקוח');
    }
  }

  showCustomerModal(customer) {
    const modal = document.getElementById('viewCustomerModal');
    if (!modal) return;

    const stats = customer.stats || {};
    
    modal.querySelector('.modal-body').innerHTML = `
      <div class="customer-header">
        <div class="customer-avatar">
          <i class="fas fa-user"></i>
        </div>
        <div>
          <h2>${customer.name}</h2>
          ${customer.isVIP ? '<span class="status warning"><i class="fas fa-star"></i> VIP</span>' : ''}
        </div>
      </div>

      <div class="stats-grid" style="margin: 20px 0;">
        <div class="stat-mini">
          <div class="stat-label">נסיעות</div>
          <div class="stat-value">${stats.totalRides || 0}</div>
        </div>
        <div class="stat-mini">
          <div class="stat-label">סה"כ הוצאות</div>
          <div class="stat-value">₪${stats.totalSpent || 0}</div>
        </div>
        <div class="stat-mini">
          <div class="stat-label">ממוצע</div>
          <div class="stat-value">₪${stats.avgRidePrice || 0}</div>
        </div>
      </div>

      <div class="form-group">
        <label>טלפון</label>
        <div>${customer.phone}</div>
      </div>

      ${customer.email ? `
        <div class="form-group">
          <label>אימייל</label>
          <div>${customer.email}</div>
        </div>
      ` : ''}

      ${customer.defaultAddress ? `
        <div class="form-group">
          <label>כתובת ברירת מחדל</label>
          <div>${customer.defaultAddress}</div>
        </div>
      ` : ''}

      ${customer.notes ? `
        <div class="form-group">
          <label>הערות</label>
          <div>${customer.notes}</div>
        </div>
      ` : ''}

      <div class="form-group">
        <label>תאריך הצטרפות</label>
        <div>${this.formatDateTime(customer.createdAt)}</div>
      </div>
    `;

    modal.classList.add('active');
  }

  // ============================================
  // 📊 VIEW HISTORY
  // ============================================
  async viewHistory(customerId) {
    try {
      const response = await fetch(`/api/customers/${customerId}/rides`);
      if (!response.ok) throw new Error('Failed');
      
      const rides = await response.json();
      this.showHistoryModal(customerId, rides);
      
    } catch (error) {
      console.error('Error:', error);
      this.showError('שגיאה בטעינת היסטוריה');
    }
  }

  showHistoryModal(customerId, rides) {
    const modal = document.getElementById('historyModal');
    if (!modal) return;

    let html = '<h3>היסטוריית נסיעות</h3>';
    
    if (rides.length === 0) {
      html += '<div class="empty-state"><i class="fas fa-inbox"></i><p>אין נסיעות</p></div>';
    } else {
      html += `
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>מספר</th>
                <th>תאריך</th>
                <th>מ</th>
                <th>ל</th>
                <th>מחיר</th>
                <th>סטטוס</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      rides.forEach(ride => {
        html += `
          <tr>
            <td>${ride.rideNumber}</td>
            <td>${this.formatDate(ride.createdAt)}</td>
            <td>${this.truncate(ride.pickup, 20)}</td>
            <td>${this.truncate(ride.destination, 20)}</td>
            <td>₪${ride.price}</td>
            <td>${this.getRideStatus(ride.status)}</td>
          </tr>
        `;
      });
      
      html += '</tbody></table></div>';
    }

    modal.querySelector('.modal-body').innerHTML = html;
    modal.classList.add('active');
  }

  // ============================================
  // ⭐ MAKE VIP
  // ============================================
  async makeVIP(customerId) {
    if (!confirm('האם לשדרג לקוח זה ל-VIP?')) return;
    
    try {
      const response = await fetch(`/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVIP: true })
      });

      if (!response.ok) throw new Error('Failed');

      this.showSuccess('✅ לקוח שודרג ל-VIP!');
      this.loadCustomers();
      
    } catch (error) {
      console.error('Error:', error);
      this.showError('❌ שגיאה');
    }
  }

  // ============================================
  // 📝 ADD NOTE
  // ============================================
  async addNote(customerId) {
    const note = prompt('הערה:');
    if (!note) return;
    
    try {
      const response = await fetch(`/api/customers/${customerId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note })
      });

      if (!response.ok) throw new Error('Failed');

      this.showSuccess('✅ הערה נוספה');
      
    } catch (error) {
      console.error('Error:', error);
      this.showError('❌ שגיאה');
    }
  }

  // ============================================
  // 🔍 FILTERS
  // ============================================
  applyFilters() {
    const search = document.getElementById('customerSearch')?.value || '';
    const status = document.getElementById('customerStatus')?.value || 'all';
    
    this.filters.search = search;
    this.filters.status = status;
    
    this.loadCustomers();
  }

  // ============================================
  // 🛠️ HELPERS
  // ============================================
  getCustomerStatus(customer) {
    if (customer.isBlocked) {
      return '<span class="status danger"><i class="fas fa-ban"></i> חסום</span>';
    }
    if (customer.isVIP) {
      return '<span class="status success"><i class="fas fa-star"></i> פעיל</span>';
    }
    return '<span class="status info"><i class="fas fa-check"></i> פעיל</span>';
  }

  getRideStatus(status) {
    const statuses = {
      'completed': '<span class="status success">הושלמה</span>',
      'cancelled': '<span class="status danger">בוטלה</span>',
      'active': '<span class="status info">פעילה</span>'
    };
    return statuses[status] || status;
  }

  formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('he-IL');
  }

  formatDateTime(dateString) {
    return new Date(dateString).toLocaleString('he-IL');
  }

  truncate(text, length) {
    if (!text) return '';
    return text.length > length ? text.substring(0, length) + '...' : text;
  }

  showActions(customerId) {
    document.querySelectorAll('.action-dropdown').forEach(el => el.classList.remove('active'));
    document.getElementById(`cust-actions-${customerId}`)?.classList.toggle('active');
  }

  editCustomer(id) {
    alert('עריכה בפיתוח...');
  }

  getLoadingHTML() {
    return '<div class="loading active"><div class="spinner"></div><p>טוען...</p></div>';
  }

  getEmptyStateHTML(message) {
    return `<div class="empty-state"><i class="fas fa-users"></i><h3>${message}</h3></div>`;
  }

  getErrorHTML(message) {
    return `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>${message}</h3></div>`;
  }

  showSuccess(msg) {
    console.log('✅', msg);
    alert(msg);
  }

  showError(msg) {
    console.error('❌', msg);
    alert(msg);
  }
}

// ============================================
// 📤 EXPORT
// ============================================
window.CustomersManager = CustomersManager;
window.customersManager = new CustomersManager();
