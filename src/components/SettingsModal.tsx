/**
 * SettingsModal — les réglages : apparence (clair / sombre) et teinte d'accent
 * (vert / orange), rappel quotidien des habitudes — heure et habitudes citées —,
 * abonnements .ics, sauvegarde (export/import) et catégories.
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

import { BakeLogo } from '@/components/ui/BakeLogo';
import { CalendarSubModal } from '@/components/CalendarSubModal';
import { CategoryEditModal } from '@/components/CategoryEditModal';
import { SegmentedControl } from '@/components/SegmentedControl';
import {
  CalendarSub,
  Category,
  Habit,
  deleteCategory,
  getAllHabits,
  getCalendars,
  getCategories,
  setHabitNotify,
} from '@/db/database';
import { syncCalendar } from '@/lib/calendars';
import { exportToFile, importFromFile } from '@/lib/backup';
import { getHabitsReminderTime, setHabitsReminderTime, syncHabitsReminder } from '@/lib/habitsReminder';
import { toTimeKey } from '@/lib/dates';
import { getAccent } from '@/lib/accent';
import { getThemeMode } from '@/lib/themeMode';
import {
  font,
  onSwatch,
  radius,
  spacing,
  useC,
  useThemeMode,
  type Accent,
  type Palette,
  type ThemeMode,
} from '@/theme';

/** Heure proposée à la première activation du rappel. */
const DEFAULT_REMINDER_TIME = '06:00';

/** Les trois apparences, dans l'ordre du sélecteur. */
const THEME_LABELS = ['Système', 'Clair', 'Sombre'] as const;
type ThemeLabel = (typeof THEME_LABELS)[number];

const LABEL_BY_MODE: Record<ThemeMode, ThemeLabel> = {
  system: 'Système',
  light: 'Clair',
  dark: 'Sombre',
};
const MODE_BY_LABEL: Record<ThemeLabel, ThemeMode> = {
  Système: 'system',
  Clair: 'light',
  Sombre: 'dark',
};

/** Les deux teintes d'accent, dans l'ordre du sélecteur. */
const ACCENT_LABELS = ['Vert', 'Orange'] as const;
type AccentLabel = (typeof ACCENT_LABELS)[number];

const LABEL_BY_ACCENT: Record<Accent, AccentLabel> = { green: 'Vert', orange: 'Orange' };
const ACCENT_BY_LABEL: Record<AccentLabel, Accent> = { Vert: 'green', Orange: 'orange' };

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
  const { mode, dark, setMode, accent, setAccent } = useThemeMode();
  const [cats, setCats] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | null>(null);
  const [catModal, setCatModal] = useState(false);
  // Abonnements .ics : la liste, la modale d'édition, et l'id en cours de synchro.
  const [calendars, setCalendars] = useState<CalendarSub[]>([]);
  const [editingCal, setEditingCal] = useState<CalendarSub | null>(null);
  const [calModal, setCalModal] = useState(false);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Rappel quotidien des habitudes : "HH:MM" ou null (désactivé).
  const [reminder, setReminder] = useState<string | null>(null);
  const [timePicker, setTimePicker] = useState(false);
  // Les habitudes, pour choisir celles que la notification citera.
  const [habits, setHabits] = useState<Habit[]>([]);

  const refresh = () => {
    setCats(getCategories());
    setReminder(getHabitsReminderTime());
    setCalendars(getCalendars());
    setHabits(getAllHabits());
  };

  /** Relance le téléchargement d'un abonnement et dit ce qu'il en est. */
  async function refreshCalendar(cal: CalendarSub) {
    setSyncing(cal.id);
    const result = await syncCalendar(cal);
    setSyncing(null);
    refresh();
    if (result.ok) {
      Alert.alert('À jour', `${cal.name} : ${result.count} événement(s) récupéré(s).`);
    } else {
      Alert.alert('Synchronisation impossible', result.error);
    }
  }
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

  /**
   * Coche / décoche une habitude dans le rappel. Le texte de la notification
   * étant figé à la programmation, il faut la reprogrammer à chaque changement.
   */
  async function toggleHabitNotify(habit: Habit, on: boolean) {
    setHabitNotify(habit.id, on);
    setHabits((hs) => hs.map((h) => (h.id === habit.id ? { ...h, notify: on ? 1 : 0 } : h)));
    if (reminder !== null) await syncHabitsReminder();
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
                // L'apparence et la teinte voyagent elles aussi dans la sauvegarde.
                setMode(getThemeMode());
                setAccent(getAccent());
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
            {/* Apparence */}
            <Text style={styles.section}>APPARENCE</Text>
            <View style={styles.themeRow}>
              <Ionicons
                name={dark ? 'moon' : 'sunny'}
                size={20}
                color={c.aurora}
                style={styles.themeIcon}
              />
              <View style={styles.themePicker}>
                <SegmentedControl
                  options={THEME_LABELS}
                  value={LABEL_BY_MODE[mode]}
                  onChange={(label) => setMode(MODE_BY_LABEL[label])}
                  fill
                />
              </View>
            </View>

            <View style={styles.themeRow}>
              <Ionicons name="color-palette" size={20} color={c.aurora} style={styles.themeIcon} />
              <View style={styles.themePicker}>
                <SegmentedControl
                  options={ACCENT_LABELS}
                  value={LABEL_BY_ACCENT[accent]}
                  onChange={(label) => setAccent(ACCENT_BY_LABEL[label])}
                  fill
                />
              </View>
            </View>

            {/* Rappel quotidien des habitudes */}
            <Text style={styles.section}>RAPPEL DES HABITUDES</Text>
            <Text style={styles.hint}>
              Une notification chaque jour à l’heure de ton choix, qui liste les
              habitudes cochées ci-dessous.
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
              <>
                <Pressable onPress={() => setTimePicker(true)} style={styles.remindTime}>
                  <Ionicons name="time-outline" size={18} color={c.primary} />
                  <Text style={styles.remindTimeLabel}>Tous les jours à</Text>
                  <Text style={styles.remindTimeValue}>{reminder}</Text>
                  <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
                </Pressable>

                <Text style={styles.subSection}>Habitudes à rappeler</Text>
                {habits.length === 0 ? (
                  <Text style={styles.emptyLine}>Aucune habitude pour l’instant.</Text>
                ) : (
                  habits.map((h) => (
                    <Pressable
                      key={h.id}
                      onPress={() => toggleHabitNotify(h, h.notify !== 1)}
                      style={styles.habitRow}
                    >
                      <View style={[styles.habitDot, { backgroundColor: h.color }]} />
                      <Text style={styles.habitName} numberOfLines={1}>{h.name}</Text>
                      <Ionicons
                        name={h.notify === 1 ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={h.notify === 1 ? c.primary : c.textFaint}
                      />
                    </Pressable>
                  ))
                )}
              </>
            )}

            {/* Abonnements .ics */}
            <View style={styles.sectionHead}>
              <Text style={styles.section}>ABONNEMENTS</Text>
              <Pressable
                onPress={() => {
                  setEditingCal(null);
                  setCalModal(true);
                }}
                hitSlop={8}
                style={styles.addCat}
              >
                <Ionicons name="add" size={18} color={c.textOnAurora} />
              </Pressable>
            </View>
            <Text style={styles.hint}>
              Suis un agenda extérieur depuis son lien .ics : ses événements
              apparaissent dans l’agenda, dans la couleur de l’abonnement, en
              lecture seule. Mise à jour à chaque démarrage de Bake.
            </Text>

            {calendars.length === 0 ? (
              <Text style={styles.emptyLine}>Aucun abonnement.</Text>
            ) : (
              calendars.map((cal) => (
                <Pressable
                  key={cal.id}
                  onPress={() => {
                    setEditingCal(cal);
                    setCalModal(true);
                  }}
                  style={styles.calRow}
                >
                  <View style={[styles.calDot, { backgroundColor: cal.color }]} />
                  <View style={styles.calTexts}>
                    <Text style={styles.calName} numberOfLines={1}>{cal.name}</Text>
                    <Text style={styles.calMeta} numberOfLines={1}>
                      {cal.last_sync ? `Mis à jour le ${cal.last_sync}` : 'Jamais synchronisé'}
                    </Text>
                  </View>
                  {syncing === cal.id ? (
                    <ActivityIndicator color={c.aurora} style={styles.catAction} />
                  ) : (
                    <Pressable
                      onPress={() => refreshCalendar(cal)}
                      hitSlop={8}
                      style={styles.catAction}
                    >
                      <Ionicons name="refresh" size={18} color={c.aurora} />
                    </Pressable>
                  )}
                  <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
                </Pressable>
              ))
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

            {/* Pied de page : le logo, discret */}
            <View style={styles.about}>
              <BakeLogo size={62} />
              <Text style={styles.aboutName}>Bake</Text>
              <Text style={styles.aboutLine}>
                Tes habitudes, tes tâches et ton agenda — sur ce téléphone, et nulle part ailleurs.
              </Text>
            </View>
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

        <CalendarSubModal
          visible={calModal}
          calendar={editingCal}
          onClose={() => setCalModal(false)}
          onSaved={refresh}
        />

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
  themeRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.glassBorder,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  themeIcon: { width: 20 },
  themePicker: { flex: 1 },
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
  subSection: { fontSize: font.small, color: c.textMuted, marginTop: spacing.sm, marginBottom: spacing.xs },
  habitRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.glassBorder,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  habitDot: { width: 14, height: 14, borderRadius: 7 },
  habitName: { flex: 1, fontSize: font.body, color: c.text, fontWeight: '600' },
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
  emptyLine: { fontSize: font.small, color: c.textFaint, paddingVertical: spacing.xs },
  calRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.glassBorder,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  calDot: { width: 14, height: 14, borderRadius: 7 },
  calTexts: { flex: 1 },
  calName: { fontSize: font.body, color: c.text, fontWeight: '600' },
  calMeta: { fontSize: font.tiny, color: c.textMuted, marginTop: 1 },
  about: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  aboutName: { fontSize: font.heading, fontWeight: '700', color: c.text },
  aboutLine: { fontSize: font.small, color: c.textMuted, textAlign: 'center', lineHeight: 19 },
  busy: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0007', alignItems: 'center', justifyContent: 'center' },
});
