"""Build a deployment ZIP without credentials, tests or generated user content."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import sys
root = Path(__file__).resolve().parent
out = Path(sys.argv[1]) if len(sys.argv)>1 else Path('/tmp/bridge-spaceweb.zip')
files = [root/'INSTALL.md']
files += [root/'bridge-app'/n for n in ['bootstrap.php','schema.sql','notify.php','config.example.php']]
files += [root/'public_html'/n for n in ['index.html','style.css','app.js','api.php','install.php','.htaccess']]
files += sorted((root/'public_html/assets').glob('*.webp'))
files += [root/'public_html/uploads/.htaccess']
assert all(p.is_file() for p in files)
with ZipFile(out,'w',ZIP_DEFLATED) as z:
 for p in files: z.write(p,p.relative_to(root))
with ZipFile(out) as z:
 assert z.testzip() is None
 assert not any(n.endswith('/bridge-config.php') or '/storage/' in n for n in z.namelist())
print(f'{out}: {len(files)} files, {out.stat().st_size} bytes')
