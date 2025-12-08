// ===============================================
// 🎓 HELP SYSTEM - JAVASCRIPT
// ===============================================

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupSearch();
});

// ===============================================
// TABS
// ===============================================

function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-help');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;
      showTab(tabName);
    });
  });
}

function showTab(tabName) {
  // Update buttons
  document.querySelectorAll('.tab-help').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  
  // Update content
  document.querySelectorAll('.tab-content-help').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`tab-${tabName}`).classList.add('active');
  
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===============================================
// SEARCH
// ===============================================

function setupSearch() {
  const searchInput = document.getElementById('search-help');
  
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    searchContent(query);
  });
}

function searchContent(query) {
  if (!query) {
    // Show all content
    document.querySelectorAll('.tutorial-card, .faq-item, .glossary-item').forEach(item => {
      item.style.display = '';
    });
    return;
  }
  
  // Search in tutorials
  document.querySelectorAll('.tutorial-card').forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(query) ? '' : 'none';
  });
  
  // Search in FAQ
  document.querySelectorAll('.faq-item').forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(query) ? '' : 'none';
  });
  
  // Search in glossary
  document.querySelectorAll('.glossary-item').forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(query) ? '' : 'none';
  });
}

// ===============================================
// TUTORIAL CARDS
// ===============================================

function toggleTutorial(card) {
  card.classList.toggle('expanded');
}

// ===============================================
// FAQ
// ===============================================

function toggleFaq(item) {
  item.classList.toggle('expanded');
}

// ===============================================
// SCROLL TO ELEMENT
// ===============================================

function scrollToElement(elementId) {
  setTimeout(() => {
    const element = document.getElementById(elementId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      element.classList.add('expanded');
    }
  }, 100);
}
