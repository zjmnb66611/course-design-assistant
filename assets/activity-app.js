/* 活动业务界面；沿用现有工作台、六步导航与展示样式。 */
'use strict';
var AC = ActivityCore;
var project = AC.empty(), currentStep = 1, reportText = '', previousProject = null, evidence = [], rowEdit = null, intakeDirty = false, projectRevision = 0;
var STEPS = ['说说活动', '确认需求', '策划方案', '预算核算', '执行清单', '导出交付'];
var $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
var esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
var basicConfig = [
  ['title', '活动名称', 'text'], ['kind', '活动类型', AC.KINDS], ['people', '预计人数', 'number'], ['budget', '预算上限 / 元', 'number'],
  ['date', '活动日期', 'date'], ['time', '开始时刻（可选）', 'time'], ['duration', '活动时长 / 分钟', 'number'], ['venue', '活动地点', 'text'], ['organizer', '主办单位', 'text'], ['goal', '活动目标与期望成果', 'textarea']
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
    AC.analyze(clean); previousProject = structuredClone(project); project = clean; projectRevision++; reportText = '';
    agentProposal = null; $('#applyAgent').disabled = true;
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
    const item = evidence.find(e => e.field === key); $('#src_' + key).textContent = item && String(project.basic[key]) === String(item.value) ? `原文第 ${item.line} 行：${item.raw}` : project.basic[key] ? '当前项目记录，请核对' : '尚未确认';
  }
}
function readBasic() { const b = {}; for (const [key] of basicConfig) b[key] = $('#b_' + key).value.trim(); return b; }
function saveBasic() {
  const next = structuredClone(project); next.basic = readBasic();
  if (JSON.stringify(next.basic) === JSON.stringify(project.basic)) return true;
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
    $('#parseResult').innerHTML = `<div class="quickstart"><div><b>已整理 ${Object.keys(parsed.patch).length} 项条件</b><p>${esc(AC.missing(project).map(x => x.label).join('、') || '条件已填写')} ${AC.missing(project).length ? '仍需确认' : '，请继续核对'}</p></div><button class="btn btn-primary btn-sm" data-action="manualEntry">核对需求</button></div>`;
    localMessage('#parseMsg', parsed.warnings.join('；') || '已保留原文。识别采用本地规则，请核对后继续。', parsed.warnings.length ? 'warn' : 'ok');
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
  $('#planOverview').innerHTML = `<div class="quickstart"><div><b>${esc(plan.title)}</b><p>${esc(plan.objective)}</p></div><span class="tag ${plan.missing.length ? 'warn' : 'info'}">${plan.missing.length} 项待补齐</span></div>`;
  $('#agendaList').innerHTML = plan.agenda.map(a => `<article><b>第 ${a.startMinute} 分钟起 · ${a.minutes} 分钟 · ${esc(a.title)}</b><small>${esc(a.owner)}</small></article>`).join('');
  $('#planRisks').innerHTML = [...plan.risks, ...plan.missing.map(x => x.label + '待确认')].map(t => `<p class="hint">${esc(t)}</p>`).join('');
}
function generatePlan() { if (!saveBasic()) return; showStep(3); }
function renderBudget() {
  const a = AC.analyze(project); $('#reservePercent').value = project.reservePercent;
  $('#budgetRows').innerHTML = a.lines.map(i => `<tr><td><b>${esc(i.label)}</b><small>${esc(i.category)}</small></td><td>${esc(i.quantity)} ${esc(i.unit)}</td><td>${esc(i.unitPrice)}</td><td>${AC.money(i.subtotalCents)}</td><td>${i.actual === '' ? '未核销' : esc(i.actual)}</td><td>${i.quote === 'quoted' ? '用户标记已询价' : '估算待询价'}<small>${esc(i.source || '来源待补充')}</small></td><td><button class="text-btn" data-action="editItem" data-arg="${i.id}">编辑</button><button class="text-btn danger-text" data-action="deleteItem" data-arg="${i.id}">删除</button></td></tr>`).join('') || '<tr><td colspan="7">先生成占位预算，或添加已询价的明细。</td></tr>';
  const kpis = [['计划总额 / 元', AC.money(a.totalCents), false], ['预算结余 / 元', a.balanceCents === null ? '待确认' : AC.money(a.balanceCents), a.overBudget], ['人均计划 / 元', a.perPersonCents === null ? '待确认' : AC.money(a.perPersonCents), false], ['预备金 / 元', AC.money(a.reserveCents), false], ['已确认资金缺口 / 元', AC.money(a.fundingGapCents), a.fundingGapCents > 0], ['已登记实支 / 元', `${AC.money(a.actualCents)}（${a.unreconciled}项待核销）`, false]];
  $('#budgetSummary').innerHTML = kpis.map(([k, v, bad]) => `<div class="kpi"><div class="k">${k}</div><div class="v ${bad ? 'bad' : ''}">${esc(v)}</div></div>`).join('');
  $('#budgetWarnings').innerHTML = `<p class="hint">小计 ${AC.money(a.subtotalCents)} 元 + 预备金 ${AC.money(a.reserveCents)} 元 = 计划总额 ${AC.money(a.totalCents)} 元。待确认资金 ${AC.money(a.pendingCents)} 元未计入已确认资金。</p>` + (a.overBudget ? '<div class="msg err show">计划超过预算上限，请调整明细或重新确认上限。</div>' : '') + (project.items.some(i => i.quote === 'estimate') ? '<div class="msg warn show">包含估算或占位金额，请用真实询价替换。预备金为另列计划，不计入已登记实际支出。</div>' : '') + `<div class="activity-bars">${Object.entries(a.categories).map(([category, value]) => `<label>${esc(category)}<progress value="${value}" max="${Math.max(a.subtotalCents, 1)}"></progress><span>${AC.money(value)} 元</span></label>`).join('')}</div>`;
  if (a.ceilingCents !== null && a.actualCents > a.ceilingCents) $('#budgetWarnings').insertAdjacentHTML('beforeend', '<div class="msg err show">已登记实际支出已超过预算上限 ' + AC.money(a.actualCents - a.ceilingCents) + ' 元，请核对实支与经费安排。</div>');
  if (a.actualVarianceCents !== null) $('#budgetWarnings').insertAdjacentHTML('beforeend', '<p class="hint">完整实支与明细预算差额（不含预备金）：' + AC.money(a.actualVarianceCents) + ' 元。</p>');
  $('#fundingRows').innerHTML = project.funding.map(f => `<div class="activity-funding"><div><b>${esc(f.name)} · ${esc(f.amount)} 元</b><p>${f.status === 'confirmed' ? '用户标记已确认' : '待确认，不计入可用资金'} · ${esc(f.source || '来源待补充')}</p></div><div><button class="text-btn" data-action="editFunding" data-arg="${f.id}">编辑</button><button class="text-btn danger-text" data-action="deleteFunding" data-arg="${f.id}">删除</button></div></div>`).join('') || '<p class="hint">尚未登记资金来源。</p>';
}
function suggestBudget(lean = false) {
  if (project.items.length && !confirm('生成的占位预算将替换当前明细和实支记录，请先保存对比方案或项目。是否继续？')) return;
  try { if (mutate(p => { p.items = AC.suggestBudget(p, lean); p.approvals.finance = false; }, '已生成可修改的占位预算，金额不是市场报价')) { renderBudget(); showStep(4, true); } } catch (e) { notify('err', e.message); }
}
var rowConfigs = {
  item: [['label', '预算项目名称', 'text'], ['category', '支出类别', AC.CATEGORIES], ['quantity', '数量（最多3位小数）', 'number'], ['unit', '单位', 'text'], ['unitPrice', '单价 / 元', 'number'], ['actual', '实际支出 / 元（空白表示未核销）', 'number'], ['quote', '价格状态', [['estimate', '估算待询价'], ['quoted', '用户标记已询价']]], ['source', '询价或分配依据', 'textarea'], ['note', '备注', 'textarea']],
  funding: [['name', '资金来源名称', 'text'], ['amount', '金额 / 元', 'number'], ['status', '确认状态', [['pending', '待确认'], ['confirmed', '用户标记已确认']]], ['source', '确认依据或说明', 'textarea']],
  task: [['title', '执行任务', 'text'], ['owner', '负责人或小组', 'text'], ['offset', '相对活动日的天数（提前为负）', 'number'], ['status', '状态', [['todo', '待办'], ['doing', '进行中'], ['done', '已完成']]], ['note', '具体要求', 'textarea']]
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
  if (mutate(p => { p.tasks = AC.draftPlan(p).tasks; p.approvals.team = false; }, '已生成建议清单，请确认负责人和相对日期')) showStep(5);
}
function renderTasks() {
  $('#taskRows').innerHTML = project.tasks.map(t => `<article class="activity-task"><div><b>${esc(t.title)}</b><p>${AC.taskDate(project, t) || '日期待定'} · ${t.offset === 0 ? '活动当日' : t.offset < 0 ? '提前' + -t.offset + '天' : '活动后' + t.offset + '天'} · ${esc(t.owner || '负责人待定')}</p><p>${esc(t.note)}</p></div><div class="task-controls"><select data-task-status="${t.id}" aria-label="${esc(t.title)}的状态"><option value="todo">待办</option><option value="doing">进行中</option><option value="done">已完成</option></select><button class="text-btn" data-action="editTask" data-arg="${t.id}">编辑</button><button class="text-btn danger-text" data-action="deleteTask" data-arg="${t.id}">删除</button></div></article>`).join('') || '<p class="hint">先生成建议清单，或手动添加任务。</p>';
  for (const t of project.tasks) $(`[data-task-status="${t.id}"]`).value = t.status;
  $('#approvalList').innerHTML = Object.entries({ venue: '场地、设备与容量已人工核对', finance: '经费来源、询价与报销要求已人工核对', safety: '现场分工、备选安排与审批流程已人工核对', team: '负责人和执行节点已人工核对' }).map(([key, text]) => `<label><input type="checkbox" data-approval="${key}" ${project.approvals[key] ? 'checked' : ''}>${text}</label>`).join('');
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
function undo() { if (!previousProject) return notify('warn', '没有可撤销的修改'); const saved = previousProject; if (commit(saved, '已撤销上一次修改')) { previousProject = null; $('#taskText').value = project.raw; $('#projectName').value = project.name; showStep(currentStep, true); } }
// 独立助手仅在内存中保存对话，所有建议均需明确应用。
var agentContext = null, agentProposal = null, agentWaiting = '', agentHistory = [], agentCalls = [], agentRevision = -1;
function agentMessage(role, text) { const node = document.createElement('div'); node.className = 'agent-message ' + role; const title = document.createElement('strong'); title.textContent = role === 'user' ? '你' : '策划助手 · 本地工作流'; node.append(title, document.createTextNode(text)); $('#agentMessages').append(node); while ($('#agentMessages').children.length > 40) $('#agentMessages').firstChild.remove(); $('#agentMessages').scrollTop = $('#agentMessages').scrollHeight; }
function openAgent() { if (!agentContext || agentRevision !== projectRevision) { agentContext = structuredClone(project); agentRevision = projectRevision; agentProposal = null; agentWaiting = ''; $('#applyAgent').disabled = true; } if (intakeDirty && $('#taskText').value.trim()) $('#agentInput').value = $('#taskText').value; openPanel('agentPanel'); if (!$('#agentMessages').children.length) agentMessage('assistant', '告诉我活动想法、人数或预算。我会调用需求整理、策划、预算与检查工具，列出待确认项。生成的建议由你确认后再应用。'); }
function agentTool(tool, args, summary) { const start = performance.now(), result = AC.runTool({ tool, arguments: args }); agentCalls.push({ tool, summary, elapsedMs: +(performance.now() - start).toFixed(2), status: 'completed' }); agentCalls = agentCalls.slice(-40); $('#agentTrace').textContent = agentCalls.map((x, i) => `${i + 1}. ${x.tool} · ${x.summary} · ${x.elapsedMs}ms · 已执行`).join('\n'); return result; }
function runAgent() {
  const text = $('#agentInput').value.trim(); if (!text) return notify('warn', '先写一句活动需求');
  if (agentRevision !== projectRevision) { agentContext = structuredClone(project); agentRevision = projectRevision; agentWaiting = ''; }
  agentProposal = null; $('#applyAgent').disabled = true;
  agentMessage('user', text); $('#agentInput').value = ''; agentHistory.push(text); if (agentHistory.length > 30) agentHistory.shift();
  try {
    let next = structuredClone(agentContext || project); const parsed = agentTool('parse_brief', { text }, '提取活动条件');
    if (parsed.patch.title && next.basic.title && parsed.patch.title !== next.basic.title) next = AC.empty();
    if (agentWaiting && !Object.keys(parsed.patch).length) {
      if (['title', 'venue', 'goal'].includes(agentWaiting) && text.length < 500) parsed.patch[agentWaiting] = text;
      else if (['people', 'budget'].includes(agentWaiting) && /^\d+(?:\.\d{1,2})?$/.test(text)) parsed.patch[agentWaiting] = text;
    }
    next.basic = { ...next.basic, ...parsed.patch }; next.raw = (next.raw + '\n' + text).trim().slice(-AC.LIMITS.text); if (parsed.patch.title) next.name = parsed.patch.title;
    next = AC.normalize(next); agentContext = next;
    const needed = AC.missing(next), critical = needed.filter(m => ['title', 'people', 'budget'].includes(m.field));
    if (critical.length) { agentWaiting = critical[0].field; agentProposal = null; $('#applyAgent').disabled = true; agentMessage('assistant', `已记录已知条件。还需要确认：${critical.map(x => x.label).join('、')}。\n先告诉我${critical[0].label}${agentWaiting === 'budget' ? '（元）' : agentWaiting === 'people' ? '（人）' : ''}。\n${parsed.warnings.join('；')}`); return; }
    agentWaiting = ''; const plan = agentTool('draft_plan', { project: next }, '生成分阶段流程与相对执行节点');
    const wantsLean = /节约|压缩|降低|省钱/.test(text), wantsBudget = /预算|花费|经费|节约|压缩|省钱/.test(text);
    if (!next.items.length || wantsLean) next.items = agentTool('suggest_budget', { project: next, lean: wantsLean }, wantsLean ? '生成节约版占位分配' : '生成标准版占位分配').items;
    if (!next.tasks.length) next.tasks = plan.tasks;
    const a = agentTool('analyze_budget', { project: next }, '逐项整数分核算与资金缺口检查');
    const checks = agentTool('review_activity', { project: next }, '检查缺项、估价、预算与人工核对记录');
    agentTool('knowledge_lookup', { query: wantsBudget ? '预算' : '' }, '检索本项目规则来源');
    agentProposal = AC.normalize(next); agentContext = structuredClone(agentProposal); $('#applyAgent').disabled = false;
    const response = [`已整理“${next.basic.title}”的${wantsLean ? '节约版建议' : '策划建议'}。`, `参与 ${next.basic.people} 人；建议活动时长 ${next.basic.duration || 120} 分钟。`, `预算明细 ${AC.money(a.subtotalCents)} 元 + 预备金 ${AC.money(a.reserveCents)} 元 = ${AC.money(a.totalCents)} 元；${a.overBudget ? '超过上限，需要调整' : '当前未超预算上限'}。`, `相对已确认资金的缺口：${AC.money(a.fundingGapCents)} 元。`, '金额是按预算上限分配的占位假设，需用实际询价替换。[ACT-02/03]', `生成 ${next.tasks.length} 项执行任务，包含前期确认、现场执行与结算复盘。`, ...checks.slice(0, 6).map(x => `${x.level}：${x.text} [${x.reference}]`), parsed.warnings.join('；'), '点击“应用建议到活动”后才修改当前项目。'];
    agentMessage('assistant', response.filter(Boolean).join('\n'));
  } catch (e) { agentMessage('assistant', '本次未生成可应用建议：' + e.message); }
}
function applyAgent() { if (!agentProposal) return; if ((project.items.length || project.raw) && !confirm('将助手建议应用到当前活动？现有明细可能被替换，建议先保存项目。')) return; if (commit(structuredClone(agentProposal), '助手建议已应用，请核对需求和预算', true)) { intakeDirty = false; agentContext = structuredClone(project); agentRevision = projectRevision; agentProposal = null; $('#applyAgent').disabled = true; $('#taskText').value = project.raw; $('#projectName').value = project.name; showStep(2); } }
