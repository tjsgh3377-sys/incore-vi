"""누끼 결과 검수용 대비 시트를 만든다.

왼쪽: 실제 카드 배경(#f4f6f8) 위 — 최종 모습
오른쪽: 마젠타 위 — 남은 회색 테두리/구멍이 있으면 바로 드러난다
"""
import os
import sys

from PIL import Image

CARD = (244, 246, 248)
CHECK = (255, 0, 255)


def main(files, out_path):
    rows = []
    for f in files:
        im = Image.open(f).convert("RGBA")
        rows.append((os.path.basename(f), im))

    w = max(im.width for _, im in rows)
    h = sum(im.height for _, im in rows)
    sheet = Image.new("RGB", (w * 2, h), (255, 255, 255))

    y = 0
    for _, im in rows:
        left = Image.new("RGB", im.size, CARD)
        left.paste(im, (0, 0), im)
        right = Image.new("RGB", im.size, CHECK)
        right.paste(im, (0, 0), im)
        sheet.paste(left, (0, y))
        sheet.paste(right, (w, y))
        y += im.height

    sheet.save(out_path)
    print(f"{out_path}  {sheet.size[0]}x{sheet.size[1]}")
    for name, _ in rows:
        print("  " + name)


if __name__ == "__main__":
    main(sys.argv[2:], sys.argv[1])
