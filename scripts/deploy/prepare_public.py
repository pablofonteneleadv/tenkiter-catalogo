"""Prepara somente os arquivos explicitamente permitidos para o site estático."""
import json
from html.parser import HTMLParser
import posixpath
import shutil
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]


class PageAssets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.assets = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script' and attrs.get('src'):
            self.assets.append(attrs['src'])
        if tag == 'link' and 'stylesheet' in attrs.get('rel', '').split() and attrs.get('href'):
            self.assets.append(attrs['href'])


def verify_page_assets(output, files):
    """Falha antes da publicação se um HTML depender de JS/CSS local não permitido."""
    allowed, missing = set(files), []
    for name in files:
        if not name.endswith('.html'):
            continue
        page = PageAssets()
        page.feed((output / name).read_text(encoding='utf-8'))
        for asset in page.assets:
            url = urlsplit(asset)
            if url.scheme or url.netloc or not url.path:
                continue
            path = unquote(url.path)
            target = posixpath.normpath(path.lstrip('/') if path.startswith('/') else posixpath.join(posixpath.dirname(name), path))
            if target not in allowed:
                missing.append(name + ' -> ' + target)
    if missing:
        raise ValueError('Dependência local ausente da publicação: ' + '; '.join(sorted(set(missing))))


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
        verify_page_assets(temporary, files)
        if output.exists():
            shutil.rmtree(output)
        temporary.rename(output)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return output


if __name__ == '__main__':
    print('Diretório público preparado: ' + str(prepare()))
