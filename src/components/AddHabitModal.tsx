/**
 * AddHabitModal — création d'une habitude (nom, description, couleur). Thémé.
 * Ne touche pas la base : valide puis appelle `onAdd(name, description, color)`.
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
import { font, habitPalette, radius, spacing, useC } from '@/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onAdd: (name: string, description: string, color: string) => void;
};

function randomColor(): string {
  return habitPalette[Math.floor(Math.random() * habitPalette.length)];
}

export function AddHabitModal({ visible, onClose, onAdd }: Props) {
  const c = useC();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string | null>(null);

  function reset() {
    setName('');
    setDescription('');
    setColor(null);
  }

  function submit() {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    onAdd(trimmed, description, color ?? randomColor());
    reset();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
        pointerEvents="box-none"
      >
        <View style={[styles.sheet, { backgroundColor: c.bgAlt }]}>
          <View style={[styles.handle, { backgroundColor: c.glassBorder }]} />
          <Text style={[styles.title, { color: c.text }]}>Nouvelle habitude</Text>

          <Text style={[styles.label, { color: c.textMuted }]}>Nom</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Méditer, lire, marcher…"
            placeholderTextColor={c.textMuted}
            style={[styles.input, { backgroundColor: c.surfaceAlt, color: c.text }]}
            autoFocus
          />

          <Text style={[styles.label, { color: c.textMuted }]}>Description (optionnelle)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Un petit rappel de pourquoi"
            placeholderTextColor={c.textMuted}
            style={[styles.input, styles.inputMultiline, { backgroundColor: c.surfaceAlt, color: c.text }]}
            multiline
          />

          <Text style={[styles.label, { color: c.textMuted }]}>Couleur</Text>
          <View style={styles.palette}>
            <Pressable
              onPress={() => setColor(null)}
              style={[
                styles.swatch,
                styles.auto,
                { backgroundColor: c.surfaceAlt },
                color === null && { borderColor: c.text },
              ]}
            >
              <Text style={[styles.autoText, { color: c.textMuted }]}>auto</Text>
            </Pressable>
            {habitPalette.map((col) => (
              <Pressable
                key={col}
                onPress={() => setColor(col)}
                style={[styles.swatch, { backgroundColor: col }, color === col && { borderColor: c.text }]}
              />
            ))}
          </View>

          <Pressable
            onPress={submit}
            disabled={name.trim().length === 0}
            style={({ pressed }) => [
              styles.submit,
              { backgroundColor: c.primary },
              (pressed || name.trim().length === 0) && { opacity: 0.5 },
            ]}
          >
            <Text style={[styles.submitText, { color: c.textOnAurora }]}>Ajouter</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0007' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: radius.pill, marginBottom: spacing.md },
  title: { fontSize: font.heading, fontWeight: '700', marginBottom: spacing.md },
  label: { fontSize: font.small, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, fontSize: font.body },
  inputMultiline: { minHeight: 60, textAlignVertical: 'top' },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: { width: 40, height: 40, borderRadius: radius.pill, borderWidth: 3, borderColor: 'transparent' },
  auto: { alignItems: 'center', justifyContent: 'center' },
  autoText: { fontSize: font.small },
  submit: { marginTop: spacing.lg, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  submitText: { fontSize: font.body, fontWeight: '700' },
});
