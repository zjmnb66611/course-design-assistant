/* 可选 MCP stdio 适配器，不监听端口；由用户选定的智能体客户端按需调用。 */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const bundled = path.join(__dirname, 'activity-core.cjs');
const C = require(fs.existsSync(bundled) ? bundled : path.resolve(__dirname, '../../../assets/activity-core.js'));
const contract = require('../references/tools.schema.json');
const descriptions = { parse_brief: '提取校园活动条件、来源行与不确定项', draft_plan: '生成活动流程、相对执行节点与风险清单', suggest_budget: '生成明确标注占位假设的预算分配', analyze_budget: '按整数分核算计划、预备金、实支和资金缺口', review_activity: '检查预算、缺项与人工核对记录', knowledge_lookup: '查询本项目ACT工作流规则', build_report: '生成带原文与规则引用的策划报告' };
const tools = contract.oneOf.map(variant => ({ name: variant.properties.tool.const, description: descriptions[variant.properties.tool.const], inputSchema: { ...variant.properties.arguments, $defs: contract.$defs }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }));
function createHandler() {
  let phase = 'new';
  const versions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
  return request => {
    const rid = request && Object.hasOwn(request, 'id') ? request.id : null;
    const error = (code, message) => ({ jsonrpc: '2.0', id: rid, error: { code, message } });
    if (!request || typeof request !== 'object' || Array.isArray(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string') return error(-32600, '请求格式无效');
    const isRequest = Object.hasOwn(request, 'id');
    if (isRequest && !(rid === null || typeof rid === 'string' || (typeof rid === 'number' && Number.isFinite(rid)))) return { jsonrpc: '2.0', id: null, error: { code: -32600, message: '请求编号无效' } };
    if (!isRequest) { if (request.method === 'notifications/initialized' && phase === 'negotiated') phase = 'ready'; return null; }
    const ok = result => ({ jsonrpc: '2.0', id: rid, result });
    if (request.method === 'ping') return ok({});
    if (request.method === 'initialize') {
      if (phase !== 'new') return error(-32600, '连接已经初始化');
      const params = request.params;
      if (!params || typeof params.protocolVersion !== 'string' || !params.clientInfo || typeof params.clientInfo.name !== 'string' || !params.capabilities || typeof params.capabilities !== 'object') return error(-32602, '初始化参数缺失');
      phase = 'negotiated';
      return ok({ protocolVersion: versions.includes(params.protocolVersion) ? params.protocolVersion : versions[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'college-activity-planner', version: C.VERSION }, instructions: '工具仅计算和生成草案，不执行采购、付款或审批。金额返回整数分，估价和待确认资金必须保留标记。' });
    }
    if (phase !== 'ready') return error(-32000, '请先完成初始化握手');
    if (request.method === 'tools/list') return ok({ tools });
    if (request.method === 'tools/call') {
      const params = request.params;
      if (!params || !Object.hasOwn(descriptions, params.name)) return error(-32602, '工具名称无效');
      try { const result = C.runTool({ tool: params.name, arguments: params.arguments }); return ok({ content: [{ type: 'text', text: JSON.stringify(result) }], isError: false }); }
      catch (e) { return ok({ content: [{ type: 'text', text: e.message }], isError: true }); }
    }
    return error(-32601, '不支持该方法');
  };
}
module.exports = { createHandler };
if (require.main === module) {
  const handle = createHandler(); let buffer = '';
  const write = value => { if (value) process.stdout.write(JSON.stringify(value) + '\n'); };
  function processLine(line) {
    if (!line.trim()) return;
    if (Buffer.byteLength(line, 'utf8') > C.LIMITS.file) { write({ jsonrpc: '2.0', id: null, error: { code: -32600, message: '消息超过1.5MB' } }); return; }
    try { write(handle(JSON.parse(line))); } catch (_) { write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON解析失败' } }); }
  }
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { buffer += chunk; let index; while ((index = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, index); buffer = buffer.slice(index + 1); processLine(line); } if (Buffer.byteLength(buffer, 'utf8') > C.LIMITS.file) { buffer = ''; process.stdin.destroy(); process.exitCode = 1; } });
  process.stdin.on('end', () => { if (buffer.trim()) processLine(buffer); });
}
