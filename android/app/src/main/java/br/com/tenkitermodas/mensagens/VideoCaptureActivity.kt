package br.com.tenkitermodas.mensagens

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Camera
import android.media.CamcorderProfile
import android.media.MediaMetadataRetriever
import android.media.MediaRecorder
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.View
import android.view.Gravity
import android.view.WindowManager
import android.widget.*
import androidx.core.content.FileProvider
import java.io.File
import java.util.UUID

/** Captura local: orçamento de 90 s com margem; nunca acessa rede ou envia mídia. */
@Suppress("DEPRECATION")
class VideoCaptureActivity : Activity(), SurfaceHolder.Callback {
    companion object {
        const val VIDEO_BITRATE=1_000_000
        const val AUDIO_BITRATE=64_000
        const val MAX_BYTES=14_000_000L
        const val MIN_RECORDING_CAPACITY_SECONDS=90
        fun estimatedBytes(seconds:Int)=((VIDEO_BITRATE+AUDIO_BITRATE).toLong()*seconds/8*110/100)
    }
    private lateinit var surface:SurfaceView
    private lateinit var status:TextView
    private lateinit var action:Button
    private lateinit var use:Button
    private var cameraId=0
    private var camera:Camera?=null
    private var recorder:MediaRecorder?=null
    private var file:File?=null
    private var recording=false
    private var started=0L
    private var surfaceReady=false
    private var previewRatio=16.0/9
    private fun dp(value:Int)=(value*resources.displayMetrics.density+.5f).toInt()
    private val handler=Handler(Looper.getMainLooper())
    private val tick=object:Runnable { override fun run(){if(recording){val s=(android.os.SystemClock.elapsedRealtime()-started)/1000;status.text="Gravando · ${s/60}:${(s%60).toString().padStart(2,'0')}\nMP4 H.264 · até 720p · áudio AAC";handler.postDelayed(this,500)}} }
    override fun onCreate(state:Bundle?){
        super.onCreate(state);setResult(RESULT_CANCELED)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(16),dp(16),dp(16),dp(24))}
        status=TextView(this).apply{text="Grave até pelo menos 1min30s. O arquivo será limitado para caber no envio. Você confere antes de usar.";textSize=16f;setTextColor(0xff24261f.toInt())};root.addView(status)
        val frame=FrameLayout(this).apply{setBackgroundColor(0xff000000.toInt())};root.addView(frame,LinearLayout.LayoutParams(-1,0,1f))
        surface=object:SurfaceView(this){override fun onMeasure(widthSpec:Int,heightSpec:Int){val w=View.MeasureSpec.getSize(widthSpec);val h=View.MeasureSpec.getSize(heightSpec);val width=minOf(w,(h/previewRatio).toInt());setMeasuredDimension(width,(width*previewRatio).toInt())}}
        frame.addView(surface,FrameLayout.LayoutParams(-1,-1,Gravity.CENTER));surface.holder.addCallback(this)
        action=Button(this).apply{text="Começar gravação";minHeight=dp(56);setOnClickListener{if(recording)stopCapture()else startCapture()}};root.addView(action)
        use=Button(this).apply{text="Usar este vídeo";minHeight=dp(56);isEnabled=false;setOnClickListener{accept()}};root.addView(use)
        root.addView(Button(this).apply{text="Cancelar";minHeight=dp(48);setOnClickListener{finish()}});setContentView(root)
        File(cacheDir,"webcapture").listFiles()?.filter{it.name.startsWith("video-")&&it.lastModified()<System.currentTimeMillis()-86400000L}?.forEach{it.delete()}
        if(!permitted())requestPermissions(arrayOf(Manifest.permission.CAMERA,Manifest.permission.RECORD_AUDIO),301)
    }
    private fun permitted()=checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED
    override fun onRequestPermissionsResult(code:Int,p:Array<out String>,r:IntArray){super.onRequestPermissionsResult(code,p,r);if(code==301){if(permitted()&&surfaceReady)openCamera()else{status.text="Permita câmera e microfone para gravar com áudio. Nada foi enviado.";action.isEnabled=false}}}
    override fun surfaceCreated(holder:SurfaceHolder){surfaceReady=true;if(permitted())openCamera()}
    override fun surfaceChanged(holder:SurfaceHolder,format:Int,w:Int,h:Int){}
    override fun surfaceDestroyed(holder:SurfaceHolder){surfaceReady=false;releaseCamera()}
    @android.annotation.SuppressLint("MissingPermission")
    private fun openCamera(){
        if(camera!=null)return
        try{cameraId=(0 until Camera.getNumberOfCameras()).firstOrNull{val info=Camera.CameraInfo();Camera.getCameraInfo(it,info);info.facing==Camera.CameraInfo.CAMERA_FACING_BACK}?:0;camera=Camera.open(cameraId).also{val info=Camera.CameraInfo();Camera.getCameraInfo(cameraId,info);it.setDisplayOrientation(info.orientation);
            val profile=CamcorderProfile.get(cameraId,if(CamcorderProfile.hasProfile(cameraId,CamcorderProfile.QUALITY_720P))CamcorderProfile.QUALITY_720P else CamcorderProfile.QUALITY_480P)
            val desired=profile.videoFrameWidth.toDouble()/profile.videoFrameHeight
            val params=it.parameters;val size=params.supportedPreviewSizes.filter{p->p.width<=1280&&p.height<=720}.minByOrNull{p->kotlin.math.abs(p.width.toDouble()/p.height-desired)*10000-p.width*p.height/1_000_000.0}?:throw IllegalStateException("Prévia incompatível")
            params.setPreviewSize(size.width,size.height);it.parameters=params;previewRatio=if(info.orientation%180==0)size.height.toDouble()/size.width else size.width.toDouble()/size.height;surface.requestLayout()
            it.setPreviewDisplay(surface.holder);it.startPreview()};action.isEnabled=true}
        catch(_:Exception){releaseCamera();status.text="Não consegui abrir a câmera. Feche outros aplicativos que usam a câmera e tente novamente.";action.isEnabled=false}
    }
    @android.annotation.SuppressLint("MissingPermission")
    private fun startCapture(){
        if(!permitted()||!surfaceReady)return
        use.isEnabled=false
        try{
            if(camera==null)openCamera();val c=camera?:return
            val quality=if(CamcorderProfile.hasProfile(cameraId,CamcorderProfile.QUALITY_720P))CamcorderProfile.QUALITY_720P else CamcorderProfile.QUALITY_480P
            val profile=CamcorderProfile.get(cameraId,quality)
            val sizes=c.parameters.supportedVideoSizes?:c.parameters.supportedPreviewSizes
            val size=sizes.firstOrNull{it.width==profile.videoFrameWidth&&it.height==profile.videoFrameHeight&&it.width<=1280&&it.height<=720}?:throw IllegalStateException("Câmera sem resolução compatível")
            file?.delete();file=File(cacheDir,"webcapture/video-${UUID.randomUUID()}.mp4").apply{parentFile?.mkdirs()}
            c.unlock()
            recorder=MediaRecorder().apply{
                setCamera(c);setAudioSource(MediaRecorder.AudioSource.CAMCORDER);setVideoSource(MediaRecorder.VideoSource.CAMERA)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);setVideoEncoder(MediaRecorder.VideoEncoder.H264);setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setVideoSize(size.width,size.height);setVideoFrameRate(minOf(30,profile.videoFrameRate));setVideoEncodingBitRate(VIDEO_BITRATE)
                setAudioEncodingBitRate(AUDIO_BITRATE);setAudioSamplingRate(44100);setAudioChannels(1);val info=Camera.CameraInfo();Camera.getCameraInfo(cameraId,info);setOrientationHint(info.orientation)
                setMaxFileSize(MAX_BYTES);setOutputFile(file!!.absolutePath);setPreviewDisplay(this@VideoCaptureActivity.surface.holder.surface)
                setOnInfoListener{_,what,_->if(what==MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED)stopCapture()}
                setOnErrorListener{_,_,_->stopCapture()};prepare();start()
            }
            recording=true;started=android.os.SystemClock.elapsedRealtime();action.text="Parar gravação";use.isEnabled=false;handler.post(tick)
        }catch(_:Exception){releaseRecorder();try{camera?.lock()}catch(_:Exception){};status.text="Não consegui iniciar com resolução e formato compatíveis. Tente novamente; nada foi enviado."}
    }
    private fun stopCapture(){
        if(!recording)return
        recording=false;handler.removeCallbacks(tick)
        var valid=true;try{recorder?.stop()}catch(_:Exception){valid=false};releaseRecorder();try{camera?.lock()}catch(_:Exception){}
        val f=file
        if(!valid||f==null||f.length()<=0||f.length()>MAX_BYTES){f?.delete();file=null;status.text="A gravação não ficou válida. Grave novamente; nada foi enviado.";use.isEnabled=false}
        else{status.text="Vídeo pronto · ${(f.length()/1048576.0).let{String.format(java.util.Locale.ROOT,"%.1f",it)}} MiB. Toque em Usar para conferir antes do envio.";use.isEnabled=true}
        action.text="Gravar novamente"
    }
    private fun accept(){
        val f=file?:return
        if(recording||f.length() !in 1..MAX_BYTES)return
        try{
            val m=MediaMetadataRetriever();val duration=try{m.setDataSource(f.absolutePath);m.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?:0}finally{m.release()}
            if(duration<500){status.text="Vídeo muito curto ou inválido. Grave novamente.";return}
            val uri=FileProvider.getUriForFile(this,packageName+".updates",f)
            setResult(RESULT_OK,Intent().setDataAndType(uri,"video/mp4").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));file=null;finish()
        }catch(_:Exception){status.text="Não consegui conferir este arquivo. Grave novamente; nada foi enviado."}
    }
    private fun releaseRecorder(){try{recorder?.reset();recorder?.release()}catch(_:Exception){};recorder=null}
    private fun releaseCamera(){if(recording)stopCapture();releaseRecorder();try{camera?.stopPreview();camera?.release()}catch(_:Exception){};camera=null}
    override fun onResume(){super.onResume();if(surfaceReady&&permitted())openCamera()}
    override fun onPause(){super.onPause();releaseCamera()}
    override fun onDestroy(){handler.removeCallbacksAndMessages(null);releaseCamera();file?.delete();super.onDestroy()}
}
