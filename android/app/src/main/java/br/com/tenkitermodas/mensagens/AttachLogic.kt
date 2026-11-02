package br.com.tenkitermodas.mensagens

import android.Manifest
import android.content.ClipData
import android.content.ContentResolver
import android.content.Intent
import android.net.Uri
import android.os.Build
import org.json.JSONObject
import kotlin.math.sqrt

/**
 * Regras puras da gaveta de anexos (estilo WhatsApp). Ficam fora das telas para serem testadas sem câmera.
 * Os limites acompanham o que o site e o Worker já aceitam no Mensageiro:
 * - vídeo: MP4 H.264 de até 15.000.000 bytes, sem limite de duração (`MSG_ANEXO_MAX_` e perfil `mensageiro`);
 * - foto: o servidor aceita 8 MiB, mas a Wafly/WhatsApp recusa imagem acima de 5 MB; a câmera mira 5 MB.
 */
object AttachLimits {
    const val VIDEO_SYSTEM_BYTES=15_000_000L
    /** Margem para o contêiner MP4 e variação do codificador: o gravador para sozinho aqui. */
    const val VIDEO_TARGET_BYTES=14_200_000L
    /** Orçamento de áudio AAC do CameraX (não configurável); estimado por cima para não estourar. */
    const val AUDIO_BUDGET_BPS=192_000
    const val PHOTO_LIMIT_BYTES=5_000_000L
    /** O preparo do site aceita originais de vídeo da galeria de até 40 MiB. */
    const val GALLERY_VIDEO_MAX_BYTES=40L*1048576
    const val MAX_SELECTION=30
}

/** Seleção múltipla ordenada: o número na miniatura é a ordem em que a pessoa tocou. */
class AttachSelection(private val max:Int=AttachLimits.MAX_SELECTION) {
    private val items=LinkedHashMap<Long,Uri>()
    enum class Change { ADDED, REMOVED, FULL }
    val size get()=items.size
    fun toggle(id:Long,uri:Uri):Change{
        if(items.remove(id)!=null)return Change.REMOVED
        if(items.size>=max)return Change.FULL
        items[id]=uri;return Change.ADDED
    }
    /** Ordem 1..N, ou 0 quando não selecionado. */
    fun order(id:Long):Int{var n=0;for(k in items.keys){n++;if(k==id)return n};return 0}
    fun uris():List<Uri> =items.values.toList()
    fun ids():List<Long> =items.keys.toList()
    fun clear()=items.clear()
}

/** Plano de gravação: maior resolução possível sem passar do limite de envio. */
data class VideoPlan(val fullHd:Boolean,val width:Int,val height:Int,val videoBitrate:Int,val maxSeconds:Int,val label:String)
object VideoQuality {
    enum class Tier { HIGH, LONG }
    const val HIGH_VIDEO_BPS=2_800_000
    const val LONG_VIDEO_BPS=1_000_000
    fun seconds(videoBps:Int)=((AttachLimits.VIDEO_TARGET_BYTES*8)/(videoBps+AttachLimits.AUDIO_BUDGET_BPS)).toInt()
    /**
     * HIGH = Full HD 1080p/30 (ou HD se o aparelho não tiver 1080p) com bitrate alto, cabendo ~40 s em 14,2 MB.
     * LONG = HD 720p/30 com 1 Mbps, mantendo a capacidade de 1min30s que a câmera anterior garantia.
     */
    fun plan(tier:Tier,supportsFullHd:Boolean,supportsHd:Boolean=true):VideoPlan{
        if(tier==Tier.HIGH){
            val s=seconds(HIGH_VIDEO_BPS)
            return if(supportsFullHd)VideoPlan(true,1920,1080,HIGH_VIDEO_BPS,s,"Full HD · até ${duration(s.toLong()*1000)}")
            else VideoPlan(false,1280,720,HIGH_VIDEO_BPS,s,"Alta (HD) · até ${duration(s.toLong()*1000)}")
        }
        val s=seconds(LONG_VIDEO_BPS)
        return if(supportsHd)VideoPlan(false,1280,720,LONG_VIDEO_BPS,s,"HD · até ${duration(s.toLong()*1000)}")
        else VideoPlan(false,720,480,LONG_VIDEO_BPS,s,"Padrão · até ${duration(s.toLong()*1000)}")
    }
    /** Aviso antes do fim: a gravação é finalizada sozinha no limite, com o arquivo válido. */
    fun warning(elapsedMs:Long,plan:VideoPlan):Boolean=plan.maxSeconds*1000L-elapsedMs in 1..5000
    fun counter(elapsedMs:Long,plan:VideoPlan)="${duration(elapsedMs)} / ${duration(plan.maxSeconds*1000L)}"
    fun duration(ms:Long):String{val t=(ms/1000).coerceAtLeast(0);val h=t/3600;val m=(t%3600)/60;val s=(t%60).toString().padStart(2,'0');return if(h>0)"$h:${m.toString().padStart(2,'0')}:$s" else "$m:$s"}
}

/** Foto: resolução máxima e JPEG alto; só reduz qualidade e depois tamanho se passar do limite. */
object PhotoQuality {
    const val CAPTURE_JPEG=95
    const val NORMALIZED_JPEG=92
    const val MIN_LONG_SIDE=1600
    data class Step(val longSide:Int,val quality:Int)
    fun next(bytes:Long,longSide:Int,quality:Int,limit:Long=AttachLimits.PHOTO_LIMIT_BYTES):Step?{
        if(bytes<=limit)return null
        if(quality>85)return Step(longSide,maxOf(85,quality-4))
        if(longSide>MIN_LONG_SIDE){val k=sqrt(limit.toDouble()/bytes)*0.95;return Step(maxOf(MIN_LONG_SIDE,(longSide*k).toInt()).coerceAtMost(longSide-1),quality)}
        if(quality>70)return Step(longSide,maxOf(70,quality-5))
        return null
    }
}

/** Acesso às fotos do aparelho, incluindo o acesso parcial do Android 14. */
object MediaAccess {
    enum class State { FULL, PARTIAL, NONE }
    fun permissions(sdk:Int=Build.VERSION.SDK_INT):Array<String> = when {
        sdk>=34 -> arrayOf(Manifest.permission.READ_MEDIA_IMAGES,Manifest.permission.READ_MEDIA_VIDEO,Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
        sdk>=33 -> arrayOf(Manifest.permission.READ_MEDIA_IMAGES,Manifest.permission.READ_MEDIA_VIDEO)
        else -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    }
    fun state(sdk:Int,granted:(String)->Boolean):State = when {
        sdk>=33 && granted(Manifest.permission.READ_MEDIA_IMAGES) && granted(Manifest.permission.READ_MEDIA_VIDEO) -> State.FULL
        sdk>=34 && granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) -> State.PARTIAL
        sdk<33 && granted(Manifest.permission.READ_EXTERNAL_STORAGE) -> State.FULL
        else -> State.NONE
    }
}

/** Pedido do clipe do site: vale uma vez e só por alguns segundos, para não sequestrar outros seletores. */
object AttachRequest {
    const val TTL_MS=5000L
    private var at=0L
    private var options:String?=null
    @Synchronized fun set(now:Long,json:String){at=now;options=json}
    @Synchronized fun take(now:Long):String?{val o=options;options=null;return if(o!=null&&now-at in 0..TTL_MS)o else null}
    @Synchronized fun clear(){options=null}
}

data class AttachOptions(val camera:Boolean,val audio:Boolean,val notice:String){
    companion object {
        const val DEFAULT_NOTICE="Toque em Atender e aguarde a conversa atualizar antes de gravar ou anexar áudio."
        fun parse(raw:String?):AttachOptions = runCatching{val j=JSONObject(raw?:"{}");AttachOptions(j.optBoolean("camera",true),j.optBoolean("audio",true),j.optString("aviso").ifBlank{DEFAULT_NOTICE}.take(200))}.getOrDefault(AttachOptions(true,true,DEFAULT_NOTICE))
    }
}

/** Resultado entregue ao seletor de arquivos da WebView, na ordem escolhida. */
object AttachResult {
    fun intent(resolver:ContentResolver,uris:List<Uri>):Intent?{
        if(uris.isEmpty())return null
        val clip=ClipData.newUri(resolver,"anexos",uris[0])
        for(u in uris.drop(1))clip.addItem(ClipData.Item(u))
        return Intent().setData(uris[0]).apply{clipData=clip;addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)}
    }
    /** Mesma leitura usada pela MainActivity: ClipData primeiro, sem duplicar o primeiro item. */
    fun read(data:Intent?):List<Uri>{
        if(data==null)return emptyList()
        val out=linkedSetOf<Uri>()
        data.clipData?.let{c->for(i in 0 until c.itemCount)c.getItemAt(i).uri?.let{out.add(it)}}
        data.data?.let{out.add(it)}
        return out.toList()
    }
}
