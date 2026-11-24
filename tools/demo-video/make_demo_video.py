"""Rebuild the ASCII Camera demo video from the original statue MOV (local only, nothing is uploaded).

    python3 tools/demo-video/make_demo_video.py <original.mov> <work-dir>

Writes <work-dir>/statue-demo.mp4 and <work-dir>/statue-poster.jpg (copy them to src/demo/).
Never modifies the original. Needs ffmpeg (libx264), Python 3, numpy, opencv-python, scipy.
See docs/demo-video.zh-CN.md for why each step exists.
"""
import os
import subprocess
import sys

import cv2
import numpy as np

SRC, WORK = sys.argv[1], sys.argv[2]
os.makedirs(WORK, exist_ok=True)
N, H, W = 300, 720, 1280

# --- 1. framing: 0.84x crop around the statue + pedestal, 1280x720 (source: 4096x2304 Photo-JPEG, 4:2:2, full range)
CROP = 'crop=3440:1936:328:208'
crop_raw = os.path.join(WORK, 'crop1280.raw')
if not os.path.exists(crop_raw):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', SRC, '-vf',
                    f'{CROP},scale=1280:720:flags=lanczos+accurate_rnd+full_chroma_int:in_range=full:out_range=full,format=rgb24',
                    '-f', 'rawvideo', crop_raw], check=True)
src = np.memmap(crop_raw, np.uint8, 'r', shape=(N, H, W, 3))
small = np.stack([cv2.resize(src[n], (640, 360), interpolation=cv2.INTER_AREA) for n in range(N)])
af = small.astype(np.float32)

# --- 2. clean background model: camera is locked off, wall / floor never change; inpaint what the statue covers
med = np.median(small, axis=0).astype(np.uint8)
std = af.std(0).mean(-1)
env = cv2.dilate((std > 3).astype(np.uint8), np.ones((11, 11), np.uint8))
M = env.copy()
M[221:359, 110:530] = 1  # pedestal box (static)
plate = cv2.cvtColor(med, cv2.COLOR_RGB2BGR)
bgm = cv2.inpaint(plate, M * 255, 21, cv2.INPAINT_TELEA)
bgm = cv2.GaussianBlur(bgm, (0, 0), 4)
bgm = cv2.cvtColor(np.where(M[..., None] > 0, bgm, plate), cv2.COLOR_BGR2RGB).astype(np.float32)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# --- 3. torso matte per frame (differs from the background model), holes filled, largest part only
alpha = np.zeros((N, 360, 640), np.float32)
for n in range(N):
    d = np.sqrt(((af[n] - bgm) ** 2).sum(-1))
    soft = smoothstep(9.0, 24.0, d)
    hard = cv2.morphologyEx((d > 16).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    ff = hard.copy()
    cv2.floodFill(ff, np.zeros((362, 642), np.uint8), (0, 0), 1)
    holes = (ff == 0).astype(np.float32)
    num, lab, stats, _ = cv2.connectedComponentsWithStats(np.maximum(hard, holes.astype(np.uint8)), 8)
    keep = np.zeros_like(hard)
    if num > 1:
        keep = (lab == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    keep = cv2.dilate(keep, np.ones((5, 5), np.uint8))
    alpha[n] = cv2.GaussianBlur(np.maximum(soft, holes) * keep, (0, 0), 1.1)
alpha = 0.25 * np.roll(alpha, 1, 0) + 0.5 * alpha + 0.25 * np.roll(alpha, -1, 0)  # wraps: one full turn
torso_env = env.astype(np.float32)
torso_env[240:] = 0  # below the pedestal top the pedestal model takes over
torso_env = cv2.GaussianBlur(torso_env, (0, 0), 2)

# --- 4. pedestal: three cylinders fitted to the plate edges (centre x, half-width, top, side bottom, ellipse half-height)
CX = 639.5
TIERS = [(261.5, 477.5, 508.5, 14.5), (320.5, 525.0, 554.5, 23.5), (386.5, 578.0, 638.0, 35.5)]
BASE_ELLIPSE = 49.5  # lower edge of the bottom tier
S = 4
ped = np.zeros((H * S, W * S), np.uint8)
for a, top, bot, e in TIERS:
    cv2.ellipse(ped, (round(CX * S), round(top * S)), (round(a * S), round(e * S)), 0, 0, 360, 255, -1)
    cv2.rectangle(ped, (round((CX - a) * S), round(top * S)), (round((CX + a) * S), round(bot * S)), 255, -1)
a3, _, bot3, _ = TIERS[2]
cv2.ellipse(ped, (round(CX * S), round(bot3 * S)), (round(a3 * S), round(BASE_ELLIPSE * S)), 0, 0, 360, 255, -1)
ped = cv2.resize(ped, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255

# --- 5. grade
K_BG, GAMMA, CONTRAST, SAT, PED_GAMMA, PED_CONTRAST, GLOW_KEEP, FLATTEN = 0.36, 0.85, 1.30, 1.03, 1.0, 1.12, 0.62, 0.7
LUMA = np.array([0.299, 0.587, 0.114], np.float32)  # same weights as the ASCII renderer
bgy = cv2.GaussianBlur((cv2.resize(bgm, (W, H), interpolation=cv2.INTER_CUBIC) / 255 * LUMA).sum(-1), (0, 0), 25)
FLAT = ((np.median(bgy) / np.maximum(bgy, 1e-3)) ** FLATTEN).astype(np.float32)[..., None]


def tone(y, gamma, contrast):
    y2 = 0.5 + (np.power(np.clip(y, 0, 1), gamma) - 0.5) * contrast
    hi, lo = 0.85, 0.03
    y2 = np.where(y2 > hi, hi + (1 - hi) * np.tanh((y2 - hi) / (1 - hi)), y2)
    return np.where(y2 < lo, lo * np.exp((y2 - lo) / lo), y2)


def lift(f, y, g, c):
    ys = tone(y, g, c)
    out = ys + (f * (ys / np.maximum(y, 1e-4)) - ys) * SAT
    mx = out.max(-1, keepdims=True)
    t = np.where(mx > 1, (1 - ys) / np.maximum(mx - ys, 1e-4), 1)
    return ys + (out - ys) * np.clip(t, 0, 1)


rng = np.random.default_rng(7)
graded = os.path.join(WORK, 'graded.raw')
with open(graded, 'wb') as out:
    for n in range(N):
        f = src[n].astype(np.float32) / 255
        t = np.clip(cv2.resize(alpha[n] * torso_env, (W, H), interpolation=cv2.INTER_LINEAR), 0, 1)
        wt = t[..., None]
        wp = ((1 - t) * ped)[..., None]
        y = (f * LUMA).sum(-1, keepdims=True)
        pink = np.clip((f[..., :1] - f[..., 1:2]) * 4.0, 0, 1)  # magenta floor light keeps more brightness
        bg = f * (K_BG + (GLOW_KEEP - K_BG) * pink) * FLAT
        o = wt * lift(f, y, GAMMA, CONTRAST) + wp * lift(f, y, PED_GAMMA, PED_CONTRAST) + (1 - wt - wp) * bg
        o = o * 255 + (rng.random(o.shape, np.float32) - rng.random(o.shape, np.float32)) * 0.6  # TPDF dither
        out.write(np.clip(o + 0.5, 0, 255).astype(np.uint8).tobytes())

# --- 6. web encode: H.264 High, yuv420p, BT.709, 30 fps, faststart, no audio, no metadata
mp4 = os.path.join(WORK, 'statue-demo.mp4')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', '30', '-i', graded,
                '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p',
                '-c:v', 'libx264', '-preset', 'slower', '-tune', 'film', '-crf', '18', '-profile:v', 'high', '-level:v', '4.0',
                '-g', '60', '-keyint_min', '30', '-sc_threshold', '0', '-bf', '2',
                '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                '-movflags', '+faststart', '-an', '-map_metadata', '-1', mp4], check=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp4, '-vf', 'select=eq(n\\,0)', '-frames:v', '1', '-q:v', '4',
                os.path.join(WORK, 'statue-poster.jpg')], check=True)
print('wrote', mp4)
