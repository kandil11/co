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
  slots: [],        // each slot: { type:'single', question } or { type:'case', context, questions:[] }
  questions: [],     // flat list for counting
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
  caseAnswered: 0,   // tracks how many sub-questions answered in current case
  caseTotalInSlot: 0, // total sub-questions in current case slot
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

  const slot = state.slots[state.currentIndex];
  // Only use number keys for single questions (not case groups)
  if (slot && slot.type === 'single') {
    if (['1', '2', '3', '4'].includes(e.key)) {
      const idx = parseInt(e.key) - 1;
      const btns = dom.optionsGrid.querySelectorAll('.option-btn:not(.disabled)');
      if (btns[idx] && !state.isAnswered) btns[idx].click();
    }
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
function buildSlots(questions) {
  // Group case-based questions into slots
  const slots = [];
  const used = new Set();

  for (let i = 0; i < questions.length; i++) {
    if (used.has(i)) continue;
    const q = questions[i];

    if (q.caseGroup) {
      // Collect all questions in this case group
      const groupQs = [];
      for (let j = 0; j < questions.length; j++) {
        if (questions[j].caseGroup === q.caseGroup) {
          groupQs.push(questions[j]);
          used.add(j);
        }
      }
      slots.push({
        type: 'case',
        context: q.caseContext,
        questions: groupQs,
      });
    } else {
      used.add(i);
      slots.push({ type: 'single', question: q });
    }
  }
  return slots;
}

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

  // Shuffle then build slots
  const shuffled = shuffle(pool);
  const allSlots = buildSlots(shuffled);

  // If count limit, take slots until we hit the question count
  if (countVal !== 'all') {
    const maxCount = parseInt(countVal);
    let count = 0;
    const limited = [];
    for (const slot of allSlots) {
      const n = slot.type === 'case' ? slot.questions.length : 1;
      if (count + n > maxCount && limited.length > 0) break;
      limited.push(slot);
      count += n;
    }
    state.slots = limited;
  } else {
    state.slots = allSlots;
  }

  // Flat question count for scoring
  state.questions = state.slots.flatMap(s => s.type === 'case' ? s.questions : [s.question]);
  state.currentIndex = 0;
  state.score = 0;
  state.answered = 0;
  state.skipped = 0;
  state.isAnswered = false;
  state.caseAnswered = 0;
  state.caseTotalInSlot = 0;

  showScreen(dom.quizScreen);
  renderSlot();
}

function renderSlot() {
  const slot = state.slots[state.currentIndex];
  if (slot.type === 'case') {
    renderCaseGroup(slot);
  } else {
    renderSingleQuestion(slot.question);
  }
}

// ── Single Question Rendering ──
function renderSingleQuestion(q) {
  state.isAnswered = false;
  state.caseAnswered = 0;
  state.caseTotalInSlot = 1;
  dom.nextBtn.style.display = 'none';
  dom.feedbackBar.classList.remove('show', 'correct-feedback', 'wrong-feedback');

  // Header
  const totalSlots = state.slots.length;
  const idx = state.currentIndex;
  dom.questionCounter.textContent = `Question ${idx + 1} of ${totalSlots}`;
  dom.scoreCounter.textContent = `Score: ${state.score}`;
  dom.progressBar.style.width = `${(idx / totalSlots) * 100}%`;

  // Question text
  dom.questionCard.style.display = '';
  dom.questionText.textContent = q.question;

  // Options
  const optionIndices = q.options.map((_, i) => i);
  const shuffledIndices = shuffle(optionIndices);
  dom.optionsGrid.innerHTML = '';
  dom.optionsGrid.className = 'options-grid';
  const letters = ['A', 'B', 'C', 'D'];

  shuffledIndices.forEach((origIdx, displayIdx) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `
      <span class="option-letter">${letters[displayIdx]}</span>
      <span class="option-text">${q.options[origIdx]}</span>
    `;
    btn.addEventListener('click', () => selectSingleAnswer(q, origIdx, btn));
    dom.optionsGrid.appendChild(btn);
  });

  // Timer
  clearInterval(state.timerId);
  if (state.timerSec > 0) {
    dom.timerDisplay.style.display = 'flex';
    state.timeLeft = state.timerSec;
    dom.timerText.textContent = state.timeLeft;
    dom.timerDisplay.classList.remove('warning');
    state.timerId = setInterval(tickTimerSingle, 1000);
  } else {
    dom.timerDisplay.style.display = 'none';
  }
}

function tickTimerSingle() {
  state.timeLeft--;
  dom.timerText.textContent = state.timeLeft;
  if (state.timeLeft <= 5) dom.timerDisplay.classList.add('warning');
  if (state.timeLeft <= 0) {
    clearInterval(state.timerId);
    if (!state.isAnswered) {
      state.skipped++;
      showSingleFeedback(false, true);
      dom.optionsGrid.querySelectorAll('.option-btn').forEach(b => b.classList.add('disabled'));
      highlightSingleCorrect(state.slots[state.currentIndex].question);
      dom.nextBtn.style.display = 'flex';
      state.isAnswered = true;
    }
  }
}

function selectSingleAnswer(q, origIdx, btnEl) {
  if (state.isAnswered) return;
  state.isAnswered = true;
  clearInterval(state.timerId);
  state.answered++;

  const isCorrect = origIdx === q.answer;
  if (isCorrect) {
    state.score++;
    btnEl.classList.add('correct');
    playCorrectSound();
    showSingleFeedback(true);
  } else {
    btnEl.classList.add('wrong');
    playWrongSound();
    showSingleFeedback(false);
    highlightSingleCorrect(q);
  }

  dom.scoreCounter.textContent = `Score: ${state.score}`;
  dom.optionsGrid.querySelectorAll('.option-btn').forEach(b => b.classList.add('disabled'));
  dom.nextBtn.style.display = 'flex';
  dom.nextBtn.focus();
}

function highlightSingleCorrect(q) {
  dom.optionsGrid.querySelectorAll('.option-btn').forEach(btn => {
    if (btn.querySelector('.option-text').textContent === q.options[q.answer]) {
      btn.classList.add('correct');
    }
  });
}

function showSingleFeedback(isCorrect, isTimeout = false) {
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
  const slot = state.slots[state.currentIndex];
  const q = slot.type === 'single' ? slot.question : null;
  dom.explanationText.textContent = (q && q.explanation) ? `💡 ${q.explanation}` : '';
}

// ── Case Group Rendering ──
function renderCaseGroup(slot) {
  state.isAnswered = false;
  state.caseAnswered = 0;
  state.caseTotalInSlot = slot.questions.length;
  dom.nextBtn.style.display = 'none';
  dom.feedbackBar.classList.remove('show', 'correct-feedback', 'wrong-feedback');

  const totalSlots = state.slots.length;
  const idx = state.currentIndex;
  dom.questionCounter.textContent = `Case ${idx + 1} of ${totalSlots} (${slot.questions.length} questions)`;
  dom.scoreCounter.textContent = `Score: ${state.score}`;
  dom.progressBar.style.width = `${(idx / totalSlots) * 100}%`;

  // Show context in the main question card
  dom.questionCard.style.display = '';
  dom.questionText.innerHTML = `<span class="case-badge">📋 Case Scenario</span>\n${escapeHtml(slot.context)}`;

  // Build sub-questions
  dom.optionsGrid.innerHTML = '';
  dom.optionsGrid.className = 'options-grid case-questions-grid';

  const letters = ['A', 'B', 'C', 'D'];

  slot.questions.forEach((q, qIdx) => {
    const subBlock = document.createElement('div');
    subBlock.className = 'case-sub-question';
    subBlock.dataset.qidx = qIdx;

    // Sub-question text
    const qText = document.createElement('p');
    qText.className = 'sub-question-text';
    qText.textContent = `${qIdx + 1}. ${q.caseQuestion || q.question}`;
    subBlock.appendChild(qText);

    // Options for this sub-question
    const optionIndices = q.options.map((_, i) => i);
    const shuffledIndices = shuffle(optionIndices);
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'sub-options';

    shuffledIndices.forEach((origIdx, displayIdx) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.innerHTML = `
        <span class="option-letter">${letters[displayIdx]}</span>
        <span class="option-text">${q.options[origIdx]}</span>
      `;
      btn.addEventListener('click', () => selectCaseAnswer(q, qIdx, origIdx, btn, subBlock));
      optionsContainer.appendChild(btn);
    });

    subBlock.appendChild(optionsContainer);

    // Per-question feedback
    const fb = document.createElement('div');
    fb.className = 'sub-feedback';
    subBlock.appendChild(fb);

    dom.optionsGrid.appendChild(subBlock);
  });

  // Timer (applies to the whole case)
  clearInterval(state.timerId);
  if (state.timerSec > 0) {
    dom.timerDisplay.style.display = 'flex';
    state.timeLeft = state.timerSec * slot.questions.length; // more time for more questions
    dom.timerText.textContent = state.timeLeft;
    dom.timerDisplay.classList.remove('warning');
    state.timerId = setInterval(tickTimerCase, 1000);
  } else {
    dom.timerDisplay.style.display = 'none';
  }
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tickTimerCase() {
  state.timeLeft--;
  dom.timerText.textContent = state.timeLeft;
  if (state.timeLeft <= 10) dom.timerDisplay.classList.add('warning');
  if (state.timeLeft <= 0) {
    clearInterval(state.timerId);
    // Time up — mark all unanswered as skipped
    const slot = state.slots[state.currentIndex];
    const subBlocks = dom.optionsGrid.querySelectorAll('.case-sub-question');
    subBlocks.forEach((block, qIdx) => {
      if (!block.classList.contains('answered')) {
        block.classList.add('answered');
        state.skipped++;
        // Disable options & highlight correct
        block.querySelectorAll('.option-btn').forEach(b => b.classList.add('disabled'));
        const q = slot.questions[qIdx];
        block.querySelectorAll('.option-btn').forEach(btn => {
          if (btn.querySelector('.option-text').textContent === q.options[q.answer]) {
            btn.classList.add('correct');
          }
        });
        const fb = block.querySelector('.sub-feedback');
        fb.textContent = '⏱️ Time\'s up';
        fb.className = 'sub-feedback show wrong';
      }
    });
    state.isAnswered = true;
    dom.nextBtn.style.display = 'flex';
  }
}

function selectCaseAnswer(q, qIdx, origIdx, btnEl, subBlock) {
  if (subBlock.classList.contains('answered')) return;
  subBlock.classList.add('answered');
  state.answered++;
  state.caseAnswered++;

  const isCorrect = origIdx === q.answer;
  const fb = subBlock.querySelector('.sub-feedback');

  if (isCorrect) {
    state.score++;
    btnEl.classList.add('correct');
    playCorrectSound();
    fb.textContent = '✅ Correct!';
    fb.className = 'sub-feedback show correct';
  } else {
    btnEl.classList.add('wrong');
    playWrongSound();
    fb.textContent = '❌ Incorrect';
    fb.className = 'sub-feedback show wrong';
    // Highlight correct
    subBlock.querySelectorAll('.option-btn').forEach(btn => {
      if (btn.querySelector('.option-text').textContent === q.options[q.answer]) {
        btn.classList.add('correct');
      }
    });
  }

  // Disable this sub-question's options
  subBlock.querySelectorAll('.option-btn').forEach(b => b.classList.add('disabled'));
  dom.scoreCounter.textContent = `Score: ${state.score}`;

  // Check if all sub-questions answered
  if (state.caseAnswered >= state.caseTotalInSlot) {
    state.isAnswered = true;
    clearInterval(state.timerId);
    dom.nextBtn.style.display = 'flex';
    dom.nextBtn.focus();
  }
}

// ── Navigation ──
function nextQuestion() {
  const area = dom.questionArea;
  area.classList.add('slide-out');

  setTimeout(() => {
    area.classList.remove('slide-out');
    state.currentIndex++;

    if (state.currentIndex >= state.slots.length) {
      showResult();
      return;
    }

    renderSlot();
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
