/**
 * SettingsModal — les réglages : rappel quotidien des habitudes, sauvegarde
 * (export/import) et catégories.
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
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { CategoryEditModal } from '@/components/CategoryEditModal';
import { Category, deleteCategory, getCategories } from '@/db/database';
import { exportToFile, importFromFile } from '@/lib/backup';
import { getHabitsReminderTime, setHabitsReminderTime, syncHabitsReminder } from '@/lib/habitsReminder';
import { toTimeKey } from '@/lib/dates';
import { font, onSwatch, radius, spacing, useC, type Palette } from '@/theme';

/** Heure proposée à la première activation du rappel. */
const DEFAULT_REMINDER_TIME = '06:00';

/** Convertit "HH:MM" en Date (aujourd'hui à cette heure), pour le sélecteur natif. */
function timeToDate(time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

export function SettingsModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const c = useC();
  const styles = makeStyles(c);
  const [cats, setCats] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | null>(null);
  const [catModal, setCatModal] = useState(false);
  const [busy, setBusy] = useState(false);
  // Rappel quotidien des habitudes : "HH:MM" ou null (désactivé).
  const [reminder, setReminder] = useState<string | null>(null);
  const [timePicker, setTimePicker] = useState(false);

  const refresh = () => {
    setCats(getCategories());
    setReminder(getHabitsReminderTime());
  };
  useEffect(() => {
    if (visible) refresh();
  }, [visible]);

  /** Active / coupe le rappel. À l'activation, heure de départ : 06:00. */
  async function toggleReminder(on: boolean) {
    const next = on ? DEFAULT_REMINDER_TIME : null;
    setReminder(next); // retour immédiat, la programmation suit
    const ok = await setHabitsReminderTime(next);
    if (on && !ok) {
      setReminder(null);
      Alert.alert(
        'Rappel impossible',
        'Les notifications sont refusées ou indisponibles. Autorise-les pour Bake dans les réglages du téléphone.',
      );
    }
  }

  /** Nouvelle heure choisie dans le sélecteur natif. */
  async function onPickTime(d: Date | undefined) {
    setTimePicker(false);
    if (!d) return;
    const time = toTimeKey(d);
    setReminder(time);
    await setHabitsReminderTime(time);
  }

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
                // La sauvegarde a rapporté un id de notification périmé :
                // on reprogramme le rappel d'après l'heure restaurée.
                await syncHabitsReminder();
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
              <Ionicons name="close" size={24} color={c.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {/* Rappel quotidien des habitudes */}
            <Text style={styles.section}>RAPPEL DES HABITUDES</Text>
            <Text style={styles.hint}>
              Une notification chaque jour à l’heure de ton choix, pour penser à
              valider tes habitudes. (Elle sonne même si tout est déjà validé.)
            </Text>
            <View style={styles.remindRow}>
              <View style={styles.remindLeft}>
                <Ionicons name="notifications-outline" size={20} color={c.aurora} />
                <Text style={styles.remindLabel}>Rappel quotidien</Text>
              </View>
              <Switch
                value={reminder !== null}
                onValueChange={toggleReminder}
                trackColor={{ true: c.primary, false: c.surfaceStrong }}
                thumbColor={c.white}
              />
            </View>
            {reminder !== null && (
              <Pressable onPress={() => setTimePicker(true)} style={styles.remindTime}>
                <Ionicons name="time-outline" size={18} color={c.primary} />
                <Text style={styles.remindTimeLabel}>Tous les jours à</Text>
                <Text style={styles.remindTimeValue}>{reminder}</Text>
                <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
              </Pressable>
            )}

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
                <Ionicons name="add" size={18} color={c.textOnAurora} />
              </Pressable>
            </View>

            {cats.map((cat) => (
              <View key={cat.id} style={styles.catRow}>
                <View style={[styles.catIcon, { backgroundColor: cat.color }]}>
                  <Ionicons name={cat.icon as keyof typeof Ionicons.glyphMap} size={18} color={onSwatch} />
                </View>
                <Text style={styles.catName}>{cat.name}</Text>
                <Pressable
                  onPress={() => {
                    setEditing(cat);
                    setCatModal(true);
                  }}
                  hitSlop={8}
                  style={styles.catAction}
                >
                  <Ionicons name="pencil" size={18} color={c.textMuted} />
                </Pressable>
                <Pressable onPress={() => askDeleteCat(cat)} hitSlop={8} style={styles.catAction}>
                  <Ionicons name="trash-outline" size={18} color={c.danger} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>

        {busy && (
          <View style={styles.busy}>
            <ActivityIndicator size="large" color={c.aurora} />
          </View>
        )}

        {timePicker && (
          <DateTimePicker
            value={timeToDate(reminder ?? DEFAULT_REMINDER_TIME)}
            mode="time"
            is24Hour
            onChange={(_e, d) => onPickTime(d)}
          />
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
  const c = useC();
  const styles = makeStyles(c);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.bigBtn, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={24} color={c.aurora} />
      <Text style={styles.bigBtnText}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  headerTitle: { fontSize: font.title, fontWeight: '700', color: c.text },
  closeBtn: {
    width: 40, height: 40, borderRadius: radius.pill, backgroundColor: c.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  section: { fontSize: font.small, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginTop: spacing.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  hint: { fontSize: font.small, color: c.textMuted, marginBottom: spacing.sm, lineHeight: 19 },
  cardRow: { flexDirection: 'row', gap: spacing.md },
  remindRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.glassBorder,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  remindLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  remindLabel: { fontSize: font.body, color: c.text, fontWeight: '600' },
  remindTime: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.glassBorder,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4,
  },
  remindTimeLabel: { flex: 1, fontSize: font.body, color: c.textMuted },
  remindTimeValue: { fontSize: font.body, color: c.text, fontWeight: '700' },
  bigBtn: {
    flex: 1, alignItems: 'center', gap: spacing.xs,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.glassBorder,
    borderRadius: radius.md, paddingVertical: spacing.lg,
  },
  bigBtnText: { fontSize: font.body, color: c.text, fontWeight: '600' },
  addCat: {
    width: 30, height: 30, borderRadius: radius.pill, backgroundColor: c.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  catRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.glassBorder,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  catIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  catName: { flex: 1, fontSize: font.body, color: c.text, fontWeight: '600' },
  catAction: { padding: spacing.xs },
  busy: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0007', alignItems: 'center', justifyContent: 'center' },
});
