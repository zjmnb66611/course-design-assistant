const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const core = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/engine.js'), 'utf8'), core);
function input(overrides = {}) {
  return { beam:{ L_m:6 }, loads:{ q_kN_m:10, P_kN:0 }, material:{ E_GPa:206, sigma_allow_MPa:160 }, section:{ shape:'rect', b_mm:100, h_mm:200 }, criteria:{ deflection_limit_divisor:250 }, ...overrides };
}
function solve(raw) {
  const {params:p,problems}=core.validate(raw);
  assert.equal(problems.errors.length,0,JSON.stringify(problems));
  const result=core.calc(p);core.verify(p,result);return {p,result,problems};
}
function near(actual,expected,tolerance=1e-8){assert.ok(Math.abs(actual-expected)<=tolerance*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`);}
test('uniform load: reactions, moment, and independently known 5qL^4/384EI deflection',()=>{
  const {p,result:r}=solve(input());
  near(r.reactions.RA_kN,30);near(r.reactions.RB_kN,30);near(r.internal.Mmax_kN_m,45);near(r.internal.x_Mmax_m,3);
  near(r.deflection.delta_max_mm,5*10000*6**4/(384*p.E_SI*p.I_SI)*1000);
  assert.equal(r.checks.all_pass,true);
});
test('central point load: PL/4 and PL^3/48EI',()=>{
  const {p,result:r}=solve(input({loads:{q_kN_m:0,P_kN:20,a_m:3}}));
  near(r.internal.Mmax_kN_m,30);near(r.deflection.delta_max_mm,20000*6**3/(48*p.E_SI*p.I_SI)*1000);
  assert.equal(r.checks.all_pass,true);
});
test('off-center point load includes a vertical P jump at its exact position',()=>{
  const {result:r}=solve(input({loads:{q_kN_m:0,P_kN:20,a_m:1.234}}));
  near(r.reactions.RA_kN,20*(6-1.234)/6);near(r.internal.Mmax_kN_m,20*1.234*(6-1.234)/6);
  const points=r.internal.samples.filter(s=>s.x_m===1.234);assert.equal(points.length,2);near(points[0].V_kN-points[1].V_kN,20);near(points[0].M_kN_m,points[1].M_kN_m);
  assert.equal(r.checks.all_pass,true);
});
for(const a of [0,6])test(`point load at support a=${a} adds no interior moment or shear`,()=>{
  const {result:r}=solve(input({loads:{q_kN_m:0,P_kN:20,a_m:a}}));
  near(r.internal.Vmax_kN,0);near(r.internal.Mmax_kN_m,0);near(r.deflection.delta_max_mm,0);assert.equal(r.checks.all_pass,true);
});
test('right support point load with UDL preserves interior shear = qL/2',()=>{
  const {result:r}=solve(input({loads:{q_kN_m:10,P_kN:20,a_m:6}}));near(r.internal.Vmax_kN,30);near(r.internal.samples.at(-1).V_kN,-30);assert.equal(r.checks.all_pass,true);
});
test('mixed-load reference values and stress conversion',()=>{
  const {result:r}=solve(input({loads:{q_kN_m:10,P_kN:20,a_m:2}}));near(r.reactions.RA_kN,43+1/3);near(r.reactions.RB_kN,36+2/3);near(r.internal.Mmax_kN_m,67+2/9);near(r.stress.sigma_max_MPa,100+5/6);assert.equal(r.checks.all_pass,true);
});
test('empty loads produce finite zeros and passing numerical checks',()=>{const {result:r}=solve(input({loads:{}}));near(r.internal.Mmax_kN_m,0);assert.equal(r.checks.all_pass,true);});
test('circle and custom section properties',()=>{
  const c=solve(input({section:{shape:'circle',d_mm:200}}));near(c.p.I_mm4,Math.PI*200**4/64);near(c.p.W_mm3,Math.PI*200**3/32);
  const s=solve(input({section:{shape:'custom',I_mm4:1e8,W_mm3:1e6}}));near(s.result.stress.sigma_max_MPa,45);
});
for(const value of ['1junk',Infinity,'1e309',true,{}])test(`invalid numeric values are rejected: ${String(value)}`,()=>{
  const raw=input();raw.loads.q_kN_m=value;assert.ok(core.validate(raw).problems.errors.length);
});
for(const value of [0,-2,49,1001])test(`invalid deflection divisor does not silently become 250: ${value}`,()=>{
  const raw=input({criteria:{deflection_limit_divisor:value}});assert.ok(core.validate(raw).problems.errors.length);
});
test('optional stress if absent is unjudged; invalid stress is rejected',()=>{
  const raw=input();delete raw.material.sigma_allow_MPa;const {result:r}=solve(raw);assert.equal(r.stress.pass,null);
  raw.material.sigma_allow_MPa=-1;assert.ok(core.validate(raw).problems.errors.length);
});
test('overflow and tiny sections are rejected before solving',()=>{
  for(const section of [{shape:'circle',d_mm:1e100},{shape:'rect',b_mm:1e-100,h_mm:1e-100},{shape:'custom',I_mm4:1e308,W_mm3:1}])assert.ok(core.validate(input({section})).problems.errors.length);
});
test('position outside beam and missing point-load position are flagged',()=>{
  assert.ok(core.validate(input({loads:{q_kN_m:0,P_kN:5,a_m:7}})).problems.errors.length);
  assert.ok(core.validate(input({loads:{q_kN_m:0,P_kN:5}})).problems.missing.some(m=>m.key==='loads.a_m'));
});
test('unit matching is exact: m/s does not match m',()=>{assert.equal(core.matchUnit('m/s',core.ULEN),null);near(core.matchUnit('mm',core.ULEN),.001);});
test('task units convert mm, N, MPa and section cm to calculator units',()=>{
  const parsed=core.parseTaskbook('跨度 6000 毫米\n均布荷载 10000 N/m\n集中荷载 20000 N，距左支座 2000 mm\n弹性模量 206000 MPa\n矩形截面 10 × 20 cm');
  near(parsed.found.L_m.value,6);near(parsed.found.q_kN_m.value,10);near(parsed.found.P_kN.value,20);near(parsed.found.a_m.value,2);near(parsed.found.E_GPa.value,206);near(parsed.found.section.b_mm,100);near(parsed.found.section.h_mm,200);
});
test('missing units remain unresolved and unsupported models are flagged',()=>{
  const parsed=core.parseTaskbook('悬臂梁\n跨度 6 m/s\n矩形截面 100 × 200');assert.equal(parsed.found.L_m.unit_ok,false);assert.equal(parsed.found.section.unit_ok,false);assert.ok(parsed.unsupported.length);assert.equal(core.parsedToInput(parsed).beam.L_m,undefined);
});
test('all section conflicts, including the third occurrence, are retained',()=>{const parsed=core.parseTaskbook('矩形截面 100 × 200 mm\n矩形截面 100 × 200 mm\n矩形截面 200 × 300 mm');assert.equal(parsed.conflicts[0].items.length,3);});
test('report with no claims is never marked passed',()=>{const {result:r}=solve(input());assert.match(core.checkReport(r,'这是一段没有数值的说明').verdict,/未识别/);});
test('report checker detects wrong values and invalid numeric tokens',()=>{
  const {result:r}=solve(input());assert.equal(core.checkReport(r,'RA = 300 kN').mismatches.length,1);assert.equal(core.checkReport(r,'RA = 1..2 kN').claims.length,0);
});
test('generated report uses correct EI in kN*m² and restricts small-deflection claims',()=>{
  const raw=input();const {p,result:r,problems}=solve(raw);const report=core.renderReport(raw,p,problems,r,{},[]);
  assert.ok(report.includes((p.E*p.I_mm4*1e-6).toPrecision(4)+' kN·m²'));assert.ok(!report.includes('≤ 0.1，线性理论适用'));
  assert.equal(core.checkReport(r,report).mismatches.length,0);
});
test('HTML renderer escapes both tags and attribute delimiters',()=>{assert.equal(core.esc('<img src="x" onerror=\'x\'>'),'&lt;img src=&quot;x&quot; onerror=&#39;x&#39;&gt;');});
test('positive-down deflection chart uses matching axis signs',()=>{
  const {result:r}=solve(input());const svg=core.svgCurve(r.internal.samples,'delta_mm','挠度曲线','mm','#c0392b',true);
  assert.match(svg,/y="50"[^>]*>-/);assert.match(svg,/y="250"[^>]*>\+/);
});
test('deterministic parameter sweep: finite outputs and numerical agreement',()=>{
  for(let i=0;i<60;i++){
    const L=.5+(i%13)*1.7;const a=L*((i%17)/16);
    const raw=input({beam:{L_m:L},loads:{q_kN_m:i%9,P_kN:i%7,a_m:a},section:{shape:'rect',b_mm:80+i,h_mm:150+3*i}});
    const {result:r}=solve(raw);assert.equal(r.checks.all_pass,true,JSON.stringify({i,L,a,checks:r.checks}));assert.ok(Number.isFinite(r.deflection.delta_max_mm));near(r.reactions.RA_kN+r.reactions.RB_kN,raw.loads.q_kN_m*L+raw.loads.P_kN);
  }
});
test('static application has no remote runtime dependencies or inline script handlers',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');assert.ok(!/\son(?:click|change|input|error|load)=/.test(html));assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html));assert.ok(!/<(?:script|link)[^>]+(?:src|href)="https?:/.test(html));assert.match(html,/connect-src 'none'/);
});
test('offline build preserves formula dollar signs and supplies exact script hashes',()=>{
  const os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'course-assistant-build-')),file=path.join(directory,'offline.html');
  try{
    cp.execFileSync(process.execPath,[path.join(__dirname,'../tools/build-offline.cjs'),file]);
    const html=fs.readFileSync(file,'utf8'),scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
    assert.equal(scripts.length,5);assert.ok(html.includes('$$R_A ='));
    scripts.forEach(script=>assert.ok(html.includes("'sha256-"+crypto.createHash('sha256').update(script).digest('base64')+"'")));
    assert.ok(!html.includes("script-src 'unsafe-inline'"));
  }finally{if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(directory);}
});
