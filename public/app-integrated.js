// ============================================
// 🚖 TAXI ADMIN SYSTEM - INTEGRATED V2
// Integration Layer for Existing Backend
// ============================================

// ============================================
// 🔐 SECURITY & INITIALIZATION
// ============================================
const token = localStorage.getItem('authToken');

if (!token) {
  window.location.href = '/login.html';
}

// Global State
let currentPhoneList = [];
let currentRideId = null;
let currentGroupId = null;
let isDarkMode = localStorage.getItem('darkMode') === 'true';
let currentFilter = 'all';
let charts = {};

// Apply Dark Mode on Load
if (isDarkMode) {
  document.body.classList.add('dark-mode');
}

// ============================================
// 🎯 INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 System initialized');
  
  // Load initial data
  await loadDashboard();
  
  // Setup auto-refresh
  setInterval(refreshAllData, 30000); // Every 30 seconds
  
  // Setup global search
  setupGlobalSearch();
  
  // Update time display
  updateLastUpdateTime();
  setInterval(updateLastUpdateTime, 60000);
});

// ============================================
// 🌙 DARK MODE
// ============================================
function toggleDarkMode() {
  isDarkMode = !isDarkMode;
  localStorage.setItem('darkMode', isDarkMode);
  document.body.classList.toggle('dark-mode');
  
  // Update charts colors
  if (charts.ridesChart) {
    updateChartsTheme();
  }
  
  showToast(isDarkMode ? 'מצב כהה הופעל' : 'מצב בהיר הופעל', 'info');
}

// ============================================
// 📱 UI CONTROLS
// ============================================
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
  localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

function toggleUserMenu() {
  const dropdown = document.getElementById('userDropdown');
  dropdown.classList.toggle('active');
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.user-dropdown')) {
    document.getElementById('userDropdown')?.classList.remove('active');
  }
});

// ============================================
// 🚪 LOGOUT
// ============================================
async function logout() {
  try {
    await fetch('/api/logout', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });
    localStorage.removeItem('authToken');
    window.location.href = '/login.html';
  } catch (err) {
    console.error('❌ Logout error:', err);
    localStorage.removeItem('authToken');
    window.location.href = '/login.html';
  }
}

// ============================================
// 📑 TAB NAVIGATION
// ============================================
function showTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  // Remove active from nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });

  // Show selected tab
  document.getElementById(tabName).classList.add('active');

  // Mark nav item as active
  document.querySelector(`[data-page="${tabName}"]`)?.classList.add('active');

  // Update page title and icon
  const titles = {
    dashboard: { title: 'לוח בקרה', icon: 'dashboard' },
    rides: { title: 'ניהול נסיעות', icon: 'local_taxi' },
    drivers: { title: 'ניהול נהגים', icon: 'people' },
    groups: { title: 'קבוצות WhatsApp', icon: 'groups_2' },
    admin: { title: 'ניהול אדמין', icon: 'admin_panel_settings' }
  };

  const pageInfo = titles[tabName];
  if (pageInfo) {
    document.getElementById('pageTitle').textContent = pageInfo.title;
    document.getElementById('pageIcon').textContent = pageInfo.icon;
  }

  // Load data for tab
  if (tabName === 'dashboard') loadDashboard();
  if (tabName === 'rides') loadRides();
  if (tabName === 'drivers') loadDrivers();
  if (tabName === 'groups') loadGroups();
  if (tabName === 'admin') loadAdminContact();
}

// ============================================
// 📊 DASHBOARD
// ============================================
async function loadDashboard() {
  try {
    showLoading();
    
    // Load statistics
    const statsResponse = await fetch('/api/statistics', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const statsData = await statsResponse.json();

    if (statsData.ok) {
      renderDashboardStats(statsData);
      renderDashboardCharts(statsData);
    }

    // Load recent rides
    await loadRecentRides();

    hideLoading();
  } catch (error) {
    console.error('Error loading dashboard:', error);
    showToast('שגיאה בטעינת לוח הבקרה', 'error');
    hideLoading();
  }
}

function renderDashboardStats(data) {
  const statsGrid = document.getElementById('statsGrid');
  
  const stats = [
    {
      title: 'נסיעות היום',
      value: data.todayRides || 0,
      icon: 'local_taxi',
      color: '#3498db',
      change: data.ridesChange || 0
    },
    {
      title: 'נהגים פעילים',
      value: data.activeDrivers || 0,
      icon: 'people',
      color: '#27ae60',
      change: data.driversChange || 0
    },
    {
      title: 'הכנסות היום',
      value: `₪${(data.todayRevenue || 0).toLocaleString()}`,
      icon: 'paid',
      color: '#f39c12',
      change: data.revenueChange || 0
    },
    {
      title: 'ממתינים לאישור',
      value: data.pendingApprovals || 0,
      icon: 'pending',
      color: '#e74c3c',
      change: 0
    }
  ];

  statsGrid.innerHTML = stats.map(stat => `
    <div class="stat-card" style="border-left: 4px solid ${stat.color}">
      <div class="stat-icon" style="background: ${stat.color}20; color: ${stat.color}">
        <span class="material-icons">${stat.icon}</span>
      </div>
      <div class="stat-content">
        <div class="stat-label">${stat.title}</div>
        <div class="stat-value">${stat.value}</div>
        ${stat.change !== 0 ? `
          <div class="stat-change ${stat.change > 0 ? 'positive' : 'negative'}">
            <span class="material-icons">${stat.change > 0 ? 'trending_up' : 'trending_down'}</span>
            ${Math.abs(stat.change)}%
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');

  // Update badges
  document.getElementById('ridesCount').textContent = data.activeRides || 0;
  document.getElementById('activeDriversCount').textContent = data.activeDrivers || 0;
}

function renderDashboardCharts(data) {
  // Rides Chart
  const ridesCtx = document.getElementById('ridesChart');
  if (ridesCtx && data.ridesPerDay) {
    if (charts.ridesChart) {
      charts.ridesChart.destroy();
    }
    
    charts.ridesChart = new Chart(ridesCtx, {
      type: 'line',
      data: {
        labels: data.ridesPerDay.map(d => d.date),
        datasets: [{
          label: 'נסיעות',
          data: data.ridesPerDay.map(d => d.count),
          borderColor: '#3498db',
          backgroundColor: '#3498db20',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }

  // Status Chart
  const statusCtx = document.getElementById('statusChart');
  if (statusCtx && data.ridesByStatus) {
    if (charts.statusChart) {
      charts.statusChart.destroy();
    }
    
    charts.statusChart = new Chart(statusCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(data.ridesByStatus).map(translateStatus),
        datasets: [{
          data: Object.values(data.ridesByStatus),
          backgroundColor: [
            '#3498db',
            '#27ae60',
            '#f39c12',
            '#e74c3c',
            '#9b59b6'
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }
}

async function loadRecentRides() {
  const tbody = document.getElementById('recentRidesBody');
  
  try {
    const response = await fetch('/api/rides?limit=5&sort=-createdAt', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await response.json();

    if (!data.ok || data.rides.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">אין נסיעות אחרונות</td></tr>';
      return;
    }

    tbody.innerHTML = data.rides.map(ride => `
      <tr onclick="showRideDetails('${ride._id}')" style="cursor: pointer;">
        <td><span class="ride-number">${ride.rideNumber || '#---'}</span></td>
        <td>${ride.customerName}</td>
        <td>${ride.driverName || '---'}</td>
        <td class="route-cell">
          <div class="route-info">
            <span class="material-icons">trip_origin</span>
            ${ride.pickup.substring(0, 20)}
          </div>
          <div class="route-arrow">→</div>
          <div class="route-info">
            <span class="material-icons">location_on</span>
            ${ride.destination.substring(0, 20)}
          </div>
        </td>
        <td><strong>₪${ride.price}</strong></td>
        <td><span class="status-badge status-${ride.status}">${translateStatus(ride.status)}</span></td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error loading recent rides:', error);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: red;">שגיאה בטעינת נתונים</td></tr>';
  }
}

// ============================================
// 🚖 RIDES MANAGEMENT
// ============================================
async function loadRides() {
  const tbody = document.getElementById('ridesTableBody');
  tbody.innerHTML = '<tr><td colspan="9"><div class="loading"><div class="spinner"></div></div></td></tr>';

  try {
    const search = document.getElementById('ridesSearchFilter')?.value || '';
    const date = document.getElementById('ridesDateFilter')?.value || '';

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (date) params.append('date', date);
    if (currentFilter !== 'all') params.append('status', currentFilter);
    params.append('limit', 100);

    const response = await fetch(`/api/rides?${params}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    const data = await response.json();

    if (!data.ok) {
      showToast('שגיאה בטעינת נסיעות', 'error');
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: red;">שגיאה בטעינת נתונים</td></tr>';
      return;
    }

    if (data.rides.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">אין נסיעות</td></tr>';
      return;
    }

    tbody.innerHTML = data.rides.map(ride => `
      <tr>
        <td><span class="ride-number">${ride.rideNumber || '#---'}</span></td>
        <td>${ride.customerName}</td>
        <td>${ride.customerPhone}</td>
        <td>${ride.driverName || '---'}</td>
        <td class="route-cell-compact">${ride.pickup.substring(0, 15)} → ${ride.destination.substring(0, 15)}</td>
        <td><strong>₪${ride.price}</strong></td>
        <td><span class="status-badge status-${ride.status}">${translateStatus(ride.status)}</span></td>
        <td>${formatDate(ride.createdAt)}</td>
        <td>
          <div class="action-buttons">
            <button class="icon-button" onclick="showRideDetails('${ride._id}')" title="צפייה">
              <span class="material-icons">visibility</span>
            </button>
            <button class="icon-button" onclick="updateRideStatus('${ride._id}')" title="עדכון">
              <span class="material-icons">edit</span>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('❌ Error loading rides:', err);
    showToast('שגיאה בטעינת נסיעות', 'error');
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: red;">שגיאה בטעינת נתונים</td></tr>';
  }
}

function filterRides(status, element) {
  currentFilter = status;
  
  // Update active tab
  document.querySelectorAll('.filters-bar .tab').forEach(tab => {
    tab.classList.remove('active');
  });
  element.classList.add('active');
  
  loadRides();
}

function createNewRide() {
  showToast('פונקציה תתווסף בקרוב', 'info');
}

async function showRideDetails(rideId) {
  currentRideId = rideId;
  
  try {
    const response = await fetch(`/api/rides/${rideId}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await response.json();

    if (!data.ok) {
      showToast('שגיאה בטעינת פרטי נסיעה', 'error');
      return;
    }

    const ride = data.ride;
    const content = document.getElementById('rideDetailsContent');
    
    content.innerHTML = `
      <div class="ride-details">
        <div class="detail-section">
          <h3>📋 פרטי נסיעה</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">מספר נסיעה:</span>
              <span class="detail-value">${ride.rideNumber || '#---'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">סטטוס:</span>
              <span class="status-badge status-${ride.status}">${translateStatus(ride.status)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">מחיר:</span>
              <span class="detail-value"><strong>₪${ride.price}</strong></span>
            </div>
            <div class="detail-item">
              <span class="detail-label">תאריך:</span>
              <span class="detail-value">${formatDate(ride.createdAt)}</span>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h3>👤 פרטי לקוח</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">שם:</span>
              <span class="detail-value">${ride.customerName}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">טלפון:</span>
              <span class="detail-value">${ride.customerPhone}</span>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h3>🚗 פרטי נהג</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">שם:</span>
              <span class="detail-value">${ride.driverName || '---'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">טלפון:</span>
              <span class="detail-value">${ride.driverPhone || '---'}</span>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h3>📍 מסלול</h3>
          <div class="route-display">
            <div class="route-point">
              <span class="material-icons">trip_origin</span>
              <div>
                <div class="route-label">נקודת איסוף</div>
                <div class="route-address">${ride.pickup}</div>
              </div>
            </div>
            <div class="route-line"></div>
            <div class="route-point">
              <span class="material-icons">location_on</span>
              <div>
                <div class="route-label">יעד</div>
                <div class="route-address">${ride.destination}</div>
              </div>
            </div>
          </div>
        </div>

        ${ride.notes ? `
          <div class="detail-section">
            <h3>📝 הערות</h3>
            <p>${ride.notes}</p>
          </div>
        ` : ''}
      </div>
    `;

    openModal('rideModal');
  } catch (error) {
    console.error('Error loading ride details:', error);
    showToast('שגיאה בטעינת פרטי נסיעה', 'error');
  }
}

function updateRideStatus(rideId) {
  showToast('פונקציה תתווסף בקרוב', 'info');
}

// ============================================
// 👨‍✈️ DRIVERS MANAGEMENT
// ============================================
async function loadDrivers() {
  const container = document.getElementById('driversListContainer');
  container.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';

  try {
    const search = document.getElementById('driversSearchFilter')?.value || '';
    const city = document.getElementById('driversCityFilter')?.value || '';

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (city) params.append('city', city);
    if (currentFilter !== 'all') params.append('status', currentFilter);

    const response = await fetch(`/api/drivers?${params}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    const data = await response.json();

    if (!data.ok) {
      container.innerHTML = '<div class="empty-state"><span class="material-icons">error</span><p>שגיאה בטעינת נתונים</p></div>';
      return;
    }

    if (data.drivers.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="material-icons">people</span><p>אין נהגים</p></div>';
      return;
    }

    renderDriversGrid(data.drivers, container);
    
    // Update city filter if empty
    if (!city) {
      updateCityFilter(data.drivers);
    }
  } catch (err) {
    console.error('❌ Error loading drivers:', err);
    container.innerHTML = '<div class="empty-state"><span class="material-icons">error</span><p>שגיאה בטעינת נתונים</p></div>';
  }
}

function renderDriversGrid(drivers, container) {
  container.innerHTML = `
    <div class="drivers-grid">
      ${drivers.map(driver => `
        <div class="driver-card">
          <div class="driver-card-header">
            <div class="driver-avatar-wrapper">
              <img src="${driver.documents?.profilePhoto?.url || '/default-avatar.png'}" alt="${driver.name}" class="driver-avatar-large">
              <div class="driver-status-indicator ${driver.isActive ? 'active' : 'inactive'}"></div>
            </div>
            <div class="driver-header-info">
              <h3 class="driver-name">${driver.name}</h3>
              <div class="driver-id-badge">${driver.driverId || '---'}</div>
              ${driver.rating ? `
                <div class="driver-rating">
                  <span class="material-icons">star</span>
                  ${driver.rating.toFixed(1)}
                </div>
              ` : ''}
            </div>
          </div>

          <div class="driver-card-body">
            <div class="driver-info-row">
              <span class="material-icons">phone</span>
              <span>${driver.phone}</span>
            </div>
            <div class="driver-info-row">
              <span class="material-icons">directions_car</span>
              <span>${driver.vehicleType} • ${driver.vehicleNumber || '---'}</span>
            </div>
            <div class="driver-info-row">
              <span class="material-icons">location_city</span>
              <span>${driver.city || 'לא צוין'} • ${driver.workArea || 'לא צוין'}</span>
            </div>
            <div class="driver-info-row">
              <span class="material-icons">local_taxi</span>
              <span>${driver.stats?.totalRides || 0} נסיעות</span>
            </div>
          </div>

          ${driver.documents?.carPhoto?.url ? `
            <div class="driver-car-image">
              <img src="${driver.documents.carPhoto.url}" alt="רכב">
            </div>
          ` : ''}

          <div class="driver-card-actions">
            <button class="btn btn-sm btn-primary" onclick="viewDriverDetails('${driver._id}')">
              <span class="material-icons">visibility</span>
              צפייה
            </button>
            <button class="btn btn-sm btn-success" onclick="editDriver('${driver._id}')">
              <span class="material-icons">edit</span>
              עריכה
            </button>
            ${driver.isActive ? `
              <button class="btn btn-sm btn-warning" onclick="toggleDriverActive('${driver._id}', false)">
                <span class="material-icons">block</span>
                חסימה
              </button>
            ` : `
              <button class="btn btn-sm btn-success" onclick="toggleDriverActive('${driver._id}', true)">
                <span class="material-icons">check_circle</span>
                הפעלה
              </button>
            `}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function updateCityFilter(drivers) {
  const cityFilter = document.getElementById('driversCityFilter');
  if (!cityFilter) return;
  
  const cities = [...new Set(drivers.map(d => d.city).filter(Boolean))];
  const currentValue = cityFilter.value;
  
  cityFilter.innerHTML = '<option value="">כל הערים</option>' +
    cities.map(city => `<option value="${city}">${city}</option>`).join('');
  
  if (currentValue) {
    cityFilter.value = currentValue;
  }
}

function filterDrivers(status, element) {
  currentFilter = status;
  
  document.querySelectorAll('.filters-bar .tab').forEach(tab => {
    tab.classList.remove('active');
  });
  element.classList.add('active');
  
  loadDrivers();
}

function addNewDriver() {
  showToast('פונקציה תתווסף בקרוב', 'info');
}

function viewDriverDetails(driverId) {
  showToast('פונקציה תתווסף בקרוב', 'info');
}

function editDriver(driverId) {
  showToast('פונקציה תתווסף בקרוב', 'info');
}

async function toggleDriverActive(driverId, activate) {
  try {
    const response = await fetch(`/api/drivers/${driverId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ isActive: activate })
    });

    const data = await response.json();

    if (data.ok) {
      showToast(activate ? 'נהג הופעל בהצלחה' : 'נהג נחסם בהצלחה', 'success');
      loadDrivers();
    } else {
      showToast('שגיאה בעדכון סטטוס נהג', 'error');
    }
  } catch (error) {
    console.error('Error toggling driver status:', error);
    showToast('שגיאה בעדכון סטטוס נהג', 'error');
  }
}

// ============================================
// 👥 GROUPS MANAGEMENT
// ============================================
async function loadGroups() {
  const container = document.getElementById('groupsContainer');
  container.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';

  try {
    const response = await fetch('/api/groups', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await response.json();

    if (!data.ok) {
      container.innerHTML = '<div class="empty-state"><span class="material-icons">error</span><p>שגיאה בטעינת נתונים</p></div>';
      return;
    }

    if (data.groups.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="material-icons">groups</span><p>אין קבוצות</p></div>';
      return;
    }

    container.innerHTML = `
      <div class="groups-grid">
        ${data.groups.map(group => `
          <div class="group-card">
            <div class="group-card-header">
              <div class="group-icon">
                <span class="material-icons">groups_2</span>
              </div>
              <div class="group-header-info">
                <h3>${group.name}</h3>
                <div class="group-status ${group.isActive ? 'active' : 'inactive'}">
                  ${group.isActive ? '✅ פעיל' : '❌ לא פעיל'}
                </div>
              </div>
            </div>

            <div class="group-card-body">
              <p class="group-description">${group.description || 'אין תיאור'}</p>
              
              <div class="group-stats">
                <div class="group-stat">
                  <span class="material-icons">people</span>
                  <span>${group.membersCount} חברים</span>
                </div>
                <div class="group-stat">
                  <span class="material-icons">schedule</span>
                  <span>${formatDate(group.createdAt)}</span>
                </div>
              </div>
            </div>

            <div class="group-card-actions">
              <button class="btn btn-sm btn-primary" onclick="editGroup('${group._id}')">
                <span class="material-icons">edit</span>
                עריכה
              </button>
              <button class="btn btn-sm btn-danger" onclick="deleteGroup('${group._id}')">
                <span class="material-icons">delete</span>
                מחיקה
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    console.error('❌ Error loading groups:', err);
    container.innerHTML = '<div class="empty-state"><span class="material-icons">error</span><p>שגיאה בטעינת נתונים</p></div>';
  }
}

function addNewGroup() {
  showToast('פונקציה תתווסף בקרוב', 'info');
}

function editGroup(groupId) {
  showToast('פונקציה תתווסף בקרוב', 'info');
}

async function deleteGroup(groupId) {
  if (!confirm('האם אתה בטוח שברצונך למחוק קבוצה זו?')) return;

  try {
    const response = await fetch(`/api/groups/${groupId}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });

    const data = await response.json();

    if (data.ok) {
      showToast('קבוצה נמחקה בהצלחה', 'success');
      loadGroups();
    } else {
      showToast('שגיאה במחיקת קבוצה', 'error');
    }
  } catch (error) {
    console.error('Error deleting group:', error);
    showToast('שגיאה במחיקת קבוצה', 'error');
  }
}

// ============================================
// ⚙️ ADMIN CONTACT
// ============================================
async function loadAdminContact() {
  try {
    const response = await fetch('/api/admin-contact', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await response.json();

    if (data.ok && data.contact) {
      document.getElementById('adminName').value = data.contact.name || '';
      document.getElementById('adminPhone').value = data.contact.phone || '';
      document.getElementById('adminEmail').value = data.contact.email || '';
      document.getElementById('appealMessage').value = data.contact.appealMessage || '';
    }
  } catch (error) {
    console.error('Error loading admin contact:', error);
  }
}

async function saveAdminContact(event) {
  event.preventDefault();

  const adminData = {
    name: document.getElementById('adminName').value,
    phone: document.getElementById('adminPhone').value,
    email: document.getElementById('adminEmail').value,
    appealMessage: document.getElementById('appealMessage').value
  };

  try {
    const response = await fetch('/api/admin-contact', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(adminData)
    });

    const data = await response.json();

    if (data.ok) {
      showToast('פרטי אדמין נשמרו בהצלחה', 'success');
    } else {
      showToast('שגיאה בשמירת פרטי אדמין', 'error');
    }
  } catch (error) {
    console.error('Error saving admin contact:', error);
    showToast('שגיאה בשמירת פרטי אדמין', 'error');
  }
}

// ============================================
// 🔍 SEARCH
// ============================================
let searchTimeout;

function handleGlobalSearch(event) {
  const query = event.target.value.trim();
  const clearBtn = document.querySelector('.search-clear');
  
  if (query) {
    clearBtn.style.display = 'block';
  } else {
    clearBtn.style.display = 'none';
  }

  if (event.key === 'Enter') {
    performGlobalSearch(query);
  }
}

function clearSearch() {
  const searchInput = document.getElementById('globalSearch');
  searchInput.value = '';
  document.querySelector('.search-clear').style.display = 'none';
  searchInput.focus();
}

function setupGlobalSearch() {
  const searchInput = document.getElementById('globalSearch');
  
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    
    if (query.length >= 3) {
      searchTimeout = setTimeout(() => {
        performGlobalSearch(query);
      }, 500);
    }
  });
}

function performGlobalSearch(query) {
  // Check if query is a ride number
  if (query.startsWith('#') || query.match(/^\d+$/)) {
    showTab('rides');
    document.getElementById('ridesSearchFilter').value = query;
    loadRides();
  }
  // Check if query looks like a phone number
  else if (query.match(/^05\d{8}$/)) {
    // Could be driver or customer - search both
    showTab('rides');
    document.getElementById('ridesSearchFilter').value = query;
    loadRides();
  }
  // Default: search rides
  else {
    showTab('rides');
    document.getElementById('ridesSearchFilter').value = query;
    loadRides();
  }
}

// ============================================
// 🔄 REFRESH
// ============================================
async function refreshAllData() {
  const currentTab = document.querySelector('.tab-content.active').id;
  
  if (currentTab === 'dashboard') await loadDashboard();
  if (currentTab === 'rides') await loadRides();
  if (currentTab === 'drivers') await loadDrivers();
  if (currentTab === 'groups') await loadGroups();
  if (currentTab === 'admin') await loadAdminContact();
  
  showToast('נתונים עודכנו', 'success');
}

// ============================================
// 🎨 MODALS
// ============================================
function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
  document.body.style.overflow = '';
}

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.active').forEach(modal => {
      closeModal(modal.id);
    });
  }
});

// ============================================
// 🍞 TOAST NOTIFICATIONS
// ============================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icons = {
    success: 'check_circle',
    error: 'error',
    warning: 'warning',
    info: 'info'
  };
  
  toast.innerHTML = `
    <span class="material-icons">${icons[type]}</span>
    <span>${message}</span>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 10);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================
// 📅 UTILITIES
// ============================================
function formatDate(dateString) {
  if (!dateString) return '---';
  
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  
  // Less than 24 hours - show relative time
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    
    if (hours === 0) {
      return `לפני ${minutes} דקות`;
    }
    return `לפני ${hours} שעות`;
  }
  
  // Otherwise show date
  return date.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function translateStatus(status) {
  const statusMap = {
    'created': 'נוצרה',
    'distributed': 'חולקה',
    'sent': 'נשלחה',
    'locked': 'נעולה',
    'assigned': 'שוייכה',
    'approved': 'אושרה',
    'enroute': 'בדרך',
    'arrived': 'הגיע',
    'finished': 'הושלמה',
    'commission_paid': 'עמלה שולמה',
    'cancelled': 'בוטלה'
  };
  
  return statusMap[status] || status;
}

function updateLastUpdateTime() {
  const element = document.getElementById('lastUpdate');
  if (element) {
    const now = new Date();
    element.textContent = now.toLocaleTimeString('he-IL', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

function showLoading() {
  document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('active');
}

function updateChartsTheme() {
  // Update chart colors based on theme
  const textColor = isDarkMode ? '#ecf0f1' : '#2c3e50';
  const gridColor = isDarkMode ? '#444' : '#ddd';
  
  Object.values(charts).forEach(chart => {
    if (chart && chart.options) {
      chart.options.scales.x.ticks.color = textColor;
      chart.options.scales.y.ticks.color = textColor;
      chart.options.scales.x.grid.color = gridColor;
      chart.options.scales.y.grid.color = gridColor;
      chart.update();
    }
  });
}

// ============================================
// 🎯 ERROR HANDLING
// ============================================
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

console.log('✅ Taxi Admin System - Integrated V2 Loaded Successfully!');
// ============================================
// 📝 REGISTRATIONS MANAGEMENT
// ============================================

async function loadRegistrations() {
  const tbody = document.getElementById('registrationsTableBody');
  tbody.innerHTML = '<tr><td colspan="7"><div class="loading"><div class="spinner"></div></div></td></tr>';

  try {
    const search = document.getElementById('registrationsSearchFilter')?.value || '';
    const area = document.getElementById('registrationsAreaFilter')?.value || '';

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (area) params.append('area', area);

    const response = await fetch(`/api/registrations?${params}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    const data = await response.json();

    if (!data.ok) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: red;">שגיאה בטעינת נתונים</td></tr>';
      return;
    }

    // Update stats
    updateRegistrationsStats(data);

    if (!data.registrations || data.registrations.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">אין רישומים ממתינים</td></tr>';
      return;
    }

    tbody.innerHTML = data.registrations.map(reg => `
      <tr>
        <td>${reg.name}</td>
        <td>${reg.phone}</td>
        <td>${reg.vehicleType || '---'} ${reg.vehicleNumber || ''}</td>
        <td>${reg.workArea || 'לא צוין'}</td>
        <td>${formatDate(reg.createdAt)}</td>
        <td><span class="status-badge status-${reg.status || 'pending'}">${translateRegistrationStatus(reg.status)}</span></td>
        <td>
          <div class="action-buttons">
            <button class="icon-button" onclick="viewRegistrationDetails('${reg._id}')" title="צפייה">
              <span class="material-icons">visibility</span>
            </button>
            ${reg.status === 'pending' ? `
              <button class="icon-button success" onclick="approveRegistration('${reg._id}')" title="אישור">
                <span class="material-icons">check_circle</span>
              </button>
              <button class="icon-button danger" onclick="rejectRegistration('${reg._id}')" title="דחייה">
                <span class="material-icons">cancel</span>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');

    // Update badge count
    const pendingCount = data.registrations.filter(r => r.status === 'pending').length;
    document.getElementById('pendingRegistrationsCount').textContent = pendingCount;

  } catch (err) {
    console.error('❌ Error loading registrations:', err);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: red;">שגיאה בטעינת נתונים</td></tr>';
  }
}

function updateRegistrationsStats(data) {
  const stats = data.stats || {};
  document.getElementById('statPending').textContent = stats.pending || 0;
  document.getElementById('statApprovedToday').textContent = stats.approvedToday || 0;
  document.getElementById('statRejectedToday').textContent = stats.rejectedToday || 0;
  
  const total = (stats.approvedToday || 0) + (stats.rejectedToday || 0);
  const rate = total > 0 ? Math.round((stats.approvedToday / total) * 100) : 0;
  document.getElementById('statApprovalRate').textContent = rate + '%';
}

function translateRegistrationStatus(status) {
  const map = {
    'pending': 'ממתין',
    'approved': 'אושר',
    'rejected': 'נדחה'
  };
  return map[status] || status;
}

async function viewRegistrationDetails(regId) {
  try {
    const response = await fetch(`/api/registrations/${regId}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await response.json();

    if (!data.ok) {
      showToast('שגיאה בטעינת פרטי רישום', 'error');
      return;
    }

    const reg = data.registration;
    const content = document.getElementById('registrationDetailsContent');
    
    content.innerHTML = `
      <div class="registration-details">
        <div class="detail-section">
          <h3>📋 פרטים אישיים</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">שם מלא:</span>
              <span class="detail-value">${reg.name}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">טלפון:</span>
              <span class="detail-value">${reg.phone}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">ת.ז:</span>
              <span class="detail-value">${reg.idNumber || '---'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">עיר מגורים:</span>
              <span class="detail-value">${reg.city || '---'}</span>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h3>🚗 פרטי רכב</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">סוג רכב:</span>
              <span class="detail-value">${reg.vehicleType || '---'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">מספר רכב:</span>
              <span class="detail-value">${reg.vehicleNumber || '---'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">אזור עבודה:</span>
              <span class="detail-value">${reg.workArea || '---'}</span>
            </div>
          </div>
        </div>

        ${reg.documents && (reg.documents.idDocument || reg.documents.profilePhoto || reg.documents.carPhoto) ? `
          <div class="detail-section">
            <h3>📷 מסמכים ותמונות</h3>
            <div class="documents-grid">
              ${reg.documents.idDocument?.url ? `
                <div class="document-item">
                  <img src="${reg.documents.idDocument.url}" alt="תעודת זהות">
                  <div class="document-label">תעודת זהות</div>
                </div>
              ` : ''}
              ${reg.documents.profilePhoto?.url ? `
                <div class="document-item">
                  <img src="${reg.documents.profilePhoto.url}" alt="תמונת פרופיל">
                  <div class="document-label">תמונת פרופיל</div>
                </div>
              ` : ''}
              ${reg.documents.carPhoto?.url ? `
                <div class="document-item">
                  <img src="${reg.documents.carPhoto.url}" alt="תמונת רכב">
                  <div class="document-label">תמונת רכב</div>
                </div>
              ` : ''}
            </div>
          </div>
        ` : ''}

        <div class="detail-section">
          <h3>📅 מידע נוסף</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">תאריך רישום:</span>
              <span class="detail-value">${formatDate(reg.createdAt)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">סטטוס:</span>
              <span class="status-badge status-${reg.status}">${translateRegistrationStatus(reg.status)}</span>
            </div>
          </div>
        </div>

        ${reg.status === 'pending' ? `
          <div class="modal-actions">
            <button class="btn btn-success" onclick="approveRegistration('${reg._id}')">
              <span class="material-icons">check_circle</span>
              אשר רישום
            </button>
            <button class="btn btn-danger" onclick="rejectRegistration('${reg._id}')">
              <span class="material-icons">cancel</span>
              דחה רישום
            </button>
          </div>
        ` : ''}
      </div>
    `;

    openModal('registrationModal');
  } catch (error) {
    console.error('Error loading registration details:', error);
    showToast('שגיאה בטעינת פרטי רישום', 'error');
  }
}

async function approveRegistration(regId) {
  if (!confirm('האם אתה בטוח שברצונך לאשר רישום זה?')) return;

  try {
    const response = await fetch(`/api/registrations/${regId}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (data.ok) {
      showToast('הרישום אושר בהצלחה!', 'success');
      closeModal('registrationModal');
      loadRegistrations();
    } else {
      showToast(data.message || 'שגיאה באישור רישום', 'error');
    }
  } catch (error) {
    console.error('Error approving registration:', error);
    showToast('שגיאה באישור רישום', 'error');
  }
}

async function rejectRegistration(regId) {
  const reason = prompt('סיבת דחייה (תישלח לנהג):');
  if (!reason) return;

  try {
    const response = await fetch(`/api/registrations/${regId}/reject`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason })
    });

    const data = await response.json();

    if (data.ok) {
      showToast('הרישום נדחה', 'success');
      closeModal('registrationModal');
      loadRegistrations();
    } else {
      showToast(data.message || 'שגיאה בדחיית רישום', 'error');
    }
  } catch (error) {
    console.error('Error rejecting registration:', error);
    showToast('שגיאה בדחיית רישום', 'error');
  }
}

// ============================================
// 👤 ENHANCED DRIVER DETAILS
// ============================================

async function viewDriverDetails(driverId) {
  try {
    const response = await fetch(`/api/drivers/${driverId}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await response.json();

    if (!data.ok) {
      showToast('שגיאה בטעינת פרטי נהג', 'error');
      return;
    }

    const driver = data.driver;
    const content = document.getElementById('driverDetailsContent');
    
    content.innerHTML = `
      <div class="driver-profile">
        <!-- Header with Avatar -->
        <div class="profile-header">
          <div class="profile-avatar-large">
            ${driver.documents?.profilePhoto?.url ? 
              `<img src="${driver.documents.profilePhoto.url}" alt="${driver.name}">` :
              `<div class="avatar-placeholder">${driver.name.charAt(0)}</div>`
            }
          </div>
          <div class="profile-info">
            <h2>${driver.name}</h2>
            <div class="profile-meta">
              <span class="meta-item">
                <span class="material-icons">badge</span>
                ${driver.driverId || '---'}
              </span>
              <span class="meta-item">
                <span class="material-icons">phone</span>
                ${driver.phone}
              </span>
              ${driver.rating ? `
                <span class="meta-item">
                  <span class="material-icons">star</span>
                  ${driver.rating.toFixed(1)}
                </span>
              ` : ''}
            </div>
            <div class="status-badge ${driver.isActive ? 'status-approved' : 'status-cancelled'}">
              ${driver.isActive ? '✅ פעיל' : '❌ חסום'}
            </div>
          </div>
        </div>

        <!-- Details Sections -->
        <div class="profile-sections">
          
          <!-- Personal Info -->
          <div class="profile-section">
            <h3><span class="material-icons">person</span> פרטים אישיים</h3>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">שם מלא:</span>
                <span class="detail-value">${driver.name}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">טלפון:</span>
                <span class="detail-value">${driver.phone}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">ת.ז:</span>
                <span class="detail-value">${driver.idNumber || '---'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">עיר מגורים:</span>
                <span class="detail-value">${driver.city || '---'}</span>
              </div>
            </div>
          </div>

          <!-- Vehicle Info -->
          <div class="profile-section">
            <h3><span class="material-icons">directions_car</span> פרטי רכב</h3>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">סוג רכב:</span>
                <span class="detail-value">${driver.vehicleType || '---'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">מספר רכב:</span>
                <span class="detail-value">${driver.vehicleNumber || '---'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">אזור עבודה:</span>
                <span class="detail-value">${driver.workArea || '---'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">רישיון נהיגה:</span>
                <span class="detail-value">${driver.licenseNumber || '---'}</span>
              </div>
            </div>
            ${driver.documents?.carPhoto?.url ? `
              <div class="car-photo">
                <img src="${driver.documents.carPhoto.url}" alt="תמונת רכב">
              </div>
            ` : ''}
          </div>

          <!-- Statistics -->
          <div class="profile-section">
            <h3><span class="material-icons">analytics</span> סטטיסטיקות</h3>
            <div class="stats-grid-small">
              <div class="stat-item">
                <div class="stat-icon"><span class="material-icons">local_taxi</span></div>
                <div class="stat-number">${driver.stats?.totalRides || 0}</div>
                <div class="stat-label">נסיעות</div>
              </div>
              <div class="stat-item">
                <div class="stat-icon"><span class="material-icons">star</span></div>
                <div class="stat-number">${driver.rating ? driver.rating.toFixed(1) : 'N/A'}</div>
                <div class="stat-label">דירוג</div>
              </div>
              <div class="stat-item">
                <div class="stat-icon"><span class="material-icons">paid</span></div>
                <div class="stat-number">₪${driver.stats?.totalEarnings || 0}</div>
                <div class="stat-label">הכנסות</div>
              </div>
            </div>
          </div>

          <!-- Documents -->
          ${driver.documents ? `
            <div class="profile-section">
              <h3><span class="material-icons">description</span> מסמכים</h3>
              <div class="documents-grid">
                ${driver.documents.idDocument?.url ? `
                  <div class="document-card">
                    <img src="${driver.documents.idDocument.url}" alt="תעודת זהות">
                    <div class="document-label">תעודת זהות</div>
                    <div class="document-status ${driver.documents.idDocument.verified ? 'verified' : 'pending'}">
                      ${driver.documents.idDocument.verified ? '✅ מאומת' : '⏳ ממתין'}
                    </div>
                  </div>
                ` : ''}
                ${driver.documents.profilePhoto?.url ? `
                  <div class="document-card">
                    <img src="${driver.documents.profilePhoto.url}" alt="תמונת פרופיל">
                    <div class="document-label">תמונת פרופיל</div>
                    <div class="document-status ${driver.documents.profilePhoto.verified ? 'verified' : 'pending'}">
                      ${driver.documents.profilePhoto.verified ? '✅ מאומת' : '⏳ ממתין'}
                    </div>
                  </div>
                ` : ''}
                ${driver.documents.carPhoto?.url ? `
                  <div class="document-card">
                    <img src="${driver.documents.carPhoto.url}" alt="תמונת רכב">
                    <div class="document-label">תמונת רכב</div>
                    <div class="document-status ${driver.documents.carPhoto.verified ? 'verified' : 'pending'}">
                      ${driver.documents.carPhoto.verified ? '✅ מאומת' : '⏳ ממתין'}
                    </div>
                  </div>
                ` : ''}
              </div>
            </div>
          ` : ''}

        </div>

        <!-- Actions -->
        <div class="profile-actions">
          <button class="btn btn-primary" onclick="editDriver('${driver._id}')">
            <span class="material-icons">edit</span>
            ערוך פרטים
          </button>
          ${driver.isActive ? `
            <button class="btn btn-warning" onclick="toggleDriverActive('${driver._id}', false); closeModal('driverModal');">
              <span class="material-icons">block</span>
              חסום נהג
            </button>
          ` : `
            <button class="btn btn-success" onclick="toggleDriverActive('${driver._id}', true); closeModal('driverModal');">
              <span class="material-icons">check_circle</span>
              הפעל נהג
            </button>
          `}
        </div>
      </div>
    `;

    openModal('driverModal');
  } catch (error) {
    console.error('Error loading driver details:', error);
    showToast('שגיאה בטעינת פרטי נהג', 'error');
  }
}

// ============================================
// 🎓 HELP SYSTEM
// ============================================

function showHelpSection(sectionId) {
  // Hide all help sections
  document.querySelectorAll('.help-section').forEach(section => {
    section.classList.remove('active');
  });
  
  // Remove active from all tabs
  document.querySelectorAll('.help-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Show selected section
  document.getElementById(`help-${sectionId}`)?.classList.add('active');
  
  // Mark tab as active
  event.target.classList.add('active');
}

function searchHelp() {
  const query = document.getElementById('helpSearch').value.toLowerCase();
  
  if (!query) {
    // Show all sections
    document.querySelectorAll('.help-section').forEach(section => {
      section.style.display = 'block';
    });
    return;
  }
  
  // Search in all sections
  document.querySelectorAll('.help-section').forEach(section => {
    const text = section.textContent.toLowerCase();
    if (text.includes(query)) {
      section.style.display = 'block';
    } else {
      section.style.display = 'none';
    }
  });
}

console.log('✅ Additional integrated features loaded: Registrations, Driver Details, Help System');