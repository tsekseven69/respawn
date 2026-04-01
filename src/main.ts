import './styles/main.css'

function setActive(el: HTMLButtonElement): void {
  document.querySelectorAll<HTMLButtonElement>('.nav-link').forEach(l => l.classList.remove('active'))
  el.classList.add('active')
}

function like(el: HTMLButtonElement): void {
  el.style.color = '#e05a5a'
}

// Expose to global scope for inline onclick handlers
;(window as unknown as Record<string, unknown>).setActive = setActive
;(window as unknown as Record<string, unknown>).like = like
