/**
 * SettingsModal — les réglages : sauvegarde (export/import) et catégories.
 *
 * Ouvert en plein écran depuis l'icône engrenage de l'écran Stats.
 */

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { CategoryEditModal } from '@/components/CategoryEditModal';
import { Category, deleteCategory, getCategories } from '@/db/database';
import { exportToFile, importFromFile } from '@/lib/backup';
import { colors, font, radius, spacing } from '@/theme';

export function SettingsModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [cats, setCats] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | null>(null);
  const [catModal, setCatModal] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => setCats(getCategories());
  useEffect(() => {
    if (visible) refresh();
  }, [visible]);

  async function onExport() {
    try {
      setBusy(true);
      const name = await exportToFile();
      Alert.alert('Export réussi', `Sauvegarde créée : ${name}`);
    } catch (e) {
      Alert.alert('Erreur', 'L’export a échoué.');
    } finally {
      setBusy(false);
    }
  }

  function onImport() {
    Alert.alert(
      'Importer une sauvegarde',
      'Cela REMPLACERA toutes tes données actuelles. Continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Importer',
          style: 'destructive',
          onPress: async () => {
            try {
              setBusy(true);
              const ok = await importFromFile();
              if (ok) {
                refresh();
                Alert.alert('Import réussi', 'Tes données ont été restaurées.');
              }
            } catch (e) {
              Alert.alert('Erreur', 'Fichier invalide ou illisible.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  function askDeleteCat(c: Category) {
    Alert.alert('Supprimer', `Supprimer la catégorie « ${c.name} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          deleteCategory(c.id);
          refresh();
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Réglages</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {/* Sauvegarde */}
            <Text style={styles.section}>SAUVEGARDE</Text>
            <Text style={styles.hint}>
              Exporte toutes tes données dans un fichier pour ne rien perdre en cas
              de réinstallation, puis réimporte-le sur ton nouveau téléphone.
            </Text>
            <View style={styles.cardRow}>
              <BigButton icon="download-outline" label="Exporter" onPress={onExport} />
              <BigButton icon="cloud-upload-outline" label="Importer" onPress={onImport} />
            </View>

            {/* Catégories */}
            <View style={styles.sectionHead}>
              <Text style={styles.section}>CATÉGORIES</Text>
              <Pressable
                onPress={() => {
                  setEditing(null);
                  setCatModal(true);
                }}
                hitSlop={8}
                style={styles.addCat}
              >
                <Ionicons name="add" size={18} color={colors.textOnAurora} />
              </Pressable>
            </View>

            {cats.map((c) => (
              <View key={c.id} style={styles.catRow}>
                <View style={[styles.catIcon, { backgroundColor: c.color }]}>
                  <Ionicons name={c.icon as keyof typeof Ionicons.glyphMap} size={18} color={colors.textOnAurora} />
                </View>
                <Text style={styles.catName}>{c.name}</Text>
                <Pressable
                  onPress={() => {
                    setEditing(c);
                    setCatModal(true);
                  }}
                  hitSlop={8}
                  style={styles.catAction}
                >
                  <Ionicons name="pencil" size={18} color={colors.textMuted} />
                </Pressable>
                <Pressable onPress={() => askDeleteCat(c)} hitSlop={8} style={styles.catAction}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>

        {busy && (
          <View style={styles.busy}>
            <ActivityIndicator size="large" color={colors.aurora} />
          </View>
        )}

        <CategoryEditModal
          visible={catModal}
          category={editing}
          onClose={() => setCatModal(false)}
          onSaved={refresh}
        />
      </View>
    </Modal>
  );
}

function BigButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.bigBtn, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={24} color={colors.aurora} />
      <Text style={styles.bigBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  headerTitle: { fontSize: font.title, fontWeight: '700', color: colors.text },
  closeBtn: {
    width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  section: { fontSize: font.small, fontWeight: '700', color: colors.textMuted, letterSpacing: 1, marginTop: spacing.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  hint: { fontSize: font.small, color: colors.textMuted, marginBottom: spacing.sm, lineHeight: 19 },
  cardRow: { flexDirection: 'row', gap: spacing.md },
  bigBtn: {
    flex: 1, alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.md, paddingVertical: spacing.lg,
  },
  bigBtnText: { fontSize: font.body, color: colors.text, fontWeight: '600' },
  addCat: {
    width: 30, height: 30, borderRadius: radius.pill, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  catRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  catIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  catName: { flex: 1, fontSize: font.body, color: colors.text, fontWeight: '600' },
  catAction: { padding: spacing.xs },
  busy: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0007', alignItems: 'center', justifyContent: 'center' },
});
