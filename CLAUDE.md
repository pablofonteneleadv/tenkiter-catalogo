# TENKiTER — guia de trabalho

O estado atual e as instruções por setor ficam no Cofre privado:

[Fonte operacional](https://github.com/pablofonteneleadv/Tenkiter-cofre/blob/main/documentacao/operacao/INDEX.md) · [Regras](https://github.com/pablofonteneleadv/Tenkiter-cofre/blob/main/documentacao/operacao/REGRAS.md)

1. Leia o setor no índice privado antes de editar. Histórico não é lista de pendências.
2. A instrução atual do proprietário prevalece sobre documentos históricos.
3. Trabalhe em branch `ia/<assunto>-<AAAAMMDD>` e use PR revisável.
4. Faça merge/deploy somente dentro da autorização vigente do proprietário.
5. CI verde antes do merge; não contorne proteções.
6. Frontend e os três Workers publicam pelo `deploy.yml` no merge da `main`.
7. Confirme o término do workflow e o commit público em `/version.json`.
8. Apps Script permanece com publicação manual por Pablo.
9. Mantenha ponto de restauração e backup recuperável de código/dados.
10. Não publique `.gs.txt`, bancos, dados pessoais ou credenciais neste repositório.
11. Preserve funções e dados; não faça migração/exclusão como efeito de teste.
12. Teste o setor antes/depois com serviços simulados; bateria integral só sob pedido.
13. `common.js` define `API_URL` e `SITE_URL`; links compartilháveis usam `SITE_URL`.
14. Erros em português legível, sem JSON cru; não invente fatos da loja.
15. Janelas usam `TKCamadas`; imagens dinâmicas usam `atribSrc`.
16. Não confunda simulação com validação Android ou integração real.
17. Registre mudanças, testes, backup, deploy e pendências no log.
18. Toda mudança visual ou de comportamento da interface passa pela skill `.claude/skills/tenkiter-estetica-humana/SKILL.md`, com revisão mobile/desktop e evidência antes do merge.

[Histórico preservado](https://github.com/pablofonteneleadv/Tenkiter-cofre/blob/main/documentacao/operacao/HISTORICO.md) · [Acessos sem segredos](https://github.com/pablofonteneleadv/Tenkiter-cofre/blob/main/documentacao/operacao/ACESSOS.md)
