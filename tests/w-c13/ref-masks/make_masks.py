"""Reference silhouette masks for the X-T5 fidelity gate (W-C13 m2, issue #16: IoU >= 0.95 front, top and side).

Provenance script, run once on the reference host (system Python with numpy, scipy and Pillow); CI only reads its
output. The source images are the official 2000 px silver X-T5 renders of the reference pack (portfolio-assets/xt5/
refs/raw, URLs in assets-src/3d/camera_xt/data/references.json); they are never committed (D-011 brief).

  python tests/w-c13/ref-masks/make_masks.py [<portfolio-assets/xt5 dir>]

For each view: threshold the white background away (any channel < 236), close, fill holes, keep the blobs bigger
than 0.2 % of the largest (the strap lugs can be separate), then resample into a fixed millimetre frame at 10 px/mm
through the view's calibration (refs/ortho/calibration.json, '<view>_silver2k': px -> mm, registered to the run-1
frame with IoU 0.995-0.9996). Writes mask_<view>.png (white = camera) and masks.json (frames, axes, sources).
Frame: refs mm, +X camera left, +Y up, +Z out of the lens; X = 0 lens axis, Y = 0 base, Z = 0 sensor plane.
Column c covers h in [h0 + c / ppm, h0 + (c + 1) / ppm); row r covers v in [v1 - (r + 1) / ppm, v1 - r / ppm).
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.expanduser("~"), "Documents", "GitHub",
                                                             "portfolio-assets", "xt5")
CAL = json.load(open(os.path.join(ASSETS, "refs", "ortho", "calibration.json")))
REFS = json.load(open(os.path.join(HERE, "..", "..", "..", "assets-src", "3d", "camera_xt", "data", "references.json"),
                      encoding="utf-8"))
PPM = 10.0
# view: (h axis, v axis, (h0, h1), (v0, v1)) in mm; the lens is not on these bodies (official body-only renders)
FRAMES = {
    "front": ("X", "Y", (-90.0, 70.0), (-5.0, 100.0)),
    "top": ("X", "Z", (-90.0, 70.0), (-45.0, 35.0)),
    "left": ("Z", "Y", (-45.0, 35.0), (-5.0, 100.0)),
    "right": ("Z", "Y", (-45.0, 35.0), (-5.0, 100.0)),
}


def mask_of(img):
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    m = a.min(axis=2) < 236
    m = ndimage.binary_closing(m, iterations=2)
    m = ndimage.binary_fill_holes(m)
    lab, n = ndimage.label(m)
    if n > 1:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        m = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 0.002 * sizes.max()])
    return m


def resample(c, frame, m):
    _, _, (h0, h1), (v0, v1) = frame
    W, H = int((h1 - h0) * PPM), int((v1 - v0) * PPM)
    hh = h0 + (np.arange(W) + 0.5) / PPM
    vv = v1 - (np.arange(H) + 0.5) / PPM
    px = c["px0"] + (hh - c["h0"]) / c["hs"]
    py = c["py0"] + (vv - c["v0"]) / c["vs"]
    PX, PY = np.meshgrid(np.round(px).astype(int), np.round(py).astype(int))
    ok = (PX >= 0) & (PX < m.shape[1]) & (PY >= 0) & (PY < m.shape[0])
    out = np.zeros((H, W), bool)
    out[ok] = m[PY[ok], PX[ok]]
    return out


def main():
    urls = {d["file"]: d["url"] for d in REFS["downloads"]}
    out = {"ppm": PPM, "frame": "refs mm: +X camera left, +Y up, +Z out of the lens; X=0 lens axis, Y=0 base, Z=0 sensor",
           "rows": "row 0 is the frame's top (v1)", "views": {}}
    for view, frame in FRAMES.items():
        c = CAL[f"{view}_silver2k"]
        assert (c["h"], c["v"]) == frame[:2], (view, c["h"], c["v"])
        m = resample(c, frame, mask_of(Image.open(os.path.join(ASSETS, "refs", "raw", c["img"]))))
        Image.fromarray((m * 255).astype(np.uint8)).save(os.path.join(HERE, f"mask_{view}.png"), optimize=True)
        out["views"][view] = {"h": frame[0], "v": frame[1], "hRange": frame[2], "vRange": frame[3],
                              "size": [m.shape[1], m.shape[0]], "pixels": int(m.sum()), "source": c["img"],
                              "sourceUrl": urls.get(c["img"]), "calibration": f"{view}_silver2k"}
        print(view, m.shape, int(m.sum()))
    json.dump(out, open(os.path.join(HERE, "masks.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
