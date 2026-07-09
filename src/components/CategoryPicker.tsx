/**
 * CategoryPicker — une rangée de pastilles pour choisir une catégorie.
 *
 * Inclut « Aucune » et un bouton « + » qui ouvre la création de catégorie.
 * Gère lui-même la liste des catégories (rechargée quand on en crée une).
 */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Category, getCategories } from '@/db/database';
import { CategoryEditModal } from '@/components/CategoryEditModal';
import { colors, font, radius, spacing } from '@/theme';

type Props = {
  value: number | null; // id de catégorie sélectionnée
  onChange: (id: number | null) => void;
};

export function CategoryPicker({ value, onChange }: Props) {
  const [cats, setCats] = useState<Category[]>([]);
  const [creating, setCreating] = useState(false);

  const refresh = () => setCats(getCategories());
  useEffect(() => refresh(), []);

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {/* Aucune */}
        <Chip
          active={value === null}
          label="Aucune"
          color={colors.textMuted}
          onPress={() => onChange(null)}
        />

        {cats.map((c) => (
          <Chip
            key={c.id}
            active={value === c.id}
            label={c.name}
            color={c.color}
            icon={c.icon as keyof typeof Ionicons.glyphMap}
            onPress={() => onChange(c.id)}
          />
        ))}

        {/* Nouvelle catégorie */}
        <Pressable onPress={() => setCreating(true)} style={styles.addChip}>
          <Ionicons name="add" size={18} color={colors.text} />
        </Pressable>
      </ScrollView>

      <CategoryEditModal
        visible={creating}
        category={null}
        onClose={() => setCreating(false)}
        onSaved={() => {
          const before = new Set(cats.map((c) => c.id));
          const next = getCategories();
          setCats(next);
          // sélectionne automatiquement la catégorie fraîchement créée
          const created = next.find((c) => !before.has(c.id));
          if (created) onChange(created.id);
        }}
      />
    </View>
  );
}

function Chip({
  active,
  label,
  color,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  color: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: active ? color : colors.glassBorder },
        active && { backgroundColor: color + '33' },
      ]}
    >
      {icon ? <Ionicons name={icon} size={15} color={color} /> : null}
      <Text style={[styles.chipText, active && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
  },
  chipText: { fontSize: font.small, color: colors.textMuted, fontWeight: '600' },
  addChip: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
