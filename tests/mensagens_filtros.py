"""Ações do painel de filtros usadas nas jornadas da caixa (serviços simulados)."""
def aplicar(pg, **valores):
    pg.click('#ms-btn-filtros')
    for nome, valor in valores.items():
        alvo=pg.locator('[name=ms-ft-'+nome+']')
        if isinstance(valor,bool): alvo.set_checked(valor)
        else: alvo.select_option(valor)
    pg.click('[data-ms=filtros-aplicar]')

def valor(pg,nome):
    pg.click('#ms-btn-filtros')
    resultado=pg.locator('[name=ms-ft-'+nome+']').input_value()
    pg.keyboard.press('Escape')
    pg.wait_for_selector('#ms-gaveta',state='detached')
    return resultado
