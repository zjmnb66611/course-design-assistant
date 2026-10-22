/* 单次本机工具调用：仅 JSON 输入输出，不访问网络或写文件。 */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const bundled = path.join(__dirname, 'activity-core.cjs');
const C = require(fs.existsSync(bundled) ? bundled : path.resolve(__dirname, '../../../assets/activity-core.js'));
try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--input')) throw Error('仅支持标准输入，或 --input 明确指定的JSON文件');
  const fd = args.length ? fs.openSync(path.resolve(args[1]), 'r') : 0;
  const chunks = []; let length = 0;
  try { while (true) { const chunk = Buffer.alloc(65536), n = fs.readSync(fd, chunk, 0, chunk.length, null); if (!n) break; length += n; if (length > C.LIMITS.file) throw Error('请求超过1.5MB'); chunks.push(chunk.subarray(0, n)); } } finally { if (fd !== 0) fs.closeSync(fd); }
  const result = C.runTool(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
} catch (error) { process.stdout.write(JSON.stringify({ ok: false, error: error.message }) + '\n'); process.exitCode = 1; }
