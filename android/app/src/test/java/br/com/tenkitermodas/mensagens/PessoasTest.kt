package br.com.tenkitermodas.mensagens

import android.app.Application
import android.content.Context
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import javax.crypto.KeyGenerator

/** 2.6.0 — troca de pessoa no celular: quantas pessoas precisar, um PIN de 4 dígitos por pessoa (da conta), sem trava,
 * só o Admin total remove, bloqueio desligado por padrão. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class PessoasTest {
    private lateinit var c: Context
    private val lara = "88999990001"; private val talita = "88999990002"

    @Before fun antes() {
        c = RuntimeEnvironment.getApplication()
        Pessoas.chaveTeste = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
        c.getSharedPreferences("pessoas-celular", Context.MODE_PRIVATE).edit().clear().commit()
        Pessoas.limparCacheParaTeste()
    }

    @Test fun semNinguemOAppFazComoAntes() {
        assertFalse(Pessoas.gerenciado(c)); assertEquals("", Pessoas.paraSite(c)); assertFalse(Pessoas.precisaDesbloquear(c))
    }

    @Test fun primeiraEntradaGuardaAPessoaEPedePin() {
        assertTrue(Pessoas.vista(c, lara, "tok-lara", "Lara Souza", listOf("catalogo_admin")))
        val p = Pessoas.ativa(c)!!
        assertEquals(lara, p.owner); assertEquals("Lara", p.primeiroNome); assertEquals("LS", p.iniciais); assertFalse(p.temPin)
        assertEquals(lara, JSONObject(Pessoas.paraSite(c)).getString("w"))
    }

    /** O PIN vem da conta (servidor): aqui simula o que /app/pin devolve. */
    private fun pinDaConta(owner: String, pin: String) { val sal = "c2FsLWRlLXRlc3RlLTEyMw=="; Pessoas.guardarPin(c, owner, sal, Pessoas.hashPara(pin, sal, 6000), 6000) }

    @Test fun pinDeQuatroDigitosTrocaAPessoa() {
        Pessoas.vista(c, lara, "tok-lara", "Lara", listOf("catalogo_admin")); pinDaConta(lara, "2580")
        Pessoas.ninguem(c); assertEquals("", JSONObject(Pessoas.paraSite(c)).getString("w"))
        Pessoas.vista(c, talita, "tok-talita", "Talita", listOf("catalogo_admin")); pinDaConta(talita, "1397")
        assertEquals(talita, Pessoas.ativa(c)!!.owner); assertTrue(Pessoas.ativa(c)!!.temPin)
        assertFalse(Pessoas.pinValido("12345")); assertFalse(Pessoas.pinValido("12a4"))
        assertFalse(Pessoas.conferirPin(c, lara, "1397"))
        assertTrue(Pessoas.conferirPin(c, lara, "2580")); assertTrue(Pessoas.trocarPara(c, lara))
        val site = JSONObject(Pessoas.paraSite(c)); assertEquals(lara, site.getString("w")); assertEquals("tok-lara", site.getString("s"))
    }

    @Test fun janelaAntigaNaoTrocaAPessoaDeVolta() {
        Pessoas.vista(c, lara, "tok-lara", "Lara", null); Pessoas.ninguem(c)
        Pessoas.vista(c, talita, "tok-talita", "Talita", null)
        assertFalse(Pessoas.vista(c, lara, "tok-lara", "Lara", null))   // mesmo token guardado: janela antiga
        assertEquals(talita, Pessoas.ativa(c)!!.owner)
        assertTrue(Pessoas.vista(c, lara, "tok-lara-novo", "Lara", null))   // token novo: entrou com a senha agora
        assertEquals(lara, Pessoas.ativa(c)!!.owner)
    }

    @Test fun quantasPessoasPrecisar() {
        (1..8).forEach { assertTrue(Pessoas.vista(c, "889999900" + (10 + it), "t$it", "P$it", null)); Pessoas.ninguem(c) }
        assertEquals(8, Pessoas.lista(c).size)
    }

    @Test fun semTravaDepoisDeErrar() {
        Pessoas.vista(c, lara, "tok", "Lara", null); pinDaConta(lara, "2580")
        repeat(7) { assertFalse(Pessoas.conferirPin(c, lara, "0000")) }
        assertTrue(Pessoas.conferirPin(c, lara, "2580"))   // continua podendo tentar; cada tentativa vai para o registro do servidor
    }

    @Test fun pinDaContaValeEmOutroCelularSemCriarOutro() {
        Pessoas.vista(c, lara, "tok", "Lara", null); assertFalse(Pessoas.ativa(c)!!.temPin)
        pinDaConta(lara, "2580"); assertTrue(Pessoas.ativa(c)!!.temPin)   // veio da conta: não pede para criar
        Pessoas.guardarPin(c, lara, "", "", 6000); assertFalse(Pessoas.ativa(c)!!.temPin)   // a conta diz que não tem: pede
    }

    @Test fun soOAdminTotalRemoveEMudaOBloqueio() {
        Pessoas.vista(c, lara, "tl", "Lara", listOf("catalogo_admin")); Pessoas.ninguem(c)
        Pessoas.vista(c, talita, "tt", "Talita", listOf("catalogo_admin"))
        assertFalse(Pessoas.remover(c, lara)); assertFalse(Pessoas.definirBloqueio(c, 15)); assertEquals(0, Pessoas.bloqueioMin(c))
        Pessoas.ninguem(c); Pessoas.vista(c, "88999990003", "tp", "Pablo", listOf("gerir_acessos", "catalogo_admin"))
        assertFalse(Pessoas.remover(c, "88999990003"))   // nunca a si mesmo
        assertTrue(Pessoas.remover(c, lara)); assertEquals(2, Pessoas.lista(c).size)
        assertTrue(Pessoas.definirBloqueio(c, 30)); assertFalse(Pessoas.definirBloqueio(c, 7)); assertEquals(30, Pessoas.bloqueioMin(c))
    }

    @Test fun painelMostraSoAsAreasPermitidas() {
        val equipe = Pessoa(lara, "t", "Lara", listOf("catalogo_admin"))
        assertTrue(Pessoas.podeArea(equipe, Modulo.GESTAO)); assertFalse(Pessoas.podeArea(equipe, Modulo.MENSAGENS))
        assertTrue(Pessoas.podeArea(equipe.copy(mensagens = true), Modulo.MENSAGENS))
        assertFalse(Pessoas.podeArea(equipe.copy(mensagens = false), Modulo.MENSAGENS))
        assertFalse(Pessoas.podeArea(equipe.copy(perms = emptyList()), Modulo.MENSAGENS))
        assertTrue(Pessoas.podeArea(equipe.copy(perms = listOf("gerir_acessos")), Modulo.MENSAGENS))
        assertFalse(Pessoas.podeArea(equipe, Modulo.RH)); assertFalse(Pessoas.podeArea(equipe, Modulo.CURRICULOS))
        assertTrue(Pessoas.podeArea(equipe, Modulo.ESTEIRA)); assertTrue(Pessoas.podeArea(Pessoa(lara, "t", "Lara", emptyList()), Modulo.RH))
    }

    @Test fun direitoMensagensPertenceASessaoConsultada() {
        Pessoas.vista(c, lara, "sessao-1", "Lara", listOf("catalogo_admin"))
        val a = Pessoas.ativa(c)!!.auth
        assertTrue(Pessoas.guardarAcessoMensagens(c, a, true))
        assertTrue(Pessoas.podeArea(Pessoas.ativa(c), Modulo.MENSAGENS))
        Pessoas.vista(c, lara, "sessao-2", "Lara", listOf("catalogo_admin"))
        assertFalse(Pessoas.podeArea(Pessoas.ativa(c), Modulo.MENSAGENS))
        assertFalse(Pessoas.guardarAcessoMensagens(c, a, true))
        assertFalse(Pessoas.podeArea(Pessoas.ativa(c), Modulo.MENSAGENS))
        assertEquals(false, Pessoa.ler(Pessoas.ativa(c)!!.copy(mensagens = false).json()).mensagens)
    }

    @Test fun enderecosVariadosAbremNaJanelaCerta() {
        assertEquals(Modulo.GESTAO, Modulo.paraUrl("https://tenkitermodas.com.br/admin"))
        assertEquals(Modulo.GESTAO, Modulo.paraUrl("https://www.tenkitermodas.com.br/admin.html"))
        assertEquals(Modulo.ESTEIRA, Modulo.paraUrl("https://tenkitermodas.com.br/esteira/"))
        assertNull(Modulo.paraUrl("https://tenkitermodas.com.br.exemplo.com/admin"))
    }
}
