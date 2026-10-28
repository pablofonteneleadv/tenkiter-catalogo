package br.com.tenkitermodas.mensagens
import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.app.NotificationManagerCompat
/**
 * Primeira tela depois de instalar: o app só abre quando os avisos e o funcionamento em segundo plano
 * estão ativados. Sem isso o Android encerra o app e as conversas precisam carregar do zero.
 */
class SetupGate(private val activity:Activity,private val askNotifications:()->Unit):ScrollView(activity){
    companion object {
        fun notificationsOk(c:Context)=NotificationManagerCompat.from(c).areNotificationsEnabled()&&(Build.VERSION.SDK_INT<33||c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)
        fun batteryOk(c:Context)=(c.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(c.packageName)
        fun ok(c:Context)=notificationsOk(c)&&batteryOk(c)
        private val XIAOMI=Build.MANUFACTURER.lowercase().let{it.contains("xiaomi")||it.contains("redmi")||it.contains("poco")}
    }
    private val list=LinearLayout(activity).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(20),dp(28),dp(20),dp(28))}
    private fun dp(n:Int)=(n*resources.displayMetrics.density).toInt()
    init{setBackgroundColor(Color.WHITE);isFillViewport=true;addView(list);refresh()}
    fun refresh(){
        list.removeAllViews()
        list.addView(TextView(activity).apply{text="Antes de começar";textSize=24f;setTypeface(typeface,Typeface.BOLD);setTextColor(Color.parseColor("#1F1A17"))})
        list.addView(TextView(activity).apply{text="Ative estes dois itens para o app avisar mensagens novas e abrir com as conversas já carregadas.";textSize=16f;setTextColor(Color.parseColor("#5C524B"));setPadding(0,dp(8),0,dp(20))})
        item("Avisos de mensagens","Mostra quando chega mensagem, mesmo com o app fechado.",notificationsOk(activity)){askNotifications()}
        item("Rodar em segundo plano","Na janela que abrir, toque em Permitir. Assim o Android não fecha o app.",batteryOk(activity)){
            runCatching{activity.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,Uri.parse("package:"+activity.packageName)))}
                .onFailure{runCatching{activity.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))}}}
        if(XIAOMI)item("Início automático (Xiaomi)","Recomendado: ligue \"Início automático\" para o TENKiTER Mensagens.",null){
            val miui=Intent().setClassName("com.miui.securitycenter","com.miui.permcenter.autostart.AutoStartManagementActivity")
            runCatching{activity.startActivity(miui)}.onFailure{runCatching{activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+activity.packageName)))}}}
        list.addView(TextView(activity).apply{text=if(ok(activity))"Tudo pronto." else "O app abre assim que os dois primeiros itens estiverem ativados.";textSize=14f;gravity=Gravity.CENTER;setTextColor(Color.parseColor("#5C524B"));setPadding(0,dp(16),0,0)})
    }
    /** done=null: item recomendado, sem como o app conferir. */
    private fun item(title:String,help:String,done:Boolean?,action:()->Unit){
        val box=LinearLayout(activity).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(16),dp(14),dp(16),dp(14))
            background=GradientDrawable().apply{cornerRadius=dp(14).toFloat();setColor(Color.parseColor(if(done==true)"#EEF7EE" else "#F7F3EE"))}}
        box.addView(TextView(activity).apply{text=(if(done==true)"✓ " else "")+title;textSize=17f;setTypeface(typeface,Typeface.BOLD);setTextColor(Color.parseColor(if(done==true)"#2E6B34" else "#1F1A17"))})
        box.addView(TextView(activity).apply{text=if(done==true)"Ativado." else help;textSize=15f;setTextColor(Color.parseColor("#5C524B"));setPadding(0,dp(4),0,0)})
        if(done!=true)box.addView(Button(activity).apply{text=if(done==null)"Abrir ajuste" else "Ativar";isAllCaps=false;textSize=16f;minimumHeight=dp(48);setTextColor(Color.WHITE)
            background=GradientDrawable().apply{cornerRadius=dp(24).toFloat();setColor(Color.parseColor("#B4541A"))};setOnClickListener{action()}},
            LinearLayout.LayoutParams(-1,dp(48)).apply{topMargin=dp(12)})
        list.addView(box,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(12)})
    }
}
