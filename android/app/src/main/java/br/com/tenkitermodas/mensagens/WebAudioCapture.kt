package br.com.tenkitermodas.mensagens

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File

/** Microfone do Android; o resultado segue para a prévia do atendimento, nunca é enviado aqui. */
class WebAudioCapture internal constructor(
    private val activity:Activity,
    private val factory:(File)->Recorder = { file -> AndroidRecorder(activity,file) },
    private val clock:()->Long = {SystemClock.elapsedRealtime()}
) {
    interface Recorder { fun start();fun stop();fun release() }
    private class AndroidRecorder(activity:Activity,file:File):Recorder {
        @Suppress("DEPRECATION") private val value=if(Build.VERSION.SDK_INT>=31)MediaRecorder(activity)else MediaRecorder()
        init { value.setAudioSource(MediaRecorder.AudioSource.MIC);value.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);value.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);value.setAudioEncodingBitRate(64000);value.setAudioSamplingRate(44100);value.setOutputFile(file.absolutePath);value.setMaxDuration(300000) }
        override fun start(){value.prepare();value.start()}
        override fun stop(){value.stop()}
        override fun release(){value.release()}
    }
    companion object { const val PERMISSION=203 }
    private val handler=Handler(Looper.getMainLooper())
    private var callback:((Uri?)->Unit)?=null
    private var recorder:Recorder?=null
    private var file:File?=null
    private var started=0L
    private var dialog:AlertDialog?=null
    private val timer=object:Runnable{override fun run(){
        if(recorder==null)return
        val seconds=((clock()-started)/1000).toInt().coerceAtLeast(0)
        dialog?.setMessage("${seconds/60}:${(seconds%60).toString().padStart(2,'0')} · até 5 minutos\nPare para ouvir antes de enviar.")
        if(seconds>=299)finish(true)else handler.postDelayed(this,500)
    }}
    private fun message(s:String)=Toast.makeText(activity,s,Toast.LENGTH_LONG).show()
    fun begin(done:(Uri?)->Unit){
        cancel();callback=done
        if(activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){activity.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO),PERMISSION);return}
        start()
    }
    fun permissionResult(granted:Boolean){
        if(callback==null)return
        if(granted)start()else{cancel();message("Microfone não autorizado. Permita o microfone nas configurações do aplicativo para gravar.")}
    }
    private fun start(){
        if(callback==null||activity.isFinishing)return
        try{
            val folder=File(activity.cacheDir,"webcapture").apply{mkdirs()}
            folder.listFiles()?.filter{it.lastModified()<System.currentTimeMillis()-86400000}?.forEach{it.delete()}
            val target=File.createTempFile("audio-",".m4a",folder);file=target
            recorder=factory(target);recorder!!.start();started=clock()
            val d=AlertDialog.Builder(activity).setTitle("Gravando áudio").setMessage("0:00 · até 5 minutos\nPare para ouvir antes de enviar.")
                .setPositiveButton("Parar e ouvir"){_,_->finish(true)}.setNegativeButton("Descartar"){_,_->finish(false)}.create()
            dialog=d;d.setOnCancelListener{finish(false)};d.show()
            for(which in listOf(AlertDialog.BUTTON_POSITIVE,AlertDialog.BUTTON_NEGATIVE))d.getButton(which)?.apply{isAllCaps=false;minHeight=(48*activity.resources.displayMetrics.density).toInt()}
            handler.postDelayed(timer,500)
        }catch(_:Exception){cancel();message("Não foi possível gravar. Confira a permissão do microfone e se outro aplicativo está usando o áudio.")}
    }
    fun pause(){if(recorder!=null){cancel();message("Gravação descartada ao sair da tela. Nenhum áudio foi enviado.")}}
    fun cancel(){finish(false)}
    internal fun finish(review:Boolean){
        handler.removeCallbacks(timer)
        val rec=recorder;recorder=null;val target=file;file=null;val done=callback;callback=null
        var ok=false
        if(rec!=null){try{rec.stop();ok=true}catch(_:Exception){}finally{runCatching{rec.release()}}}
        val d=dialog;dialog=null;d?.dismiss()
        val keep=review&&ok&&clock()-started>=1000&&target!=null&&target.length()>0&&target.length()<=16*1048576
        val uri=if(keep)runCatching{FileProvider.getUriForFile(activity,activity.packageName+".updates",target!!)}.getOrNull()else null
        if(uri==null)target?.delete()
        if(review&&uri==null)message("A gravação não ficou pronta. Grave por pelo menos um segundo e tente novamente.")
        done?.invoke(uri)
    }
}
