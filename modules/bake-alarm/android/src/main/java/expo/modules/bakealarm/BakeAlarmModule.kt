package expo.modules.bakealarm

import android.content.Intent
import android.provider.AlarmClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * BakeAlarm — pose une alarme dans l'app Horloge du téléphone.
 *
 * Seule raison d'être de ce module : l'Horloge lit l'heure avec getIntExtra,
 * et Linking.sendIntent (React Native) n'envoie que des Double. Ici les extras
 * partent bien en Int. Renvoie false si aucune activité n'est au premier plan
 * ou si aucune app d'horloge n'accepte l'intent — jamais d'exception côté JS.
 */
class BakeAlarmModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BakeAlarm")

    Function("setAlarm") { hour: Int, minute: Int, message: String ->
      val activity = appContext.currentActivity
      if (activity == null) {
        false
      } else {
        val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
          putExtra(AlarmClock.EXTRA_HOUR, hour)
          putExtra(AlarmClock.EXTRA_MINUTES, minute)
          putExtra(AlarmClock.EXTRA_MESSAGE, message)
          putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        }
        try {
          activity.startActivity(intent)
          true
        } catch (e: Exception) {
          false
        }
      }
    }
  }
}
