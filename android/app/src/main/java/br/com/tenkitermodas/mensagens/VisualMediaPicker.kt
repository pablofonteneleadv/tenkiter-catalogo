package br.com.tenkitermodas.mensagens

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.provider.MediaStore
import android.webkit.WebChromeClient

/** Photo Picker do Android, com galeria do aparelho nos Androids que ainda não o oferecem. */
object VisualMediaPicker {
    fun accepts(types:Array<String>)=types.flatMap{it.split(',')}.map{it.trim().lowercase()}.filter{it.isNotEmpty()}
    fun recording(types:Array<String>,capture:Boolean)=accepts(types).let{it.isNotEmpty()&&it.all{v->v.startsWith("audio/")}&&(capture||it==listOf("audio/mp4"))}
    fun visual(types:Array<String>):Boolean=accepts(types).let{it.isNotEmpty()&&it.all{v->v.startsWith("image/")||v.startsWith("video/")}}
    /** A seleção múltipla precisa preservar ClipData, inclusive para foto + vídeo. */
    fun galleryIntent(multiple:Boolean):Intent = Intent(Intent.ACTION_GET_CONTENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
        putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/*", "video/*"))
        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
    }
    fun cameraIntent():Intent = Intent(MediaStore.ACTION_VIDEO_CAPTURE).apply {
        putExtra(MediaStore.EXTRA_VIDEO_QUALITY, 1)
    }
    fun open(activity:Activity,params:WebChromeClient.FileChooserParams,request:Int,cancel:()->Unit) {
        // A WebView pode informar MODE_OPEN mesmo quando o site permite várias fotos.
        // Sempre disponibilizar seleção múltipla na galeria; o site recebe ClipData completo.
        val multi=true
        fun iniciar(intent:Intent) {
            try { activity.startActivityForResult(intent,request) }
            catch(_:Exception) {
                AlertDialog.Builder(activity).setTitle("Não foi possível abrir")
                    .setMessage("Confira se há uma galeria ou câmera instalada no Android.")
                    .setPositiveButton("OK"){_,_->cancel()}
                    .setOnCancelListener{cancel()}.show()
            }
        }
        // O clipe deve abrir imediatamente a galeria. A ação Gravar vídeo usa capture; o clipe continua abrindo a galeria.
        if(params.isCaptureEnabled && accepts(params.acceptTypes).any { it.startsWith("video/") }) iniciar(cameraIntent())
        else iniciar(galleryIntent(multi))
    }
}
