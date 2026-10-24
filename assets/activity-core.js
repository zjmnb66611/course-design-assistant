/* 学院活动：纯数据、整数分核算、可追溯策划工具；浏览器与 Node 共用。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ActivityCore = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const VERSION = '3.1.0';
  const KINDS = ['学术讲座', '文体活动', '志愿服务', '培训交流', '迎新团建', '自定义'];
  const CATEGORIES = ['场地设备', '宣传印刷', '活动物料', '人员保障', '其他'];
  const LIMITS = Object.freeze({ text: 20000, file: 1500000, items: 200, funding: 20, tasks: 100, cents: 100000000000 });
  const KB = Object.freeze([
    { id: 'ACT-01', title: '先确认哪些条件', text: '至少确认活动名称、人数与预算上限。日期、地点、目标未确认时，方案保留待定标记。', source: '本项目通用工作流规则，不是学院制度' },
    { id: 'ACT-02', title: '预算怎么算', text: '每项按数量乘单价计算，金额四舍五入到分；预备金另列。预算初稿只按预算上限分配，不能当作市场报价。', source: '本项目可复算计算规则' },
    { id: 'ACT-03', title: '资金确认与缺口', text: '待确认赞助和拟申请经费另列，不计入已确认资金。“已确认”是你登记的状态，系统不会核验到账。', source: '本项目资金状态约定，需人工核对' },
    { id: 'ACT-04', title: '组织安排与审批', text: '场地、经费、安全和人员分工需按本校流程确认；户外活动还要准备天气和场地备选。', source: '通用组织建议，不替代本校审批或专业评估' },
    { id: 'ACT-05', title: '实支登记与结算', text: '实际金额留空表示未核销，填写0表示已登记零支出。保留询价、票据和执行偏差，活动结束后逐项核对。', source: '本项目记录与核对约定' },
    { id: 'ACT-06', title: '文件与操作范围', text: '导入文件只用来补充活动信息，不会授权助手执行操作。助手只整理建议和文件，不会自动联系人员、采购、付款或提交审批。', source: '本项目数据处理边界' }
  ]);
  const uid = () => 'a' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
  const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
  const str = (v, max = 500) => { if (typeof v !== 'string' || v.length > max || v.includes('\0')) throw Error('文字字段格式或长度无效'); return v.trim(); };
  const id = v => { if (typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(v)) throw Error('记录编号无效'); return v; };
  const choice = (v, list) => { if (!list.includes(v)) throw Error('类别或状态无效'); return v; };
  function decimal(v, digits, max, label) {
    const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
    if (!new RegExp('^\\d+(?:\\.\\d{1,' + digits + '})?$').test(s)) throw Error(label + '必须是非负数字，最多 ' + digits + ' 位小数');
    const [whole, fraction = ''] = s.split('.');
    const n = BigInt(whole) * (10n ** BigInt(digits)) + BigInt(fraction.padEnd(digits, '0'));
    if (n > BigInt(max)) throw Error(label + '超出支持范围');
    return Number(n);
  }
  const cents = v => decimal(v, 2, LIMITS.cents, '金额');
  const quantity = v => decimal(v, 3, 1000000000, '数量');
  const money = n => (n < 0 ? '-' : '') + Math.floor(Math.abs(n) / 100) + '.' + String(Math.abs(n) % 100).padStart(2, '0');
  function date(v) {
    if (v === '') return '';
    if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(v)) throw Error('日期格式无效');
    const [y, m, d] = v.split('-').map(Number), test = new Date(y, m - 1, d, 12);
    if (y < 2000 || y > 2200 || test.getFullYear() !== y || test.getMonth() !== m - 1 || test.getDate() !== d) throw Error('日期不存在或超出范围');
    return v;
  }
  function empty() {
    return { format: 'college-activity-assistant', version: 1, name: '我的学院活动', raw: '', basic: { title: '', kind: '学术讲座', customKind: '', people: '', budget: '', date: '', time: '', duration: '120', venue: '', goal: '', organizer: '' }, reservePercent: '10', items: [], funding: [], tasks: [], approvals: { venue: false, finance: false, safety: false, team: false }, scenarios: [] };
  }
  function basic(raw) {
    if (!plain(raw)) throw Error('活动条件格式无效');
    const b = {};
    for (const [key, max] of Object.entries({ title: 120, people: 6, budget: 16, time: 5, duration: 4, venue: 200, goal: 1500, organizer: 100 })) b[key] = str(raw[key], max);
    b.kind = choice(raw.kind, KINDS); b.customKind = raw.customKind === undefined ? '' : str(raw.customKind, 80); b.date = date(raw.date);
    if (b.people && (!/^\d+$/.test(b.people) || +b.people < 1 || +b.people > 100000)) throw Error('人数应为 1 到 100000 的整数');
    if (b.budget) cents(b.budget);
    if (b.duration && (!/^\d+$/.test(b.duration) || +b.duration < 15 || +b.duration > 1440)) throw Error('时长应为 15 到 1440 分钟');
    if (b.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)) throw Error('开始时刻无效');
    return b;
  }
  const kindLabel = b => b.kind === '自定义' ? b.customKind || '自定义活动' : b.kind;
  function items(raw) {
    if (!Array.isArray(raw) || raw.length > LIMITS.items) throw Error('预算明细最多 200 项');
    const ids = new Set();
    return raw.map(r => {
      if (!plain(r)) throw Error('预算明细无效'); const rid = id(r.id); if (ids.has(rid)) throw Error('预算编号重复'); ids.add(rid);
      const result = { id: rid, label: str(r.label, 160), category: choice(r.category, CATEGORIES), quantity: str(r.quantity, 16), unit: str(r.unit, 20), unitPrice: str(r.unitPrice, 16), actual: str(r.actual, 16), quote: choice(r.quote, ['estimate', 'quoted']), source: str(r.source, 500), note: str(r.note, 500) };
      if (!result.label) throw Error('请填写预算项目名称');
      quantity(result.quantity); cents(result.unitPrice); if (result.actual) cents(result.actual);
      return result;
    });
  }
  function funding(raw) {
    if (!Array.isArray(raw) || raw.length > LIMITS.funding) throw Error('资金来源最多 20 项');
    const ids = new Set();
    return raw.map(f => {
      if (!plain(f)) throw Error('资金记录无效'); const fid = id(f.id); if (ids.has(fid)) throw Error('资金编号重复'); ids.add(fid);
      const out = { id: fid, name: str(f.name, 100), amount: str(f.amount, 16), status: choice(f.status, ['confirmed', 'pending']), source: str(f.source, 500) };
      if (!out.name) throw Error('请填写资金来源名称'); cents(out.amount); return out;
    });
  }
  function normalize(raw) {
    if (!plain(raw) || raw.format !== 'college-activity-assistant' || raw.version !== 1) throw Error('请选择学院活动助手的项目备份；原课设项目需在原版本打开');
    const p = empty(); p.name = str(raw.name, 100); p.raw = str(raw.raw, LIMITS.text); p.basic = basic(raw.basic);
    p.reservePercent = str(raw.reservePercent, 8); decimal(p.reservePercent, 2, 3000, '预备金比例'); p.items = items(raw.items); p.funding = funding(raw.funding);
    if (!Array.isArray(raw.tasks) || raw.tasks.length > LIMITS.tasks) throw Error('执行任务最多 100 项');
    const ids = new Set();
    p.tasks = raw.tasks.map(t => {
      if (!plain(t)) throw Error('执行任务无效'); const tid = id(t.id); if (ids.has(tid)) throw Error('任务编号重复'); ids.add(tid);
      if (!Number.isInteger(t.offset) || t.offset < -180 || t.offset > 180) throw Error('任务相对天数无效');
      if (!str(t.title, 300)) throw Error('请填写执行任务名称');
      return { id: tid, title: str(t.title, 300), owner: str(t.owner, 100), offset: t.offset, status: choice(t.status, ['todo', 'doing', 'done']), note: str(t.note, 1000) };
    });
    if (!plain(raw.approvals)) throw Error('核对记录无效');
    for (const key of Object.keys(p.approvals)) { if (typeof raw.approvals[key] !== 'boolean') throw Error('核对状态无效'); p.approvals[key] = raw.approvals[key]; }
    if (!Array.isArray(raw.scenarios) || raw.scenarios.length > 4) throw Error('最多保存 4 个对比方案');
    p.scenarios = raw.scenarios.map(s => { if (!plain(s)) throw Error('对比方案无效'); const reserve = str(s.reservePercent, 8); decimal(reserve, 2, 3000, '预备金比例'); return { name: str(s.name, 60), raw: str(s.raw ?? '', LIMITS.text), basic: basic(s.basic), items: items(s.items), funding: funding(s.funding), reservePercent: reserve }; });
    for (const scenario of p.scenarios) calculateBudget(scenario);
    return p;
  }
  function analyze(project) {
    return calculateBudget(normalize(project));
  }
  function calculateBudget(p) {
    let subtotal = 0n, actual = 0n, actualCount = 0, confirmed = 0n, pending = 0n;
    const category = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
    const lines = p.items.map(i => {
      const value = (BigInt(quantity(i.quantity)) * BigInt(cents(i.unitPrice)) + 500n) / 1000n;
      if (value > BigInt(LIMITS.cents)) throw Error('单项预算总额超出范围');
      subtotal += value; category[i.category] += Number(value);
      if (i.actual !== '') { actual += BigInt(cents(i.actual)); actualCount++; }
      return { ...i, subtotalCents: Number(value) };
    });
    const reserve = (subtotal * BigInt(decimal(p.reservePercent, 2, 3000, '预备金比例')) + 5000n) / 10000n, total = subtotal + reserve;
    if (total > BigInt(LIMITS.cents) || actual > BigInt(LIMITS.cents)) throw Error('预算或实支总额超出范围');
    for (const f of p.funding) { if (f.status === 'confirmed') confirmed += BigInt(cents(f.amount)); else pending += BigInt(cents(f.amount)); }
    if (confirmed + pending > BigInt(LIMITS.cents)) throw Error('资金总额超出范围');
    const ceiling = p.basic.budget === '' ? null : cents(p.basic.budget), totalCents = Number(total);
    return { lines, subtotalCents: Number(subtotal), reserveCents: Number(reserve), totalCents, ceilingCents: ceiling, balanceCents: ceiling === null ? null : ceiling - totalCents, overBudget: ceiling === null ? null : totalCents > ceiling, confirmedCents: Number(confirmed), pendingCents: Number(pending), fundingGapCents: Math.max(0, totalCents - Number(confirmed)), actualCents: Number(actual), actualCount, unreconciled: p.items.length - actualCount, actualVarianceCents: actualCount === p.items.length && p.items.length ? Number(actual) - Number(subtotal) : null, perPersonCents: p.basic.people ? Math.round(totalCents / +p.basic.people) : null, categories: category };
  }
  function chineseNumber(s) {
    if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
    const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }, units = { 十: 10, 百: 100, 千: 1000 };
    if (/^[零〇一二两三四五六七八九]+$/.test(s)) return Number([...s].map(c => digits[c]).join(''));
    if (/[百千万][一二两三四五六七八九]$/.test(s)) return NaN;
    let total = 0, section = 0, value = 0;
    for (const c of s) { if (/\d/.test(c)) value = value * 10 + Number(c); else if (Object.hasOwn(digits, c)) value = digits[c]; else if (units[c]) { section += (value || 1) * units[c]; value = 0; } else if (c === '万') { total += (section + value || 1) * 10000; section = 0; value = 0; } else return NaN; }
    return total + section + value;
  }
  function parseBrief(text) {
    text = str(text, LIMITS.text); if (!text) throw Error('先说说活动想法，一句话也可以');
    const patch = {}, evidence = [], warnings = [], number = '([0-9零〇一二两三四五六七八九十百千万]+(?:\\.[0-9]+)?)';
    const capture = (key, regex, convert = s => s) => { const m = text.match(regex); if (m) { const value = convert(m[1]); if (typeof value === 'number' && !Number.isFinite(value)) { patch[key] = ''; warnings.push(({ people: '人数', budget: '预算', duration: '时长' }[key] || '数字') + '写法不明确，请用阿拉伯数字或完整中文数字填写'); } else if (value != null) { patch[key] = String(value); const index = text.indexOf(m[0]); evidence.push({ field: key, raw: m[0], line: text.slice(0, index).split(/\r?\n/).length }); } } };
    capture('people', new RegExp(number + '\\s*(?:个?人|名同学|位同学)'), chineseNumber);
    capture('budget', new RegExp('(?:预算|经费|限额|不超过|最多花)[：:\\s]*(?:(?:控制在|调整为|调整到|改为|降低到|降到|压到|不超过|约为|为|是|约)[：:\\s]*)?(?:人民币)?' + number + '\\s*(?:元|块钱|块|人民币)'), chineseNumber);
    const title = text.match(/(?:活动名称|主题)[：:\s]+([^\n，。；]{1,120})/); if (title) patch.title = title[1];
    if (!patch.title) { const m = text.match(/(?:办|举办|组织|策划)(?:一场|一个|一次|个)?([^，。\n]{2,24}?(?:讲座|活动|比赛|培训|团建|交流会|志愿服务|市集|集市|沙龙|展览|研讨会))/); if (m) patch.title = m[1]; }
    const explicitKind = text.match(/(?:活动类型|自定义类型|类型)[：:\s]+([^\n，。；]{1,80})/);
    if (explicitKind) { patch.kind = KINDS.includes(explicitKind[1].trim()) ? explicitKind[1].trim() : '自定义'; patch.customKind = patch.kind === '自定义' && explicitKind[1].trim() !== '自定义' ? explicitKind[1].trim() : ''; }
    else if (/志愿|公益/.test(text)) patch.kind = '志愿服务'; else if (/运动|比赛|文艺|晚会|球赛/.test(text)) patch.kind = '文体活动'; else if (/迎新|团建/.test(text)) patch.kind = '迎新团建'; else if (/培训|交流/.test(text)) patch.kind = '培训交流'; else if (/讲座|学术|分享/.test(text)) patch.kind = '学术讲座';
    else { const custom = text.match(/(?:校园|学院|社团|读书|科创|创意|文化)?(?:市集|集市|沙龙|展览|研讨会)/); if (custom) { patch.kind = '自定义'; patch.customKind = custom[0]; } }
    capture('venue', /(?:地点|场地)(?:[：:\s]+|(?:改到|改为|调整到|在|是)[：:\s]*)([^\n，。；]{1,100})/);
    const nextField = '(?:(?:活动名称|活动类型|地点|场地|主办|承办)[：:\\s]|(?:预算|经费|人数|预计人数|时长|日期|活动日期|开始时间|开始时刻|开始)(?=[：:\\s0-9零〇一二两三四五六七八九十百千万]))';
    capture('goal', new RegExp('(?:活动目标|目标|目的)[：:\\s]+([^\\n；]{1,500}?)(?=[，,。]\\s*' + nextField + '|[；\\n]|$)'));
    capture('time', /(?:开始时间|开始时刻|开始)(?:改为|改到|定在)?[：:\s]*((?:[01]?\d|2[0-3]):[0-5]\d)/, s => s.padStart(5, '0'));
    capture('duration', new RegExp('(?:时长|持续|安排)(?:改为|改成|为|约)?[：:\\s]*' + number + '\\s*分钟'), chineseNumber);
    if (!patch.duration) capture('duration', new RegExp('(?:时长|持续)(?:改为|改成|为|约)?[：:\\s]*' + number + '\\s*小时'), s => chineseNumber(s) * 60);
    capture('organizer', /(?:主办|承办)(?:单位)?[：:\s]+([^\n，。；]{1,100})/);
    const dm = text.match(/(20\d\d)[年/-](\d{1,2})[月/-](\d{1,2})日?/);
    if (dm) { const candidate = `${dm[1]}-${dm[2].padStart(2, '0')}-${dm[3].padStart(2, '0')}`; try { patch.date = date(candidate); evidence.push({ field: 'date', raw: dm[0], line: text.slice(0, text.indexOf(dm[0])).split(/\r?\n/).length }); } catch (_) { patch.date = ''; warnings.push('这个日期无效，请在“活动日期”中选择具体年月日'); } }
    else if (/明天|下周|周末|月底|月\d{1,2}日/.test(text)) { patch.date = ''; warnings.push('请在“活动日期”中选择具体年月日，暂不采用相对时间或缺年份日期'); }
    if (patch.people && (!/^\d+$/.test(patch.people) || +patch.people < 1 || +patch.people > 100000)) { patch.people = ''; warnings.push('人数超出范围，请手动填写'); }
    if (patch.budget) { try { cents(patch.budget); } catch (_) { patch.budget = ''; warnings.push('预算金额无效，请手动填写'); } }
    if (patch.duration && (!/^\d+$/.test(patch.duration) || +patch.duration < 15 || +patch.duration > 1440)) { patch.duration = ''; warnings.push('活动时长请填写15到1440分钟'); }
    const budgetMatches = [...text.matchAll(new RegExp('(?:预算|经费|限额)[约为是：:\\s]*' + number + '\\s*(?:元|块)', 'g'))];
    if (new Set(budgetMatches.map(m => chineseNumber(m[1]))).size > 1) { patch.budget = ''; warnings.push('原文预算不一致，请在“预算上限”中确认最终金额'); }
    const peopleMatches = [...text.matchAll(new RegExp(number + '\\s*(?:个?人|名同学|位同学)', 'g'))];
    if (new Set(peopleMatches.map(m => chineseNumber(m[1]))).size > 1) { patch.people = ''; warnings.push('原文人数不一致，请在“预计人数”中确认最终人数'); }
    for (const [field, label, unit] of [['budget', '(?:预算|经费)', '(?:元|块钱|块)'], ['people', '(?:人数|参与人数)', '(?:个?人|名|位)']]) {
      const changes = [...text.matchAll(new RegExp(label + '[^，。\\n]{0,24}?(?:改为|改成|调整为|调整到|降低到|降到|压到)[：:\\s]*' + number + '\\s*' + unit, 'g'))];
      if (!changes.length) continue;
      const values = new Set(changes.map(m => chineseNumber(m[1])));
      if (values.size !== 1) { patch[field] = ''; const message = field === 'budget' ? '原文预算不一致，请在“预算上限”中确认最终金额' : '原文人数不一致，请在“预计人数”中确认最终人数'; if (!warnings.includes(message)) warnings.push(message); continue; }
      if (![...values].every(Number.isFinite)) { patch[field] = ''; const message = (field === 'budget' ? '预算' : '人数') + '写法不明确，请用阿拉伯数字或完整中文数字填写'; if (!warnings.includes(message)) warnings.push(message); continue; }
      const value = String([...values][0]);
      if (field === 'people' && (!/^\d+$/.test(value) || +value < 1 || +value > 100000)) continue;
      if (field === 'budget') { try { cents(value); } catch (_) { continue; } }
      patch[field] = value;
      const entry = changes.at(-1); evidence.push({ field, raw: entry[0], line: text.slice(0, entry.index).split(/\r?\n/).length });
      const warning = field === 'budget' ? '原文预算不一致，请在“预算上限”中确认最终金额' : '原文人数不一致，请在“预计人数”中确认最终人数';
      if (warnings.includes(warning)) warnings.splice(warnings.indexOf(warning), 1);
    }
    return { patch, evidence, warnings, raw: text };
  }
  function missing(project) {
    const b = basic(project.basic), fields = [['title', '活动名称'], ['people', '参与人数'], ['budget', '预算上限'], ['date', '活动日期'], ['venue', '活动地点'], ['goal', '活动目标']];
    if (b.kind === '自定义') fields.push(['customKind', '自定义活动类型']);
    return fields.filter(([k]) => b[k] === '').map(([field, label]) => ({ field, label }));
  }
  function suggestBudget(project, lean = false) {
    const p = normalize(project); if (!p.basic.budget) throw Error('先填写预算上限，再生成预算初稿');
    const cap = cents(p.basic.budget), allocations = lean ? [15, 5, 25, 10, 5] : [25, 10, 25, 15, 5];
    const labels = ['场地与设备统筹', '宣传与印刷', '活动材料包', '现场保障物资', '其他必要支出'];
    return labels.map((label, i) => ({ id: uid(), label, category: CATEGORIES[i], quantity: '1', unit: '批', unitPrice: money(Math.floor(cap * allocations[i] / 100)), actual: '', quote: 'estimate', source: 'ACT-02：按预算上限比例分配，需用询价结果替换', note: lean ? '节约版分配假设，不是市场报价' : '标准版分配假设，不是市场报价' }));
  }
  function draftPlan(project) {
    const p = normalize(project), b = p.basic, duration = +(b.duration || 120), ratios = [10, 10, 55, 20, 5];
    const names = ['签到与引导', '开场与规则说明', b.kind === '学术讲座' ? '主题分享与交流' : b.kind === '志愿服务' ? '分组服务与现场协调' : b.kind === '自定义' && b.customKind ? b.customKind + '与现场协调' : '主题活动与分组执行', '互动反馈与成果整理', '收尾与场地恢复'];
    let used = 0;
    const agenda = names.map((title, i) => { const minutes = i === names.length - 1 ? duration - used : Math.floor(duration * ratios[i] / 100); const start = used; used += minutes; return { title, startMinute: start, minutes, owner: i === 0 ? '签到组（待指定）' : i === 4 ? '后勤组（待指定）' : '执行组（待指定）' }; });
    const tasks = [['确认目标、人数与方案', -14, '统筹组'], ['按本校流程确认场地与审批', -10, '统筹组'], ['询价、核对经费与采购清单', -7, '财务组'], ['发布经审核的活动通知', -5, '宣传组'], ['确认人员分工与物资', -2, '执行组'], ['检查现场和备选安排', -1, '后勤组'], ['执行活动、记录问题', 0, '执行组'], ['核对票据、实际支出与反馈', 2, '财务组']].map(([title, offset, owner]) => ({ id: uid(), title, offset, owner, status: 'todo', note: '相对活动日期的建议节点，可按实际修改' }));
    const risks = ['场地容量、通道与设备条件待现场确认', '拟申请经费和赞助需确认后才能计入可用资金', '宣传、肖像与报名资料按本校要求处理'];
    if (/户外|操场|广场|室外/.test(b.venue + p.raw)) risks.push('户外活动补充天气备选、场地替代与取消条件');
    if (+b.people >= 200) risks.push('人数较多，补充分区引导、签到分流与现场负责人');
    return { title: b.title || '待命名活动', objective: b.goal || '活动目标待确认', agenda, tasks, risks, missing: missing(p), references: ['ACT-01', 'ACT-04', 'ACT-05'] };
  }
  function review(project) {
    const p = normalize(project), a = analyze(p), result = missing(p).map(m => ({ level: '待确认', text: m.label + '尚未填写', reference: 'ACT-01' }));
    if (!p.items.length) result.push({ level: '待确认', text: '尚无预算明细', reference: 'ACT-02' });
    if (a.overBudget) result.push({ level: '需调整', text: '计划总额超过预算上限 ' + money(-a.balanceCents) + ' 元', reference: 'ACT-02' });
    if (a.ceilingCents !== null && a.actualCents > a.ceilingCents) result.push({ level: '需调整', text: '已登记实际支出超过预算上限 ' + money(a.actualCents - a.ceilingCents) + ' 元', reference: 'ACT-05' });
    if (a.actualVarianceCents !== null && a.actualVarianceCents > 0) result.push({ level: '需核对', text: '实际支出超过明细预算 ' + money(a.actualVarianceCents) + ' 元，预备金单独列示', reference: 'ACT-05' });
    if (a.fundingGapCents) result.push({ level: '待确认', text: '相对已确认资金缺口 ' + money(a.fundingGapCents) + ' 元；未确认资金不计入', reference: 'ACT-03' });
    if (p.items.some(i => i.quote === 'estimate' || !i.source)) result.push({ level: '待确认', text: '部分价格为估算或缺少询价来源', reference: 'ACT-02' });
    for (const [key, title] of Object.entries({ venue: '场地', finance: '经费', safety: '现场安排', team: '人员职责' })) if (!p.approvals[key]) result.push({ level: '待确认', text: title + '尚未人工核对', reference: 'ACT-04' });
    if (p.tasks.some(t => !t.owner)) result.push({ level: '待确认', text: '部分执行任务尚未指定负责人', reference: 'ACT-04' });
    return result.length ? result : [{ level: '记录完整', text: '当前记录未发现上述缺项；仍需实际审批与执行核验', reference: 'ACT-04' }];
  }
  function taskDate(project, task) {
    if (!project.basic.date) return '';
    const d = new Date(project.basic.date + 'T12:00:00'); d.setDate(d.getDate() + task.offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function report(project) {
    const p = normalize(project), a = analyze(p), plan = draftPlan(p), b = p.basic;
    const lines = [`# ${b.title || p.name || '学院活动策划书'}`, '', '> 这是一份本机规则生成的草案，不代表审批结果；估算金额、日期和人员职责仍需核对。', '', '## 一、活动概况', `- 类型：${kindLabel(b)}`, `- 主办：${b.organizer || '待确认'}`, `- 目标：${b.goal || '待确认'}`, `- 日期：${b.date || '待确认'} ${b.time || '时刻待确认'}`, `- 地点：${b.venue || '待确认'}`, `- 人数：${b.people || '待确认'}`, '', '## 二、建议流程', ...plan.agenda.map(x => `- ${x.startMinute}–${x.startMinute + x.minutes} 分钟：${x.title}；${x.owner}`), '', '## 三、预算明细（元）', ...a.lines.map(i => `- ${i.label}：${i.quantity} ${i.unit} × ${i.unitPrice} = ${money(i.subtotalCents)}；${i.quote === 'quoted' ? '用户标记已询价' : '估算待询价'}；来源：${i.source || '待补充'}`), `- 明细小计：${money(a.subtotalCents)}`, `- 预备金（${p.reservePercent}%）：${money(a.reserveCents)}`, `- 计划总额：${money(a.totalCents)}`, `- 预算上限：${a.ceilingCents === null ? '待确认' : money(a.ceilingCents)}`, `- 预算结余（负数为超支）：${a.balanceCents === null ? '待确认' : money(a.balanceCents)}`, `- 已确认资金（按用户记录）：${money(a.confirmedCents)}`, `- 待确认资金：${money(a.pendingCents)}`, `- 相对已确认资金的缺口：${money(a.fundingGapCents)}`, `- 已登记实际支出：${money(a.actualCents)}；未核销 ${a.unreconciled} 项`, '', '## 四、执行清单', ...p.tasks.map(t => `- [${t.status === 'done' ? 'x' : ' '}] ${taskDate(p, t) || '日期待定'} / ${t.title} / ${t.owner || '负责人待定'} / ${t.note}`), '', '## 五、风险与待确认', ...plan.risks.map(t => '- ' + t), ...review(p).map(x => `- ${x.level}：${x.text} [${x.reference}]`), '', '## 六、原始需求', p.raw || '手动填写', '', '## 七、规则来源', ...KB.map(k => `- [${k.id}] ${k.title}：${k.text}（${k.source}）`)];
    const actualIndex = lines.findIndex(line => line.startsWith('- 已登记实际支出'));
    lines.splice(actualIndex + 1, 0, '- 已登记实支 − 明细预算（不含预备金，正数表示超出）：' + (a.actualVarianceCents === null ? (p.items.length ? '尚有实支未登记，暂不比较' : '尚无预算明细，暂不比较') : money(a.actualVarianceCents) + ' 元'));
    if (!b.duration) lines.splice(lines.indexOf('## 二、建议流程') + 1, 0, '时长未填写，以下先按120分钟排布，请确认后调整。');
    return lines.join('\n');
  }
  const csvCell = v => { let s = String(v ?? ''); if (/^[\s\u0000-\u001f\u007f]*[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  function csv(project) { const p = normalize(project), a = analyze(p); return '\uFEFF' + [['项目', '类别', '数量', '单位', '单价/元', '计划金额/元', '实际支出/元', '询价状态', '来源'], ...a.lines.map(i => [i.label, i.category, i.quantity, i.unit, i.unitPrice, money(i.subtotalCents), i.actual, i.quote === 'quoted' ? '用户标记已询价' : '估算待询价', i.source]), ['明细小计', '', '', '', '', money(a.subtotalCents)], ['预备金', '', p.reservePercent + '%', '', '', money(a.reserveCents)], ['计划总额', '', '', '', '', money(a.totalCents)]].map(r => r.map(csvCell).join(',')).join('\r\n'); }
  function ics(project) {
    const p = normalize(project); if (!p.basic.date) throw Error('先确认活动日期，才能导出日历');
    const escape = s => String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const fold = line => { const encoder = new TextEncoder(); let current = '', size = 0, out = []; for (const c of line) { const n = encoder.encode(c).length; if (size + n > 75) { out.push(current); current = ' '; size = 1; } current += c; size += n; } out.push(current); return out.join('\r\n'); };
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//College Activity Assistant//ZH-CN'];
    const tasks = p.tasks.filter(t => t.status !== 'done');
    for (const t of tasks) { const start = taskDate(p, t), next = new Date(start + 'T12:00:00'); next.setDate(next.getDate() + 1); const end = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}${String(next.getDate()).padStart(2, '0')}`; lines.push('BEGIN:VEVENT', 'UID:' + t.id + '@college-activity.local', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'), 'DTSTART;VALUE=DATE:' + start.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + end, 'SUMMARY:' + escape(t.title), 'DESCRIPTION:' + escape('负责人：' + (t.owner || '待定') + '\n' + t.note), 'END:VEVENT'); }
    lines.push('END:VCALENDAR'); return lines.map(fold).join('\r\n') + '\r\n';
  }
  function runTool(request) {
    if (!plain(request) || !plain(request.arguments)) throw Error('工具请求格式无效');
    const args = request.arguments;
    if (request.tool === 'parse_brief') return parseBrief(args.text);
    if (request.tool === 'knowledge_lookup') { const query = str(args.query, 300); return KB.filter(k => !query || (k.title + k.text + k.id).includes(query)); }
    const project = normalize(args.project);
    if (request.tool === 'draft_plan') return draftPlan(project);
    if (request.tool === 'suggest_budget') return { items: suggestBudget(project, args.lean === true), assumption: '按预算上限比例分配的预算初稿，非市场报价 [ACT-02]' };
    if (request.tool === 'analyze_budget') return analyze(project);
    if (request.tool === 'review_activity') return review(project);
    if (request.tool === 'build_report') return { markdown: report(project) };
    throw Error('工具名称不在白名单中');
  }
  return Object.freeze({ VERSION, KINDS, CATEGORIES, LIMITS, KB, uid, cents, quantity, money, empty, normalize, kindLabel, analyze, parseBrief, missing, suggestBudget, draftPlan, review, taskDate, report, csvCell, csv, ics, runTool });
});
