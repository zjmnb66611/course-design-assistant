/* 项目、外观、导出与事件；不启动服务、不调用远程模型。 */
'use strict';
var PREF_KEY = 'activity-assistant.preferences.v1', DRAFT_KEY = 'activity-assistant.draft.v1';
var appearance = { theme: 'system', accent: 'blue' }, themeMedia = matchMedia('(prefers-color-scheme: dark)');
var draftEnabled = false, draftTimer = 0, dirty = false, draftHealthy = false, draftPending = false, taskReadVersion = 0, projectReadVersion = 0;
function cancelFileReads() { taskReadVersion++; projectReadVersion++; }
function markIntakeChanged() { cancelFileReads(); intakeDirty = $('#taskText').value.trim() !== project.raw; reportText = ''; invalidateAgentState(); evidence = []; $('#parseResult').replaceChildren(); localMessage('#parseMsg', intakeDirty ? '输入已更改，点击“开始整理”后更新方案。' : ''); scheduleDraft(); updateWorkspace(); }
function readStorage(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
function writeStorage(key, value) { try { localStorage.setItem(key, value); return true; } catch (_) { return false; } }
function applyAppearance() {
  const dark = appearance.theme === 'dark' || (appearance.theme === 'system' && themeMedia.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'; document.documentElement.dataset.accent = appearance.accent; document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  $$('[data-action=setTheme]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.arg === appearance.theme))); $('#accentSelect').value = appearance.accent;
}
function setTheme(value) { if (!['light', 'dark', 'system'].includes(value)) return; appearance.theme = value; applyAppearance(); if (!writeStorage(PREF_KEY, JSON.stringify(appearance))) notify('warn', '显示模式已生效，但本机偏好未能保存'); }
function ensureCurrent() { if (intakeDirty) { notify('warn', '输入已变更，请先整理需求，避免导出旧方案'); showStep(1); return false; } if (currentStep === 2 && !$('#sec2').hidden && !saveBasic()) return false; return true; }
function fileName(suffix) { return (project.name || '学院活动').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 60) + suffix; }
function download(name, content, type = 'application/json;charset=utf-8') { const url = URL.createObjectURL(new Blob([content], { type })), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
function saveProject() { if (!ensureCurrent()) return; const clean = AC.normalize(project); download(fileName('_活动项目.json'), JSON.stringify(clean, null, 2)); dirty = false; notify('ok', '备份已下载，包含输入与人工记录，导入后重新核算。'); }
function scheduleDraft() {
  dirty = true; if (!draftEnabled) return;
  draftPending = true; clearTimeout(draftTimer); draftTimer = setTimeout(() => {
    const data = JSON.stringify({ format: 'activity-draft', version: 1, project, input: $('#taskText').value });
    draftHealthy = new TextEncoder().encode(data).length <= AC.LIMITS.file && writeStorage(DRAFT_KEY, data); draftPending = false;
    $('#draftStatus').textContent = draftHealthy ? '已保存到本浏览器，其他设备需导入备份。' : '草稿未能保存，请立即下载项目备份。';
    $('#restoreDraft').hidden = !readStorage(DRAFT_KEY);
  }, 300);
}
function restoreProject(raw) {
  const clean = AC.normalize(raw); AC.analyze(clean);
  if ((project.raw || project.items.length) && !confirm('打开项目将替换当前活动，是否继续？')) return false;
  if (!commit(clean, '已导入项目，并按输入重新核算预算。')) return false;
  evidence = []; intakeDirty = false; $('#taskText').value = project.raw; $('#projectName').value = project.name; dirty = false;
  showStep(2); if (document.documentElement.dataset.entry === 'agent') openAgent(); return true;
}
function restoreDraft() {
  try {
    const raw = readStorage(DRAFT_KEY); if (!raw || new TextEncoder().encode(raw).length > AC.LIMITS.file) throw Error('草稿为空或超出限制');
    const data = JSON.parse(raw); if (!data || data.format !== 'activity-draft' || data.version !== 1 || typeof data.input !== 'string' || data.input.length > AC.LIMITS.text || data.input.includes('\0')) throw Error('草稿格式无效，原始内容保留未覆盖');
    if (restoreProject(data.project)) { $('#taskText').value = data.input; intakeDirty = data.input !== project.raw; updateWorkspace(); if (intakeDirty) notify('warn', '已恢复未整理输入，请先回到需求页整理'); }
  } catch (e) { notify('err', '草稿恢复失败：' + e.message); }
}
function clearDraft() { clearTimeout(draftTimer); draftPending = false; draftEnabled = false; $('#autoDraft').checked = false; try { localStorage.removeItem(DRAFT_KEY); $('#restoreDraft').hidden = true; $('#draftStatus').textContent = '本机草稿已清除并停用，旧课设草稿未改动。'; } catch (_) { notify('err', '浏览器未允许清除草稿，请在浏览器设置中处理'); } }
function exportMD() { if (buildReport()) download(fileName('_策划与预算.md'), reportText, 'text/markdown;charset=utf-8'); }
function exportDOC() { if (!buildReport()) return; const html = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + esc(project.name) + '</title></head><body><pre style="white-space:pre-wrap;font-family:Microsoft YaHei, sans-serif;line-height:1.8">' + esc(reportText) + '</pre></body></html>'; download(fileName('_策划与预算.doc'), html, 'application/msword;charset=utf-8'); notify('ok', '已下载兼容 .doc 文件，可用 Word/WPS 打开编辑。'); }
function exportCSV() { if (ensureCurrent()) download(fileName('_预算明细.csv'), AC.csv(project), 'text/csv;charset=utf-8'); }
function exportICS() { if (!ensureCurrent()) return; if (!project.tasks.some(t => t.status !== 'done')) return notify('warn', '没有未完成的执行任务可导出'); download(fileName('_执行节点.ics'), AC.ics(project), 'text/calendar;charset=utf-8'); notify('ok', '已导出全天执行节点，在系统日历中导入后自行设置提醒'); }
function printReport() { if (buildReport()) window.print(); }
function openGuide() { const video = $('#guideVideo'); if (!video.poster) video.poster = video.dataset.posterSrc; openPanel('guidePanel'); }
async function playGuide() { const video = $('#guideVideo'); if (!video.getAttribute('src')) video.src = video.dataset.videoSrc; try { await video.play(); $('#guidePlayButton').hidden = true; $('#guideVideoError').hidden = true; } catch (_) { $('#guideVideoError').hidden = false; } }
async function seekGuide(value) { await playGuide(); const video = $('#guideVideo'); if (Number.isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(Number(value) || 0, video.duration)); }
var ACTIONS = {
  showStep, returnStep: () => showStep(currentStep), openGuide, playGuide, seekGuide, openKnowledge, openCompare, openAgent,
  switchTaskTab, parseTask, quickDemo, manualEntry: () => { if (intakeDirty && $('#taskText').value.trim()) { parseTask(); if (intakeDirty) return; } showStep(2); },
  clearTask: () => { if (!mutate(p => { p.raw = ''; }, '输入已清空，活动条件、预算和分工仍保留。')) return; $('#taskText').value = ''; intakeDirty = false; evidence = []; $('#parseResult').replaceChildren(); localMessage('#parseMsg', ''); },
  useStarter: kind => { if ($('#taskText').value.trim() && !confirm('用活动模板替换当前输入？已保存的条件不变。')) return; $('#taskText').value = `想举办一次学院${kind}，先帮我整理需要确认的事项。`; markIntakeChanged(); $('#taskText').focus(); },
  generatePlan, generateTasks, suggestBudget: () => suggestBudget(false), leanBudget: () => suggestBudget(true),
  addItem: () => openRow('item'), editItem: id => openRow('item', id), deleteItem: id => removeRow('item', id),
  addFunding: () => openRow('funding'), editFunding: id => openRow('funding', id), deleteFunding: id => removeRow('funding', id),
  addTask: () => openRow('task'), editTask: id => openRow('task', id), deleteTask: id => removeRow('task', id), closeRow: () => $('#rowDialog').close(),
  buildReport, addScenario, undo, saveProject, chooseProject: () => $('#projectFile').click(), restoreDraft, clearDraft, setTheme,
  exportMD, exportDOC, exportCSV, exportICS, printReport,
  loadScenario: value => { const index = Number(value), s = project.scenarios[index]; if (!s || !confirm('载入对比方案会替换当前活动条件、原文、预算和资金来源，执行清单保留。是否继续？')) return; if (mutate(p => { p.basic = structuredClone(s.basic); p.raw = s.raw; p.items = structuredClone(s.items); p.funding = structuredClone(s.funding); p.reservePercent = s.reservePercent; }, '方案已载入并重新核算', true)) { intakeDirty = false; $('#taskText').value = project.raw; evidence = []; showStep(4); } },
  removeScenario: value => { const index = Number(value); if (Number.isInteger(index) && project.scenarios[index] && confirm('删除这个对比方案？')) { mutate(p => p.scenarios.splice(index, 1), '对比方案已删除'); renderComparison(); } },
  runAgent, applyAgent, discardAgent, exportAgentReply,
  agentStarter: text => { $('#agentInput').value = text; $('#agentInput').focus(); },
  resetAgent: () => { if ($('#agentMessages').children.length > 1 && !confirm('清空本页助手对话和未应用建议？当前活动不变。')) return; agentContext = structuredClone(project); agentRevision = projectRevision; agentProposal = null; agentWaiting = ''; agentCalls = []; agentHistory = []; agentLastReply = ''; $('#exportAgentReply').disabled = true; $('#agentMessages').replaceChildren(); $('#agentTrace').textContent = '尚未调用工具。'; $('#applyAgent').disabled = true; openAgent(); }
};
document.addEventListener('click', e => {
  const button = e.target.closest('[data-action]'); if (!button || button.disabled) return;
  const action = ACTIONS[button.dataset.action]; if (!action) return; e.preventDefault();
  const task = () => { try { return action(button.dataset.arg); } catch (error) { notify('err', error.message); } };
  const labels = { parseTask: '正在整理活动条件…', generatePlan: '正在生成策划草案…', buildReport: '正在生成策划与预算报告…', runAgent: '助手正在调用策划与核算工具…' };
  if (labels[button.dataset.action] && window.CourseLoading) CourseLoading.run(labels[button.dataset.action], button, task); else task();
});
$('#rowForm').addEventListener('submit', saveRow);
$('#taskText').addEventListener('input', markIntakeChanged);
$('#taskFile').addEventListener('change', async e => {
  const version = ++taskReadVersion, file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try { if (!/\.(txt|md)$/i.test(file.name) || (file.type && !/^text\/(plain|markdown)$/i.test(file.type)) || file.size > 1024 * 1024) throw Error('仅支持不超过1MB的 TXT/Markdown'); projectReadVersion++; invalidateAgentState(); const text = await file.text(); if (version !== taskReadVersion) return; if (text.length > AC.LIMITS.text || text.includes('\0')) throw Error('内容超过2万字或包含空字节'); $('#taskText').value = text; markIntakeChanged(); $('#fileMeta').textContent = '已读取：' + file.name + '，请点击开始整理'; } catch (error) { if (version === taskReadVersion) $('#fileMeta').textContent = error.message; }
});
$('#projectFile').addEventListener('change', async e => { const version = ++projectReadVersion, file = e.target.files[0]; e.target.value = ''; if (!file) return; try { if (!/\.json$/i.test(file.name) || file.size > AC.LIMITS.file) throw Error('仅支持不超过1.5MB的JSON项目'); taskReadVersion++; invalidateAgentState(); const text = await file.text(); if (version !== projectReadVersion) return; restoreProject(JSON.parse(text)); } catch (error) { if (version === projectReadVersion) notify('err', '项目未导入，当前数据未改变：' + error.message); } });
$('#basicFields').addEventListener('change', () => { syncKindField(); saveBasic(); });
$('#reservePercent').addEventListener('change', e => { if (mutate(p => { p.reservePercent = e.target.value; p.approvals.finance = false; }, '预备金已重算')) renderBudget(); else $('#reservePercent').value = project.reservePercent; });
$('#taskRows').addEventListener('change', e => { const id = e.target.dataset.taskStatus; if (!id) return; if (mutate(p => { const task = p.tasks.find(t => t.id === id); if (task) task.status = e.target.value; }, '任务进度已更新')) renderTasks(); });
$('#approvalList').addEventListener('change', e => { const key = e.target.dataset.approval; if (!Object.hasOwn(project.approvals, key)) return; mutate(p => { p.approvals[key] = e.target.checked; }); });
$('#projectName').addEventListener('change', e => { mutate(p => { p.name = e.target.value.trim(); }); });
$('#autoDraft').addEventListener('change', e => { draftEnabled = e.target.checked; if (draftEnabled) scheduleDraft(); else clearDraft(); });
$('#accentSelect').addEventListener('change', e => { if (!['blue', 'green', 'plum'].includes(e.target.value)) return; appearance.accent = e.target.value; applyAppearance(); writeStorage(PREF_KEY, JSON.stringify(appearance)); });
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.isComposing) { if (e.target.id === 'taskText') { e.preventDefault(); ACTIONS.parseTask(); } else if (e.target.id === 'agentInput') { e.preventDefault(); CourseLoading.run('助手正在调用工具…', $('#agentSend'), runAgent); } } });
window.addEventListener('beforeunload', e => { if (dirty && (!draftEnabled || draftPending || !draftHealthy)) { e.preventDefault(); e.returnValue = ''; } });
themeMedia.addEventListener('change', applyAppearance);
try { const value = JSON.parse(readStorage(PREF_KEY) || readStorage('course-assistant.preferences.v2') || 'null'); if (value && ['light', 'dark', 'system'].includes(value.theme) && ['blue', 'green', 'plum'].includes(value.accent)) appearance = { theme: value.theme, accent: value.accent }; } catch (_) { /* 无效偏好使用默认值 */ }
STEPS.forEach((text, i) => { const button = document.createElement('button'); button.type = 'button'; button.id = 'tab' + (i + 1); button.className = 'step-tab'; button.dataset.action = 'showStep'; button.dataset.arg = String(i + 1); button.innerHTML = '<span class="n">' + (i + 1) + '</span>' + text; $('#stepTabs').append(button); });
$('#restoreDraft').hidden = !readStorage(DRAFT_KEY); if (readStorage(DRAFT_KEY)) $('#draftStatus').textContent = '发现本机活动草稿，可手动恢复。';
applyAppearance(); showStep(1); dirty = false;
if (window.CourseLoading) CourseLoading.ready();
if (document.documentElement.dataset.entry === 'agent' || new URL(location.href).searchParams.get('view') === 'agent') openAgent();
else if (new URL(location.href).searchParams.get('view') === 'guide') openGuide();
document.addEventListener('visibilitychange', () => { if (document.hidden) $('#guideVideo').pause(); });
window.ActivityApp = Object.freeze({ snapshot: () => structuredClone(project), status: () => ({ currentStep, intakeDirty, projectRevision, dirty, draftEnabled }), agentStatus: () => ({ calls: structuredClone(agentCalls), hasProposal: !!agentProposal, waiting: agentWaiting }) });
