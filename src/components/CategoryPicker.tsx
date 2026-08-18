/**
 * CategoryPicker — rangée de puces pour choisir une catégorie (thémé).
 *
 * Puce non sélectionnée : fond discret + libellé neutre. Puce sélectionnée :
 * remplie de la couleur de la catégorie (texte/icône sombre, lisible).
 *
 * Un bouton « + Catégorie » ouvre la création ; un APPUI LONG sur une puce
 * ouvre sa modification (nom, couleur, icône, suppression) — même écran que
 * dans les Réglages, mais accessible là où on choisit les catégories.
 */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Category, getCategories } from '@/db/database';
import { CategoryEditModal } from '@/components/CategoryEditModal';
import { font, onSwatch, radius, spacing, useC } from '@/theme';

type Props = {
  value: number | null;
  onChange: (id: number | null) => void;
};

export function CategoryPicker({ value, onChange }: Props) {
  const c = useC();
  const [cats, setCats] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | null>(null); // null + open = création
  const [open, setOpen] = useState(false);

  const refresh = () => setCats(getCategories());
  useEffect(() => refresh(), []);

  /** Après création : on sélectionne la nouvelle catégorie. Après édition : rien. */
  function onSaved() {
    const before = new Set(cats.map((x) => x.id));
    const next = getCategories();
    setCats(next);
    if (editing === null) {
      const created = next.find((x) => !before.has(x.id));
      if (created) onChange(created.id);
    }
  }

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Chip active={value === null} label="Aucune" fill={c.textMuted} onPress={() => onChange(null)} />
        {cats.map((cat) => (
          <Chip
            key={cat.id}
            active={value === cat.id}
            label={cat.name}
            fill={cat.color}
            icon={cat.icon as keyof typeof Ionicons.glyphMap}
            onPress={() => onChange(cat.id)}
            onLongPress={() => {
              setEditing(cat);
              setOpen(true);
            }}
          />
        ))}
        <Pressable
          onPress={() => {
            setEditing(null);
            setOpen(true);
          }}
          style={[styles.addChip, { backgroundColor: c.surfaceAlt }]}
        >
          <Ionicons name="add" size={16} color={c.primary} />
          <Text style={[styles.addText, { color: c.primary }]}>Catégorie</Text>
        </Pressable>
      </ScrollView>

      <Text style={[styles.hint, { color: c.textFaint }]}>
        Appui long sur une catégorie pour la modifier
      </Text>

      <CategoryEditModal
        visible={open}
        category={editing}
        onClose={() => setOpen(false)}
        onSaved={onSaved}
        onDeleted={(id) => {
          if (value === id) onChange(null); // la sélection n'existe plus
        }}
      />
    </View>
  );
}

function Chip({
  active,
  label,
  fill,
  icon,
  onPress,
  onLongPress,
}: {
  active: boolean;
  label: string;
  fill: string; // couleur de remplissage quand sélectionnée
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const c = useC();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.chip,
        active ? { backgroundColor: fill } : { backgroundColor: c.surfaceAlt },
      ]}
    >
      {icon ? <Ionicons name={icon} size={15} color={active ? onSwatch : fill} /> : null}
      <Text style={[styles.chipText, { color: active ? onSwatch : c.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    height: 36,
  },
  chipText: { fontSize: font.small, fontWeight: '600' },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    height: 36,
  },
  addText: { fontSize: font.small, fontWeight: '600' },
  hint: { fontSize: font.tiny, marginTop: 4 },
});
