package br.com.tenkitermodas.mensagens

import android.app.Application
import android.content.Context
import android.content.Intent
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import javax.crypto.KeyGenerator

/** 2.6.1 — voltar para onde estava: a origem viaja com a janela aberta; "Continuar" guarda a última área por pessoa. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class VoltarTest {
    private lateinit var c: Context
    @Before fun antes() {
        c = RuntimeEnvironment.getApplication()
        Pessoas.chaveTeste = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
        c.getSharedPreferences("pessoas-celular", Context.MODE_PRIVATE).edit().clear().commit(); Pessoas.limparCacheParaTeste()
        c.getSharedPreferences("ultima-area", Context.MODE_PRIVATE).edit().clear().commit()
    }
    @Test fun origemDaConversaViajaComAJanela() {
        val i = Intent().putExtra(Modulo.EXTRA_ORIGEM, "mensagens").putExtra(Modulo.EXTRA_ORIGEM_ROTULO, "a conversa com Rose").putExtra(Modulo.EXTRA_ORIGEM_CONVERSA, 42L)
        val o = Origem.ler(i)!!
        assertEquals(Modulo.MENSAGENS, o.modulo); assertEquals("a conversa com Rose", o.rotulo); assertEquals(42L, o.conversa)
        assertNull(Origem.ler(Intent())); assertNull(Origem.ler(Intent().putExtra(Modulo.EXTRA_ORIGEM, "inventada")))
    }
    @Test fun continuarGuardaAUltimaAreaPorPessoa() {
        Pessoas.vista(c, "88999990001", "t1", "Lara", null)
        Ultima.guardar(c, Modulo.GESTAO, "https://tenkitermodas.com.br/admin.html", "TENKiTER — Gestão de produtos")
        val u = Ultima.ler(c)!!
        assertEquals(Modulo.GESTAO, u.first); assertEquals("Gestão de produtos", u.third)
        Pessoas.ninguem(c); Pessoas.vista(c, "88999990002", "t2", "Talita", null)
        assertNull(Ultima.ler(c))   // a Talita não vê o "Continuar" da Lara
        Ultima.guardar(c, Modulo.ESTEIRA, "https://exemplo.com/x", "x")
        assertNull(Ultima.ler(c))   // fora do site não é guardado
    }
}
