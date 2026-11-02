"""Original instrumental loop for Zhixi. No samples or external music are used."""
from pathlib import Path
import json
import wave
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RATE, BPM, BEATS = 22050, 68, 64
SECONDS = BEATS * 60 / BPM
COUNT = round(SECONDS * RATE)
mix = np.zeros((COUNT, 2), dtype=np.float64)


def note(midi, beat, length=3.0, gain=0.1, pan=0.0, pad=False):
    time = np.arange(round(length * RATE)) / RATE
    frequency = 440 * 2 ** ((midi - 69) / 12)
    if pad:
        envelope = (1 - np.exp(-time * 3)) * np.exp(-time * 0.8)
        sound = np.sin(2 * np.pi * frequency * time) + 0.13 * np.sin(2 * np.pi * frequency * 2 * time)
    else:
        envelope = (1 - np.exp(-time * 70)) * np.exp(-time * 1.65)
        sound = sum(weight * np.sin(2 * np.pi * frequency * harmonic * time) * np.exp(-time * harmonic * 0.25)
                    for harmonic, weight in [(1, 1), (2, .23), (3, .07), (4, .035), (6, .01)])
    envelope *= np.minimum(1, (length - time) / .15)
    sound *= envelope * gain
    position = (round(beat * 60 / BPM * RATE) + np.arange(len(time))) % COUNT
    mix[position, 0] += sound * np.sqrt((1 - pan) / 2)
    mix[position, 1] += sound * np.sqrt((1 + pan) / 2)


chords = [(48, 55, 59, 64), (45, 52, 59, 60), (41, 48, 57, 64), (43, 50, 57, 59)]
melody = [(76, 0), (79, 2), (83, 5), (81, 6.5), (79, 8), (76, 10.5),
          (72, 13), (74, 15), (76, 17), (79, 19.5), (81, 22), (79, 24),
          (74, 27), (71, 29.5), (72, 31), (76, 34), (79, 36), (83, 38.5),
          (81, 41), (76, 43), (74, 46), (72, 48.5), (76, 51), (74, 54),
          (71, 57), (67, 60)]
for bar in range(16):
    chord = chords[(bar // 2) % len(chords)]
    for offset, pitch in enumerate(chord):
        note(pitch, bar * 4 + offset * .85, 4, .065, (-1) ** offset * .25)
    note(chord[0], bar * 4, 6, .025, 0, pad=True)
for index, (pitch, beat) in enumerate(melody):
    note(pitch, beat, 4, .075, .12 * (-1) ** index)

dry = mix.copy()
for delay, gain in [(.19, .13), (.37, .09), (.61, .065), (.89, .04)]:
    mix += np.roll(dry[:, ::-1], round(delay * RATE), axis=0) * gain
mix *= .65 / max(np.max(np.abs(mix)), .65)
pcm = np.round(mix * 32767).astype('<i2')
output = ROOT / 'assets' / 'audio'
output.mkdir(parents=True, exist_ok=True)
with wave.open(str(output / 'window-light.wav'), 'wb') as file:
    file.setnchannels(2)
    file.setsampwidth(2)
    file.setframerate(RATE)
    file.writeframes(pcm.tobytes())
metadata = {'title': '窗边的栖光', 'original': True, 'composer': 'Zhixi procedural composition',
            'bpm': BPM, 'seconds': COUNT / RATE, 'sampleRate': RATE,
            'channels': 2, 'seamDelta': int(np.abs(pcm[-1].astype(int) - pcm[0].astype(int)).max())}
(output / 'music.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(metadata, ensure_ascii=True))
