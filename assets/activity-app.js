/* 活动业务界面；沿用现有工作台、六步导航与展示样式。 */
'use strict';
var AC = ActivityCore;
var project = AC.empty(), currentStep = 1, reportText = '', previousProject = null, evidence = [], rowEdit = null, intakeDirty = false, projectRevision = 0;
var STEPS = ['说说活动', '确认需求', '策划方案', '预算核算', '执行清单', '导出交付'];
var $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
var esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
var basicConfig = [
  ['title', '活动名称', 'text'], ['kind', '活动类型', AC.KINDS], ['customKind', '自定义活动类型', 'text'], ['people', '预计人数', 'number'], ['budget', '预算上限 / 元', 'number'],
  ['date', '活动日期', 'date'], ['time', '开始时间（可选）', 'time'], ['duration', '活动时长 / 分钟', 'number'], ['venue', '活动地点', 'text'], ['organizer', '主办单位', 'text'], ['goal', '希望达到什么效果', 'textarea']
];
function notify(kind, text) { const e = $('#globalMsg'); e.className = 'msg show ' + kind; e.textContent = text; }
function localMessage(selector, text, kind = 'warn') { const e = $(selector); e.className = text ? 'msg show ' + kind : ''; e.textContent = text; }
function calc() { return AC.analyze(project); }
function updateWorkspace() {
  $('#progressLabel').innerHTML = String(currentStep).padStart(2, '0') + ' <small>/ 06</small>';
  $('#progressFill').style.width = (currentStep / 6 * 100) + '%'; $('#progressHint').textContent = STEPS[currentStep - 1];
  $('#workspaceStatus').textContent = project.items.length ? '预算已同步核算' : project.raw ? '需求待核对' : '准备开始';
  $('#scenarioCount').textContent = project.scenarios.length + ' / 4'; $('#charCount').textContent = $('#taskText').value.length + ' 字';
}
function commit(next, message = '', reset = false) {
  try {
    if (reset) next.approvals = { venue: false, finance: false, safety: false, team: false };
    const clean = AC.normalize(next);
    if (new TextEncoder().encode(JSON.stringify(clean)).length > AC.LIMITS.file) throw Error('项目超过 1.5 MB，请精简原文或明细');
    AC.analyze(clean); cancelFileReads(); previousProject = structuredClone(project); project = clean; projectRevision++; reportText = '';
    invalidateAgentState();
    $('#reportArea').textContent = '输入已更新，请重新生成报告。'; if (typeof scheduleDraft === 'function') scheduleDraft(); updateWorkspace();
    if (message) notify('ok', message); return true;
  } catch (e) { notify('err', e.message); return false; }
}
function mutate(fn, message = '', reset = false) { const next = structuredClone(project); fn(next); return commit(next, message, reset); }
function fieldHTML(key, title, type, value, prefix = 'b_') {
  const input = Array.isArray(type) ? `<select id="${prefix}${key}">${type.map(v => `<option value="${esc(typeof v === 'string' ? v : v[0])}">${esc(typeof v === 'string' ? v : v[1])}</option>`).join('')}</select>` : type === 'textarea' ? `<textarea id="${prefix}${key}" rows="3" maxlength="1500">${esc(value)}</textarea>` : `<input id="${prefix}${key}" type="${type}" ${type === 'number' ? 'step="any"' : ''} maxlength="500" value="${esc(value)}">`;
  return `<label class="fld"><span class="t">${esc(title)}</span>${input}${prefix === 'b_' ? `<span class="src" id="src_${key}"></span>` : ''}</label>`;
}
function fillBasic() {
  $('#basicFields').innerHTML = basicConfig.map(([k, title, type]) => fieldHTML(k, title, type, project.basic[k])).join('');
  for (const [key] of basicConfig) {
    $('#b_' + key).value = project.basic[key];
    const item = evidence.find(e => e.field === key); $('#src_' + key).textContent = item && String(project.basic[key]) === String(item.value) ? `原文第 ${item.line} 行：${item.raw}` : '';
  }
  $('#b_customKind').maxLength = 80; $('#b_customKind').placeholder = '例如：校园市集、读书沙龙、作品展'; syncKindField();
  if (!$('#src_duration').textContent) $('#src_duration').textContent = '未填时先按120分钟排布，请按实际确认。';
}
function syncKindField() { $('#b_customKind').closest('.fld').hidden = $('#b_kind').value !== '自定义'; }
function readBasic() { const b = {}; for (const [key] of basicConfig) b[key] = $('#b_' + key).value.trim(); return b; }
function saveBasic() {
  for (const [key, title] of basicConfig) { const input = $('#b_' + key); if (input.validity && input.validity.badInput) { const text = title + '格式未填写完整，请检查后再继续'; localMessage('#basicError', text, 'err'); notify('err', text); return false; } }
  const next = structuredClone(project); next.basic = readBasic();
  if (JSON.stringify(next.basic) === JSON.stringify(project.basic)) { localMessage('#basicError', ''); return true; }
  if (!commit(next, '', true)) return false; localMessage('#basicError', ''); return true;
}
function showStep(n, keep = false) {
  n = Math.max(1, Math.min(6, Number(n) || 1));
  if (n > 2 && intakeDirty) { notify('warn', '需求输入已更改，请先点击“开始整理”，再核对活动条件。'); return; }
  if (currentStep === 2 && !$('#sec2').hidden && n !== 2 && !saveBasic()) return;
  currentStep = n; delete document.documentElement.dataset.tool; document.documentElement.dataset.step = String(n);
  $('#guideVideo').pause();
  for (let i = 1; i <= 6; i++) { $('#sec' + i).hidden = i !== n; const tab = $('#tab' + i); tab.classList.toggle('active', i === n); tab.classList.toggle('done', i < n); if (i === n) tab.setAttribute('aria-current', 'step'); else tab.removeAttribute('aria-current'); }
  for (const id of ['comparePanel', 'knowledgePanel', 'guidePanel', 'agentPanel']) $('#' + id).hidden = true;
  if (n === 2) fillBasic(); else if (n === 3) renderPlan(); else if (n === 4) renderBudget(); else if (n === 5) renderTasks();
  updateWorkspace(); if (!keep && window.CourseEffects) CourseEffects.enter($('#sec' + n));
  if (!keep) window.scrollTo({ top: 0, behavior: document.documentElement.dataset.motion === 'off' ? 'instant' : 'smooth' });
}
function openPanel(id) {
  if (currentStep === 2 && !$('#sec2').hidden && !saveBasic()) return;
  if (id !== 'guidePanel') $('#guideVideo').pause();
  for (let i = 1; i <= 6; i++) $('#sec' + i).hidden = true;
  for (const name of ['comparePanel', 'knowledgePanel', 'guidePanel', 'agentPanel']) $('#' + name).hidden = id !== name;
  document.documentElement.dataset.tool = id; if (window.CourseEffects) CourseEffects.enter($('#' + id)); window.scrollTo({ top: 0, behavior: 'instant' });
}
function switchTaskTab(which) { $('#panePaste').hidden = which !== 'paste'; $('#paneFile').hidden = which !== 'file'; $('#tabPaste').classList.toggle('active', which === 'paste'); $('#tabFile').classList.toggle('active', which === 'file'); }
function parseTask() {
  try {
    const parsed = AC.parseBrief($('#taskText').value); let next = structuredClone(project);
    if (parsed.patch.title && project.basic.title && parsed.patch.title !== project.basic.title && (project.items.length || project.tasks.length)) {
      if (!confirm('识别到不同的活动名称。是否作为新活动整理？当前预算、分工和资金来源将清空，可撤销上次修改。建议先保存项目。')) return;
      next = AC.empty();
    }
    next.raw = parsed.raw; next.basic = { ...next.basic, ...parsed.patch }; if (parsed.patch.title) next.name = parsed.patch.title;
    if (!commit(next, '', true)) return;
    intakeDirty = false; evidence = parsed.evidence.map(e => ({ ...e, value: parsed.patch[e.field] })); $('#projectName').value = project.name;
    const missing = AC.missing(project), count = Object.keys(parsed.patch).length;
    const heading = !missing.length ? '活动条件已填写' : count ? `识别到 ${count} 项条件` : '先补充活动条件';
    const detail = !count ? '未识别到新的条件，原文已保留。' + (missing.length ? '点击核对需求后填写即可。' : '请核对后继续。') : missing.length ? '还需确认：' + missing.map(x => x.label).join('、') : '请核对后继续生成策划草案。';
    $('#parseResult').innerHTML = `<div class="quickstart"><div><b>${esc(heading)}</b><p>${esc(detail)}</p></div><button class="btn btn-primary btn-sm" data-action="manualEntry">核对需求</button></div>`;
    localMessage('#parseMsg', parsed.warnings.join('；') || '请核对识别结果；原文已保留。', parsed.warnings.length ? 'warn' : 'ok');
  } catch (e) { localMessage('#parseMsg', e.message, 'err'); }
}
function quickDemo() {
  if ((project.raw || project.items.length) && !confirm('载入教学示例将替换当前活动，建议先保存项目。是否继续？')) return;
  const next = AC.empty(); next.name = '学院迎新交流活动（示例）'; next.raw = '活动名称：学院迎新交流活动\n预计120人，预算3000元。\n活动日期：2026年11月8日\n地点：学院多功能厅\n主办：学院学生会';
  next.basic = { ...next.basic, title: '学院迎新交流活动（示例）', kind: '迎新团建', people: '120', budget: '3000', date: '2026-11-08', time: '14:00', duration: '120', venue: '学院多功能厅（示例，待确认）', goal: '帮助新生认识学院资源，完成分组交流并收集反馈。', organizer: '学院学生会（示例）' };
  next.items = AC.suggestBudget(next); next.tasks = AC.draftPlan(next).tasks; next.funding = [{ id: AC.uid(), name: '拟申请学院经费（示例）', amount: '3000', status: 'pending', source: '教学示例，尚未确认' }];
  if (commit(next, '已载入示例，价格和经费均需按实际核对')) { intakeDirty = false; $('#taskText').value = project.raw; $('#projectName').value = project.name; evidence = []; showStep(2); }
}
function renderPlan() {
  const plan = AC.draftPlan(project);
  $('#planOverview').innerHTML = `<div class="quickstart"><div><b>${esc(plan.title)}</b><p>${esc(plan.objective)}${project.basic.duration ? '' : ' · 时长未填，暂按120分钟排布，请确认。'}</p></div><span class="tag ${plan.missing.length ? 'warn' : 'info'}">${plan.missing.length ? plan.missing.length + ' 项待补充' : '条件已填写'}</span></div>`;
  $('#agendaList').innerHTML = plan.agenda.map(a => `<article><b>${a.startMinute}–${a.startMinute + a.minutes} 分钟 · ${esc(a.title)}</b><small>${esc(a.owner)}</small></article>`).join('');
  $('#planRisks').innerHTML = [...plan.risks, ...plan.missing.map(x => x.label + '待确认')].map(t => `<p class="hint">${esc(t)}</p>`).join('');
}
function generatePlan() { if (!saveBasic()) return; showStep(3); }
function renderBudget() {
  const a = AC.analyze(project); $('#reservePercent').value = project.reservePercent;
  $('#budgetRows').innerHTML = a.lines.map(i => `<tr><td><b>${esc(i.label)}</b><small>${esc(i.category)}</small></td><td>${esc(i.quantity)} ${esc(i.unit)}</td><td>${esc(i.unitPrice)}</td><td>${AC.money(i.subtotalCents)}</td><td>${i.actual === '' ? '未核销' : esc(i.actual)}</td><td>${i.quote === 'quoted' ? '已询价' : '估算待询价'}<small>${esc(i.source || '来源待补充')}</small></td><td><button class="text-btn" data-action="editItem" data-arg="${i.id}">编辑</button><button class="text-btn danger-text" data-action="deleteItem" data-arg="${i.id}">删除</button></td></tr>`).join('') || '<tr><td colspan="7">先生成预算初稿，或添加已询价的明细。</td></tr>';
  const kpis = [['计划总额 / 元', AC.money(a.totalCents), false], ['预算结余 / 元', a.balanceCents === null ? '待确认' : AC.money(a.balanceCents), a.overBudget], ['人均计划 / 元', a.perPersonCents === null ? '待确认' : AC.money(a.perPersonCents), false], ['预备金 / 元', AC.money(a.reserveCents), false], ['资金缺口 / 元', AC.money(a.fundingGapCents), a.fundingGapCents > 0], ['已登记实支 / 元', `${AC.money(a.actualCents)}（${a.unreconciled}项待核销）`, false]];
  $('#budgetSummary').innerHTML = kpis.map(([k, v, bad]) => `<div class="kpi"><div class="k">${k}</div><div class="v ${bad ? 'bad' : ''}">${esc(v)}</div></div>`).join('');
  $('#budgetWarnings').innerHTML = `<p class="hint">小计 ${AC.money(a.subtotalCents)} 元 + 预备金 ${AC.money(a.reserveCents)} 元 = 计划总额 ${AC.money(a.totalCents)} 元。待确认资金 ${AC.money(a.pendingCents)} 元未计入已确认资金。</p>` + (a.overBudget ? '<div class="msg err show">计划超过预算上限，请调整明细或重新确认上限。</div>' : '') + (project.items.some(i => i.quote === 'estimate') ? '<div class="msg warn show">部分金额仍是估算，请按实际询价修改。预备金单独列出，不计入已登记实支。</div>' : '') + `<div class="activity-bars">${Object.entries(a.categories).map(([category, value]) => `<label>${esc(category)}<progress value="${value}" max="${Math.max(a.subtotalCents, 1)}"></progress><span>${AC.money(value)} 元</span></label>`).join('')}</div>`;
  if (a.ceilingCents !== null && a.actualCents > a.ceilingCents) $('#budgetWarnings').insertAdjacentHTML('beforeend', '<div class="msg err show">已登记实际支出已超过预算上限 ' + AC.money(a.actualCents - a.ceilingCents) + ' 元，请核对实支与经费安排。</div>');
  if (a.actualVarianceCents !== null) $('#budgetWarnings').insertAdjacentHTML('beforeend', '<p class="hint">已登记实支 − 明细预算（不含预备金，正数表示超出）：' + AC.money(a.actualVarianceCents) + ' 元。</p>');
  $('#fundingRows').innerHTML = project.funding.map(f => `<div class="activity-funding"><div><b>${esc(f.name)} · ${esc(f.amount)} 元</b><p>${f.status === 'confirmed' ? '已确认' : '待确认，暂不计入'} · ${esc(f.source || '来源待补充')}</p></div><div><button class="text-btn" data-action="editFunding" data-arg="${f.id}">编辑</button><button class="text-btn danger-text" data-action="deleteFunding" data-arg="${f.id}">删除</button></div></div>`).join('') || '<p class="hint">尚未登记资金来源。</p>';
}
function suggestBudget(lean = false) {
  if (project.items.length && !confirm('预算初稿会替换当前明细和实支记录。请先保存对比方案或下载项目备份，是否继续？')) return;
  try { if (mutate(p => { p.items = AC.suggestBudget(p, lean); p.approvals.finance = false; }, '已生成预算初稿，请按实际询价调整金额')) { renderBudget(); showStep(4, true); } } catch (e) { notify('err', e.message); }
}
var rowConfigs = {
  item: [['label', '预算项目名称', 'text'], ['category', '支出类别', AC.CATEGORIES], ['quantity', '数量（最多3位小数）', 'number'], ['unit', '单位', 'text'], ['unitPrice', '单价 / 元', 'number'], ['actual', '实际支出 / 元（空白表示未核销）', 'number'], ['quote', '价格状态', [['estimate', '估算待询价'], ['quoted', '已询价']]], ['source', '询价或分配依据', 'textarea'], ['note', '备注', 'textarea']],
  funding: [['name', '资金来源名称', 'text'], ['amount', '金额 / 元', 'number'], ['status', '确认状态', [['pending', '待确认'], ['confirmed', '已确认']]], ['source', '确认依据或说明', 'textarea']],
  task: [['title', '执行任务', 'text'], ['owner', '负责人或小组', 'text'], ['offset', '距活动日几天（提前7天填负7）', 'number'], ['status', '状态', [['todo', '待办'], ['doing', '进行中'], ['done', '已完成']]], ['note', '具体要求', 'textarea']]
};
function openRow(type, rid = null) {
  const list = type === 'item' ? project.items : type === 'funding' ? project.funding : project.tasks;
  const defaults = type === 'item' ? { id: AC.uid(), label: '', category: '活动物料', quantity: '1', unit: '份', unitPrice: '0', actual: '', quote: 'estimate', source: '', note: '' } : type === 'funding' ? { id: AC.uid(), name: '', amount: '0', status: 'pending', source: '' } : { id: AC.uid(), title: '', owner: '', offset: 0, status: 'todo', note: '' };
  const value = rid ? list.find(x => x.id === rid) : defaults; if (!value) return;
  rowEdit = { type, id: value.id, existing: !!rid };
  $('#rowDialogTitle').textContent = (rid ? '编辑' : '添加') + ({ item: '预算明细', funding: '资金来源', task: '执行任务' })[type];
  $('#rowFields').innerHTML = rowConfigs[type].map(([k, label, input]) => fieldHTML(k, label, input, String(value[k]), 'edit_')).join('');
  for (const [key] of rowConfigs[type]) $('#edit_' + key).value = value[key];
  localMessage('#rowError', ''); $('#rowDialog').showModal();
}
function saveRow(event) {
  event.preventDefault(); if (!rowEdit) return;
  for (const [key, title] of rowConfigs[rowEdit.type]) { const input = $('#edit_' + key); if (input.validity && input.validity.badInput) { $('#rowError').textContent = title + '格式未填写完整，请检查后再保存'; return; } }
  const row = { id: rowEdit.id }; for (const [key] of rowConfigs[rowEdit.type]) row[key] = $('#edit_' + key).value.trim();
  if (rowEdit.type === 'task') row.offset = Number(row.offset);
  const next = structuredClone(project), list = rowEdit.type === 'item' ? next.items : rowEdit.type === 'funding' ? next.funding : next.tasks, index = list.findIndex(x => x.id === row.id);
  if (index >= 0) list[index] = row; else list.push(row);
  if (rowEdit.type !== 'task') next.approvals.finance = false; else next.approvals.team = false;
  try { AC.normalize(next); AC.analyze(next); if (commit(next, '记录已保存，相关金额已重算')) { $('#rowDialog').close(); if (currentStep === 4) renderBudget(); else renderTasks(); } } catch (e) { localMessage('#rowError', e.message, 'err'); }
}
function removeRow(type, rid) {
  if (!confirm('删除这条记录？可撤销上一次修改。')) return;
  const key = type === 'item' ? 'items' : type === 'funding' ? 'funding' : 'tasks';
  if (mutate(p => { p[key] = p[key].filter(x => x.id !== rid); if (type !== 'task') p.approvals.finance = false; else p.approvals.team = false; }, '记录已删除')) { if (currentStep === 4) renderBudget(); else renderTasks(); }
}
function generateTasks() {
  if (project.tasks.length && !confirm('重新生成会替换现有任务、分工和进度，是否继续？')) return;
  if (mutate(p => { p.tasks = AC.draftPlan(p).tasks; p.approvals.team = false; }, '已生成建议清单，请核对负责人和任务日期')) showStep(5);
}
function renderTasks() {
  $('#taskRows').innerHTML = project.tasks.map(t => `<article class="activity-task"><div><b>${esc(t.title)}</b><p>${AC.taskDate(project, t) || '日期待定'} · ${t.offset === 0 ? '活动当日' : t.offset < 0 ? '提前' + -t.offset + '天' : '活动后' + t.offset + '天'} · ${esc(t.owner || '负责人待定')}</p><p>${esc(t.note)}</p></div><div class="task-controls"><select data-task-status="${t.id}" aria-label="${esc(t.title)}的状态"><option value="todo">待办</option><option value="doing">进行中</option><option value="done">已完成</option></select><button class="text-btn" data-action="editTask" data-arg="${t.id}">编辑</button><button class="text-btn danger-text" data-action="deleteTask" data-arg="${t.id}">删除</button></div></article>`).join('') || '<p class="hint">先生成建议清单，或手动添加任务。</p>';
  for (const t of project.tasks) $(`[data-task-status="${t.id}"]`).value = t.status;
  $('#approvalList').innerHTML = Object.entries({ venue: '场地、设备与容纳人数', finance: '经费来源、询价和报销要求', safety: '现场分工、备选安排和审批流程', team: '负责人和执行时间' }).map(([key, text]) => `<label><input type="checkbox" data-approval="${key}" ${project.approvals[key] ? 'checked' : ''}>${text}</label>`).join('');
}
function buildReport() { if (!ensureCurrent()) return false; reportText = AC.report(project); $('#reportArea').textContent = reportText; $('#reviewList').innerHTML = AC.review(project).map(r => `<div class="check-item ${r.level === '需调整' ? 'fail' : ''}"><span class="tag warn">${esc(r.level)}</span><span>${esc(r.text)} [${esc(r.reference)}]</span></div>`).join(''); showStep(6); return true; }
function addScenario() {
  if (project.scenarios.length >= 4) return notify('warn', '最多保存4项，可先删除不需要的方案');
  const name = prompt('给这个方案起个名字', '方案 ' + (project.scenarios.length + 1)); if (name === null) return;
  if (mutate(p => { p.scenarios.push({ name: name.trim().slice(0, 60) || '未命名方案', raw: p.raw, basic: structuredClone(p.basic), items: structuredClone(p.items), funding: structuredClone(p.funding), reservePercent: p.reservePercent }); }, '方案已保存，可在侧栏对比')) renderComparison();
}
function renderComparison() {
  $('#scenarioList').innerHTML = project.scenarios.map((s, index) => { const p = { ...project, ...s, scenarios: [] }, a = AC.analyze(p); return `<article class="activity-scenario"><div><h3>${esc(s.name)}</h3><p class="hint">${esc(s.basic.people || '?')}人 · 计划 ${AC.money(a.totalCents)} 元 · ${a.overBudget ? '超出上限' : a.overBudget === null ? '上限待确认' : '未超上限'} · 资金缺口 ${AC.money(a.fundingGapCents)} 元</p></div><div class="btn-row"><button class="btn btn-ghost btn-sm" data-action="loadScenario" data-arg="${index}">载入</button><button class="btn btn-danger btn-sm" data-action="removeScenario" data-arg="${index}">删除</button></div></article>`; }).join('') || '<p class="hint">在预算页保存方案后，可在这里比较。</p>';
}
function openCompare() { renderComparison(); openPanel('comparePanel'); }
function openKnowledge() { $('#knowledgeList').innerHTML = AC.KB.map(k => `<article class="activity-knowledge"><h3>[${k.id}] ${esc(k.title)}</h3><p>${esc(k.text)}</p><p>来源：${esc(k.source)}</p></article>`).join(''); openPanel('knowledgePanel'); }
function undo() { if (!previousProject) return notify('warn', '没有可撤销的修改'); if (intakeDirty && !confirm('撤销将恢复上次活动记录及原文，当前未整理输入会被替换。是否继续？')) return; const saved = previousProject; if (commit(saved, '已撤销上一次修改')) { previousProject = null; intakeDirty = false; evidence = []; $('#parseResult').replaceChildren(); $('#taskText').value = project.raw; $('#projectName').value = project.name; showStep(currentStep, true); } }
// 独立助手仅在内存中保存对话，所有建议均需明确应用。
var agentContext = null, agentProposal = null, agentWaiting = '', agentHistory = [], agentCalls = [], agentRevision = -1, agentLastReply = '';
function invalidateAgentState() { agentProposal = null; agentContext = null; agentRevision = -1; agentWaiting = ''; $('#applyAgent').disabled = true; $('#agentProposal').hidden = true; }
function agentMessage(role, text) {
  const node = document.createElement('div'), title = document.createElement('strong');
  node.className = 'agent-message ' + role; title.textContent = role === 'user' ? '你' : '策划助手';
  node.append(title, document.createTextNode(text)); $('#agentMessages').append(node);
  while ($('#agentMessages').children.length > 40) $('#agentMessages').firstChild.remove();
  $('#agentMessages').scrollTop = $('#agentMessages').scrollHeight;
  if (role !== 'user') { agentLastReply = text; if ($('#exportAgentReply')) $('#exportAgentReply').disabled = false; }
}
function refreshAgentContext() {
  if (!agentContext || agentRevision !== projectRevision) {
    agentContext = structuredClone(project); agentRevision = projectRevision; agentProposal = null; agentWaiting = ''; $('#applyAgent').disabled = true;
  }
  renderAgentState();
}
function agentChanges(proposal) {
  const changes = [], labels = Object.fromEntries(basicConfig.map(([key, label]) => [key, label]));
  for (const [key, value] of Object.entries(proposal.basic)) if (value !== project.basic[key]) changes.push(`${labels[key] || key}：${project.basic[key] || '未填写'} → ${value || '待确认'}`);
  if (proposal.name !== project.name) changes.push(`项目名称：${project.name} → ${proposal.name}`);
  if (JSON.stringify(proposal.items) !== JSON.stringify(project.items)) changes.push(`预算明细：${project.items.length} 项 → ${proposal.items.length} 项；计划总额 ${AC.money(AC.analyze(proposal).totalCents)} 元`);
  if (JSON.stringify(proposal.tasks) !== JSON.stringify(project.tasks)) changes.push(`执行清单：${project.tasks.length} 项 → ${proposal.tasks.length} 项`);
  if (project.tasks.length && JSON.stringify(proposal.tasks) !== JSON.stringify(project.tasks)) changes.push('替换执行清单会同时替换负责人、备注和完成进度，请先下载项目备份。');
  if (JSON.stringify(proposal.funding) !== JSON.stringify(project.funding)) changes.push('资金来源将随新活动重新整理');
  if (project.items.some(i => i.actual !== '') && JSON.stringify(proposal.items) !== JSON.stringify(project.items)) changes.push('当前已有实际支出记录；替换预算会同时替换这些记录，请先下载项目备份。');
  if (Object.values(project.approvals).some(Boolean)) changes.push('应用建议后，场地、经费、现场安排和团队分工的核对记录需要重新确认。');
  return changes.length ? changes : ['活动条件和预算没有变化，应用后仅更新本次需求记录。'];
}
function renderAgentState() {
  if (!$('#agentContext')) return;
  const p = agentContext || project, b = p.basic;
  const scope = agentProposal ? '待应用建议' : JSON.stringify(b) !== JSON.stringify(project.basic) ? '正在整理（未应用）' : '当前活动';
  $('#agentContext').textContent = `${scope}：${b.title || '未命名'} · ${AC.kindLabel(b)} · ${b.people ? b.people + '人' : '人数待定'} · ${b.budget ? '预算' + b.budget + '元' : '预算待定'}`;
  $('#agentProposal').hidden = !agentProposal;
  $('#applyAgent').disabled = !agentProposal;
  if (agentProposal) {
    $('#agentChanges').replaceChildren(...agentChanges(agentProposal).map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  }
}
function openAgent() {
  refreshAgentContext();
  if (intakeDirty && $('#taskText').value.trim()) $('#agentInput').value = $('#taskText').value;
  openPanel('agentPanel');
  if (!$('#agentMessages').children.length) agentMessage('assistant', '想办什么活动？人数和预算还没定，也能先开始。我能帮你整理方案、查预算、列分工或写通知；应用建议前会先让你确认。');
}
function agentTool(tool, args, summary) {
  const start = performance.now();
  try {
    const result = AC.runTool({ tool, arguments: args }); agentCalls.push({ tool, summary, elapsedMs: +(performance.now() - start).toFixed(2), status: 'completed' }); return result;
  } catch (error) { agentCalls.push({ tool, summary, elapsedMs: +(performance.now() - start).toFixed(2), status: 'failed' }); throw error; }
  finally { agentCalls = agentCalls.slice(-40); $('#agentTrace').textContent = agentCalls.map((x, i) => `${i + 1}. ${x.tool} · ${x.summary} · ${x.elapsedMs}ms · ${x.status === 'completed' ? '已执行' : '未完成'}`).join('\n'); }
}
function agentIntent(text) {
  if (/怎么用|能做什么|如何使用|帮助|^你好[！!。\s]*$/.test(text)) return 'help';
  if (/通知|招募|宣传文案/.test(text)) return 'notice';
  if (/超支|超预算/.test(text)) return 'budget';
  if (/规则|为什么|什么意思|怎么算|如何报销|怎么报销|区别/.test(text)) return 'knowledge';
  if (/节约|节省|省钱|压缩|降低|降到|压到/.test(text)) return 'lean';
  if (/分工|清单|任务|进度/.test(text)) return /生成|重新|安排|创建|列/.test(text) ? 'tasks' : 'progress';
  if (/检查|核对|看看|缺项|风险|缺口|超支|超预算/.test(text)) return /预算|经费|资金|花费|超支|超预算/.test(text) ? 'budget' : 'review';
  if (/策划|方案|流程|计划|举办|想办|组织/.test(text)) return 'plan';
  return 'update';
}
function agentBudgetReply(p) {
  const a = agentTool('analyze_budget', { project: p }, '核对现有明细与资金');
  const lines = [agentProposal ? '以下按尚未应用的建议检查。' : JSON.stringify(p.basic) !== JSON.stringify(project.basic) ? '以下按本轮提供的条件检查，尚未写入当前活动。' : '按当前记录检查，明细保持不变。'];
  if (!p.items.length) lines.push('还没有预算明细，暂时无法判断活动要花多少。可以先添加询价记录，或让我生成预算初稿。');
  else lines.push(`明细 ${AC.money(a.subtotalCents)} 元，预备金 ${AC.money(a.reserveCents)} 元，计划合计 ${AC.money(a.totalCents)} 元。`);
  lines.push(a.ceilingCents === null ? '预算上限还没确定。' : `预算上限 ${AC.money(a.ceilingCents)} 元；${a.overBudget ? '超过上限，需要调整 ' + AC.money(-a.balanceCents) + ' 元' : p.items.length ? '当前未超上限' : '有明细后再比较是否超支'}。`);
  lines.push(`已确认资金 ${AC.money(a.confirmedCents)} 元，待确认 ${AC.money(a.pendingCents)} 元；${p.items.length ? '缺口 ' + AC.money(a.fundingGapCents) + ' 元' : '资金缺口待预算明细确定后计算'}。资金状态按你填写的记录计算。[ACT-03]`);
  if (p.items.length) lines.push(`已登记实支 ${AC.money(a.actualCents)} 元，另有 ${a.unreconciled} 项未登记实支。[ACT-05]`);
  if (a.ceilingCents !== null && a.actualCents > a.ceilingCents) lines.push('已登记的实际支出也超过预算上限，请单独核对。');
  if (p.items.some(i => i.quote === 'estimate')) lines.push('部分金额仍是估算，请用询价结果核对。[ACT-02]');
  return lines.join('\n');
}
function agentTaskReply(text, parsed) {
  let next = structuredClone(agentContext || project);
  const switched = !!(parsed.patch.title && next.basic.title && parsed.patch.title !== next.basic.title);
  if (switched) next = AC.empty();
  next.basic = { ...next.basic, ...parsed.patch }; if (parsed.patch.title) next.name = parsed.patch.title;
  const changed = Object.keys(parsed.patch).length > 0;
  if (next.tasks.length && !changed && !/重新/.test(text)) {
    agentMessage('assistant', `沿用${agentProposal ? '待应用建议中的' : '当前'}${next.tasks.length}项分工，没有改动任务。\n` + next.tasks.map(t => `${t.title}：${t.owner || '负责人待定'}`).join('\n'));
    return;
  }
  next.raw = (next.raw + '\n' + text).trim().slice(-AC.LIMITS.text); next = AC.normalize(next);
  next.tasks = agentTool('draft_plan', { project: next }, '整理执行分工').tasks;
  agentProposal = AC.normalize(next); agentContext = structuredClone(agentProposal); agentWaiting = '';
  agentMessage('assistant', `已列出${next.tasks.length}项建议分工：\n` + next.tasks.map(t => `${t.title}：${t.owner || '负责人待定'}`).join('\n') + '\n分组和日期都是建议，请按实际安排核对。[ACT-04]\n' + (switched ? '这是一项新活动，未沿用原活动的预算和实支记录。' : '预算明细和实支记录保持原样。') + '查看下方变更后，再决定是否应用。');
  renderAgentState();
}
function runAgent() {
  const text = $('#agentInput').value.trim(); if (!text) return notify('warn', '先写一句活动需求');
  refreshAgentContext(); agentMessage('user', text); $('#agentInput').value = ''; agentHistory.push(text); if (agentHistory.length > 30) agentHistory.shift();
  try {
    const intent = agentIntent(text), parsed = agentTool('parse_brief', { text }, '整理本次提供的条件');
    if (intent === 'help') { agentMessage('assistant', '可以直接说：“想办个校园市集，60人，预算2000元”。也可以让我检查预算、查看执行进度、列分工或起草通知。缺少条件时我会逐项问你；这里使用本地规则，没有连接大模型。'); return; }
    if (intent === 'knowledge') {
      const query = /资金|赞助|到账/.test(text) ? '资金' : /实支|核销|结算/.test(text) ? '结算' : /预算|预备金|报价/.test(text) ? '预算' : /审批|报销|场地/.test(text) ? '组织' : '';
      const results = agentTool('knowledge_lookup', { query }, '查找相关使用规则');
      agentMessage('assistant', results.map(k => `${k.title}：${k.text} [${k.id}]`).join('\n') + '\n这些是本项目的通用规则；具体报销和审批要求请向本校确认。'); return;
    }
    const hasPatch = Object.keys(parsed.patch).length > 0;
    if (intent === 'tasks') { if (intakeDirty && $('#taskText').value.trim()) { agentMessage('assistant', '输入区还有未整理的修改，请先发送那段需求，再整理分工。'); return; } agentTaskReply(text, parsed); return; }
    if (['budget', 'review', 'progress', 'notice'].includes(intent)) {
      if (intakeDirty && $('#taskText').value.trim()) { agentMessage('assistant', '输入区还有未整理的修改。先把那段需求发送给我，或返回首页点击“开始整理”，再检查更新后的活动。'); return; }
      let p = structuredClone(agentContext);
      if (hasPatch) {
        if (parsed.patch.title && p.basic.title && parsed.patch.title !== p.basic.title) p = AC.empty();
        p.basic = { ...p.basic, ...parsed.patch }; if (parsed.patch.title) p.name = parsed.patch.title;
        p.raw = (p.raw + '\n' + text).trim().slice(-AC.LIMITS.text);
      }
      p = AC.normalize(p);
      if (hasPatch) { agentContext = structuredClone(p); agentWaiting = ''; if (agentProposal) agentProposal = structuredClone(p); }
      if (intent === 'budget') agentMessage('assistant', agentBudgetReply(p));
      else if (intent === 'review') { const results = agentTool('review_activity', { project: p }, '只读检查缺项与风险'); agentMessage('assistant', results.map(x => `${x.level}：${x.text} [${x.reference}]`).join('\n')); }
      else if (intent === 'progress') agentMessage('assistant', p.tasks.length ? `执行清单共${p.tasks.length}项，已完成${p.tasks.filter(t => t.status === 'done').length}项。\n` + p.tasks.map(t => `${t.status === 'done' ? '已完成' : t.status === 'doing' ? '进行中' : '待办'} · ${AC.taskDate(p, t) || '日期待定'} · ${t.title} · ${t.owner || '负责人待定'}`).join('\n') : '还没有执行清单。可以说“帮我生成分工清单”。');
      else agentMessage('assistant', `活动通知草稿\n\n${p.basic.title || '【活动名称待填写】'}\n活动类型：${AC.kindLabel(p.basic)}\n时间：${p.basic.date || '【日期待定】'} ${p.basic.time || '【时刻待定】'}\n地点：${p.basic.venue || '【地点待定】'}\n${p.basic.goal || '【请补充活动内容与目的】'}\n面向人数：${p.basic.people || '待定'}\n主办：${p.basic.organizer || '【主办单位待填写】'}\n报名方式：【请补充报名渠道与截止时间】\n\n这份草稿尚未发布，请核对信息后自行使用。`);
      if (parsed.warnings.length) agentMessage('assistant', parsed.warnings.join('；'));
      renderAgentState(); return;
    }
    if (!hasPatch && !agentWaiting && intent === 'update') { agentMessage('assistant', '这句话暂时没有匹配到活动操作。可以补充人数、预算或地点，也可以说“检查预算”“生成分工清单”“帮我写活动通知”。'); return; }
    let next = structuredClone(agentContext || project);
    if (parsed.patch.title && next.basic.title && parsed.patch.title !== next.basic.title) next = AC.empty();
    if (agentWaiting && !hasPatch) {
      if (['title', 'venue', 'goal', 'customKind'].includes(agentWaiting) && text.length <= (agentWaiting === 'customKind' ? 80 : 120)) parsed.patch[agentWaiting] = text;
      else if (['people', 'budget'].includes(agentWaiting)) { const answer = AC.parseBrief(agentWaiting === 'people' ? text + '人' : '预算' + text + '元'); if (answer.patch[agentWaiting]) parsed.patch[agentWaiting] = answer.patch[agentWaiting]; }
    }
    next.basic = { ...next.basic, ...parsed.patch }; next.raw = (next.raw + '\n' + text).trim().slice(-AC.LIMITS.text); if (parsed.patch.title) next.name = parsed.patch.title;
    next = AC.normalize(next); agentContext = next; agentProposal = null;
    const critical = AC.missing(next).filter(m => ['title', 'people', 'budget', 'customKind'].includes(m.field));
    if (critical.length) { agentWaiting = critical[0].field; agentMessage('assistant', `还需要确认${critical[0].label}${agentWaiting === 'budget' ? '（元）' : agentWaiting === 'people' ? '（人）' : ''}，直接回复即可。${parsed.warnings.length ? '\n' + parsed.warnings.join('；') : ''}`); renderAgentState(); return; }
    agentWaiting = ''; const plan = agentTool('draft_plan', { project: next }, '按当前条件整理流程');
    const newItems = !next.items.length || intent === 'lean';
    if (newItems) next.items = agentTool('suggest_budget', { project: next, lean: intent === 'lean' }, intent === 'lean' ? '生成节约版预算初稿' : '生成预算初稿').items;
    const newTasks = !next.tasks.length;
    if (newTasks) next.tasks = plan.tasks;
    agentProposal = AC.normalize(next); agentContext = structuredClone(agentProposal);
    agentTool('review_activity', { project: next }, '检查仍需补充的事项');
    const a = agentTool('analyze_budget', { project: next }, '核算建议预算与资金缺口'), missing = AC.missing(next);
    const response = [`已整理“${next.basic.title}”的${intent === 'lean' ? '节约版建议' : '活动建议'}。`, `${AC.kindLabel(next.basic)}，${next.basic.people}人；时长${next.basic.duration || 120}分钟，可在需求页修改（初始默认120分钟）。`, `计划总额 ${AC.money(a.totalCents)} 元，含预备金 ${AC.money(a.reserveCents)} 元；${a.overBudget ? '超过预算上限 ' + AC.money(-a.balanceCents) + ' 元，需要调整' : '当前未超预算上限'}。`, `按已确认记录计算，资金缺口 ${AC.money(a.fundingGapCents)} 元；待确认资金不计入。[ACT-03]`, newItems ? '预算初稿按上限比例分配，不是报价，请逐项询价。[ACT-02]' : '已保留原有预算明细及实支记录。', a.ceilingCents !== null && a.actualCents > a.ceilingCents ? '已登记实际支出也超过上限，请单独核对。[ACT-05]' : '', `${newTasks ? '新建' : '沿用'}${next.tasks.length}项执行任务；流程分为${plan.agenda.length}个环节。`, missing.length ? '还需补充：' + missing.map(x => x.label).join('、') + '。' : '', parsed.warnings.join('；'), '先查看下方变更，再决定是否应用。详细风险可通过“请助手检查”查看。'];
    agentMessage('assistant', response.filter(Boolean).join('\n')); renderAgentState();
  } catch (error) { agentMessage('assistant', '这次未能完成：' + error.message); renderAgentState(); }
}
function applyAgent() {
  if (intakeDirty) { notify('warn', '需求输入已更改，请先整理新输入，再生成和应用建议'); return; }
  if (agentRevision !== projectRevision) { invalidateAgentState(); notify('warn', '活动记录已更新，请重新生成建议'); return; }
  if (!agentProposal) return;
  if ((project.items.length || project.raw) && !confirm('确认应用下方列出的变更？请查看明细和实支的替换提示，必要时先下载项目备份。')) return;
  if (commit(structuredClone(agentProposal), '助手建议已应用，请核对需求和预算', true)) { intakeDirty = false; agentContext = structuredClone(project); agentRevision = projectRevision; agentProposal = null; $('#applyAgent').disabled = true; $('#taskText').value = project.raw; $('#projectName').value = project.name; renderAgentState(); showStep(2); }
}
function discardAgent() { agentContext = structuredClone(project); agentRevision = projectRevision; agentProposal = null; agentWaiting = ''; renderAgentState(); agentMessage('assistant', '已放弃未应用的建议，当前活动没有变化。'); }
function exportAgentReply() { if (agentLastReply) download(fileName('_助手答复.txt'), agentLastReply, 'text/plain;charset=utf-8'); }
