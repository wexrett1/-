import {config} from "./config.js";
import {drawRoute} from "./route-art.js";
import {lessonNote} from "./lesson-notes.js";
import {DAY, shuffled, examBlocks, extraQuestions, localDay, streak} from "./study.js";

const app = document.querySelector("#app");
const telegram = globalThis.Telegram?.WebApp;
telegram?.ready();
telegram?.expand();
const progressKey = "pdd-progress-v1";
let progress = {answers: {}, days: [], lessons: 0, examDate: ""};
try { progress = {...progress, ...JSON.parse(localStorage.getItem(progressKey))}; } catch {}
const save = () => {
  try { localStorage.setItem(progressKey, JSON.stringify(progress)); } catch {}
};
let questions = [], topics = [], byId = new Map();
let page = "home", session, previousPage, ticker;
let billing = {active: false, enabled: false, price: 199, adBlock: ""};
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
function nextTopicName() {
  return topics.find(name => {
    const {items, mastered} = topicStats(name);
    return mastered < items.length;
  });
}
function topicCard(name, index, nextTopic) {
  const {items, mastered} = topicStats(name);
  const current = name === nextTopic;
  return '<button class="card topic-card' + (current ? ' topic-current' : '') +
    '" data-action="topic" data-value="' + index + '"><span class="topic-marker" aria-hidden="true">' +
    (mastered === items.length ? '✓' : current ? '●' : '◇') + '</span><span class="topic-caption"><strong>' +
    escape(name) + '</strong>' + (current ? '<span>Следующий урок</span>' : '') +
    '</span><span class="topic-meter"><span>' + mastered + ' из ' + items.length +
    '</span><span class="mini-track"><i style="width:' + Math.round(mastered / items.length * 100) +
    '%"></i></span></span></button>';
}
function navigate(destination) {
  if (!questions.length) return;
  if (page === "study" && destination !== "study" && !confirm("Завершить текущее занятие?")) return;
  clearInterval(ticker);
  page = destination;
  for (const link of document.querySelectorAll("nav [data-page]")) {
    if (link.dataset.page === page) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  render();
  window.scrollTo(0, 0);
}

function render() {
  const answered = Object.keys(progress.answers).filter(id => byId.has(id)).length;
  if (page === "home") {
    const nextTopic = nextTopicName();
    const completedTopics = topics.filter(name => {
      const {items, mastered} = topicStats(name);
      return mastered === items.length;
    }).length;
    app.innerHTML = '<section class="hero"><div class="hero-copy"><p class="eyebrow"><span></span> Категории A и B</p>' +
      '<h1>Твой маршрут<br><em>к правам</em></h1><p>Пять вопросов за урок. Дальше — пробный экзамен.</p>' +
      button("Начать урок", "daily", "", "primary") +
      '</div><div class="hero-art" aria-hidden="true"><canvas width="1200" height="740"></canvas></div>' +
      '<div class="route-progress"><div><span>Темы освоены</span><strong>' + completedTopics + ' из ' + topics.length +
      '</strong></div><progress value="' + completedTopics + '" max="' + topics.length + '" aria-label="Прогресс по темам"></progress></div></section>' +
      '<section class="home-stats metrics" aria-label="Твой прогресс">' +
      stat("Вопросов решено", answered + " / 800") + stat("Уроков пройдено", progress.lessons) +
      stat("Дней подряд", streak(progress.days)) + '</section>' +
      '<div class="dashboard"><section class="route"><div class="section-title"><h2>Уроки по темам</h2>' +
      '<span class="section-count">' + topics.length + ' тем</span></div><div class="topic-list">' +
      topics.map((name, index) => topicCard(name, index, nextTopic)).join("") + '</div></section>' +
      '<aside class="shortcuts" aria-label="Режимы тренировки"><h2>Практика</h2>' +
      '<button class="shortcut shortcut-tickets" data-page="tickets"><span class="shortcut-icon" aria-hidden="true">▤</span>' +
      '<strong>Все билеты</strong><span>40 билетов · 800 вопросов</span></button>' +
      '<button class="shortcut shortcut-exam" data-page="exam"><span class="shortcut-icon" aria-hidden="true">◷</span>' +
      '<strong>Пробный экзамен</strong><span>20 вопросов · 20 минут</span></button></aside></div>';
    drawRoute(app.querySelector?.(".hero-art canvas"));
  }
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

function start(items, title, blocks = null) {
  if (!items.length) {
    app.insertAdjacentHTML("afterbegin", '<p class="panel" role="status">На сегодня всё повторено.</p>');
    return;
  }
  previousPage = page;
  session = {items, title, blocks, answers: [], picked: -1, deadline: Date.now() + 20 * 60000, extra: false, passed: false};
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
  return question.image ? '<img class="question-image" src="./data/images/' + encodeURIComponent(question.image) +
    '" alt="Дорожная ситуация к вопросу"' + (lazy ? ' loading="lazy" decoding="async"' : '') + '>' : "";
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
  const note = n === 0 && !blocks ? lessonNote(session.title) : "";
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
  app.innerHTML = '<section class="panel narrow question-panel"><div class="question-top">' +
    '<div class="question-header"><strong>' + escape(mode) + '</strong><span class="question-counter">Вопрос ' +
    (n + 1) + ' из ' + items.length +
    (blocks ? ' <strong id="clock" class="time-chip" aria-label="Осталось времени"></strong>' : '') +
    '</span></div><div class="bar" role="progressbar" aria-label="Прогресс занятия" aria-valuemin="0" aria-valuemax="' +
    items.length + '" aria-valuenow="' + (n + (show ? 1 : 0)) + '"><i style="width:' +
    (100 * (n + (show ? 1 : 0)) / items.length) + '%"></i></div></div>' +
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
    button("Продолжить обучение", "navigate", previousPage, "primary") +
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
  const day = localDay();
  try { if (localStorage.getItem("pdd-ad-day") === day) return; } catch {}
  const slot = document.createElement("div");
  slot.className = "ad-slot";
  slot.id = "pdd-ad-" + (++adCounter);
  app.querySelector(".panel").append(slot);
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
      window.Ya.Context.AdvManager.render({
        blockId: billing.adBlock, renderTo: slot.id,
        onRender: () => {
          current.adShown = true;
          try { localStorage.setItem("pdd-ad-day", day); } catch {}
        },
        onError: () => slot.remove(),
        onStub: () => slot.remove()
      });
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
    case "daily": {
      const nextTopic = nextTopicName();
      const items = nextTopic ? topicStats(nextTopic).items : questions;
      start(prioritized(items).slice(0, 5), nextTopic || "Урок дня");
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
document.addEventListener("submit", event => {
  if (event.target.id !== "exam-date" || !billing.active) return;
  event.preventDefault();
  progress.examDate = document.querySelector("#date").value;
  save();
  render();
});
async function init() {
  try {
    const response = await fetch("./data/tickets.json");
    if (!response.ok) throw new Error("Tickets");
    questions = await response.json();
    byId = new Map(questions.map(q => [q.id, q]));
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