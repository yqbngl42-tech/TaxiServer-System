// ===============================================
// 👤 DRIVER PROFILE - JAVASCRIPT
// ===============================================

const API_URL = 'http://localhost:3000';
const TOKEN = localStorage.getItem('token');

let currentDriver = null;
let currentDocumentUrl = null;
let currentDocumentType = null;
let imageRotation = 0;
let imageScale = 1;

// ===============================================
// INITIALIZATION
// ===============================================

document.addEventListener('DOMContentLoaded', () => {
  // Get driver ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const driverId = urlParams.get('id');
  
  if (!driverId) {
    alert('שגיאה: לא נמצא מזהה נהג');
    window.location.href = 'drivers.html';
    return;
  }
  
  // Load driver data
  loadDriver(driverId);
  
  // Setup tabs
  setupTabs();
});

// ===============================================
// TABS
// ===============================================

function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;
      switchTab(tabName);
    });
  });
}

function switchTab(tabName) {
  // Update buttons
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  
  // Update content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`tab-${tabName}`).classList.add('active');
  
  // Load tab-specific data
  loadTabData(tabName);
}

// ===============================================
// LOAD DRIVER
// ===============================================

async function loadDriver(driverId) {
  try {
    const response = await fetch(`${API_URL}/api/drivers/${driverId}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    const data = await response.json();
    
    if (data.ok) {
      currentDriver = data.driver;
      renderDriverProfile(currentDriver);
    } else {
      alert('שגיאה בטעינת פרטי הנהג');
    }
  } catch (err) {
    console.error('Error loading driver:', err);
    alert('שגיאת תקשורת עם השרת');
  }
}

// ===============================================
// RENDER DRIVER PROFILE
// ===============================================

function renderDriverProfile(driver) {
  // Header
  const initials = driver.name.split(' ').map(n => n[0]).join('');
  document.getElementById('driver-avatar').textContent = initials;
  document.getElementById('driver-name').textContent = driver.name;
  document.getElementById('driver-id').textContent = driver.driverId || 'ממתין למזהה';
  document.getElementById('driver-phone').textContent = driver.phone;
  
  // Status badge
  const statusBadge = document.getElementById('driver-status-badge');
  let statusText = '';
  let statusClass = '';
  
  if (driver.isBlocked) {
    statusText = '🚫 חסום';
    statusClass = 'status-blocked';
  } else if (driver.registrationStatus === 'pending') {
    statusText = '⏳ ממתין לאישור';
    statusClass = 'status-pending';
  } else if (driver.registrationStatus === 'approved') {
    statusText = '✅ מאושר';
    statusClass = 'status-approved';
  } else if (driver.registrationStatus === 'rejected') {
    statusText = '❌ נדחה';
    statusClass = 'status-rejected';
  }
  
  statusBadge.textContent = statusText;
  statusBadge.className = `status-badge ${statusClass}`;
  
  // Header actions
  renderHeaderActions(driver);
  
  // Stats
  document.getElementById('stat-rides').textContent = driver.stats?.totalRides || 0;
  document.getElementById('stat-completed').textContent = driver.stats?.completedRides || 0;
  document.getElementById('stat-rating').textContent = driver.rating?.average?.toFixed(1) || '5.0';
  document.getElementById('stat-earnings').textContent = `₪${driver.earnings?.total || 0}`;
  
  // Personal info
  renderPersonalInfo(driver);
  
  // Vehicle info
  renderVehicleInfo(driver);
  
  // Admin notes
  document.getElementById('admin-notes').value = driver.notes || '';
  
  // Documents
  renderDocuments(driver);
}

// ===============================================
// RENDER HEADER ACTIONS
// ===============================================

function renderHeaderActions(driver) {
  const container = document.getElementById('header-actions');
  container.innerHTML = '';
  
  // Send message button (always visible)
  const messageBtn = document.createElement('button');
  messageBtn.className = 'btn btn-info';
  messageBtn.innerHTML = '💬 שלח הודעה';
  messageBtn.onclick = () => openMessageModal();
  container.appendChild(messageBtn);
  
  // Back button
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-secondary';
  backBtn.innerHTML = '← חזור';
  backBtn.onclick = () => window.history.back();
  container.appendChild(backBtn);
  
  // Status-specific buttons
  if (driver.registrationStatus === 'pending') {
    const approveBtn = document.createElement('button');
    approveBtn.className = 'btn btn-success';
    approveBtn.innerHTML = '✓ אשר';
    approveBtn.onclick = () => openApproveModal();
    container.insertBefore(approveBtn, container.firstChild);
    
    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'btn btn-danger';
    rejectBtn.innerHTML = '✗ דחה';
    rejectBtn.onclick = () => openRejectModal();
    container.insertBefore(rejectBtn, container.firstChild);
  }
  
  if (driver.registrationStatus === 'approved' && !driver.isBlocked) {
    const blockBtn = document.createElement('button');
    blockBtn.className = 'btn btn-warning';
    blockBtn.innerHTML = '🚫 חסום';
    blockBtn.onclick = () => openBlockModal();
    container.insertBefore(blockBtn, container.firstChild);
  }
  
  if (driver.isBlocked) {
    const unblockBtn = document.createElement('button');
    unblockBtn.className = 'btn btn-success';
    unblockBtn.innerHTML = '✓ הסר חסימה';
    unblockBtn.onclick = () => unblockDriver();
    container.insertBefore(unblockBtn, container.firstChild);
  }
}

// ===============================================
// RENDER PERSONAL INFO
// ===============================================

function renderPersonalInfo(driver) {
  const container = document.getElementById('personal-info');
  container.innerHTML = `
    <div class="info-item">
      <div class="info-label">שם מלא</div>
      <div class="info-value">${driver.name}</div>
    </div>
    <div class="info-item">
      <div class="info-label">מספר טלפון</div>
      <div class="info-value">${driver.phone}</div>
    </div>
    <div class="info-item">
      <div class="info-label">תעודת זהות</div>
      <div class="info-value">${driver.idNumber || '-'}</div>
    </div>
    <div class="info-item">
      <div class="info-label">מזהה נהג</div>
      <div class="info-value">${driver.driverId || 'ממתין'}</div>
    </div>
    <div class="info-item">
      <div class="info-label">תאריך הצטרפות</div>
      <div class="info-value">${formatDate(driver.createdAt)}</div>
    </div>
    <div class="info-item">
      <div class="info-label">פעילות אחרונה</div>
      <div class="info-value">${formatDate(driver.lastActive)}</div>
    </div>
  `;
}

// ===============================================
// RENDER VEHICLE INFO
// ===============================================

function renderVehicleInfo(driver) {
  const container = document.getElementById('vehicle-info');
  container.innerHTML = `
    <div class="info-item">
      <div class="info-label">סוג רכב</div>
      <div class="info-value">${driver.vehicleType || '-'}</div>
    </div>
    <div class="info-item">
      <div class="info-label">מספר רכב</div>
      <div class="info-value">${driver.vehicleNumber || '-'}</div>
    </div>
    <div class="info-item">
      <div class="info-label">אזור עבודה</div>
      <div class="info-value">${driver.workArea || '-'}</div>
    </div>
    <div class="info-item">
      <div class="info-label">רישיון נהיגה</div>
      <div class="info-value">${driver.licenseNumber || '-'}</div>
    </div>
  `;
}

// ===============================================
// RENDER DOCUMENTS
// ===============================================

function renderDocuments(driver) {
  const container = document.getElementById('documents-grid');
  
  const documents = [
    {
      type: 'license',
      title: 'רישיון נהיגה',
      icon: '📄',
      data: driver.documents?.license
    },
    {
      type: 'carLicense',
      title: 'רישיון רכב',
      icon: '📄',
      data: driver.documents?.carLicense
    },
    {
      type: 'insurance',
      title: 'ביטוח רכב',
      icon: '📄',
      data: driver.documents?.insurance
    }
  ];
  
  container.innerHTML = documents.map(doc => `
    <div class="document-card">
      <div class="document-icon">${doc.icon}</div>
      <div class="document-title">${doc.title}</div>
      <div class="document-status">
        ${doc.data?.url 
          ? `<span style="color: #10b981;">✓ הועלה</span><br>
             ${doc.data.verified ? '<span style="color: #667eea;">✓ מאומת</span>' : '<span style="color: #f59e0b;">⚠️ לא מאומת</span>'}`
          : '<span style="color: #ef4444;">✗ חסר</span>'}
      </div>
      ${doc.data?.url ? `
        <div class="document-actions">
          <button class="btn btn-info btn-sm" onclick="viewDocument('${doc.type}', '${doc.title}', '${doc.data.url}', ${doc.data.verified || false})">
            👁️ צפה
          </button>
        </div>
      ` : ''}
    </div>
  `).join('');
}

// ===============================================
// LOAD TAB DATA
// ===============================================

async function loadTabData(tabName) {
  if (!currentDriver) return;
  
  switch(tabName) {
    case 'rides':
      await loadRidesHistory();
      break;
    case 'earnings':
      renderEarnings();
      break;
    case 'ratings':
      renderRatings();
      break;
    case 'activity':
      await loadActivityLog();
      break;
  }
}

// ===============================================
// RIDES HISTORY
// ===============================================

async function loadRidesHistory() {
  try {
    const response = await fetch(`${API_URL}/api/rides?driverId=${currentDriver._id}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    const data = await response.json();
    
    if (data.ok) {
      renderRidesHistory(data.rides);
    }
  } catch (err) {
    console.error('Error loading rides:', err);
  }
}

function renderRidesHistory(rides) {
  const container = document.getElementById('rides-container');
  
  if (rides.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🚖</div>
        <div>אין נסיעות עדיין</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>מספר נסיעה</th>
          <th>לקוח</th>
          <th>איסוף</th>
          <th>יעד</th>
          <th>מחיר</th>
          <th>סטטוס</th>
          <th>תאריך</th>
        </tr>
      </thead>
      <tbody>
        ${rides.map(ride => `
          <tr>
            <td><strong>${ride.rideNumber}</strong></td>
            <td>${ride.customerName}</td>
            <td>${ride.pickup}</td>
            <td>${ride.destination}</td>
            <td>₪${ride.price}</td>
            <td>${getStatusBadge(ride.status)}</td>
            <td>${formatDate(ride.createdAt)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ===============================================
// EARNINGS
// ===============================================

function renderEarnings() {
  const container = document.getElementById('earnings-info');
  const earnings = currentDriver.earnings || {};
  
  container.innerHTML = `
    <div class="info-item">
      <div class="info-label">סה"כ רווחים</div>
      <div class="info-value">₪${earnings.total || 0}</div>
    </div>
    <div class="info-item">
      <div class="info-label">החודש</div>
      <div class="info-value">₪${earnings.thisMonth || 0}</div>
    </div>
    <div class="info-item">
      <div class="info-label">חודש שעבר</div>
      <div class="info-value">₪${earnings.lastMonth || 0}</div>
    </div>
    <div class="info-item">
      <div class="info-label">ממתין לתשלום</div>
      <div class="info-value">₪${earnings.unpaid || 0}</div>
    </div>
  `;
}

// ===============================================
// RATINGS
// ===============================================

function renderRatings() {
  const container = document.getElementById('ratings-container');
  const reviews = currentDriver.reviews || [];
  
  if (reviews.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⭐</div>
        <div>אין דירוגים עדיין</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <div style="margin-bottom: 30px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div class="rating" style="justify-content: center; font-size: 3em;">
          ${renderStars(currentDriver.rating.average)}
        </div>
        <div style="font-size: 2em; font-weight: bold; margin-top: 10px;">
          ${currentDriver.rating.average.toFixed(1)}
        </div>
        <div style="color: #6b7280; margin-top: 5px;">
          מתוך ${currentDriver.rating.count} דירוגים
        </div>
      </div>
    </div>
    
    <div>
      ${reviews.map(review => `
        <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin-bottom: 15px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
            <div>
              <strong>${review.customerName || 'לקוח'}</strong>
              <div class="rating" style="margin-top: 5px;">
                ${renderStars(review.rating)}
              </div>
            </div>
            <div style="color: #6b7280; font-size: 0.9em;">
              ${formatDate(review.timestamp)}
            </div>
          </div>
          ${review.comment ? `<div style="color: #374151; margin-top: 10px;">${review.comment}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function renderStars(rating) {
  const fullStars = Math.floor(rating);
  const emptyStars = 5 - fullStars;
  
  return '⭐'.repeat(fullStars) + '<span class="star empty">☆</span>'.repeat(emptyStars);
}

// ===============================================
// ACTIVITY LOG
// ===============================================

async function loadActivityLog() {
  try {
    const response = await fetch(`${API_URL}/api/activities?userId=${currentDriver.phone}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    const data = await response.json();
    
    if (data.ok) {
      renderActivityLog(data.activities);
    }
  } catch (err) {
    console.error('Error loading activity:', err);
  }
}

function renderActivityLog(activities) {
  const container = document.getElementById('activity-timeline');
  
  if (activities.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <div>אין פעילות עדיין</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = activities.map(activity => `
    <div class="timeline-item">
      <div class="timeline-content">
        <div class="timeline-date">${formatDate(activity.timestamp)}</div>
        <div class="timeline-text"><strong>${getActivityIcon(activity.type)}</strong> ${activity.description}</div>
      </div>
    </div>
  `).join('');
}

function getActivityIcon(type) {
  const icons = {
    'ride_assigned': '🚖',
    'ride_completed': '✅',
    'ride_cancelled': '❌',
    'driver_approved': '✓',
    'driver_rejected': '✗',
    'driver_blocked': '🚫',
    'driver_unblocked': '✅'
  };
  return icons[type] || '📝';
}

// ===============================================
// DOCUMENT VIEWER
// ===============================================

function viewDocument(type, title, url, verified) {
  currentDocumentType = type;
  currentDocumentUrl = url;
  
  document.getElementById('document-title').textContent = title;
  document.getElementById('document-image').src = url;
  document.getElementById('document-verified').checked = verified;
  
  imageRotation = 0;
  imageScale = 1;
  updateImageTransform();
  
  openModal('document-modal');
}

function zoomIn() {
  imageScale += 0.2;
  updateImageTransform();
}

function zoomOut() {
  if (imageScale > 0.4) {
    imageScale -= 0.2;
    updateImageTransform();
  }
}

function rotateImage() {
  imageRotation += 90;
  if (imageRotation >= 360) imageRotation = 0;
  updateImageTransform();
}

function updateImageTransform() {
  const img = document.getElementById('document-image');
  img.style.transform = `rotate(${imageRotation}deg) scale(${imageScale})`;
}

function downloadDocument() {
  window.open(currentDocumentUrl, '_blank');
}

async function markDocumentVerified() {
  const verified = document.getElementById('document-verified').checked;
  
  try {
    const response = await fetch(`${API_URL}/api/drivers/${currentDriver._id}/verify-document`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        documentType: currentDocumentType,
        verified
      })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      // Update local data
      currentDriver.documents[currentDocumentType].verified = verified;
      renderDocuments(currentDriver);
    }
  } catch (err) {
    console.error('Error marking document:', err);
  }
}

function closeDocumentModal() {
  closeModal('document-modal');
}

// ===============================================
// ACTIONS
// ===============================================

// Save admin notes
async function saveAdminNotes() {
  const notes = document.getElementById('admin-notes').value;
  
  try {
    const response = await fetch(`${API_URL}/api/drivers/${currentDriver._id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ notes })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      alert('✅ ההערות נשמרו');
    }
  } catch (err) {
    console.error('Error saving notes:', err);
    alert('שגיאה בשמירת ההערות');
  }
}

// Send message
function openMessageModal() {
  document.getElementById('message-text').value = '';
  openModal('message-modal');
}

async function sendMessage() {
  const message = document.getElementById('message-text').value.trim();
  
  if (!message) {
    alert('אנא כתוב הודעה');
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/api/bot/send-message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone: currentDriver.phone,
        message
      })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      closeModal('message-modal');
      alert('✅ ההודעה נשלחה');
    } else {
      alert('שגיאה בשליחת ההודעה');
    }
  } catch (err) {
    console.error('Error sending message:', err);
    alert('שגיאת תקשורת עם השרת');
  }
}

// Approve driver
function openApproveModal() {
  document.getElementById('approve-driver-name').textContent = currentDriver.name;
  openModal('approve-modal');
}

async function confirmApprove() {
  try {
    const response = await fetch(`${API_URL}/api/registrations/${currentDriver._id}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      }
    });
    
    const data = await response.json();
    
    if (data.ok) {
      closeModal('approve-modal');
      alert('✅ הנהג אושר בהצלחה!');
      location.reload();
    }
  } catch (err) {
    console.error('Error approving driver:', err);
    alert('שגיאה באישור הנהג');
  }
}

// Reject driver
function openRejectModal() {
  document.getElementById('reject-driver-name').textContent = currentDriver.name;
  document.getElementById('reject-reason').value = '';
  openModal('reject-modal');
}

async function confirmReject() {
  const reason = document.getElementById('reject-reason').value.trim();
  
  if (!reason) {
    alert('אנא הזן סיבת דחייה');
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/api/registrations/${currentDriver._id}/reject`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      closeModal('reject-modal');
      alert('❌ הנהג נדחה');
      location.reload();
    }
  } catch (err) {
    console.error('Error rejecting driver:', err);
    alert('שגיאה בדחיית הנהג');
  }
}

// Block driver
function openBlockModal() {
  document.getElementById('block-driver-name').textContent = currentDriver.name;
  document.getElementById('block-reason').value = '';
  openModal('block-modal');
}

async function confirmBlock() {
  const reason = document.getElementById('block-reason').value.trim();
  
  if (!reason) {
    alert('אנא הזן סיבת חסימה');
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/api/drivers/${currentDriver._id}/block`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      closeModal('block-modal');
      alert('🚫 הנהג נחסם');
      location.reload();
    }
  } catch (err) {
    console.error('Error blocking driver:', err);
    alert('שגיאה בחסימת הנהג');
  }
}

// Unblock driver
async function unblockDriver() {
  if (!confirm('האם אתה בטוח שברצונך להסיר את החסימה?')) {
    return;
  }
  
  try {
    const response = await fetch(`${API_URL}/api/drivers/${currentDriver._id}/unblock`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      }
    });
    
    const data = await response.json();
    
    if (data.ok) {
      alert('✅ החסימה הוסרה');
      location.reload();
    }
  } catch (err) {
    console.error('Error unblocking driver:', err);
    alert('שגיאה בהסרת החסימה');
  }
}

// ===============================================
// MODAL HELPERS
// ===============================================

function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// Close modal on background click
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(modal.id);
    }
  });
});

// ===============================================
// UTILITY FUNCTIONS
// ===============================================

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('he-IL');
}

function getStatusBadge(status) {
  const badges = {
    'created': '<span style="background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 12px;">נוצר</span>',
    'distributed': '<span style="background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 12px;">הופץ</span>',
    'assigned': '<span style="background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 12px;">שויך</span>',
    'enroute': '<span style="background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 12px;">בדרך</span>',
    'arrived': '<span style="background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 12px;">הגיע</span>',
    'finished': '<span style="background: #d1fae5; color: #065f46; padding: 4px 12px; border-radius: 12px;">הסתיים</span>',
    'cancelled': '<span style="background: #fee2e2; color: #991b1b; padding: 4px 12px; border-radius: 12px;">בוטל</span>'
  };
  return badges[status] || status;
}
