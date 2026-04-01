import './styles/main.css'

// --- Theme ---
const THEME_KEY = 'respawn-theme'

function applyTheme(theme: 'dark' | 'light'): void {
  const btn = document.getElementById('theme-btn')
  if (theme === 'light') {
    document.body.classList.add('light')
    if (btn) btn.textContent = '🌙'
  } else {
    document.body.classList.remove('light')
    if (btn) btn.textContent = '☀️'
  }
}

function toggleTheme(): void {
  const isLight = document.body.classList.contains('light')
  const next: 'dark' | 'light' = isLight ? 'dark' : 'light'
  localStorage.setItem(THEME_KEY, next)
  applyTheme(next)
}

// Init theme from localStorage or system preference
const saved = localStorage.getItem(THEME_KEY) as 'dark' | 'light' | null
if (saved) {
  applyTheme(saved)
} else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
  applyTheme('light')
} else {
  applyTheme('dark')
}

// --- Nav active ---
function setActive(el: HTMLButtonElement): void {
  document.querySelectorAll<HTMLButtonElement>('.nav-link').forEach(l => l.classList.remove('active'))
  el.classList.add('active')
  // Sync bottom nav
  const label = el.textContent?.trim() ?? ''
  document.querySelectorAll<HTMLButtonElement>('.bottom-nav-item').forEach(item => {
    item.classList.toggle('active', item.querySelector('.bn-label')?.textContent === label)
  })
  // Close mobile menu
  closeMobileMenu()
}

// --- Hamburger / mobile menu ---
let menuOpen = false

function toggleMobileMenu(): void {
  menuOpen = !menuOpen
  const menu = document.getElementById('mobile-menu')
  menu?.classList.toggle('open', menuOpen)
}

function closeMobileMenu(): void {
  menuOpen = false
  document.getElementById('mobile-menu')?.classList.remove('open')
}

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement
  if (!target.closest('#hamburger') && !target.closest('#mobile-menu')) {
    closeMobileMenu()
  }
})

// --- Like ---
function like(el: HTMLButtonElement): void {
  el.style.color = '#e05a5a'
}

// --- Bottom nav ---
function bottomNavClick(el: HTMLButtonElement): void {
  document.querySelectorAll<HTMLButtonElement>('.bottom-nav-item').forEach(i => i.classList.remove('active'))
  el.classList.add('active')
  const label = el.querySelector('.bn-label')?.textContent ?? ''
  document.querySelectorAll<HTMLButtonElement>('.nav-link').forEach(l => {
    l.classList.toggle('active', l.textContent?.trim() === label)
  })
}

// Expose to global scope for inline handlers
const g = window as unknown as Record<string, unknown>
g.toggleTheme = toggleTheme
g.toggleMobileMenu = toggleMobileMenu
g.setActive = setActive
g.like = like
g.bottomNavClick = bottomNavClick
