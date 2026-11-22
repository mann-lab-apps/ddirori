# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow>=11,<14", "fonttools[woff]>=4.50,<5", "resvg-py>=0.2,<1", "imageio-ffmpeg>=0.6,<1"]
# ///
"""Render the teacher-facing Short with the same audio, font and artwork as the web lesson."""
from array import array
from functools import cache
from io import BytesIO
from pathlib import Path
import math
import re
import subprocess
import sys
from tempfile import TemporaryDirectory
import wave

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont
from imageio_ffmpeg import get_ffmpeg_exe
from resvg_py import svg_to_bytes

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'src/assets'
TOKENS = (ROOT / 'src/lessons/ddirori-tokens.css').read_text().split('[data-theme="dark"]')[0]
PALETTE = dict(re.findall(r'--dd-([\w-]+): (#[\dA-Fa-f]+);', TOKENS))
INK, PAPER = PALETTE['text'], PALETTE['surface']
SKY, PEACH, BLUE = PALETTE['sky'], PALETTE['peach'], PALETTE['action']
W, H, FPS = 1080, 1920, 30
FRAMES_PER_BEAT = 20  # 90 BPM at 30 fps
CENTRES = (173, 385, 597, 809)
RESPONSE = ('짝', '쉼', '짝', '짝')
DURATION_BEATS = 26
TARGET = ROOT / 'docs/lesson-shorts/echo.mp4'

# Each tuple starts on the first beat of a bar. All directions are burned in.
SCENES = [
    ('소리를 켜고 준비해요', ('한 번 듣고', '따라 칠까요?'), '건반을 듣고, 다음 마디에 손뼉으로 답해요.', SKY),
    ('먼저 듣기', ('건반 리듬을', '기억해요.'), '톡 소리는 네 박을 계속 짚어 줘요.', SKY),
    ('내 차례', ('이번엔', '손뼉 차례!'), '방금 들은 리듬을 그대로 쳐 보세요.', PEACH),
    ('정답 듣기', ('둘째 박은', '쉬어요.'), '하나, 셋, 넷에 건반 소리가 나요.', SKY),
    ('함께 치기', ('짝, 쉬고,', '짝, 짝.'), '발끝으로 네 박을 짚으며 다시 한번 쳐요.', PEACH),
    ('선생님을 위한 5분 활동', ('이번엔 학생이', '문제를 내요.'), '채널 프로필에서 〈무료 5분 음악수업〉을 여세요.', PAPER),
]


@cache
def font_data():
    font = TTFont(ASSETS / 'font.woff2')
    font.flavor = None
    stream = BytesIO()
    font.save(stream)
    return stream.getvalue()


@cache
def face(size, weight):
    font = ImageFont.truetype(BytesIO(font_data()), size=size)
    font.set_variation_by_axes([weight])
    return font


def label(draw, xy, content, size, weight=550, color=INK, anchor='lt'):
    font = face(size, weight)
    box = draw.textbbox(xy, content, font=font, anchor=anchor)
    if not (65 <= box[0] and box[2] <= 918 and 160 <= box[1] and box[3] <= 1480):
        raise ValueError(f'Caption outside reading area: {content} {box}')
    draw.text(xy, content, font=font, fill=color, anchor=anchor)


@cache
def art(name, width):
    return Image.open(BytesIO(svg_to_bytes(svg_path=str(ASSETS / (name + '.svg')), width=width))).convert('RGBA')


def paste(image, asset, xy):
    image.paste(asset, xy, asset)


@cache
def layout(scene):
    stage, lines, direction, background = SCENES[scene]
    image = Image.new('RGB', (W, H), background)
    d = ImageDraw.Draw(image)
    d.line((83, 185, 875, 185), fill=INK, width=3)
    paste(image, art('brand-icon', 60), (83, 213))
    paste(image, art('wordmark', 112), (159, 214))
    label(d, (300, 231), '5분 음악수업', 34, 580)
    if scene < 5:
        label(d, (875, 231), '90 BPM', 32, 610, anchor='rt')
    label(d, (84, 383), stage, 39, 630)
    for y, line in zip((459, 604), lines):
        label(d, (77, y), line, 131, 830)

    # A four-beat strip stays in the same position between listening and replying.
    panel = PAPER if scene < 5 else SKY
    d.rounded_rectangle((57, 835, 924, 1255), radius=55, fill=panel)
    if scene < 5:
        d.line((CENTRES[0], 1111, CENTRES[-1], 1111), fill=INK, width=4)
        label(d, (83, 1370), direction, 41, 590)
    else:
        paste(image, art('bach-happy', 192), (78, 875))
        label(d, (288, 897), '한 마디 듣고', 51, 680)
        label(d, (288, 970), '손뼉으로 대답하기', 59, 760)
        d.line((91, 1090, 873, 1090), fill=INK, width=3)
        label(d, (102, 1144), '같은 음원과 5분 수업 진행안', 44, 600)
        label(d, (82, 1330), '채널 프로필에서', 43, 550)
        label(d, (80, 1400), '무료 5분 음악수업 열기  →', 55, 760)
    # Cropped keyboard on the lower bleed, below the instructional text.
    d.rectangle((0, 1632, W, H), fill=PAPER)
    d.line((0, 1632, W, 1632), fill=INK, width=4)
    for key in range(8):
        x = key * 175 - 67
        d.line((x, 1632, x, H), fill=INK, width=3)
        if key % 7 in (1, 2, 4, 5, 6):
            d.rounded_rectangle((x-43, 1632, x+43, 1795), radius=12, fill=INK)
    return image


def frame(index):
    beat, step = divmod(index, FRAMES_PER_BEAT)
    scene = min(beat // 4, 5)
    image = layout(scene).copy()
    if scene == 5:
        return image
    d = ImageDraw.Draw(image)
    active = beat % 4
    bounce = math.sin(math.pi * step / FRAMES_PER_BEAT)
    for cell, x in enumerate(CENTRES):
        selected = cell == active
        radius = 79 + round(5 * (1-bounce)) if selected else 72
        color = INK if selected else PAPER
        d.ellipse((x-radius, 1111-radius, x+radius, 1111+radius), fill=color, outline=INK, width=4)
        glyph = RESPONSE[cell] if scene >= 3 else str(cell + 1)
        label(d, (x, 1109), glyph, 77, 730, PAPER if selected else INK, 'mm')
    # The beat marker moves vertically inside its slot, never over the caption.
    icon = art('bach-happy' if scene >= 2 else 'bach', 118)
    paste(image, icon, (CENTRES[active]-59, 918-round(39*bounce)))
    return image


def make_audio(folder):
    subprocess.run(['node', '--input-type=module', '-e',
                    'import { buildLessonAudio } from "./scripts/build-lesson-audio.mjs"; buildLessonAudio(process.argv[1])',
                    str(folder)], cwd=ROOT, check=True)
    with wave.open(str(folder / 'audio/echo.wav'), 'rb') as track:
        rate = track.getframerate()
        assert track.getnchannels() == 1 and track.getsampwidth() == 2
        raw = track.readframes(track.getnframes())
    # The website's second bar contains only the time clicks.
    bar_bytes = round(rate * 60 / 90 * 4) * 2
    assert len(raw) == 2 * bar_bytes
    ending = array('h')
    ending.frombytes(raw[:bar_bytes])
    if sys.byteorder != 'little':
        ending.byteswap()
    softened = array('h', (round(sample * .48) for sample in ending))
    if sys.byteorder != 'little':
        softened.byteswap()
    pcm = raw[bar_bytes:] + raw * 2 + softened.tobytes() + bytes(bar_bytes // 2)
    path = folder / 'sound.wav'
    with wave.open(str(path), 'wb') as sound:
        sound.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
        sound.writeframes(pcm)
    assert len(pcm) == round(DURATION_BEATS * rate * 60 / 90) * 2
    return path


def render():
    with TemporaryDirectory() as scratch:
        folder = Path(scratch)
        audio = make_audio(folder)
        movie = folder / 'echo.mp4'
        cmd = [get_ffmpeg_exe(), '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
               '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-i', str(audio), '-c:v', 'libx264',
               '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
               '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', str(movie)]
        with subprocess.Popen(cmd, stdin=subprocess.PIPE) as encoder:
            try:
                for index in range(DURATION_BEATS * FRAMES_PER_BEAT):
                    encoder.stdin.write(frame(index).tobytes())
            finally:
                encoder.stdin.close()
            if encoder.wait():
                raise RuntimeError('Video encoding failed')
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        TARGET.write_bytes(movie.read_bytes())
        print(TARGET)


if __name__ == '__main__':
    render()
