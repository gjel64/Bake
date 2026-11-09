package expo.modules.bakehabits

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * BakeHabits — pont JS vers la notification persistante des habitudes
 * (`HabitsNotification`). Le JS calcule les textes d'après la base, le natif
 * s'occupe de l'affichage, de l'alarme du matin et du retour après un balayage.
 * Voir src/lib/habitsReminder.ts.
 */
class BakeHabitsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BakeHabits")

    /**
     * Règle le rappel. `body` : texte d'un jour ordinaire (null = rien à
     * rappeler) ; `todayBody` : ce qui reste aujourd'hui (`today`), null si
     * tout est validé. Renvoie false si les notifications sont refusées.
     */
    Function("sync") { hour: Int, minute: Int, title: String, body: String?, today: String, todayBody: String? ->
      val context = appContext.reactContext
      if (context == null) {
        false
      } else {
        HabitsNotification.configure(context, hour, minute, title, body, today, todayBody)
        HabitsNotification.notificationsEnabled(context)
      }
    }

    /** Coupe le rappel : plus d'alarme, plus de notification. */
    Function("stop") {
      appContext.reactContext?.let { HabitsNotification.stop(it) }
      Unit
    }
  }
}
