"""홈 화면 제품 카드용 썸네일을 만든다.

제품 사진마다 투명 여백의 양이 달라서, 같은 크기 칸에 넣어도
어떤 제품은 크고 어떤 제품은 작게 보였다. 투명 여백을 모두 잘라내
피사체가 캔버스를 꽉 채우게 하면 object-fit:contain 이 각 제품을
칸에 최대로 키워 넣으므로 모든 카드에서 크기가 고르게 보인다.

  python thumb.py <출력폴더> <이미지...>
"""
import os
import sys

import numpy as np
from PIL import Image

MARGIN = 0.04  # 잘라낸 뒤 사방에 남길 여백(피사체 크기 대비)


def thumb(path, out_path):
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > 8)
    if len(xs) == 0:
        return None
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    cut = im.crop(box)

    pad = int(round(max(cut.width, cut.height) * MARGIN))
    canvas = Image.new("RGBA", (cut.width + pad * 2, cut.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(cut, (pad, pad))
    canvas.save(out_path, optimize=True)
    return im.size, canvas.size


def main(out_dir, files):
    os.makedirs(out_dir, exist_ok=True)
    for f in files:
        name = os.path.basename(f)
        r = thumb(f, os.path.join(out_dir, name))
        if r is None:
            print(f"{name:22} SKIP (불투명 픽셀 없음)")
            continue
        print(f"{name:22} {r[0][0]}x{r[0][1]} -> {r[1][0]}x{r[1][1]}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
