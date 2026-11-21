import {config} from "./config.js";
import {buildCourse, courseTopics, currentCourseStep, restoreCourseCompletions, reviewCourseQuestions} from "./course.js";
import {lessonNote} from "./lesson-notes.js";
import {DAY, shuffled, examBlocks, extraQuestions, localDay, streak, studyActivity, practiceWeek, retainPracticeDays} from "./study.js";

const app = document.querySelector("#app");
const chapterPicker = document.querySelector("#chapter-picker");
const illustrationViewer = document.querySelector("#illustration-viewer");
let chapterPickerTrigger = null;
let illustrationTrigger = null;
if (globalThis.history && "scrollRestoration" in history) history.scrollRestoration = "manual";
const offlineData = globalThis.PDD_OFFLINE_DATA;
const telegram = globalThis.Telegram?.WebApp;
telegram?.ready();
telegram?.expand();
const progressKey = "pdd-progress-v1";
let progress = {answers: {}, days: [], examDate: "", routeDone: [], savedQuestions: [], examHistory: [],
  dailyTarget: 10, practiceTotals: {}, practiceSince: "", practiceDraft: null};
try { progress = {...progress, ...JSON.parse(localStorage.getItem(progressKey))}; } catch {}
let completedRoute = new Set(Array.isArray(progress.routeDone) ? progress.routeDone : []);
if (!Array.isArray(progress.days)) progress.days = [];
if (!progress.practiceTotals || typeof progress.practiceTotals !== "object") progress.practiceTotals = {};
if (!/^\d{4}-\d{2}-\d{2}$/.test(progress.practiceSince)) progress.practiceSince = "";
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
const savedPageSize = 24;
const savedView = {query: "", wrongOnly: false, limit: savedPageSize};
let topicMistakesOnly = false;
let practiceDay = "";
let chapters = [], chapterView = null;
let page = "home", session, previousPage, ticker;
let examReviewEntry = null;
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
const flameIcon = '<svg class="flame" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#streak-flame"/></svg>';
const savedCount = () => [...savedQuestions].filter(id => byId.has(id)).length;
const courseScene = '<svg class="course-scene" viewBox="0 0 264 160" aria-hidden="true" focusable="false">' +
  '<path class="scene-edge" d="M265 -5H168Q150 -5 136 9L73 72Q48 97 73 121L119 168"/>' +
  '<path class="scene-center" d="M265 20H175Q161 20 150 31L91 89Q80 100 91 111L147 168"/>' +
  '<path class="scene-edge" d="M265 45H183Q174 45 166 53L112 107 174 169"/></svg>';
const playIcon = '<svg class="course-play" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M9 5.6c-.8-.5-1.8.1-1.8 1v10.8c0 .9 1 1.5 1.8 1l8.8-5.4a1.2 1.2 0 0 0 0-2L9 5.6Z"/></svg>';

function routeConnector(from, to, completed) {
  return '<svg class="course-connector' + (completed ? ' is-travelled' : '') +
    '" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
    '<path d="M' + from + ' 0 C' + from + ' 43 ' + to + ' 57 ' + to +
    ' 100" vector-effect="non-scaling-stroke"/></svg>';
}

function chapterQuestions(chapter) {
  return chapter.steps.flatMap(step => step.kind === "lesson" ? step.items : []);
}

function chapterLessonCounts(chapter) {
  const lessons = chapter.steps.filter(step => step.kind === "lesson");
  return {total: lessons.length, completed: lessons.filter(step => completedRoute.has(step.id)).length};
}

function chapterPickerControl(chapter, index) {
  if (chapterPicker?.showModal) {
    return '<div class="course-select"><span>Раздел курса</span>' +
      '<button class="secondary course-picker-trigger" data-action="show-chapter-picker" data-value="' + escape(chapter.id) +
      '" aria-label="Раздел курса. Открыт раздел «' + escape(chapter.title) + '»" aria-haspopup="dialog" aria-controls="chapter-picker" aria-expanded="false">' +
      '<span>' + ordinal(index + 1) + '. ' + escape(chapter.title) + '</span><i aria-hidden="true"></i></button></div>';
  }
  return '<label class="course-select"><span>Раздел курса</span><select id="chapter-select">' +
    chapters.map((item, i) => '<option value="' + escape(item.id) + '"' + (item === chapter ? ' selected' : '') +
      '>' + (i + 1) + '. ' + escape(item.title) + '</option>').join("") + '</select></label>';
}

function openChapterPicker(trigger, selected) {
  if (!chapterPicker?.showModal || chapterPicker.open) return;
  const current = currentCourseStep(chapters, completedRoute);
  chapterPickerTrigger = trigger;
  chapterPicker.querySelector("#chapter-picker-list").innerHTML = chapters.map((chapter, index) => {
    const {total, completed} = chapterLessonCounts(chapter);
    const active = current.step && chapter === current.chapter;
    const viewed = chapter.id === selected;
    return '<li><button class="chapter-choice" data-chapter="' + escape(chapter.id) +
      '" data-action="choose-chapter" data-value="' + escape(chapter.id) + '"' + (viewed ? ' aria-current="true"' : '') + '>' +
      '<span class="chapter-choice-number">' + ordinal(index + 1) + '</span><span class="chapter-choice-body"><strong>' +
      escape(chapter.title) + '</strong><small>Уроки: ' + completed + ' из ' + total +
      (active ? ' · Текущий этап' : '') + '</small>' +
      '<span class="chapter-choice-track" aria-hidden="true"><span style="width:' + (total ? 100 * completed / total : 0) +
      '%"></span></span></span></button></li>';
  }).join("");
  trigger.setAttribute("aria-expanded", "true");
  chapterPicker.showModal();
}

function showCourseChapter(id) {
  if (!chapters.some(chapter => chapter.id === id)) return;
  chapterView = id;
  render();
  revealScreen();
  window.scrollTo(0, 0);
  document.querySelector('[data-action="show-chapter-picker"], #chapter-select')?.focus({preventScroll: true});
}

chapterPicker?.addEventListener("close", () => {
  if (chapterPicker.open) return;
  if (chapterPickerTrigger?.isConnected) {
    chapterPickerTrigger.setAttribute("aria-expanded", "false");
    chapterPickerTrigger.focus({preventScroll: true});
  }
  chapterPickerTrigger = null;
});

function renderCourse() {
  const current = currentCourseStep(chapters, completedRoute);
  const chapter = chapters.find(item => item.id === chapterView) ?? current.chapter;
  const {total, completed: completedLessons} = chapterLessonCounts(chapter);
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
    const symbol = completed ? "✓" : active ? playIcon :
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
  const draft = restorePracticeDraft();
  const draftResume = draft ? '<div class="route-resume draft-resume"><div class="resume-copy"><span>Незавершённая тренировка</span>' +
    '<strong>' + escape(draft.title) + '</strong><small>Вопрос ' + (draft.answers.length + 1) + ' из ' + draft.items.length +
    '</small></div>' + button("Продолжить", "resume-practice", "", "primary") + '</div>' : '';
  const resume = draftResume || (nextStep ? '<div class="route-resume" data-chapter="' + escape(current.chapter.id) +
    '"><div class="resume-copy"><span>Текущий этап</span><strong>' +
    escape(nextStep.title) + '</strong><small>' +
    escape(chapter !== current.chapter ? current.chapter.title : nextStep.kind === "exam" ? "20 вопросов · 20 минут" :
      nextStep.kind === "review" ? "Вопросы из последних уроков" : "Вопросов: " + nextStep.items.length) +
    '</small></div>' + button(nextStep.kind === "exam" ? "К экзамену" : nextStep.kind === "review" ? "Повторить" :
      completedRoute.size ? "Продолжить" : "Начать урок", "course-step", nextStep.id, "primary") +
    '</div>' : '<p class="course-finished" role="status">Маршрут пройден</p>');
  app.innerHTML = '<div class="course-layout"><section class="course-map" data-chapter="' + escape(chapter.id) +
    '" aria-labelledby="course-title"><div class="course-head">' + courseScene +
    '<p class="course-kicker">Раздел ' + ordinal(index + 1) + ' / ' + ordinal(chapters.length) +
    '</p><h1 id="course-title">' + escape(chapter.title) + '</h1>' +
    '<div class="course-meter"><progress value="' + completedLessons + '" max="' + total +
    '" aria-label="Уроков пройдено в разделе"></progress><span>' + completedLessons + ' из ' + total +
    ' уроков</span></div></div>' + resume +
    '<div class="course-shortcuts" aria-label="Быстрая практика">' +
    '<button data-page="topics"><strong>Темы ПДД</strong><span>Тренировка по темам</span></button>' +
    '<button data-page="saved"><strong>Сохранённое</strong><span>Вопросов: ' + savedCount() + '</span></button></div>' +
    '<div class="course-tools">' + chapterPickerControl(chapter, index) +
    (nextStep ? button("К этапу", "course-current", "", "secondary") : "") + '</div>' +
    '<ol class="course-steps" aria-label="Этапы раздела">' + route + '</ol></section>' +
    '<aside class="course-sidebar" aria-label="Прогресс и практика"><section class="dashboard-card"><h2>Прогресс</h2>' +
    '<div class="metrics">' + stat("Вопросов", Object.keys(progress.answers).filter(id => byId.has(id)).length + " / " + questions.length) +
    stat("Дней подряд", streak(progress.days)) + '</div>' +
    '<button class="card practice-link" data-page="course-overview"><strong>Прогресс по разделам</strong></button></section>' +
    '<section class="dashboard-card"><h2>Практика</h2>' +
    '<button class="card practice-link" data-page="tickets"><strong>Все билеты</strong><small>40 билетов · 800 вопросов</small></button>' +
    '<button class="card practice-link" data-page="topics"><strong>Темы ПДД</strong><small>Короткие тренировки по темам</small></button>' +
    '<button class="card practice-link" data-page="exam"><strong>Пробный экзамен</strong><small>20 вопросов · 20 минут</small></button>' +
    '</section></aside></div>';
}
function revealScreen() {
  const screen = app.firstElementChild;
  const content = screen?.querySelector(".question-main") ?? screen;
  content?.classList.add("screen-enter");
}

function navigate(destination, {chapterId = null} = {}) {
  if (!questions.length) return;
  if (page === "study" && destination !== "study" &&
      !confirm(session.blocks ? "Завершить текущий экзамен?" : "Выйти из тренировки? Её можно будет продолжить.")) return;
  clearInterval(ticker);
  page = destination;
  if (page === "home") chapterView = chapterId;
  const activePage = page === "study" ? previousPage : page;
  const navPage = ["saved", "course-overview"].includes(activePage) ? "profile" : activePage === "topics" ? "tickets" :
    ["exam-history", "exam-review"].includes(activePage) ? "exam" : activePage;
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
  const lit = progress.days.includes(localDay());
  badge.classList.toggle("is-lit", lit);
  badge.classList.toggle("has-streak", count > 0);
  badge.querySelector("#streak-count").textContent = String(count);
  badge.setAttribute("aria-label", "Огоньки и прогресс. Дней подряд: " + count +
    (lit ? ". Сегодня огонёк зажжён" : ". Сегодня огонёк ещё не зажжён"));
}

function bookmarkLabel(question) {
  return savedQuestions.has(question.id) ? "Убрать из сохранённых" : "Сохранить вопрос";
}

function bookmarkButton(question) {
  const saved = savedQuestions.has(question.id);
  return '<button class="secondary bookmark" data-action="bookmark" data-value="' + escape(question.id) +
    '" aria-pressed="' + saved + '">' + bookmarkLabel(question) + '</button>';
}

const searchText = value => value.toLowerCase().replaceAll("ё", "е");

function matchingSavedQuestions() {
  const query = searchText(savedView.query.trim());
  const ticket = query.match(/^(?:билет\s*)?№?\s*(\d{1,2})$/u);
  const terms = query.match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...savedQuestions].reverse().map(id => byId.get(id)).filter(q => {
    if (!q || (savedView.wrongOnly && progress.answers[q.id]?.wrong !== true)) return false;
    if (ticket) return q.ticket === Number(ticket[1]);
    const haystack = searchText(q.text + " " + q.topics.join(" "));
    return terms.every(term => haystack.includes(term));
  });
}

function savedResultRows(items) {
  if (!items.length) return '<p class="muted empty-saved">В подборке нет вопросов. Попробуй изменить поиск или фильтр.</p>';
  const rows = items.slice(0, savedView.limit).map(q => {
    const wrong = progress.answers[q.id]?.wrong === true;
    return '<article class="saved-row"><div class="saved-row-head"><span class="saved-row-meta">Билет ' + q.ticket + ' · Вопрос ' + q.num +
      (wrong ? '<span class="saved-wrong">С ошибкой</span>' : '') + '</span>' +
      '<button class="secondary saved-remove" data-action="bookmark" data-value="' +
      escape(q.id) + '" aria-label="Убрать вопрос ' + q.num + ' из билета ' + q.ticket +
      ' из сохранённых">Убрать</button></div><button class="saved-question" data-action="saved-one" data-value="' +
      escape(q.id) + '"><strong>' + escape(q.text) + '</strong></button></article>';
  }).join("");
  return rows + (items.length > savedView.limit ?
    button("Показать ещё", "saved-more", "", "secondary saved-more") : "");
}

function refreshSavedResults() {
  const items = matchingSavedQuestions();
  app.querySelector("#saved-count").textContent = "Найдено: " + items.length;
  app.querySelector('[data-action="saved-practice"]').disabled = !items.length;
  app.querySelector("#saved-list").innerHTML = savedResultRows(items);
}

function renderSavedQuestions() {
  const total = savedCount();
  if (!total) {
    app.innerHTML = panel("Сохранённые вопросы",
      button("К прогрессу", "navigate", "profile") +
      '<p class="muted empty-saved">Сохраняй вопросы во время урока или из разбора ответов. Здесь их можно повторить.</p>');
    return;
  }
  const items = matchingSavedQuestions();
  app.innerHTML = panel("Сохранённые вопросы",
    '<div class="saved-tools"><label for="saved-search">Поиск по сохранённым</label>' +
    '<input id="saved-search" type="search" maxlength="100" autocomplete="off" placeholder="Билет 5 или обгон" value="' +
    escape(savedView.query) + '"><div class="saved-filter-row"><span id="saved-count" role="status">Найдено: ' + items.length +
    '</span><button class="secondary" data-action="saved-filter" aria-pressed="' + savedView.wrongOnly +
    '">Только ошибки</button></div></div><div class="actions saved-actions">' +
    button("Тренировать подборку", "saved-practice", "", "primary", !items.length) +
    button("К прогрессу", "navigate", "profile") + '</div><div id="saved-list" class="saved-list">' +
    savedResultRows(items) + '</div>');
}

function todayQuestions(day = localDay()) {
  const daily = progress.daily;
  return new Set(daily?.day === day && Array.isArray(daily.ids) ? daily.ids.filter(id => byId.has(id)) : []);
}

function practiceHistory() {
  const totals = progress.practiceTotals;
  const latestDay = progress.daily?.day;
  const hasLegacy = typeof latestDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(latestDay);
  return hasLegacy ? {...totals, [latestDay]: todayQuestions(latestDay).size} : totals;
}

function firstPracticeDay(totals) {
  if (progress.practiceSince) return progress.practiceSince;
  return Object.keys(totals).filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day)).sort()[0] ?? "";
}

function practiceDayLabel({date, count}) {
  return longDate.format(date) + (count === null ? " · Нет записи" : " · Вопросов: " + count);
}

function renderWeeklyPractice(week) {
  const totals = practiceHistory();
  const days = practiceWeek(week, totals, firstPracticeDay(totals));
  const selected = days.find(item => item.key === practiceDay) ?? days.find(item => item.today);
  const sum = days.reduce((result, item) => result + (item.count ?? 0), 0);
  const scale = Math.max(progress.dailyTarget, ...days.map(item => item.count ?? 0));
  const bars = days.map(item => {
    const fill = item.count ? Math.max(5, Math.round(100 * item.count / scale)) : 0;
    return '<li><button class="practice-bar' + (item.today ? ' is-today' : '') +
      '" data-action="practice-day" data-value="' + item.key + '" data-day-label="' + escape(practiceDayLabel(item)) +
      '" aria-label="' + escape(practiceDayLabel(item)) + '" aria-pressed="' + (item === selected) + '">' +
      '<span class="practice-bar-value" aria-hidden="true">' + (item.count ?? '–') +
      '</span><span class="practice-bar-track" aria-hidden="true"><span style="--practice-fill:' + fill +
      '%"></span></span><span class="practice-bar-day" aria-hidden="true">' + escape(shortWeekday.format(item.date)) +
      '</span></button></li>';
  }).join("");
  return '<section class="weekly-practice" aria-labelledby="weekly-practice-title"><div class="weekly-practice-head">' +
    '<div><h2 id="weekly-practice-title">Неделя практики</h2><p>Каждый вопрос считается один раз в день</p></div>' +
    '<div class="weekly-practice-total"><strong>' + sum + '</strong><span>Ответов</span></div></div>' +
    '<ol class="practice-chart" aria-label="Вопросы по дням">' + bars + '</ol>' +
    '<p class="practice-day-detail" id="practice-day-detail" aria-live="polite">' +
    escape(practiceDayLabel(selected)) + '</p></section>';
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
  app.innerHTML = panel("Мой прогресс",
    '<button class="overview-shortcut" data-page="course-overview"><span class="overview-icon" aria-hidden="true"></span>' +
    '<span><strong>Прогресс по разделам</strong><small>Уроки, верные ответы и ошибки</small></span></button>' + renderDailyGoal() +
    '<section class="streak-panel"><div class="streak-panel-head"><div><h2>Серия тренировок</h2>' +
    '<p>' + (doneToday ? "Огонёк за сегодня зажжён." : "Заверши тренировку, чтобы зажечь огонёк.") + '</p></div>' +
    '<span class="streak-emblem' + (doneToday ? ' is-lit' : '') +
    '" aria-hidden="true">' + flameIcon + '</span></div><div class="streak-totals">' +
    stat("Дней подряд", current) + stat("Лучшая серия", best) +
    '</div><ol class="streak-calendar" aria-label="Последние семь дней">' + days +
    '</ol><p class="streak-rule">Огонёк за день даёт пройденный этап маршрута, тренировка от пяти вопросов или сданный экзамен.</p></section>' +
    renderWeeklyPractice(week) +
    '<div class="metrics profile-metrics">' + stat("Вопросов решено", answered) +
    stat("Ошибок к повторению", errors().length) + '</div><button class="card saved-shortcut" data-page="saved">' +
    '<strong>Сохранённые вопросы</strong><span aria-label="Всего сохранено">' +
    savedCount() + '</span></button><div class="actions">' +
    button("На маршрут", "navigate", "home", "primary") +
    button("Повторить ошибки", "mistakes", "", "secondary", !errors().length) +
    (billing.active ? button("Повторение по расписанию", "due") : button("Возможности Pro", "navigate", "pro")) + '</div>');
}

function renderCourseOverview() {
  const {chapter: current, step} = currentCourseStep(chapters, completedRoute);
  const correct = questions.filter(question => progress.answers[question.id]?.wrong === false).length;
  const cards = chapters.map((chapter, index) => {
    const {total, completed} = chapterLessonCounts(chapter);
    const items = chapterQuestions(chapter);
    const mastered = items.filter(item => progress.answers[item.id]?.wrong === false).length;
    const wrong = items.filter(item => progress.answers[item.id]?.wrong === true).length;
    const name = escape(chapter.title);
    const id = escape(chapter.id);
    return '<article class="overview-card" data-chapter="' + id + '" aria-labelledby="overview-chapter-' + id + '">' +
      '<div class="overview-kicker"><span>Раздел ' + ordinal(index + 1) + '</span>' +
      (step && chapter === current ? '<span class="overview-current">Сейчас на маршруте</span>' : '') + '</div>' +
      '<h2 id="overview-chapter-' + id + '">' + name + '</h2>' +
      '<div class="overview-lesson-count"><span>Уроки</span><strong>' + completed + ' из ' + total + '</strong></div>' +
      '<progress value="' + completed + '" max="' + total + '" aria-label="' + name + '. Пройдено уроков"></progress>' +
      '<p class="overview-question-count">Верных ответов: <strong>' + mastered + ' из ' + items.length + '</strong></p>' +
      '<div class="actions overview-card-actions">' + button("На карте", "open-chapter", chapter.id) +
      (wrong ? button("Ошибки: " + wrong, "chapter-errors", chapter.id, "primary") : '') + '</div></article>';
  }).join("");
  app.innerHTML = '<section class="course-overview" aria-labelledby="course-overview-title">' +
    '<div class="overview-head"><div><h1 id="course-overview-title">Прогресс по разделам</h1>' +
    '<p>Здесь учитываются ответы из всех тренировок.</p></div>' +
    '<div class="overview-score"><strong>' + correct + '<span> / ' + questions.length + '</span></strong><span>Верных ответов</span></div></div>' +
    '<div class="overview-grid">' + cards + '</div>' + button("К прогрессу", "navigate", "profile") + '</section>';
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
  const rows = attempts.map((entry, index) => {
    const date = new Date(entry.at);
    const status = entry.passed ? "Сдан" : entry.timeout ? "Время вышло" : "Не сдан";
    return '<li class="exam-attempt"><div><strong class="exam-attempt-status' + (entry.passed ? ' is-passed' : '') + '">' +
      status + '</strong><time datetime="' + date.toISOString() + '">' + escape(attemptDate.format(date)) +
      '</time></div><div class="exam-attempt-end"><span class="exam-attempt-score" aria-label="' + entry.correct + ' из ' + entry.total + ' верно">' +
      entry.correct + ' / ' + entry.total + '</span>' +
      (Array.isArray(entry.review) ? button("Разбор", "open-exam-review", index, "secondary exam-review-link") :
        '<small class="exam-summary-only">Только итог</small>') + '</div></li>';
  }).join("");
  app.innerHTML = panel("История экзаменов", '<div class="actions exam-history-actions">' +
    button("К экзамену", "navigate", "exam", "primary") + '</div>' +
    (attempts.length ? '<p class="exam-history-summary">Сдано из последних попыток <strong>' + passed + ' из ' + attempts.length +
      '</strong></p><ul class="exam-history-list">' + rows + '</ul>' :
      '<p class="muted">Здесь появятся результаты завершённых экзаменов.</p>'));
}

function questionStamp(question) {
  const value = JSON.stringify([question.text, question.choices, question.correct, question.image]);
  let stamp = 2166136261;
  for (let i = 0; i < value.length; i++) stamp = Math.imul(stamp ^ value.charCodeAt(i), 16777619);
  return stamp >>> 0;
}

function storedExamQuestions(attempt) {
  if (!Array.isArray(attempt?.review)) return [];
  return attempt.review.slice(0, Math.min(30, attempt.total)).flatMap((item, index) => {
    const q = byId.get(item?.id);
    if (!q || questionStamp(q) !== item.stamp) return [];
    const selected = item.selected;
    if (selected !== null && (!Number.isInteger(selected) || selected < 0 || selected >= q.choices.length)) return [];
    return [{q, selected: selected ?? undefined, number: index + 1}];
  });
}

function validChoice(question, index) {
  return Number.isInteger(index) && index >= 0 && index < question.choices.length;
}

function restorePracticeDraft() {
  const draft = progress.practiceDraft;
  if (!draft || typeof draft.title !== "string" || draft.title.length > 200 ||
      !Array.isArray(draft.items) || draft.items.length < 1 || draft.items.length > 20 ||
      !Array.isArray(draft.selected) || draft.selected.length >= draft.items.length) return null;
  const items = draft.items.map(item => byId.get(item?.id));
  if (new Set(items).size !== items.length || items.some((q, index) => !q || draft.items[index].stamp !== questionStamp(q))) return null;
  if (draft.selected.some((index, i) => !validChoice(items[i], index))) return null;
  const next = items[draft.selected.length];
  if (draft.picked !== -1 && !validChoice(next, draft.picked)) return null;
  if (!Array.isArray(draft.order) || draft.order.length !== next.choices.length ||
      new Set(draft.order).size !== next.choices.length || draft.order.some(index => !validChoice(next, index))) return null;
  let routeStep = null;
  if (draft.route) {
    routeStep = chapters.flatMap(chapter => chapter.steps).find(step => step.id === draft.route);
    const {step: current} = currentCourseStep(chapters, completedRoute);
    if (!routeStep?.items || (routeStep !== current && !completedRoute.has(routeStep.id)) ||
        items.some(q => !routeStep.items.includes(q))) return null;
    const expected = routeStep.kind === "review" ? Math.min(5, routeStep.items.length) : routeStep.items.length;
    if (items.length !== expected) return null;
  }
  const choiceOrders = [];
  choiceOrders[draft.selected.length] = draft.order;
  return {items, title: draft.title, routeStep, answers: draft.selected.map((selected, index) => ({q: items[index], selected})),
    choiceOrders, picked: draft.picked, passed: false};
}

function savePracticeDraft() {
  if (!session.blocks) {
    const count = session.answers.length;
    session.draftItems ??= session.items.map(q => ({id: q.id, stamp: questionStamp(q)}));
    progress.practiceDraft = {items: session.draftItems, title: session.title, route: session.routeStep?.id,
      source: previousPage, selected: session.answers.map(answer => answer.selected), picked: session.picked,
      order: session.choiceOrders[count]};
  }
  save();
}

function resumePractice() {
  const restored = restorePracticeDraft();
  if (!restored) return;
  const source = progress.practiceDraft.source;
  const sources = ["home", "tickets", "topics", "profile", "saved", "course-overview", "pro", "exam-history"];
  previousPage = sources.includes(source) ? source : source === "exam-review" ? "exam-history" : "home";
  session = restored;
  navigate("study");
}

function renderStoredExam() {
  if (!examReviewEntry) { renderExamHistory(); return; }
  const attempt = examReviewEntry;
  const entries = storedExamQuestions(attempt);
  const hasMistakes = entries.some(({q, selected}) => selected !== undefined && selected !== q.correct);
  const status = attempt.passed ? "Экзамен сдан" : attempt.timeout ? "Время вышло" : "Экзамен не сдан";
  app.innerHTML = '<section class="panel narrow result-panel exam-review"><div class="result-top"><div><h1>Разбор экзамена</h1>' +
    '<p>' + status + ' · ' + escape(attemptDate.format(attempt.at)) + '</p></div><div class="score' +
    (attempt.passed ? '' : ' is-failed') + '"><strong>' + attempt.correct + ' / ' + attempt.total +
    '</strong><span>Верных ответов</span></div></div><div class="result-body">' +
    '<div class="actions result-actions">' + button("К истории", "navigate", "exam-history") +
    (hasMistakes ? button("Повторить ошибки попытки", "repeat-exam-errors", "", "primary") : '') + '</div>' +
    (entries.length < attempt.total ? '<p class="muted exam-review-note">В текущей базе доступно для разбора: ' +
      entries.length + ' из ' + attempt.total + '.</p>' : '') +
    (entries.length ? answerReview(entries) : '') + '</div></section>';
}

function render() {
  updateStreakBadge();
  const answered = Object.keys(progress.answers).filter(id => byId.has(id)).length;
  if (page === "home") renderCourse();
  if (page === "tickets") renderTickets();
  if (page === "topics") renderTopics();
  if (page === "exam") renderExam();
  if (page === "exam-history") renderExamHistory();
  if (page === "exam-review") renderStoredExam();
  if (page === "profile") renderActivity(answered);
  if (page === "course-overview") renderCourseOverview();
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
  else savePracticeDraft();
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
  const totals = practiceHistory();
  const touchedToday = todayQuestions(day);
  touchedToday.add(q.id);
  progress.daily = {day, ids: [...touchedToday]};
  progress.practiceSince = firstPracticeDay(totals) || day;
  progress.practiceTotals = retainPracticeDays(totals, day, touchedToday.size);
}
function questionImageSource(question) {
  return offlineData ? offlineData.images[question.image] : "./data/images/" + encodeURIComponent(question.image);
}

function questionImage(question, lazy = false) {
  if (!question.image) return "";
  const image = '<img class="question-image" src="' + escape(questionImageSource(question)) + '" alt="Дорожная ситуация к вопросу"' +
    (lazy ? ' loading="lazy" decoding="async"' : '') + '>';
  if (!illustrationViewer?.showModal) return image;
  return '<button class="question-illustration" data-action="open-illustration" data-value="' + escape(question.id) +
    '" aria-label="Увеличить изображение к вопросу">' + image + '<span aria-hidden="true">Увеличить</span></button>';
}

function setIllustrationZoom(zoomed) {
  const control = illustrationViewer.querySelector('[data-action="zoom-illustration"]');
  illustrationViewer.classList.toggle("is-zoomed", zoomed);
  control.setAttribute("aria-pressed", String(zoomed));
  control.textContent = zoomed ? "По размеру экрана" : "Приблизить";
  illustrationViewer.querySelector("#illustration-hint").hidden = !zoomed;
  const frame = illustrationViewer.querySelector(".illustration-frame");
  if (zoomed) frame.setAttribute("aria-describedby", "illustration-hint");
  else frame.removeAttribute("aria-describedby");
  frame.scrollLeft = zoomed ? (frame.scrollWidth - frame.clientWidth) / 2 : 0;
  frame.scrollTop = 0;
}

function openIllustration(id, trigger) {
  const question = byId.get(id);
  if (!question?.image || !illustrationViewer?.showModal || illustrationViewer.open) return;
  illustrationTrigger = trigger;
  illustrationViewer.querySelector("img").src = questionImageSource(question);
  illustrationViewer.showModal();
  setIllustrationZoom(false);
}

illustrationViewer?.addEventListener("close", () => {
  if (illustrationViewer.open) return;
  illustrationViewer.querySelector("img").removeAttribute("src");
  if (illustrationTrigger?.isConnected) illustrationTrigger.focus({preventScroll: true});
  illustrationTrigger = null;
});

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
  app.innerHTML = '<section class="panel narrow question-panel"><div class="question-main"><div class="question-top">' +
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
    '</div></div><div class="actions question-actions" aria-label="Управление занятием">' +
    button("Выйти", "leave-study", "", "secondary study-exit") +
    button(blocks ? "Подтвердить ответ" : "Продолжить", "next", "", "primary study-next", picked < 0) +
    '</div></section>';
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
    savePracticeDraft();
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
  save();
}
function finish() {
  if (page !== "study") return;
  if (illustrationViewer?.open) illustrationViewer.close();
  if (!session.blocks) {
    session.passed = session.answers.length === session.items.length &&
      session.answers.every(({q, selected}) => selected === q.correct);
    progress.practiceDraft = null;
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
      total: session.items.length, passed: session.passed, timeout: Boolean(session.timeout),
      review: session.items.map((q, index) => ({
        id: q.id, stamp: questionStamp(q), selected: session.answers[index]?.selected ?? null
      }))
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

function answerReview(entries) {
  const unanswered = entries.some(({selected}) => selected === undefined);
  const hasMissed = unanswered || entries.some(({q, selected}) => selected !== q.correct);
  const rows = entries.map(({q, selected, number}) => {
    const right = selected === q.correct;
    return '<details class="review-item" data-correct="' + right +
      '"><summary><span class="review-number">' + number + '</span><span class="review-question">' +
      escape(q.text) + '</span><span class="review-status ' + (right ? 'is-right' : 'is-wrong') + '">' +
      (right ? 'Верно' : selected === undefined ? 'Пропуск' : 'Ошибка') +
      '</span></summary><div class="review-body">' + questionImage(q, true) +
      (!right && selected !== undefined ? '<div class="review-pick"><span>Ваш ответ</span><p>' +
        escape(q.choices[selected]) + '</p></div>' : '') +
      '<div class="review-pick correct-pick"><span>Правильный ответ</span><p>' +
      escape(q.choices[q.correct]) + '</p></div>' + answerExplanation(q) +
      '<div class="review-bookmark">' + bookmarkButton(q) + '</div></div></details>';
  }).join("");
  return '<div class="review-header"><h2>Разбор ответов</h2>' +
    (hasMissed ? '<div class="review-filters" role="group" aria-label="Показать ответы">' +
      '<button data-action="review-filter" data-value="all" aria-pressed="true">Все</button>' +
      '<button data-action="review-filter" data-value="missed" aria-pressed="false">' + (unanswered ? 'Ошибки и пропуски' : 'Ошибки') + '</button></div>' : '') +
    '</div><div class="review">' + rows + '</div>';
}

function renderResult() {
  const correct = session.answers.filter(({q, selected}) => selected === q.correct).length;
  const errorsCount = session.answers.length - correct;
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
  const practiceBackLabels = {tickets: "К билетам", topics: "К темам", "course-overview": "К разделам", saved: "К сохранённым", "exam-review": "К разбору экзамена"};
  const leaveLabel = session.routeStep ? "К маршруту" : session.blocks ? "К экзамену" :
    practiceBackLabels[previousPage] ?? "Продолжить обучение";
  const leaveAction = session.routeStep ? "course-current" : "navigate";
  const entries = session.items.map((q, index) => ({q, selected: session.answers[index]?.selected, number: index + 1}));
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
    answerReview(entries) + '</div></section>';
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
    case "practice-day":
      if (page !== "profile") break;
      practiceDay = value;
      for (const control of app.querySelectorAll('.practice-bar')) {
        control.setAttribute("aria-pressed", String(control === target));
      }
      app.querySelector("#practice-day-detail").textContent = target.dataset.dayLabel;
      break;
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
    case "show-chapter-picker":
      if (page === "home") openChapterPicker(target, value);
      break;
    case "close-chapter-picker":
      if (chapterPicker?.open) chapterPicker.close();
      break;
    case "choose-chapter":
      if (page === "home" && chapterPicker?.open) {
        chapterPicker.close();
        showCourseChapter(value);
      }
      break;
    case "open-chapter":
    case "chapter-errors": {
      if (page !== "course-overview") break;
      const chapter = chapters.find(item => item.id === value);
      if (!chapter) break;
      if (action === "open-chapter") {
        navigate("home", {chapterId: chapter.id});
        const heading = document.querySelector("#course-title");
        heading?.setAttribute("tabindex", "-1");
        heading?.focus({preventScroll: true});
      } else {
        const items = chapterQuestions(chapter).filter(q => progress.answers[q.id]?.wrong === true);
        start(shuffled(items).slice(0, 5), chapter.title);
      }
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
    case "resume-practice":
      if (page === "home") resumePractice();
      break;
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
        const nextTarget = app.querySelector?.(".saved-question") ?? app.querySelector?.('[data-value="profile"]');
        nextTarget?.focus({preventScroll: true});
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
      if (page === "saved") start(prioritized(matchingSavedQuestions()).slice(0, 10), "Сохранённые вопросы");
      break;
    case "saved-filter":
      if (page !== "saved") break;
      savedView.wrongOnly = !savedView.wrongOnly;
      savedView.limit = savedPageSize;
      target.setAttribute("aria-pressed", String(savedView.wrongOnly));
      refreshSavedResults();
      break;
    case "saved-more":
      if (page !== "saved") break;
      {
        const firstNew = savedView.limit;
        savedView.limit += savedPageSize;
        refreshSavedResults();
        app.querySelectorAll(".saved-question")[firstNew]?.focus();
      }
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
    case "open-exam-review": {
      const entry = progress.examHistory[Number(value)];
      if (page !== "exam-history" || !Array.isArray(entry?.review)) break;
      examReviewEntry = entry;
      navigate("exam-review");
      break;
    }
    case "repeat-exam-errors":
      if (page === "exam-review") {
        const items = storedExamQuestions(examReviewEntry)
          .filter(({q, selected}) => selected !== undefined && selected !== q.correct).map(({q}) => q);
        start(shuffled(items).slice(0, 10), "Ошибки экзамена");
      }
      break;
    case "choose":
      if (page !== "study" || (!session.blocks && session.picked >= 0)) break;
      session.picked = Number(value);
      renderQuestion();
      if (!session.blocks) savePracticeDraft();
      document.querySelector(session.blocks ? '.answer.selected' : '#answer-explanation')?.focus();
      break;
    case "review-filter":
      if (page !== "result" && page !== "exam-review") break;
      for (const control of app.querySelectorAll(".review-filters button")) {
        control.setAttribute("aria-pressed", String(control === target));
      }
      for (const row of app.querySelectorAll(".review-item")) {
        row.hidden = value === "missed" && row.dataset.correct === "true";
      }
      break;
    case "next": if (page === "study") advance(); break;
    case "leave-study":
      if (page === "study") navigate(previousPage || "home");
      break;
    case "open-illustration": openIllustration(value, target); break;
    case "close-illustration": if (illustrationViewer?.open) illustrationViewer.close(); break;
    case "zoom-illustration":
      if (illustrationViewer?.open) setIllustrationZoom(!illustrationViewer.classList.contains("is-zoomed"));
      break;
    case "buy": if (page === "pro") void buy(target); break;
  }
});
document.addEventListener("input", event => {
  if (page !== "saved" || event.target.id !== "saved-search") return;
  savedView.query = event.target.value;
  savedView.limit = savedPageSize;
  refreshSavedResults();
});

document.addEventListener("change", event => {
  if (page !== "home" || event.target.id !== "chapter-select") return;
  showCourseChapter(event.target.value);
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
