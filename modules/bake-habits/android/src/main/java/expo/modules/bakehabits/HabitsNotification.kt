package expo.modules.bakehabits

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.AlarmManagerCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * HabitsNotification — la notification PERSISTANTE des habitudes restantes.
 *
 * Chaque matin à l'heure réglée, une alarme (AlarmManager) affiche la liste des
 * habitudes du jour. La notification reste jusqu'à ce que tout soit validé :
 *  - l'app la met à jour à chaque validation (`configure`), en silence ;
 *  - elle est « ongoing », et si l'utilisateur la balaie quand même (Android 14
 *    le permet), son `deleteIntent` la fait réapparaître aussitôt ;
 *  - elle disparaît quand il ne reste rien à valider.
 *
 * Tout ce qu'il faut pour travailler app fermée est gardé dans des
 * SharedPreferences : l'heure, le texte d'un jour ordinaire (`body`, toutes les
 * habitudes cochées), et celui d'aujourd'hui (`todayBody`, ce qui reste, null
 * si tout est fait), valable seulement pour le jour `today`. Les jours suivants
 * reprennent `body` : rien n'y est encore validé. Il n'y a donc rien à
 * reprogrammer jour après jour, l'alarme se réarme toute seule.
 *
 * La liste de la veille n'est jamais reproposée : avant l'heure du rappel, la
 * notification est retirée (et pas remise si on la balaie).
 */
object HabitsNotification {
  const val ACTION_ALARM = "expo.modules.bakehabits.ALARM"
  const val ACTION_DISMISSED = "expo.modules.bakehabits.DISMISSED"

  /** Même canal que celui créé côté JS (`lib/notifications.ts`). */
  private const val CHANNEL_ID = "habitudes"
  private const val CHANNEL_NAME = "Habitudes"

  /** Tag + id fixes : chaque affichage remplace le précédent. */
  private const val NOTIF_TAG = "bake-habits"
  private const val NOTIF_ID = 1

  private const val PREFS = "bake_habits_reminder"
  private const val K_HOUR = "hour"
  private const val K_MINUTE = "minute"
  private const val K_TITLE = "title"
  private const val K_BODY = "body"
  private const val K_TODAY = "today"
  private const val K_TODAY_BODY = "todayBody"
  private const val K_SHOWN_DAY = "shownDay"

  /** Enregistre le rappel, met la notification à jour (en silence) et arme l'alarme. */
  fun configure(
    context: Context,
    hour: Int,
    minute: Int,
    title: String,
    body: String?,
    today: String,
    todayBody: String?,
  ) {
    prefs(context).edit()
      .putInt(K_HOUR, hour)
      .putInt(K_MINUTE, minute)
      .putString(K_TITLE, title)
      .putString(K_BODY, body)
      .putString(K_TODAY, today)
      .putString(K_TODAY_BODY, todayBody)
      .apply()
    refresh(context, alert = false)
    armNext(context)
  }

  /** Coupe tout : alarme, notification affichée, réglage gardé. */
  fun stop(context: Context) {
    prefs(context).edit().clear().apply()
    alarmManager(context).cancel(broadcast(context, ACTION_ALARM))
    NotificationManagerCompat.from(context).cancel(NOTIF_TAG, NOTIF_ID)
  }

  /**
   * Affiche (ou retire) la notification selon l'heure qu'il est et ce qui est
   * enregistré. `alert` : faire sonner si elle n'a pas déjà été montrée
   * aujourd'hui (l'alarme du matin) ; sinon, mise à jour silencieuse.
   */
  fun refresh(context: Context, alert: Boolean) {
    val p = prefs(context)
    if (!p.contains(K_HOUR)) return
    val manager = NotificationManagerCompat.from(context)
    val now = System.currentTimeMillis()
    val today = dayKey(now)

    if (now < todayAt(p.getInt(K_HOUR, 0), p.getInt(K_MINUTE, 0))) {
      manager.cancel(NOTIF_TAG, NOTIF_ID) // liste de la veille : plus d'actualité
      return
    }
    val body = if (p.getString(K_TODAY, null) == today) {
      p.getString(K_TODAY_BODY, null)
    } else {
      p.getString(K_BODY, null)
    }
    val alreadyShown = p.getString(K_SHOWN_DAY, null) == today
    p.edit().putString(K_SHOWN_DAY, today).apply()
    if (body == null) {
      manager.cancel(NOTIF_TAG, NOTIF_ID) // tout est validé
      return
    }
    post(context, p.getString(K_TITLE, null) ?: CHANNEL_NAME, body, silent = !alert || alreadyShown)
  }

  /** Arme l'alarme pour la prochaine occurrence de l'heure réglée. */
  fun armNext(context: Context) {
    val p = prefs(context)
    val am = alarmManager(context)
    val operation = broadcast(context, ACTION_ALARM)
    if (!p.contains(K_HOUR)) {
      am.cancel(operation)
      return
    }
    val now = System.currentTimeMillis()
    val hour = p.getInt(K_HOUR, 0)
    val minute = p.getInt(K_MINUTE, 0)
    var at = todayAt(hour, minute)
    if (at <= now) at = tomorrowAt(hour, minute)

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()) {
      AlarmManagerCompat.setExactAndAllowWhileIdle(am, AlarmManager.RTC_WAKEUP, at, operation)
    } else {
      AlarmManagerCompat.setAndAllowWhileIdle(am, AlarmManager.RTC_WAKEUP, at, operation)
    }
  }

  /** Vrai si l'utilisateur autorise les notifications de l'app. */
  fun notificationsEnabled(context: Context): Boolean =
    NotificationManagerCompat.from(context).areNotificationsEnabled()

  @SuppressLint("MissingPermission") // vérifiée juste au-dessus de notify()
  private fun post(context: Context, title: String, body: String, silent: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      return
    }
    ensureChannel(context)
    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon(context))
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setOngoing(true)
      .setAutoCancel(false)
      // Pas de setOnlyAlertOnce : le matin, la notif remplace souvent celle de
      // la veille (pas finie), et doit sonner quand même. Les mises à jour, elles,
      // passent `silent`.
      .setSilent(silent)
      .setDeleteIntent(broadcast(context, ACTION_DISMISSED))
    openApp(context)?.let { builder.setContentIntent(it) }
    iconColor(context)?.let { builder.setColor(it) }
    try {
      val manager = NotificationManagerCompat.from(context)
      // Une notif neuve (et non une mise à jour) le matin : elle remonte en tête.
      if (!silent) manager.cancel(NOTIF_TAG, NOTIF_ID)
      manager.notify(NOTIF_TAG, NOTIF_ID, builder.build())
    } catch (e: Exception) {
      // permission retirée entre-temps : on ignore, comme côté JS.
    }
  }

  /** Le canal existe déjà si l'app a été ouverte ; sinon on le crée à l'identique. */
  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_DEFAULT),
      )
    }
  }

  /** L'icône de notification générée par le plugin expo-notifications (app.json). */
  private fun smallIcon(context: Context): Int {
    val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }

  private fun iconColor(context: Context): Int? {
    val id = context.resources.getIdentifier("notification_icon_color", "color", context.packageName)
    return if (id != 0) ContextCompat.getColor(context, id) else null
  }

  /** Toucher la notification ouvre l'app (sans la retirer). */
  private fun openApp(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    return PendingIntent.getActivity(
      context,
      0,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun broadcast(context: Context, action: String): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      0,
      Intent(context, HabitsReceiver::class.java).setAction(action),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun alarmManager(context: Context): AlarmManager =
    context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  /** "YYYY-MM-DD" en heure locale, même format que `todayKey()` côté JS. */
  private fun dayKey(millis: Long): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(millis))

  private fun todayAt(hour: Int, minute: Int): Long = at(0, hour, minute)

  private fun tomorrowAt(hour: Int, minute: Int): Long = at(1, hour, minute)

  /** `hour:minute` (heure locale) dans `days` jours — juste aux changements d'heure. */
  private fun at(days: Int, hour: Int, minute: Int): Long =
    Calendar.getInstance().apply {
      add(Calendar.DATE, days)
      set(Calendar.HOUR_OF_DAY, hour)
      set(Calendar.MINUTE, minute)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }.timeInMillis
}
