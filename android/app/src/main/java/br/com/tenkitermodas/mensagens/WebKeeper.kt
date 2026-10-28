package br.com.tenkitermodas.mensagens
import android.content.MutableContextWrapper
import android.webkit.WebView
/** Mantém a tela Mensagens carregada enquanto o processo vive: reabrir o app não recarrega do zero. */
object WebKeeper {
    var web:WebView?=null
    var context:MutableContextWrapper?=null
}
