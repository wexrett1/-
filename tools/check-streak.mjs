import assert from "node:assert/strict";
import {studyActivity, localDay, practiceWeek, retainPracticeDays} from "../dist/study.js";

const now = new Date(2026, 0, 3, 12);
const studyDays = ["2025-12-27", "2025-12-28", "2025-12-29", "2026-01-01", "2026-01-02", "2026-01-02"];
const before = studyActivity(studyDays, now);
assert.equal(before.current, 2, "yesterday's series survives until the end of today");
assert.equal(before.best, 3);
assert.equal(before.doneToday, false);
assert.equal(before.week.length, 7);
assert.deepEqual(before.week.map(day => day.done), [true, true, false, false, true, true, false]);
assert.equal(before.week.at(-1).key, "2026-01-03");
assert.equal(before.week.at(-1).today, true);

studyDays.push(localDay(now));
assert.equal(studyActivity(studyDays, now).current, 3);
assert.equal(studyActivity(studyDays, now).doneToday, true);
assert.equal(studyActivity(studyDays, new Date(2026, 0, 5, 12)).current, 0, "a skipped day breaks the series");
assert.equal(studyActivity(studyDays, new Date(2026, 0, 5, 12)).best, 3, "record survives a break");
assert.deepEqual(practiceWeek(before.week, {"2025-12-31": 11, "2026-01-02": 4}, "2025-12-31").map(day => day.count),
  [null, null, null, 11, 0, 4, 0], "days missing before measurement are distinct from days without practice");
const older = Object.fromEntries(Array.from({length: 15}, (_, i) => ["2025-12-" + (12 + i), 3]));
const recent = retainPracticeDays(older, "2025-12-26", 7);
assert.equal(Object.keys(recent).length, 14);
assert.equal(recent["2025-12-12"], undefined);
assert.equal(recent["2025-12-26"], 7, "updates replace the day's count without retaining extra days");
console.log("Streak calendar: date boundaries, duplicates, daily activation and best record passed.");
