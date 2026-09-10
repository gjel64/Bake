/**
 * AgendaFilterModal — choisir ce que l'agenda AFFICHE, vue par vue.
 *
 * Une feuille qui liste toutes les sources d'événements (catégories,
 * « sans catégorie », abonnements .ics) avec, pour chacune, un œil : ouvert
 * elle s'affiche, barré elle est masquée.
 *
 * Le point important : le choix vaut pour UNE échelle de temps à la fois. Le
 * sélecteur du haut s'ouvre sur la vue d'où l'on vient, mais permet de régler
 * les trois sans quitter la feuille — masquer l'emploi du temps dans la vue
 * Mois sans le perdre dans la vue Jour.
 *
 * Chaque bascule est enregistrée AUSSITÔT (pas de bouton « Enregistrer ») et
 * remonte par `onChanged` pour que l'agenda derrière se redessine en direct.
 */

import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { SegmentedControl } from '@/components/SegmentedControl';
import { EventSource, getEventSources } from '@/db/database';
import {
  AGENDA_SCOPES,
  AgendaScope,
  getHiddenSources,
  saveHiddenSources,
  toggleHiddenSource,
} from '@/lib/agendaFilters';
import { font, radius, spacing, useC, type Palette } from '@/theme';

type Props = {
  visible: boolean;
  scope: AgendaScope; // la vue depuis laquelle le filtre a été ouvert
  onClose: () => void;
  onChanged: () => void; // une source vient d'être masquée / réaffichée
};

/** Le libellé de la nature d'une source, à droite de son nom. */
const KIND_LABEL: Record<EventSource['kind'], string> = {
  category: 'catégorie',
  calendar: 'abonnement',
  none: 'événements sans catégorie',
};

export function AgendaFilterModal({ visible, scope, onClose, onChanged }: Props) {
  const c = useC();
  const styles = makeStyles(c);
  // L'échelle réglée dans la feuille : celle d'où l'on vient au départ.
  const [tab, setTab] = useState<AgendaScope>(scope);
  const [sources, setSources] = useState<EventSource[]>([]);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  // À l'ouverture : on relit la liste des sources (une catégorie a pu changer)
  // et on se cale sur la vue appelante.
  useEffect(() => {
    if (!visible) return;
    setSources(getEventSources());
    setTab(scope);
  }, [visible, scope]);

  // À chaque changement d'échelle : les masquages de CETTE échelle.
  useEffect(() => {
    if (!visible) return;
    setHidden(getHiddenSources(tab));
  }, [visible, tab]);

  function toggle(key: string) {
    setHidden(toggleHiddenSource(tab, key, !hidden.has(key)));
    onChanged();
  }

  function showAll() {
    saveHiddenSources(tab, new Set());
    setHidden(new Set());
    onChanged();
  }

  const hiddenCount = sources.filter((s) => hidden.has(s.key)).length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Afficher dans l’agenda</Text>

          <SegmentedControl options={AGENDA_SCOPES} value={tab} onChange={setTab} fill />
          <Text style={styles.hint}>
            Ce réglage ne vaut que pour la vue « {tab} ». Les deux autres gardent le leur.
          </Text>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {sources.map((source) => (
              <SourceRow
                key={source.key}
                source={source}
                hidden={hidden.has(source.key)}
                onPress={() => toggle(source.key)}
              />
            ))}
          </ScrollView>

          <Pressable
            onPress={showAll}
            disabled={hiddenCount === 0}
            style={({ pressed }) => [
              styles.showAll,
              (pressed || hiddenCount === 0) && { opacity: 0.4 },
            ]}
          >
            <Ionicons name="eye-outline" size={18} color={c.primary} />
            <Text style={styles.showAllText}>
              {hiddenCount === 0
                ? 'Tout est affiché'
                : `Tout réafficher (${hiddenCount} masqué${hiddenCount > 1 ? 's' : ''})`}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Une source : sa pastille de couleur, son nom, et l'œil qui la masque. */
function SourceRow({
  source,
  hidden,
  onPress,
}: {
  source: EventSource;
  hidden: boolean;
  onPress: () => void;
}) {
  const c = useC();
  const styles = makeStyles(c);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <View
        style={[
          styles.dot,
          { backgroundColor: source.color ?? c.textFaint },
          hidden && { opacity: 0.3 },
        ]}
      />
      <View style={styles.rowTexts}>
        <Text style={[styles.rowLabel, hidden && styles.rowLabelHidden]} numberOfLines={1}>
          {source.label}
        </Text>
        <Text style={styles.rowKind}>{KIND_LABEL[source.kind]}</Text>
      </View>
      <Ionicons
        name={hidden ? 'eye-off-outline' : 'eye-outline'}
        size={22}
        color={hidden ? c.textFaint : c.primary}
      />
    </Pressable>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0007' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: c.bgAlt,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: c.glassBorder,
    marginBottom: spacing.md,
  },
  title: { fontSize: font.heading, fontWeight: '700', color: c.text, marginBottom: spacing.md },
  hint: { fontSize: font.small, color: c.textMuted, marginTop: spacing.sm, lineHeight: 18 },

  list: { marginTop: spacing.sm },
  listContent: { paddingBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.glassBorder,
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
  rowTexts: { flex: 1 },
  rowLabel: { fontSize: font.body, fontWeight: '600', color: c.text },
  rowLabelHidden: { color: c.textMuted },
  rowKind: { fontSize: font.tiny, color: c.textFaint },

  showAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.glassBorder,
  },
  showAllText: { fontSize: font.body, fontWeight: '600', color: c.primary },
});
