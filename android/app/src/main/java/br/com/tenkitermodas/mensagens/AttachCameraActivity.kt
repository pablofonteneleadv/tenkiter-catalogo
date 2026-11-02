package br.com.tenkitermodas.mensagens

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.OrientationEventListener
import android.view.Surface
import android.view.View
import android.view.WindowManager
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.DynamicRange
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.core.UseCase
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Câmera dentro do app: toque tira foto, segurar grava vídeo (ou alterna Foto/Vídeo), troca frontal/traseira,
 * flash e prévia com Refazer/Enviar. Nada é enviado aqui; o arquivo volta para a gaveta e dela para a WebView.
 */
class AttachCameraActivity : ComponentActivity() {
    companion object {
        const val REQ_CAMERA=601
        const val REQ_AUDIO=602
        const val PREFS="anexo-camera"
        fun folder(context:Context)=File(context.cacheDir,"webcapture").apply{mkdirs()}
        fun name(prefix:String,ext:String)="TENKiTER-$prefix-"+SimpleDateFormat("yyyyMMdd-HHmmss",Locale.ROOT).format(Date())+"-"+UUID.randomUUID().toString().take(6)+"."+ext
    }
    private enum class Mode { PHOTO, VIDEO }
    private enum class Flash(val label:String,val photo:Int){ AUTO("Flash automático",ImageCapture.FLASH_MODE_AUTO), ON("Flash ligado",ImageCapture.FLASH_MODE_ON), OFF("Flash desligado",ImageCapture.FLASH_MODE_OFF) }
    private val accent=Color.rgb(168,82,0)
    private val handler=Handler(Looper.getMainLooper())
    private val io=Executors.newSingleThreadExecutor()
    private lateinit var previewView:PreviewView
    private lateinit var shutter:Shutter
    private lateinit var status:TextView
    private lateinit var hint:TextView
    private lateinit var flashButton:Button
    private lateinit var qualityButton:Button
    private lateinit var switchButton:Button
    private lateinit var photoTab:TextView
    private lateinit var videoTab:TextView
    private lateinit var controls:View
    private lateinit var review:FrameLayout
    private lateinit var reviewImage:ImageView
    private lateinit var reviewVideo:VideoView
    private lateinit var reviewInfo:TextView
    private lateinit var blocked:LinearLayout
    private lateinit var blockedText:TextView
    private var provider:ProcessCameraProvider?=null
    private var camera:Camera?=null
    private var imageCapture:ImageCapture?=null
    private var videoCapture:VideoCapture<Recorder>?=null
    private var recording:Recording?=null
    private var combined=true
    private var mode=Mode.PHOTO
    private var front=false
    private var flash=Flash.AUTO
    private var tier=VideoQuality.Tier.HIGH
    private var supportsFullHd=true
    private var supportsHd=true
    private var holding=false
    private var stopWhenStarted=false
    private var startedAt=0L
    private var limitReached=false
    private var result:File?=null
    private var resultMime=""
    private var busy=false
    private val plan get()=VideoQuality.plan(tier,supportsFullHd,supportsHd)
    private fun dp(v:Int)=(v*resources.displayMetrics.density+.5f).toInt()
    private fun granted(p:String)=ContextCompat.checkSelfPermission(this,p)==PackageManager.PERMISSION_GRANTED
    private fun toast(s:String)=Toast.makeText(this,s,Toast.LENGTH_LONG).show()
    private val orientation by lazy { object:OrientationEventListener(this){override fun onOrientationChanged(o:Int){if(o==ORIENTATION_UNKNOWN)return;val r=when(o){in 45 until 135->Surface.ROTATION_270;in 135 until 225->Surface.ROTATION_180;in 225 until 315->Surface.ROTATION_90;else->Surface.ROTATION_0};imageCapture?.targetRotation=r;videoCapture?.targetRotation=r}} }

    override fun onCreate(state:Bundle?){
        super.onCreate(state);setResult(RESULT_CANCELED)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window,false)
        val prefs=getSharedPreferences(PREFS,0);tier=if(prefs.getString("tier","alta")=="longa")VideoQuality.Tier.LONG else VideoQuality.Tier.HIGH
        folder(this).listFiles()?.filter{it.name.startsWith("TENKiTER-")&&it.lastModified()<System.currentTimeMillis()-86400000L}?.forEach{it.delete()}
        val root=FrameLayout(this).apply{setBackgroundColor(Color.BLACK)}
        previewView=PreviewView(this).apply{implementationMode=PreviewView.ImplementationMode.COMPATIBLE;scaleType=PreviewView.ScaleType.FILL_CENTER;contentDescription="Visor da câmera"}
        root.addView(previewView,FrameLayout.LayoutParams(-1,-1))
        val top=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(8),dp(8),dp(8),dp(8));setBackgroundColor(Color.argb(110,0,0,0))}
        top.addView(chip("Fechar"){finish()})
        top.addView(View(this),LinearLayout.LayoutParams(0,1,1f))
        qualityButton=chip(plan.label){toggleTier()};top.addView(qualityButton)
        flashButton=chip(flash.label){toggleFlash()};top.addView(flashButton,LinearLayout.LayoutParams(-2,-2).apply{marginStart=dp(8)})
        root.addView(top,FrameLayout.LayoutParams(-1,-2,Gravity.TOP))
        status=TextView(this).apply{textSize=16f;setTypeface(typeface,Typeface.BOLD);setTextColor(Color.WHITE);setPadding(dp(14),dp(6),dp(14),dp(6));background=pill(Color.argb(170,0,0,0));visibility=View.GONE;importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_YES;ViewCompat.setAccessibilityLiveRegion(this,ViewCompat.ACCESSIBILITY_LIVE_REGION_POLITE)}
        root.addView(status,FrameLayout.LayoutParams(-2,-2,Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply{topMargin=dp(76)})
        val bottom=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER_HORIZONTAL;setPadding(dp(16),dp(12),dp(16),dp(16));setBackgroundColor(Color.argb(110,0,0,0))}
        hint=TextView(this).apply{textSize=14f;setTextColor(Color.WHITE);gravity=Gravity.CENTER};bottom.addView(hint,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(8)})
        val row=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL}
        switchButton=chip("Virar câmera"){if(recording==null){front=!front;bind()}}.apply{contentDescription="Trocar entre câmera frontal e traseira"}
        row.addView(switchButton,LinearLayout.LayoutParams(0,-2,1f))
        shutter=Shutter(this);row.addView(shutter,LinearLayout.LayoutParams(dp(80),dp(80)).apply{marginStart=dp(12);marginEnd=dp(12)})
        row.addView(View(this),LinearLayout.LayoutParams(0,1,1f))
        bottom.addView(row)
        val tabs=LinearLayout(this).apply{gravity=Gravity.CENTER}
        photoTab=tab("Foto"){setMode(Mode.PHOTO)};videoTab=tab("Vídeo"){setMode(Mode.VIDEO)}
        tabs.addView(photoTab);tabs.addView(videoTab);bottom.addView(tabs,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(8)})
        root.addView(bottom,FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM));controls=bottom
        shutter.setOnClickListener{if(busy)return@setOnClickListener;if(mode==Mode.PHOTO)takePhoto()else if(recording==null)startVideo(false)else stopVideo()}
        shutter.setOnLongClickListener{if(mode==Mode.PHOTO&&recording==null&&combined&&!busy){holding=true;startVideo(true);true}else false}
        @SuppressLint("ClickableViewAccessibility")
        val touch=View.OnTouchListener{_,e->if((e.actionMasked==MotionEvent.ACTION_UP||e.actionMasked==MotionEvent.ACTION_CANCEL)&&holding){holding=false;if(recording!=null)stopVideo()else stopWhenStarted=true};false}
        shutter.setOnTouchListener(touch)
        review=FrameLayout(this).apply{setBackgroundColor(Color.BLACK);visibility=View.GONE;isClickable=true}
        reviewImage=ImageView(this).apply{scaleType=ImageView.ScaleType.FIT_CENTER;contentDescription="Prévia da foto"};review.addView(reviewImage,FrameLayout.LayoutParams(-1,-1))
        reviewVideo=VideoView(this).apply{contentDescription="Prévia do vídeo";setOnClickListener{if(isPlaying)pause()else start()}};review.addView(reviewVideo,FrameLayout.LayoutParams(-1,-1,Gravity.CENTER))
        val reviewBar=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(16),dp(12),dp(16),dp(16));setBackgroundColor(Color.argb(170,0,0,0))}
        reviewInfo=TextView(this).apply{textSize=14f;setTextColor(Color.WHITE)};reviewBar.addView(reviewInfo,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(8)})
        val actions=LinearLayout(this)
        actions.addView(big("Refazer",false){retake()},LinearLayout.LayoutParams(0,dp(52),1f).apply{marginEnd=dp(12)})
        actions.addView(big("Enviar",true){accept()},LinearLayout.LayoutParams(0,dp(52),1f))
        reviewBar.addView(actions);review.addView(reviewBar,FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM))
        root.addView(review,FrameLayout.LayoutParams(-1,-1))
        blocked=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;setPadding(dp(24),dp(24),dp(24),dp(24));setBackgroundColor(Color.BLACK);visibility=View.GONE;isClickable=true}
        blockedText=TextView(this).apply{textSize=17f;setTextColor(Color.WHITE);gravity=Gravity.CENTER};blocked.addView(blockedText,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(16)})
        blocked.addView(big("Abrir configurações",true){runCatching{startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.fromParts("package",packageName,null)))}},LinearLayout.LayoutParams(-1,dp(52)).apply{bottomMargin=dp(12)})
        blocked.addView(big("Voltar para a galeria",false){finish()},LinearLayout.LayoutParams(-1,dp(52)))
        root.addView(blocked,FrameLayout.LayoutParams(-1,-1))
        ViewCompat.setOnApplyWindowInsetsListener(root){_,insets->val b=insets.getInsets(WindowInsetsCompat.Type.systemBars());top.setPadding(dp(8)+b.left,dp(8)+b.top,dp(8)+b.right,dp(8));bottom.setPadding(dp(16)+b.left,dp(12),dp(16)+b.right,dp(16)+b.bottom);reviewBar.setPadding(dp(16)+b.left,dp(12),dp(16)+b.right,dp(16)+b.bottom);(status.layoutParams as FrameLayout.LayoutParams).topMargin=dp(76)+b.top;insets}
        setContentView(root);setMode(Mode.PHOTO)
        if(granted(Manifest.permission.CAMERA))start()else requestPermissions(arrayOf(Manifest.permission.CAMERA),REQ_CAMERA)
    }
    private fun pill(color:Int)=GradientDrawable().apply{setColor(color);cornerRadius=dp(24).toFloat()}
    private fun chip(label:String,click:()->Unit)=Button(this).apply{text=label;isAllCaps=false;textSize=14f;setTextColor(Color.WHITE);background=pill(Color.argb(150,0,0,0));minHeight=dp(48);minimumHeight=dp(48);minWidth=dp(48);stateListAnimator=null;setPadding(dp(14),0,dp(14),0);setOnClickListener{click()}}
    private fun big(label:String,primary:Boolean,click:()->Unit)=Button(this).apply{text=label;isAllCaps=false;textSize=16f;setTypeface(typeface,Typeface.BOLD);setTextColor(Color.WHITE);background=GradientDrawable().apply{setColor(if(primary)accent else Color.argb(60,255,255,255));cornerRadius=dp(26).toFloat();if(!primary)setStroke(dp(1),Color.WHITE)};minHeight=dp(52);stateListAnimator=null;setOnClickListener{click()}}
    private fun tab(label:String,click:()->Unit)=TextView(this).apply{text=label;textSize=15f;gravity=Gravity.CENTER;minHeight=dp(48);minWidth=dp(88);setPadding(dp(12),0,dp(12),0);setOnClickListener{click()};isClickable=true;isFocusable=true}

    private fun setMode(m:Mode){
        if(recording!=null)return
        mode=m
        refreshLabels()
        if(!combined&&provider!=null)bind()
        if(m==Mode.VIDEO&&!granted(Manifest.permission.RECORD_AUDIO))requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO),REQ_AUDIO)
    }
    private fun refreshLabels(){
        val m=mode
        for((t,on) in listOf(photoTab to (m==Mode.PHOTO),videoTab to (m==Mode.VIDEO))){t.setTextColor(if(on)Color.WHITE else Color.argb(190,255,255,255));t.setTypeface(null,if(on)Typeface.BOLD else Typeface.NORMAL);t.background=if(on)GradientDrawable().apply{setColor(accent);cornerRadius=dp(24).toFloat()}else null;t.isSelected=on;t.contentDescription=if(on)"${label(t)}, selecionado" else label(t)}
        qualityButton.visibility=if(m==Mode.VIDEO)View.VISIBLE else View.GONE;qualityButton.text=plan.label;qualityButton.contentDescription="Qualidade do vídeo: ${plan.label}. Toque para trocar."
        hint.text=if(m==Mode.PHOTO)(if(combined)"Toque para foto · segure para vídeo" else "Toque para tirar a foto") else "Toque para gravar · ${plan.label}"
        shutter.video=m==Mode.VIDEO;shutter.contentDescription=if(m==Mode.PHOTO)"Tirar foto" else "Começar gravação";shutter.invalidate()
        updateFlash()
    }
    private fun label(t:TextView)=if(t===photoTab)"Foto" else "Vídeo"
    private fun toggleTier(){if(recording!=null)return;tier=if(tier==VideoQuality.Tier.HIGH)VideoQuality.Tier.LONG else VideoQuality.Tier.HIGH;getSharedPreferences(PREFS,0).edit().putString("tier",if(tier==VideoQuality.Tier.LONG)"longa" else "alta").apply();refreshLabels();bind()}
    private fun toggleFlash(){flash=Flash.values()[(flash.ordinal+1)%Flash.values().size];updateFlash()}
    private fun updateFlash(){
        val has=camera?.cameraInfo?.hasFlashUnit()==true
        flashButton.visibility=if(has)View.VISIBLE else View.GONE
        if(mode==Mode.VIDEO&&flash==Flash.AUTO)flash=Flash.OFF
        flashButton.text=if(mode==Mode.VIDEO)(if(flash==Flash.ON)"Luz ligada" else "Luz desligada") else flash.label
        imageCapture?.flashMode=flash.photo
        if(has)camera?.cameraControl?.enableTorch(mode==Mode.VIDEO&&flash==Flash.ON)
    }

    @Deprecated("Activity result API") override fun onRequestPermissionsResult(code:Int,p:Array<String>,r:IntArray){
        super.onRequestPermissionsResult(code,p,r)
        if(code==REQ_CAMERA){if(granted(Manifest.permission.CAMERA)){blocked.visibility=View.GONE;start()}else{blockedText.text="Permita a câmera para fotografar e gravar aqui. Você também pode escolher da galeria.";blocked.visibility=View.VISIBLE}}
        if(code==REQ_AUDIO&&!granted(Manifest.permission.RECORD_AUDIO))toast("Sem o microfone, o vídeo não pode ser gravado com som. Permita o microfone nas configurações do app.")
    }
    override fun onResume(){super.onResume();if(blocked.visibility==View.VISIBLE&&granted(Manifest.permission.CAMERA)){blocked.visibility=View.GONE;start()};orientation.enable()}
    override fun onPause(){orientation.disable();if(recording!=null)stopVideo();if(::reviewVideo.isInitialized)reviewVideo.pause();super.onPause()}
    override fun onDestroy(){handler.removeCallbacksAndMessages(null);recording?.close();recording=null;io.shutdown();result?.delete();super.onDestroy()}
    @Deprecated("Legacy back API") override fun onBackPressed(){if(review.visibility==View.VISIBLE)retake()else if(recording!=null)stopVideo()else super.onBackPressed()}

    private fun start(){
        val future=runCatching{ProcessCameraProvider.getInstance(this)}.getOrNull()?:return fail("Não consegui abrir a câmera neste aparelho. Use a galeria.")
        future.addListener({provider=runCatching{future.get()}.getOrNull();if(provider==null)fail("Não consegui abrir a câmera neste aparelho. Use a galeria.")else bind()},ContextCompat.getMainExecutor(this))
    }
    private fun fail(message:String){blockedText.text=message;blocked.visibility=View.VISIBLE}
    private fun bind(){
        val p=provider?:return
        if(isFinishing||isDestroyed)return
        val selector=if(front)CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA
        if(front&&!runCatching{p.hasCamera(selector)}.getOrDefault(false)){front=false;return bind()}
        switchButton.visibility=if(runCatching{p.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA)&&p.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)}.getOrDefault(false))View.VISIBLE else View.INVISIBLE
        runCatching{val info=selector.filter(p.availableCameraInfos).first();val q=Recorder.getVideoCapabilities(info).getSupportedQualities(DynamicRange.SDR);supportsFullHd=Quality.FHD in q;supportsHd=Quality.HD in q||supportsFullHd}
        val current=plan;qualityButton.text=current.label
        val preview=Preview.Builder().build().also{it.setSurfaceProvider(previewView.surfaceProvider)}
        val image=ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY).setJpegQuality(PhotoQuality.CAPTURE_JPEG).setFlashMode(flash.photo)
            .setResolutionSelector(ResolutionSelector.Builder().setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY).setResolutionStrategy(ResolutionStrategy.HIGHEST_AVAILABLE_STRATEGY).build()).build()
        val target=if(current.fullHd)Quality.FHD else if(current.width>=1280)Quality.HD else Quality.SD
        val recorder=Recorder.Builder().setQualitySelector(QualitySelector.from(target,FallbackStrategy.lowerQualityOrHigherThan(target))).setTargetVideoEncodingBitRate(current.videoBitrate).build()
        val video=VideoCapture.withOutput(recorder)
        p.unbindAll()
        fun attempt(vararg cases:UseCase)=runCatching{p.bindToLifecycle(this,selector,*cases)}.getOrNull()
        var bound=if(combined)attempt(preview,image,video)else null
        if(bound!=null){imageCapture=image;videoCapture=video}
        else{combined=false;p.unbindAll();bound=if(mode==Mode.PHOTO)attempt(preview,image)else attempt(preview,video);imageCapture=if(mode==Mode.PHOTO)image else null;videoCapture=if(mode==Mode.VIDEO)video else null}
        camera=bound
        if(bound==null){fail("Não consegui abrir a câmera. Feche outros apps que usam a câmera e tente de novo.");return}
        refreshLabels()
    }

    private fun takePhoto(){
        val capture=imageCapture?:return
        busy=true;shutter.isEnabled=false;status.text="Tirando a foto…";status.visibility=View.VISIBLE
        val file=File(folder(this),name("foto","jpg"))
        capture.takePicture(ImageCapture.OutputFileOptions.Builder(file).build(),io,object:ImageCapture.OnImageSavedCallback{
            override fun onImageSaved(output:ImageCapture.OutputFileResults){
                val ok=runCatching{PhotoNormalizer.normalize(file)}.getOrDefault(false)
                handler.post{busy=false;shutter.isEnabled=true;status.visibility=View.GONE
                    if(isFinishing)return@post
                    if(!file.exists()||file.length()<=0){file.delete();toast("A foto não ficou pronta. Tente de novo.");return@post}
                    showReview(file,"image/jpeg",if(ok)"Foto em alta resolução · ${mb(file.length())}" else "Foto grande · ${mb(file.length())}. O envio ainda vai reduzir se precisar.")}
            }
            override fun onError(e:ImageCaptureException){handler.post{busy=false;shutter.isEnabled=true;status.visibility=View.GONE;file.delete();toast("Não consegui tirar a foto. Tente de novo.")}}
        })
    }
    @SuppressLint("MissingPermission")
    private fun startVideo(hold:Boolean){
        val capture=videoCapture?:return
        if(!granted(Manifest.permission.RECORD_AUDIO)){holding=false;requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO),REQ_AUDIO);toast("Permita o microfone para gravar vídeo com som.");return}
        val current=plan;val file=File(folder(this),name("video","mp4"))
        limitReached=false;stopWhenStarted=false
        val options=FileOutputOptions.Builder(file).setFileSizeLimit(AttachLimits.VIDEO_TARGET_BYTES).setDurationLimitMillis(current.maxSeconds*1000L).build()
        recording=try{capture.output.prepareRecording(this,options).withAudioEnabled().start(ContextCompat.getMainExecutor(this)){event->onVideoEvent(event,file,current)}}catch(_:Exception){toast("Não consegui começar a gravação. Tente de novo.");null}
        if(recording==null)return
        startedAt=android.os.SystemClock.elapsedRealtime()
        shutter.recording=true;shutter.contentDescription="Parar gravação";shutter.invalidate()
        status.text="● ${VideoQuality.counter(0,current)}";status.setTextColor(Color.WHITE);status.visibility=View.VISIBLE
        hint.text=if(hold)"Solte para parar · ${current.label}" else "Toque para parar · ${current.label}"
        for(v in listOf(switchButton,qualityButton,photoTab,videoTab))v.isEnabled=false
    }
    private fun onVideoEvent(event:VideoRecordEvent,file:File,current:VideoPlan){
        when(event){
            is VideoRecordEvent.Start->if(stopWhenStarted){stopWhenStarted=false;stopVideo()}
            is VideoRecordEvent.Status->{
                val ms=event.recordingStats.recordedDurationNanos/1_000_000
                val warn=VideoQuality.warning(ms,current)||event.recordingStats.numBytesRecorded>AttachLimits.VIDEO_TARGET_BYTES-700_000
                status.text=(if(warn)"Quase no limite · " else "● ")+VideoQuality.counter(ms,current)
                status.setTextColor(if(warn)Color.rgb(255,196,120)else Color.WHITE)
            }
            is VideoRecordEvent.Finalize->{
                recording=null;shutter.recording=false;shutter.invalidate();status.visibility=View.GONE
                for(v in listOf(switchButton,qualityButton,photoTab,videoTab))v.isEnabled=true
                refreshLabels()
                val limit=event.error==VideoRecordEvent.Finalize.ERROR_FILE_SIZE_LIMIT_REACHED||event.error==VideoRecordEvent.Finalize.ERROR_DURATION_LIMIT_REACHED
                val ok=(event.error==VideoRecordEvent.Finalize.ERROR_NONE||limit)&&file.length() in 1..AttachLimits.VIDEO_SYSTEM_BYTES
                val duration=if(ok)runCatching{val m=MediaMetadataRetriever();try{m.setDataSource(file.absolutePath);m.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?:0}finally{m.release()}}.getOrDefault(0)else 0
                if(!ok||duration<700){file.delete();toast(if(ok)"Vídeo muito curto. Segure o botão um pouco mais." else "A gravação não ficou válida. Grave de novo; nada foi enviado.");return}
                if(limit)toast("Chegou ao limite de envio (até 15 MB). O vídeo foi finalizado aqui.")
                showReview(file,"video/mp4","Vídeo ${if(current.fullHd)"Full HD" else "HD"} · ${VideoQuality.duration(duration)} · ${mb(file.length())}")
            }
            else->{}
        }
    }
    private fun stopVideo(){recording?.stop();recording=null}
    private fun mb(bytes:Long)=String.format(Locale("pt","BR"),"%.1f MB",bytes/1_000_000.0)

    private fun showReview(file:File,mime:String,info:String){
        result?.delete();result=file;resultMime=mime;reviewInfo.text=info+"\nVocê ainda confere e escreve a legenda antes do envio."
        controls.visibility=View.GONE;review.visibility=View.VISIBLE
        if(mime.startsWith("image/")){reviewVideo.visibility=View.GONE;reviewImage.visibility=View.VISIBLE
            io.execute{val o=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeFile(file.absolutePath,o);var s=1;while(o.outWidth/s>2048||o.outHeight/s>2048)s*=2
                val b=runCatching{BitmapFactory.decodeFile(file.absolutePath,BitmapFactory.Options().apply{inSampleSize=s})}.getOrNull();handler.post{if(result===file)reviewImage.setImageBitmap(b)}}}
        else{reviewImage.visibility=View.GONE;reviewImage.setImageDrawable(null);reviewVideo.visibility=View.VISIBLE;reviewVideo.setVideoPath(file.absolutePath);reviewVideo.setOnPreparedListener{it.isLooping=true;reviewVideo.start()}}
    }
    private fun retake(){reviewVideo.stopPlayback();reviewImage.setImageDrawable(null);result?.delete();result=null;review.visibility=View.GONE;controls.visibility=View.VISIBLE}
    private fun accept(){
        val f=result?:return
        val uri=runCatching{FileProvider.getUriForFile(this,packageName+".updates",f)}.getOrNull()?:return toast("Não consegui preparar o arquivo. Tente de novo.")
        reviewVideo.stopPlayback();result=null
        setResult(RESULT_OK,Intent().setDataAndType(uri,resultMime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));finish()
    }

    /** Botão de disparo: anel branco; vermelho no modo vídeo; quadrado durante a gravação. */
    private class Shutter(context:Context):View(context){
        var video=false;var recording=false
        private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
        init{isClickable=true;isFocusable=true}
        override fun onDraw(c:Canvas){
            val r=minOf(width,height)/2f;val cx=width/2f;val cy=height/2f;val d=resources.displayMetrics.density
            paint.style=Paint.Style.STROKE;paint.strokeWidth=4*d;paint.color=Color.WHITE;c.drawCircle(cx,cy,r-3*d,paint)
            paint.style=Paint.Style.FILL;paint.color=if(video||recording)Color.rgb(214,48,49)else Color.WHITE;paint.alpha=if(isEnabled)255 else 120
            if(recording){val s=r*.42f;c.drawRoundRect(RectF(cx-s,cy-s,cx+s,cy+s),6*d,6*d,paint)}else c.drawCircle(cx,cy,r-10*d,paint)
            if(isFocused){paint.style=Paint.Style.STROKE;paint.strokeWidth=2*d;paint.color=Color.rgb(255,196,120);c.drawCircle(cx,cy,r-1*d,paint)}
        }
    }
}
