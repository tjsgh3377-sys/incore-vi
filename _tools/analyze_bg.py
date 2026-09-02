"""제품 이미지의 배경색·균일도를 조사한다 (누끼 작업 전 사전 분석)."""
import glob
import os

import numpy as np
from PIL import Image

SRC = r"C:\Users\mycom\Downloads\test\incore_vi\assets\products"

for f in sorted(glob.glob(os.path.join(SRC, "*"))):
    im = Image.open(f)
    mode = im.mode
    a = np.asarray(im.convert("RGBA"))
    alpha = a[..., 3]
    rgb = a[..., :3].astype(int)

    # 테두리 1픽셀 링을 배경 표본으로 사용
    border = np.concatenate([rgb[0, :], rgb[-1, :], rgb[:, 0], rgb[:, -1]])
    med = np.median(border, axis=0).astype(int)
    std = border.std(axis=0).max()

    # 배경색과의 거리 분포 → 피사체가 차지하는 비율 추정
    dist = np.abs(rgb - med).max(axis=2)
    fg_ratio = (dist > 30).mean()

    print(
        f"{os.path.basename(f):24} {mode:5} {im.size[0]:4}x{im.size[1]:<4} "
        f"bg={tuple(med)} border_std={std:5.1f} alpha_min={alpha.min():3} "
        f"fg={fg_ratio*100:5.1f}%"
    )
