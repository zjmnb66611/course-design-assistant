from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parent.parent
source = root / 'agent-package/college-activity-planner'
core = (root / 'assets/activity-core.js').read_bytes()
destination = root / 'assets/activity-agent-package.zip'
metadata = {'name': 'college-activity-planner', 'version': '3.0.0', 'type': 'portable-skill-and-local-tools', 'coreSha256': hashlib.sha256(core).hexdigest(), 'teleAgentPlatformVerified': False, 'note': '本项目接入资料包，不是TeleAgent官方配置格式；目标客户端导入和绑定需实际验收。'}
with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as z:
    for file in source.rglob('*'):
        if file.is_file(): z.write(file, Path('college-activity-planner') / file.relative_to(source))
    z.writestr('college-activity-planner/scripts/activity-core.cjs', core)
    z.write(root / 'LICENSE', 'college-activity-planner/LICENSE')
    z.writestr('college-activity-planner/package-info.json', json.dumps(metadata, ensure_ascii=False, indent=2))
with zipfile.ZipFile(destination) as z:
    assert z.testzip() is None
print(json.dumps({'path': str(destination), 'bytes': destination.stat().st_size, 'coreSha256': metadata['coreSha256']}))
