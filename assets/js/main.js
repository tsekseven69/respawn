// --- Theme ---
const THEME_KEY = 'respawn-theme'

function applyTheme(theme) {
  const btn = document.getElementById('theme-btn')
  if (theme === 'light') {
    document.body.classList.add('light')
    if (btn) btn.textContent = '🌙'
  } else {
    document.body.classList.remove('light')
    if (btn) btn.textContent = '☀️'
  }
}

function toggleTheme() {
  const isLight = document.body.classList.contains('light')
  const next = isLight ? 'dark' : 'light'
  localStorage.setItem(THEME_KEY, next)
  applyTheme(next)
}

const saved = localStorage.getItem(THEME_KEY)
if (saved) {
  applyTheme(saved)
} else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
  applyTheme('light')
} else {
  applyTheme('dark')
}

// --- Relative dates ---
function relativeDate(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (hours < 1) return 'Саяхан'
  if (hours < 24) return `${hours} цагийн өмнө`
  if (days === 1) return '1 өдрийн өмнө'
  return `${days} өдрийн өмнө`
}

document.querySelectorAll('[data-date]').forEach(el => {
  el.textContent = relativeDate(el.dataset.date)
})

// --- Nav active ---
function setActive(el) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'))
  el.classList.add('active')
  const label = el.textContent?.trim() ?? ''
  document.querySelectorAll('.bottom-nav-item').forEach(item => {
    item.classList.toggle('active', item.querySelector('.bn-label')?.textContent === label)
  })
  closeMobileMenu()
}

// --- Hamburger ---
let menuOpen = false

function toggleMobileMenu() {
  menuOpen = !menuOpen
  document.getElementById('mobile-menu')?.classList.toggle('open', menuOpen)
}

function closeMobileMenu() {
  menuOpen = false
  document.getElementById('mobile-menu')?.classList.remove('open')
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#hamburger') && !e.target.closest('#mobile-menu')) {
    closeMobileMenu()
  }
})

// --- Like ---
function like(el) {
  el.style.color = '#e05a5a'
}

// --- Bottom nav ---
function bottomNavClick(el) {
  document.querySelectorAll('.bottom-nav-item').forEach(i => i.classList.remove('active'))
  el.classList.add('active')
  const label = el.querySelector('.bn-label')?.textContent ?? ''
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.textContent?.trim() === label)
  })
}

window.toggleTheme = toggleTheme
window.setActive = setActive
window.toggleMobileMenu = toggleMobileMenu
window.like = like
window.bottomNavClick = bottomNavClick
