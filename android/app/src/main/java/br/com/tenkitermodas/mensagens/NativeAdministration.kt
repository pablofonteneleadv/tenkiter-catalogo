package br.com.tenkitermodas.mensagens

import android.app.Activity
import android.app.AlertDialog
import android.content.*
import android.graphics.Color
import android.net.Uri
import android.view.View
import android.widget.*
import androidx.core.content.FileProvider
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Todas as ferramentas administrativas do atendimento, nas rotas já existentes. */
class NativeAdministration(private val activity:Activity,private val scope:CoroutineScope,private val repo:NativeRepository,private val open:(Long)->Unit,private val refresh:()->Unit){
    @Volatile var active=false;private set
    private val dialogs=mutableListOf<AlertDialog>()
    private fun builder():AlertDialog.Builder=object:AlertDialog.Builder(activity){override fun create()=super.create().also{dialogs.removeAll{d->!d.isShowing};dialogs.add(it);it.setOnShowListener{active=true};it.setOnDismissListener{active=dialogs.any{d->d.isShowing}}};override fun show()=create().also{it.show()}}
    fun close(){dialogs.toList().forEach{it.dismiss()};dialogs.clear();active=false}
    private fun dp(n:Int)=(n*activity.resources.displayMetrics.density).toInt()
    private fun column()=LinearLayout(activity).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(20),dp(8),dp(20),dp(12))}
    private fun text(value:String,bold:Boolean=false)=TextView(activity).apply{text=value;textSize=15f;setTextColor(Color.rgb(30,30,25));setPadding(0,dp(6),0,dp(6));setTextIsSelectable(true);if(bold)setTypeface(typeface,android.graphics.Typeface.BOLD)}
    private fun button(label:String,action:()->Unit)=Button(activity).apply{text=label;isAllCaps=false;minHeight=dp(48);setOnClickListener{action()}}
    private fun input(hint:String,value:String="",secret:Boolean=false)=EditText(activity).apply{this.hint=hint;contentDescription=hint;minHeight=dp(48);setText(value);setSingleLine();inputType=android.text.InputType.TYPE_CLASS_TEXT or if(secret)android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD else 0;importantForAutofill=View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS}
    private fun sheet(title:String,box:LinearLayout):AlertDialog=builder().setTitle(title).setView(ScrollView(activity).apply{addView(box)}).setNegativeButton("Fechar",null).show()
    private fun toast(message:String){if(!activity.isFinishing)Toast.makeText(activity,message,Toast.LENGTH_LONG).show()}
    private fun <T> work(task:()->T,done:(T)->Unit){
        val (auth,generation)=repo.store.stampedAuth();if(auth==null)return
        toast("Consultando o servidor…")
        scope.launch{try{val value=withContext(Dispatchers.IO){task()};if(!activity.isFinishing&&repo.store.generation==generation&&repo.store.auth()?.owner==auth.owner)done(value)}
            catch(e:CancellationException){throw e}
            catch(e:AccessRevoked){if(repo.store.generation==generation&&repo.store.auth()?.owner==auth.owner)repo.logout();refresh();toast("Entre novamente para continuar.")}
            catch(e:Exception){toast(if(e is java.io.IOException)"Não foi possível concluir. Confira a conexão."else e.message?.take(250)?:"Não foi possível concluir agora.")}}
    }
    private fun confirm(title:String,message:String,task:()->JSONObject,done:(JSONObject)->Unit){builder().setTitle(title).setMessage(message).setPositiveButton("Confirmar"){_,_->work(task,done)}.setNegativeButton("Cancelar",null).show()}
    fun settings(){work({repo.config()}){r->
        val box=column();box.addView(text("Espiar nunca marca leitura. A abertura normal usa as opções abaixo."))
        val flags=JSONObject();val saved=r.optJSONObject("config")?:JSONObject();val read=saved.optJSONObject("lerCelular")?:JSONObject()
        listOf("whatsapp1" to "WhatsApp 1","whatsapp2" to "WhatsApp 2","instagram" to "Instagram").forEach{(id,name)->
            val check=CheckBox(activity).apply{text="$name: marcar lida no celular";minHeight=dp(48);isChecked=read.optBoolean(id,true)};box.addView(check);flags.put(id,check.isChecked);check.setOnCheckedChangeListener{_,value->flags.put(id,value)}
            r.optJSONObject("ultimaLeitura")?.optJSONObject(id)?.let{last->box.addView(text((if(last.optBoolean("ok"))"Última confirmação: "else"Última tentativa: ")+stamp(last.optString("em"))+(if(last.optString("erro").isBlank())""else" · "+last.optString("erro"))))}
        }
        val name=input("Seu nome nas respostas",r.optString("meuNome"));box.addView(name)
        val signature=CheckBox(activity).apply{text="Mostrar nome do atendente (toda a equipe)";minHeight=dp(48);isChecked=saved.optBoolean("assinatura",true)};box.addView(signature)
        val d=sheet("Leitura e assinatura",box)
        box.addView(button("Salvar configurações"){if(name.length()>30){toast("O nome aceita até 30 letras.");return@button};work({repo.config(JSONObject().put("lerCelular",flags).put("assinatura",signature.isChecked).put("meuNome",name.text.toString()))}){d.dismiss();toast("Configurações salvas.")}})
        box.addView(button("Google Contatos"){contacts()})
    }}
    fun dashboard(channel:String="",days:Int=30){
        work({repo.administration("/msg/metricas?canal="+Uri.encode(channel)+"&dias=$days")}){r->
            val box=column();val periods=LinearLayout(activity);for(d in listOf(7,30,90))periods.addView(button("$d dias"){close();dashboard(channel,d)},LinearLayout.LayoutParams(0,dp(48),1f));box.addView(periods)
            box.addView(text("${r.optInt("dias",days)} dias · "+channelName(channel),true))
            val waiting=r.optJSONObject("aguardando")?:JSONObject()
            listOf("Esperando resposta agora" to waiting.optInt("total").toString(),"Tempo típico da primeira resposta" to minutes(r.opt("medianaMin")),"Média da primeira resposta" to minutes(r.opt("mediaMin")),"Até 5 minutos" to percent(r.opt("ate5min")),"Até 1 hora" to percent(r.opt("ate60min")),"Depois de 24 horas" to percent(r.opt("acima24h")),"Perguntas sem resposta" to r.optInt("perguntasSemResposta").toString()).forEach{(label,value)->box.addView(text("$label: $value"))}
            box.addView(text("${r.optInt("conversas")} conversas · ${r.optInt("entradas")} recebidas · ${r.optInt("saidas")} enviadas. Grupos ficam fora das métricas."))
            val closed=r.optJSONObject("encerramentos")?:JSONObject();box.addView(text("Encerramentos no período",true));listOf("concluido" to "Concluído","vendeu" to "Vendeu","sem_resposta" to "Cliente parou de responder","engano" to "Engano ou spam").forEach{(key,label)->box.addView(text("$label: ${closed.optInt(key)}"))}
            box.addView(text("Esperando há mais tempo",true));array(waiting,"maisAntigas").forEach{c->box.addView(button(c.optString("nome")+" · "+stamp(c.optString("desde"))){close();open(c.optLong("id"))})}
            box.addView(text("Quando os clientes escrevem · horário de Fortaleza",true));val hours=array(r,"porHora")
            box.addView(HourChart(activity,hours),LinearLayout.LayoutParams(-1,dp(124)))
            box.addView(button("Detalhar horários"){val details=column();hours.forEach{h->details.addView(text("${h.optInt("hora")}h · ${h.optInt("entradas")} perguntas · resposta típica "+minutes(h.opt("medianaMin"))))};sheet("Perguntas por hora",details)})
            box.addView(button("Exportar este período (TXT)"){exportForm(0,channel,days)})
            box.addView(button("Trocar canal"){builder().setTitle("Canal do painel").setItems(channelNames.toTypedArray()){_,i->close();dashboard(channels[i],days)}.show()})
            sheet("Painel de atendimento",box)
        }
    }
    fun exportForm(id:Long=0,channel:String="",days:Int=0){
        val box=column();val format=Spinner(activity).apply{contentDescription="Formato da exportação";minimumHeight=dp(48);adapter=ArrayAdapter(activity,android.R.layout.simple_spinner_dropdown_item,listOf("TXT para IA","CSV","JSON"))};box.addView(format)
        val chan=Spinner(activity).apply{contentDescription="Canal a exportar";minimumHeight=dp(48);adapter=ArrayAdapter(activity,android.R.layout.simple_spinner_dropdown_item,channelNames);setSelection(channels.indexOf(channel).coerceAtLeast(0))};box.addView(chan)
        val only=CheckBox(activity).apply{text="Somente esta conversa";isChecked=id>0;minHeight=dp(48);visibility=if(id>0)View.VISIBLE else View.GONE};box.addView(only)
        val from=input("De (AAAA-MM-DD)",if(days>0)java.time.LocalDate.now().minusDays(days.toLong()).toString()else"");val to=input("Até (AAAA-MM-DD)");box.addView(from);box.addView(to)
        val d=sheet("Exportar conversas",box)
        box.addView(button("Gerar e salvar/compartilhar"){
            val start=from.text.toString().trim();val end=to.text.toString().trim()
            try{if(start.isNotEmpty())java.time.LocalDate.parse(start);if(end.isNotEmpty())java.time.LocalDate.parse(end);require(start.isBlank()||end.isBlank()||start<=end)}catch(_:Exception){toast("Confira as datas no formato AAAA-MM-DD e a ordem do período.");return@button}
            val pairs=linkedMapOf("formato" to listOf("txt","csv","json")[format.selectedItemPosition],"de" to start,"ate" to end)
            if(only.isChecked)pairs["conversa"]=id.toString()else if(channels[chan.selectedItemPosition].isNotBlank())pairs["canal"]=channels[chan.selectedItemPosition]
            val query=pairs.filterValues{it.isNotEmpty()}.entries.joinToString("&"){Uri.encode(it.key)+"="+Uri.encode(it.value)}
            toast("Preparando arquivo…");work({repo.export(query)}){data->d.dismiss();share(data)}
        })
    }
    fun copyConversation(id:Long){
        work({repo.export("formato=txt&conversa=$id")}){data->
            val value=String(data.bytes,Charsets.UTF_8)
            if(data.bytes.size>350000){toast("A conversa é grande para copiar. Use o arquivo TXT.");share(data);return@work}
            val clip=ClipData.newPlainText("Conversa TENKiTER",value)
            if(android.os.Build.VERSION.SDK_INT>=33)clip.description.extras=android.os.PersistableBundle().apply{putBoolean("android.content.extra.IS_SENSITIVE",true)}
            (activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(clip);toast("Conversa copiada para colar na IA."+(if(data.cropped)" O servidor limitou o relatório; filtre por datas para o restante."else""))
        }
    }
    private fun share(data:NativeApi.Export){
        val generation=repo.store.generation
        work({
            val dir=File(activity.cacheDir,"exports").apply{mkdirs()};dir.listFiles()?.filter{System.currentTimeMillis()-it.lastModified()>3600000}?.forEach{it.delete()}
            if((dir.listFiles()?.sumOf{it.length()}?:0)+data.bytes.size>64*1048576)dir.listFiles()?.forEach{it.delete()}
            val file=File(dir,System.currentTimeMillis().toString()+"-"+data.name);file.writeBytes(data.bytes)
            if(generation!=repo.store.generation){file.delete();throw AccessRevoked()};file
        }){file->
            val uri=FileProvider.getUriForFile(activity,activity.packageName+".updates",file)
            toast("Arquivo pronto: ${data.total} mensagens."+(if(data.cropped)" Limite atingido: use datas para exportar o restante."else""))
            try{activity.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType(data.mime).putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),"Salvar ou compartilhar exportação"))}catch(_:ActivityNotFoundException){toast("Nenhum aplicativo disponível para salvar este arquivo.")}
        }
    }
    fun connections(){work({repo.administration("/msg/resumo")}){r->
        val box=column();val entries=r.optJSONObject("canais")?:JSONObject()
        for(id in channels.drop(1)){
            val c=entries.optJSONObject(id)?:JSONObject();box.addView(text(channelName(id),true));box.addView(text("${c.optInt("conversas")} conversas · ${c.optInt("mensagens")} mensagens\n"+(if(c.optBoolean("pausado"))"Gravação pausada"else if(c.optString("ligadoEm").isNotBlank())"Gravando desde "+stamp(c.optString("ligadoEm"))else"Recebimento ainda não ativado")))
            if(id.startsWith("whatsapp"))box.addView(button("Ativar recebimento, envios e leituras"){
                confirm("Ativar "+channelName(id)+"?","O endereço de webhook da instância será substituído pelo servidor da loja. O histórico não será apagado nem importado.",{repo.administration("/msg/ligar",JSONObject().put("slot",id.takeLast(1).toInt()))}){x->toast("Solicitação concluída."+arrayStrings(x,"avisos").joinToString(" "));close();connections()}
            })
            box.addView(button(if(c.optBoolean("pausado"))"Retomar gravação"else"Pausar gravação"){
                confirm("Alterar recebimento?","Aplicar a "+channelName(id)+".",{repo.administration("/msg/pausar",JSONObject().put("canal",id).put("pausar",!c.optBoolean("pausado")))}){close();connections()}
            })
        }
        box.addView(button("Diagnóstico do Instagram"){instagram()});box.addView(button("Diagnóstico dos WhatsApps"){work({repo.administration("/msg/diagnostico")}){diagnostics(it)}})
        box.addView(button("Webhooks do Instagram"){val b=column();val url=r.optString("urlInstagram");b.addView(text(if(url.isBlank())"Cadastre o segredo do app para obter o webhook."else url));if(url.isNotBlank())b.addView(button("Copiar endereço do webhook"){(activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Webhook Instagram",url));toast("Endereço copiado.")});sheet("Configurar webhook",b)})
        sheet("Conexões e gravação",box)
    }}
    private fun instagram(){work({repo.administration("/msg/instagram/situacao")}){r->
        val box=column();box.addView(text("Token: "+if(r.optBoolean("token"))"cadastrado"else"não cadastrado"));box.addView(text("Mensagens assinadas na Meta: "+when{r.isNull("assinada")->"não foi possível conferir";r.optBoolean("assinada")->"sim";else->"não"}))
        if(r.optString("erroMeta").isNotBlank())box.addView(text(r.optString("erroMeta")))
        r.optJSONObject("ultimaTentativa")?.let{last->box.addView(text("Último aviso: "+stamp(last.optString("em"))+" · "+last.optString("res")))}
        val secret=input("Segredo do aplicativo Meta",secret=true);box.addView(secret)
        box.addView(button("Guardar segredo do app"){
            val value=secret.text.toString().trim();if(!value.matches(Regex("[A-Za-z0-9]{16,80}"))){toast("Cole o segredo completo do aplicativo Meta.");return@button}
            work({repo.administration("/msg/instagram/segredo",JSONObject().put("segredo",value))}){secret.text.clear();toast("Segredo guardado no servidor.");close();connections()}
        })
        box.addView(button("Assinar recebimento de mensagens"){
            confirm("Assinar mensagens na Meta?","Ativa a assinatura de mensagens para o Instagram conectado.",{repo.administration("/msg/instagram/assinar",JSONObject())}){toast("Assinatura solicitada.");close();instagram()}
        })
        sheet("Diagnóstico do Instagram",box)
    }}
    private fun diagnostics(r:JSONObject){
        val box=column()
        r.optJSONObject("ligar")?.let{root->for(id in listOf("whatsapp1","whatsapp2")){val x=root.optJSONObject(id)?:continue;box.addView(text(channelName(id),true));box.addView(text("Atualizado: "+stamp(x.optString("em"))));arrayStrings(x,"tentativas").forEach{box.addView(text(it))}}}
        r.optJSONObject("forma")?.let{root->for(id in listOf("whatsapp1","whatsapp2")){val x=root.optJSONObject(id)?:continue;box.addView(text(channelName(id)+" · último evento",true));box.addView(text("${x.optString("tipo")} · "+stamp(x.optString("em"))+"\nCampos recebidos: "+arrayStrings(x,"campos").joinToString(", ")))}}
        if(box.childCount==0)box.addView(text("Ainda não há tentativas registradas."));sheet("Diagnóstico do recebimento",box)
    }
    fun contacts(){work({repo.administration("/msg/contatos/situacao?relatorio=1")}){r->
        val box=column();box.addView(text("Google Contatos · Tenkiter Clientes G",true))
        if(!r.optBoolean("ligada")){
            box.addView(text("Publique a ponte na conta dos contatos e informe a implantação e a chave gerada pela função configurar."))
            val url=input("Endereço da implantação /exec");val key=input("Chave da ponte",secret=true);box.addView(url);box.addView(key)
            box.addView(button("Ligar ponte"){
                val address=url.text.toString().trim();val value=key.text.toString().trim()
                if(!address.matches(Regex("https://script\\.google\\.com/macros/s/[A-Za-z0-9_-]+/exec"))||!value.matches(Regex("[A-Za-z0-9]{32,128}"))){toast("Confira a URL /exec e a chave completa da ponte.");return@button}
                work({repo.administration("/msg/contatos/config",JSONObject().put("url",address).put("chave",value))}){key.text.clear();close();contacts()}
            })
        }else{
            box.addView(text("Ligada à conta "+r.optString("conta")));val backup=r.optJSONObject("backup")
            box.addView(text(if(backup==null)"Faça a cópia de segurança antes do relatório."else"Última cópia: "+stamp(backup.optString("em"))+" · ${backup.optInt("total")} contatos"))
            if(backup?.optString("url")?.startsWith("https://drive.google.com/")==true)box.addView(button("Abrir cópia no Drive"){activity.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(backup.optString("url"))))})
            box.addView(button("Fazer cópia de segurança"){
                confirm("Fazer cópia dos contatos?","Um arquivo será criado no Drive da conta dos contatos; os contatos não serão alterados.",{repo.administration("/msg/contatos/backup",JSONObject())}){toast("Cópia de segurança concluída.");close();contacts()}
            })
            box.addView(button("Gerar relatório da limpeza"){
                confirm("Gerar relatório?","O relatório somente lê os contatos. Não junta, corrige ou apaga contatos.",{repo.administration("/msg/contatos/relatorio",JSONObject())}){report(it.optJSONObject("relatorio")?:it)}
            }.apply{isEnabled=backup!=null})
            box.addView(button("Ver último relatório"){report(r.optJSONObject("relatorio"))})
            box.addView(button("Desligar ponte"){
                confirm("Desligar a ponte?","A conexão com Google Contatos será removida. Nenhum contato será apagado.",{repo.administration("/msg/contatos/config",JSONObject().put("desligar",true))}){close();contacts()}
            })
        }
        sheet("Google Contatos",box)
    }}
    private fun report(r:JSONObject?){
        val box=column();if(r==null){box.addView(text("Ainda não há relatório. Gere após a cópia de segurança."));sheet("Relatório dos contatos",box);return}
        box.addView(text("Gerado "+stamp(r.optString("em"))+". Nada foi alterado no Google."));box.addView(text("${r.optInt("total")} contatos · ${r.optInt("semFone")} sem número"))
        for((key,label)in listOf("duplicados" to "Pessoas repetidas","corrigir" to "Números a padronizar","invalidos" to "Números inválidos","semCadastro" to "Conversaram e não estão no Google")){
            val section=r.optJSONObject(key)?:JSONObject();box.addView(text(label+": "+section.optInt("total"),true))
            box.addView(button("Ver detalhes de "+label.lowercase()){
                val detail=column();array(section,"lista").forEach{x->
                    val line=when(key){"duplicados"->array(x,"contatos").joinToString(" + "){it.optString("n","Sem nome")+" "+arrayStrings(it,"f").joinToString(", ")};"corrigir"->x.optString("n")+": "+x.optString("de")+" → "+x.optString("para");"invalidos"->x.optString("n")+": "+x.optString("f");else->x.optString("nome")+" · "+x.optString("fone")+" · "+channelName(x.optString("canal"))}
                    detail.addView(text(line))
                };if(detail.childCount==0)detail.addView(text("Nenhum."));sheet(label,detail)
            })
        };sheet("Relatório dos contatos",box)
    }
    private class HourChart(c:android.content.Context,private val hours:List<JSONObject>):View(c){
        private val ink=android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
        init{contentDescription="Quantidade de perguntas por hora do dia: "+hours.joinToString(", "){"${it.optInt("hora")}h: ${it.optInt("entradas")}"};importantForAccessibility=IMPORTANT_FOR_ACCESSIBILITY_YES}
        override fun onDraw(canvas:android.graphics.Canvas){
            super.onDraw(canvas);val density=resources.displayMetrics.density;val pad=8*density;val chartHeight=80*density;val available=width-2*pad;val max=maxOf(1,hours.maxOfOrNull{it.optInt("entradas")}?:1)
            ink.color=Color.rgb(168,82,0)
            hours.forEachIndexed{i,h->val x=pad+available*i/24f;val top=chartHeight-maxOf(2*density,chartHeight*h.optInt("entradas")/max);canvas.drawRect(x,top,x+available/24f-2*density,chartHeight,ink)}
            ink.color=Color.rgb(75,71,65);ink.textSize=12*resources.displayMetrics.scaledDensity
            for(i in listOf(0,6,12,18,23)){ink.textAlign=if(i==0)android.graphics.Paint.Align.LEFT else if(i==23)android.graphics.Paint.Align.RIGHT else android.graphics.Paint.Align.CENTER;canvas.drawText("${i}h",pad+available*i/23f,105*density,ink)}
        }
    }
    companion object{
        val channels=listOf("","whatsapp1","whatsapp2","instagram")
        val channelNames=listOf("Todos os canais","WhatsApp 1","WhatsApp 2","Instagram")
        fun channelName(id:String)=channelNames[channels.indexOf(id).coerceAtLeast(0)]
        fun array(j:JSONObject,key:String):List<JSONObject>{val a=j.optJSONArray(key)?:return emptyList();return (0 until a.length()).mapNotNull{a.optJSONObject(it)}}
        fun arrayStrings(j:JSONObject,key:String):List<String>{val a=j.optJSONArray(key)?:return emptyList();return (0 until a.length()).map{a.optString(it)}}
        fun stamp(s:String)=runCatching{java.time.Instant.parse(s).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("dd/MM HH:mm"))}.getOrDefault(s.ifBlank{"—"})
        fun minutes(v:Any?)=if(v==null||v==JSONObject.NULL)"—"else (v.toString()+" min")
        fun percent(v:Any?)=if(v==null||v==JSONObject.NULL)"—"else (v.toString()+"%")
    }
}
