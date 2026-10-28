package br.com.tenkitermodas.mensagens
import android.app.Application
import com.onesignal.OneSignal
class TenkiterApp: Application() {
    override fun onCreate() { super.onCreate(); OneSignal.initWithContext(this, "535f6b0d-c866-43c2-b241-43bd7ab62fae"); OneSignal.Notifications.addForegroundLifecycleListener(object:com.onesignal.notifications.INotificationLifecycleListener{override fun onWillDisplay(event:com.onesignal.notifications.INotificationWillDisplayEvent){WebKeeper.refresh()}}); WebKeeper.preload(this) }
}
