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
const displayedChoices = () => [...screen.innerHTML.matchAll(
  /<button class="answer[^"]*" data-action="choose" data-value="(\d+)"/g
)].map(match => Number(match[1]));
function answerLesson(withError) {
  for (const [index, question] of initial.items.entries()) {
    const wrong = withError && index === 0;
    const choice = wrong ? (question.correct + 1) % question.choices.length : question.correct;
    const order = displayedChoices();
    assert.equal(order.length, question.choices.length);
    assert.deepEqual([...order].sort((a, b) => a - b), [...question.choices.keys()]);
    click("choose", String(choice));
    assert.deepEqual(displayedChoices(), order, "feedback cannot move the answers");
    assert.match(screen.innerHTML, new RegExp('class="answer right" data-action="choose" data-value="' + question.correct + '"'));
    assert.match(screen.innerHTML, new RegExp('<i class="is-' + (wrong ? "wrong" : "right") + '"></i>'),
      "short practice shows the answered question's result in the progress bar");
    click("next");
  }
}

assert.deepEqual(saved().routeDone, [], "an incorrectly credited legacy lesson must be repaired");
click("course-step", next.id);
assert.match(screen.innerHTML, /course-map/, "a locked lesson cannot be started");
Math.random = () => 0;
click("course-step", initial.id);
const initialOrder = displayedChoices();
assert.notDeepEqual(initialOrder, [...initial.items[0].choices.keys()], "the initial order is shuffled");
answerLesson(true);
assert.match(screen.innerHTML, /Есть ошибки/);
assert.match(screen.innerHTML, /data-action="retry-stage"/);
assert.deepEqual(saved().routeDone, []);
assert.deepEqual(saved().days, [], "a failed route lesson cannot light the daily flame");
Math.random = () => 0.9999;
click("retry-stage");
assert.notDeepEqual(displayedChoices(), initialOrder, "a fresh attempt gets a new order");
answerLesson(false);
assert.match(screen.innerHTML, /Урок пройден/);
assert.match(screen.innerHTML, /Огонёк за сегодня зажжён/);
assert.equal(saved().days.length, 1);
assert.deepEqual(saved().routeDone, [initial.id]);
click("course-current");
assert.ok(screen.innerHTML.includes('data-value="' + next.id + '" aria-current="step"'));
const resume = screen.innerHTML.match(/<div class="route-resume"[^>]*>[\s\S]*?<button[^>]+data-action="course-step" data-value="([^"]+)"/);
assert.equal(resume?.[1], next.id, "the quick-start button follows the newly unlocked stage");
click("course-step", initial.id);
answerLesson(true);
assert.deepEqual(saved().routeDone, [initial.id], "an unsuccessful replay must not revoke an already passed lesson");
click("course-current");
click("course-step", initial.id);
answerLesson(false);
assert.equal(saved().days.length, 1, "multiple sessions on the same calendar day add one entry");
assert.doesNotMatch(screen.innerHTML, /Огонёк за сегодня зажжён/);
console.log("Route: repaired legacy credit, refused to unlock on failure, unlocked on a perfect retry, preserved prior passing credit.");
