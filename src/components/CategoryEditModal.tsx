/**
 * CategoryEditModal — créer / modifier une catégorie (nom + couleur + icône).
 * Écrit en base puis prévient via `onSaved`. Thémé clair/sombre.
 */

import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Category, addCategory, updateCategory } from '@/db/database';
import { font, habitPalette, onSwatch, radius, spacing, useC } from '@/theme';

const ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  'person-outline', 'briefcase-outline', 'barbell-outline', 'heart-outline',
  'flower-outline', 'home-outline', 'book-outline', 'cart-outline',
  'cafe-outline', 'musical-notes-outline', 'airplane-outline', 'brush-outline',
  'leaf-outline', 'paw-outline', 'wallet-outline', 'construct-outline',
];

type Props = {
  visible: boolean;
  category: Category | null;
  onClose: () => void;
  onSaved: () => void;
};

export function CategoryEditModal({ visible, category, onClose, onSaved }: Props) {
  const c = useC();
  const [name, setName] = useState('');
  const [color, setColor] = useState(habitPalette[0]);
  const [icon, setIcon] = useState<keyof typeof Ionicons.glyphMap>(ICONS[0]);

  useEffect(() => {
    if (visible) {
      setName(category?.name ?? '');
      setColor(category?.color ?? habitPalette[0]);
      setIcon((category?.icon as keyof typeof Ionicons.glyphMap) ?? ICONS[0]);
    }
  }, [visible, category]);

  function submit() {
    const t = name.trim();
    if (t.length === 0) return;
    if (category) updateCategory(category.id, t, color, icon);
    else addCategory(t, color, icon);
    onSaved();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetWrap}>
        <View style={[styles.sheet, { backgroundColor: c.bgAlt }]}>
          <View style={[styles.handle, { backgroundColor: c.glassBorder }]} />
          <Text style={[styles.title, { color: c.text }]}>
            {category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
          </Text>

          <View style={styles.previewRow}>
            <View style={[styles.previewIcon, { backgroundColor: color }]}>
              <Ionicons name={icon} size={22} color={onSwatch} />
            </View>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Nom de la catégorie"
              placeholderTextColor={c.textMuted}
              style={[styles.input, { backgroundColor: c.surfaceAlt, color: c.text }]}
              autoFocus
            />
          </View>

          <Text style={[styles.label, { color: c.textMuted }]}>Couleur</Text>
          <View style={styles.palette}>
            {habitPalette.map((col) => (
              <Pressable
                key={col}
                onPress={() => setColor(col)}
                style={[styles.swatch, { backgroundColor: col }, color === col && { borderColor: c.text }]}
              />
            ))}
          </View>

          <Text style={[styles.label, { color: c.textMuted }]}>Icône</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconRow}>
            {ICONS.map((ic) => (
              <Pressable
                key={ic}
                onPress={() => setIcon(ic)}
                style={[
                  styles.iconBtn,
                  { backgroundColor: c.surfaceAlt, borderColor: icon === ic ? color : c.glassBorder },
                ]}
              >
                <Ionicons name={ic} size={22} color={icon === ic ? color : c.textMuted} />
              </Pressable>
            ))}
          </ScrollView>

          <Pressable
            onPress={submit}
            disabled={name.trim().length === 0}
            style={({ pressed }) => [
              styles.submit,
              { backgroundColor: c.primary },
              (pressed || name.trim().length === 0) && { opacity: 0.5 },
            ]}
          >
            <Text style={[styles.submitText, { color: c.textOnAurora }]}>
              {category ? 'Enregistrer' : 'Créer'}
            </Text>
          </Pressable>
        </View>
      </View>
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
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  previewIcon: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2, fontSize: font.body,
  },
  label: { fontSize: font.small, marginTop: spacing.md, marginBottom: spacing.xs },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: { width: 38, height: 38, borderRadius: radius.pill, borderWidth: 3, borderColor: 'transparent' },
  iconRow: { flexGrow: 0 },
  iconBtn: {
    width: 46, height: 46, borderRadius: radius.sm, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },
  submit: { marginTop: spacing.lg, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  submitText: { fontSize: font.body, fontWeight: '700' },
});
