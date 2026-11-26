package br.com.tenkitermodas.mensagens
import android.app.Application
import com.onesignal.OneSignal
class TenkiterApp: Application() {
    override fun onCreate() { super.onCreate(); OneSignal.initWithContext(this, "535f6b0d-c866-43c2-b241-43bd7ab62fae"); OneSignal.Notifications.addClickListener(object:com.onesignal.notifications.INotificationClickListener{override fun onClick(event:com.onesignal.notifications.INotificationClickEvent){ /* 2.5.5: o ícone principal virou a janelinha de áreas; o toque na notificação abre a conversa nas Mensagens */ val conversa=event.notification.additionalData?.optLong("conversa",0)?:0L; runCatching{startActivity(android.content.Intent(this@TenkiterApp,MainActivity::class.java).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK).putExtra(MainActivity.EXTRA_CONVERSA,conversa).putExtra(MainActivity.EXTRA_ESPIAR,event.result.actionId!="abrir"))} }}); OneSignal.Notifications.addForegroundLifecycleListener(object:com.onesignal.notifications.INotificationLifecycleListener{override fun onWillDisplay(event:com.onesignal.notifications.INotificationWillDisplayEvent){WebKeeper.refresh()}}); WebKeeper.preload(this) }
}
