export const courseTopics = [
  ["signals", "Светофоры и знаки", [
    ["Сигналы светофора и регулировщика", "Светофор и регулировщик"],
    ["Дорожные знаки", "Дорожные знаки"],
    ["Дорожная разметка", "Разметка"]
  ]],
  ["junctions", "Перекрёстки и приоритет", [
    ["Проезд перекрестков", "Проезд перекрёстков"],
    ["Пешеходные переходы и места остановок маршрутных транспортных средств", "Пешеходные переходы и остановки"],
    ["Приоритет маршрутных транспортных средств", "Приоритет общественного транспорта"]
  ]],
  ["maneuvers", "Манёвры на дороге", [
    ["Начало движения, маневрирование", "Повороты и манёвры"],
    ["Расположение транспортных средств на проезжей части", "Расположение на дороге"],
    ["Обгон, опережение, встречный разъезд", "Обгон и опережение"],
    ["Скорость движения", "Скорость движения"]
  ]],
  ["road", "Остановка и особые участки", [
    ["Остановка и стоянка", "Остановка и стоянка"],
    ["Движение в жилых зонах", "Движение в жилых зонах"],
    ["Движение через железнодорожные пути", "Железнодорожные переезды"],
    ["Движение по автомагистралям", "Автомагистрали"]
  ]],
  ["driver", "Обязанности водителя", [
    ["Общие положения", "Основные понятия"],
    ["Общие обязанности водителей", "Обязанности водителя"],
    ["Ответственность водителя", "Ответственность водителя"],
    ["Учебная езда и дополнительные требования к движению велосипедистов", "Учебная езда и велосипедисты"]
  ]],
  ["vehicle", "Автомобиль и оборудование", [
    ["Перевозка людей и грузов", "Перевозка людей и грузов"],
    ["Буксировка механических транспортных средств", "Буксировка"],
    ["Неисправности и условия допуска транспортных средств к эксплуатации", "Неисправности автомобиля"],
    ["Пользование внешними световыми приборами и звуковыми сигналами", "Световые и звуковые сигналы"],
    ["Применение специальных сигналов", "Спецсигналы"]
  ]],
  ["safety", "Безопасность и первая помощь", [
    ["Безопасность движения и техника управления автомобилем", "Безопасное управление"],
    ["Применение аварийной сигнализации и знака аварийной остановки", "Аварийная сигнализация"],
    ["Оказание доврачебной медицинской помощи", "Первая помощь"]
  ]]
];

const lessonSize = 5;
const lessonsPerCheckpoint = 4;

export function buildCourse(questions) {
  const remaining = new Set(questions);
  const chapters = [];
  for (const [id, title, topics] of courseTopics) {
    const groups = topics.map(([topic, label]) => {
      const items = [...remaining].filter(question => question.topics.includes(topic));
      // Assign questions with multiple tags to their first applicable lesson.
      for (const question of items) remaining.delete(question);
      return {topic, label, items};
    });
    const steps = makeLessons(id, groups);
    if (steps.length) chapters.push(withReviews(id, title, steps));
  }
  if (remaining.size) {
    const id = "other";
    const items = [...remaining];
    chapters.push(withReviews(id, "Другие вопросы", makeLessons(id, [{label: "Смешанная практика", items}])));
  }
  chapters.at(-1)?.steps.push({id: "course-exam", kind: "exam", title: "Пробный экзамен"});
  return chapters;
}

function makeLessons(chapter, groups) {
  const steps = [];
  for (const {topic, label, items} of groups) {
    for (let i = 0; i < items.length; i += lessonSize) {
      const chunk = items.slice(i, i + lessonSize);
      steps.push({id: chapter + "/" + chunk[0].id, kind: "lesson", title: label, topic, items: chunk});
    }
  }
  return steps;
}

function withReviews(id, title, lessons) {
  const steps = [];
  for (let i = 0; i < lessons.length; i += lessonsPerCheckpoint) {
    const group = lessons.slice(i, i + lessonsPerCheckpoint);
    steps.push(...group, {
      id: id + "/review/" + group[0].items[0].id,
      kind: "review",
      title: "Повторение",
      items: group.flatMap(lesson => lesson.items),
    });
  }
  return {id, title, steps};
}

export function restoreCourseCompletions(chapters, saved, answers) {
  const completed = new Set();
  for (const {steps} of chapters) {
    for (const step of steps) {
      if (!saved.has(step.id)) return completed;
      // Older builds counted a finished attempt even when it included wrong answers.
      if (step.items && !step.items.every(question => answers[question.id]?.wrong === false)) {
        return completed;
      }
      completed.add(step.id);
    }
  }
  return completed;
}

export function currentCourseStep(chapters, completed) {
  for (const chapter of chapters) {
    const step = chapter.steps.find(item => !completed.has(item.id));
    if (step) return {chapter, step};
  }
  return {chapter: chapters.at(-1), step: null};
}

export function reviewCourseQuestions(items, answers) {
  return [...items].sort((a, b) => {
    const first = answers[a.id];
    const second = answers[b.id];
    return Number(Boolean(second?.wrong)) - Number(Boolean(first?.wrong)) ||
      (first?.due ?? 0) - (second?.due ?? 0);
  }).slice(0, lessonSize);
}
