"""
make_bell.py — génère une cloche douce (bol tibétain) pour la fin d'objectif.

Somme de partiels inharmoniques avec décroissance exponentielle + léger
battement, façon bol chantant. Sortie : assets/bell.wav (mono 44.1 kHz, 16-bit).
"""

import os
import wave

import numpy as np

SR = 44100
DUR = 5.0  # secondes
t = np.linspace(0, DUR, int(SR * DUR), endpoint=False)

f0 = 432.0  # fondamentale douce
# (rapport de partiel, amplitude, constante de décroissance en s)
partials = [
    (1.00, 1.00, 2.6),
    (2.02, 0.55, 2.1),  # légèrement désaccordé → battement doux
    (2.76, 0.35, 1.6),
    (4.10, 0.18, 1.1),
    (5.43, 0.10, 0.8),
]

sig = np.zeros_like(t)
for ratio, amp, tau in partials:
    sig += amp * np.sin(2 * np.pi * f0 * ratio * t) * np.exp(-t / tau)

# Attaque très rapide (5 ms) pour éviter le clic
attack = np.clip(t / 0.005, 0, 1)
sig *= attack

# Normalisation à ~-1.5 dB
sig = sig / np.max(np.abs(sig)) * 0.84
audio = (sig * 32767).astype(np.int16)

out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'bell.wav')
with wave.open(out, 'w') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(audio.tobytes())
print('écrit:', os.path.abspath(out), f'{len(audio)/SR:.1f}s')
