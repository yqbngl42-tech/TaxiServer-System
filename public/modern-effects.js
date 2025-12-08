/**
 * 🎨 Modern Effects - אפקטים אינטראקטיביים
 * גרסה 5.6.0
 */

(function() {
  'use strict';

  // ========================================
  // 🎯 Toast Notifications
  // ========================================
  
  window.showToast = function(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast alert-${type}`;
    
    const icon = getIconForType(type);
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-message">${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'toastSlideUp 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  };
  
  function getIconForType(type) {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[type] || icons.info;
  }

  // ========================================
  // 🎬 Scroll Animations
  // ========================================
  
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('slide-up');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);
  
  // Observe all cards
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.card, .card-stats').forEach(el => {
      observer.observe(el);
    });
  });

  // ========================================
  // ✨ Ripple Effect on Buttons
  // ========================================
  
  document.addEventListener('click', function(e) {
    const button = e.target.closest('.btn');
    if (!button) return;
    
    const ripple = document.createElement('span');
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    
    ripple.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      top: ${y}px;
      left: ${x}px;
      background: rgba(255, 255, 255, 0.5);
      border-radius: 50%;
      transform: scale(0);
      animation: ripple 0.6s ease-out;
      pointer-events: none;
    `;
    
    button.style.position = 'relative';
    button.style.overflow = 'hidden';
    button.appendChild(ripple);
    
    setTimeout(() => ripple.remove(), 600);
  });
  
  // Add ripple animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes ripple {
      to {
        transform: scale(4);
        opacity: 0;
      }
    }
    @keyframes toastSlideUp {
      to {
        opacity: 0;
        transform: translate(-50%, -100%);
      }
    }
  `;
  document.head.appendChild(style);

  // ========================================
  // 💫 Smooth Counter Animation
  // ========================================
  
  window.animateCounter = function(element, target, duration = 1000) {
    const start = 0;
    const increment = target / (duration / 16);
    let current = start;
    
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        element.textContent = Math.round(target);
        clearInterval(timer);
      } else {
        element.textContent = Math.round(current);
      }
    }, 16);
  };
  
  // Animate stat numbers on page load
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.card-stat-number').forEach(el => {
      const target = parseInt(el.textContent.replace(/[^0-9]/g, ''));
      if (!isNaN(target)) {
        el.textContent = '0';
        setTimeout(() => animateCounter(el, target, 2000), 300);
      }
    });
  });

  // ========================================
  // 🌈 Theme Switcher (Optional)
  // ========================================
  
  window.toggleTheme = function() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    showToast(
      newTheme === 'dark' ? '🌙 מצב כהה הופעל' : '☀️ מצב בהיר הופעל',
      'info',
      2000
    );
  };
  
  // Load saved theme
  document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  });

  // ========================================
  // 🔍 Search Highlight
  // ========================================
  
  window.highlightSearch = function(searchTerm, container) {
    if (!searchTerm) return;
    
    const elements = container.querySelectorAll('td, .card-title');
    elements.forEach(el => {
      const text = el.textContent;
      const regex = new RegExp(`(${searchTerm})`, 'gi');
      
      if (regex.test(text)) {
        el.innerHTML = text.replace(regex, '<mark>$1</mark>');
        el.closest('tr, .card').classList.add('highlight');
      }
    });
  };
  
  // Add highlight styles
  const highlightStyle = document.createElement('style');
  highlightStyle.textContent = `
    mark {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 0.125rem 0.25rem;
      border-radius: 0.25rem;
    }
    .highlight {
      animation: highlightPulse 0.5s ease-out;
    }
    @keyframes highlightPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.02); }
    }
  `;
  document.head.appendChild(highlightStyle);

  // ========================================
  // 📊 Progress Bar Animation
  // ========================================
  
  window.animateProgress = function(progressBar, targetPercent, duration = 1000) {
    let current = 0;
    const increment = targetPercent / (duration / 16);
    
    const timer = setInterval(() => {
      current += increment;
      if (current >= targetPercent) {
        progressBar.style.width = targetPercent + '%';
        clearInterval(timer);
      } else {
        progressBar.style.width = current + '%';
      }
    }, 16);
  };

  // ========================================
  // 🎨 Dynamic Card Colors
  // ========================================
  
  window.updateCardColor = function(card, status) {
    const colors = {
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
      info: '#3b82f6',
      primary: '#667eea'
    };
    
    const color = colors[status] || colors.primary;
    card.style.borderTop = `4px solid ${color}`;
  };

  // ========================================
  // 💡 Tooltip (Simple Implementation)
  // ========================================
  
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-tooltip]').forEach(el => {
      el.addEventListener('mouseenter', (e) => {
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.textContent = el.getAttribute('data-tooltip');
        tooltip.style.cssText = `
          position: absolute;
          background: rgba(0, 0, 0, 0.9);
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          z-index: 10000;
          pointer-events: none;
          white-space: nowrap;
        `;
        
        document.body.appendChild(tooltip);
        
        const rect = el.getBoundingClientRect();
        tooltip.style.top = (rect.top - tooltip.offsetHeight - 8) + 'px';
        tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
        
        el._tooltip = tooltip;
      });
      
      el.addEventListener('mouseleave', () => {
        if (el._tooltip) {
          el._tooltip.remove();
          el._tooltip = null;
        }
      });
    });
  });

  // ========================================
  // 🎭 Loading Overlay
  // ========================================
  
  window.showLoading = function(message = 'טוען...') {
    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.innerHTML = `
      <div style="text-align: center;">
        <div class="spinner" style="margin: 0 auto 1rem;"></div>
        <div style="color: white; font-weight: 600;">${message}</div>
      </div>
    `;
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      animation: fadeIn 0.3s ease-out;
    `;
    
    document.body.appendChild(overlay);
  };
  
  window.hideLoading = function() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.style.animation = 'fadeOut 0.3s ease-out';
      setTimeout(() => overlay.remove(), 300);
    }
  };
  
  // Add fadeOut animation
  const fadeStyle = document.createElement('style');
  fadeStyle.textContent = `
    @keyframes fadeOut {
      to { opacity: 0; }
    }
  `;
  document.head.appendChild(fadeStyle);

  // ========================================
  // 🎉 Confetti Effect (for success actions)
  // ========================================
  
  window.celebrateSuccess = function() {
    const colors = ['#667eea', '#764ba2', '#10b981', '#f59e0b', '#ef4444'];
    const confettiCount = 50;
    
    for (let i = 0; i < confettiCount; i++) {
      const confetti = document.createElement('div');
      confetti.style.cssText = `
        position: fixed;
        width: 10px;
        height: 10px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        top: -10px;
        left: ${Math.random() * 100}vw;
        opacity: ${Math.random()};
        transform: rotate(${Math.random() * 360}deg);
        animation: confettiFall ${2 + Math.random() * 3}s linear;
        pointer-events: none;
        z-index: 99999;
      `;
      
      document.body.appendChild(confetti);
      
      setTimeout(() => confetti.remove(), 5000);
    }
  };
  
  const confettiStyle = document.createElement('style');
  confettiStyle.textContent = `
    @keyframes confettiFall {
      to {
        transform: translateY(100vh) rotate(720deg);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(confettiStyle);

  // ========================================
  // 📱 Mobile Menu Toggle (if needed)
  // ========================================
  
  window.toggleMobileMenu = function() {
    const menu = document.querySelector('.mobile-menu');
    if (menu) {
      menu.classList.toggle('active');
    }
  };

  // ========================================
  // ✅ Ready!
  // ========================================
  
  console.log('🎨 Modern Effects loaded successfully!');
  
})();
