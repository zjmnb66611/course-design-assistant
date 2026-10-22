from pathlib import Path
import hashlib
import json
import subprocess
import tempfile
import zipfile

root = Path(__file__).resolve().parent.parent
with zipfile.ZipFile(root / 'assets/activity-agent-package.zip') as archive:
    with tempfile.TemporaryDirectory(prefix='activity-agent-') as directory:
        folder = Path(directory).resolve()
        for name in archive.namelist():
            target = (folder / name).resolve()
            if not target.is_relative_to(folder): raise ValueError('包内路径越界')
        archive.extractall(folder)
        skill = folder / 'college-activity-planner'
        metadata = json.loads((skill / 'package-info.json').read_text('utf-8'))
        expected = hashlib.sha256((root / 'assets/activity-core.js').read_bytes()).hexdigest()
        assert metadata['coreSha256'] == expected
        assert hashlib.sha256((skill / 'scripts/activity-core.cjs').read_bytes()).hexdigest() == expected
        result = subprocess.run(['node', 'scripts/run-tool.cjs', '--input', 'examples/request.json'], cwd=skill, capture_output=True, text=True, encoding='utf-8', check=True)
        data = json.loads(result.stdout)
        assert data['ok'] and data['result']['totalCents'] == 264000
        assert metadata['teleAgentPlatformVerified'] is False
        assert (skill / 'LICENSE').is_file()
        assert (skill / 'SKILL.md').read_text('utf-8').startswith('---\nname: college-activity-planner')
        print(json.dumps({'passed': True, 'standaloneTool': True, 'totalCents': data['result']['totalCents'], 'sameCoreSha256': expected, 'platformVerified': False}))
