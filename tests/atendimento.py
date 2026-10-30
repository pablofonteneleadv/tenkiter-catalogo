"""Abertura de conversa nos testes de UI do atendimento.

Desde a PR #309 toda conversa da fila Esperando abre em modo Espiar: o
compositor fica oculto e somente o botao Atender libera a resposta. Testes que
precisam digitar devem passar por abrir_atendimento() em vez de esperar
#ms-texto visivel logo apos o clique na lista.
"""


def abrir_atendimento(pg, conv_id, seletor='#ms-lista .ms-conv'):
    """Abre a conversa e, se ela vier em modo Espiar, toca em Atender."""
    pg.locator('%s[data-id="%s"]' % (seletor, conv_id)).click()
    pg.wait_for_selector('#ms-conversa #ms-texto', state='attached', timeout=12000)
    atender = pg.locator('#ms-conversa [data-ms="atender"]')
    if atender.count():
        atender.wait_for(state='visible', timeout=8000)
        atender.click()
    pg.wait_for_selector('#ms-texto', state='visible', timeout=12000)
