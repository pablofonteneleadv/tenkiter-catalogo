"""Contrato de onboarding Graphify; não avalia conteúdo de perguntas de atendentes."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
COMMAND = 'python3 scripts/graphify/manage.py'
ENTRYPOINTS = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md',
               '.cursor/rules/tenkiter-graphify.mdc']
for name in ENTRYPOINTS:
    text = (ROOT / name).read_text()
    assert COMMAND in text, name
skills = [ROOT / p / 'skills/graphify/SKILL.md' for p in ['.agents', '.claude', '.codex']]
assert len({p.read_bytes() for p in skills}) == 1, 'Perfis Graphify divergentes entre assistentes'
assert 'alwaysApply: true' in (ROOT / '.cursor/rules/tenkiter-graphify.mdc').read_text()
settings = json.loads((ROOT / '.claude/settings.json').read_text())
hooks = settings['hooks']
assert any('graphify-session.sh' in h['command'] for s in hooks['SessionStart'] for h in s['hooks'])
assert any('check-secrets.sh' in h['command'] for s in hooks['PreToolUse'] for h in s['hooks']), 'Hook de segredos deve permanecer'
assert 'graphify-out/' in (ROOT / '.gitignore').read_text()
assert 'Graphify' in (ROOT / '.github/pull_request_template.md').read_text()
assert COMMAND + ' start' in (ROOT / '.github/workflows/copilot-setup-steps.yml').read_text()
compile((ROOT / 'scripts/graphify/manage.py').read_text(), 'manage.py', 'exec')
print('Graphify: instruções, skills, início automático suportado e hook de segredos preservados.')
