const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), cp = require('node:child_process');
for (const entry of ['index.html', 'agent.html']) test('单文件构建完整内嵌与精确CSP：' + entry, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'activity-offline-')), file = path.join(dir, 'offline.html');
  try {
    cp.execFileSync(process.execPath, [path.resolve(__dirname, '../tools/build-offline.cjs'), file, entry]);
    const html = fs.readFileSync(file, 'utf8'), scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert.equal(scripts.length, 5); for (const script of scripts) assert.ok(html.includes("'sha256-" + crypto.createHash('sha256').update(script).digest('base64') + "'"));
    assert.equal((html.match(/data:video\/webm;base64,/g) || []).length, 1); assert.ok(html.includes('data:application/zip;base64,')); assert.ok(html.includes('data:image/jpeg;base64,'));
    assert.ok(!/<script src=/.test(html)); assert.ok(!/href="assets\//.test(html)); assert.ok(!/src="assets\//.test(html)); assert.ok(!html.includes('href="agent.html"'));
    assert.equal(html.includes('data-entry="agent"'), entry === 'agent.html');
  } finally { if (fs.existsSync(file)) fs.unlinkSync(file); fs.rmdirSync(dir); }
});
