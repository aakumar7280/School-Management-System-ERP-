const menuToggle = document.getElementById('menuToggle');
const topNav = document.getElementById('topNav');
const yearEl = document.getElementById('year');

if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

if (menuToggle && topNav) {
  menuToggle.addEventListener('click', () => {
    topNav.classList.toggle('open');
  });

  topNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => topNav.classList.remove('open'));
  });
}

// Optional: set ERP URL from query parameter for quick testing.
// Example: index.html?erp=http://localhost:5173/login
const params = new URLSearchParams(window.location.search);
const erp = params.get('erp');
if (erp) {
  const erpLoginBtn = document.getElementById('erpLoginBtn');
  const erpFooterLink = document.getElementById('erpFooterLink');
  if (erpLoginBtn) erpLoginBtn.href = erp;
  if (erpFooterLink) erpFooterLink.href = erp;
}

const erpLoginBtn = document.getElementById('erpLoginBtn');
const erpFooterLink = document.getElementById('erpFooterLink');

const websiteBaseUrl = new URL('./index.html', window.location.href).toString();

function withWebsiteParam(url) {
  if (!url) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}website=${encodeURIComponent(websiteBaseUrl)}`;
}

if (erpLoginBtn) {
  erpLoginBtn.href = withWebsiteParam(erpLoginBtn.href);
}

if (erpFooterLink) {
  erpFooterLink.href = withWebsiteParam(erpFooterLink.href);
}
