package br.com.tenkitermodas.mensagens

import org.junit.Assert.*
import org.junit.Test

/** 2.5.0 — cada endereço do site abre na janela certa; o resto fica na janela em que a pessoa está. */
class JanelasTest {
    private val s = Modulo.SITE
    @Test fun cadaAreaTemSuaJanela() {
        assertEquals(Modulo.GESTAO, Modulo.paraUrl("$s/admin.html"))
        assertEquals(Modulo.GESTAO, Modulo.paraUrl("$s/admin.html?caixaFotos=11,12&modo=um&volta=esteira"))
        assertEquals(Modulo.MENSAGENS, Modulo.paraUrl("$s/admin.html?app=mensagens"))
        assertEquals(Modulo.POSTAGENS, Modulo.paraUrl("$s/admin.html?abrir=postagens"))
        assertEquals(Modulo.ESTEIRA, Modulo.paraUrl("$s/esteira.html"))
        assertEquals(Modulo.PRINCIPAL, Modulo.paraUrl("$s/"))
        assertEquals(Modulo.PRINCIPAL, Modulo.paraUrl("$s/index.html?abrir=busca"))
        assertEquals(Modulo.RH, Modulo.paraUrl("$s/treinamentos.html?painel=rh"))
        assertEquals(Modulo.CURRICULOS, Modulo.paraUrl("$s/curriculos.html"))
    }
    @Test fun paginaAuxiliarFicaNaJanelaAtual() {
        assertNull(Modulo.paraUrl("$s/curriculo.html"))
        assertNull(Modulo.paraUrl("$s/fotos-ia.html?origem=mensagens"))
    }
    @Test fun foraDoSiteNuncaViraJanela() {
        assertNull(Modulo.paraUrl("http://tenkitermodas.com.br/admin.html"))
        assertNull(Modulo.paraUrl("https://tenkitermodas.com.br.exemplo.com/admin.html"))
        assertNull(Modulo.paraUrl("https://wa.me/5588999999999"))
        assertNull(Modulo.paraUrl("javascript:alert(1)"))
        assertNull(Modulo.paraUrl(null))
        assertFalse(Modulo.doSite("https://evil.com/?u=https://tenkitermodas.com.br/"))
    }
    @Test fun soCarregaQuandoHaMaisQueATelaInicial() {
        assertFalse(Modulo.pedeCarga(Modulo.GESTAO, "$s/admin.html"))
        assertFalse(Modulo.pedeCarga(Modulo.ESTEIRA, "$s/esteira.html"))
        assertFalse(Modulo.pedeCarga(Modulo.PRINCIPAL, "$s/"))
        assertTrue(Modulo.pedeCarga(Modulo.GESTAO, "$s/admin.html?editar=123"))
        assertTrue(Modulo.pedeCarga(Modulo.RH, "$s/treinamentos.html"))
        assertFalse(Modulo.pedeCarga(Modulo.GESTAO, "https://evil.com/admin.html?x=1"))
    }
}
