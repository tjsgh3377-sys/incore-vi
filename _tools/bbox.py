"""투명 여백을 뺀 실제 피사체 영역이 캔버스에서 차지하는 비율을 잰다.

이 비율이 제품마다 다르면 같은 칸에 넣어도 크기가 달라 보인다.
"""
import os
import sys

import numpy as np
from PIL import Image

for f in sys.argv[1:]:
    a = np.asarray(Image.open(f).convert("RGBA"))[..., 3]
    ys, xs = np.where(a > 8)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    h, w = a.shape
    print(f"{os.path.basename(f):22} canvas={w}x{h:<4} subject={bw}x{bh:<4} "
          f"fill_w={bw/w*100:5.1f}% fill_h={bh/h*100:5.1f}%")
