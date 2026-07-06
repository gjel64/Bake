/**
 * AddHabitModal — la fenêtre de création d'une habitude.
 *
 * Saisie : nom, description (optionnelle), couleur (choisie dans la palette,
 * ou laissée en « auto » → une couleur au hasard sera attribuée).
 *
 * Comme HabitCard, ce composant ne touche pas la base : il valide juste la
 * saisie puis appelle `onAdd(name, description, color)`. Le parent persiste.
 */

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, font, habitPalette, radius, spacing } from '@/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onAdd: (name: string, description: string, color: string) => void;
};

/** Renvoie une couleur au hasard dans la palette (mode « auto »). */
function randomColor(): string {
  return habitPalette[Math.floor(Math.random() * habitPalette.length)];
}

export function AddHabitModal({ visible, onClose, onAdd }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // `null` = mode auto (aucune couleur choisie explicitement).
  const [color, setColor] = useState<string | null>(null);

  function reset() {
    setName('');
    setDescription('');
    setColor(null);
  }

  function submit() {
    const trimmed = name.trim();
    if (trimmed.length === 0) return; // nom obligatoire : on ignore
    onAdd(trimmed, description, color ?? randomColor());
    reset();
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      {/* Fond assombri : un appui dessus ferme la modale */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Nouvelle habitude</Text>

          <Text style={styles.label}>Nom</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Méditer, lire, marcher…"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoFocus
          />

          <Text style={styles.label}>Description (optionnelle)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Un petit rappel de pourquoi"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.inputMultiline]}
            multiline
          />

          <Text style={styles.label}>Couleur</Text>
          <View style={styles.palette}>
            {/* Pastille « auto » */}
            <Pressable
              onPress={() => setColor(null)}
              style={[styles.swatch, styles.auto, color === null && styles.swatchActive]}
            >
              <Text style={styles.autoText}>auto</Text>
            </Pressable>

            {habitPalette.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[
                  styles.swatch,
                  { backgroundColor: c },
                  color === c && styles.swatchActive,
                ]}
              />
            ))}
          </View>

          <Pressable
            onPress={submit}
            disabled={name.trim().length === 0}
            style={({ pressed }) => [
              styles.submit,
              (pressed || name.trim().length === 0) && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.submitText}>Ajouter</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0006',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.nightAlt,
    borderTopWidth: 1,
    borderColor: colors.glassBorder,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: font.heading,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: font.small,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: font.body,
    color: colors.text,
  },
  inputMultiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  palette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  swatchActive: {
    borderColor: colors.text,
  },
  auto: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoText: {
    fontSize: font.small,
    color: colors.textMuted,
  },
  submit: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  submitText: {
    color: colors.white,
    fontSize: font.body,
    fontWeight: '700',
  },
});
