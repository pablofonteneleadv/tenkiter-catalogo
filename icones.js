/* TENKiTER — ícones de linha da vitrine (v7.15, "Opção A: acabamento novo").
 *
 * Um único conjunto de ícones SVG, traço de 1,7 px, desenhados num quadro 24×24.
 * Substitui os emojis na loja: emoji muda de desenho em cada celular e disputa
 * atenção com a foto da peça. O ícone herda a cor do texto (currentColor).
 *
 * Uso: TKIcone('sacola') devolve o <svg> pronto (aria-hidden; o nome acessível
 * fica no botão). Nomes desconhecidos devolvem ''. Arquivo carregado só no
 * catálogo; os outros scripts usam `window.TKIcone ? ... : emoji` para continuar
 * funcionando nas telas que não carregam este arquivo. */
(function () {
  var P = {
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    busca: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    coracao: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    'coracao-cheio': '<path class="tk-ico-cheio" d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    sacola: '<path d="M5.5 8h13l-1 12h-11z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
    conta: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',
    sino: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    'sino-off': '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z"/><path d="M10 20a2 2 0 0 0 4 0M4 4l16 16"/>',
    filtro: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    microfone: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5"/>',
    casa: '<path d="M4 11 12 4.5 20 11v8.5h-5v-5h-6v5H4z"/>',
    conversa: '<path d="M5 5.5h14v10H10l-4 3.5v-3.5H5z"/>',
    compartilhar: '<path d="M12 4v11M8 8l4-4 4 4M6 12v7.5h12V12"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
    regua: '<rect x="3" y="8" width="18" height="8" rx="1"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/>',
    'seta-baixo': '<path d="m6 9 6 6 6-6"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    certo: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    local: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    etiqueta: '<path d="M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5z"/><circle cx="8" cy="8.5" r="1.3"/>',
    camera: '<path d="M4 8h3.5L9 6h6l1.5 2H20v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    play: '<path class="tk-ico-cheio" d="M8 5.5v13l10.5-6.5z"/>',
    pacote: '<path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5z"/><path d="M4 7.5 12 11l8-3.5M12 11v9"/>',
    cadeado: '<rect x="5" y="10.5" width="14" height="9.5" rx="1.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    lixeira: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
    lapis: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    capelo: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v5c3 2.2 8 2.2 11 0v-5"/>',
    celular: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
    atualizar: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
    instagram: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><circle class="tk-ico-cheio" cx="16.8" cy="7.2" r=".9"/>',
    ferramenta: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L4 16.7V20h3.3l5.3-5.3a4 4 0 0 0 5.1-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    cabide: '<path d="M12 7.5a2 2 0 1 1 2-2"/><path d="M12 7.5v1.5L3.5 15.5A1.5 1.5 0 0 0 4.4 18h15.2a1.5 1.5 0 0 0 .9-2.5L12 9"/>',
    pessoas: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5a6 6 0 0 1 12 0"/><circle cx="17" cy="9.5" r="2.5"/><path d="M16 14.2a5 5 0 0 1 5.5 5.3"/>',
    documento: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h6"/>',
    grafico: '<path d="M4 20h16M7 16.5V11M12 16.5V6.5M17 16.5v-4"/>',
    recibo: '<path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z"/><path d="M9 8.5h6M9 12h6M9 15.5h4"/>',
    pincel: '<path d="M14.5 4.5 19.5 9.5 11 18l-5-5z"/><path d="M6 13c-2 0-3 1.5-3 3.5V20h3.5C8.5 20 10 19 11 18"/>',
    copiar: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
    relogio: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
    arquivar: '<rect x="3.5" y="4.5" width="17" height="4" rx="1"/><path d="M5 8.5v11h14v-11M10 12h4"/>',
    pasta: '<path d="M3.5 6.5h6l2 2h9v10h-17z"/>',
    whatsapp: '<path class="tk-ico-cheio" d="M12.04 2.5a9.4 9.4 0 0 0-8.1 14.2L2.6 21.5l4.9-1.3a9.4 9.4 0 1 0 4.5-17.7zm0 17.2a7.8 7.8 0 0 1-4-1.1l-.3-.2-2.9.8.8-2.8-.2-.3a7.8 7.8 0 1 1 6.6 3.6zm4.3-5.8c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.4 6.4 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.7-1.7c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6a2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .1-1.2c0-.1-.2-.2-.5-.3z"/>'
  };
  function TKIcone(nome, classe) {
    var d = P[nome];
    if (!d) return '';
    return '<svg class="tk-ico' + (classe ? ' ' + classe : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + d + '</svg>';
  }
  window.TKIcone = TKIcone;
})();
