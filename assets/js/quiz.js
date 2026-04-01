const questions = [
  {
    q: 'Тоглоом тоглоход хамгийн их юуг хайдаг вэ?',
    emoji: '🎯',
    options: [
      { text: 'Сонирхолтой story, дүрүүд', type: 'story' },
      { text: 'Ranked ахиулах, мастер болох', type: 'competitive' },
      { text: 'Найзуудтайгаа хамт тоглох', type: 'social' },
      { text: 'Тайвшрал, зугаа цэнгэл', type: 'casual' },
    ],
  },
  {
    q: 'Шинэ тоглоом гарахад чи юу хийдэг вэ?',
    emoji: '🕹️',
    options: [
      { text: 'Pre-order хийчихсэн байдаг', type: 'hardcore' },
      { text: 'Review гарах хүртэл хүлээдэг', type: 'casual' },
      { text: 'Найзуудад санал болгодог', type: 'social' },
      { text: 'Meta болон speedrun шалгадаг', type: 'competitive' },
    ],
  },
  {
    q: 'Хамгийн дуртай genre?',
    emoji: '🎮',
    options: [
      { text: 'RPG / Story-rich adventure', type: 'story' },
      { text: 'FPS / Battle Royale / MOBA', type: 'competitive' },
      { text: 'Co-op / Party games', type: 'social' },
      { text: 'Open World / Survival', type: 'hardcore' },
    ],
  },
  {
    q: 'Gaming session хэр удаан үргэлжилдэг?',
    emoji: '⏱️',
    options: [
      { text: '1-2 цаг, тайвнаар', type: 'casual' },
      { text: '6+ цаг, дуусах хүртэл', type: 'hardcore' },
      { text: 'Найзуудтай болтол', type: 'social' },
      { text: 'Ranked match дуустал', type: 'competitive' },
    ],
  },
  {
    q: 'Achievement / Trophy-ийн талаар чи яадаг вэ?',
    emoji: '🏆',
    options: [
      { text: 'Platinum авах хүртэл тогтдоггүй', type: 'hardcore' },
      { text: 'Story дуустал автоматаар авдаг', type: 'story' },
      { text: 'Найзуудтайгаа харьцуулдаг', type: 'social' },
      { text: 'Achievement гэж юу вэ?', type: 'casual' },
    ],
  },
]

const results = {
  casual: {
    title: 'Casual Gamer',
    emoji: '😎',
    desc: 'Чи тоглоомыг зугаа цэнгэлдээ тоглодог. Стресс бус, тайван тоглоно. Амьдралын баланс чамд байдаг — тоглоом бол амрах арга.',
    color: 'var(--green)',
  },
  hardcore: {
    title: 'Hardcore Gamer',
    emoji: '💀',
    desc: 'Чи 100% completion, platinum trophy, dark souls challenge — бүгдийг дуусгахаас өмнө тайвширдаггүй. Тоглоом чиний амьдрал.',
    color: 'var(--red)',
  },
  competitive: {
    title: 'Competitive Gamer',
    emoji: '🔥',
    desc: 'Чи ranked, leaderboard, esports чиглэлтэй. Ялах л зорилго. Тоглоомын meta, update бүгдийг мэддэг. Pro болох зам дээр.',
    color: 'var(--blue)',
  },
  story: {
    title: 'Story Gamer',
    emoji: '📖',
    desc: 'Тоглоомыг кино шиг хардаг. Дүрийн хувирал, lore, narrative — чамд хамгийн чухал. Gameplay биш, story нь сайн бол болоо.',
    color: 'var(--purple)',
  },
  social: {
    title: 'Social Gamer',
    emoji: '🤝',
    desc: 'Тоглоомоос илүү хамт тоглох найзууд чухал. Discord, co-op, party games — чи gaming-ийг нийгмийн хэрэгсэл болгодог.',
    color: '#f5a05a',
  },
}

let current = 0
const scores = { casual: 0, hardcore: 0, competitive: 0, story: 0, social: 0 }

function renderQuestion() {
  const q = questions[current]
  const container = document.getElementById('quiz-container')
  const pct = (current / questions.length) * 100
  container.innerHTML = `
    <div class="quiz-progress-wrap">
      <div class="quiz-progress-bar">
        <div class="quiz-progress-fill" style="width:${pct}%"></div>
      </div>
      <span class="quiz-progress-text">${current + 1} / ${questions.length}</span>
    </div>
    <div class="quiz-question-card">
      <div class="quiz-q-emoji">${q.emoji}</div>
      <div class="quiz-q-text">${q.q}</div>
      <div class="quiz-options">
        ${q.options.map((o, i) => `
          <button class="quiz-option" data-index="${i}" onclick="selectOption(this, '${o.type}')">
            <span class="quiz-option-letter">${String.fromCharCode(65 + i)}</span>
            <span>${o.text}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `
}

function selectOption(el, type) {
  document.querySelectorAll('.quiz-option').forEach(b => {
    b.disabled = true
    b.classList.add('disabled')
  })
  el.classList.add('selected')
  scores[type]++
  setTimeout(() => {
    current++
    if (current < questions.length) {
      renderQuestion()
    } else {
      renderResult()
    }
  }, 420)
}

function renderResult() {
  const top = Object.keys(scores).reduce((a, b) => scores[a] >= scores[b] ? a : b)
  const r = results[top]
  const container = document.getElementById('quiz-container')
  container.innerHTML = `
    <div class="quiz-result">
      <div class="quiz-result-emoji">${r.emoji}</div>
      <div class="quiz-result-label">Чи бол...</div>
      <div class="quiz-result-title" style="color:${r.color}">${r.title}</div>
      <div class="quiz-result-desc">${r.desc}</div>
      <div class="quiz-result-bars">
        ${Object.keys(scores).map(t => `
          <div class="quiz-bar-row">
            <span class="quiz-bar-label">${results[t].title}</span>
            <div class="quiz-bar-track">
              <div class="quiz-bar-fill" style="width:${(scores[t] / questions.length) * 100}%; background:${results[t].color}"></div>
            </div>
            <span class="quiz-bar-val">${scores[t]}</span>
          </div>
        `).join('')}
      </div>
      <div class="quiz-result-actions">
        <button class="quiz-restart" onclick="restartQuiz()">Дахин тоглох</button>
        <a class="quiz-home" href="/">Нүүр хуудас</a>
      </div>
    </div>
  `
}

function restartQuiz() {
  current = 0
  Object.keys(scores).forEach(k => { scores[k] = 0 })
  renderQuestion()
}

renderQuestion()

window.selectOption = selectOption
window.restartQuiz = restartQuiz
