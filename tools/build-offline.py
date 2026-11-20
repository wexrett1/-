"""Build a self-contained browser copy of the PDD trainer."""
import argparse
import base64
import json
import re
from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / "dist"
MODULES = ("config.js", "course.js", "lesson-notes.js", "study.js", "app.js")


def read(name):
    return (ASSETS / name).read_text(encoding="utf-8")


def data_url(path, mime):
    payload = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{payload}"


def build(output):
    questions = json.loads(read("data/tickets.json"))
    image_names = {item["image"] for item in questions if item["image"]}
    images = {name: data_url(ASSETS / "data" / "images" / name, "image/jpeg") for name in sorted(image_names)}
    data = json.dumps({"questions": questions, "images": images}, ensure_ascii=False, separators=(",", ":"))
    scripts = ["globalThis.PDD_OFFLINE_DATA = " + data.replace("<", r"\u003c") + ";"]
    for module in MODULES:
        source = re.sub(r"^import .*;\n", "", read(module), flags=re.M)
        scripts.append(re.sub(r"^export ", "", source, flags=re.M))
    css = read("style.css")
    html = re.sub(r"<script[^\n]+</script>\n", "", read("index.html"))
    html = html.replace('<link rel="stylesheet" href="./style.css">', f"<style>\n{css}\n</style>")
    code = "\n".join(scripts)
    html = html.replace("</body>", f"<script>\n{code}\n</script>\n</body>")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html, encoding="utf-8")
    print(f"{output.name}: {len(questions)} questions, {len(images)} illustrations")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    build(parser.parse_args().output)
