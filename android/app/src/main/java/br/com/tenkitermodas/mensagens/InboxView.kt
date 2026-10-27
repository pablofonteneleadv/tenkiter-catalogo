package br.com.tenkitermodas.mensagens

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.*
import org.json.JSONObject

/** UI nativa: o banco local é a primeira fonte; a rede só altera os dados depois. */
class InboxView(private val activity:Activity,private val events:Events):LinearLayout(activity){
    interface Events {
        fun login(identifier:String,password:String)
        fun sync()
        fun select(id:Long)
        fun back()
        fun send(id:Long,text:String):Boolean
        fun retry(id:Long,key:String,text:String)
        fun full(id:Long)
        fun update()
        fun menu(anchor:View)
    }
    private val ink=Color.rgb(20,20,18);private val orange=Color.rgb(168,82,0);private val cream=Color.rgb(245,241,232)
    private val body=LinearLayout(activity).apply{orientation=VERTICAL}
    private val info=TextView(activity)
    private var lastOwner="";private var auth:NativeAuth?=null
    private var chats=emptyList<JSONObject>();private var focus=0L;private var messages=emptyList<JSONObject>();private var pending=emptyList<JSONObject>()
    private var online=false;private var query="";private var channel="Todos";private var list:ListView?=null
    private var unreadOnly=false;private var allTab:Button?=null;private var unreadTab:Button?=null;private var channelTab:Button?=null
    private var chatScroll:ScrollView?=null;private var restoreScroll:Int?=null;
    private var chatInput:EditText?=null;private var loginPassword:EditText?=null
    private val drafts=mutableMapOf<Long,String>()
    private var viewKey="";private var loginBusy=false
    init{
        orientation=VERTICAL;setBackgroundColor(Color.WHITE)
        val bar=LinearLayout(activity).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(12),0,dp(4),0);setBackgroundColor(Color.rgb(16,16,14))}
        bar.addView(text("Conversas",20,true,Color.rgb(230,126,34)),LayoutParams(0,dp(52),1f))
        bar.addView(button("Atualizar app"){events.update()}.apply{setTextColor(Color.WHITE);background=rounded(Color.TRANSPARENT,0)},LayoutParams(-2,dp(48)))
        bar.addView(button("⋮"){events.menu(it)}.apply{contentDescription="Opções do aplicativo";setTextColor(Color.WHITE);textSize=24f;background=rounded(Color.TRANSPARENT,0)},LayoutParams(dp(48),dp(48)))
        addView(bar)
        info.apply{setPadding(dp(12),dp(7),dp(12),dp(7));textSize=12f;setTextColor(Color.rgb(85,73,49));setBackgroundColor(cream);accessibilityLiveRegion=View.ACCESSIBILITY_LIVE_REGION_POLITE}
        addView(info,LayoutParams(-1,-2));addView(body,LayoutParams(-1,0,1f))
    }
    fun dp(n:Int)=(n*resources.displayMetrics.density).toInt()
    private fun rounded(color:Int,r:Int)=GradientDrawable().apply{setColor(color);cornerRadius=dp(r).toFloat()}
    private fun text(t:String,size:Int=15,bold:Boolean=false,color:Int=ink)=TextView(activity).apply{text=t;textSize=size.toFloat();setTextColor(color);if(bold)setTypeface(typeface,Typeface.BOLD);gravity=Gravity.CENTER_VERTICAL}
    private fun button(label:String,click:(View)->Unit)=Button(activity).apply{text=label;isAllCaps=false;textSize=14f;minimumHeight=dp(48);minWidth=0;setPadding(dp(12),0,dp(12),0);setOnClickListener{click(it)}}
    fun status(t:String){info.text=t;if(t.isBlank())info.text="Suas conversas neste aparelho"}
    fun loginState(busy:Boolean){loginBusy=busy;loginPassword?.isEnabled=!busy;body.findViewWithTag<Button>("login")?.isEnabled=!busy}
    fun reset(){drafts.clear();lastOwner="";auth=null;focus=0;viewKey="";chatInput=null;loginPassword=null;body.removeAllViews()}
    fun render(a:NativeAuth?,canRead:Boolean,conversations:List<JSONObject>,id:Long,msgs:List<JSONObject>,outgoing:List<JSONObject>,connected:Boolean,state:String){
        if(a?.owner!=lastOwner){reset();lastOwner=a?.owner?:""}
        auth=a;chats=conversations;focus=id;messages=msgs;pending=outgoing;online=connected
        status(state)
        if(a==null||!canRead){if(viewKey!="login"){viewKey="login";showLogin(a!=null)};return}
        val key=if(id>0)"chat:$id:${conversations.firstOrNull{it.optLong("id")==id}?.optString("nome")}:${msgs.joinToString("|"){it.toString()}.hashCode()}:${outgoing.joinToString("|"){it.toString()}.hashCode()}:$connected" else "list"
        if(viewKey!=key){
            val sameChat=viewKey.startsWith("chat:$id:")
            val keepFocus=chatInput?.hasFocus()==true&&sameChat
            val cursor=chatInput?.selectionStart?:0
            restoreScroll=if(sameChat)chatScroll?.let{if(it.getChildAt(0)!=null&&it.getChildAt(0).height-it.scrollY-it.height>80)it.scrollY else null}else null
            chatInput?.let{drafts[it.tag as? Long?:0L]=it.text.toString()};body.removeAllViews();chatInput=null;loginPassword=null;viewKey=key;if(id>0)showConversation()else showList();if(keepFocus)chatInput?.post{chatInput?.requestFocus();chatInput?.setSelection(cursor.coerceIn(0,chatInput?.text?.length?:0))}}
        else if(id==0L){val pos=list?.firstVisiblePosition?:0;val top=list?.getChildAt(0)?.top?:0;refreshList();list?.setSelectionFromTop(pos,top)}
    }
    private fun showLogin(expired:Boolean){
        val scroll=ScrollView(activity);val form=LinearLayout(activity).apply{orientation=VERTICAL;setPadding(dp(24),dp(24),dp(24),dp(16))}
        form.addView(text(if(expired)"Confirme seu acesso"else"Entre no atendimento",23,true),LayoutParams(-1,-2))
        form.addView(text(if(expired)"Entre novamente para abrir as conversas salvas."else"Use a mesma conta da TENKiTER.",14),LayoutParams(-1,dp(56)))
        val who=EditText(activity).apply{hint="WhatsApp ou e-mail";inputType=android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS;setSingleLine();contentDescription=hint;minHeight=dp(52)}
        val pass=EditText(activity).apply{hint="Senha";inputType=android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD;setSingleLine();minHeight=dp(52);contentDescription=hint}
        loginPassword=pass
        form.addView(who,LayoutParams(-1,dp(56)));form.addView(pass,LayoutParams(-1,dp(56)))
        form.addView(button("Entrar"){if(who.text.isBlank()||pass.text.isBlank()){status("Preencha sua conta e senha.");return@button};events.login(who.text.toString(),pass.text.toString());pass.text.clear()}.apply{tag="login";setTextColor(Color.WHITE);background=rounded(orange,10)},LayoutParams(-1,dp(52)).apply{topMargin=dp(16)})
        form.addView(button("Entrar ou recuperar acesso pelo site"){events.full(0)},LayoutParams(-1,dp(52)).apply{topMargin=dp(8)})
        scroll.addView(form);body.addView(scroll,LayoutParams(-1,-1));loginState(loginBusy)
    }
    private fun showList(){
        val search=EditText(activity).apply{hint="Buscar nome, número ou mensagem";setSingleLine();textSize=15f;setText(query);contentDescription=hint}
        val searchRow=LinearLayout(activity).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(12),dp(4),dp(8),dp(4))}
        searchRow.addView(search,LayoutParams(0,dp(48),1f))
        searchRow.addView(button("↻"){events.sync()}.apply{contentDescription="Sincronizar conversas";background=rounded(Color.TRANSPARENT,0)},LayoutParams(dp(48),dp(48)));body.addView(searchRow)
        search.addTextChangedListener(object:TextWatcher{override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){};override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){query=s.toString();list?.adapter=adapter()};override fun afterTextChanged(e:Editable?) {}})
        val tabs=LinearLayout(activity).apply{setPadding(dp(12),0,dp(12),0)}
        allTab=button("Todas"){unreadOnly=false;refreshList()}
        unreadTab=button("Não lidas"){unreadOnly=true;refreshList()}
        channelTab=button("Canal ▾"){anchor->
            val popup=PopupMenu(activity,anchor)
            val channels=listOf("Todos","WhatsApp 1","WhatsApp 2","Instagram")
            channels.forEachIndexed{i,value->popup.menu.add(0,i,i,if(i==0)"Todos os canais"else value).apply{isCheckable=true;isChecked=channel==value}}
            popup.setOnMenuItemClickListener{item->channel=channels[item.itemId];refreshList();true};popup.show()
        }
        tabs.addView(allTab,LayoutParams(0,dp(48),1f));tabs.addView(unreadTab,LayoutParams(0,dp(48),1f).apply{leftMargin=dp(6)})
        tabs.addView(channelTab,LayoutParams(dp(88),dp(48)).apply{leftMargin=dp(6)});body.addView(tabs)
        body.addView(text("Mais recentes primeiro · horário da última mensagem",12,false,Color.rgb(91,87,80)).apply{setPadding(dp(16),0,dp(16),dp(8))},LayoutParams(-1,-2))
        list=ListView(activity).apply{dividerHeight=dp(1);adapter=adapter();setOnItemClickListener{_,_,pos,_->val c=(adapter as ChatAdapter).items[pos];events.select(c.optLong("id"))}}
        val empty=text("Nenhuma conversa nesta seleção.\nTroque o filtro ou toque em ↻ para sincronizar.",15).apply{gravity=Gravity.CENTER;setPadding(dp(24),dp(24),dp(24),dp(24))}
        val frame=FrameLayout(activity);frame.addView(list,FrameLayout.LayoutParams(-1,-1));frame.addView(empty,FrameLayout.LayoutParams(-1,-1));list?.emptyView=empty
        body.addView(frame,LayoutParams(-1,0,1f));refreshList()
    }
    private fun matches(c:JSONObject):Boolean {
        if(query.isBlank()&&(c.optBoolean("local_hidden")||c.optString("encerrada_em").isNotBlank()))return false
        val name=when(c.optString("canal")){"whatsapp1"->"WhatsApp 1";"whatsapp2"->"WhatsApp 2";else->"Instagram"}
        return (!unreadOnly||c.optInt("nao_lidas")>0)&&(channel=="Todos"||channel==name)&&(query.isBlank()||(c.optString("nome")+" "+c.optString("contato")+" "+c.optString("previa")).contains(query,true))
    }
    private fun refreshList(){
        val count=chats.count{!it.optBoolean("local_hidden")&&it.optString("encerrada_em").isBlank()&&it.optInt("nao_lidas")>0}
        allTab?.text="Todas";unreadTab?.apply{text="Não lidas";contentDescription="Não lidas, $count conversas"}
        channelTab?.apply{text=when(channel){"WhatsApp 1"->"WA 1 ▾";"WhatsApp 2"->"WA 2 ▾";"Instagram"->"Insta ▾";else->"Canal ▾"};contentDescription="Filtrar canal: "+if(channel=="Todos")"Todos os canais"else channel;background=rounded(cream,10)}
        for((tab,selected)in listOf(allTab to !unreadOnly,unreadTab to unreadOnly))tab?.apply{
            isSelected=selected;setTextColor(if(selected)Color.WHITE else ink)
            background=rounded(if(selected)ink else cream,10)
            contentDescription=(if(this==unreadTab)"Não lidas, $count conversas"else text.toString())+if(selected)", selecionado"else""
        }
        list?.adapter=adapter()
    }
    private fun timeOf(c:JSONObject):java.time.Instant?=runCatching{java.time.Instant.parse(c.optString("ultima_em"))}.getOrNull()
    private fun clock(c:JSONObject):String{
        val at=timeOf(c)?.atZone(java.time.ZoneId.systemDefault())?:return ""
        val today=java.time.LocalDate.now()
        return when(at.toLocalDate()){
            today->at.format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))
            today.minusDays(1)->"Ontem"
            else->at.format(java.time.format.DateTimeFormatter.ofPattern(if(at.year==today.year)"dd/MM"else"dd/MM/yy"))
        }
    }
    private fun adapter()=ChatAdapter(chats.filter(::matches).sortedWith(compareByDescending<JSONObject>{timeOf(it)?:java.time.Instant.MIN}.thenByDescending{it.optLong("id")}))
    private inner class ChatAdapter(val items:List<JSONObject>):BaseAdapter(){
        override fun getCount()=items.size;override fun getItem(position:Int)=items[position];override fun getItemId(position:Int)=items[position].optLong("id")
        override fun getView(position:Int,convert:View?,parent:android.view.ViewGroup?):View {
            val c=items[position];val row=LinearLayout(activity).apply{orientation=VERTICAL;minimumHeight=dp(80);setPadding(dp(16),dp(12),dp(16),dp(12))}
            val top=LinearLayout(activity).apply{gravity=Gravity.CENTER_VERTICAL}
            val unread=c.optInt("nao_lidas");val label=c.optString("nome").ifBlank{c.optString("contato","Conversa")}
            top.addView(text(label,16,unread>0).apply{maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END},LayoutParams(0,-2,1f))
            top.addView(text(clock(c),12,unread>0,if(unread>0)Color.rgb(18,104,67)else Color.rgb(91,87,80)).apply{setPadding(dp(12),0,0,0)})
            val preview=when(c.optString("previa")){"[audio]","[áudio]"->"Áudio";"[imagem]"->"Foto";"[video]","[vídeo]"->"Vídeo";else->c.optString("previa").ifBlank{"Sem prévia da mensagem"}}
            row.addView(top);row.addView(text(preview,14,false,Color.rgb(91,87,80)).apply{maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END},LayoutParams(-1,dp(24)))
            val bottom=LinearLayout(activity).apply{gravity=Gravity.CENTER_VERTICAL}
            val canal=when(c.optString("canal")){"whatsapp1"->"WhatsApp 1";"whatsapp2"->"WhatsApp 2";else->"Instagram"}
            bottom.addView(text(canal,11,false,Color.rgb(91,87,80)),LayoutParams(0,-2,1f))
            if(unread>0)bottom.addView(text(if(unread==1)"1 não lida"else"$unread não lidas",12,true,Color.rgb(18,104,67)))
            row.addView(bottom)
            row.contentDescription=label+", "+canal+", "+clock(c)+", "+preview+if(unread>0)", $unread mensagens não lidas"else""
            return row
        }
    }
    private fun showConversation(){
        val c=chats.firstOrNull{it.optLong("id")==focus};val row=LinearLayout(activity).apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(4),0,dp(8),0)}
        row.addView(button("←"){events.back()}.apply{contentDescription="Voltar às conversas"},LayoutParams(dp(48),dp(52)))
        row.addView(text(c?.optString("nome")?.ifBlank{c.optString("contato")}?:"Conversa",17,true).apply{maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END},LayoutParams(0,dp(52),1f))
        row.addView(button("Completo"){events.full(focus)}.apply{contentDescription="Abrir histórico e anexos no atendimento completo"},LayoutParams(-2,dp(48)));body.addView(row)
        val scroll=ScrollView(activity).apply{setBackgroundColor(cream);isFillViewport=true}
        val bubbles=LinearLayout(activity).apply{orientation=VERTICAL;setPadding(dp(12),dp(12),dp(12),dp(12))}
        if(messages.isEmpty())bubbles.addView(text("Ainda não há mensagens salvas. Sincronize para buscar esta conversa.",15))
        fun bubble(msg:JSONObject,state:String?=null){
            val outgoing=state!=null||msg.optString("direcao")=="saida"
            val box=LinearLayout(activity).apply{orientation=VERTICAL;background=rounded(if(outgoing)Color.rgb(216,243,227)else Color.WHITE,12);setPadding(dp(12),dp(8),dp(12),dp(8))}
            var value=msg.optString("texto");val type=msg.optString("tipo","texto")
            if(type!="texto")value="[${type}] · toque para abrir no atendimento completo"+(if(value.isBlank())""else"\n$value")
            box.addView(text(value,15).apply{setTextIsSelectable(type=="texto");if(type!="texto")setOnClickListener{events.full(focus)}})
            val stamp=runCatching{java.time.format.DateTimeFormatter.ofPattern("HH:mm").withZone(java.time.ZoneId.systemDefault()).format(java.time.Instant.parse(msg.optString("enviada_em")))}.getOrDefault("")
            box.addView(text(state?:stamp+if(outgoing&&msg.optString("status").isNotBlank())" · "+when(msg.optString("status")){"incerta"->"Sem confirmação";"enviada"->"Enviada";"entregue"->"Entregue";"lida"->"Lida";else->"Aguardando"}else"",11,false,Color.rgb(84,79,69)))
            if(type!="texto")box.setOnClickListener{events.full(focus)}
            if(state!=null){
                box.addView(button("Conferir no atendimento completo"){events.full(focus)})
                if(state.startsWith("Não enviada:"))box.addView(button("Tentar novamente"){events.retry(focus,msg.optString("key"),msg.optString("texto"))})
            }
            bubbles.addView(box,LayoutParams(((if(width>0)width else resources.displayMetrics.widthPixels)*.83).toInt().coerceAtMost(dp(520)),-2).apply{gravity=if(outgoing)Gravity.END else Gravity.START;bottomMargin=dp(8)})
        }
        messages.forEach{bubble(it)};pending.forEach{bubble(it,it.optString("state"))}
        chatScroll=scroll;scroll.addView(bubbles);body.addView(scroll,LayoutParams(-1,0,1f));val savedScroll=restoreScroll;scroll.post{if(savedScroll!=null)scroll.scrollTo(0,savedScroll)else scroll.fullScroll(View.FOCUS_DOWN)}
        val compose=LinearLayout(activity).apply{gravity=Gravity.BOTTOM;setPadding(dp(8),dp(6),dp(8),dp(8))}
        val input=EditText(activity).apply{hint=if(online)"Mensagem"else"Mensagem · envie após sincronizar";contentDescription="Mensagem para a conversa";setText(drafts[focus]?:"");minHeight=dp(48);maxLines=4;inputType=android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE or android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES;tag=focus}
        chatInput=input;compose.addView(input,LayoutParams(0,-2,1f))
        compose.addView(button("Enviar"){val t=input.text.toString().trim();if(t.isNotBlank()&&online){if(events.send(focus,t)){drafts[focus]="";input.text.clear()}}}.apply{isEnabled=online;setTextColor(if(online)orange else Color.GRAY)},LayoutParams(-2,dp(48)));body.addView(compose)
    }
}
