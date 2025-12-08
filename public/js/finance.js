// ============================================
// 💰 FINANCE LOGIC - ניהול כספים מלא
// ============================================

class FinanceManager {
  constructor() {
    this.stats = {};
    this.payments = [];
    this.commissions = [];
  }

  // ============================================
  // 📊 LOAD OVERVIEW
  // ============================================
  async loadOverview() {
    try {
      const response = await fetch('/api/finance/overview');
      if (!response.ok) throw new Error('Failed');
      
      this.stats = await response.json();
      this.renderOverview();
      
    } catch (error) {
      console.error('Error:', error);
    }
  }

  renderOverview() {
    // Update stat cards
    document.getElementById('todayRevenue')?.innerText = this.stats.today?.revenue || 0;
    document.getElementById('weekRevenue')?.innerText = this.stats.week?.revenue || 0;
    document.getElementById('monthRevenue')?.innerText = this.stats.month?.revenue || 0;
    document.getElementById('todayCommissions')?.innerText = this.stats.today?.commissions || 0;
    document.getElementById('monthCommissions')?.innerText = this.stats.month?.commissions || 0;
    document.getElementById('driverDebts')?.innerText = this.stats.debts?.total || 0;

    // Render charts
    this.renderRevenueChart();
    this.renderDriversChart();
  }

  // ============================================
  // 📈 CHARTS
  // ============================================
  renderRevenueChart() {
    const canvas = document.getElementById('revenueChart');
    if (!canvas) return;

    const data = this.stats.last7Days || [];
    
    // Simple implementation - can be enhanced with Chart.js
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw chart here...
    console.log('Revenue chart data:', data);
  }

  renderDriversChart() {
    const canvas = document.getElementById('driversChart');
    if (!canvas) return;

    const data = this.stats.topDrivers || [];
    console.log('Top drivers:', data);
  }

  // ============================================
  // 💳 LOAD PAYMENTS
  // ============================================
  async loadPayments() {
    const container = document.getElementById('paymentsContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="loading active"><div class="spinner"></div></div>';
    
    try {
      const response = await fetch('/api/finance/payments');
      if (!response.ok) throw new Error('Failed');
      
      this.payments = await response.json();
      this.renderPaymentsTable(container);
      
    } catch (error) {
      console.error('Error:', error);
      container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>שגיאה</h3></div>';
    }
  }

  renderPaymentsTable(container) {
    if (this.payments.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-receipt"></i><h3>אין תשלומים</h3></div>';
      return;
    }

    let html = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>תאריך</th>
              <th>נהג</th>
              <th>סכום</th>
              <th>אמצעי</th>
              <th>סטטוס</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
    `;

    this.payments.forEach(payment => {
      html += `
        <tr>
          <td>${this.formatDate(payment.date)}</td>
          <td>${payment.driverName} (${payment.driverId})</td>
          <td><strong>₪${payment.amount}</strong></td>
          <td>${this.getPaymentMethod(payment.method)}</td>
          <td>${this.getPaymentStatus(payment.status)}</td>
          <td>
            ${payment.status === 'pending' ? `
              <button class="btn btn-sm btn-success" onclick="financeManager.markAsPaid('${payment._id}')">
                <i class="fas fa-check"></i> שולם
              </button>
            ` : ''}
            <button class="btn btn-sm btn-primary" onclick="financeManager.generateReceipt('${payment._id}')">
              <i class="fas fa-file-invoice"></i> קבלה
            </button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  // ============================================
  // 📊 COMMISSIONS
  // ============================================
  async loadCommissions() {
    const container = document.getElementById('commissionsContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="loading active"><div class="spinner"></div></div>';
    
    try {
      const response = await fetch('/api/finance/commissions');
      if (!response.ok) throw new Error('Failed');
      
      this.commissions = await response.json();
      this.renderCommissionsSettings(container);
      
    } catch (error) {
      console.error('Error:', error);
    }
  }

  renderCommissionsSettings(container) {
    const settings = this.commissions.settings || {};
    
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3><i class="fas fa-percentage"></i> הגדרות עמלות</h3>
        </div>
        <div class="card-body">
          <div class="form-group">
            <label>אחוז עמלה גלובלי</label>
            <div class="input-group">
              <input type="number" class="form-control" id="globalCommission" 
                     value="${settings.global || 20}" min="0" max="100">
              <span class="input-addon">%</span>
            </div>
          </div>

          <div class="form-group">
            <label>עמלה מינימלית</label>
            <div class="input-group">
              <span class="input-addon">₪</span>
              <input type="number" class="form-control" id="minCommission" 
                     value="${settings.min || 10}" min="0">
            </div>
          </div>

          <div class="form-group">
            <label>עמלה מקסימלית</label>
            <div class="input-group">
              <span class="input-addon">₪</span>
              <input type="number" class="form-control" id="maxCommission" 
                     value="${settings.max || 100}" min="0">
            </div>
          </div>

          <button class="btn btn-primary" onclick="financeManager.saveCommissionSettings()">
            <i class="fas fa-save"></i> שמור הגדרות
          </button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3><i class="fas fa-chart-bar"></i> סיכום עמלות חודשי</h3>
        </div>
        <div class="card-body">
          <div class="stats-grid">
            <div class="stat-mini">
              <div class="stat-label">סה"כ עמלות החודש</div>
              <div class="stat-value">₪${this.commissions.monthTotal || 0}</div>
            </div>
            <div class="stat-mini">
              <div class="stat-label">ממוצע לנהג</div>
              <div class="stat-value">₪${this.commissions.avgPerDriver || 0}</div>
            </div>
            <div class="stat-mini">
              <div class="stat-label">נהגים משלמים</div>
              <div class="stat-value">${this.commissions.payingDrivers || 0}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async saveCommissionSettings() {
    const settings = {
      global: document.getElementById('globalCommission').value,
      min: document.getElementById('minCommission').value,
      max: document.getElementById('maxCommission').value
    };

    try {
      const response = await fetch('/api/finance/commissions/settings', {
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
  // 📄 REPORTS
  // ============================================
  async loadReports() {
    const container = document.getElementById('reportsContainer');
    if (!container) return;
    
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3><i class="fas fa-file-invoice-dollar"></i> יצירת דוח</h3>
        </div>
        <div class="card-body">
          <div class="form-group">
            <label>סוג דוח</label>
            <select class="form-control" id="reportType">
              <option value="revenue">הכנסות</option>
              <option value="drivers">נהגים</option>
              <option value="customers">לקוחות</option>
              <option value="commissions">עמלות</option>
            </select>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label>מתאריך</label>
              <input type="date" class="form-control" id="reportFrom">
            </div>
            <div class="form-group">
              <label>עד תאריך</label>
              <input type="date" class="form-control" id="reportTo">
            </div>
          </div>

          <div class="form-group">
            <label>פורמט</label>
            <div class="btn-group">
              <button class="btn btn-outline" onclick="financeManager.generateReport('excel')">
                <i class="fas fa-file-excel"></i> Excel
              </button>
              <button class="btn btn-outline" onclick="financeManager.generateReport('pdf')">
                <i class="fas fa-file-pdf"></i> PDF
              </button>
              <button class="btn btn-outline" onclick="financeManager.generateReport('csv')">
                <i class="fas fa-file-csv"></i> CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3><i class="fas fa-history"></i> דוחות אחרונים</h3>
        </div>
        <div class="card-body">
          <div id="recentReports">
            <div class="empty-state">
              <i class="fas fa-inbox"></i>
              <p>אין דוחות אחרונים</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async generateReport(format) {
    const type = document.getElementById('reportType').value;
    const from = document.getElementById('reportFrom').value;
    const to = document.getElementById('reportTo').value;

    if (!from || !to) {
      alert('יש לבחור תאריכים');
      return;
    }

    try {
      const response = await fetch('/api/finance/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, from, to, format })
      });

      if (!response.ok) throw new Error('Failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${type}-${from}-${to}.${format}`;
      a.click();

      alert('✅ דוח הופק בהצלחה!');
      
    } catch (error) {
      console.error('Error:', error);
      alert('❌ שגיאה ביצירת דוח');
    }
  }

  // ============================================
  // 💳 PAYMENT ACTIONS
  // ============================================
  async markAsPaid(paymentId) {
    if (!confirm('סמן תשלום כשולם?')) return;
    
    try {
      const response = await fetch(`/api/finance/payments/${paymentId}/paid`, {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Failed');

      alert('✅ תשלום סומן כשולם');
      this.loadPayments();
      
    } catch (error) {
      console.error('Error:', error);
      alert('❌ שגיאה');
    }
  }

  async generateReceipt(paymentId) {
    try {
      const response = await fetch(`/api/finance/payments/${paymentId}/receipt`);
      if (!response.ok) throw new Error('Failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      
    } catch (error) {
      console.error('Error:', error);
      alert('❌ שגיאה ביצירת קבלה');
    }
  }

  // ============================================
  // 🛠️ HELPERS
  // ============================================
  getPaymentMethod(method) {
    const methods = {
      'cash': '<i class="fas fa-money-bill"></i> מזומן',
      'credit': '<i class="fas fa-credit-card"></i> אשראי',
      'transfer': '<i class="fas fa-exchange-alt"></i> העברה'
    };
    return methods[method] || method;
  }

  getPaymentStatus(status) {
    const statuses = {
      'paid': '<span class="status success"><i class="fas fa-check"></i> שולם</span>',
      'pending': '<span class="status warning"><i class="fas fa-clock"></i> ממתין</span>',
      'cancelled': '<span class="status danger"><i class="fas fa-times"></i> בוטל</span>'
    };
    return statuses[status] || status;
  }

  formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('he-IL');
  }
}

// ============================================
// 📤 EXPORT
// ============================================
window.FinanceManager = FinanceManager;
window.financeManager = new FinanceManager();
