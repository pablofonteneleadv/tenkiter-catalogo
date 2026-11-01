"""Garante que o portão visual TENKiTER existe para Codex e Claude e não divergiu."""
from pathlib import Path

raiz = Path(__file__).resolve().parents[2]
codex = raiz / ".agents/skills/tenkiter-estetica-humana/SKILL.md"
claude = raiz / ".claude/skills/tenkiter-estetica-humana/SKILL.md"
agentes = raiz / "AGENTS.md"

erros = []
for arq in (codex, claude, agentes):
    if not arq.is_file():
        erros.append(f"arquivo obrigatório ausente: {arq.relative_to(raiz)}")

if codex.is_file() and claude.is_file() and codex.read_bytes() != claude.read_bytes():
    erros.append("as versões Codex e Claude da skill de estética estão diferentes")

# Referências também são instruções: um espelho desatualizado muda o comportamento da IA.
referencias = ("checklist.md", "fontes-e-criterios.md", "contrato-visual.md")
for nome in referencias:
    original = codex.parent / "references" / nome
    espelho = claude.parent / "references" / nome
    if not original.is_file() or not espelho.is_file():
        erros.append(f"referência visual obrigatória ausente: {nome}")
    elif original.read_bytes() != espelho.read_bytes():
        erros.append(f"referência visual divergiu entre Codex e Claude: {nome}")

if codex.is_file():
    texto = codex.read_text(encoding="utf-8")
    exigidos = ("Processo obrigatório", "Portões que reprovam", "Mobile", "Acessibilidade", "APROVADO", "Coerência com o produto existente", "Requisitos por área", "NÃO VALIDADO")
    for termo in exigidos:
        if termo.lower() not in texto.lower():
            erros.append(f"skill sem seção/critério obrigatório: {termo}")

if erros:
    raise SystemExit("\n".join(f"ERRO UX: {e}" for e in erros))
print("skill de estética humana: estrutura e espelhos OK")
