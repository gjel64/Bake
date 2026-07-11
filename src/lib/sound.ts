/**
 * sound.ts — joue la cloche de fin d'objectif (expo-av).
 *
 * Le son est chargé une seule fois puis rejoué. Échoue en douceur si l'audio
 * n'est pas disponible.
 */

import { Audio } from 'expo-av';

let bell: Audio.Sound | null = null;

/** Joue la cloche (depuis le début). */
export async function playBell(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true, // sonne même si le silencieux iOS est activé
      shouldDuckAndroid: true,
    });
    if (!bell) {
      const { sound } = await Audio.Sound.createAsync(require('../../assets/bell.wav'));
      bell = sound;
    }
    await bell.replayAsync();
  } catch {
    // audio indisponible : on ignore.
  }
}
