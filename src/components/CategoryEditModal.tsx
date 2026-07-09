/**
 * CategoryEditModal — créer ou modifier une catégorie (nom + couleur + icône).
 *
 * Écrit directement en base (add/update) puis prévient le parent via `onSaved`.
 * Réutilisé par le sélecteur de catégories et par l'écran Réglages.
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
import { colors, font, habitPalette, radius, spacing } from '@/theme';

// Un petit choix d'icônes Ionicons pour les catégories.
const ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  'person-outline', 'briefcase-outline', 'barbell-outline', 'heart-outline',
  'flower-outline', 'home-outline', 'book-outline', 'cart-outline',
  'cafe-outline', 'musical-notes-outline', 'airplane-outline', 'brush-outline',
  'leaf-outline', 'paw-outline', 'wallet-outline', 'construct-outline',
];

type Props = {
  visible: boolean;
  category: Category | null; // null = création
  onClose: () => void;
  onSaved: () => void;
};

export function CategoryEditModal({ visible, category, onClose, onSaved }: Props) {
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
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>
            {category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
          </Text>

          <View style={styles.previewRow}>
            <View style={[styles.previewIcon, { backgroundColor: color }]}>
              <Ionicons name={icon} size={22} color={colors.textOnAurora} />
            </View>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Nom de la catégorie"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoFocus
            />
          </View>

          <Text style={styles.label}>Couleur</Text>
          <View style={styles.palette}>
            {habitPalette.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}
              />
            ))}
          </View>

          <Text style={styles.label}>Icône</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconRow}>
            {ICONS.map((ic) => (
              <Pressable
                key={ic}
                onPress={() => setIcon(ic)}
                style={[styles.iconBtn, icon === ic && { borderColor: color }]}
              >
                <Ionicons name={ic} size={22} color={icon === ic ? color : colors.textMuted} />
              </Pressable>
            ))}
          </ScrollView>

          <Pressable
            onPress={submit}
            disabled={name.trim().length === 0}
            style={({ pressed }) => [
              styles.submit,
              (pressed || name.trim().length === 0) && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.submitText}>{category ? 'Enregistrer' : 'Créer'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0009' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
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
    alignSelf: 'center', width: 44, height: 5, borderRadius: radius.pill,
    backgroundColor: colors.border, marginBottom: spacing.md,
  },
  title: { fontSize: font.heading, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  previewIcon: {
    width: 44, height: 44, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  input: {
    flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    fontSize: font.body, color: colors.text,
  },
  label: { fontSize: font.small, color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.xs },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: { width: 38, height: 38, borderRadius: radius.pill, borderWidth: 3, borderColor: 'transparent' },
  swatchActive: { borderColor: colors.text },
  iconRow: { flexGrow: 0 },
  iconBtn: {
    width: 46, height: 46, borderRadius: radius.sm, borderWidth: 1.5,
    borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm, backgroundColor: colors.surfaceAlt,
  },
  submit: {
    marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  submitText: { color: colors.textOnAurora, fontSize: font.body, fontWeight: '700' },
});
