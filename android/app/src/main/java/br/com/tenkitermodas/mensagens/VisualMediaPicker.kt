package br.com.tenkitermodas.mensagens

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.provider.MediaStore
import android.webkit.WebChromeClient
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts

/** Photo Picker do Android, com galeria do aparelho nos Androids que ainda não o oferecem. */
object VisualMediaPicker {
    fun accepts(types:Array<String>)=types.flatMap{it.split(',')}.map{it.trim().lowercase()}.filter{it.isNotEmpty()}
    fun recording(types:Array<String>,capture:Boolean)=accepts(types).let{it.isNotEmpty()&&it.all{v->v.startsWith("audio/")}&&(capture||it==listOf("audio/mp4"))}
    fun visual(types:Array<String>):Boolean=accepts(types).let{it.isNotEmpty()&&it.all{v->v.startsWith("image/")||v.startsWith("video/")}}
    fun modernIntent(activity:Activity,types:Array<String>):Intent {
        val t=accepts(types);val images=t.any{it.startsWith("image/")};val videos=t.any{it.startsWith("video/")}
        val kind=if(images&&videos)ActivityResultContracts.PickVisualMedia.ImageAndVideo else if(videos)ActivityResultContracts.PickVisualMedia.VideoOnly else ActivityResultContracts.PickVisualMedia.ImageOnly
        return ActivityResultContracts.PickVisualMedia().createIntent(activity,PickVisualMediaRequest.Builder().setMediaType(kind).build())
    }
    fun galleryIntent(video:Boolean)=Intent(Intent.ACTION_PICK).setDataAndType(if(video)MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI,if(video)"video/*"else"image/*")
    fun open(activity:Activity,params:WebChromeClient.FileChooserParams,request:Int,cancel:()->Unit) {
        fun files(){try{activity.startActivityForResult(params.createIntent().addCategory(Intent.CATEGORY_OPENABLE),request)}catch(_:Exception){cancel()}}
        fun gallery(video:Boolean){
            try{activity.startActivityForResult(galleryIntent(video),request)}catch(_:Exception){
                AlertDialog.Builder(activity).setTitle("Galeria indisponível").setMessage("Este aparelho não disponibilizou uma galeria. Você pode escolher a mídia pelos arquivos.").setPositiveButton("Escolher em arquivos"){_,_->files()}.setNegativeButton("Cancelar"){_,_->cancel()}.setOnCancelListener{cancel()}.show()
            }
        }
        if(ActivityResultContracts.PickVisualMedia.isPhotoPickerAvailable(activity)){
            try{activity.startActivityForResult(modernIntent(activity,params.acceptTypes),request);return}catch(_:Exception){/* usa a galeria */}
        }
        val t=accepts(params.acceptTypes)
        if(t.any{it.startsWith("image/")}&&t.any{it.startsWith("video/")})AlertDialog.Builder(activity).setTitle("Enviar foto ou vídeo").setItems(arrayOf("Fotos","Vídeos")){_,n->gallery(n==1)}.setNegativeButton("Cancelar"){_,_->cancel()}.setOnCancelListener{cancel()}.show()
        else gallery(t.any{it.startsWith("video/")})
    }
}
