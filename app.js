/* ═══════════════════════════════════════════
   Quiz App — Main Logic
   ═══════════════════════════════════════════ */

// ── Sound Effects (Web Audio API) ──
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function ensureAudioCtx() {
  if (!audioCtx) audioCtx = new AudioCtx();
  return audioCtx;
}

function playTone(freq, duration, type = 'sine', volume = 0.15) {
  try {
    const ctx = ensureAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) { /* silent fail */ }
}

function playCorrectSound() {
  playTone(523.25, 0.12, 'sine', 0.12);
  setTimeout(() => playTone(659.25, 0.12, 'sine', 0.12), 80);
  setTimeout(() => playTone(783.99, 0.2, 'sine', 0.12), 160);
}

function playWrongSound() {
  playTone(300, 0.15, 'square', 0.08);
  setTimeout(() => playTone(250, 0.25, 'square', 0.08), 120);
}

function playCompleteSound() {
  const notes = [523.25, 659.25, 783.99, 1046.50];
  notes.forEach((f, i) => setTimeout(() => playTone(f, 0.25, 'sine', 0.1), i * 120));
}

// ── Fisher-Yates Shuffle ──
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── DOM References ──
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  startScreen: $('#start-screen'),
  quizScreen: $('#quiz-screen'),
  resultScreen: $('#result-screen'),
  startBtn: $('#start-btn'),
  nextBtn: $('#next-btn'),
  restartBtn: $('#restart-btn'),
  homeBtn: $('#home-btn'),
  themeToggle: $('#theme-toggle'),
  questionCounter: $('#question-counter'),
  scoreCounter: $('#score-counter'),
  progressBar: $('#progress-bar'),
  timerDisplay: $('#timer-display'),
  timerText: $('#timer-text'),
  questionText: $('#question-text'),
  questionCard: $('#question-card'),
  optionsGrid: $('#options-grid'),
  questionArea: $('#question-area'),
  topicChips: $('#topic-chips'),
  feedbackBar: $('#feedback-bar'),
  feedbackIcon: $('#feedback-icon'),
  feedbackText: $('#feedback-text'),
  explanationText: $('#explanation-text'),
  totalCountBadge: $('#total-count-badge'),
  highScoreDisplay: $('#high-score-display'),
  highScoreValue: $('#high-score-value'),
  // Result
  resultEmoji: $('#result-emoji'),
  resultTitle: $('#result-title'),
  scoreRingFill: $('#score-ring-fill'),
  scoreNumber: $('#score-number'),
  resultDetail: $('#result-detail'),
  resultMessage: $('#result-message'),
  statCorrect: $('#stat-correct'),
  statWrong: $('#stat-wrong'),
  statSkipped: $('#stat-skipped'),
};

// ── State ──
let state = {
  questions: [],
  currentIndex: 0,
  score: 0,
  answered: 0,
  skipped: 0,
  timerSec: 0,
  timerId: null,
  timeLeft: 0,
  isAnswered: false,
  selectedCount: 0,
  selectedTopics: new Set(['all']),
};

// ── Theme ──
function initTheme() {
  const saved = localStorage.getItem('quiz-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('quiz-theme', next);
}

// ── Topic Chips ──
const TOPIC_ICONS = {
  'Logic Microoperations': '🔣',
  'Shift Operations': '↔️',
  'Arithmetic Operations': '➕',
  'Addressing Modes': '📍',
  'Register Transfer & Bus': '🔀',
};

function renderTopicChips() {
  const container = dom.topicChips;
  // Count questions per topic
  const counts = {};
  QUESTIONS.forEach(q => {
    counts[q.topic] = (counts[q.topic] || 0) + 1;
  });

  // Create chips for each topic
  (typeof TOPICS !== 'undefined' ? TOPICS : Object.keys(counts).sort()).forEach(topic => {
    const btn = document.createElement('button');
    btn.className = 'topic-chip';
    btn.dataset.topic = topic;
    btn.innerHTML = `
      <span class="chip-icon">${TOPIC_ICONS[topic] || '📝'}</span>
      <span>${topic}</span>
      <span class="chip-count">${counts[topic] || 0}</span>
    `;
    container.appendChild(btn);
  });

  // Click handlers
  container.addEventListener('click', (e) => {
    const chip = e.target.closest('.topic-chip');
    if (!chip) return;

    const topic = chip.dataset.topic;

    if (topic === 'all') {
      // Select all, deselect others
      state.selectedTopics = new Set(['all']);
      container.querySelectorAll('.topic-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    } else {
      // Toggle this topic
      const allChip = container.querySelector('[data-topic="all"]');
      allChip.classList.remove('active');
      state.selectedTopics.delete('all');

      if (state.selectedTopics.has(topic)) {
        state.selectedTopics.delete(topic);
        chip.classList.remove('active');
      } else {
        state.selectedTopics.add(topic);
        chip.classList.add('active');
      }

      // If nothing selected, revert to all
      if (state.selectedTopics.size === 0) {
        state.selectedTopics.add('all');
        allChip.classList.add('active');
      }
    }

    updateQuestionCount();
  });
}

function updateQuestionCount() {
  let count;
  if (state.selectedTopics.has('all')) {
    count = QUESTIONS.length;
  } else {
    count = QUESTIONS.filter(q => state.selectedTopics.has(q.topic)).length;
  }
  dom.totalCountBadge.textContent = `${count} Questions`;
}

// ── Init ──
function init() {
  initTheme();
  dom.totalCountBadge.textContent = `${QUESTIONS.length} Questions`;
  showHighScore();
  renderTopicChips();

  // Timer buttons
  $$('#timer-options .timer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#timer-options .timer-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.timerSec = parseInt(btn.dataset.time) || 0;
    });
  });

  // Count buttons
  $$('#count-options .timer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#count-options .timer-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  dom.startBtn.addEventListener('click', startQuiz);
  dom.nextBtn.addEventListener('click', nextQuestion);
  dom.restartBtn.addEventListener('click', startQuiz);
  dom.homeBtn.addEventListener('click', goHome);
  dom.themeToggle.addEventListener('click', toggleTheme);

  // Keyboard support
  document.addEventListener('keydown', handleKeyboard);
}

function handleKeyboard(e) {
  if (!dom.quizScreen.classList.contains('active')) return;

  if (['1', '2', '3', '4'].includes(e.key)) {
    const idx = parseInt(e.key) - 1;
    const btns = dom.optionsGrid.querySelectorAll('.option-btn:not(.disabled)');
    if (btns[idx] && !state.isAnswered) btns[idx].click();
  }

  if (e.key === 'Enter' && state.isAnswered) {
    dom.nextBtn.click();
  }
}

// ── Screen Management ──
function showScreen(screen) {
  [dom.startScreen, dom.quizScreen, dom.resultScreen].forEach(s => {
    s.classList.remove('active');
  });
  screen.classList.add('active');
}

// ── Quiz Flow ──
function startQuiz() {
  // Filter by selected topics
  let pool = QUESTIONS;
  if (!state.selectedTopics.has('all')) {
    pool = QUESTIONS.filter(q => state.selectedTopics.has(q.topic));
  }
  if (pool.length === 0) pool = QUESTIONS;

  // Get selected count
  const activeCountBtn = $('#count-options .timer-btn.active');
  const countVal = activeCountBtn.dataset.count;
  const maxCount = countVal === 'all' ? pool.length : parseInt(countVal);

  state.questions = shuffle(pool).slice(0, maxCount);
  state.currentIndex = 0;
  state.score = 0;
  state.answered = 0;
  state.skipped = 0;
  state.isAnswered = false;

  showScreen(dom.quizScreen);
  renderQuestion();
}

function renderQuestion() {
  const q = state.questions[state.currentIndex];
  const total = state.questions.length;
  const idx = state.currentIndex;

  // Clear previous state
  state.isAnswered = false;
  dom.nextBtn.style.display = 'none';
  dom.feedbackBar.classList.remove('show', 'correct-feedback', 'wrong-feedback');

  // Header
  dom.questionCounter.textContent = `Question ${idx + 1} of ${total}`;
  dom.scoreCounter.textContent = `Score: ${state.score}`;
  dom.progressBar.style.width = `${((idx) / total) * 100}%`;

  // Question text
  dom.questionText.textContent = q.question;

  // Options — shuffle option order
  const optionIndices = q.options.map((_, i) => i);
  const shuffledIndices = shuffle(optionIndices);

  dom.optionsGrid.innerHTML = '';
  const letters = ['A', 'B', 'C', 'D'];

  shuffledIndices.forEach((origIdx, displayIdx) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `
      <span class="option-letter">${letters[displayIdx]}</span>
      <span class="option-text">${q.options[origIdx]}</span>
    `;
    btn.addEventListener('click', () => selectAnswer(origIdx, btn));
    dom.optionsGrid.appendChild(btn);
  });

  // Timer
  clearInterval(state.timerId);
  if (state.timerSec > 0) {
    dom.timerDisplay.style.display = 'flex';
    state.timeLeft = state.timerSec;
    dom.timerText.textContent = state.timeLeft;
    dom.timerDisplay.classList.remove('warning');
    state.timerId = setInterval(tickTimer, 1000);
  } else {
    dom.timerDisplay.style.display = 'none';
  }
}

function tickTimer() {
  state.timeLeft--;
  dom.timerText.textContent = state.timeLeft;

  if (state.timeLeft <= 5) {
    dom.timerDisplay.classList.add('warning');
  }

  if (state.timeLeft <= 0) {
    clearInterval(state.timerId);
    // Time's up — mark as skipped
    if (!state.isAnswered) {
      state.skipped++;
      showFeedback(false, true);
      disableOptions();
      highlightCorrect();
      dom.nextBtn.style.display = 'flex';
      state.isAnswered = true;
    }
  }
}

function selectAnswer(origIdx, btnEl) {
  if (state.isAnswered) return;

  state.isAnswered = true;
  clearInterval(state.timerId);
  state.answered++;

  const q = state.questions[state.currentIndex];
  const isCorrect = origIdx === q.answer;

  if (isCorrect) {
    state.score++;
    btnEl.classList.add('correct');
    playCorrectSound();
    showFeedback(true);
  } else {
    btnEl.classList.add('wrong');
    playWrongSound();
    showFeedback(false);
    // Highlight correct answer
    highlightCorrect();
  }

  dom.scoreCounter.textContent = `Score: ${state.score}`;
  disableOptions();
  dom.nextBtn.style.display = 'flex';
  dom.nextBtn.focus();
}

function highlightCorrect() {
  const q = state.questions[state.currentIndex];
  const optBtns = dom.optionsGrid.querySelectorAll('.option-btn');
  optBtns.forEach(btn => {
    const text = btn.querySelector('.option-text').textContent;
    if (text === q.options[q.answer]) {
      btn.classList.add('correct');
    }
  });
}

function disableOptions() {
  dom.optionsGrid.querySelectorAll('.option-btn').forEach(b => b.classList.add('disabled'));
}

function showFeedback(isCorrect, isTimeout = false) {
  dom.feedbackBar.classList.remove('correct-feedback', 'wrong-feedback');
  dom.feedbackBar.classList.add('show');

  if (isTimeout) {
    dom.feedbackIcon.textContent = '⏱️';
    dom.feedbackText.textContent = "Time's up!";
    dom.feedbackBar.classList.add('wrong-feedback');
  } else if (isCorrect) {
    dom.feedbackIcon.textContent = '✅';
    dom.feedbackText.textContent = 'Correct!';
    dom.feedbackBar.classList.add('correct-feedback');
  } else {
    dom.feedbackIcon.textContent = '❌';
    dom.feedbackText.textContent = 'Incorrect';
    dom.feedbackBar.classList.add('wrong-feedback');
  }

  // Explanation
  const q = state.questions[state.currentIndex];
  dom.explanationText.textContent = q.explanation ? `💡 ${q.explanation}` : '';
}

function nextQuestion() {
  const area = dom.questionArea;
  area.classList.add('slide-out');

  setTimeout(() => {
    area.classList.remove('slide-out');
    state.currentIndex++;

    if (state.currentIndex >= state.questions.length) {
      showResult();
      return;
    }

    renderQuestion();
    area.classList.add('slide-in');
    setTimeout(() => area.classList.remove('slide-in'), 300);
  }, 250);
}

// ── Results ──
function showResult() {
  clearInterval(state.timerId);
  playCompleteSound();

  const total = state.questions.length;
  const correct = state.score;
  const wrong = state.answered - correct;
  const skipped = total - state.answered;
  const pct = Math.round((correct / total) * 100);

  // Save high score
  saveHighScore(correct, total);

  // Show screen
  showScreen(dom.resultScreen);

  // Emoji & title
  if (pct >= 90) {
    dom.resultEmoji.textContent = '🏆';
    dom.resultTitle.textContent = 'Outstanding!';
    dom.resultMessage.textContent = 'You absolutely crushed it!';
  } else if (pct >= 70) {
    dom.resultEmoji.textContent = '🎉';
    dom.resultTitle.textContent = 'Great Job!';
    dom.resultMessage.textContent = 'Solid performance — keep going!';
  } else if (pct >= 50) {
    dom.resultEmoji.textContent = '💪';
    dom.resultTitle.textContent = 'Good Effort!';
    dom.resultMessage.textContent = 'A bit more practice and you will nail it.';
  } else if (pct >= 30) {
    dom.resultEmoji.textContent = '📚';
    dom.resultTitle.textContent = 'Keep Studying';
    dom.resultMessage.textContent = 'Review the material and try again.';
  } else {
    dom.resultEmoji.textContent = '😅';
    dom.resultTitle.textContent = 'Don\'t Give Up!';
    dom.resultMessage.textContent = 'Everyone starts somewhere — keep at it!';
  }

  // Stats
  dom.statCorrect.textContent = correct;
  dom.statWrong.textContent = wrong;
  dom.statSkipped.textContent = skipped;

  // Detail
  dom.resultDetail.textContent = `You got ${correct} out of ${total} correct`;

  // Animated score ring
  const circumference = 2 * Math.PI * 52; // r=52
  const offset = circumference - (pct / 100) * circumference;
  dom.scoreRingFill.style.strokeDasharray = circumference;
  dom.scoreRingFill.style.strokeDashoffset = circumference;

  // Animate after a tick
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      dom.scoreRingFill.style.strokeDashoffset = offset;
    });
  });

  // Animate score number
  animateCounter(dom.scoreNumber, 0, pct, 1200);

  // Update progress bar to 100%
  dom.progressBar.style.width = '100%';
}

function animateCounter(el, from, to, duration) {
  const start = performance.now();
  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ── High Score ──
function saveHighScore(correct, total) {
  const key = `quiz-highscore-${total}`;
  const prev = parseInt(localStorage.getItem(key)) || 0;
  if (correct > prev) {
    localStorage.setItem(key, correct);
  }
  // Also save last score
  localStorage.setItem('quiz-last-score', JSON.stringify({ correct, total, date: new Date().toISOString() }));
}

function showHighScore() {
  const last = localStorage.getItem('quiz-last-score');
  if (last) {
    const { correct, total } = JSON.parse(last);
    dom.highScoreDisplay.style.display = 'block';
    dom.highScoreValue.textContent = `${correct}/${total} (${Math.round((correct / total) * 100)}%)`;
  }
}

function goHome() {
  showScreen(dom.startScreen);
  showHighScore();
}

// ── Boot ──
init();
