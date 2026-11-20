export const DAY = 86400000;

export function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function examBlocks(questions) {
  const tickets = [...new Set(questions.map(q => q.ticket))];
  return Array.from({ length: 4 }, (_, block) => shuffled(tickets).map(ticket =>
    questions.filter(q => q.ticket === ticket && Math.floor((q.num - 1) / 5) === block)));
}

export function extraQuestions(blocks, answers, questions) {
  const errors = answers.filter(({q, selected}) => selected !== q.correct);
  const groups = [...new Set(errors.map(({q}) => Math.floor((q.num - 1) / 5)))];
  if (errors.length > 2 || groups.length !== errors.length) return null;
  return groups.flatMap(group => blocks[group].find(block =>
    block[0].ticket !== questions[group * 5].ticket));
}

export function localDay(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map(part => String(part).padStart(2, "0")).join("-");
}

export function streak(days, now = new Date()) {
  const date = new Date(now);
  if (!days.includes(localDay(date))) date.setDate(date.getDate() - 1);
  let count = 0;
  while (days.includes(localDay(date))) {
    count++;
    date.setDate(date.getDate() - 1);
  }
  return count;
}