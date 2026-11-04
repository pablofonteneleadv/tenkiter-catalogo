"""Entrada compatível: cabeçalhos do atualizador e segurança estática, sem sobrescrever regras."""
from render_headers import main
if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('::error::Cabeçalhos do Render não confirmados (' + type(error).__name__ + ').')
        raise SystemExit(1)
