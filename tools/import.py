"""Import the complete A/B ticket set from a checked-out pdd_russia snapshot."""
import json
import re
import shutil
import sys
from pathlib import Path

source = Path(sys.argv[1]).resolve()
output = Path(__file__).resolve().parents[1] / "dist" / "data"
(output / "images").mkdir(parents=True, exist_ok=True)
questions = []

# A few notes need a clearer rule or a more direct answer than upstream provides.
EXPLANATION_OVERRIDES = {
    "1-6-627f7626e7460498d50c0570c86d82f4":
        "На мигающий зелёный движение ещё разрешено. Мигание предупреждает, что скоро загорится запрещающий сигнал. (Пункт 6.2 ПДД)",
    "6-1-fa54532665a63fbf58eaf24a4f44134d":
        "Учитывают массу всего снаряжённого автомобиля, водителя, пассажиров и груза. Верхний предел этой общей массы устанавливает изготовитель. (Пункт 1.2 ПДД)",
    "32-17-02f642e05d8f7b4141b3200865efa52b":
        "По пункту 23.3 ПДД нельзя перевозить груз, если он закрывает внешние световые приборы, "
        "световозвращатели, регистрационные или опознавательные знаки. Если груз выступает более чем "
        "на 1 м спереди или сзади, перевозка допускается при условии его обозначения. "
        "В тёмное время суток и при недостаточной видимости нужны также осветительные приборы. "
        "(Пункт 23.4 ПДД)",
    "40-7-7656238d77262b83e5a8c3f361efe4d4":
        "Если аварийная сигнализация на буксируемом механическом транспортном средстве отсутствует или неисправна, на его задней части закрепляют знак аварийной остановки. На рисунке это знак А. (Пункт 7.3 ПДД)",
}
RULE_SUFFIX = re.compile(
    r'(?<=[.!?])\s*\(((?:пункт|п\.|статья|«)[^()]*)\)\.?$',
    flags=re.IGNORECASE,
)


def explanation(question, question_id):
    note = EXPLANATION_OVERRIDES.get(question_id, question["answer_tip"]).strip()
    note = re.sub(r"(?<=[.!?])(?=[А-ЯЁ«])", " ", note)
    note = re.sub(r"(?<=\))(?=[А-ЯЁ«])", " ", note)
    rule = RULE_SUFFIX.search(note)
    if rule is None:
        return note, ""
    return note[:rule.start()].strip(), rule.group(1).strip()


for path in sorted((source / "questions/A_B/tickets").glob("*.json")):
    for question in json.loads(path.read_text(encoding="utf-8-sig")):
        ticket = int(re.search(r"\d+", question["ticket_number"]).group())
        num = int(re.search(r"\d+", question["title"]).group())
        answers = question["answers"]
        correct = [i for i, answer in enumerate(answers) if answer["is_correct"]]
        assert len(correct) == 1, (ticket, num)
        original = question.get("image") or ""
        image = ""
        if original and Path(original).name != "no_image.jpg":
            image = Path(original).name
            shutil.copyfile(source / original, output / "images" / image)
        question_id = f"{ticket}-{num}-{question['id']}"
        reason, reference = explanation(question, question_id)
        assert reason, (ticket, num, "missing explanation")
        questions.append({
            "id": question_id, "ticket": ticket, "num": num,
            "text": question["question"], "choices": [answer["answer_text"] for answer in answers],
            "correct": correct[0], "image": image, "topics": question.get("topic") or [],
            "explanation": reason, "reference": reference,
        })

questions.sort(key=lambda q: (q["ticket"], q["num"]))
assert [(q["ticket"], q["num"]) for q in questions] == [
    (ticket, num) for ticket in range(1, 41) for num in range(1, 21)
]
(output / "tickets.json").write_text(json.dumps(questions, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"{len(questions)} questions; {len(set(q['image'] for q in questions) - {''})} images")
