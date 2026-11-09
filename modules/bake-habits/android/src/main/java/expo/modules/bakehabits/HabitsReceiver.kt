package expo.modules.bakehabits

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * HabitsReceiver — fait vivre la notification des habitudes app fermée.
 *
 *  - l'alarme du matin : affiche la liste du jour (avec son) et réarme l'alarme
 *    pour le lendemain ;
 *  - la notification balayée : la remet aussitôt, en silence, tant qu'il reste
 *    des habitudes à valider aujourd'hui ;
 *  - redémarrage du téléphone, mise à jour de l'app, changement d'heure ou de
 *    fuseau : l'alarme est perdue ou décalée, on la réarme (et on remet la
 *    notification si elle était affichée).
 */
class HabitsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      when (intent.action) {
        HabitsNotification.ACTION_DISMISSED -> HabitsNotification.refresh(context, alert = false)
        HabitsNotification.ACTION_ALARM,
        Intent.ACTION_BOOT_COMPLETED,
        "android.intent.action.QUICKBOOT_POWERON",
        Intent.ACTION_MY_PACKAGE_REPLACED -> {
          HabitsNotification.refresh(context, alert = true)
          HabitsNotification.armNext(context)
        }
        Intent.ACTION_TIME_CHANGED,
        Intent.ACTION_TIMEZONE_CHANGED -> {
          HabitsNotification.refresh(context, alert = false)
          HabitsNotification.armNext(context)
        }
      }
    } catch (e: Exception) {
      // jamais de plantage pour un rappel.
    }
  }
}
