const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const core=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/engine.js'),'utf8'),core);
const parse=text=>core.parseTaskbook(text);
test('a casual request without numbers can start without invented data',()=>{
 const p=parse('我想做梁的课设，还不知道要准备什么。');assert.equal(Object.keys(p.found).length,0);assert.equal(p.intake_questions[0].key,'L_m');
});
test('a single known span is retained and remaining questions are progressive',()=>{
 const p=parse('我只知道梁长六米，其他的还没确定。');assert.equal(p.found.L_m.value,6);assert.equal(p.found.E_GPa,undefined);assert.equal(p.found.q_kN_m,undefined);assert.equal(p.intake_questions[0].key,'q_kN_m');
});
test('spoken mixed-load description yields correct explicit parameters',()=>{
 const p=parse('帮我算一根六米长的简支梁，钢的，上面每米压十千牛，还有集中力二十千牛，离左边两米。\n截面宽十六厘米，高四十厘米，弹性模量二百零六GPa，许用应力160MPa。');
 for(const [key,value]of Object.entries({L_m:6,q_kN_m:10,P_kN:20,a_m:2,E_GPa:206,b_mm:160,h_mm:400}))assert.equal(p.found[key].value,value,key);
 assert.equal(p.found.section.b_mm,160);assert.equal(p.found.section.h_mm,400);assert.equal(p.conflicts.length,0);assert.equal(p.intake_questions.length,0);
 const raw=core.parsedToInput(p),{params,problems}=core.validate(raw);assert.equal(problems.errors.length,0);const r=core.calc(params);assert.ok(Math.abs(r.internal.Mmax_kN_m-67.22222222222222)<1e-8);
});
test('steel alone records material without guessing modulus or allowable stress',()=>{
 const p=parse('是钢的，只知道梁长6米');assert.match(p.found.material_name.material,/待确认/);assert.equal(p.found.E_GPa,undefined);assert.equal(p.found.sigma_allow_MPa,undefined);
});
test('explicit no-load phrases produce zero only for the named kind',()=>{
 const p=parse('梁长6米，没有均布荷载，有个20千牛的设备，离左边2米。');assert.equal(p.found.q_kN_m.value,0);assert.equal(p.found.P_kN.value,20);assert.equal(p.found.a_m.value,2);
 const second=parse('梁长6米，每米十千牛，没有集中力。');assert.equal(second.found.P_kN.value,0);assert.equal(second.found.q_kN_m.value,10);
});
test('explicit zero load is not overridden by a later unrelated number',()=>{const p=parse('没有集中力，跨度6米，弹性模量206GPa');assert.equal(p.found.P_kN.value,0);assert.equal(p.conflicts.length,0);});
test('symbol input works and L/250 is not parsed as a second span',()=>{
 const p=parse('L=6m，q=10kN/m，P=20kN，a=2m，E=206GPa\n矩形截面160×400mm，挠度不超过L/250');assert.equal(p.found.L_m.value,6);assert.equal(p.conflicts.length,0);assert.equal(p.found.deflection_limit_divisor.value,250);
});
test('Chinese decimal and full-width digits normalize while original evidence remains',()=>{
 const original='梁长六点五米\n截面宽１６厘米，高４０厘米';const p=parse(original);assert.equal(p.found.L_m.value,6.5);assert.equal(p.found.section.b_mm,160);assert.equal(p.found.L_m.snippet,'梁长六点五米');assert.equal(p.source_chars,original.length);
});
test('Chinese number conversion handles tens, hundreds and explicit digits',()=>{
 for(const [text,n]of [['十',10],['二十六',26],['二百零六',206],['一千零一',1001],['一六零',160],['六点五',6.5]])assert.equal(core.chineseNumber(text),n);
 for(const text of ['集中力2万牛','集中力20千牛','集中力二十千牛'])assert.equal(parse(text).found.P_kN.value,20);
});
test('partial width stays partial until height is explicitly provided',()=>{
 const p=parse('梁长6米，宽16厘米');assert.equal(p.found.b_mm.value,160);assert.equal(p.found.h_mm,undefined);assert.equal(p.found.section,undefined);
 const complete=parse('梁长6米，宽16厘米\n补充：截面高40厘米');assert.equal(complete.found.section.h_mm,400);
});
test('circle diameter is supported and transferred as a circle',()=>{const p=parse('梁长6米，圆钢直径10厘米');assert.equal(p.found.section.shape,'circle');assert.equal(core.parsedToInput(p).section.d_mm,100);});
test('load at midspan uses known span and does not guess a missing span',()=>{
 assert.equal(parse('跨度6米，跨中放20千牛').found.a_m.value,3);
 assert.equal(parse('跨中放20千牛').found.a_m,undefined);
 assert.equal(parse('跨度6米，集中荷载20kN。要求计算跨中弯矩').found.a_m,undefined);
});
test('distance from right support converts only after span is known',()=>{assert.equal(parse('跨度6米，集中力20千牛，离右边2米').found.a_m.value,4);assert.equal(parse('集中力20千牛，离右边2米').found.a_m,undefined);});
test('contradictory numeric descriptions continue to require a decision',()=>{assert.ok(parse('梁长六米\n补充：梁长八米').conflicts.some(c=>c.key==='L_m'));});
test('mass and vague descriptions do not silently turn into forces',()=>{const p=parse('梁上有个20公斤的设备，长度6米');assert.equal(p.found.P_kN,undefined);assert.equal(p.found.q_kN_m,undefined);});
test('unrelated calculation types are retained but do not produce beam questions',()=>{const p=parse('我想设计一个减速器，功率2千瓦');assert.ok(p.unsupported.length);assert.equal(p.intake_questions.length,0);});
test('unknown units remain unresolved after everyday parsing',()=>{assert.equal(parse('跨度6m/s').found.L_m.unit_ok,false);});
