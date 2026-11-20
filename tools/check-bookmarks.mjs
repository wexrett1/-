import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {setImmediate as nextTick} from "node:timers/promises";
import {buildCourse} from "../dist/course.js";

const bank = JSON.parse(readFileSync(new URL("../dist/data/tickets.json", import.meta.url)));
const stage = buildCourse(bank)[0].steps[0];
const question = stage.items[0];
const key = "pdd-progress-v1";
const store = new Map();
const listeners = {};
const screen = {innerHTML: ""};
globalThis.localStorage = {getItem: key => store.get(key), setItem: (key, value) => store.set(key, value)};
globalThis.document = {
  querySelector: selector => selector === "#app" ? screen : null,
  querySelectorAll: () => [],
  addEventListener: (type, listener) => listeners[type] = listener
};
globalThis.window = {scrollTo() {}};
globalThis.confirm = () => true;
globalThis.fetch = async () => Response.json(bank);
await import("../dist/app.js");
await nextTick();

function click(action, value = "") {
  const target = {dataset: {action, value}, setAttribute() {}};
  listeners.click({target: {closest: () => target}});
  return target;
}
const saved = () => JSON.parse(store.get(key));
click("course-step", stage.id);
assert.match(screen.innerHTML, /Сохранить вопрос/);
const pressed = click("bookmark", question.id);
assert.equal(pressed.textContent, "Убрать из сохранённых");
assert.deepEqual(saved().savedQuestions, [question.id]);
click("navigate", "profile");
assert.match(screen.innerHTML, /data-page="saved"/);
click("navigate", "saved");
assert.match(screen.innerHTML, /class="saved-question"/);
assert.ok(screen.innerHTML.includes(question.text));
click("saved-one", question.id);
assert.match(screen.innerHTML, /Вопрос 1 из 1/);
assert.match(screen.innerHTML, /aria-pressed="true">Убрать из сохранённых/);
click("choose", String(question.correct));
click("next");
assert.equal(saved().answers[question.id].wrong, false);
assert.deepEqual(saved().days, [], "a single saved question does not satisfy the daily streak");
assert.match(screen.innerHTML, /class="review-bookmark"/);
click("navigate", "saved");
click("bookmark", question.id);
assert.deepEqual(saved().savedQuestions, []);
assert.match(screen.innerHTML, /empty-saved/);
console.log("Saved questions: bookmark, result entry, one-question practice, deletion, and streak eligibility verified.");