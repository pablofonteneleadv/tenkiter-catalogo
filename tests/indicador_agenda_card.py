# Regressão: indicador de agendamento no card da conversa (PR #309)
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ui = (ROOT / "admin-mensagens.js").read_text(encoding="utf-8")
worker = (ROOT / "instagram-worker" / "worker.js").read_text(encoding="utf-8")

def test_agenda_ativa_aparece_sem_remover_indicadores():
    assert "ms-agenda-indicador" in ui
    assert "'🕒'" in ui
    assert "Number(c.agenda_pendente) > 0" in ui
    assert "c.agenda_pendente || 0" in ui  # assinatura atualiza card quando agendamento muda
    assert "ms-dono-tag" in ui
    assert "ms-badge" in ui
    assert "ms-aguarda" in ui

def test_agenda_requer_permissao_e_status_pendente():
    assert "if (direitos.agenda && rs.results.length)" in worker
    assert "FROM msg_agenda WHERE status IN" in worker
    assert "pendente" in worker and "enviando" in worker
    assert "GROUP BY conversa_id" in worker
    assert "c.agenda_pendente = agenda ? Number(agenda.total) : 0" in worker
    assert "c.agenda_proxima = agenda ? agenda.proxima : ''" in worker

if __name__ == "__main__":
    test_agenda_ativa_aparece_sem_remover_indicadores()
    test_agenda_requer_permissao_e_status_pendente()
    print("Indicador de agenda: testes estáticos aprovados")
