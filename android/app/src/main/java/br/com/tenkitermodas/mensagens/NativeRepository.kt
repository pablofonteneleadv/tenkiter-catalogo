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
    @Volatile var status="";private set
    companion object {
        const val CHANGED="br.com.tenkitermodas.mensagens.INBOX_CHANGED"
        @Volatile private var instance:NativeRepository?=null
        fun get(c:Context):NativeRepository=instance?:synchronized(this){instance?:NativeRepository(c.applicationContext).also{instance=it}}
    }
    private fun changed(){context.sendBroadcast(Intent(CHANGED).setPackage(context.packageName))}
    private fun allowed(j:JSONObject):Boolean {val p=j.optJSONArray("permissoes")?:return false;return (0 until p.length()).any{p.optString(it)=="gerir_acessos"}}
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
    fun logout(){runCatching{OneSignal.User.pushSubscription.optOut()};store.logout();status="";runCatching{BackgroundSync.cancel(context)};changed()}
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
            val a=freshSession();register(a)
            val old=store.conversations().associateBy{it.optLong("id")}
            val data=api.call("/msg/conversas?canal=todos&filtro=",a).getJSONArray("conversas")
            if(!store.current(a))return false
            val ids=mutableSetOf<Long>();val changed=mutableListOf<Long>()
            for(i in 0 until data.length()){
                val c=data.getJSONObject(i);val id=c.getLong("id");ids.add(id)
                if(old[id]?.optString("atualizada_em")!=c.optString("atualizada_em")||store.messages(id).isEmpty())changed.add(id)
                c.remove("local_hidden");store.putConversation(a,c)
            }
            val oldest=if(data.length()>0)(0 until data.length()).minOf{data.getJSONObject(it).optString("ultima_em")}else ""
            old.values.filter{it.optLong("id") !in ids&&(data.length()==0||it.optString("ultima_em")>=oldest)}.forEach{it.put("local_hidden",true);store.putConversation(a,it)}
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
        store.putConversation(a,j.getJSONObject("conversa"));store.putMessages(a,id,j.getJSONArray("mensagens"))
    }
    fun markRead(id:Long){lock.withLock{
        val a=store.auth()?:return
        try{api.call("/msg/lida",a,JSONObject().put("conversa",id).put("celular",true));store.conversation(id)?.let{it.put("nao_lidas",0);store.putConversation(a,it)};changed()}
        catch(e:AccessRevoked){logout()}
        catch(_:Exception){}
    }}
    fun reply(id:Long,text:String,key:String="android-"+UUID.randomUUID()):String {
        val stamp=store.stampedAuth();val initial=stamp.first?:throw AccessRevoked();val generation=stamp.second;require(text.isNotBlank()&&text.length<=10000)
        store.pending(key,id,text,"Enviando…",initial);changed()
        return lock.withLock{
        val a=store.auth()?:throw AccessRevoked()
        if(a.owner!=initial.owner||store.generation!=generation)throw Exception("A conta mudou.")
        try{
            val j=api.call("/msg/enviar",a,JSONObject().put("conversa",id).put("texto",text).put("idLocal",key))
            if(!store.current(a))throw Exception("A conta mudou.")
            val m=j.optJSONObject("mensagem")
            if(m!=null){store.putMessages(a,id,org.json.JSONArray().put(m));store.removePending(key)}
            else store.pending(key,id,text,"Envio sem confirmação. Confira antes de tentar novamente.",a)
            runCatching{downloadConversation(a,id)};changed();key
        }catch(e:AccessRevoked){logout();throw e}
        catch(e:ApiFailure){
            if(store.current(a)){
                val m=e.data.optJSONObject("mensagem")
                if(m!=null){store.putMessages(a,id,org.json.JSONArray().put(m));store.removePending(key)}
                else store.pending(key,id,text,if(e.data.optBoolean("incerto"))"Envio sem confirmação. Confira a conversa." else "Não enviada: "+(e.message?:"Tente novamente."),a)
                changed()
            };throw e
        }
        catch(e:Exception){if(store.current(a)){store.pending(key,id,text,"Envio sem confirmação. Confira a conversa antes de tentar novamente.",a);changed()};throw e}
    }}
}
