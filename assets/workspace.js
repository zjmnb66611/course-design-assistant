"use strict";

// Workspace files contain inputs only. Imported output is never trusted or rendered.
var FORM_FIELDS=["L","q","P","a","mat","E","shape","b","h","d","I","W","sa","dv"];
var PREF_KEY="course-assistant.preferences.v2";
var DRAFT_KEY="course-assistant.draft.v2";
var scenarios=[];
var dirty=false;
var draftTimer;
var draftEnabled=false;
var draftPending=false;
var draftHealthy=false;
var appearance={theme:"system",accent:"blue"};
var themeMedia=matchMedia("(prefers-color-scheme: dark)");

function notify(kind,text){msg("globalMsg",kind,esc(text));}
function readStorage(key){try{return localStorage.getItem(key);}catch(error){return null;}}
function writeStorage(key,value){try{localStorage.setItem(key,value);return true;}catch(error){return false;}}
function removeStorage(key){try{localStorage.removeItem(key);return true;}catch(error){return false;}}
function applyAppearance(){
  var dark=appearance.theme==="dark"||(appearance.theme==="system"&&themeMedia.matches);
  document.documentElement.dataset.theme=dark?"dark":"light";
  document.documentElement.dataset.accent=appearance.accent;
  document.documentElement.style.colorScheme=dark?"dark":"light";
  document.querySelectorAll('[data-action="setTheme"]').forEach(function(button){button.setAttribute("aria-pressed",String(button.dataset.arg===appearance.theme));});
  document.getElementById("accentSelect").value=appearance.accent;
}
function setTheme(value){
  if(!["light","dark","system"].includes(value))return;
  appearance.theme=value; applyAppearance();
  if(!writeStorage(PREF_KEY,JSON.stringify(appearance)))notify("warn","浏览器禁止保存偏好，本次显示模式已生效。");
}
themeMedia.addEventListener("change",applyAppearance);

function updateWorkspace(){
  document.getElementById("progressLabel").innerHTML=String(currentStep).padStart(2,"0")+' <small>/ 06</small>';
  document.getElementById("progressFill").style.width=(currentStep/6*100)+"%";
  document.getElementById("progressHint").textContent=STEPS[currentStep-1]+" · 按步骤完成并独立复核";
  document.getElementById("workspaceStatus").textContent=state.out?"计算已更新":state.parsed?"等待核对参数":"准备开始";
  document.getElementById("scenarioCount").textContent=scenarios.length+" / 4";
  document.getElementById("charCount").textContent=document.getElementById("taskText").value.length.toLocaleString("en-US")+" / 200,000 字符";
}
function invalidateResult(taskChanged){
  state.out=null;state.reportMD=null;state.input=null;
  ["kpiGrid","checkList","calcWarn","calcEcho","calcMissing","figGrid","sampleTable","reportArea","checkResult","exportMsg"].forEach(function(id){document.getElementById(id).replaceChildren();});
  document.getElementById("probeResult").textContent="请先计算当前参数。";
  document.querySelectorAll("[data-review]").forEach(function(el){el.checked=false;});document.getElementById("reviewProgress").textContent="已确认 0 / 4 项";
  document.getElementById("figGrid").removeAttribute("data-ready");
  document.getElementById("sec2").removeAttribute("data-done");document.getElementById("sec3").removeAttribute("data-done");document.getElementById("sec5").removeAttribute("data-done");
  maxUnlocked=taskChanged?1:Math.max(2,Math.min(maxUnlocked,2));
  dirty=true;
  showStep(taskChanged?1:2,true);
}
function ensureResult(){
  if(!state.out){notify("warn","参数或任务已变更，请重新计算后再导出或保存方案。");showStep(Math.min(maxUnlocked,2));return false;}
  if(!state.out.results.checks.all_pass){notify("err","当前数值核验未全部通过，请核对后重新计算。已阻止导出。只有核验通过的方案才能加入对比。" );return false;}
  return true;
}
function manualEntry(){
  if(state.out){showStep(2);return;}
  maxUnlocked=Math.max(maxUnlocked,2);showStep(2);
  document.getElementById("in_L").focus();
}
function quickDemo(){
  loadDemo();
  // A teaching example that passes both stress and deflection checks.
  document.getElementById("taskText").value=document.getElementById("taskText").value.replace("100 × 200 mm","160 × 400 mm");
  parseTask();fillForm();
  notify("ok","已载入示例并带入参数。请核对数据后点击“开始计算”；原有 100 × 200 mm 示例也可用于体验不满足判定。" );
  updateWorkspace();
}
function chooseProject(){document.getElementById("projectFile").click();}
function formSnapshot(){
  var fields={};FORM_FIELDS.forEach(function(key){fields[key]=document.getElementById("in_"+key).value;});return fields;
}
function snapshotProject(){
  return {format:"course-design-assistant",version:2,engine:ENGINE_VERSION,savedAt:new Date().toISOString(),
    name:document.getElementById("projectName").value.trim()||"我的材料力学课程设计",
    task:document.getElementById("taskText").value,fields:formSnapshot(),
    reportText:document.getElementById("checkArea").value,
    scenarios:scenarios.map(function(s){return {name:s.name,fields:s.fields};})};
}
function saveProject(){
  download("课设智辅_项目备份.json",JSON.stringify(snapshotProject(),null,2),"application/json");
  dirty=false;notify("ok","项目备份已下载，包含任务、参数、待检查报告与对比方案。恢复后需重新计算，不会采信旧结果。");
}
function checkedFields(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("项目参数格式不正确");
  var clean={};
  FORM_FIELDS.forEach(function(key){
    if(!Object.hasOwn(raw,key))throw Error("项目缺少字段："+key);
    var value=raw[key];
    if(typeof value!=="string"||value.length>40)throw Error("项目含不合法字段："+key);
    if(key==="shape"){if(!["rect","circle","custom"].includes(value))throw Error("不支持的截面类型");}
    else if(key==="mat"){if(!["","Q235","Q345","AL","WOOD"].includes(value))throw Error("不支持的材料预设");}
    else if(value!==""&&strictNumber(value)===null)throw Error("参数必须是有限数字："+key);
    clean[key]=value;
  });return clean;
}
function checkedProject(raw){
  if(!raw||raw.format!=="course-design-assistant"||raw.version!==2)throw Error("只支持课设智辅 v2 项目备份；结果数据文件不能作为项目导入");
  if(typeof raw.name!=="string"||raw.name.length>80||typeof raw.task!=="string"||raw.task.length>200000||raw.task.includes("\u0000"))throw Error("项目名称或任务书无效或超过长度限制");
  if(typeof raw.reportText!=="string"||raw.reportText.length>200000)throw Error("待检查报告格式无效");
  if(!Array.isArray(raw.scenarios)||raw.scenarios.length>4)throw Error("对比方案必须为最多 4 项的数组");
  return {name:raw.name,task:raw.task,reportText:raw.reportText,fields:checkedFields(raw.fields),scenarios:raw.scenarios.map(function(s){
    if(!s||typeof s.name!=="string"||s.name.length>60)throw Error("方案名称无效");
    return {name:s.name,fields:checkedFields(s.fields),result:null};
  })};
}
function applyFields(fields){FORM_FIELDS.forEach(function(key){document.getElementById("in_"+key).value=fields[key];});shapeUI();}
function restoreProject(raw){
  var clean=checkedProject(raw); // Complete validation before mutating the current workspace.
  taskReadVersion++;state.intakeSkipped=[];
  document.getElementById("projectName").value=clean.name;
  document.getElementById("taskText").value=clean.task;
  document.getElementById("checkArea").value=clean.reportText;
  state.taskbook={text:clean.task,name:"项目恢复文本（参数以确认表为准）"};state.parsed=null;state.overrides={};state.conflictResolved={};
  document.getElementById("parseResult").replaceChildren();clearMsg("parseMsg");
  document.querySelectorAll('.src').forEach(function(el){el.textContent="项目恢复值 · 请核对原文";});
  applyFields(clean.fields);scenarios=clean.scenarios;
  invalidateResult(false);renderScenarios();dirty=false;
  notify("ok","项目已恢复。参数与方案保留，旧结果已丢弃；请核对并重新计算。" );
  scheduleDraft();
}
function scheduleDraft(){
  clearTimeout(draftTimer);
  if(!draftEnabled)return;
  draftPending=true;
  draftTimer=setTimeout(function(){
    draftHealthy=writeStorage(DRAFT_KEY,JSON.stringify(snapshotProject()));draftPending=false;
    if(draftHealthy){document.getElementById("draftStatus").textContent="已保存到本机草稿 · 仅此浏览器可恢复";}
    else{document.getElementById("draftStatus").textContent="草稿保存失败，请下载项目备份";}
  },650);
}
function restoreDraft(){
  var value=readStorage(DRAFT_KEY);if(!value){notify("warn","此浏览器没有可恢复的草稿。");return;}
  try{if(value.length>1500000)throw Error("草稿超过大小上限");restoreProject(JSON.parse(value));}catch(error){notify("err","草稿无法恢复："+error.message);}
}
function clearDraft(){
  clearTimeout(draftTimer);draftEnabled=false;draftPending=false;draftHealthy=false;document.getElementById("autoDraft").checked=false;
  var removed=removeStorage(DRAFT_KEY);document.getElementById("restoreDraft").hidden=true;
  document.getElementById("draftStatus").textContent=removed?"草稿已清除 · 已关闭自动保存":"浏览器拒绝清除，请在浏览器设置中清除本站数据";
  notify(removed?"ok":"warn",removed?"本机草稿已清除，自动保存已关闭。当前页面数据仍可继续使用。":"浏览器拒绝访问本机存储，请手动检查本站数据。");
}
function showTool(id){
  for(var i=1;i<=6;i++){document.getElementById("sec"+i).style.display="none";document.getElementById("tab"+i).classList.remove("active");document.getElementById("tab"+i).removeAttribute("aria-current");}
  document.getElementById("comparePanel").hidden=id!=="comparePanel";
  document.getElementById("knowledgePanel").hidden=id!=="knowledgePanel";
  window.scrollTo({top:0});
}
function openCompare(){renderScenarios();showTool("comparePanel");}
function openKnowledge(){showTool("knowledgePanel");}
function addScenario(){
  if(!ensureResult())return;
  if(scenarios.length>=4){notify("warn","最多保存 4 个方案，请先移除不需要的方案。");return;}
  scenarios.push({name:"方案 "+(scenarios.length+1),fields:formSnapshot(),result:state.out.results});
  dirty=true;renderScenarios();openCompare();scheduleDraft();updateWorkspace();
}
function renderScenarios(){
  var box=document.getElementById("scenarioList");
  if(!scenarios.length){box.innerHTML='<div class="empty-state"><b>把你的第一个方案，放到这里。</b><p>完成计算后保存方案，再调整截面或荷载并计算，即可对比。</p></div>';return;}
  var rows=scenarios.map(function(s,index){var r=s.result;
    return '<tr><th scope="row"><label class="sr-only" for="scenarioName'+index+'">方案名称</label><input type="text" class="scenario-name" id="scenarioName'+index+'" data-scenario-name="'+index+'" maxlength="60" value="'+esc(s.name)+'"></th><td>'+esc(s.fields.shape==="rect"?s.fields.b+" × "+s.fields.h+" mm":s.fields.shape==="circle"?"直径 "+s.fields.d+" mm":"自定义 I / W")+'</td><td>'+(r?fnum(r.internal.Mmax_kN_m,3):'待重算')+'</td><td>'+(r?fnum(r.stress.sigma_max_MPa,3):'—')+'</td><td>'+(r?fnum(r.deflection.delta_max_mm,3):'—')+'</td><td>'+(r?'<span class="tag '+(r.stress.pass===true&&r.deflection.pass?'ok':'warn')+'">'+(r.stress.pass===null?'强度未判定':r.stress.pass&&r.deflection.pass?'强度 / 刚度满足':'存在不满足')+'</span>':'<span class="tag warn">恢复后待重算</span>')+'</td><td><button class="text-btn" data-action="loadScenario" data-arg="'+index+'">载入参数</button><button class="text-btn danger-text" data-action="removeScenario" data-arg="'+index+'">移除</button></td></tr>';
  }).join("");
  box.innerHTML='<div class="tb-wrap"><table class="tb compare-table"><caption>方案对比 · 同一模型下的数值比较，非完整设计验收</caption><thead><tr><th>方案名称</th><th>截面</th><th>Mmax / kN·m</th><th>σmax / MPa</th><th>δmax / mm</th><th>教学校核</th><th>操作</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="hint">载入参数后请点击“开始计算”。重新保存方案会增加一项，原方案保留供比较。</p>';
}
function refreshScenarioResults(){
  if(!state.out||!state.out.results.checks.all_pass)return;
  var fields=formSnapshot();
  scenarios.forEach(function(s){if(FORM_FIELDS.every(function(key){return fields[key]===s.fields[key];}))s.result=state.out.results;});
  renderScenarios();
}
function loadScenario(index){
  var s=scenarios[Number(index)];if(!s)return;
  applyFields(s.fields);state.parsed=null;state.taskbook={text:document.getElementById("taskText").value,name:"对比方案参数（请核对任务原文）"};
  invalidateResult(false);scheduleDraft();notify("ok","已载入“"+s.name+"”的参数，重新计算后可生成报告或另存方案。");
}
function removeScenario(index){if(!Number.isInteger(Number(index))||!scenarios[Number(index)])return;scenarios.splice(Number(index),1);dirty=true;renderScenarios();updateWorkspace();scheduleDraft();}
function csvCell(value){
  var text=String(value===null||value===undefined?"":value);
  // CSV text can be opened in Excel/WPS: prevent formula execution from user labels.
  if(/^[\s]*[=+\-@\t\r]/.test(text)&&typeof value!=="number")text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
function downloadCSV(name,rows){download(name,"\uFEFF"+rows.map(function(row){return row.map(csvCell).join(",");}).join("\r\n"),"text/csv");}
function exportComparison(){
  if(!scenarios.length){notify("warn","请先保存至少一个计算方案。");return;}
  if(scenarios.some(function(s){return !s.result;})){notify("warn","存在恢复后未重算的方案，请逐一载入并重新计算；通过核验后对比表会自动更新。");return;}
  var rows=[["方案","跨度 / m","q / kN/m","P / kN","b / mm","h / mm","Mmax / kN·m","正应力 / MPa","挠度 / mm","强度","刚度"]];
  scenarios.forEach(function(s){var r=s.result;rows.push([s.name,Number(s.fields.L),Number(s.fields.q),Number(s.fields.P),s.fields.shape==="rect"?Number(s.fields.b):"不适用",s.fields.shape==="rect"?Number(s.fields.h):"不适用",r.internal.Mmax_kN_m,r.stress.sigma_max_MPa,r.deflection.delta_max_mm,r.stress.pass===null?"未判定":r.stress.pass?"满足":"不满足",r.deflection.pass?"满足":"不满足"]);});
  downloadCSV("课设智辅_方案对比.csv",rows);notify("ok","方案对比表已下载。请同时核对各方案荷载、截面与适用边界。");
}
function exportCSV(){
  if(!ensureResult())return;
  var rows=[["x / m","侧别","V / kN","M / kN·m","δ / mm"]];
  state.out.results.internal.samples.forEach(function(s){rows.push([s.x_m,s.side==="left"?"集中力左侧":s.side==="right"?"集中力右侧":"",s.V_kN,s.M_kN_m,s.delta_mm]);});
  downloadCSV("课设智辅_采样数据.csv",rows);notify("ok","采样数据已下载为 CSV，可用 Excel / WPS 打开。");
}
function probePoint(){
  var output=document.getElementById("probeResult");if(!state.out){output.textContent="请先计算当前参数。";return;}
  var x=strictNumber(document.getElementById("probeX").value),p=state.out.params;
  if(x===null||x<0||x>p.L){output.textContent="位置必须为 0 到 "+fnum(p.L)+" m 之间的数字。";return;}
  var RA=state.out.results.reactions.RA_kN,atLoad=p.a!==null&&Math.abs(x-p.a)<1e-9&&p.P>0;
  var before=RA-p.q*x-(p.a!==null&&x>p.a?p.P:0);
  var after=before-(atLoad?p.P:0);
  var m=RA*x-p.q*x*x/2-(p.a!==null&&x>=p.a?p.P*(x-p.a):0);
  var EI=p.E_SI*p.I_SI,L=p.L,a=p.a,b=L-a;
  var d=p.q*1000*x*(L*L*L-2*L*x*x+x*x*x)/(24*EI)*1000;
  if(a!==null&&p.P>0)d+=(x<=a?p.P*1000*b*x*(L*L-b*b-x*x)/(6*L*EI):p.P*1000*a*(L-x)*(L*L-a*a-(L-x)*(L-x))/(6*L*EI))*1000;
  output.textContent="x = "+fnum(x)+" m · "+(atLoad&&x>0&&x<L?"V左 = "+fnum(before)+" / V右 = "+fnum(after):"V = "+fnum(x===0?after:before))+" kN · M = "+fnum(m)+" kN·m · δ = "+fnum(d)+" mm（向下为正，支座取跨内侧）";
}
function printReport(){
  if(!ensureResult())return;if(!state.reportMD)buildReport();
  var existing=document.querySelector(".print-figures");if(existing)existing.remove();
  var p=state.out.params,s=state.out.results.internal.samples,figures=document.createElement("div");figures.className="print-figures";
  figures.innerHTML='<h2>内力与变形图</h2>'+[svgSchematic(p),svgCurve(s,"V_kN","剪力图 V(x)","kN","#2e86c1"),svgCurve(s,"M_kN_m","弯矩图 M(x)","kN·m","#8e44ad"),svgCurve(s,"delta_mm","挠度曲线 δ(x)","mm","#c0392b",true)].join("");
  document.getElementById("reportArea").appendChild(figures);showStep(5);window.print();
}

var ACTIONS={showStep:showStep,switchTaskTab:switchTaskTab,loadDemo:loadDemo,clearTask:clearTask,parseTask:parseTask,fillForm:fillForm,useIntakeStarter:useIntakeStarter,appendIntake:appendIntake,skipIntakeQuestion:skipIntakeQuestion,goCalc:goCalc,buildReport:buildReport,runCheck:runCheck,exportMD:exportMD,exportDOC:exportDOC,exportJSON:exportJSON,copyReport:copyReport,quickDemo:quickDemo,manualEntry:manualEntry,saveProject:saveProject,chooseProject:chooseProject,setTheme:setTheme,restoreDraft:restoreDraft,clearDraft:clearDraft,openCompare:openCompare,openKnowledge:openKnowledge,addScenario:addScenario,loadScenario:loadScenario,removeScenario:removeScenario,exportCSV:exportCSV,exportComparison:exportComparison,probePoint:probePoint,printReport:printReport};
document.addEventListener("click",function(event){
  var button=event.target.closest("[data-action]");if(!button||button.disabled)return;
  var action=ACTIONS[button.dataset.action];if(!action)return;
  event.preventDefault();
  var loadingLabels={parseTask:"正在整理已知条件…",goCalc:"正在计算并核验结果…",buildReport:"正在生成计算书…"};
  if(window.CourseLoading&&loadingLabels[button.dataset.action]){
    CourseLoading.run(loadingLabels[button.dataset.action],button,function(){action(button.dataset.arg);});
  }else action(button.dataset.arg);
});
document.addEventListener("keydown",function(event){if(event.target.id==="followupText"&&event.key==="Enter"&&!event.isComposing){event.preventDefault();appendIntake();}});
document.getElementById("accentSelect").addEventListener("change",function(event){
  if(!["blue","green","plum"].includes(event.target.value))return;
  appearance.accent=event.target.value;applyAppearance();writeStorage(PREF_KEY,JSON.stringify(appearance));
});
document.getElementById("autoDraft").addEventListener("change",function(event){
  draftEnabled=event.target.checked;
  if(draftEnabled){document.getElementById("draftStatus").textContent="已开启 · 任务与参数将保存到此浏览器";scheduleDraft();}
  else clearDraft();
});
document.getElementById("projectFile").addEventListener("change",async function(event){
  var file=event.target.files&&event.target.files[0];if(!file)return;
  try{
    if(!/\.json$/i.test(file.name)||file.size>1500000)throw Error("仅支持不超过 1.5 MB 的 JSON 项目备份");
    var parsed=JSON.parse(await file.text());
    restoreProject(parsed);
  }catch(error){notify("err","项目导入失败："+error.message);}
  finally{event.target.value="";}
});
document.getElementById("taskText").addEventListener("input",function(){taskReadVersion++;state.intakeSkipped=[];state.parsed=null;state.taskbook=null;state.overrides={};state.conflictResolved={};document.getElementById("parseResult").replaceChildren();clearMsg("parseMsg");invalidateResult(true);scheduleDraft();});
document.getElementById("sec2").addEventListener("input",function(event){
  if(!event.target.matches("input,select"))return;
  invalidateResult(false);
  var field=event.target.id.replace("in_","");var label=document.getElementById("src_"+field);
  if(label){label.textContent="已人工确认或修改 · 以当前表单为准";label.className="src mod";}
  scheduleDraft();
});
document.getElementById("sec2").addEventListener("change",function(event){
  var name=event.target.dataset.change;
  if(name==="applyMatPreset")applyMatPreset();else if(name==="shapeUI")shapeUI();
  if(event.target.matches("select")){invalidateResult(false);scheduleDraft();}
});
document.getElementById("projectName").addEventListener("input",function(){state.reportMD=null;document.getElementById("reportArea").replaceChildren();dirty=true;scheduleDraft();});
document.getElementById("checkArea").addEventListener("input",function(){document.getElementById("checkResult").replaceChildren();dirty=true;scheduleDraft();});
document.getElementById("scenarioList").addEventListener("input",function(event){var index=event.target.dataset.scenarioName;if(index===undefined||!scenarios[Number(index)])return;scenarios[Number(index)].name=event.target.value.slice(0,60);dirty=true;scheduleDraft();});
document.querySelectorAll("[data-review]").forEach(function(el){el.addEventListener("change",function(){document.getElementById("reviewProgress").textContent="已确认 "+document.querySelectorAll("[data-review]:checked").length+" / 4 项";});});
window.addEventListener("beforeunload",function(event){if(dirty&&(!draftEnabled||draftPending||!draftHealthy)){event.preventDefault();event.returnValue="";}});

try{var preferences=JSON.parse(readStorage(PREF_KEY)||"null");if(preferences&&["light","dark","system"].includes(preferences.theme)&&["blue","green","plum"].includes(preferences.accent))appearance={theme:preferences.theme,accent:preferences.accent};}catch(error){/* Malformed preferences fall back to system. */}
document.getElementById("restoreDraft").hidden=!readStorage(DRAFT_KEY);
if(readStorage(DRAFT_KEY))document.getElementById("draftStatus").textContent="发现本机草稿，可手动恢复；本次自动保存尚未开启";
applyAppearance();showStep(1);dirty=false;
if(window.CourseLoading)CourseLoading.ready();
