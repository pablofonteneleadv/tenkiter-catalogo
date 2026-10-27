package br.com.tenkitermodas.mensagens

import android.content.Context
import android.os.Build
import androidx.work.*
import com.onesignal.notifications.INotificationServiceExtension
import com.onesignal.notifications.INotificationReceivedEvent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

class InboxWorker(context:Context,params:WorkerParameters):CoroutineWorker(context,params){
    override suspend fun doWork():Result=withContext(Dispatchers.IO){
        val r=NativeRepository.get(applicationContext)
        if(r.store.auth()==null)return@withContext Result.success()
        if(r.sync(inputData.getLong("conversation",0)))Result.success() else if(runAttemptCount<2)Result.retry()else Result.failure()
    }
}
object BackgroundSync {
    private fun constraints()=Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
    fun periodic(c:Context){
        WorkManager.getInstance(c).enqueueUniquePeriodicWork("inbox-periodic",ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<InboxWorker>(15,TimeUnit.MINUTES).setConstraints(constraints()).build())
    }
    fun now(c:Context,id:Long=0){
        val builder=OneTimeWorkRequestBuilder<InboxWorker>().setConstraints(constraints()).setInputData(workDataOf("conversation" to id))
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,10,TimeUnit.SECONDS)
        if(Build.VERSION.SDK_INT>=31)builder.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
        val work=builder.build()
        WorkManager.getInstance(c).enqueueUniqueWork("inbox-immediate",ExistingWorkPolicy.APPEND_OR_REPLACE,work)
    }
    fun cancel(c:Context){WorkManager.getInstance(c).cancelUniqueWork("inbox-periodic");WorkManager.getInstance(c).cancelUniqueWork("inbox-immediate")}
}
class InboxNotificationExtension:INotificationServiceExtension {
    override fun onNotificationReceived(event:INotificationReceivedEvent){
        // Não bloqueia a notificação: o sistema mostra o aviso e o WorkManager atualiza o banco.
        if(!event.restoring)runCatching{BackgroundSync.now(event.context,event.notification.additionalData?.optLong("conversa",0)?:0)}
    }
}
