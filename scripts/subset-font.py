"""Regenerate the small web font; the full font remains a CSS fallback."""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
import html
import unicodedata

root = Path(__file__).resolve().parent.parent
source = root / "src"
original = source / "assets/font.woff2"
output = source / "assets/font-subset.woff2"
text = "".join(
    path.read_text(encoding="utf-8")
    for path in sorted(source.rglob("*"))
    if path.suffix in {".html", ".css", ".js", ".json", ".svg"}
)
text = unicodedata.normalize("NFC", html.unescape(text))
font = TTFont(original, recalcTimestamp=False)
options = subset.Options()
options.name_IDs = ["*"]
options.name_legacy = True
options.name_languages = ["*"]
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=set(map(ord, text)) | set(range(32, 127)))
subsetter.subset(font)
# The source reserves the name Pretendard. Give the derived font its own name.
names = {1: "Ddirori Web", 3: "DdiroriWeb-Regular", 4: "Ddirori Web", 6: "DdiroriWeb-Regular", 16: "Ddirori Web", 25: "DdiroriWeb"}
for record in font["name"].names:
    if record.nameID in names:
        record.string = names[record.nameID].encode(record.getEncoding())
font.flavor = "woff2"
font.save(output)
print(f"Web font: {original.stat().st_size:,} -> {output.stat().st_size:,} bytes")
