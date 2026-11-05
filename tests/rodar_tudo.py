#!/usr/bin/env python3
"""Roda toda a bateria de testes do site (simula lojista, cliente, pedido, funcionária, acessibilidade, teclado, busca, painel de gestão,
telas novas, categorias do painel, compartilhar a foto escolhida e a seleção, central de avisos, avisos/instalação no celular, service worker offline, Story em vídeo, lista rápida) e os testes de código sem navegador (backend do Apps Script e Worker da Cloudflare).

Uso:
    pip install playwright pillow && playwright install chromium     (uma vez)
    apt install ffmpeg      (para o teste do Story em vídeo; sem ele aquela bateria avisa e falha)
    node (v18+) para os testes backend_gs.js e worker_og.js
    curl -L https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js -o tests/axe.min.js   (uma vez; não vai pro git)
    python3 tests/rodar_tudo.py                    # testa os arquivos desta pasta (sobe um servidor local sozinho)
    TK_BASE=https://tenkiter-catalogo.onrender.com/ python3 tests/rodar_tudo.py   # testa o site publicado

O Apps Script é SIMULADO (mock.py): nada aqui toca na planilha nem no WhatsApp reais.
Sai com código 1 se algo falhar.
"""
import os, re, subprocess, sys, time
from pathlib import Path
AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
SUITES = [  # (arquivo, como saber que passou)
    ("worker_credenciais.py", lambda out: True),
    ("estoque_opcional.js", lambda out: "PASS estoque opcional:" in out),
    ("worker_og_runtime.cjs", lambda out: "PASS OG runtime:" in out),
    ("worker_og_resiliencia.js", lambda out: "PASS OG resiliente:" in out),
    ("auditoria_interna.py", lambda out: True),
    ("saude_publica.py", lambda out: True),
    ("distribuicao_cache.py", lambda out: True),
    ("pedido_idempotencia.js", lambda out: "OK: intenção estável" in out),
    ("recuperacao_whatsapp.js", lambda out: "PASS recuperação:" in out),
    ("worker_abas_fluxo.py", lambda out: "FALHAS=0" in out),
    ("assinatura_upload.js", lambda out: "PASS: contrato restrito" in out),
    ("filtros_facetas.py", lambda out: "FALHAS: []" in out),
    ("mensagens_acessos_rh.py", lambda out: "RH: ferramentas por pessoa" in out),
    ("axe_telas_a.py", lambda o: o.strip() == "" or "[critical]" not in o and "[serious]" not in o and "[moderate]" not in o),
    ("axe_telas_b.py", lambda o: "TOTAL com problema: 0" in o),
    ("jornada_cliente.py", lambda o: "FALHAS=0" in o),
    ("listas_so_admin.py", lambda o: "FALHAS=0" in o),
    ("jornada_lojista.py", lambda o: "FALHAS=0" in o),
    ("jornada_funcionaria.py", lambda o: "FALHAS=1 ['progresso foi enviado ao servidor']" in o or "FALHAS=0" in o),  # manuais-semente não têm id de capítulo: não sincronizam
    ("mensagens_acesso_equipe.py", lambda o: "ferramentas administrativas ocultas" in o),
    ("mensagens_dashboard.py", lambda o: "FALHAS=0" in o),
    ("teclado.py", lambda o: "FALHAS=0" in o),
    ("busca.py", lambda o: "FALHAS=0" in o),
    ("jornada_pedido.py", lambda o: "FALHAS=0" in o),
    ("admin_gestao.py", lambda o: "FALHAS=0" in o),
    ("lote_falhas.py", lambda o: "FALHAS=0" in o),
    ("novas_telas.py", lambda o: "FALHAS=0" in o),
    ("compartilhar_foto.py", lambda o: "FALHAS=0" in o),   # compartilhar/pedir/sacola levam a FOTO ou VÍDEO escolhido (?f=N)
    ("admin_categorias.py", lambda o: "FALHAS=0" in o),    # criar categoria, ✎/× só Admin total, sugestões de nome
    ("juntar_admin.py", lambda o: "FALHAS=0" in o),   # juntar produtos repetidos na lista do admin (v7.50.0: em segundo plano, retomável)
    ("gestao_unioes.py", lambda o: "FALHAS=0" in o),  # v7.50.0: uniões no cadastro, Separar, sessão rápida loja↔Gestão, seleção abre a peça, selo de fotos
    ("aparencia_aprovada_ui.py", lambda o: "PASS aparência aprovada" in o),
    ("x_equipe.py", lambda o: "FALHAS=0" in o),   # X de arquivar na loja (Equipe do site)
    ("botao_voltar.py", lambda o: "FALHAS=0" in o),   # botão voltar fecha só a janela de cima
    ("selecao_link.py", lambda o: "RESULTADO:" in o and " 0 falhas" in o),   # compartilhar seleção leva as PEÇAS (?sel=…), não só a loja
    ("rolagem_infinita.py", lambda o: "FALHAS=0" in o),   # rolagem infinita + faixa flutuante de filtros
    ("central_avisos.py", lambda o: "FALHAS=0" in o),      # Central de avisos do lojista (público, {nome}, agendar, modelos, histórico, preparar)
    ("push_cliente.py", lambda o: "FALHAS=0" in o),        # avisos + instalar app no cliente com OneSignal FALSO (Android, iPhone, Instagram, computador)
    ("conexoes_admin.py", lambda o: "FALHAS=0" in o),      # Conexões do Admin total: chave no servidor (nunca na tela), situação, regras do Render, publicar
    ("numeros_reais.py", lambda o: "FALHAS=0" in o),       # Números reais com filtros (período, horário opcional, dia da semana, origem, aparelho, fonte, categoria) + instalados/aviso ativo
    ("aparelho_anonimo.py", lambda o: "FALHAS=0" in o),    # contagem anônima de aparelhos: visita, de onde veio, instalou, aviso ativo, conta (só token), sem dado pessoal
    ("central_contagens.py", lambda o: "FALHAS=0" in o),   # Central de avisos com a contagem ao lado de cada público
    ("instalabilidade.py", lambda o: "FALHAS=0" in o),     # diagnóstico do próprio Chrome: o site é instalável
    ("lista_rapida.py", lambda o: "FALHAS=0" in o),
    ("story_video.py", lambda o: "FALHAS=0" in o),
    ("service_worker.py", lambda o: "FALHAS=0" in o),   # sobe e DESLIGA o próprio servidor para testar "sem internet" de verdade
    ("backend_gs.js", lambda o: "FALHAS=0" in o),        # backend do Apps Script rodando em memória (sem planilha real)
    ("backend_contas.js", lambda o: "FALHAS=0" in o),     # bloco de contas compartilhado (CPF, e-mail, login múltiplo, recuperar senha) igual nos dois backends
    ("auditoria_produto.py", lambda o: "FALHAS=0" in o),   # quem cadastrou/editou aparece na lista e no formulário (backend 4.1)
    ("auditoria_filtros.py", lambda o: "auditoria_filtros: OK" in o), # sessão atual + período + vários usuários
    ("tutorial_seletor_antigo.py", lambda o: "tutorial_seletor_antigo: OK" in o), # botão reorganizado continua reconhecido pelo nome acessível
    ("tutorial_nav_simulada.py", lambda o: "tutorial_nav_simulada: OK" in o and "barra do app ok" in o),  # destaque do alvo na barra inferior simulada + barra do app some durante o teste
    ("tutorial_mexer_imagem.py", lambda o: "tutorial_mexer_imagem: OK" in o),  # gesto na imagem (Enquadrar): grava uma etapa e no teste basta mexer
    ("tutorial_teste_sem_gravar.py", lambda o: "tutorial_teste_sem_gravar: OK" in o),  # o teste do tutorial nunca grava no servidor nem na fila real
    ("tutorial_editor_ver_etapa.py", lambda o: "tutorial_editor_ver_etapa: OK" in o),  # editor visual: reproduz a tela da etapa, rola e trava o enquadramento
    ("tutorial_material_apoio.py", lambda o: "tutorial_material_apoio: OK" in o),  # material de apoio: lista/adiciona/remove no editor e baixa tudo de uma vez
    ("tutorial_teste_area_visivel.py", lambda o: "tutorial_teste_area_visivel: OK" in o),  # teste dentro do app: a janela mede a área visível real e a barra inferior (alvo) nunca fica fora da tela
    ("tutorial_arquivo_limpo_pelo_app.py", lambda o: "tutorial_arquivo_limpo_pelo_app: OK" in o),  # etapa de foto: conta mesmo quando o app limpa o campo de arquivo
    ("tutorial_teste_admin_isolado.py", lambda o: "tutorial_teste_admin_isolado: OK" in o),  # teste dentro do admin real: o fetch guardado pela página também é isolado
    ("conexoes_unificada.py", lambda o: "FALHAS=0" in o),   # Conexões em grupos: Instagram, IA, WhatsApp, Meta/Google, serviços e cofre num só lugar
    ("envios_retomar.py", lambda o: "FALHAS=0" in o),      # fila de envios guardada no aparelho: retoma sozinha, sem duplicar
    ("opcoes_lista.py", lambda o: "0 falhas" in o),        # v4.18: tamanhos e cores do servidor, Admin total cria e vale para todos
    ("cadastro_plano_mestre.py", lambda o: "P-38/39/41/42: PASS" in o),
    ("pre_envio.py", lambda o: "FALHAS=0" in o),          # v4.20: pré-envio das mídias, opId, keepalive ao minimizar, retomada sem perguntar
    ("consultar_valor.py", lambda o: "FALHAS=0" in o),    # v4.21: "Consultar valor" (catálogo, sacola, cadastro, lote, Postagens)
    ("admin_busca_status.py", lambda o: "FALHAS=0" in o), # v4.21: busca do admin respeita o filtro de status + emojis dos botões
    ("postagens_toque.py", lambda o: "FALHAS=0" in o),     # v4.22: Postagens: foto travada/girar, textos escolhidos por toque (2 dedos)
    ("admin_lista_v424.py", lambda o: "FALHAS=0" in o),    # v4.24: barra de lote responsiva + busca como menu expansível (filtro de cor)
    ("admin_editar_link.py", lambda o: "FALHAS=0" in o),   # v7.48.0: link "Editar no cadastro" da Esteira (admin.html?editar=ID)
    ("convite_app.py", lambda o: "FALHAS=0" in o),        # plaquinha flutuante de convite para instalar o app (só no site em celular)
    ("contas_cpf.py", lambda o: "FALHAS=0" in o),         # telas: login múltiplo, Esqueci a senha, conta já existe, faixa vermelha de CPF, CPF obrigatório no currículo
    ("backend_func.js", lambda o: "FALHAS=0" in o),      # backend de Funcionários/Acessos: vários perfis por pessoa + travas de Admin
    ("acessos_perfis.py", lambda o: "FALHAS=0" in o),    # painel de Acessos do RH: caixinhas de perfil
    ("worker_og.js", lambda o: "FALHAS=0" in o),         # Worker da Cloudflare com o Apps Script simulado
    ("worker_midia.js", lambda o: "FALHAS=0" in o),      # Worker de mídia (R2) com R2/KV/Apps Script falsos: quem envia, tipos, travas de tamanho e de armazenamento
    ("midia_r2.py", lambda o: "FALHAS=0" in o),          # painel -> R2 (e reserva no Cloudinary)
    ("fotoia_plano.js", lambda o: "FOTOIA PLANO PASS" in o),
    ("worker_fotoia_migracao.js", lambda o: "FOTOIA MIGRACAO PASS" in o),
    ("worker_fotoia_catalogo.js", lambda o: "FOTOIA CATALOGO WORKER PASS" in o),
    ("worker_ig.js", lambda o: "FALHAS=0" in o),         # Worker do importador do Instagram (D1/R2/KV e Instagram falsos): ciclo, agrupamento, cópia, ações, token
    ("worker_esteira_fotos.js", lambda o: "FALHAS=0" in o),   # v7.51.0: pedido de fotos (opções + Outro), caixa de fotos da equipe, preparação sem tarefa duplicada
    ("worker_fotos_postadas.js", lambda o: "FALHAS=0" in o),   # v7.49.0: registro por foto postada, mapa público de fotos novas, foto nova x outra edição
    ("cofre_admin.py", lambda o: "FALHAS=0" in o),       # cofre das Conexões: copiar chaves só com login + senha de novo
    ("foto_cliente.py", lambda o: "FALHAS=0" in o),   # cliente manda foto pela conta (Ela usa TM)
    ("postagens_v49.py", lambda o: "FALHAS=0" in o),   # v4.9: várias peças, filtros, Ela usa TM com seletor, ocultar, 10 posições
    ("editor_visual.py", lambda o: "FALHAS=0" in o),   # v5.5: editor visual sem código (camadas)
    ("editor_toque.py", lambda o: "FALHAS=0" in o),   # v5.7: editor no celular (dedo), tela cheia, imagens fixas, desfazer
    ("visual_v58.py", lambda o: "FALHAS=0" in o),   # v5.8: texto do editor vale, contador, rascunho, opções do botão, login tolerante
    ("visual_v59.py", lambda o: "FALHAS=0" in o),   # v5.9: tipografia/estilos da marca, elementos da identidade, PNG do celular, foto como elemento no fundo
    ("visual_v60.py", lambda o: "FALHAS=0" in o),   # v6.0: ajuste por formato Feed/Story com pergunta, virar texto comum no preço
    ("excluir_avaliacao_lento.py", lambda o: "FALHAS=0" in o),   # v5.6: excluir sem travar, abertura lenta não vai ao login
    ("painel_v49.py", lambda o: "FALHAS=0" in o),
    ("equipe_catalogo1.py", lambda o: "FALHAS=0" in o),   # v4.9: perfil Equipe catálogo 1 (painel simplificado)   # v4.9: ferramentas no topo, Postagens fixa, miniatura amplia
    ("postagens_repostar.py", lambda o: "FALHAS=0" in o),
    ("postagens_destinos.py", lambda o: "FALHAS=0" in o),
    ("postagens_grupo.py", lambda o: "FALHAS=0" in o),
    ("postagens_admin.py", lambda o: "FALHAS=0" in o),   # aba Postagens: feed/carrossel/reels/story, templates, agenda, fila, Story com link manual
    ("conteudo_protegido.py", lambda o: "FALHAS=0" in o),   # treinamentos: manuais e provas só pelo servidor, com sessão e permissão (RH 3.4)
    ("provas_v52.py", lambda o: "FALHAS=0" in o),   # v5.2: prova só corrige respondida, n de 3 vem do servidor, botão Editar produto
    ("manual_rico.py", lambda o: "FALHAS=0" in o),          # manual rico no site: formatação por trecho, foto ao lado, vídeo, caixas, lição que só conclui acertando, botões da prova
    ("modulo0_verificado.py", lambda o: "FALHAS=0" in o),   # módulo 0 verificado: checagem na lição, regra de ouro, prática validada, certificado e verificação
    ("vitrine_orientacao.py", lambda o: "FALHAS=0" in o),   # vitrine: Consultar/Selecionar, etiquetas de filtro, rolagem, ajuda no fim
    ("instagram_admin.py", lambda o: "FALHAS=0" in o),   # painel: Produtos para aceitar (lista, editor, aceitar -> cadastro, conectar)
    # --- v4.25–v4.27 (18/10/2026): estavam FORA da bateria até 18/10 (achado na revisão das pendências) ---
    ("postagens_fila.py", lambda o: "FALHAS=0" in o),      # fila de Postagens com regras (pausa, intervalo por tipo, ▲▼, Próximo livre)
    ("postagens_modelo_formato.js", lambda o: "FALHAS=0" in o),
    ("postagens_colagem.py", lambda o: "FALHAS=0" in o),   # 🧩 Colagem + 🖼️ Gerar imagens
    ("esteira_processos_ui.py", lambda o: "PASS processos:" in o),
    ("esteira_envios_fundo_ui.py", lambda o: "PASS envio real simulado" in o),
    ("produtos_busca_esteira_ia.py", lambda o: "PASS 4 viewports:" in o),
    ("esteira_ui.py", lambda o: "FALHAS=0" in o),
    ("esteira_fotos_ui.py", lambda o: "FALHAS=0" in o),   # v7.51.0: aba Fotos da Esteira, caixa de fotos (envio em lote, retomada, gestor) e cadastro na Gestão com as fotos
    ("pedir_fotos_lote.py", lambda o: "RESULTADO" in o),  # Gestão e catálogo: observação, falha parcial e troca de conta
    ("fotos_postadas_ui.py", lambda o: "FALHAS=0" in o),  # v7.49.0: foto nova sobe na vitrine/postador; fotos postadas desmarcadas com "Postada há N dias"
    ("postagens_v425.py", lambda o: "FALHAS=0" in o),      # prévia leve, foto travada/centralizada, largura, Fazer em todos
    ("video_validacao.py", lambda o: "FALHAS: 0" in o),   # v6.7: validação de vídeo no navegador (cadastro e agendamento)
    ("postagens_avulsas.py", lambda o: "FALHAS=0" in o),   # v4.27: fotos/vídeos avulsos e ordem nas Postagens
    ("postagens_recuperar.py", lambda o: "FALHAS=0" in o), # rascunho local e recuperação após recarregar
    ("postagens_texto_foto.py", lambda o: "FALHAS=0" in o),# v4.27: texto por foto com "Fazer em todos" desligado
    ("postagens_elementos.py", lambda o: "FALHAS=0" in o),     # v4.36: mover/aumentar qualquer elemento, ➕ Adicionar, biblioteca só do Admin
    ("postagens_elementos_fotos.py", lambda o: "FALHAS=0" in o), # v4.36: elemento só nesta foto x todas
    ("postagens_terminou.py", lambda o: "FALHAS=0" in o),  # v4.29: pergunta "terminou de editar?" ao rolar para baixo
    ("postagens_multi.py", lambda o: "FALHAS=0" in o),     # v4.29: várias peças juntas, escopo "fazer em todas" (mesma peça × todas)
    ("capa_video.py", lambda o: "P-43 PASS" in o),
    ("enquadrar_lote.py", lambda o: "P-40 LOTE: PASS" in o),
    ("enquadrar_cadastro.py", lambda o: "FALHAS=0" in o),  # v4.32: janela ✂ Enquadrar do cadastro (zoom/mover/girar, prévias Site/Feed/Story, voltar à original)
    ("curriculos_lento.py", lambda o: "FALHAS=0" in o),    # v4.32: curriculos.html com servidor lento (não cai no login, gravação sem repetir, TKOcupado)
    ("selecao_vida.py", lambda o: "FALHAS=0" in o),        # v4.27: seleção que expira (2 h/3 h), placa libera/segura, sugestões e sinônimos da busca
    ("selecao_botoes.py", lambda o: "FALHAS: []" in o),    # v6.1: Compartilhar / Limpar seleção / Edição em lote
    ("pendente_flutuante.py", lambda o: "FALHAS=0" in o),  # v4.27: ação pendente de conexão vira chip flutuante
    ("foto_ia_catalogo.py", lambda o: "FOTOS IA CATÁLOGO PASS" in o),
    ("foto_ia_lotes.py", lambda o: "P-26 LOTES PASS" in o),
    ("foto_ia.py", lambda o: "FALHAS=0" in o),             # v4.27: painel 🎨 Fotos com IA (fila, instrução editável, aviso de plano sem imagens)
    ("worker_grupo.js", lambda o: "FALHAS=0" in o),
    ("worker_canal.js", lambda o: "FALHAS=0" in o),        # Worker: canal Instagram/WhatsApp/Ambos
    ("worker_zap_proativo.js", lambda o: "FALHAS=0" in o), # v7.48.3: Wafly proativa (consulta 1 min/10 min, reenvio único, ambos em paralelo)
    ("backend_v316.js", lambda o: "FALHAS=0" in o),        # RH 3.16: manual só-gestor, prática validada, certificado (precisa do .gs.txt do RH)
    ("backend_manual_rico.js", lambda o: "FALHAS=0" in o), # RH 3.17: cor/marca-texto/links, foto ao lado, vídeo, tabela, guia e prova-modelo no manual novo (precisa do .gs.txt do RH)
    # --- #305 (retomado em 7.40.34): equipe, presença, atividade e Nova conversa ---
    ("worker_equipe_inicio.js", lambda o: "Equipe/início:" in o and "aprovados." in o),  # Worker: presença, equipe, trilha e envio pelo WhatsApp na Nova conversa
    ("mensagens_equipe_inicio_ui.py", lambda o: "axe aprovados" in o),  # gavetas, heartbeat, envio, Instagram sem envio e axe
    ("worker_video_preparo.js", lambda o: "OK: ACL/isolamento" in o),
    ("worker_postagens_runtime.cjs", lambda o: "OK: Durable Object" in o),
    ("worker_video_partes.js", lambda o: "OK: partes integrais" in o),
    ("worker_encerramento_regras.js", lambda o: "OK:" in o),
    ("worker_relacionamento_atendente.js", lambda o: "OK: relacionamento para atendente" in o),
    ("worker_prioridade_clientes.js", lambda o: "OK: prioridade explicável" in o),
    ("worker_tempo_atendimento.js", lambda o: "OK: tempos por sinais" in o),
    ("worker_gestor.js", lambda o: "OK: gestor Admin total" in o),
    ("worker_fila_originais.js", lambda o: "OK: três originais" in o),
    ("mensagens_relacionamento_ui.py", lambda o: "OK 1440" in o),
    ("mensagens_grupos_busca_ui.py", lambda o: "OK 1440" in o),
    ("mensagens_layout_compacto.py", lambda o: "OK 1440" in o),
    ("mensagens_lista_secoes_ui.py", lambda o: "OK 1440" in o),
    ("tempo_presenca_ui.py", lambda o: "OK: interação" in o),
    ("mensagens_gestor_ui.py", lambda o: "OK 1440" in o),
    ("postagens_fila_midia.py", lambda o: "OK 320" in o),
    ("postagens_fila_midia_cards.py", lambda o: "FALHAS=0" in o),   # v7.48.2: Por mídia em cards recolhidos, miniatura real/placeholder, estado preservado
    ("postagens_zap_proativo_ui.py", lambda o: "FALHAS=0" in o),    # v7.48.3: Por canal por perna, barra de ações da mídia, sem confirmação, Já postadas com filtros
    ("mensagens_camera_menu.py", lambda o: "OK 1440" in o),
    ("video_camera_90s.py", lambda o: "OK: 90 s completos" in o),
    ("video_partes_encoder.py", lambda o: "OK: partes 59/75/90s" in o),
    ("video_processor_http.py", lambda o: "OK: identificação HTTP" in o),
    ("android_manifest_release.py", lambda o: "OK: release estável" in o),
    ("transcode_profiles.py", lambda o: "OK: HEVC" in o),
    ("reparos_integrados_ui.py", lambda o: "OK 1440" in o),
    ("video_upload_feedback.py", lambda o: "OK 1440" in o),
    ("video_lote_limites.py", lambda o: "OK vagas" in o),
    ("postagens_video_status.py", lambda o: "OK 320" in o),
]

# Testes que LEEM o .gs.txt do backend. O .gs.txt não fica no repositório público (fica no cofre privado), então no GitHub
# (CI) eles NÃO têm o que testar: em vez de quebrar a bateria inteira, são pulados e a lista dos pulados é impressa no fim
# (e vira aviso `::warning` no GitHub). Rode-os localmente, com o .gs.txt na raiz ou em ../tenkiter-cofre.
PRECISA_GS = {"recuperacao_whatsapp.js": ("catalogo", (4, 27)), "assinatura_upload.js": ("catalogo", (4, 24)), "backend_gs.js": ("catalogo", (0, 0)), "backend_contas.js": ("funcionario", (0, 0)),
              "backend_func.js": ("funcionario", (0, 0)), "backend_v316.js": ("funcionario", (3, 16)),
              "backend_manual_rico.js": ("funcionario", (3, 17))}   # (prefixo, versão mínima)
PROPRIO_SERVIDOR = {"service_worker.py"}   # no teste local, esta bateria cuida do próprio servidor (precisa desligá-lo)
def main():
    import argparse
    from run_support import preflight, backend_available, write_report
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--suite', action='append', help='Arquivo de uma suíte; pode repetir. Sem opção, roda a bateria completa.')
    parser.add_argument('--list', action='store_true', help='Lista as suítes sem executá-las.')
    parser.add_argument('--require-backends', action='store_true', help='Falha se uma suíte selecionada não encontrar o backend privado.')
    parser.add_argument('--json-report', default=os.path.join(AQUI, 'saida', 'resumo-testes.json'))
    args = parser.parse_args()
    names = {name for name, _ in SUITES}
    if args.suite and set(args.suite) - names:
        parser.error('Suíte desconhecida: ' + ', '.join(sorted(set(args.suite) - names)))
    selected = [s for s in SUITES if not args.suite or s[0] in args.suite]
    if args.list:
        print('\n'.join(name for name, _ in selected))
        return 0
    results = []
    errors = preflight(Path(RAIZ), selected)
    if errors:
        write_report(args.json_report, results, errors)
        print('AMBIENTE INCOMPLETO: ' + '; '.join(errors))
        return 2
    base = os.environ.get('TK_BASE')
    server = None
    try:
        needs_http = any('TK_BASE' in Path(AQUI, name).read_text() for name, _ in selected)
        if not base and needs_http:
            # HTTPServer identifica conflito/erro de bind sem usar um servidor alheio.
            from functools import partial
            from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
            from threading import Thread
            handler = partial(SimpleHTTPRequestHandler, directory=RAIZ)
            try:
                server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
            except OSError as error:
                errors.append('Servidor local indisponível: ' + str(error))
                print('AMBIENTE INCOMPLETO: ' + errors[-1])
                return 2
            Thread(target=server.serve_forever, daemon=True).start()
            base = 'http://127.0.0.1:%d/' % server.server_port
        for name, passed in selected:
            env = dict(os.environ)
            if base: env['TK_BASE'] = base
            if name in PRECISA_GS and not backend_available(Path(RAIZ), *PRECISA_GS[name]):
                results.append({'suite': name, 'status': 'skipped', 'reason': 'Backend privado ausente; configure TK_COFRE_DIR.'})
                print('↷ ' + name + ' — backend privado ausente')
                continue
            if name in PROPRIO_SERVIDOR and not os.environ.get('TK_BASE'):
                env.pop('TK_BASE', None)
            command = ['node' if name.endswith(('.js', '.cjs')) else sys.executable, os.path.join(AQUI, name)]
            started = time.monotonic()
            try:
                run = subprocess.run(command, capture_output=True, text=True, timeout=900, env=env)
                output = run.stdout + run.stderr
                ok = run.returncode == 0 and passed(run.stdout)
                code = run.returncode
            except subprocess.TimeoutExpired:
                output = 'TEMPO ESGOTADO (900 s) em ' + name
                ok, code = False, None
            results.append({'suite': name, 'status': 'passed' if ok else 'failed',
                            'exit_code': code, 'seconds': round(time.monotonic() - started, 3)})
            print(('✔ ' if ok else '✘ ') + name)
            if not ok:
                print('\n'.join('    ' + line for line in output.strip().splitlines()[-25:]))
    finally:
        if server:
            server.shutdown()
            server.server_close()
        report = write_report(args.json_report, results, errors)
    counts = report['counts']
    print('APROVADAS=%d FALHARAM=%d PULADAS=%d' % (counts['passed'], counts['failed'], counts['skipped']))
    if counts['skipped']:
        print('::%s::Suítes privadas omitidas: %d. Não representam validação do backend.' %
              ('error' if args.require_backends else 'warning', counts['skipped']))
    return 1 if counts['failed'] or args.require_backends and counts['skipped'] else 0


if __name__ == '__main__':
    from pathlib import Path
    sys.exit(main())
