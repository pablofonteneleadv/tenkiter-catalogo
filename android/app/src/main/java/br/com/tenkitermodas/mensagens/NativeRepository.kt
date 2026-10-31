package br.com.tenkitermodas.mensagens

import android.content.Context
import android.content.Intent
import com.onesignal.OneSignal
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

class NativeRepository internal constructor(private val context:Context,val store:NativeStore=NativeStore(context),private val api:NativeApi=NativeApi()){
    private val lock=ReentrantLock()
    private var catalogCache=emptyList<JSONObject>()
    private var cursor="";private var fullAt=0L;private var accountAt=0L
    @Volatile var status="";private set
    companion object {
        const val CHANGED="br.com.tenkitermodas.mensagens.INBOX_CHANGED"
        @Volatile private var instance:NativeRepository?=null
        fun get(c:Context):NativeRepository=instance?:synchronized(this){instance?:NativeRepository(c.applicationContext).also{instance=it}}
    }
    private fun changed(){context.sendBroadcast(Intent(CHANGED).setPackage(context.packageName))}
    private fun allowed(j:JSONObject):Boolean {val p=j.optJSONArray("permissoes")?:return false;return (0 until p.length()).any{p.optString(it) in listOf("gerir_acessos","catalogo_admin")}}
    fun login(identifier:String,password:String){lock.withLock{
        val generation=store.generation
        val j=api.account(JSONObject().put("action","login").put("identificador",identifier.trim()).put("whatsapp",if(identifier.contains('@'))"" else identifier.filter{it.isDigit()}).put("senha",password))
        val user=j.getJSONObject("usuario")
        if(!allowed(user))throw Exception("Sua conta não tem acesso ao atendimento.")
        val a=NativeAuth(user.getString("whatsapp"),j.getString("sessao"),user.optString("name",user.optString("nome","Atendente")))
        api.call("/msg/conversas?canal=todos&filtro=",a)
        if(!store.saveIfGeneration(generation,a))throw Exception("O acesso foi cancelado.")
        status="Atualizando conversas…";changed()
    }}
    fun importSession(a:NativeAuth){lock.withLock{
        val generation=store.generation;val r=api.account(JSONObject().put("action","sessao").put("whatsapp",a.owner).put("sessao",a.session))
        val user=r.getJSONObject("usuario");if(!allowed(user))throw AccessRevoked()
        val fresh=NativeAuth(a.owner,r.optString("sessao",a.session),user.optString("name",user.optString("nome",a.name)))
        api.call("/msg/conversas?canal=todos&filtro=",fresh)
        if(!store.saveIfGeneration(generation,fresh))throw Exception("O acesso foi cancelado.")
    }}
    fun logout(){catalogCache=emptyList();cursor="";fullAt=0;accountAt=0;java.io.File(context.cacheDir,"received").deleteRecursively();runCatching{OneSignal.User.pushSubscription.optOut()};store.logout();status="";runCatching{BackgroundSync.cancel(context)};changed()}
    private fun freshSession():NativeAuth {
        val old=store.auth()?:throw AccessRevoked()
        val j=api.account(JSONObject().put("action","sessao").put("whatsapp",old.owner).put("sessao",old.session))
        val user=j.getJSONObject("usuario");if(!allowed(user))throw AccessRevoked()
        val next=NativeAuth(old.owner,j.optString("sessao",old.session),user.optString("name",user.optString("nome",old.name)))
        if(!store.updateAuth(old,next))throw Exception("A conta mudou.")
        return next
    }
    private fun register(a:NativeAuth){
        runCatching{
            val id=OneSignal.User.pushSubscription.id
            if(id.isNotBlank()&&OneSignal.Notifications.permission&&OneSignal.User.pushSubscription.optedIn) api.call("/msg/mobile/subscription",a,JSONObject().put("subscription",id))
        }
    }
    fun sync(focus:Long=0):Boolean=lock.withLock{
        if(store.auth()==null)return true
        try{
            status="Sincronizando…";changed()
            val a=if(System.currentTimeMillis()-accountAt>60000)freshSession().also{accountAt=System.currentTimeMillis()}else store.auth()?:throw AccessRevoked();register(a)
            val old=store.conversations().associateBy{it.optLong("id")}
            var full=cursor.isBlank()||System.currentTimeMillis()-fullAt>300000
            var response=if(full)allConversations(a,"")else api.call("/msg/novidades?desde="+enc(cursor)+"&conversa=$focus",a)
            if(response.optJSONArray("conversas")==null||!full&&response.getJSONArray("conversas").length()>=100){response=allConversations(a,"");full=true}
            val data=response.getJSONArray("conversas")
            cursor=response.optString("cursor",java.time.Instant.now().toString())
            if(full)fullAt=System.currentTimeMillis()
            if(!store.current(a))return false
            val ids=mutableSetOf<Long>();val changed=mutableListOf<Long>()
            for(i in 0 until data.length()){
                val c=data.getJSONObject(i);val id=c.getLong("id");ids.add(id)
                if(old[id]?.optString("atualizada_em")!=c.optString("atualizada_em")||store.messages(id).isEmpty())changed.add(id)
                c.remove("local_hidden");if(old[id]?.has("local_has_more")==true)c.put("local_has_more",old[id]?.optBoolean("local_has_more"));store.putConversation(a,c)
            }
            val oldest=if(data.length()>0)(0 until data.length()).minOf{data.getJSONObject(it).optString("ultima_em")}else ""
            old.values.filter{full&&it.optString("encerrada_em").isBlank()&&it.optLong("id") !in ids&&(data.length()<1000||it.optString("ultima_em")>=oldest)}.forEach{it.put("local_hidden",true);store.putConversation(a,it)}
            changed() // a lista já aparece; não espera baixar todos os históricos
            val targets=(if(focus>0)listOf(focus)else emptyList())+changed
            targets.distinct().take(8).forEach{id->downloadConversation(a,id)}
            if(!store.current(a))return false
            status="Atualizado às "+java.text.SimpleDateFormat("HH:mm",java.util.Locale("pt","BR")).format(java.util.Date());changed();true
        }catch(e:AccessRevoked){logout();status="Entre novamente para continuar.";changed();false}
        catch(_:Exception){status="Sem conexão · mostrando conversas salvas";changed();false}
    }
    private fun downloadConversation(a:NativeAuth,id:Long){
        val j=api.call("/msg/mensagens?conversa=$id",a)
        store.putConversation(a,j.getJSONObject("conversa").put("local_has_more",j.optBoolean("temMais")));store.putMessages(a,id,j.getJSONArray("mensagens"))
    }
    private fun enc(s:String)=java.net.URLEncoder.encode(s,"UTF-8")
    private fun allConversations(a:NativeAuth,filter:String,query:String=""):JSONObject {
        val out=org.json.JSONArray();var before="";var beforeId=0L;var response=JSONObject();var firstCursor=""
        for(page in 0 until 20){
            if(!store.current(a))throw AccessRevoked()
            response=api.call("/msg/conversas?canal=todos&filtro="+enc(filter)+"&busca="+enc(query)+(if(before.isBlank())""else"&antes="+enc(before)+"&antesId=$beforeId"),a)
            if(page==0)firstCursor=response.optString("cursor",java.time.Instant.now().toString())
            val rows=response.getJSONArray("conversas")
            for(i in 0 until rows.length())out.put(rows.getJSONObject(i))
            if(rows.length()<50)break
            val last=rows.getJSONObject(rows.length()-1);val next=last.optLong("id");if(next==beforeId)break
            before=last.optString("ultima_em");beforeId=next
        }
        return response.put("conversas",out).put("cursor",firstCursor)
    }
    fun find(query:String="",closed:Boolean=false):Set<Long> =lock.withLock{
        val a=store.auth()?:throw AccessRevoked();val j=allConversations(a,if(closed)"encerradas"else"",query)
        if(!store.current(a))throw AccessRevoked()
        val rows=j.getJSONArray("conversas");val ids=mutableSetOf<Long>()
        for(i in 0 until rows.length()){val c=rows.getJSONObject(i);ids.add(c.getLong("id"));store.putConversation(a,c)}
        changed();ids
    }
    fun older(id:Long,oldest:JSONObject?=null):List<JSONObject> =lock.withLock{
        val a=store.auth()?:throw AccessRevoked();val first=oldest?:store.messages(id).firstOrNull()?:return@withLock emptyList()
        val before=first.optString("enviada_em")
        try{
            val j=api.call("/msg/mensagens?conversa=$id&antes="+enc(before)+"&antesId="+first.optLong("id"),a)
            if(!store.current(a))throw AccessRevoked()
            val rows=j.getJSONArray("mensagens");store.putMessages(a,id,rows)
            store.conversation(id)?.let{store.putConversation(a,it.put("local_has_more",j.optBoolean("temMais")))};changed()
            (0 until rows.length()).map{rows.getJSONObject(it)}
        }catch(e:AccessRevoked){logout();throw e}
    }
    fun administration(path:String,body:JSONObject?=null):JSONObject=lock.withLock{
        require(path.substringBefore('?') in setOf("/msg/config","/msg/pessoa","/msg/contexto","/msg/pessoas/google","/msg/conversas","/msg/metricas","/msg/resumo","/msg/diagnostico","/msg/instagram/situacao","/msg/instagram/segredo","/msg/instagram/assinar","/msg/ligar","/msg/pausar","/msg/contatos/situacao","/msg/contatos/config","/msg/contatos/backup","/msg/contatos/relatorio","/msg/contatos/limpeza","/msg/contatos/auto","/msg/stories"))
        val a=store.auth()?:throw AccessRevoked()
        try{api.call(path,a,body).also{if(!store.current(a))throw AccessRevoked()}}catch(e:AccessRevoked){logout();throw e}
    }
    fun refreshPerson(result:JSONObject){lock.withLock{val a=store.auth()?:throw AccessRevoked();val rows=result.optJSONArray("canais")?:return@withLock;for(i in 0 until rows.length())store.putConversation(a,rows.getJSONObject(i));changed()}}
    fun repairContext(id:Long){val stamp=store.stampedAuth();val a=stamp.first?:return;api.call("/msg/contexto",a,JSONObject().put("conversa",id));if(store.generation==stamp.second&&store.auth()?.owner==a.owner)changed()}
    fun googleNames(){
        val a=store.auth()?:throw AccessRevoked()
        for(i in 0 until 40){val r=api.call("/msg/pessoas/google",a,JSONObject());if(!store.current(a))throw AccessRevoked();if(r.optBoolean("fim"))break}
        lock.withLock{fullAt=0};changed()
    }
    fun export(query:String):NativeApi.Export=lock.withLock{
        val a=store.auth()?:throw AccessRevoked()
        try{api.export(a,query).also{if(!store.current(a))throw AccessRevoked()}}catch(e:AccessRevoked){logout();throw e}
    }
    fun discard(key:String){store.removePending(key);changed()}
    /** Sinal de presença apenas com a tela nativa em primeiro plano; não abre nem lê conversas. */
    fun presence(conversation:Long)=lock.withLock{
        val a=store.auth()?:return@withLock
        api.call("/msg/presenca",a,JSONObject().put("conversa",conversation))
    }
    fun config(body:JSONObject?=null):JSONObject=lock.withLock{
        val a=store.auth()?:throw AccessRevoked();try{api.call("/msg/config",a,body).also{if(!store.current(a))throw AccessRevoked()}}catch(e:AccessRevoked){logout();throw e}
    }
    fun productPhoto(url:String):ByteArray?=api.publicPhoto(url)
    fun catalog():List<JSONObject> =lock.withLock{
        val a=store.auth()?:throw AccessRevoked();val r=api.catalog().getJSONArray("produtos");if(!store.current(a))throw AccessRevoked()
        (0 until r.length()).map{r.getJSONObject(it)}.filter{it.optString("Status").isBlank()||it.optString("Status").equals("ativo",true)}.also{catalogCache=it}
    }
    fun batch(ids:Set<Long>,action:String,reason:String="concluido")=lock.withLock{
        require(ids.isNotEmpty()&&ids.size<=50);val a=store.auth()?:throw AccessRevoked()
        val payload=JSONObject().put("conversas",org.json.JSONArray(ids.toList()))
        val closing=action=="encerrar"||action=="reabrir"
        if(closing)payload.put("reabrir",action=="reabrir").put("motivo",reason)else payload.put("naoLida",action=="nao_lidas").put("celular",true)
        try{
            api.call(if(closing)"/msg/encerrar"else"/msg/lida",a,payload)
            ids.forEach{id->store.conversation(id)?.let{c->
                if(closing)c.put("encerrada_em",if(action=="reabrir")""else java.time.Instant.now().toString()).put("encerrada_motivo",if(action=="reabrir")""else reason)
                if(action!="reabrir")c.put("nao_lidas",if(action=="nao_lidas")maxOf(1,c.optInt("nao_lidas"))else 0)
                store.putConversation(a,c)
            }};changed()
        }catch(e:AccessRevoked){logout();throw e}
    }
    fun media(id:Long,context:Boolean=false,post:Long=0):Pair<ByteArray,String> =lock.withLock{
        val a=store.auth()?:throw AccessRevoked()
        try{api.media(a,id,context,post).also{if(!store.current(a))throw AccessRevoked()}}catch(e:AccessRevoked){logout();throw e}
    }
    fun attachment(id:Long,bytes:ByteArray,type:String,caption:String,key:String="android-"+UUID.randomUUID()):String=lock.withLock{
        val a=store.auth()?:throw AccessRevoked()
        val upload=try{api.upload(a,bytes,type)}catch(e:AccessRevoked){logout();throw e}
        if(!store.current(a))throw AccessRevoked()
        reply(id,caption,key,upload.getString("anexo"),type)
    }
    fun markRead(id:Long,allowed:()->Boolean={true}){lock.withLock{
        if(!allowed()||(store.conversation(id)?.optInt("nao_lidas")?:0)<=0)return
        val a=store.auth()?:return
        try{api.call("/msg/lida",a,JSONObject().put("conversa",id).put("celular",true));store.conversation(id)?.let{it.put("nao_lidas",0);store.putConversation(a,it)};changed()}
        catch(e:AccessRevoked){logout()}
        catch(_:Exception){}
    }}
    fun reply(id:Long,text:String,key:String="android-"+UUID.randomUUID(),attachment:String="",type:String=""):String {
        val stamp=store.stampedAuth();val initial=stamp.first?:throw AccessRevoked();val generation=stamp.second;require((text.isNotBlank()||attachment.isNotBlank())&&text.length<=10000)
        val pendingText=if(attachment.isBlank())text else "[$type] "+text
        store.pending(key,id,pendingText,"Enviando…",initial);changed()
        return lock.withLock{
        val a=store.auth()?:throw AccessRevoked()
        if(a.owner!=initial.owner||store.generation!=generation)throw Exception("A conta mudou.")
        try{
            val config=api.call("/msg/config",a)
            val signed=if(attachment.isNotBlank()&&(type=="áudio"||store.conversation(id)?.optString("canal")=="instagram"))""else InboxRules.signature(a,store.conversation(id),config,text)
            val j=api.call("/msg/enviar",a,JSONObject().put("conversa",id).put("texto",signed).put("idLocal",key).apply{if(attachment.isNotBlank())put("anexo",attachment)
                else if(store.conversation(id)?.optString("canal").orEmpty().startsWith("whatsapp")&&context.getSharedPreferences("link-preview",0).getBoolean(store.conversation(id)?.optString("canal"),false))LinkPreview.fields(signed,catalogCache).let{fields->fields.keys().forEach{put(it,fields.get(it))}}
            })
            if(!store.current(a))throw Exception("A conta mudou.")
            val m=j.optJSONObject("mensagem")
            if(m!=null){store.putMessages(a,id,org.json.JSONArray().put(m));store.removePending(key)}
            else store.pending(key,id,pendingText,"Envio sem confirmação. Confira antes de tentar novamente.",a)
            runCatching{downloadConversation(a,id)};changed();key
        }catch(e:AccessRevoked){logout();throw e}
        catch(e:ApiFailure){
            if(store.current(a)){
                val m=e.data.optJSONObject("mensagem")
                if(m!=null){store.putMessages(a,id,org.json.JSONArray().put(m));store.removePending(key)}
                else store.pending(key,id,pendingText,if(e.data.optBoolean("incerto"))"Envio sem confirmação. Confira a conversa." else (if(attachment.isBlank())"Não enviada: "else"Anexo recusado; escolha o arquivo novamente: ")+(e.message?:"Tente novamente."),a)
                changed()
            };throw e
        }
        catch(e:Exception){if(store.current(a)){store.pending(key,id,pendingText,"Envio sem confirmação. Confira a conversa antes de tentar novamente.",a);changed()};throw e}
    }}
}
