import assert from "node:assert/strict";
import fs from "node:fs";
import {setImmediate as nextTick} from "node:timers/promises";
import {buildCourse} from "../dist/course.js";

const questions = JSON.parse(fs.readFileSync(new URL("../dist/data/tickets.json", import.meta.url)));
const [initial, next] = buildCourse(questions)[0].steps;
const progressKey = "pdd-progress-v1";
const persisted = new Map([[progressKey, JSON.stringify({
  routeDone: [initial.id, next.id],
  answers: Object.fromEntries(initial.items.map((q, index) => [q.id, {wrong: index === 0}]))
})]]);
const handlers = {};
const screen = {innerHTML: ""};
globalThis.localStorage = {getItem: key => persisted.get(key), setItem: (key, value) => persisted.set(key, value)};
globalThis.document = {
  querySelector: selector => selector === "#app" ? screen : null,
  querySelectorAll: () => [],
  addEventListener: (type, handler) => handlers[type] = handler
};
globalThis.window = {scrollTo() {}};
globalThis.fetch = async () => Response.json(questions);
await import("../dist/app.js");
await nextTick();

const click = (action, value = "") => handlers.click({
  target: {closest: () => ({dataset: {action, value}})}
});
const saved = () => JSON.parse(persisted.get(progressKey));
function answerLesson(withError) {
  for (const [index, question] of initial.items.entries()) {
    const wrong = withError && index === 0;
    const choice = wrong ? (question.correct + 1) % question.choices.length : question.correct;
    click("choose", String(choice));
    click("next");
  }
}

assert.deepEqual(saved().routeDone, [], "an incorrectly credited legacy lesson must be repaired");
click("course-step", next.id);
assert.match(screen.innerHTML, /course-map/, "a locked lesson cannot be started");
click("course-step", initial.id);
answerLesson(true);
assert.match(screen.innerHTML, /Есть ошибки/);
assert.match(screen.innerHTML, /data-action="retry-stage"/);
assert.deepEqual(saved().routeDone, []);
click("retry-stage");
answerLesson(false);
assert.match(screen.innerHTML, /Урок пройден/);
assert.deepEqual(saved().routeDone, [initial.id]);
click("course-current");
assert.ok(screen.innerHTML.includes('data-value="' + next.id + '" aria-current="step"'));
click("course-step", initial.id);
answerLesson(true);
assert.deepEqual(saved().routeDone, [initial.id], "an unsuccessful replay must not revoke an already passed lesson");
console.log("Route: repaired legacy credit, refused to unlock on failure, unlocked on a perfect retry, preserved prior passing credit.");
