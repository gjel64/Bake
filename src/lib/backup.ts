/**
 * backup.ts — export / import de toutes les données (anti-réinstallation).
 *
 * Export : on sérialise toute la base en JSON, on l'écrit dans un fichier, puis
 * on ouvre la feuille de partage (pour l'envoyer vers Drive, un mail, etc.).
 * Import : on choisit un fichier .json, on le lit, on restaure la base.
 *
 * La logique base de données vit dans db/database.ts ; ici on ne fait que le
 * va-et-vient avec le système de fichiers.
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { BACKUP_VERSION, exportData, importData } from '@/db/database';
import { todayKey } from '@/lib/dates';

/**
 * Écrit toutes les données dans un fichier puis ouvre le partage.
 * Renvoie le nom du fichier créé.
 */
export async function exportToFile(): Promise<string> {
  const data = exportData();
  const json = JSON.stringify(data, null, 2);
  const filename = `bake-${todayKey()}.json`;
  const uri = FileSystem.documentDirectory + filename;

  await FileSystem.writeAsStringAsync(uri, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/json',
      dialogTitle: 'Sauvegarder mes données Bake',
    });
  }
  return filename;
}

/**
 * Laisse choisir un fichier de sauvegarde puis restaure la base.
 * Renvoie true si l'import a réussi, false si annulé.
 * Lève une erreur si le fichier est invalide.
 */
export async function importFromFile(): Promise<boolean> {
  const res = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return false;

  const content = await FileSystem.readAsStringAsync(res.assets[0].uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const parsed = JSON.parse(content);
  // Validation minimale : c'est bien une sauvegarde Bake.
  if (typeof parsed !== 'object' || parsed === null || !('version' in parsed)) {
    throw new Error('Fichier de sauvegarde invalide.');
  }
  if (parsed.version > BACKUP_VERSION) {
    throw new Error('Ce fichier vient d’une version plus récente de l’app.');
  }

  importData(parsed);
  return true;
}
