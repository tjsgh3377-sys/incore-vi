"""제품 사진의 단색 배경을 제거해 투명 PNG(누끼컷)로 저장한다.

단순 색상 임계값이 아니라 '테두리에서 연결된 배경'만 지운다.
그래야 hemoblock 의 흰 거즈처럼 배경색과 비슷한 피사체 내부가 살아남는다.

  1. 테두리 표본으로 배경색 추정
  2. 배경색과 거의 같은(d <= LO) 픽셀 중 테두리와 이어진 덩어리만 배경으로 확정.
     이때 한 번 침식했다 되살려(NECK) 가는 틈으로 배경이 새는 것을 막는다.
  3. 그 배경을 몇 픽셀 부풀린 띠 안에서만 알파를 부드럽게 깎아 계단현상 제거
  4. 반투명 픽셀은 배경색을 역산해 빼서 회색 테두리(fringe) 제거

사용법:
    python cutout.py [--fill] <이미지...>       # 원본 옆에 .png 로 저장
    --fill 은 윤곽선 안쪽 구멍을 메운다. 올가미·고리처럼 진짜 뚫린 제품엔 금지.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

LO = 3         # 이 이하 차이는 완전한 배경 (배경이 정확히 248 단색이라 낮게 잡는다.
               # 8 이상이면 hylacell 의 흰 박스 면까지 배경으로 새어 들어간다)
HI = 34        # 이 이상 차이는 완전한 피사체
FEATHER = 3    # 배경을 부풀려 부드럽게 처리할 띠 두께(px)
NECK = 3       # 이보다 가는 통로로는 배경이 피사체 안으로 새지 못한다
CLOSE = 4      # --fill 옵션에서 윤곽선의 틈을 메울 폭(px)


def cutout(path, out_path, fill=False):
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im).astype(np.float64)
    rgb = a[..., :3]

    # 1. 테두리 1px 링의 중앙값 = 배경색
    border = np.concatenate([rgb[0, :], rgb[-1, :], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)

    # 2. 배경색과의 채널 최대 거리
    dist = np.abs(rgb - bg).max(axis=2)

    # 테두리와 연결된 배경 덩어리만 남긴다.
    # 흰 포장박스처럼 피사체 면이 배경색과 거의 같으면 가는 틈으로 배경이
    # 새어 들어와 제품 속이 뚫린다. 그래서 한 번 침식해 가는 통로를 끊고,
    # 테두리와 이어진 덩어리만 고른 뒤 원래 범위 안에서 다시 부풀린다.
    seed = dist <= LO
    st = ndimage.generate_binary_structure(2, 2)
    core = ndimage.binary_erosion(seed, st, iterations=NECK, border_value=1)
    lab, n = ndimage.label(core)
    if n == 0:
        return None
    edge_labels = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    edge_labels.discard(0)
    if not edge_labels:
        return None
    background = ndimage.binary_propagation(
        np.isin(lab, list(edge_labels)), structure=st, mask=seed
    )

    # 2b. (fill 옵션) 흰 포장박스처럼 윤곽선이 1px 이고 면이 배경색과 완전히
    # 같은 경우엔 위 방법으로도 뚫린다. 윤곽선의 틈을 닫은 뒤 그 안쪽 구멍을
    # 되살린다. 고리·올가미처럼 진짜 뚫린 제품에는 쓰면 안 되므로 옵션이다.
    if fill:
        outline = ndimage.binary_closing(~background, st, iterations=CLOSE)
        holes = ndimage.binary_fill_holes(outline) & ~outline
        background &= ~holes

    # 3. 배경을 FEATHER 만큼 부풀린 띠 안에서만 알파를 계산
    band = ndimage.binary_dilation(
        background, ndimage.generate_binary_structure(2, 2), iterations=FEATHER
    )
    ramp = np.clip((dist - LO) / float(HI - LO), 0.0, 1.0)
    alpha = np.where(band, ramp, 1.0)
    alpha = np.where(background, np.minimum(alpha, ramp), alpha)

    # 4. 반투명 픽셀에서 배경색 성분을 역산해 제거 (회색 테두리 방지)
    out_rgb = rgb.copy()
    partial = (alpha > 0.02) & (alpha < 0.98)
    if partial.any():
        av = alpha[partial][:, None]
        px = rgb[partial]
        out_rgb[partial] = np.clip((px - (1.0 - av) * bg) / av, 0, 255)

    out = np.dstack([out_rgb, alpha * 255.0]).astype(np.uint8)
    Image.fromarray(out, "RGBA").save(out_path, optimize=True)

    return {
        "bg": tuple(bg.astype(int)),
        "removed": float(background.mean()),
        "soft": int(partial.sum()),
    }


def main(files):
    fill = "--fill" in files
    files = [f for f in files if not f.startswith("--")]
    for f in files:
        base = os.path.basename(f)
        out = os.path.splitext(f)[0] + ".png"
        try:
            r = cutout(f, out, fill=fill)
        except Exception as exc:  # noqa: BLE001
            print(f"{base:24} ERROR {exc}")
            continue
        if r is None:
            print(f"{base:24} SKIP (배경 덩어리를 찾지 못함)")
            continue
        print(
            f"{base:24} -> {os.path.basename(out):24} "
            f"bg={r['bg']} removed={r['removed']*100:5.1f}% soft={r['soft']}"
        )


if __name__ == "__main__":
    main(sys.argv[1:])
