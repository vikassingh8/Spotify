#!/usr/bin/env python3
"""Generate small royalty-free WAV tones (one per seeded song).

Each track is a short, distinct sine-wave melody so the web player produces
audible sound without shipping any copyrighted audio. Output lands in
./audio/track-XX.wav and is uploaded to MinIO by the minio-init container.
"""
import math
import os
import struct
import wave

OUT_DIR = os.path.join(os.path.dirname(__file__), "audio")
SAMPLE_RATE = 22050
DURATION_SEC = 6          # keep files tiny
TRACKS = 12

# A simple pentatonic-ish set of base frequencies, one motif per track.
BASE_FREQS = [220, 247, 262, 294, 330, 349, 392, 440, 494, 523, 587, 659]


def write_tone(path: str, base_freq: float) -> None:
    n_samples = SAMPLE_RATE * DURATION_SEC
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)          # 16-bit PCM
        w.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for i in range(n_samples):
            t = i / SAMPLE_RATE
            # arpeggiate base, third, fifth for a pleasant motif
            step = int(t * 2) % 3
            freq = base_freq * (1.0, 1.25, 1.5)[step]
            # gentle envelope to avoid clicks
            env = min(1.0, t * 4) * min(1.0, (DURATION_SEC - t) * 4)
            sample = int(0.3 * env * 32767 * math.sin(2 * math.pi * freq * t))
            frames += struct.pack("<h", sample)
        w.writeframes(bytes(frames))


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for idx in range(1, TRACKS + 1):
        path = os.path.join(OUT_DIR, f"track-{idx:02d}.wav")
        write_tone(path, BASE_FREQS[(idx - 1) % len(BASE_FREQS)])
        print(f"wrote {path}")
    print(f"Generated {TRACKS} tracks in {OUT_DIR}")


if __name__ == "__main__":
    main()
