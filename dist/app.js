import {config} from "./config.js";
import {drawRouteConnectors, routeOffsets} from "./route-art.js";
import {buildCourse, currentCourseStep, reviewCourseQuestions} from "./course.js";
import {lessonNote} from "./lesson-notes.js";
import {DAY, shuffled, examBlocks, extraQuestions, localDay, streak} from "./study.js";

const app = document.querySelector("#app");
const offlineData = globalThis.PDD_OFFLINE_DATA;
const telegram = globalThis.Telegram?.WebApp;
telegram?.ready();
telegram?.expand();
const progressKey = "pdd-progress-v1";
let progress = {answers: {}, days: [], lessons: 0, examDate: "", routeDone: []};
try { progress = {...progress, ...JSON.parse(localStorage.getItem(progressKey))}; } catch {}
const completedRoute = new Set(Array.isArray(progress.routeDone) ? progress.routeDone : []);
const save = () => {
  try { localStorage.setItem(progressKey, JSON.stringify(progress)); } catch {}
};
let questions = [], topics = [], byId = new Map();
let chapters = [], chapterView = null;
let page = "home", session, previousPage, ticker;
let billing = {active: false, enabled: false, price: 199, adBlock: config.adBlock ?? ""};
let adCounter = 0, adLoader;

function escape(value) {
  return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function button(text, action, value = "", kind = "secondary", disabled = false) {
  return '<button class="' + kind + '" data-action="' + action + '" data-value="' +
    escape(value) + '"' + (disabled ? " disabled" : "") + '>' + escape(text) + '</button>';
}
function card(title, detail, action, value, label = "") {
  return '<button class="card" data-action="' + action + '" data-value="' + escape(value) +
    '"><strong>' + escape(title) + '</strong><small>' + escape(detail) + '</small>' +
    (label ? '<b>' + escape(label) + '</b>' : '') + '</button>';
}
function panel(title, body) {
  return '<section class="panel narrow"><h1>' + escape(title) + '</h1>' + body + '</section>';
}
function stat(text, value) {
  return '<div class="metric"><strong>' + value + '</strong><span>' + text + '</span></div>';
}
function errors() {
  return Object.keys(progress.answers).filter(id => progress.answers[id].wrong).map(id => byId.get(id)).filter(Boolean);
}
function topicStats(name) {
  const items = questions.filter(q => q.topics.includes(name));
  const mastered = items.filter(q => progress.answers[q.id] && !progress.answers[q.id].wrong).length;
  return {items, mastered};
}
function renderCourse() {
  const current = currentCourseStep(chapters, completedRoute);
  const chapter = chapters.find(item => item.id === chapterView) ?? current.chapter;
  const lessons = chapter.steps.filter(step => step.kind === "lesson");
  const completedLessons = lessons.filter(step => completedRoute.has(step.id)).length;
  const index = chapters.indexOf(chapter);
  let lessonNumber = 0;
  const route = chapter.steps.map((step, i) => {
    const completed = completedRoute.has(step.id);
    const active = step === current.step;
    const locked = !completed && !active;
    const offset = routeOffsets[i % routeOffsets.length];
    const nextOffset = routeOffsets[(i + 1) % routeOffsets.length];
    const glyph = active ? "▶" : step.kind === "review" ? "↻" : step.kind === "exam" ? "⚑" : completed ? "✓" : "";
    const icon = glyph ? '<span aria-hidden="true">' + glyph + '</span>' : '<span class="course-lock" aria-hidden="true"></span>';
    const lesson = step.kind === "lesson";
    const title = lesson ? "Урок " + (++lessonNumber) : step.title;
    const info = lesson ? step.title : step.kind === "review" ? "Недавние вопросы" : "20 вопросов · 20 минут";
    const label = lesson ? title + ". " + step.title : title;
    const node = '<span class="course-track"><span class="course-disc">' + icon + (completed && step.kind !== "lesson" ? '<span class="course-check" aria-hidden="true">✓</span>' : '') +
      '</span></span><span class="course-caption"><strong>' + escape(title) +
      '</strong><span class="course-detail">' + escape(info) + '</span>' +
      (active ? '<span class="course-cta">' +
        (step.kind === "exam" ? "Начать экзамен" : step.kind === "review" ? "Начать повторение" : "Начать урок") +
        '</span>' : '') + '</span>';
    return '<li class="course-entry" style="--node-left:' + offset + '%">' +
      (i < chapter.steps.length - 1 ? '<canvas class="course-connector" width="300" height="250" aria-hidden="true" data-from="' +
        offset + '" data-to="' + nextOffset + '" data-active="' + completed + '"></canvas>' : '') +
      '<button class="course-node ' + (active ? "is-current" : completed ? "is-complete" : "is-locked") +
      '" data-action="course-step" data-value="' + escape(step.id) + '"' +
      (active ? ' aria-current="step"' : '') + (locked ? ' disabled aria-label="' + escape(label + " — этап закрыт") + '"' : '') +
      (completed ? ' aria-label="' + escape(label + " — пройдено") + '"' : '') +
      '>' + node + '</button></li>';
  }).join("");
  const switchToCurrent = current.step ? button("К текущему этапу", "course-current", "", "secondary") : "";
  const select = '<label class="course-select"><span>Раздел курса</span><select id="chapter-select">' +
    chapters.map((item, i) => '<option value="' + item.id + '"' + (item === chapter ? ' selected' : '') +
      '>' + (i + 1) + '. ' + escape(item.title) + '</option>').join("") + '</select></label>';
  app.innerHTML = '<div class="course-layout"><section class="course-map"><div class="course-head">' +
    '<p class="course-kicker">Раздел ' + (index + 1) + ' из ' + chapters.length + '</p><h1>' + escape(chapter.title) + '</h1>' +
    '<div class="course-meter"><progress value="' + completedLessons + '" max="' + lessons.length +
    '" aria-label="Уроков пройдено в разделе"></progress><span>' + completedLessons + ' из ' + lessons.length +
    ' уроков</span></div><div class="course-tools">' + select + switchToCurrent + '</div>' +
    (!current.step ? '<p class="course-finished" role="status">Маршрут пройден</p>' : '') +
    '</div><ol class="course-steps" aria-label="Этапы раздела">' + route + '</ol></section>' +
    '<aside class="course-sidebar" aria-label="Прогресс и практика"><section class="dashboard-card"><h2>Твой прогресс</h2>' +
    '<div class="metrics">' + stat("Вопросов", Object.keys(progress.answers).filter(id => byId.has(id)).length + " / " + questions.length) +
    stat("Дней подряд", streak(progress.days)) + '</div></section>' +
    '<section class="dashboard-card"><h2>Практика</h2>' +
    '<button class="card practice-link" data-page="tickets"><strong>Все билеты</strong><small>40 билетов · 800 вопросов</small></button>' +
    '<button class="card practice-link" data-page="exam"><strong>Пробный экзамен</strong><small>20 вопросов · 20 минут</small></button>' +
    '</section></aside></div>';
  drawRouteConnectors(app);
}
function navigate(destination) {
  if (!questions.length) return;
  if (page === "study" && destination !== "study" && !confirm("Завершить текущее занятие?")) return;
  clearInterval(ticker);
  page = destination;
  if (page === "home") chapterView = null;
  for (const link of document.querySelectorAll("nav [data-page]")) {
    if (link.dataset.page === (page === "study" ? previousPage : page)) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  render();
  window.scrollTo(0, 0);
}

function render() {
  const answered = Object.keys(progress.answers).filter(id => byId.has(id)).length;
  if (page === "home") renderCourse();
  if (page === "tickets") {
    app.innerHTML = '<div class="page-heading"><p class="eyebrow"><span></span> Категории A и B</p><h1>Билеты ПДД</h1>' +
      '<p class="muted">40 билетов · 800 вопросов</p></div>' +
      '<div class="section grid ticket-grid">' + Array.from({length: 40}, (_, i) => {
        const ticket = i + 1;
        const count = questions.filter(q => q.ticket === ticket && progress.answers[q.id]).length;
        return '<button class="card ticket-card' + (count === 20 ? ' ticket-complete' : '') +
          '" data-action="ticket" data-value="' + ticket + '" aria-label="Билет ' + ticket + '">' +
          '<span class="ticket-number">' + String(ticket).padStart(2, "0") + '</span><span class="ticket-progress">' +
          count + ' из 20</span><span class="mini-track"><i style="width:' + count * 5 + '%"></i></span></button>';
      }).join("") + "</div>";
  }
  if (page === "exam") {
    app.innerHTML = panel("Пробный экзамен",
      '<div class="exam-facts">' + stat("Вопросов", 20) + stat("Минут", 20) + '</div>' +
      '<p>За каждую из первых двух ошибок добавляется блок из пяти вопросов, если ошибки сделаны в разных блоках. В дополнительных вопросах нужно ответить без ошибок.</p>' +
      button("Начать экзамен", "exam", "", "primary"));
  }
  if (page === "profile") {
    app.innerHTML = panel("Мой прогресс", '<div class="metrics">' + stat("Вопросов решено", answered) +
      stat("Ошибок к повторению", errors().length) + stat("Дней подряд", streak(progress.days)) + '</div>' +
      '<div class="actions">' + button("Повторить ошибки", "mistakes", "", "primary", !errors().length) +
      (billing.active ? button("Повторение по расписанию", "due") : button("Возможности Pro", "navigate", "pro")) + '</div>');
  }
  if (page === "pro") {
    const date = progress.examDate;
    const daysLeft = date ? Math.max(0, Math.round((Date.parse(date) - Date.parse(localDay())) / DAY)) : 0;
    const remaining = questions.filter(q => !progress.answers[q.id] || progress.answers[q.id].wrong).length;
    const priority = topics.map(name => ({ name, ...topicStats(name) }))
      .sort((a,b) => a.mastered / a.items.length - b.mastered / b.items.length).slice(0,3);
    app.innerHTML = panel("Маршрут Pro",
      '<p>План до экзамена, тренировка слабых тем, повторение по расписанию и занятия без рекламы.</p>' +
      (billing.active ?
        '<p class="label">Pro активен</p><form class="form" id="exam-date"><label for="date">Дата экзамена</label><input type="date" id="date" min="' +
        localDay() + '" required value="' + escape(date) + '"><button class="secondary">Сохранить</button></form>' +
        (date ? '<p class="section">До экзамена: ' + daysLeft + ' дн. На сегодня: ' + Math.ceil(remaining / Math.max(1, daysLeft)) + ' вопр.</p>' : '') +
        '<h2 class="section">Темы для тренировки</h2><div class="stack">' +
        priority.map(({name, items, mastered}) => card(name, mastered + " из " + items.length + " освоено", "topic", topics.indexOf(name))).join("") +
        '</div><div class="actions">' + button("Тренировать слабые темы", "weak", "", "primary") +
        button("Повторить по расписанию", "due") + '</div>' :
        '<p class="label">' + billing.price + ' ⭐ / 30 дней</p><div class="actions">' +
        button("Подключить Pro", "buy", "", "primary", !billing.enabled || !telegram?.initData) + '</div>' +
        '<p class="status muted" id="payment-status">' +
        (billing.enabled ? (telegram?.initData ? "Подписка продлевается каждые 30 дней." : "Для оплаты откройте приложение в Telegram.") : "Оплата пока не подключена.") + '</p>'));
  }
  if (page === "study") renderQuestion();
  if (page === "result") renderResult();
}

function start(items, title, blocks = null, routeStep = null) {
  if (!items.length) {
    app.insertAdjacentHTML("afterbegin", '<p class="panel" role="status">На сегодня всё повторено.</p>');
    return;
  }
  if (page !== "result") previousPage = page;
  session = {items, title, blocks, routeStep, answers: [], picked: -1, deadline: Date.now() + 20 * 60000, extra: false, passed: false};
  navigate("study");
  if (blocks) ticker = setInterval(updateTimer, 250);
}
function updateTimer() {
  if (page !== "study" || !session?.blocks) return;
  const seconds = Math.max(0, Math.ceil((session.deadline - Date.now()) / 1000));
  const clock = document.querySelector("#clock");
  if (clock) clock.textContent = Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  if (!seconds) { session.timeout = true; finish(); }
}
function record(q, selected) {
  const right = selected === q.correct;
  const prior = progress.answers[q.id];
  const level = right ? Math.min((prior?.level ?? 0) + 1, 4) : 0;
  progress.answers[q.id] = {wrong: !right, level, due: Date.now() + [1, 1, 3, 7, 14][level] * DAY};
  if (!progress.days.includes(localDay())) progress.days.push(localDay());
  save();
}
function questionImage(question, lazy = false) {
  if (!question.image) return "";
  const source = offlineData ? offlineData.images[question.image] : "./data/images/" + encodeURIComponent(question.image);
  return '<img class="question-image" src="' + escape(source) + '" alt="Дорожная ситуация к вопросу"' +
    (lazy ? ' loading="lazy" decoding="async"' : '') + '>';
}

function answerExplanation(question) {
  return '<div class="why"><strong>Почему так</strong><p>' + escape(question.explanation) + '</p>' +
    (question.reference ? '<span class="rule-reference">' + escape(question.reference) + '</span>' : '') + '</div>';
}

function renderQuestion() {
  const {items, answers, picked, blocks, extra} = session;
  const n = answers.length;
  const q = items[n];
  const show = picked >= 0 && !blocks;
  const note = n === 0 && !blocks ? lessonNote(session.routeStep?.topic ?? session.title) : "";
  const right = picked === q.correct;
  const options = q.choices.map((choice, i) => {
    const correctOption = show && i === q.correct;
    const incorrectPick = show && picked === i && !correctOption;
    const variant = correctOption ? " right" : incorrectPick ? " wrong" : picked === i ? " selected" : "";
    return '<button class="answer' + variant + '" data-action="choose" data-value="' + i +
      '" aria-pressed="' + (picked === i) + '"' + (show ? " disabled" : "") +
      '><span class="answer-letter" aria-hidden="true">' + "АБВГД"[i] + '</span><span>' +
      escape(choice) + (correctOption || incorrectPick ? '<span class="answer-state">' +
      (correctOption ? "Правильный ответ" : "Ваш ответ") + '</span>' : '') + '</span></button>';
  }).join("");
  const mode = blocks ? (extra ? "Дополнительный блок" : "Экзамен") : session.title;
  const answeredCount = n + (show ? 1 : 0);
  const indicators = !blocks && items.length <= 5 ?
    Array.from({length: items.length}, (_, i) => '<i class="' + (i < answeredCount ? 'filled' : '') + '"></i>').join("") :
    '<i style="width:' + (100 * answeredCount / items.length) + '%"></i>';
  app.innerHTML = '<section class="panel narrow question-panel"><div class="question-top">' +
    '<div class="question-header"><strong>' + escape(mode) + '</strong><span class="question-counter">Вопрос ' +
    (n + 1) + ' из ' + items.length +
    (blocks ? ' <strong id="clock" class="time-chip" aria-label="Осталось времени"></strong>' : '') +
    '</span></div><div class="bar' + (!blocks && items.length <= 5 ? ' is-segmented' : '') +
    '" role="progressbar" aria-label="Прогресс занятия" aria-valuemin="0" aria-valuemax="' + items.length +
    '" aria-valuenow="' + answeredCount + '">' + indicators + '</div></div>' +
    '<div class="question-body">' +
    (note ? '<p class="lesson-note">' + escape(note) + '</p>' : '') +
    '<h2>' + escape(q.text) + '</h2>' + questionImage(q) + '<div class="answers">' + options + '</div>' +
    (show ? '<section id="answer-explanation" class="explanation-panel ' + (right ? 'is-right' : 'is-wrong') +
      '" tabindex="-1" aria-label="Разбор ответа"><div class="explanation-heading"><span aria-hidden="true">' +
      (right ? '✓' : '↳') + '</span><strong>' + (right ? 'Верно' : 'Неверно') +
      '</strong></div>' + answerExplanation(q) + '</section>' : '') +
    '<div class="actions question-actions">' +
    (blocks || show ? button(blocks ? "Подтвердить ответ" : "Продолжить", "next", "", "primary", picked < 0) : '') +
    '</div></div></section>';
  if (blocks) updateTimer();
}
function advance() {
  if (session.picked < 0) return;
  if (session.blocks && Date.now() >= session.deadline) { session.timeout = true; finish(); return; }
  const q = session.items[session.answers.length];
  session.answers.push({q, selected: session.picked});
  record(q, session.picked);
  session.picked = -1;
  if (session.answers.length < session.items.length) {
    renderQuestion();
    window.scrollTo(0, 0);
    return;
  }
  if (!session.blocks) { finish(); return; }
  if (session.extra) {
    session.passed = session.answers.slice(20).every(({q, selected}) => selected === q.correct);
    finish();
    return;
  }
  const additions = extraQuestions(session.blocks, session.answers, session.items);
  if (!additions?.length) { session.passed = Boolean(additions); finish(); return; }
  session.extra = true;
  session.items.push(...additions);
  session.deadline = Date.now() + additions.length * 60000;
  renderQuestion();
  window.scrollTo(0, 0);
}
function finish() {
  if (page !== "study") return;
  if (!session.blocks && previousPage !== "tickets" && previousPage !== "profile") {
    progress.lessons++;
    save();
  }
  if (session.routeStep && (!session.blocks || session.passed)) {
    completedRoute.add(session.routeStep.id);
    progress.routeDone = [...completedRoute];
    save();
  }
  page = "result";
  clearInterval(ticker);
  renderResult();
  window.scrollTo(0, 0);
}
function renderResult() {
  const correct = session.answers.filter(({q, selected}) => selected === q.correct).length;
  const errorsCount = session.answers.length - correct;
  const unanswered = session.items.length - session.answers.length;
  const title = session.blocks ? (session.passed ? "Экзамен сдан" : "Экзамен не сдан") : "Занятие завершено";
  const rows = session.items.map((q, index) => {
    const selected = session.answers[index]?.selected;
    const right = selected === q.correct;
    return '<details class="review-item" data-correct="' + right +
      '"><summary><span class="review-number">' + (index + 1) + '</span><span class="review-question">' +
      escape(q.text) + '</span><span class="review-status ' + (right ? 'is-right' : 'is-wrong') + '">' +
      (right ? 'Верно' : selected === undefined ? 'Пропуск' : 'Ошибка') +
      '</span></summary><div class="review-body">' + questionImage(q, true) +
      (!right && selected !== undefined ? '<div class="review-pick"><span>Ваш ответ</span><p>' +
        escape(q.choices[selected]) + '</p></div>' : '') +
      '<div class="review-pick correct-pick"><span>Правильный ответ</span><p>' +
      escape(q.choices[q.correct]) + '</p></div>' + answerExplanation(q) + '</div></details>';
  }).join("");
  app.innerHTML = '<section class="panel narrow result-panel"><div class="result-top"><div><h1>' + escape(title) +
    '</h1><p>' + (session.timeout ? "Время вышло" : escape(session.title)) +
    '</p></div><div class="score"><strong>' + correct + ' / ' + session.items.length +
    '</strong><span>Верных ответов</span></div></div>' +
    '<div class="result-body"><div class="actions result-actions">' +
    button(session.routeStep ? "К маршруту" : "Продолжить обучение", session.routeStep ? "course-current" : "navigate", previousPage, "primary") +
    (errorsCount ? button("Повторить ошибки", "mistakes") : "") + '</div>' +
    '<div class="review-header"><h2>Разбор ответов</h2>' +
    (errorsCount + unanswered > 0 ? '<div class="review-filters" role="group" aria-label="Показать ответы">' +
      '<button data-action="review-filter" data-value="all" aria-pressed="true">Все</button>' +
      '<button data-action="review-filter" data-value="missed" aria-pressed="false">' + (unanswered ? 'Ошибки и пропуски' : 'Ошибки') + '</button></div>' : '') +
    '</div><div class="review">' + rows + '</div></div></section>';
  showAd();
}
function showAd() {
  if (!billing.adBlock || billing.active || session.adShown || !/^R-A-\d+-\d+$/.test(billing.adBlock)) return;
  if (location.protocol !== "https:") return;
  const day = localDay();
  try { if (localStorage.getItem("pdd-ad-day") === day) return; } catch {}
  const slot = document.createElement("div");
  slot.className = "ad-slot";
  slot.id = "pdd-ad-" + (++adCounter);
  app.querySelector(".result-actions").after(slot);
  if (!adLoader) {
    adLoader = new Promise((resolve, reject) => {
      window.yaContextCb ||= [];
      const script = document.createElement("script");
      script.src = "https://yandex.ru/ads/system/context.js";
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  }
  const current = session;
  adLoader.then(() => {
    if (!slot.isConnected || billing.active) return;
    window.yaContextCb.push(() => {
      if (!slot.isConnected || billing.active) return;
      const ads = window.Ya?.Context?.AdvManager;
      if (!ads) { slot.remove(); return; }
      try {
        ads.render({
          blockId: billing.adBlock,
          renderTo: slot.id,
          onError: event => { if (event.type === "error") slot.remove(); },
          onRender: () => {
            current.adShown = true;
            try { localStorage.setItem("pdd-ad-day", day); } catch {}
          }
        }, () => slot.remove());
      } catch {
        slot.remove();
      }
    });
  }).catch(() => { slot.remove(); adLoader = null; });
}
function prioritized(items) {
  return shuffled(items).sort((a, b) => {
    const score = q => progress.answers[q.id]?.wrong ? 0 : progress.answers[q.id] ? 2 : 1;
    return score(a) - score(b);
  });
}
async function api(path) {
  const result = await fetch(config.apiBase + "/api/" + path, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({initData: telegram?.initData || ""})
  });
  if (!result.ok) throw new Error("Сервис временно недоступен");
  return result.json();
}
async function buy(target) {
  const status = document.querySelector("#payment-status");
  target.disabled = true;
  try {
    const {url} = await api("invoice");
    telegram.openInvoice(url, async outcome => {
      if (outcome !== "paid") {
        status.textContent = "Оплата не завершена.";
        target.disabled = false;
        return;
      }
      status.textContent = "Подтверждаем подписку…";
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          billing = await api("status");
          if (billing.active) { if (page === "pro") render(); return; }
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 1100));
      }
      status.textContent = "Откройте приложение снова через минуту.";
      target.disabled = false;
    });
  } catch (error) { status.textContent = error.message; target.disabled = false; }
}

document.addEventListener("click", event => {
  const target = event.target.closest("button");
  if (!target || !questions.length) return;
  if (target.dataset.page) { navigate(target.dataset.page); return; }
  const {action, value} = target.dataset;
  switch (action) {
    case "navigate": navigate(value); break;
    case "ticket": start(questions.filter(q => q.ticket === Number(value)), "Билет " + value); break;
    case "topic": start(prioritized(topicStats(topics[Number(value)]).items).slice(0, 5), topics[Number(value)]); break;
    case "course-current":
      if (page !== "home") navigate("home");
      else {
        chapterView = null;
        render();
      }
      app.querySelector?.('[aria-current="step"]')?.scrollIntoView({block: "center"});
      break;
    case "course-step": {
      const {step: current} = currentCourseStep(chapters, completedRoute);
      const step = chapters.flatMap(chapter => chapter.steps).find(item => item.id === value);
      if (!step || (step !== current && !completedRoute.has(value))) break;
      if (step.kind === "exam") {
        const blocks = examBlocks(questions);
        start(blocks.flatMap(entries => entries[0]), step.title, blocks, step);
      } else {
        const items = step.kind === "review" ? reviewCourseQuestions(step.items, progress.answers) : step.items;
        start(items, step.title, null, step);
      }
      break;
    }
    case "mistakes": start(shuffled(errors()).slice(0, 10), "Работа над ошибками"); break;
    case "due": if (billing.active) start(questions.filter(q => progress.answers[q.id]?.due <= Date.now()).sort((a,b) => progress.answers[a.id].due - progress.answers[b.id].due).slice(0, 10), "Повторение по расписанию"); break;
    case "weak": {
      if (!billing.active) break;
      const ranking = topics.map(name => topicStats(name)).sort(
        (a, b) => a.mastered / a.items.length - b.mastered / b.items.length);
      const weak = [...new Set(ranking.slice(0, 3).flatMap(entry => entry.items))];
      start(prioritized(weak).slice(0, 10), "Слабые темы");
      break;
    }
    case "exam": {
      const blocks = examBlocks(questions);
      start(blocks.flatMap(entries => entries[0]), "Пробный экзамен", blocks);
      break;
    }
    case "choose":
      if (page !== "study" || (!session.blocks && session.picked >= 0)) break;
      session.picked = Number(value);
      renderQuestion();
      document.querySelector(session.blocks ? '.answer.selected' : '#answer-explanation')?.focus();
      break;
    case "review-filter":
      if (page !== "result") break;
      for (const control of app.querySelectorAll(".review-filters button")) {
        control.setAttribute("aria-pressed", String(control === target));
      }
      for (const row of app.querySelectorAll(".review-item")) {
        row.hidden = value === "missed" && row.dataset.correct === "true";
      }
      break;
    case "next": if (page === "study") advance(); break;
    case "buy": if (page === "pro") void buy(target); break;
  }
});
document.addEventListener("change", event => {
  if (page !== "home" || event.target.id !== "chapter-select") return;
  chapterView = event.target.value;
  render();
  document.querySelector("#chapter-select")?.focus();
});
document.addEventListener("submit", event => {
  if (event.target.id !== "exam-date" || !billing.active) return;
  event.preventDefault();
  progress.examDate = document.querySelector("#date").value;
  save();
  render();
});
async function init() {
  try {
    if (offlineData) {
      questions = offlineData.questions;
    } else {
      const response = await fetch("./data/tickets.json");
      if (!response.ok) throw new Error("Tickets");
      questions = await response.json();
    }
    byId = new Map(questions.map(q => [q.id, q]));
    chapters = buildCourse(questions);
    topics = [...new Set(questions.flatMap(q => q.topics))].sort((a, b) => a.localeCompare(b, "ru"));
    if (!config.siteOnly) {
      void api("status").then(result => { billing = result; if (page !== "study") render(); }).catch(() => {});
    }
    navigate("home");
  } catch {
    app.innerHTML = panel("Билеты не загрузились", '<p>Обновите страницу, чтобы повторить загрузку.</p>');
  }
}
void init();