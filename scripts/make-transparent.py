#!/usr/bin/env python3
"""
Turn the High State of Mind artwork into transparent PNGs.

Two different problems, two different techniques:

CIRCLE LOGOS sit on a black square. Colour-keying black would punch holes
in the artwork, which is full of near-black night sky. So instead we find
the circle geometrically and mask everything outside it. The interior is
left completely untouched.

THE ASTRONAUT sits on white — but the spacesuit is also white. Keying
white globally would delete the suit. So we flood-fill inward from the
border and only clear background that is actually connected to the edge.
Enclosed white (the suit) is never reached.
"""

from collections import deque
import sys

import numpy as np
from PIL import Image


def find_circle(rgb: np.ndarray, bg_threshold: int = 28):
    """Locate the artwork disc: bounding box of non-background pixels."""
    luma = rgb.astype(np.int32).sum(axis=2) / 3
    content = luma > bg_threshold

    rows = np.where(content.any(axis=1))[0]
    cols = np.where(content.any(axis=0))[0]
    if rows.size == 0 or cols.size == 0:
        raise ValueError("no content found")

    top, bottom = rows[0], rows[-1]
    left, right = cols[0], cols[-1]

    cy = (top + bottom) / 2.0
    cx = (left + right) / 2.0
    # Half the smaller span — a circle inscribed in the content bounds.
    radius = min(bottom - top, right - left) / 2.0
    return cx, cy, radius


def circle_alpha(size, cx, cy, radius, feather=1.5):
    """Anti-aliased disc mask. Feathering avoids a jagged edge."""
    w, h = size
    ys, xs = np.mgrid[0:h, 0:w]
    dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
    alpha = np.clip((radius - dist) / feather + 0.5, 0.0, 1.0)
    return (alpha * 255).astype(np.uint8)


def cut_circle(src: str, dst: str, inset: float = 1.0):
    img = Image.open(src).convert("RGBA")
    rgb = np.array(img)[:, :, :3]

    cx, cy, radius = find_circle(rgb)
    alpha = circle_alpha(img.size, cx, cy, radius - inset)

    out = np.array(img)
    out[:, :, 3] = alpha
    # Zero the colour of fully transparent pixels so no black halo shows
    # if the PNG is ever flattened onto a light background.
    out[alpha == 0] = (0, 0, 0, 0)

    Image.fromarray(out, "RGBA").save(dst)
    kept = int((alpha > 0).sum())
    print(f"  {dst}  disc r={radius:.0f}  {kept/alpha.size:.0%} opaque")


def _components(mask):
    """Label 8-connected True regions. Returns (labels, sizes)."""
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    sizes = [0]
    nxt = 1
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or labels[sy, sx]:
                continue
            q = deque([(sy, sx)])
            labels[sy, sx] = nxt
            n = 0
            while q:
                y, x = q.popleft()
                n += 1
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx_ = y + dy, x + dx
                        if (
                            0 <= ny < h
                            and 0 <= nx_ < w
                            and mask[ny, nx_]
                            and not labels[ny, nx_]
                        ):
                            labels[ny, nx_] = nxt
                            q.append((ny, nx_))
            sizes.append(n)
            nxt += 1
    return labels, sizes


def flood_clear(src: str, dst: str, tol: int = 38, speck: int = 600):
    """
    Clear the backdrop behind a subject that shares the backdrop's colour.

    Three passes, because one is not enough here:
      1. Flood inward from the border, 8-connected so the fill can squeeze
         through anti-aliased gaps a 4-connected fill would stop at.
      2. Clear *enclosed* pockets of near-pure white — the gap between the
         smoke and the helmet is sealed off from the border, so pass 1
         can never reach it. The spacesuit survives because it is shaded
         grey, not pure white.
      3. Drop tiny leftover islands (stray specks in the source art).
    """
    img = Image.open(src).convert("RGBA")
    arr = np.array(img)
    h, w = arr.shape[:2]
    rgb = arr[:, :, :3].astype(np.int16)

    corners = np.array(
        [rgb[0, 0], rgb[0, w - 1], rgb[h - 1, 0], rgb[h - 1, w - 1]], dtype=np.int16
    )
    bg = corners.mean(axis=0)
    similar = np.abs(rgb - bg).max(axis=2) <= tol

    # Pass 1 — border-connected background, 8-connected.
    visited = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if similar[y, x] and not visited[y, x]:
                visited[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if similar[y, x] and not visited[y, x]:
                visited[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                ny, nx_ = y + dy, x + dx
                if (
                    0 <= ny < h
                    and 0 <= nx_ < w
                    and not visited[ny, nx_]
                    and similar[ny, nx_]
                ):
                    visited[ny, nx_] = True
                    q.append((ny, nx_))

    # Pass 2 — sealed-off pure-white pockets.
    pure = (np.abs(rgb - 255).max(axis=2) <= 12) & ~visited
    if pure.any():
        lbl, sizes = _components(pure)
        for i, n in enumerate(sizes):
            if i and n >= speck:
                visited |= lbl == i

    arr[visited] = (0, 0, 0, 0)

    # Pass 3 — discard specks disconnected from the subject.
    solid = ~visited
    lbl, sizes = _components(solid)
    if len(sizes) > 2:
        keep = int(np.argmax(sizes))
        drop = np.isin(lbl, [i for i, n in enumerate(sizes) if i and i != keep and n < speck * 20])
        arr[drop] = (0, 0, 0, 0)
        visited |= drop

    keep_mask = ~visited
    rows = np.where(keep_mask.any(axis=1))[0]
    cols = np.where(keep_mask.any(axis=0))[0]
    arr = arr[rows[0] : rows[-1] + 1, cols[0] : cols[-1] + 1]

    Image.fromarray(arr, "RGBA").save(dst)
    print(
        f"  {dst}  cleared {visited.sum()/visited.size:.0%}"
        f"  -> {arr.shape[1]}x{arr.shape[0]}"
    )


def crop_quadrant(src: str, dst: str, col: int, row: int, cols: int = 2, rows: int = 2):
    """Pull one logo out of a contact sheet, then disc-mask it."""
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    cw, ch = w // cols, h // rows
    tile = img.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch))
    tmp = dst + ".tile.png"
    tile.save(tmp)
    cut_circle(tmp, dst)
    import os

    os.remove(tmp)


if __name__ == "__main__":
    up = sys.argv[1]
    out = sys.argv[2]
    print("Processing High State of Mind assets:")
    # Big single circle, astronaut included — for link/share cards.
    cut_circle(f"{up}/f652d2b4-image.png", f"{out}/high-state-circle-share.png")
    # Top-right of the sheet is the no-astronaut mark — for in-app branding.
    crop_quadrant(f"{up}/11ad4971-image.png", f"{out}/high-state-circle-base.png", 1, 0)
    # Astronaut alone, floats over the base mark.
    flood_clear(f"{up}/c95cfd0c-image.jpg", f"{out}/high-state-astronaut.png")
