"""Inline src/data.json into src/template.html -> index.html."""
import pathlib
here = pathlib.Path(__file__).parent
data = (here / "data.json").read_text(encoding="utf8").replace("</", "<\\/")
html = (here / "template.html").read_text(encoding="utf8").replace("/*DATA*/", data, 1)
(here.parent / "index.html").write_text(html, encoding="utf8")
print("wrote", here.parent / "index.html", len(html.encode()), "bytes")
