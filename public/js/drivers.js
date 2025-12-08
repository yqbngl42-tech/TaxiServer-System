// ============================================
// 👨‍✈️ DRIVERS LOGIC - ניהול נהגים מלא
// ============================================

class DriversManager {
  constructor() {
    this.drivers = [];
    this.pendingDrivers = [];
  }

  // ============================================
  // 📥 LOAD DRIVERS
  // ============================================
  async loadDrivers(filters = {}) {
    const container = document.getElementById('driversListContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="loading active"><div class="spinner"></div></div>';
    
    try {
      let url = '/api/drivers?';
      if (filters.status) url += `status=${filters.status}&`;
      if (filters.city) url += `city=${filters.city}&`;
      if (filters.search) url += `search=${filters.search}&`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch drivers');
      
      this.drivers = await response.json();
      this.renderDriversGrid(container);
      
    } catch (error) {
      console.error('Error:', error);
      container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>שגיאה בטעינה</h3></div>';
    }
  }

  // ============================================
  // 🎨 RENDER DRIVERS GRID
  // ============================================
  renderDriversGrid(container) {
    if (this.drivers.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><h3>אין נהגים</h3></div>';
      return;
    }

    let html = '<div class="drivers-grid">';
    
    this.drivers.forEach(driver => {
      const profileImg = driver.documents?.profilePhoto?.url || '/default-avatar.png';
      const carImg = driver.documents?.carPhoto?.url || '/default-car.png';
      
      html += `
        <div class="driver-card">
          <div class="driver-header">
            <img src="${profileImg}" alt="${driver.name}" class="driver-avatar">
            <div class="driver-info">
              <h3>${driver.name}</h3>
              <div class="driver-id">${driver.driverId}</div>
            </div>
            <div class="driver-status">
              ${this.getStatusBadge(driver)}
            </div>
          </div>
          
          <div class="driver-details">
            <div class="detail-row">
              <i class="fas fa-phone"></i>
              <span>${driver.phone}</span>
            </div>
            <div class="detail-row">
              <i class="fas fa-car"></i>
              <span>${driver.vehicleType} (${driver.vehicleNumber})</span>
            </div>
            <div class="detail-row">
              <i class="fas fa-map-marker-alt"></i>
              <span>${driver.city || 'לא צוין'} • ${driver.workArea || 'לא צוין'}</span>
            </div>
            <div class="detail-row">
              <i class="fas fa-star"></i>
              <span>דירוג: ${driver.rating || 'אין'} • ${driver.stats?.totalRides || 0} נסיעות</span>
            </div>
          </div>

          ${carImg !== '/default-car.png' ? `
            <div class="driver-car-img">
              <img src="${carImg}" alt="רכב">
            </div>
          ` : ''}
          
          <div class="driver-actions">
            <button class="btn btn-sm btn-primary" onclick="driversManager.viewDriver('${driver._id}')">
              <i class="fas fa-eye"></i> צפייה
            </button>
            <button class="btn btn-sm btn-success" onclick="driversManager.editDriver('${driver._id}')">
              <i class="fas fa-edit"></i> עריכה
            </button>
            ${driver.isActive ? `
              <button class="btn btn-sm btn-warning" onclick="driversManager.toggleActive('${driver._id}', false)">
                <i class="fas fa-pause"></i> השבת
              </button>
            ` : `
              <button class="btn btn-sm btn-success" onclick="driversManager.toggleActive('${driver._id}', true)">
                <i class="fas fa-play"></i> הפעל
              </button>
            `}
            ${driver.isBlocked ? `
              <button class="btn btn-sm btn-success" onclick="driversManager.unblockDriver('${driver._id}')">
                <i class="fas fa-unlock"></i> בטל חסימה
              </button>
            ` : `
              <button class="btn btn-sm btn-danger" onclick="driversManager.blockDriver('${driver._id}')">
                <i class="fas fa-ban"></i> חסום
              </button>
            `}
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    container.innerHTML = html;
  }

  // ============================================
  // ⏳ LOAD PENDING DRIVERS
  // ============================================
  async loadPendingDrivers() {
    const container = document.getElementById('pendingDriversContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="loading active"><div class="spinner"></div></div>';
    
    try {
      const response = await fetch('/api/drivers?registrationStatus=pending');
      if (!response.ok) throw new Error('Failed');
      
      this.pendingDrivers = await response.json();
      this.renderPendingDrivers(container);
      
    } catch (error) {
      console.error('Error:', error);
    }
  }

  renderPendingDrivers(container) {
    if (this.pendingDrivers.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><h3>אין בקשות ממתינות</h3><p>כל הנהגים אושרו!</p></div>';
      return;
    }

    let html = '';
    this.pendingDrivers.forEach(driver => {
      html += `
        <div class="pending-driver-card">
          <div class="card-header">
            <h3>${driver.name}</h3>
            <span class="status warning">ממתין לאישור</span>
          </div>
          
          <div class="grid-2">
            <div><strong>ת.ז.:</strong> ${driver.idNumber}</div>
            <div><strong>טלפון:</strong> ${driver.phone}</div>
            <div><strong>רכב:</strong> ${driver.vehicleType}</div>
            <div><strong>מספר רכב:</strong> ${driver.vehicleNumber}</div>
            <div><strong>עיר:</strong> ${driver.city || 'לא צוין'}</div>
            <div><strong>אזור עבודה:</strong> ${driver.workArea}</div>
          </div>

          <div class="documents-grid">
            ${driver.documents?.idDocument?.url ? `
              <div class="document-preview">
                <label>רישיון/ת.ז.</label>
                <img src="${driver.documents.idDocument.url}" alt="מסמך זיהוי" onclick="driversManager.viewImage(this.src)">
              </div>
            ` : ''}
            
            ${driver.documents?.profilePhoto?.url ? `
              <div class="document-preview">
                <label>תמונת פרופיל</label>
                <img src="${driver.documents.profilePhoto.url}" alt="פרופיל" onclick="driversManager.viewImage(this.src)">
              </div>
            ` : ''}
            
            ${driver.documents?.carPhoto?.url ? `
              <div class="document-preview">
                <label>תמונת רכב</label>
                <img src="${driver.documents.carPhoto.url}" alt="רכב" onclick="driversManager.viewImage(this.src)">
              </div>
            ` : ''}
          </div>

          <div class="actions-row">
            <button class="btn btn-success" onclick="driversManager.approveDriver('${driver._id}')">
              <i class="fas fa-check"></i> אשר
            </button>
            <button class="btn btn-danger" onclick="driversManager.rejectDriver('${driver._id}')">
              <i class="fas fa-times"></i> דחה
            </button>
            <button class="btn btn-secondary" onclick="driversManager.callDriver('${driver.phone}')">
              <i class="fas fa-phone"></i> התקשר
            </button>
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
  }

  // ============================================
  // ✅ APPROVE DRIVER
  // ============================================
  async approveDriver(driverId) {
    if (!confirm('האם לאשר את הנהג?')) return;
    
    try {
      const response = await fetch(`/api/drivers/${driverId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) throw new Error('Failed');
      
      alert('✅ הנהג אושר בהצלחה!');
      this.loadPendingDrivers();
      
    } catch (error) {
      console.error('Error:', error);
      alert('❌ שגיאה באישור');
    }
  }

  // ============================================
  // ❌ REJECT DRIVER
  // ============================================
  async rejectDriver(driverId) {
    const reason = prompt('סיבת דחייה:');
    if (!reason) return;
    
    try {
      const response = await fetch(`/api/drivers/${driverId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      
      if (!response.ok) throw new Error('Failed');
      
      alert('✅ הנהג נדחה');
      this.loadPendingDrivers();
      
    } catch (error) {
      console.error('Error:', error);
      alert('❌ שגיאה');
    }
  }

  // ============================================
  // 🔄 TOGGLE ACTIVE
  // ============================================
  async toggleActive(driverId, active) {
    try {
      const response = await fetch(`/api/drivers/${driverId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: active })
      });
      
      if (!response.ok) throw new Error('Failed');
      
      alert(`✅ נהג ${active ? 'הופעל' : 'הושבת'} בהצלחה`);
      this.loadDrivers();
      
    } catch (error) {
      console.error('Error:', error);
      alert('❌ שגיאה');
    }
  }

  // ============================================
  // 🚫 BLOCK DRIVER
  // ============================================
  async blockDriver(driverId) {
    const reason = prompt('סיבת חסימה:');
    if (!reason) return;
    
    try {
      const response = await fetch(`/api/drivers/${driverId}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      
      if (!response.ok) throw new Error('Failed');
      
      alert('✅ נהג נחסם');
      this.loadDrivers();
      
    } catch (error) {
      console.error('Error:', error);
      alert('❌ שגיאה');
    }
  }

  async unblockDriver(driverId) {
    if (!confirm('בטל חסימה?')) return;
    
    try {
      const response = await fetch(`/api/drivers/${driverId}/unblock`, {
        method: 'POST'
      });
      
      if (!response.ok) throw new Error('Failed');
      
      alert('✅ חסימה בוטלה');
      this.loadDrivers();
      
    } catch (error) {
      console.error('Error:', error);
      alert('❌ שגיאה');
    }
  }

  // ============================================
  // 🛠️ HELPERS
  // ============================================
  getStatusBadge(driver) {
    if (driver.isBlocked) {
      return '<span class="status danger"><i class="fas fa-ban"></i> חסום</span>';
    }
    if (!driver.isActive) {
      return '<span class="status warning"><i class="fas fa-pause"></i> לא פעיל</span>';
    }
    return '<span class="status success"><i class="fas fa-check-circle"></i> פעיל</span>';
  }

  viewImage(src) {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = `
      <div class="image-modal-content">
        <img src="${src}" alt="תמונה">
        <button onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;
    modal.onclick = () => modal.remove();
    document.body.appendChild(modal);
  }

  callDriver(phone) {
    window.location.href = `tel:${phone}`;
  }

  viewDriver(id) {
    window.location.href = `/driver-profile.html?id=${id}`;
  }

  editDriver(id) {
    // Open edit modal
    alert('עריכה בפיתוח...');
  }
}

// ============================================
// 📤 EXPORT
// ============================================
window.DriversManager = DriversManager;
window.driversManager = new DriversManager();
