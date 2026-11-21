import {config} from "./config.js";
import {buildCourse, courseTopics, currentCourseStep, restoreCourseCompletions, reviewCourseQuestions} from "./course.js";
import {lessonNote} from "./lesson-notes.js";
import {DAY, shuffled, examBlocks, extraQuestions, localDay, streak, studyActivity} from "./study.js";

const app = document.querySelector("#app");
const offlineData = globalThis.PDD_OFFLINE_DATA;
const telegram = globalThis.Telegram?.WebApp;
telegram?.ready();
telegram?.expand();
const progressKey = "pdd-progress-v1";
let progress = {answers: {}, days: [], examDate: "", routeDone: [], savedQuestions: [], examHistory: [], dailyTarget: 10};
try { progress = {...progress, ...JSON.parse(localStorage.getItem(progressKey))}; } catch {}
let completedRoute = new Set(Array.isArray(progress.routeDone) ? progress.routeDone : []);
if (!Array.isArray(progress.days)) progress.days = [];
const examHistoryLimit = 10;
progress.examHistory = Array.isArray(progress.examHistory) ? progress.examHistory.filter(attempt =>
  Number.isFinite(attempt?.at) && attempt.at > 0 && attempt.at < 8640000000000000 &&
  Number.isInteger(attempt.correct) && attempt.correct >= 0 && Number.isInteger(attempt.total) &&
  attempt.total >= 20 && attempt.correct <= attempt.total && typeof attempt.passed === "boolean"
).slice(0, examHistoryLimit) : [];
const savedQuestions = new Set(Array.isArray(progress.savedQuestions) ? progress.savedQuestions : []);
const save = () => {
  try { localStorage.setItem(progressKey, JSON.stringify(progress)); } catch {}
};
let questions = [], topics = [], byId = new Map();
const byTicket = new Map();
const byTopic = new Map();
const dailyTargets = [5, 10, 20];
if (!dailyTargets.includes(progress.dailyTarget)) progress.dailyTarget = 10;
let topicMistakesOnly = false;
let chapters = [], chapterView = null;
let page = "home", session, previousPage, ticker;
let billing = {active: false, enabled: false, price: 199};

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
  const items = byTopic.get(name) ?? [];
  const mastered = items.filter(q => progress.answers[q.id] && !progress.answers[q.id].wrong).length;
  const wrong = items.filter(q => progress.answers[q.id]?.wrong === true).length;
  return {items, mastered, wrong};
}
const routeOffsets = [36, 54, 68, 54, 36, 24];
const ordinal = number => String(number).padStart(2, "0");
const flameIcon = '<i class="flame" aria-hidden="true"></i>';
const savedCount = () => [...savedQuestions].filter(id => byId.has(id)).length;
const courseScene = '<svg class="course-scene" viewBox="0 0 264 160" aria-hidden="true" focusable="false">' +
  '<path class="scene-edge" d="M265 -5H168Q150 -5 136 9L73 72Q48 97 73 121L119 168"/>' +
  '<path class="scene-center" d="M265 20H175Q161 20 150 31L91 89Q80 100 91 111L147 168"/>' +
  '<path class="scene-edge" d="M265 45H183Q174 45 166 53L112 107 174 169"/></svg>';

function routeConnector(from, to, completed) {
  return '<svg class="course-connector' + (completed ? ' is-travelled' : '') +
    '" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
    '<path d="M' + from + ' 0 C' + from + ' 43 ' + to + ' 57 ' + to +
    ' 100" vector-effect="non-scaling-stroke"/></svg>';
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
    const lesson = step.kind === "lesson";
    const title = lesson ? "Урок " + (++lessonNumber) : step.title;
    const info = lesson ? step.title : step.kind === "review" ? "Вопросы из последних уроков" : "20 вопросов · 20 минут";
    const label = lesson ? title + ". " + step.title : title;
    const symbol = completed ? "✓" : active ? '<i class="course-play"></i>' :
      lesson ? ordinal(lessonNumber) : step.kind === "review" ? "↻" : "⚑";
    const node = '<span class="course-track" aria-hidden="true"><span class="course-disc">' + symbol +
      '</span></span><span class="course-caption"><strong>' + escape(title) +
      '</strong><span class="course-detail">' + escape(info) + '</span></span>';
    return '<li class="course-entry" style="--node-left:' + offset + '%">' +
      (i < chapter.steps.length - 1 ? routeConnector(offset, nextOffset, completed) : '') +
      '<button class="course-node ' + (active ? "is-current" : completed ? "is-complete" : "is-locked") +
      '" data-action="course-step" data-value="' + escape(step.id) + '"' +
      (active ? ' aria-current="step"' : '') + (locked ? ' disabled aria-label="' + escape(label + " — этап закрыт") + '"' : '') +
      (completed ? ' aria-label="' + escape(label + " — пройдено") + '"' : '') +
      '>' + node + '</button></li>';
  }).join("");
  const nextStep = current.step;
  const resume = nextStep ? '<div class="route-resume" data-chapter="' + escape(current.chapter.id) +
    '"><div class="resume-copy"><span>Текущий этап</span><strong>' +
    escape(nextStep.title) + '</strong><small>' +
    escape(chapter !== current.chapter ? current.chapter.title : nextStep.kind === "exam" ? "20 вопросов · 20 минут" :
      nextStep.kind === "review" ? "Вопросы из последних уроков" : "Вопросов: " + nextStep.items.length) +
    '</small></div>' + button(nextStep.kind === "exam" ? "К экзамену" : nextStep.kind === "review" ? "Повторить" :
      completedRoute.size ? "Продолжить" : "Начать урок", "course-step", nextStep.id, "primary") +
    '</div>' : '<p class="course-finished" role="status">Маршрут пройден</p>';
  const select = '<label class="course-select"><span>Раздел курса</span><select id="chapter-select">' +
    chapters.map((item, i) => '<option value="' + item.id + '"' + (item === chapter ? ' selected' : '') +
      '>' + (i + 1) + '. ' + escape(item.title) + '</option>').join("") + '</select></label>';
  app.innerHTML = '<div class="course-layout"><section class="course-map" data-chapter="' + escape(chapter.id) +
    '" aria-labelledby="course-title"><div class="course-head">' + courseScene +
    '<p class="course-kicker">Раздел ' + ordinal(index + 1) + ' / ' + ordinal(chapters.length) +
    '</p><h1 id="course-title">' + escape(chapter.title) + '</h1>' +
    '<div class="course-meter"><progress value="' + completedLessons + '" max="' + lessons.length +
    '" aria-label="Уроков пройдено в разделе"></progress><span>' + completedLessons + ' из ' + lessons.length +
    ' уроков</span></div></div>' + resume +
    '<div class="course-shortcuts" aria-label="Быстрая практика">' +
    '<button data-page="topics"><strong>Темы ПДД</strong><span>Тренировка по темам</span></button>' +
    '<button data-page="saved"><strong>Сохранённое</strong><span>Вопросов: ' + savedCount() + '</span></button></div>' +
    '<div class="course-tools">' + select +
    (nextStep ? button("К этапу", "course-current", "", "secondary") : "") + '</div>' +
    '<ol class="course-steps" aria-label="Этапы раздела">' + route + '</ol></section>' +
    '<aside class="course-sidebar" aria-label="Прогресс и практика"><section class="dashboard-card"><h2>Прогресс</h2>' +
    '<div class="metrics">' + stat("Вопросов", Object.keys(progress.answers).filter(id => byId.has(id)).length + " / " + questions.length) +
    stat("Дней подряд", streak(progress.days)) + '</div></section>' +
    '<section class="dashboard-card"><h2>Практика</h2>' +
    '<button class="card practice-link" data-page="tickets"><strong>Все билеты</strong><small>40 билетов · 800 вопросов</small></button>' +
    '<button class="card practice-link" data-page="topics"><strong>Темы ПДД</strong><small>Короткие тренировки по темам</small></button>' +
    '<button class="card practice-link" data-page="exam"><strong>Пробный экзамен</strong><small>20 вопросов · 20 минут</small></button>' +
    '</section></aside></div>';
}
function revealScreen() {
  app.firstElementChild?.classList.add("screen-enter");
}

function navigate(destination) {
  if (!questions.length) return;
  if (page === "study" && destination !== "study" && !confirm("Завершить текущее занятие?")) return;
  clearInterval(ticker);
  page = destination;
  if (page === "home") chapterView = null;
  const activePage = page === "study" ? previousPage : page;
  const navPage = activePage === "saved" ? "profile" : activePage === "topics" ? "tickets" :
    activePage === "exam-history" ? "exam" : activePage;
  for (const link of document.querySelectorAll("nav [data-page]")) {
    if (link.dataset.page === navPage) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  render();
  revealScreen();
  window.scrollTo(0, 0);
}

const shortWeekday = new Intl.DateTimeFormat("ru-RU", {weekday: "short"});
const longDate = new Intl.DateTimeFormat("ru-RU", {day: "numeric", month: "long", weekday: "long"});
const attemptDate = new Intl.DateTimeFormat("ru-RU", {day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"});

function updateStreakBadge() {
  const badge = document.querySelector("#streak-badge");
  if (!badge) return;
  const count = streak(progress.days);
  badge.classList.toggle("is-lit", progress.days.includes(localDay()));
  badge.querySelector("#streak-count").textContent = String(count);
  badge.setAttribute("aria-label", "Огоньки и прогресс. Дней подряд: " + count);
}

function bookmarkLabel(question) {
  return savedQuestions.has(question.id) ? "Убрать из сохранённых" : "Сохранить вопрос";
}

function bookmarkButton(question) {
  const saved = savedQuestions.has(question.id);
  return '<button class="secondary bookmark" data-action="bookmark" data-value="' + escape(question.id) +
    '" aria-pressed="' + saved + '">' + bookmarkLabel(question) + '</button>';
}

function renderSavedQuestions() {
  const items = [...savedQuestions].map(id => byId.get(id)).filter(Boolean).reverse();
  const rows = items.map(q => '<article class="saved-row"><button class="saved-question" data-action="saved-one" data-value="' +
    escape(q.id) + '"><span>Билет ' + q.ticket + ' · Вопрос ' + q.num + '</span><strong>' +
    escape(q.text) + '</strong></button><button class="secondary saved-remove" data-action="bookmark" data-value="' +
    escape(q.id) + '" aria-label="Убрать вопрос ' + q.num + ' из билета ' + q.ticket +
    ' из сохранённых">Убрать</button></article>').join("");
  app.innerHTML = panel("Сохранённые вопросы",
    '<div class="actions saved-actions">' +
    (items.length ? button("Тренировать подборку", "saved-practice", "", "primary") : "") +
    button("К прогрессу", "navigate", "profile") + '</div>' +
    (items.length ? '<div class="saved-list">' + rows + '</div>' :
      '<p class="muted empty-saved">Сохраняй сложные вопросы во время урока или из разбора ответов. Здесь их можно повторить.</p>'));
}

function todayQuestions(day = localDay()) {
  const daily = progress.daily;
  return new Set(daily?.day === day && Array.isArray(daily.ids) ? daily.ids.filter(id => byId.has(id)) : []);
}

function renderDailyGoal() {
  const count = todayQuestions().size;
  const target = progress.dailyTarget;
  const done = count >= target;
  const choices = dailyTargets.map(value =>
    '<button class="secondary" data-action="daily-target" data-value="' + value +
    '" aria-pressed="' + (value === target) + '" aria-label="' + value + ' вопросов в день">' + value + '</button>'
  ).join("");
  return '<section class="daily-goal" aria-labelledby="daily-goal-title"><div class="daily-goal-head">' +
    '<div><h2 id="daily-goal-title">Цель на сегодня</h2><p>' + (done ? 'Цель выполнена' : 'Каждый вопрос считается один раз') +
    '</p></div><strong>' + count + ' <span>/ ' + target + '</span></strong></div>' +
    '<progress value="' + Math.min(count, target) + '" max="' + target + '" aria-label="Дневная цель"></progress>' +
    '<div class="daily-goal-controls"><span>Вопросов в день</span><div role="group" aria-label="Выбрать дневную цель">' +
    choices + '</div></div></section>';
}

function renderActivity(answered) {
  const {current, best, doneToday, week} = studyActivity(progress.days);
  const days = week.map(({date, key, done, today}) =>
    '<li class="streak-day' + (done ? ' is-lit' : '') + (today ? ' is-today' : '') + '"' +
    (today ? ' aria-current="date"' : '') + ' aria-label="' +
    escape(longDate.format(date) + (done ? ", зачтено" : today ? ", тренировка ещё впереди" : ", пропуск")) +
    '"><span class="weekday" aria-hidden="true">' + escape(shortWeekday.format(date)) + '</span>' +
    '<span class="week-flame" aria-hidden="true">' + (done ? flameIcon : '·') +
    '</span><time datetime="' + key + '" aria-hidden="true">' + date.getDate() + '</time></li>'
  ).join("");
  app.innerHTML = panel("Мой прогресс", renderDailyGoal() +
    '<section class="streak-panel"><div class="streak-panel-head"><div><h2>Серия тренировок</h2>' +
    '<p>' + (doneToday ? "Огонёк за сегодня зажжён." : "Заверши тренировку, чтобы зажечь огонёк.") + '</p></div>' +
    '<span class="streak-emblem' + (doneToday ? ' is-lit' : '') +
    '" aria-hidden="true">' + flameIcon + '</span></div><div class="streak-totals">' +
    stat("Дней подряд", current) + stat("Лучшая серия", best) +
    '</div><ol class="streak-calendar" aria-label="Последние семь дней">' + days +
    '</ol><p class="streak-rule">Огонёк за день даёт пройденный этап маршрута, тренировка от пяти вопросов или сданный экзамен.</p></section>' +
    '<div class="metrics profile-metrics">' + stat("Вопросов решено", answered) +
    stat("Ошибок к повторению", errors().length) + '</div><button class="card saved-shortcut" data-page="saved">' +
    '<strong>Сохранённые вопросы</strong><span aria-label="Всего сохранено">' +
    savedCount() + '</span></button><div class="actions">' +
    button("На маршрут", "navigate", "home", "primary") +
    button("Повторить ошибки", "mistakes", "", "secondary", !errors().length) +
    (billing.active ? button("Повторение по расписанию", "due") : button("Возможности Pro", "navigate", "pro")) + '</div>');
}

function practiceTabs(active) {
  return '<div class="practice-tabs" role="group" aria-label="Раздел практики">' +
    [["tickets", "По билетам"], ["topics", "По темам"]].map(([destination, title]) =>
      '<button data-page="' + destination + '" data-practice-switch="true"' + (active === destination ? ' aria-current="page"' : '') +
      '>' + title + '</button>').join("") + '</div>';
}

function renderTickets() {
  const entries = [...byTicket.keys()].sort((a, b) => a - b).map(ticket => {
    const items = byTicket.get(ticket);
    const correct = items.filter(q => progress.answers[q.id]?.wrong === false).length;
    return {ticket, correct, total: items.length};
  });
  const complete = entries.filter(({correct, total}) => correct === total).length;
  const sections = [];
  for (let start = 0; start < entries.length; start += 10) {
    const group = entries.slice(start, start + 10);
    const range = ordinal(group[0].ticket) + '–' + ordinal(group[group.length - 1].ticket);
    const buttons = group.map(({ticket, correct, total}) => {
      const state = correct === total ? ' ticket-complete' : correct ? ' ticket-in-progress' : '';
      return '<li><button class="ticket-card' + state + '" data-action="ticket" data-value="' + ticket +
        '" aria-label="Билет ' + ticket + '. Верных ответов: ' + correct + ' из ' + total + '">' +
        '<span class="ticket-number">' + ordinal(ticket) + '</span>' +
        '<span class="ticket-progress">' + correct + '/' + total + '</span>' +
        '<span class="mini-track" aria-hidden="true"><i style="width:' + (100 * correct / total) + '%"></i></span></button></li>';
    }).join("");
    sections.push('<section class="ticket-group" aria-labelledby="ticket-group-' + start + '"><h2 id="ticket-group-' + start +
      '">Билеты ' + range + '</h2><ul class="ticket-grid">' + buttons + '</ul></section>');
  }
  app.innerHTML = '<section class="ticket-index" aria-labelledby="ticket-title"><header class="ticket-head">' +
    '<div><p class="eyebrow">Категории А и В</p><h1 id="ticket-title">Билеты ПДД</h1></div>' +
    '<p class="ticket-head-progress"><strong>' + complete + '<span> / ' + entries.length +
    '</span></strong><span>Решено</span></p></header>' +
    practiceTabs("tickets") + '<p class="ticket-legend">Здесь учитываются ответы из билетов, уроков и экзамена.</p>' + sections.join("") + '</section>';
}

function renderTopics() {
  const mapped = new Set(courseTopics.flatMap(([, , entries]) => entries.map(([name]) => name)));
  const groups = [...courseTopics, ["other", "Другие темы", topics.filter(name => !mapped.has(name)).map(name => [name, name])]];
  const sections = groups.map(([id, title, entries]) => {
    const rows = entries.map(([name, label]) => {
      const {items, mastered, wrong} = topicStats(name);
      if (!items.length || (topicMistakesOnly && !wrong)) return "";
      const info = topicMistakesOnly ? 'Ошибок к повторению: ' + wrong : 'Верно: ' + mastered + ' из ' + items.length;
      return '<li><button class="topic-card" data-action="topic" data-value="' + topics.indexOf(name) + '">' +
        '<strong>' + escape(label) + '</strong><span>' + info + '</span></button></li>';
    }).join("");
    return rows ? '<section class="topic-group" data-chapter="' + id + '"><h2>' + title + '</h2>' +
      '<ul>' + rows + '</ul></section>' : "";
  }).join("");
  app.innerHTML = '<section class="ticket-index" aria-labelledby="topic-title"><header class="ticket-head">' +
    '<div><p class="eyebrow">Тренировки</p><h1 id="topic-title">Темы ПДД</h1></div></header>' + practiceTabs("topics") +
    '<aside class="mixed-practice"><div><strong>Быстрая тренировка</strong><p>5 вопросов по всему курсу. Сначала ошибки.</p></div>' +
    button("Начать", "mixed-practice", "", "primary") + '</aside>' +
    '<div class="topic-toolbar"><p>' + (topicMistakesOnly ? 'До 5 вопросов с ошибками.' : 'До 5 вопросов на выбранную тему.') +
    '</p><button class="secondary" data-action="topic-filter" aria-pressed="' + topicMistakesOnly +
    '">Только ошибки</button></div>' + (sections ? '<div class="topic-catalog">' + sections + '</div>' :
      '<p class="muted">Пока нет ошибок для повторения.</p>') + '</section>';
}

function renderExam() {
  app.innerHTML = '<section class="exam-start narrow" aria-labelledby="exam-title">' +
    '<header class="exam-start-head"><div class="exam-intro"><h1 id="exam-title">Пробный экзамен</h1>' +
    '<p><strong>20 вопросов</strong> за 20 минут. Разбор после экзамена.</p></div>' +
    '<div class="exam-dial" aria-hidden="true"><span>20:00</span></div></header>' +
    '<div class="exam-start-body"><div class="exam-start-actions">' +
    button("Начать экзамен", "exam", "", "primary") +
    button("История попыток", "navigate", "exam-history") + '<p>Таймер запустится сразу после нажатия.</p></div>' +
    '<h2>Как засчитывается экзамен</h2><dl class="exam-rules">' +
    '<div><dt>Одна ошибка</dt><dd>Пять дополнительных вопросов и пять минут.</dd></div>' +
    '<div><dt>Две ошибки</dt><dd>Если ошибки в разных блоках, добавятся 10 вопросов и 10 минут.</dd></div>' +
    '<div><dt>Экзамен не сдан</dt><dd>Если вышло время, допущены три ошибки, две в одном блоке или любая ошибка в дополнительных вопросах.</dd></div>' +
    '</dl></div></section>';
}

function renderExamHistory() {
  const attempts = progress.examHistory;
  const passed = attempts.filter(entry => entry.passed).length;
  const rows = attempts.map(entry => {
    const date = new Date(entry.at);
    const status = entry.passed ? "Сдан" : entry.timeout ? "Время вышло" : "Не сдан";
    return '<li class="exam-attempt"><div><strong class="exam-attempt-status' + (entry.passed ? ' is-passed' : '') + '">' +
      status + '</strong><time datetime="' + date.toISOString() + '">' + escape(attemptDate.format(date)) +
      '</time></div><span class="exam-attempt-score" aria-label="' + entry.correct + ' из ' + entry.total + ' верно">' +
      entry.correct + ' / ' + entry.total + '</span></li>';
  }).join("");
  app.innerHTML = panel("История экзаменов", '<div class="actions exam-history-actions">' +
    button("К экзамену", "navigate", "exam", "primary") + '</div>' +
    (attempts.length ? '<p class="exam-history-summary">Сдано из последних попыток <strong>' + passed + ' из ' + attempts.length +
      '</strong></p><ul class="exam-history-list">' + rows + '</ul>' :
      '<p class="muted">Здесь появятся результаты завершённых экзаменов.</p>'));
}

function render() {
  updateStreakBadge();
  const answered = Object.keys(progress.answers).filter(id => byId.has(id)).length;
  if (page === "home") renderCourse();
  if (page === "tickets") renderTickets();
  if (page === "topics") renderTopics();
  if (page === "exam") renderExam();
  if (page === "exam-history") renderExamHistory();
  if (page === "profile") renderActivity(answered);
  if (page === "saved") renderSavedQuestions();
  if (page === "pro") {
    const date = progress.examDate;
    const daysLeft = date ? Math.max(0, Math.round((Date.parse(date) - Date.parse(localDay())) / DAY)) : 0;
    const remaining = questions.filter(q => !progress.answers[q.id] || progress.answers[q.id].wrong).length;
    const priority = topics.map(name => ({ name, ...topicStats(name) }))
      .sort((a,b) => a.mastered / a.items.length - b.mastered / b.items.length).slice(0,3);
    app.innerHTML = panel("Маршрут Pro",
      '<p>План до экзамена, тренировка слабых тем и повторение по расписанию.</p>' +
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
  session = {items, title, blocks, routeStep, answers: [], choiceOrders: [], picked: -1, deadline: Date.now() + 20 * 60000, extra: false, passed: false};
  navigate("study");
  if (blocks) ticker = setInterval(updateTimer, 250);
}
function updateTimer() {
  if (page !== "study" || !session?.blocks) return;
  const seconds = Math.max(0, Math.ceil((session.deadline - Date.now()) / 1000));
  const clock = document.querySelector("#clock");
  if (clock) {
    clock.textContent = Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
    clock.classList.toggle("is-urgent", seconds <= 60);
  }
  if (!seconds) { session.timeout = true; finish(); }
}
function record(q, selected) {
  const right = selected === q.correct;
  const prior = progress.answers[q.id];
  const level = right ? Math.min((prior?.level ?? 0) + 1, 4) : 0;
  progress.answers[q.id] = {wrong: !right, level, due: Date.now() + [1, 1, 3, 7, 14][level] * DAY};
  const day = localDay();
  const touchedToday = todayQuestions(day);
  touchedToday.add(q.id);
  progress.daily = {day, ids: [...touchedToday]};
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
  const order = session.choiceOrders[n] ??= shuffled(q.choices.keys());
  const options = order.map((i, position) => {
    const correctOption = show && i === q.correct;
    const incorrectPick = show && picked === i && !correctOption;
    const variant = correctOption ? " right" : incorrectPick ? " wrong" : picked === i ? " selected" : "";
    return '<button class="answer' + variant + '" data-action="choose" data-value="' + i +
      '" aria-pressed="' + (picked === i) + '"' + (show ? " disabled" : "") +
      '><span class="answer-letter" aria-hidden="true">' + "АБВГД"[position] + '</span><span>' +
      escape(q.choices[i]) + (correctOption || incorrectPick ? '<span class="answer-state">' +
      (correctOption ? "Правильный ответ" : "Ваш ответ") + '</span>' : '') + '</span></button>';
  }).join("");
  const mode = blocks ? (extra ? "Дополнительный блок" : "Экзамен") : session.title;
  const answeredCount = n + (show ? 1 : 0);
  const shortPractice = !blocks && items.length <= 5;
  const indicators = shortPractice ? items.map((question, index) => {
    const choice = index === n && show ? picked : answers[index]?.selected;
    const state = choice === undefined ? (index === n ? "is-active" : "") :
      choice === question.correct ? "is-right" : "is-wrong";
    return '<i class="' + state + '"></i>';
  }).join("") : '<i style="width:' + (100 * answeredCount / items.length) + '%"></i>';
  app.innerHTML = '<section class="panel narrow question-panel"><div class="question-top">' +
    '<div class="question-header"><strong>' + escape(mode) + '</strong><span class="question-counter">Вопрос ' +
    (n + 1) + ' из ' + items.length +
    (blocks ? ' <strong id="clock" class="time-chip" aria-label="Осталось времени"></strong>' : '') +
    '</span></div><div class="bar' + (shortPractice ? ' is-segmented' : '') +
    '" role="progressbar" aria-label="Прогресс занятия" aria-valuemin="0" aria-valuemax="' + items.length +
    '" aria-valuenow="' + answeredCount + '">' + indicators + '</div></div>' +
    '<div class="question-body">' +
    (blocks ? "" : '<div class="question-bookmark"><span>Билет ' + q.ticket + ' · № ' + q.num + '</span>' + bookmarkButton(q) + '</div>') +
    (note ? '<p class="lesson-note">' + escape(note) + '</p>' : '') +
    '<h2 id="question-title" tabindex="-1">' + escape(q.text) + '</h2>' + questionImage(q) +
    '<div class="answers">' + options + '</div>' +
    (show ? '<section id="answer-explanation" class="explanation-panel ' + (right ? 'is-right' : 'is-wrong') +
      '" tabindex="-1" aria-label="Разбор ответа"><div class="explanation-heading"><span aria-hidden="true">' +
      (right ? '✓' : '↳') + '</span><strong>' + (right ? 'Верно' : 'Неверно') +
      '</strong></div>' + answerExplanation(q) + '</section>' : '') +
    '<div class="actions question-actions">' +
    (blocks || show ? button(blocks ? "Подтвердить ответ" : "Продолжить", "next", "", "primary", picked < 0) : '') +
    '</div></div></section>';
  if (blocks) updateTimer();
}
function showNextQuestion() {
  renderQuestion();
  revealScreen();
  window.scrollTo(0, 0);
  document.querySelector("#question-title")?.focus({preventScroll: true});
}

function advance() {
  if (session.picked < 0) return;
  if (session.blocks && Date.now() >= session.deadline) { session.timeout = true; finish(); return; }
  const q = session.items[session.answers.length];
  session.answers.push({q, selected: session.picked});
  record(q, session.picked);
  session.picked = -1;
  if (session.answers.length < session.items.length) {
    showNextQuestion();
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
  showNextQuestion();
}
function finish() {
  if (page !== "study") return;
  if (!session.blocks) {
    session.passed = session.answers.length === session.items.length &&
      session.answers.every(({q, selected}) => selected === q.correct);
  }
  const qualifiesForStreak = session.blocks || session.routeStep ? session.passed :
    session.items.length >= 5 && session.answers.length === session.items.length;
  const date = localDay();
  if (qualifiesForStreak && !progress.days.includes(date)) {
    progress.days.push(date);
    session.ignited = true;
  }
  if (session.routeStep && session.passed) {
    completedRoute.add(session.routeStep.id);
    progress.routeDone = [...completedRoute];
  }
  if (session.blocks) {
    progress.examHistory.unshift({
      at: Date.now(), correct: session.answers.filter(({q, selected}) => selected === q.correct).length,
      total: session.items.length, passed: session.passed, timeout: Boolean(session.timeout)
    });
    progress.examHistory.length = Math.min(progress.examHistory.length, examHistoryLimit);
  }
  save();
  updateStreakBadge();
  page = "result";
  clearInterval(ticker);
  renderResult();
  revealScreen();
  window.scrollTo(0, 0);
}
function renderResult() {
  const correct = session.answers.filter(({q, selected}) => selected === q.correct).length;
  const errorsCount = session.answers.length - correct;
  const unanswered = session.items.length - session.answers.length;
  let title = "Занятие завершено";
  if (session.blocks) title = session.passed ? "Экзамен сдан" : "Экзамен не сдан";
  const routeTraining = Boolean(session.routeStep && !session.blocks);
  const retry = routeTraining && !session.passed;
  const failed = (session.blocks || routeTraining) && !session.passed;
  if (routeTraining) {
    title = session.passed ?
      (session.routeStep.kind === "review" ? "Повторение пройдено" : "Урок пройден") :
      "Есть ошибки";
  }
  const message = retry && !completedRoute.has(session.routeStep.id) ?
    "Ответь правильно на все вопросы, чтобы открыть следующий этап." :
    session.timeout ? "Время вышло" : session.title;
  const leaveLabel = session.routeStep ? "К маршруту" : previousPage === "tickets" ? "К билетам" : previousPage === "topics" ? "К темам" :
    session.blocks ? "К экзамену" : "Продолжить обучение";
  const leaveAction = session.routeStep ? "course-current" : "navigate";
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
      escape(q.choices[q.correct]) + '</p></div>' + answerExplanation(q) +
      '<div class="review-bookmark">' + bookmarkButton(q) + '</div></div></details>';
  }).join("");
  app.innerHTML = '<section class="panel narrow result-panel"><div class="result-top"><div><h1>' + escape(title) +
    '</h1><p>' + escape(message) +
    '</p></div><div class="score' + (failed ? ' is-failed' : '') + '"><strong>' + correct + ' / ' + session.items.length +
    '</strong><span>Верных ответов</span></div></div>' +
    '<div class="result-body">' + (session.ignited ?
      '<p class="streak-earned" role="status">' + flameIcon + ' Огонёк за сегодня зажжён</p>' : '') +
    '<div class="actions result-actions">' +
    (retry ? button("Повторить этап", "retry-stage", "", "primary") : "") +
    button(leaveLabel, leaveAction, previousPage, retry ? "secondary" : "primary") +
    (session.blocks ? button("История попыток", "navigate", "exam-history") : "") +
    (!retry && errorsCount ? button("Повторить ошибки", "mistakes") : "") + '</div>' +
    '<div class="review-header"><h2>Разбор ответов</h2>' +
    (errorsCount + unanswered > 0 ? '<div class="review-filters" role="group" aria-label="Показать ответы">' +
      '<button data-action="review-filter" data-value="all" aria-pressed="true">Все</button>' +
      '<button data-action="review-filter" data-value="missed" aria-pressed="false">' + (unanswered ? 'Ошибки и пропуски' : 'Ошибки') + '</button></div>' : '') +
    '</div><div class="review">' + rows + '</div></div></section>';
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
  if (target.dataset.page) {
    navigate(target.dataset.page);
    if (target.dataset.practiceSwitch === "true") app.querySelector('.practice-tabs [aria-current="page"]')?.focus({preventScroll: true});
    return;
  }
  const {action, value} = target.dataset;
  switch (action) {
    case "navigate": navigate(value); break;
    case "ticket": start(byTicket.get(Number(value)) ?? [], "Билет " + value); break;
    case "topic": {
      const name = topics[Number(value)];
      const {items} = topicStats(name);
      const pool = page === "topics" && topicMistakesOnly ? items.filter(q => progress.answers[q.id]?.wrong === true) : items;
      start(prioritized(pool).slice(0, 5), name);
      break;
    }
    case "mixed-practice":
      if (page === "topics") start(prioritized(questions).slice(0, 5), "Быстрая тренировка");
      break;
    case "topic-filter":
      if (page !== "topics") break;
      topicMistakesOnly = !topicMistakesOnly;
      renderTopics();
      app.querySelector('[data-action="topic-filter"]')?.focus({preventScroll: true});
      break;
    case "daily-target": {
      const target = Number(value);
      if (page !== "profile" || !dailyTargets.includes(target)) break;
      progress.dailyTarget = target;
      save();
      render();
      app.querySelector('[data-action="daily-target"][aria-pressed="true"]')?.focus({preventScroll: true});
      break;
    }
    case "course-current": {
      if (page !== "home") navigate("home");
      else {
        chapterView = null;
        render();
      }
      const currentNode = app.querySelector?.('[aria-current="step"]');
      currentNode?.focus({preventScroll: true});
      currentNode?.scrollIntoView({block: "center"});
      break;
    }
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
    case "retry-stage":
      if (page === "result" && session.routeStep && !session.blocks && !session.passed) {
        start(session.items, session.title, null, session.routeStep);
      }
      break;
    case "bookmark": {
      const question = byId.get(value);
      if (!question) break;
      if (savedQuestions.has(value)) savedQuestions.delete(value);
      else savedQuestions.add(value);
      progress.savedQuestions = [...savedQuestions];
      save();
      if (page === "saved") {
        render();
        app.querySelector?.(".saved-question, .saved-actions button")?.focus();
      } else {
        target.setAttribute("aria-pressed", String(savedQuestions.has(value)));
        target.textContent = bookmarkLabel(question);
      }
      break;
    }
    case "saved-one": {
      const question = byId.get(value);
      if (question && savedQuestions.has(value)) start([question], "Сохранённый вопрос");
      break;
    }
    case "saved-practice":
      start(prioritized([...savedQuestions].map(id => byId.get(id)).filter(Boolean)).slice(0, 10), "Сохранённые вопросы");
      break;
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
  revealScreen();
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
    for (const question of questions) {
      if (!byTicket.has(question.ticket)) byTicket.set(question.ticket, []);
      byTicket.get(question.ticket).push(question);
      for (const topic of new Set(question.topics)) {
        if (!byTopic.has(topic)) byTopic.set(topic, []);
        byTopic.get(topic).push(question);
      }
    }
    chapters = buildCourse(questions);
    if (progress.routePassVersion !== 1) {
      completedRoute = restoreCourseCompletions(chapters, completedRoute, progress.answers);
      progress.routeDone = [...completedRoute];
      progress.routePassVersion = 1;
      save();
    }
    topics = [...byTopic.keys()].sort((a, b) => a.localeCompare(b, "ru"));
    if (!config.siteOnly) {
      void api("status").then(result => { billing = result; if (page !== "study") render(); }).catch(() => {});
    }
    navigate("home");
  } catch {
    app.innerHTML = panel("Билеты не загрузились", '<p>Обновите страницу, чтобы повторить загрузку.</p>');
  }
}
void init();
