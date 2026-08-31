/**
 * CalendarSubModal — ajouter / modifier / supprimer un abonnement .ics.
 *
 * Un abonnement, c'est trois choses : un nom, un lien (`https://` ou
 * `webcal://`) et une COULEUR — celle que porteront tous ses événements dans
 * l'agenda, puisqu'ils n'ont pas de catégorie.
 *
 * Enregistrer déclenche la synchronisation dans la foulée : on veut savoir
 * tout de suite si le lien répond et combien d'événements il apporte, plutôt
 * que de découvrir un agenda vide plus tard.
 *
 * Supprimer l'abonnement retire aussi tous les événements qu'il avait apportés.
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
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  CalendarSub,
  addCalendar,
  deleteCalendar,
  getCalendar,
  updateCalendar,
} from '@/db/database';
import { syncCalendar } from '@/lib/calendars';
import { font, habitPalette, onSwatch, radius, spacing, useC, type Palette } from '@/theme';

type Props = {
  visible: boolean;
  calendar: CalendarSub | null; // null = création
  onClose: () => void;
  onSaved: () => void;
};

export function CalendarSubModal({ visible, calendar, onClose, onSaved }: Props) {
  const c = useC();
  const styles = makeStyles(c);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [color, setColor] = useState(habitPalette[1]);
  const [busy, setBusy] = useState(false);
  // Message affiché sous le formulaire après une tentative de synchronisation.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(calendar?.name ?? '');
    setUrl(calendar?.url ?? '');
    setColor(calendar?.color ?? habitPalette[1]);
    setError(null);
    setBusy(false);
  }, [visible, calendar]);

  /** Enregistre, puis synchronise. On ne referme que si le lien a répondu. */
  async function submit() {
    const cleanName = name.trim();
    const cleanUrl = url.trim();
    if (cleanName.length === 0 || cleanUrl.length === 0) return;

    setBusy(true);
    setError(null);

    const id = calendar
      ? (updateCalendar(calendar.id, cleanName, cleanUrl, color), calendar.id)
      : addCalendar(cleanName, cleanUrl, color);

    // On relit la ligne : `syncCalendar` travaille à partir de l'abonnement enregistré.
    const saved = getCalendar(id);
    const result = saved
      ? await syncCalendar(saved)
      : ({ ok: false, error: 'Abonnement introuvable.' } as const);

    setBusy(false);
    onSaved(); // dans tous les cas : la couleur et le nom, eux, sont enregistrés

    if (!result.ok) {
      // L'abonnement reste en place, l'utilisateur peut corriger l'adresse.
      setError(result.error);
      return;
    }
    onClose();
  }

  function remove() {
    if (!calendar) return;
    Alert.alert(
      'Supprimer l’abonnement',
      `« ${calendar.name} » et tous ses événements disparaîtront de l’agenda. Tes propres événements ne sont pas touchés.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            deleteCalendar(calendar.id);
            onSaved();
            onClose();
          },
        },
      ],
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.cancel}>Annuler</Text>
          </Pressable>
          <Text style={styles.title}>{calendar ? 'Abonnement' : 'Nouvel abonnement'}</Text>
          <Pressable onPress={submit} hitSlop={10} disabled={busy}>
            <Text style={[styles.save, busy && { opacity: 0.4 }]}>Enregistrer</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>NOM</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Cours, jours fériés, matchs…"
            placeholderTextColor={c.textFaint}
            style={styles.input}
          />

          <Text style={styles.label}>LIEN .ICS</Text>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://… ou webcal://…"
            placeholderTextColor={c.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            multiline
            style={[styles.input, styles.inputUrl]}
          />
          <Text style={styles.hint}>
            L’adresse d’abonnement d’un agenda (Google Agenda, iCloud, emploi du temps…).
            Bake la relit à chaque démarrage ; l’agenda distant n’est jamais modifié.
          </Text>

          <Text style={styles.label}>COULEUR</Text>
          <View style={styles.swatches}>
            {habitPalette.map((sw) => (
              <Pressable
                key={sw}
                onPress={() => setColor(sw)}
                style={[styles.swatch, { backgroundColor: sw }]}
              >
                {sw === color && <Ionicons name="checkmark" size={18} color={onSwatch} />}
              </Pressable>
            ))}
          </View>

          {error !== null && (
            <View style={styles.error}>
              <Ionicons name="alert-circle-outline" size={18} color={c.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {calendar && (
            <Pressable onPress={remove} style={styles.delete}>
              <Ionicons name="trash-outline" size={18} color={c.danger} />
              <Text style={styles.deleteText}>Supprimer l’abonnement</Text>
            </Pressable>
          )}
        </ScrollView>

        {busy && (
          <View style={styles.busy}>
            <ActivityIndicator size="large" color={c.aurora} />
            <Text style={styles.busyText}>Téléchargement de l’agenda…</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg, paddingTop: spacing.xl + spacing.md },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  title: { fontSize: font.body, fontWeight: '700', color: c.text },
  cancel: { fontSize: font.body, color: c.textMuted },
  save: { fontSize: font.body, color: c.primary, fontWeight: '700' },
  body: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
  label: {
    fontSize: font.small, fontWeight: '700', color: c.textMuted,
    letterSpacing: 1, marginTop: spacing.md,
  },
  input: {
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.glassBorder,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4,
    fontSize: font.body, color: c.text,
  },
  inputUrl: { minHeight: 68, textAlignVertical: 'top', fontSize: font.small },
  hint: { fontSize: font.small, color: c.textMuted, lineHeight: 19 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: {
    width: 40, height: 40, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  error: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.danger,
    borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md,
  },
  errorText: { flex: 1, fontSize: font.small, color: c.text },
  delete: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    marginTop: spacing.xl, paddingVertical: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: c.glassBorder,
  },
  deleteText: { fontSize: font.body, color: c.danger, fontWeight: '600' },
  busy: {
    ...StyleSheet.absoluteFillObject, backgroundColor: '#0007',
    alignItems: 'center', justifyContent: 'center', gap: spacing.md,
  },
  busyText: { color: c.white, fontSize: font.small, fontWeight: '600' },
});
