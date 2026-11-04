"""Prepara somente os arquivos explicitamente permitidos para o site estático."""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def prepare(root=ROOT):
    root = Path(root).resolve()
    files = json.loads((root / 'scripts/deploy/public-files.json').read_text())
    if not files or len(files) != len(set(files)):
        raise ValueError('Lista pública vazia ou duplicada.')
    output = root / '.public-site'
    temporary = root / '.public-site-next'
    if output.is_symlink() or temporary.is_symlink():
        raise ValueError('Diretório público não pode ser link simbólico.')
    if temporary.exists():
        shutil.rmtree(temporary)
    temporary.mkdir()
    try:
        for name in files:
            relative = Path(name)
            if relative.is_absolute() or '..' in relative.parts or any(p.startswith('.') for p in relative.parts):
                raise ValueError('Caminho público inválido.')
            source = root / relative
            if source.is_symlink() or not source.resolve().is_relative_to(root):
                raise ValueError('Arquivo público não pode escapar do checkout.')
            if not source.is_file():
                raise ValueError('Arquivo público ausente: ' + name)
            target = temporary / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        if output.exists():
            shutil.rmtree(output)
        temporary.rename(output)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return output


if __name__ == '__main__':
    print('Diretório público preparado: ' + str(prepare()))
