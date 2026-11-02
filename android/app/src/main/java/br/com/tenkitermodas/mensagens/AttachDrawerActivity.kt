package br.com.tenkitermodas.mensagens

import android.app.Activity
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.Settings
import android.util.LruCache
import android.util.Size
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Gaveta do clipe no estilo WhatsApp: Câmera no primeiro quadrado, fotos e vídeos recentes com seleção
 * múltipla numerada, Galeria completa e Áudio de arquivo. Nada é enviado aqui: o resultado volta ao
 * seletor de arquivos da WebView e segue a prévia, a legenda e o preparo que o site já usa.
 */
class AttachDrawerActivity : Activity() {
    companion object {
        const val EXTRA_OPTIONS="opcoes"
        const val REQ_PERMISSION=501
        const val REQ_CAMERA=502
        const val REQ_GALLERY=503
        const val REQ_AUDIO=504
        const val PAGE=300
        fun intent(context:Context,options:String?)=Intent(context,AttachDrawerActivity::class.java).putExtra(EXTRA_OPTIONS,options?:"{}")
        /** Recentes do aparelho (fotos e vídeos juntos, mais novos primeiro). */
        fun recent(context:Context,limit:Int=PAGE):List<Media>{
            val out=ArrayList<Media>()
            fun read(base:Uri,video:Boolean){
                val cols=if(video)arrayOf(MediaStore.MediaColumns._ID,MediaStore.MediaColumns.DATE_ADDED,MediaStore.MediaColumns.SIZE,MediaStore.Video.VideoColumns.DURATION)else arrayOf(MediaStore.MediaColumns._ID,MediaStore.MediaColumns.DATE_ADDED,MediaStore.MediaColumns.SIZE)
                runCatching{context.contentResolver.query(base,cols,null,null,MediaStore.MediaColumns.DATE_ADDED+" DESC")?.use{c->
                    var n=0
                    while(c.moveToNext()&&n<limit){val id=c.getLong(0);out.add(Media(id*2+(if(video)1 else 0),ContentUris.withAppendedId(base,id),video,if(video)c.getLong(3)else 0,c.getLong(2),c.getLong(1)));n++}
                }}
            }
            read(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,false);read(MediaStore.Video.Media.EXTERNAL_CONTENT_URI,true)
            return out.sortedByDescending{it.added}.take(limit)
        }
    }
    data class Media(val key:Long,val uri:Uri,val video:Boolean,val durationMs:Long,val bytes:Long,val added:Long)

    private val ink=Color.rgb(35,31,25);private val muted=Color.rgb(91,87,80);private val surface=Color.rgb(245,241,232);private val paper=Color.rgb(249,247,242);private val line=Color.rgb(227,222,211);private val accent=Color.rgb(168,82,0)
    private val handler=Handler(Looper.getMainLooper())
    private val loader:ExecutorService=Executors.newFixedThreadPool(3)
    private val thumbs=object:LruCache<Long,Bitmap>(24*1024*1024){override fun sizeOf(key:Long,value:Bitmap)=value.byteCount}
    private val selection=AttachSelection()
    private var media:List<Media> = emptyList()
    private var options=AttachOptions(true,true,AttachOptions.DEFAULT_NOTICE)
    private var asked=false
    private var access=MediaAccess.State.NONE
    internal lateinit var grid:GridView
    internal lateinit var send:Button
    private lateinit var hint:TextView
    private lateinit var footer:LinearLayout
    private lateinit var notice:LinearLayout
    private lateinit var noticeText:TextView
    private lateinit var noticeAction:Button
    private lateinit var panel:LinearLayout
    private val adapter=Cells()
    private fun dp(v:Int)=(v*resources.displayMetrics.density+.5f).toInt()
    private fun round(color:Int,radius:Int,stroke:Int=0)=GradientDrawable().apply{setColor(color);cornerRadius=dp(radius).toFloat();if(stroke!=0)setStroke(dp(1),stroke)}

    override fun onCreate(state:Bundle?){
        super.onCreate(state);setResult(RESULT_CANCELED)
        options=AttachOptions.parse(intent.getStringExtra(EXTRA_OPTIONS));asked=state?.getBoolean("asked",false)?:false
        WindowCompat.setDecorFitsSystemWindows(window,false)
        val root=FrameLayout(this).apply{setBackgroundColor(Color.argb(140,16,16,14));setOnClickListener{finish()};contentDescription="Fechar anexos"}
        panel=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;background=GradientDrawable().apply{setColor(paper);cornerRadii=FloatArray(8){i->if(i<4)dp(20).toFloat() else 0f}};isClickable=true;setPadding(dp(16),dp(8),dp(16),0)}
        // Alça e título curto, com fechamento evidente.
        panel.addView(View(this).apply{background=round(line,3)},LinearLayout.LayoutParams(dp(40),dp(5)).apply{gravity=Gravity.CENTER_HORIZONTAL;bottomMargin=dp(4)})
        val header=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL}
        header.addView(TextView(this).apply{text="Anexar";textSize=18f;setTypeface(typeface,Typeface.BOLD);setTextColor(ink);ViewCompat.setAccessibilityHeading(this,true)},LinearLayout.LayoutParams(0,-2,1f))
        header.addView(Button(this).apply{text="Fechar";isAllCaps=false;textSize=15f;setTextColor(ink);background=null;minHeight=dp(48);minWidth=dp(64);stateListAnimator=null;setOnClickListener{finish()}})
        panel.addView(header)
        val shortcuts=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL}
        shortcuts.addView(shortcut("Galeria completa"){openGallery()},LinearLayout.LayoutParams(0,dp(48),1f).apply{marginEnd=dp(8)})
        shortcuts.addView(shortcut("Áudio de arquivo"){if(options.audio)openAudio()else toast(options.notice)}.apply{alpha=if(options.audio)1f else .55f},LinearLayout.LayoutParams(0,dp(48),1f))
        panel.addView(shortcuts,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(8)})
        notice=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;background=round(surface,12,line);setPadding(dp(12),dp(10),dp(12),dp(6));visibility=View.GONE}
        noticeText=TextView(this).apply{textSize=14f;setTextColor(ink);setLineSpacing(0f,1.15f)};notice.addView(noticeText)
        noticeAction=Button(this).apply{isAllCaps=false;textSize=14f;setTextColor(accent);background=null;minHeight=dp(48);stateListAnimator=null;gravity=Gravity.START or Gravity.CENTER_VERTICAL;setPadding(0,0,0,0)};notice.addView(noticeAction,LinearLayout.LayoutParams(-2,dp(48)))
        panel.addView(notice,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(8)})
        grid=GridView(this).apply{numColumns=columns();stretchMode=GridView.STRETCH_COLUMN_WIDTH;horizontalSpacing=dp(4);verticalSpacing=dp(4);clipToPadding=false;setPadding(0,0,0,dp(8));selector=GradientDrawable().apply{setColor(Color.TRANSPARENT)};adapter=this@AttachDrawerActivity.adapter
            setOnItemClickListener{_,_,position,_->tap(position)}}
        panel.addView(grid,LinearLayout.LayoutParams(-1,0,1f))
        footer=LinearLayout(this).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(0,dp(8),0,dp(8));visibility=View.GONE}
        hint=TextView(this).apply{text="Você confere e escreve a legenda antes do envio.";textSize=13f;setTextColor(muted)}
        footer.addView(hint,LinearLayout.LayoutParams(0,-2,1f).apply{marginEnd=dp(12)})
        send=Button(this).apply{isAllCaps=false;textSize=16f;setTypeface(typeface,Typeface.BOLD);setTextColor(Color.WHITE);background=round(accent,24);minHeight=dp(48);minWidth=dp(128);stateListAnimator=null;setPadding(dp(20),0,dp(20),0);setOnClickListener{deliver(selection.uris())}}
        footer.addView(send,LinearLayout.LayoutParams(-2,dp(48)))
        panel.addView(footer)
        val height=(resources.displayMetrics.heightPixels*0.8).toInt()
        root.addView(panel,FrameLayout.LayoutParams(-1,height,Gravity.BOTTOM))
        ViewCompat.setOnApplyWindowInsetsListener(root){_,insets->val bars=insets.getInsets(WindowInsetsCompat.Type.systemBars());panel.setPadding(dp(16)+bars.left,dp(8),dp(16)+bars.right,bars.bottom);insets}
        setContentView(root)
        refreshAccess(state==null)
    }
    override fun onSaveInstanceState(out:Bundle){out.putBoolean("asked",asked);super.onSaveInstanceState(out)}
    override fun onResume(){super.onResume();if(::grid.isInitialized&&asked)refreshAccess(false)}
    override fun onDestroy(){loader.shutdownNow();handler.removeCallbacksAndMessages(null);super.onDestroy()}

    private fun columns()=maxOf(3,(resources.displayMetrics.widthPixels/resources.displayMetrics.density/124).toInt()).coerceAtMost(6)
    private fun shortcut(label:String,click:()->Unit)=Button(this).apply{text=label;isAllCaps=false;textSize=14f;setTextColor(ink);background=round(surface,24,line);minHeight=dp(48);stateListAnimator=null;setOnClickListener{click()}}
    private fun toast(s:String)=Toast.makeText(this,s,Toast.LENGTH_LONG).show()
    private fun granted(p:String)=checkSelfPermission(p)==PackageManager.PERMISSION_GRANTED

    internal fun refreshAccess(mayAsk:Boolean){
        access=MediaAccess.state(Build.VERSION.SDK_INT){granted(it)}
        if(access==MediaAccess.State.NONE&&mayAsk&&!asked){asked=true;requestPermissions(MediaAccess.permissions(),REQ_PERMISSION);showNotice("Para mostrar suas fotos e vídeos aqui, permita o acesso à galeria.","Permitir acesso"){askAgain()};return}
        when(access){
            MediaAccess.State.FULL->notice.visibility=View.GONE
            MediaAccess.State.PARTIAL->showNotice("Você liberou só algumas fotos e vídeos.","Liberar mais fotos"){askAgain()}
            MediaAccess.State.NONE->showNotice("Sem acesso às fotos do aparelho. Use a Galeria completa ou permita o acesso.","Permitir acesso"){askAgain()}
        }
        if(access==MediaAccess.State.NONE){media=emptyList();adapter.notifyDataSetChanged();return}
        loader.execute{val rows=recent(this);handler.post{if(isFinishing)return@post;media=rows;val keep=rows.map{it.key}.toSet();if(selection.ids().any{it !in keep}){val still=selection.ids().zip(selection.uris()).filter{it.first in keep};selection.clear();still.forEach{selection.toggle(it.first,it.second)}};adapter.notifyDataSetChanged();updateFooter()}}
    }
    /** Testes: mostra uma lista conhecida sem consultar o MediaStore. */
    internal fun showForTest(rows:List<Media>){media=rows;adapter.notifyDataSetChanged();updateFooter()}
    internal fun tapForTest(position:Int)=tap(position)
    internal val selectedForTest get()=selection.uris()
    private fun showNotice(text:String,action:String,click:()->Unit){noticeText.text=text;noticeAction.text=action;noticeAction.setOnClickListener{click()};notice.visibility=View.VISIBLE}
    private fun askAgain(){
        val blocked=MediaAccess.permissions().none{shouldShowRequestPermissionRationale(it)}&&asked&&access==MediaAccess.State.NONE
        if(blocked)runCatching{startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.fromParts("package",packageName,null)))}
        else{asked=true;requestPermissions(MediaAccess.permissions(),REQ_PERMISSION)}
    }
    override fun onRequestPermissionsResult(code:Int,p:Array<out String>,r:IntArray){
        super.onRequestPermissionsResult(code,p,r)
        if(code!=REQ_PERMISSION)return
        refreshAccess(false)
        // Negou o acesso: cai para o seletor do sistema, que não precisa de permissão.
        if(access==MediaAccess.State.NONE)openGallery()
    }

    private fun tap(position:Int){
        if(position==0){openCamera();return}
        val m=media.getOrNull(position-1)?:return
        if(m.video&&m.bytes>AttachLimits.GALLERY_VIDEO_MAX_BYTES&&selection.order(m.key)==0){toast("Este vídeo tem ${m.bytes/1048576} MB. O envio prepara vídeos de até 40 MB; escolha um trecho menor ou envie por link.");return}
        when(selection.toggle(m.key,m.uri)){AttachSelection.Change.FULL->toast("Você pode escolher até ${AttachLimits.MAX_SELECTION} de uma vez.");else->{}}
        adapter.notifyDataSetChanged();updateFooter()
    }
    private fun updateFooter(){val n=selection.size;footer.visibility=if(n>0)View.VISIBLE else View.GONE;send.text="Enviar ($n)";send.contentDescription="Enviar $n ${if(n==1)"item" else "itens"} para conferir na conversa"}
    private fun openCamera(){
        if(!options.camera){toast(options.notice);return}
        try{startActivityForResult(Intent(this,AttachCameraActivity::class.java),REQ_CAMERA)}catch(_:Exception){toast("Não consegui abrir a câmera. Use a Galeria completa.")}
    }
    private fun openGallery(){try{startActivityForResult(VisualMediaPicker.galleryIntent(true),REQ_GALLERY)}catch(_:Exception){toast("Confira se há uma galeria instalada no Android.")}}
    private fun openAudio(){try{startActivityForResult(Intent(Intent.ACTION_GET_CONTENT).setType("audio/*").addCategory(Intent.CATEGORY_OPENABLE),REQ_AUDIO)}catch(_:Exception){toast("Não encontrei um seletor de arquivos de áudio.")}}
    internal fun deliver(uris:List<Uri>){
        val data=AttachResult.intent(contentResolver,uris)?:return
        setResult(RESULT_OK,data);finish()
    }
    @Deprecated("Activity result API")
    override fun onActivityResult(code:Int,result:Int,data:Intent?){
        super.onActivityResult(code,result,data)
        if(result!=RESULT_OK)return
        val picked=AttachResult.read(data)
        when(code){REQ_CAMERA,REQ_GALLERY->if(picked.isNotEmpty())deliver(picked);REQ_AUDIO->picked.firstOrNull()?.let{deliver(listOf(it))}}
    }

    /** Quadrado: a altura acompanha a largura da coluna. */
    private class Square(context:Context):FrameLayout(context){override fun onMeasure(w:Int,h:Int){super.onMeasure(w,w)}}
    private inner class Cells:BaseAdapter(){
        override fun getCount()=media.size+1
        override fun getItem(position:Int):Any?=if(position==0)null else media.getOrNull(position-1)
        override fun getItemId(position:Int)=if(position==0)-1L else media.getOrNull(position-1)?.key?:position.toLong()
        override fun getViewTypeCount()=2
        override fun getItemViewType(position:Int)=if(position==0)0 else 1
        override fun getView(position:Int,old:View?,parent:ViewGroup):View{
            if(position==0)return (old as? Square)?:Square(this@AttachDrawerActivity).apply{
                background=round(ink,10);contentDescription=if(options.camera)"Câmera: tirar foto ou gravar vídeo" else "Câmera indisponível: ${options.notice}";alpha=if(options.camera)1f else .55f
                addView(TextView(context).apply{text="Câmera";textSize=15f;setTypeface(typeface,Typeface.BOLD);setTextColor(Color.WHITE);gravity=Gravity.CENTER;importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO},FrameLayout.LayoutParams(-1,-1))
                addView(View(context).apply{background=GradientDrawable().apply{shape=GradientDrawable.OVAL;setStroke(dp(2),Color.WHITE)};importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO},FrameLayout.LayoutParams(dp(28),dp(28),Gravity.CENTER_HORIZONTAL or Gravity.TOP).apply{topMargin=dp(14)})
                addView(View(context).apply{background=GradientDrawable().apply{shape=GradientDrawable.OVAL;setColor(Color.WHITE)};importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO},FrameLayout.LayoutParams(dp(16),dp(16),Gravity.CENTER_HORIZONTAL or Gravity.TOP).apply{topMargin=dp(20)})
            }
            val m=media[position-1]
            val cell=(old as? Square)?:Square(this@AttachDrawerActivity).apply{
                setBackgroundColor(line)
                addView(ImageView(context).apply{scaleType=ImageView.ScaleType.CENTER_CROP;tag="img"},FrameLayout.LayoutParams(-1,-1))
                addView(View(context).apply{tag="dim";setBackgroundColor(Color.argb(90,16,16,14))},FrameLayout.LayoutParams(-1,-1))
                addView(TextView(context).apply{tag="dur";textSize=12f;setTextColor(Color.WHITE);setTypeface(typeface,Typeface.BOLD);background=round(Color.argb(170,16,16,14),8);setPadding(dp(6),dp(2),dp(6),dp(2))},FrameLayout.LayoutParams(-2,-2,Gravity.START or Gravity.BOTTOM).apply{setMargins(dp(6),0,0,dp(6))})
                addView(TextView(context).apply{tag="num";textSize=13f;setTypeface(typeface,Typeface.BOLD);gravity=Gravity.CENTER;setTextColor(Color.WHITE)},FrameLayout.LayoutParams(dp(26),dp(26),Gravity.END or Gravity.TOP).apply{setMargins(0,dp(6),dp(6),0)})
            }
            val img=cell.findViewWithTag<ImageView>("img");val dim=cell.findViewWithTag<View>("dim");val dur=cell.findViewWithTag<TextView>("dur");val num=cell.findViewWithTag<TextView>("num")
            val order=selection.order(m.key)
            dim.visibility=if(order>0)View.VISIBLE else View.GONE
            num.text=if(order>0)order.toString() else ""
            num.background=GradientDrawable().apply{shape=GradientDrawable.OVAL;if(order>0)setColor(accent)else setColor(Color.argb(60,0,0,0));setStroke(dp(2),Color.WHITE)}
            dur.visibility=if(m.video)View.VISIBLE else View.GONE;dur.text=VideoQuality.duration(m.durationMs)
            cell.contentDescription=(if(m.video)"Vídeo de ${VideoQuality.duration(m.durationMs)}" else "Foto")+(if(order>0)", selecionado, número $order" else ", toque para selecionar")
            cell.tag=m.key
            val cached=thumbs.get(m.key)
            if(cached!=null)img.setImageBitmap(cached)else{img.setImageDrawable(null);loadThumb(m,cell,img)}
            return cell
        }
    }
    private fun loadThumb(m:Media,cell:View,img:ImageView){
        val px=maxOf(dp(120),160)
        loader.execute{
            val b=runCatching{
                if(Build.VERSION.SDK_INT>=29)contentResolver.loadThumbnail(m.uri,Size(px,px),null)
                else{val id=m.key/2;@Suppress("DEPRECATION") if(m.video)MediaStore.Video.Thumbnails.getThumbnail(contentResolver,id,MediaStore.Video.Thumbnails.MINI_KIND,null) else MediaStore.Images.Thumbnails.getThumbnail(contentResolver,id,MediaStore.Images.Thumbnails.MINI_KIND,null)}
            }.getOrNull()?:return@execute
            handler.post{thumbs.put(m.key,b);if(cell.tag==m.key)img.setImageBitmap(b)}
        }
    }
}
