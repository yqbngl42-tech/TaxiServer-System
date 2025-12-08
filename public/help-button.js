// ===============================================
// 🆘 FLOATING HELP BUTTON - AUTO INJECT
// ===============================================

(function() {
  'use strict';
  
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  function init() {
    injectHelpButton();
    setupHelpButton();
  }
  
  // ===============================================
  // INJECT BUTTON HTML
  // ===============================================
  
  function injectHelpButton() {
    const helpHTML = `
      <!-- Help Button -->
      <button class="help-button-float" id="help-button" aria-label="עזרה">
        ❓
      </button>
      
      <!-- Help Menu -->
      <div class="help-menu" id="help-menu">
        <div class="help-menu-header">
          <h3>🎓 איך נוכל לעזור?</h3>
          <p>בחר באחת האפשרויות:</p>
        </div>
        
        <div class="help-menu-content">
          
          <a href="help.html" class="help-menu-item">
            <div class="help-menu-item-icon">📚</div>
            <div class="help-menu-item-content">
              <div class="help-menu-item-title">מדריך מלא</div>
              <div class="help-menu-item-desc">כל ההסברים המפורטים</div>
            </div>
          </a>
          
          <div class="help-menu-item" onclick="showQuickGuide()">
            <div class="help-menu-item-icon">⚡</div>
            <div class="help-menu-item-content">
              <div class="help-menu-item-title">מדריך מהיר</div>
              <div class="help-menu-item-desc">עזרה לדף הנוכחי</div>
            </div>
          </div>
          
          <a href="help.html#tab-faq" class="help-menu-item">
            <div class="help-menu-item-icon">❓</div>
            <div class="help-menu-item-content">
              <div class="help-menu-item-title">שאלות נפוצות</div>
              <div class="help-menu-item-desc">תשובות לשאלות שכיחות</div>
            </div>
          </a>
          
          <div class="help-menu-item" onclick="startTutorial()">
            <div class="help-menu-item-icon">🎯</div>
            <div class="help-menu-item-content">
              <div class="help-menu-item-title">Tutorial אינטראקטיבי</div>
              <div class="help-menu-item-desc">למד צעד אחר צעד</div>
            </div>
          </div>
          
          <div class="help-menu-item" onclick="contactSupport()">
            <div class="help-menu-item-icon">💬</div>
            <div class="help-menu-item-content">
              <div class="help-menu-item-title">דבר איתנו</div>
              <div class="help-menu-item-desc">תמיכה אישית</div>
            </div>
          </div>
          
        </div>
        
        <div class="help-menu-footer">
          <button class="btn btn-primary" onclick="window.location.href='help.html'">
            פתח מרכז העזרה
          </button>
        </div>
      </div>
    `;
    
    // Inject at end of body
    document.body.insertAdjacentHTML('beforeend', helpHTML);
  }
  
  // ===============================================
  // SETUP BUTTON FUNCTIONALITY
  // ===============================================
  
  function setupHelpButton() {
    const button = document.getElementById('help-button');
    const menu = document.getElementById('help-menu');
    
    if (!button || !menu) return;
    
    // Toggle menu
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('active');
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && e.target !== button) {
        menu.classList.remove('active');
      }
    });
    
    // Close menu on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('active')) {
        menu.classList.remove('active');
      }
    });
    
    // Prevent menu clicks from closing it
    menu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
  
  // ===============================================
  // QUICK GUIDE - CONTEXT SENSITIVE
  // ===============================================
  
  window.showQuickGuide = function() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    
    const guides = {
      'index.html': {
        title: 'Dashboard',
        tips: [
          '📊 הדאשבורד מתעדכן בזמן אמת',
          '🚖 תראה כאן את הנסיעות הפעילות',
          '💰 סטטיסטיקות הרווחים מעודכנות כל הזמן',
          '👥 מונה נהגים פעילים מעודכן'
        ]
      },
      'registrations.html': {
        title: 'רישומים ממתינים',
        tips: [
          '👤 לחץ "צפה" לפרטים מלאים על הנהג',
          '✓ לחץ "אשר" רק אחרי בדיקת מסמכים',
          '✗ אם דוחה - כתוב סיבה ברורה',
          '🔍 השתמש בחיפוש למציאת נהג מסוים'
        ]
      },
      'driver-profile.html': {
        title: 'פרופיל נהג',
        tips: [
          '📷 לחץ על מסמך לצפייה מלאה',
          '☑ סמן מסמך כמאומת אחרי בדיקה',
          '💬 כפתור "שלח הודעה" בראש העמוד',
          '📝 השתמש ב"הערות מנהל" לרישומים'
        ]
      },
      'drivers.html': {
        title: 'ניהול נהגים',
        tips: [
          '👥 כאן תראה את כל הנהגים',
          '🔍 השתמש בחיפוש לסינון',
          '🚫 אפשר לחסום/להסיר חסימה',
          '📊 לחץ על נהג לפרטים מלאים'
        ]
      },
      'rides.html': {
        title: 'ניהול נסיעות',
        tips: [
          '🚖 לחץ "נסיעה חדשה" ליצירה',
          '🔍 חפש לפי לקוח או נהג',
          '📊 תראה את כל הסטטוסים',
          '✏️ אפשר לערוך נסיעה קיימת'
        ]
      },
      'analytics.html': {
        title: 'אנליטיקות',
        tips: [
          '📊 בחר תקופה לצפייה',
          '📈 גרפים אינטראקטיביים',
          '⬇️ ייצוא נתונים ל-Excel',
          '💰 מעקב רווחים מפורט'
        ]
      }
    };
    
    const guide = guides[currentPage] || guides['index.html'];
    
    let html = `
      <div class="quick-tip">
        <div class="quick-tip-icon">💡</div>
        <div class="quick-tip-content">
          <h4>${guide.title}</h4>
    `;
    
    guide.tips.forEach(tip => {
      html += `<p>• ${tip}</p>`;
    });
    
    html += `
        </div>
      </div>
    `;
    
    // Show modal with guide
    showModal('מדריך מהיר', html);
    
    // Close help menu
    document.getElementById('help-menu').classList.remove('active');
  };
  
  // ===============================================
  // TUTORIAL - INTERACTIVE WALKTHROUGH
  // ===============================================
  
  window.startTutorial = function() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    
    // Close help menu
    document.getElementById('help-menu').classList.remove('active');
    
    // Check if there's a tutorial for this page
    if (typeof window.pageTutorial !== 'undefined') {
      window.pageTutorial.start();
    } else {
      showModal(
        'Tutorial',
        '<p>Tutorial אינטראקטיבי יתווסף בקרוב לדף זה! 🎓</p><p>בינתיים, בקר ב<a href="help.html">מרכז העזרה</a> למדריכים מפורטים.</p>'
      );
    }
  };
  
  // ===============================================
  // CONTACT SUPPORT
  // ===============================================
  
  window.contactSupport = function() {
    showModal(
      '💬 צור קשר עם התמיכה',
      `
        <p>צוות התמיכה שלנו כאן בשבילך!</p>
        <div style="margin-top: 1.5rem;">
          <p><strong>📞 טלפון:</strong> 050-1234567</p>
          <p><strong>📧 אימייל:</strong> support@taxi-system.com</p>
          <p><strong>💬 WhatsApp:</strong> 050-1234567</p>
        </div>
        <div style="margin-top: 1.5rem; padding: 1rem; background: #f9fafb; border-radius: 0.5rem;">
          <p><strong>שעות פעילות:</strong></p>
          <p>א'-ה': 08:00 - 20:00</p>
          <p>ו'-ש': 08:00 - 14:00</p>
        </div>
      `
    );
    
    // Close help menu
    document.getElementById('help-menu').classList.remove('active');
  };
  
  // ===============================================
  // MODAL HELPER
  // ===============================================
  
  function showModal(title, content) {
    // Check if modal exists
    let modal = document.getElementById('help-system-modal');
    
    if (!modal) {
      const modalHTML = `
        <div class="modal" id="help-system-modal">
          <div class="modal-content">
            <div class="modal-header">
              <h2 id="help-modal-title"></h2>
              <button class="close-btn" onclick="closeHelpModal()">&times;</button>
            </div>
            <div id="help-modal-body"></div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHTML);
      modal = document.getElementById('help-system-modal');
      
      // Close on background click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeHelpModal();
        }
      });
    }
    
    // Set content
    document.getElementById('help-modal-title').textContent = title;
    document.getElementById('help-modal-body').innerHTML = content;
    
    // Show modal
    modal.classList.add('active');
  }
  
  window.closeHelpModal = function() {
    const modal = document.getElementById('help-system-modal');
    if (modal) {
      modal.classList.remove('active');
    }
  };
  
  // ===============================================
  // KEYBOARD SHORTCUTS
  // ===============================================
  
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + ? = Open help
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      const menu = document.getElementById('help-menu');
      if (menu) {
        menu.classList.toggle('active');
      }
    }
  });
  
  // ===============================================
  // FIRST TIME USER DETECTION
  // ===============================================
  
  function checkFirstTimeUser() {
    const hasVisited = localStorage.getItem('hasVisitedBefore');
    
    if (!hasVisited) {
      // Show welcome message
      setTimeout(() => {
        showModal(
          '👋 ברוכים הבאים!',
          `
            <p style="font-size: 1.1rem; margin-bottom: 1rem;">זו הפעם הראשונה שלך במערכת?</p>
            <p>אנחנו כאן לעזור! לחץ על כפתור ה-❓ בפינה השמאלית תחתונה בכל עת לקבלת עזרה.</p>
            <div style="margin-top: 1.5rem;">
              <button class="btn btn-primary btn-mobile-full" onclick="window.location.href='help.html'; closeHelpModal();">
                🎓 התחל עם המדריך
              </button>
              <button class="btn btn-secondary btn-mobile-full" onclick="closeHelpModal(); localStorage.setItem('hasVisitedBefore', 'true');" style="margin-top: 0.5rem;">
                אני מכיר את המערכת
              </button>
            </div>
          `
        );
      }, 1000);
    }
  }
  
  // Run first time check
  checkFirstTimeUser();
  
})();
