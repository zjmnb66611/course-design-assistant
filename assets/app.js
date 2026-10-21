var STEPS=["任务书","参数确认","计算核验","图表","计算书","导出"];
var state={taskbook:null,parsed:null,overrides:{},conflictResolved:{},input:null,out:null,srcLines:[],reportMD:null};
var maxUnlocked=1;
var currentStep=1;
var taskReadVersion=0;

(function initTabs(){
  var box=document.getElementById("stepTabs");
  STEPS.forEach(function(s,i){
    var el=document.createElement("button");
    el.className="step-tab"+(i===0?" active":"");
    el.id="tab"+(i+1);
    el.innerHTML='<span class="n">'+(i+1)+'</span>'+s;
    el.type="button"; el.addEventListener("click",function(){ showStep(i+1); });
    box.appendChild(el);
  });
})();

function unlock(n){ maxUnlocked=Math.max(maxUnlocked,n); showStep(n); }
function showStep(n,keepScroll){
  n=Math.max(1,Math.min(Number(n)||1,maxUnlocked)); currentStep=n;
  document.documentElement.dataset.step=String(n);
  for(var i=1;i<=6;i++){
    document.getElementById("sec"+i).style.display=i===n?"":"none";
    var tab=document.getElementById("tab"+i);
    tab.classList.toggle("active",i===n); tab.classList.toggle("done",i<n&&i<=maxUnlocked);
    tab.disabled=i>maxUnlocked;
    if(i===n) tab.setAttribute("aria-current","step"); else tab.removeAttribute("aria-current");
  }
  document.getElementById("comparePanel").hidden=true;
  document.getElementById("knowledgePanel").hidden=true;
  updateWorkspace();
  if(!keepScroll)window.scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
}
function msg(el,kind,html){ var e=document.getElementById(el); e.className="msg show "+kind; e.innerHTML=html; }
function clearMsg(el){ var e=document.getElementById(el); e.className="msg"; e.innerHTML=""; }

function switchTaskTab(which){
  document.getElementById("panePaste").style.display=(which==="paste")?"":"none";
  document.getElementById("paneFile").style.display=(which==="file")?"":"none";
  document.getElementById("tabPaste").className="tab"+(which==="paste"?" active":"");
  document.getElementById("tabFile").className="tab"+(which==="file"?" active":"");
}
function loadDemo(){
  taskReadVersion++; state.parsed=null; state.overrides={}; state.conflictResolved={};
  document.getElementById("parseResult").replaceChildren(); invalidateResult(true);
  switchTaskTab("paste");
  document.getElementById("taskText").value="某教学楼楼面简支梁课程设计任务书\n\n一、设计资料\n某教学楼楼面采用一根简支钢梁，计算跨度 L = 6 m。\n梁截面为矩形，尺寸 100 × 200 mm。\n材料为 Q235 钢，弹性模量 E = 206 GPa，许用应力 160 MPa。\n楼面构造及设备传来均布荷载 q = 10 kN/m（已含自重）。\n另有一台固定设备，集中荷载 P = 20 kN，作用位置距左端支座 2 m。\n\n二、设计要求\n1. 计算支座反力，绘制剪力图与弯矩图；\n2. 校核梁的正应力强度；\n3. 计算最大挠度，要求挠度不超过 L/250；\n4. 提交完整计算书，含公式推导与数据表格。";
  msg("parseMsg","ok","已载入示例任务书，点击「解析任务书」继续。");
}
function clearTask(){
  taskReadVersion++;
  document.getElementById("taskText").value="";
  document.getElementById("parseResult").innerHTML="";
  clearMsg("parseMsg");
  state.taskbook=null; state.parsed=null; state.overrides={}; state.conflictResolved={}; invalidateResult(true);
}

/* 文件导入：类型与大小限制 */
document.getElementById("taskFile").addEventListener("change",function(ev){
  var readVersion=++taskReadVersion;
  var f=ev.target.files&&ev.target.files[0], meta=document.getElementById("fileMeta");
  if(!f){ return; }
  var nameOk=/\.(txt|md|text)$/i.test(f.name);
  var typeOk=!f.type||/^text\/(plain|markdown)$/i.test(f.type);
  if(!nameOk||!typeOk){
    meta.innerHTML='<span style="color:var(--c-danger)">已拒绝：仅支持 .txt / .md / .text 纯文本任务书（当前文件：'+esc(f.name)+'，类型 '+esc(f.type||"未知")+'）。Word/PDF 请先另存为纯文本或改用粘贴方式。</span>';
    ev.target.value="";
    return;
  }
  if(f.size>1024*1024){
    meta.innerHTML='<span style="color:var(--c-danger)">已拒绝：文件 '+f.size+' 字节超过 1 MB 限制。请拆分或精简任务书。</span>';
    ev.target.value="";
    return;
  }
  var rd=new FileReader();
  rd.onload=function(){
    if(readVersion!==taskReadVersion)return;
    var text=String(rd.result);
    if(text.length>200000 || /\x00/.test(text)){ meta.textContent="已拒绝：仅支持不含空字节且不超过 20 万字符的纯文本。"; ev.target.value=""; return; }
    invalidateResult(true); state.parsed=null;
    state.taskbook={text:text,name:f.name};
    state.overrides={};state.conflictResolved={};document.getElementById("parseResult").replaceChildren();
    document.getElementById("taskText").value=text;scheduleDraft();
    meta.innerHTML='已读取 <b>'+esc(f.name)+'</b>（'+f.size+' 字节），不会上传；如开启本机草稿，将保存于此浏览器。';
    msg("parseMsg","ok","文件已读入，点击「解析任务书」继续。");
  };
  rd.onerror=function(){ meta.innerHTML='<span style="color:var(--c-danger)">读取失败，请重试或改用粘贴。</span>'; };
  rd.readAsText(f,"utf-8");
});

/* 解析任务书 → 结果面板 */
function parseTask(){
  var text;
  if(document.getElementById("panePaste").style.display!=="none"){
    text=document.getElementById("taskText").value;
    state.taskbook={text:text,name:"粘贴文本"};
  }else{
    if(!state.taskbook){ msg("parseMsg","err","请先选择文件或改用粘贴方式。"); return; }
    text=state.taskbook.text;
  }
  if(!text.trim()){ msg("parseMsg","err","任务书内容为空：请粘贴文字或导入 .txt/.md 文件。"); return; }
  if(text.includes("\u0000")){msg("parseMsg","err","任务书包含空字节，请使用纯文本内容。");return;}
  if(text.length>200000){ msg("parseMsg","err","任务书超过 20 万字符，疑似粘贴了非任务书内容，请检查。"); return; }
  var parsed=parseTaskbook(text);
  invalidateResult(true);
  state.parsed=parsed; state.overrides={}; state.conflictResolved={};
  var f=parsed.found, html=[], k, n=0;
  html.push('<div class="tb-wrap"><table class="tb"><tr><th>参数</th><th>识别值</th><th>单位</th><th>来源</th></tr>');
  var NAMES={L_m:"跨度 L",q_kN_m:"均布荷载 q",P_kN:"集中荷载 P",a_m:"作用位置 a",E_GPa:"弹性模量 E",
             sigma_allow_MPa:"许用应力",deflection_limit_divisor:"挠度限值",section:"截面",material_name:"材料"};
  for(k in f){ if(!f.hasOwnProperty(k)) continue; n++;
    var v=f[k], val;
    if(k==="section") val=v.b_mm+"×"+v.h_mm+" mm";
    else if(k==="material_name") val=v.material;
    else if(k==="deflection_limit_divisor") val="L/"+v.value;
    else val=v.value+" "+(v.unit||"");
    var line=(v.line!==undefined)?('<span class="src-line">任务书第'+v.line+'行</span>'):"";
    var unitCol=(k==="deflection_limit_divisor")?"—":(k==="section"?"mm":(k==="material_name"?"—":""));
    html.push('<tr><td>'+NAMES[k]+'</td><td><b>'+esc(String(val))+'</b></td><td>'+unitCol+'</td><td>'+line+'</td></tr>');
  }
  html.push('</table></div>');
  var miss=[];
  parsed.missing.forEach(function(m){ if(typeof m==="object"&&NAMES[m.key]!==undefined) miss.push(NAMES[m.key]); else if(typeof m==="string"&&NAMES[m]) miss.push(NAMES[m]); });
  html.push('<div style="margin-top:10px;font-size:13.5px">共识别 <b>'+n+'</b> 项参数'+(miss.length?('；<span style="color:var(--c-warn)"><b>缺失 '+miss.length+' 项</b>：'+esc(miss.join("、"))+'（可载入示例后手动补齐）</span>'):'；无缺失项')+'。</div>');
  if(parsed.unrecognized_unit.length){
    html.push('<div class="msg warn show" style="margin-top:10px">以下数值的单位无法识别，不会自动填入参数，请换算后人工填写：'+
      parsed.unrecognized_unit.map(function(u){return esc(u.key)+"（第"+u.item.line+"行："+esc(u.item.snippet)+"）";}).join("；")+'</div>');
  }
  if(parsed.conflicts.length){
    parsed.conflicts.forEach(function(c,ci){
      html.push('<div class="conflict-card"><b>⚠ 冲突：'+esc(NAMES[c.key]||c.key)+'出现多个不同取值</b>'+
        c.items.map(function(it){return '<div class="src-line">第'+it.line+'行：'+esc(it.snippet)+' → <b>'+esc(String(it.value!==undefined?it.value:(it.b_mm+"×"+it.h_mm)))+'</b></div>';}).join("")+
        '<div class="opt">人工裁决：'+
        c.items.map(function(it,index){return '<label><input type="radio" name="cf'+ci+'" value="'+index+'"> 取第'+it.line+'行值</label>';}).join("")+
        (c.key!=="section"?'<label><input type="radio" name="cf'+ci+'" value="custom"> 手动输入：<input aria-label="冲突项人工取值" type="number" id="cfCustom'+ci+'" style="width:110px" step="any"></label>':'')+'</div></div>');
      state.conflictResolved[c.key]={idx:ci,items:c.items,keyName:c.key};
    });
  }
  html.push('<div class="btn-row"><button class="btn btn-success" data-action="fillForm">带入参数表单 →</button></div>');
  document.getElementById("parseResult").innerHTML=html.join("");
  msg("parseMsg","ok","解析完成（原文共 "+parsed.source_chars+" 字符，来源行号已保留）。冲突项请先裁决再带入。");
}

function applyConflictOverrides(){
  for(var key in state.conflictResolved){
    if(!state.conflictResolved.hasOwnProperty(key)) continue;
    var cr=state.conflictResolved[key], ci=cr.idx;
    var choice=document.querySelector('input[name="cf'+ci+'"]:checked');
    if(!choice) continue;
    if(choice.value==="custom"){
      var cv=parseFloat(document.getElementById("cfCustom"+ci).value);
      if(isFinite(cv)) state.overrides[key]=cv;
      else delete state.overrides[key];
    }else{
      var it=cr.items[parseInt(choice.value,10)];
      if(it){ if(it.value!==undefined) state.overrides[key]=it.value; else { state.overrides.section_b=it.b_mm; state.overrides.section_h=it.h_mm; } }
    }
  }
}

/* 解析结果 → 表单 */
function fillForm(){
  if(!state.parsed){msg("parseMsg","warn","请先解析当前任务书。");return;}
  if(state.parsed.unsupported && state.parsed.unsupported.length){msg("parseMsg","err",esc(state.parsed.unsupported.join("；")));return;}
  for(var conflictKey in state.conflictResolved){
    var conflict=state.conflictResolved[conflictKey], choice=document.querySelector('input[name="cf'+conflict.idx+'"]:checked');
    if(!choice || (choice.value==="custom" && strictNumber(document.getElementById("cfCustom"+conflict.idx).value)===null)){
      msg("parseMsg","err","请明确选择每个冲突项的来源或输入有限数值后继续。");return;
    }
  }
  invalidateResult(false); applyConflictOverrides();
  var f=state.parsed.found, o=state.overrides;
  function setVal(key,el,srcEl,suffix){
    var v=o[key]!==undefined?o[key]:(f[key]&&f[key].unit_ok!==false?f[key].value:null);
    document.getElementById(el).value=(v!==null&&v!==undefined)?v:"";
    var s=document.getElementById(srcEl);
    if(f[key]){
      s.textContent=(o[key]!==undefined?"已人工修正（任务书第"+f[key].line+"行原值 "+f[key].value+"）":"来自任务书第"+f[key].line+"行");
      s.className="src"+(o[key]!==undefined?" mod":"");
    } else if(o[key]!==undefined){ s.textContent="人工输入"; s.className="src mod"; }
    else s.textContent="";
  }
  setVal("L_m","in_L","src_L");
  setVal("q_kN_m","in_q","src_q");
  setVal("P_kN","in_P","src_P");
  setVal("a_m","in_a","src_a");
  setVal("E_GPa","in_E","src_E");
  setVal("sigma_allow_MPa","in_sa","src_sa");
  setVal("deflection_limit_divisor","in_dv","src_dv");
  if(f.material_name&&MAT_PRESETS[f.material_name.material]&&!f.E_GPa){
    document.getElementById("in_mat").value=MAT_PRESETS[f.material_name.material].id;
  }
  if(o.section_b!==undefined||(f.section&&f.section.unit_ok!==false)){
    document.getElementById("in_shape").value="rect";
    document.getElementById("in_b").value=(o.section_b!==undefined)?o.section_b:f.section.b_mm;
    document.getElementById("in_h").value=(o.section_h!==undefined)?o.section_h:f.section.h_mm;
    var ss=document.getElementById("src_sec");
    ss.textContent=(o.section_b!==undefined?"已人工修正":"来自任务书第"+f.section.line+"行");
    ss.className="src"+(o.section_b!==undefined?" mod":"");
  } else { document.getElementById("in_b").value="";document.getElementById("in_h").value="";document.getElementById("src_sec").textContent=""; }
  shapeUI();
  unlock(2);
}

var MAT_PRESETS={Q235:{id:"Q235",E:206,sa:160,name:"Q235 钢"},Q345:{id:"Q345",E:206,sa:230,name:"Q345 钢"},
  AL:{id:"AL",E:69,sa:90,name:"铝合金"},WOOD:{id:"WOOD",E:10,sa:12,name:"松木"}};
function applyMatPreset(){
  var v=document.getElementById("in_mat").value;
  if(!v) return;
  var pr=MAT_PRESETS[v];
  document.getElementById("in_E").value=pr.E;
  document.getElementById("in_sa").value=pr.sa;
  var sE=document.getElementById("src_E"), sS=document.getElementById("src_sa");
  sE.textContent="材料预设（教学建议值，依据知识库 KB-020/KB-007；正式取值以教材/规范为准）"; sE.className="src mod";
  sS.textContent="材料预设（教学建议值）"; sS.className="src mod";
}
function shapeUI(){
  var v=document.getElementById("in_shape").value;
  document.getElementById("secRect").style.display=(v==="rect")?"":"none";
  document.getElementById("secCircle").style.display=(v==="circle")?"":"none";
  document.getElementById("secCustom").style.display=(v==="custom")?"":"none";
}

function num2(v){ return strictNumber(v); }
function collectInput(){
  var shape=document.getElementById("in_shape").value;
  var sec={shape:shape};
  if(shape==="rect"){ sec.b_mm=num2(document.getElementById("in_b").value); sec.h_mm=num2(document.getElementById("in_h").value); }
  else if(shape==="circle"){ sec.d_mm=num2(document.getElementById("in_d").value); }
  else{ sec.I_mm4=num2(document.getElementById("in_I").value); sec.W_mm3=num2(document.getElementById("in_W").value); }
  return {
    meta:{project:document.getElementById("projectName").value.trim()||"材料力学课程设计",source:(state.taskbook&&state.taskbook.name)||"手工输入"},
    beam:{L_m:num2(document.getElementById("in_L").value)},
    loads:{q_kN_m:(document.getElementById("in_q").value===""?0:num2(document.getElementById("in_q").value)),
           P_kN:(document.getElementById("in_P").value===""?0:num2(document.getElementById("in_P").value)),
           a_m:(document.getElementById("in_a").value===""?null:num2(document.getElementById("in_a").value))},
    material:{E_GPa:num2(document.getElementById("in_E").value),
              sigma_allow_MPa:(document.getElementById("in_sa").value===""?null:num2(document.getElementById("in_sa").value))},
    section:sec,
    criteria:{deflection_limit_divisor:(document.getElementById("in_dv").value===""?null:num2(document.getElementById("in_dv").value))}
  };
}

function fieldErr(id,on,text){
  var fld=document.getElementById("f_"+id);
  if(fld){ fld.className=on?"fld invalid":"fld"; var e=document.getElementById("err_"+id); if(e&&text) e.textContent=text; }
}

function goCalc(){
  invalidateResult(false);
  if(state.parsed){
    var unknownMap={q:"q",P:"P",a:"a",E:"E",L:"L","σ":"sa"};
    var pending=state.parsed.unrecognized_unit.some(function(u){return unknownMap[u.key]&&document.getElementById("in_"+unknownMap[u.key]).value==="";});
    if(pending){msg("valMsg","err","任务书存在未知单位，请换算后明确填写对应参数（无荷载时请填 0）。");return;}
  }
  var inp=collectInput();
  state.input=inp;
  var vr=validate(inp), p=vr.params, probs=vr.problems;
  ["L","q","P","a","E","b","h","d","I","W","sa","dv"].forEach(function(k){fieldErr(k,false);});
  clearMsg("valMsg");
  var fatal=probs.missing.filter(function(m){return typeof m==="object"&&/^(beam\.|loads\.|material\.E|section\.)/.test(m.key);});
  var anyErr=probs.errors.length>0||fatal.length>0;
  if(anyErr){
    var msgs=probs.errors.map(function(e){return "• "+esc(e);}).concat(
      fatal.map(function(m){return "• 缺少"+esc(m.name)+"（"+esc(m.reason)+"）";}));
    if(probs.errors.some(function(e){return /跨度 L/.test(e);})) fieldErr("L",true);
    if(probs.errors.some(function(e){return /位置 a/.test(e);})) fieldErr("a",true);
    if(probs.errors.some(function(e){return /弹性模量/.test(e);})||fatal.some(function(m){return /弹性模量/.test(m.name);})) fieldErr("E",true);
    if(probs.errors.some(function(e){return /截面/.test(e);})||fatal.some(function(m){return /截面/.test(m.name);})){ fieldErr("b",true); fieldErr("h",true); }
    msg("valMsg","err","<b>未通过单位/取值/边界校验，已阻断计算：</b><br>"+msgs.join("<br>"));
    showStep(2);
    return;
  }
  var invalidField=Array.from(document.querySelectorAll('#sec2 input[type="number"]')).some(function(el){return el.validity.badInput;});
  if(invalidField){msg("valMsg","err","请修正数字输入框中的无效内容。");return;}
  var started=performance.now();
  clearMsg("globalMsg");
  var res=calc(p);
  verify(p,res);
  res.problems=probs; res.status="ok";
  state.out={status:"ok",params:p,problems:probs,results:res,input:inp};
  renderCalcSec(p,probs,res);
  document.getElementById("sec2").setAttribute("data-done","1");
  document.getElementById("sec3").setAttribute("data-done","1");
  state.reportMD=null; dirty=true;
  document.getElementById("calcTime").textContent="本次计算 "+(performance.now()-started).toFixed(1)+" ms";
  maxUnlocked=6; showStep(3); refreshScenarioResults(); scheduleDraft();
}

function renderCalcSec(p,probs,res){
  var it=res.internal,st=res.stress,df=res.deflection,ck=res.checks;
  document.getElementById("calcEcho").innerHTML="输入：L = "+fnum(p.L)+" m，q = "+fnum(p.q)+" kN/m，P = "+fnum(p.P)+" kN @ a = "+
    (p.a!==null?fnum(p.a):"—")+" m，"+esc(p.section_desc)+"，E = "+fnum(p.E)+" GPa；引擎版本 v"+ENGINE_VERSION+"（"+N_SAMPLES+" 点采样）";
  var mh='';
  if(probs.missing.length){
    mh='<div class="msg warn show"><b>缺失项（不阻断计算，但影响结论完整性）：</b><br>'+
      probs.missing.map(function(m){return "• "+(typeof m==="object"?esc(m.name+"（"+m.reason+"）"):esc(m));}).join("<br>")+'</div>';
  }
  document.getElementById("calcMissing").innerHTML=mh;
  var kpis=[
    ["支反力 RA",fnum(res.reactions.RA_kN,3),"kN"],
    ["支反力 RB",fnum(res.reactions.RB_kN,3),"kN"],
    ["最大剪力 Vmax",fnum(it.Vmax_kN,3),"kN"],
    ["最大弯矩 Mmax",fnum(it.Mmax_kN_m,3),"kN·m @ x="+fnum(it.x_Mmax_m,3)+" m"],
    ["最大正应力 σmax",fnum(st.sigma_max_MPa,3),"MPa"+(st.utilization!==null?"（利用率 "+st.utilization.toFixed(3)+"）":"")],
    ["最大挠度 δmax",fnum(df.delta_max_mm,3),"mm @ x="+fnum(df.x_delta_max_m,3)+" m"],
    ["刚度判定",df.pass?"满足":"不满足","限值 "+fnum(df.limit_mm,3)+" mm（L/"+fnum(p.defl_div)+"）"],
    ["强度判定",(st.pass===null?"未判定":(st.pass?"满足":"不满足")),""]
  ];
  var kpiHtml=kpis.map(function(k){
    var bad=(k[0]==="强度判定"&&st.pass===false)||(k[0]==="刚度判定"&&!df.pass);
    return '<div class="kpi"><div class="k">'+esc(k[0])+'</div><div class="v'+(bad?' bad':'')+'">'+esc(String(k[1]))+' <span class="u">'+esc(k[2])+'</span></div></div>';
  }).join("");
  var kp2="";
  if(st.tau_max_MPa!==null) kp2='<div class="kpi"><div class="k">最大剪应力 τmax（矩形）</div><div class="v">'+fnum(st.tau_max_MPa,3)+' <span class="u">MPa'+(st.tau_pass!==null?(st.tau_pass?"（满足）":"（不满足）"):"")+'</span></div></div>';
  document.getElementById("kpiGrid").innerHTML=kpiHtml+kp2;
  var cl=[
    ["静力平衡",ck.equilibrium.check+"："+fnum(ck.equilibrium.left,3)+" vs "+fnum(ck.equilibrium.right,3)+"，相对误差 "+ck.equilibrium.rel_err.toExponential(2),ck.equilibrium.pass],
    ["支座边界","δ(0) = "+ck.boundary.delta_0_mm.toExponential(2)+" mm，δ(L) = "+ck.boundary.delta_L_mm.toExponential(2)+" mm（应为 0）",ck.boundary.pass],
    ["曲率方程",ck.curvature.check+"，最差相对误差 "+ck.curvature.worst_rel_err.toExponential(2),ck.curvature.pass],
    ["数值积分",ck.integration.check+"，最差相对误差 "+ck.integration.worst_rel_err.toExponential(2),ck.integration.pass]
  ];
  document.getElementById("checkList").innerHTML=cl.map(function(c){
    return '<div class="check-item '+(c[2]?"pass":"fail")+'"><span class="st">'+(c[2]?"通过":"未通过")+'</span><div><b>'+esc(c[0])+'</b>：'+esc(c[1])+'</div></div>';
  }).join("")+'<div class="check-item '+(ck.all_pass?"pass":"fail")+'"><span class="st">'+(ck.all_pass?"汇总":"警告")+'</span><div><b>三重独立核验</b>：'+(ck.all_pass?"数值路径一致；模型适用性与输入仍需人工核对":"存在未通过项，请勿采用本次结果")+'</div></div>';
  var wh="";
  if(probs.warnings.length) wh='<div class="msg warn show" style="margin-top:12px"><b>警告（需人工确认）：</b><br>'+probs.warnings.map(function(w){return "• "+esc(w);}).join("<br>")+'</div>';
  if(probs.notes.length) wh+='<div style="font-size:12.5px;color:var(--c-muted);margin-top:10px">说明：'+probs.notes.map(esc).join("；")+'</div>';
  document.getElementById("calcWarn").innerHTML=wh;
  renderFigs(p,res);
  document.getElementById("figGrid").setAttribute("data-ready","1");
}

function renderFigs(p,res){
  var s=res.internal.samples;
  var svgs=[
    ["计算简图",svgSchematic(p)],
    ["剪力图",svgCurve(s,"V_kN","剪力图 V(x)","kN","#2e86c1")],
    ["弯矩图",svgCurve(s,"M_kN_m","弯矩图 M(x)","kN·m","#8e44ad")],
    ["挠度曲线",svgCurve(s,"delta_mm","挠度曲线 δ(x)","mm","#c0392b",true)]
  ];
  document.getElementById("figGrid").innerHTML=svgs.map(function(v){return '<div class="fig">'+v[1]+'</div>';}).join("");
  var t='<tr><th>x / m</th><th>V / kN</th><th>M / kN·m</th><th>δ / mm</th></tr>';
  s.forEach(function(sm){ t+='<tr><td>'+fnum(sm.x_m,3)+(sm.side==="left"?" 左侧":sm.side==="right"?" 右侧":"")+'</td><td>'+fnum(sm.V_kN,3)+'</td><td>'+fnum(sm.M_kN_m,3)+'</td><td>'+fnum(sm.delta_mm,4)+'</td></tr>'; });
  document.getElementById("sampleTable").innerHTML=t;
  var query=document.getElementById("probeX"); query.max=p.L; query.value=fnum(p.L/2); probePoint();
}

/* ---------- 迷你 Markdown 渲染（用于预览） ---------- */
function miniMD(md){
  var lines=md.split("\n"),out=[],i,inTable=false,tableBuf=[];
  function inline(t){
    t=esc(t);
    t=t.replace(/\*\*([^*]+)\*\*/g,"<b>$1</b>");
    t=t.replace(/(^|[^*])\*([^*]+)\*/g,"$1<i>$2</i>");
    t=t.replace(/`([^`]+)`/g,"<code>$1</code>");
    return t;
  }
  function flushTable(){
    if(!inTable) return;
    var head=tableBuf[0], body=tableBuf.slice(2);
    var h='<table><tr>'+head.split("|").slice(1,-1).map(function(c){return "<th>"+inline(c.trim())+"</th>";}).join("")+'</tr>';
    body.forEach(function(r){ h+='<tr>'+r.split("|").slice(1,-1).map(function(c){return "<td>"+inline(c.trim())+"</td>";}).join("")+'</tr>'; });
    out.push(h+'</table>');
    inTable=false; tableBuf=[];
  }
  for(i=0;i<lines.length;i++){
    var ln=lines[i];
    if(/^\|/.test(ln)){ inTable=true; tableBuf.push(ln); continue; }
    flushTable();
    if(/^####\s/.test(ln)) out.push('<h2 style="font-size:14px">'+inline(ln.slice(5))+'</h2>');
    else if(/^###\s/.test(ln)) out.push('<h2 style="font-size:15px">'+inline(ln.slice(4))+'</h2>');
    else if(/^##\s/.test(ln)) out.push('<h2>'+inline(ln.slice(3))+'</h2>');
    else if(/^#\s/.test(ln)) out.push('<h1>'+inline(ln.slice(2))+'</h1>');
    else if(/^\$\$/.test(ln)){
      if(/\$\$$/.test(ln) && ln.trim().length > 4){
        out.push('<div class="formula">'+esc(ln.replace(/^\$\$/,"").replace(/\$\$$/,"").trim())+'</div>');
      } else {
        var f=[ln.replace(/^\$\$/,"")];
        while(i+1<lines.length && !/\$\$$/.test(lines[i+1])){ i++; f.push(lines[i]); }
        if(i+1<lines.length){ i++; f.push(lines[i].replace(/\$\$$/,"")); }
        out.push('<div class="formula">'+esc(f.join("\n").trim())+'</div>');
      }
    }
    else if(/^>\s?/.test(ln)) out.push('<blockquote>'+inline(ln.replace(/^>\s?/,""))+'</blockquote>');
    else if(/^---+$/.test(ln)) out.push('<hr>');
    else if(/^[-*]\s/.test(ln)) out.push('<ul><li>'+inline(ln.slice(2))+'</li></ul>');
    else if(/^\d+\.\s/.test(ln)) out.push('<ol><li>'+inline(ln.replace(/^\d+\.\s/,""))+'</li></ol>');
    else if(ln.trim()==="") out.push("");
    else out.push('<p>'+inline(ln)+'</p>');
  }
  flushTable();
  var html=out.join("\n");
  html=html.replace(/<\/ul>\n<ul>/g,"").replace(/<\/ol>\n<ol>/g,"");
  return html;
}

/* ---------- 步骤 5/6：报告与导出 ---------- */
function buildReport(){
  if(!ensureResult())return;
  if(!state.out||state.out.status!=="ok"){ alert("请先完成计算（步骤③）。"); showStep(2); return; }
  var srcLines=[];
  if(state.parsed){
    var seen={};
    for(var k in state.parsed.found){
      if(!state.parsed.found.hasOwnProperty(k)) continue;
      var v=state.parsed.found[k];
      if(v&&v.line!==undefined&&!seen[v.line+"|"+v.snippet]){ seen[v.line+"|"+v.snippet]=1; srcLines.push({line:v.line,snippet:v.snippet}); }
    }
  }
  var md=renderReport(state.input,state.out.params,state.out.problems,state.out.results,
    {project:document.getElementById("projectName").value.trim()||"材料力学课程设计",
     source:(state.taskbook?state.taskbook.name:"手工输入")+(srcLines.length?"（关键参数来源见行号）":"")},srcLines);
  state.reportMD=md;
  document.getElementById("reportArea").innerHTML=miniMD(md);
  document.getElementById("sec5").setAttribute("data-done","1");
  clearMsg("exportMsg");
}
function runCheck(){
  if(!state.out||state.out.status!=="ok"){ alert("请先完成计算。"); return; }
  var text=document.getElementById("checkArea").value;
  if(text.length>200000){document.getElementById("checkResult").textContent="待检查报告超过 20 万字符，请精简后重试。";return;}
  if(!text.trim()){ document.getElementById("checkResult").innerHTML='<div class="msg err show">请粘贴待检查的报告文字。</div>'; return; }
  var chk=checkReport(state.out.results,text);
  if(!chk.claims.length){document.getElementById("checkResult").innerHTML='<div class="msg warn show">未识别到可核对数值，未作通过判定。支持 RA = 43.333 kN 等明确标注的数值。</div>'; return;}
  var html='<div class="tb-wrap"><table class="tb"><tr><th>关键量</th><th>报告声称值</th><th>本页复算值</th><th>相对误差</th><th>判定</th></tr>';
  var byKey={};
  chk.claims.forEach(function(c){ (byKey[c.key]=byKey[c.key]||[]).push(c); });
  var truth=state.out.results;
  var T={RA_kN:truth.reactions.RA_kN,RB_kN:truth.reactions.RB_kN,Vmax_kN:truth.internal.Vmax_kN,
    Mmax_kN_m:truth.internal.Mmax_kN_m,sigma_max_MPa:truth.stress.sigma_max_MPa,
    delta_max_mm:truth.deflection.delta_max_mm,I_mm4:truth.inputs_echo.I_mm4,W_mm3:truth.inputs_echo.W_mm3};
  for(var k in byKey){
    byKey[k].forEach(function(c){
      var err=relerr(c.claimed,T[k]);
      html+='<tr><td>'+esc(k)+'</td><td>'+c.claimed+'</td><td>'+(T[k]!==undefined?fnum(T[k],4):'—')+'</td><td>'+(err*100).toFixed(3)+'%</td><td><span class="tag '+(err>chk.tolerance?'err':'ok')+'">'+(err>chk.tolerance?'不一致':'一致')+'</span></td></tr>';
    });
  }
  html+='</table></div>';
  var bad=chk.mismatches.map(function(m){
    return '<div class="check-item fail"><span class="st">不一致</span><div><b>'+esc(m.key)+'</b>：报告值 '+m.claimed+'，复算值 '+fnum(m.recomputed,4)+
      '（相对误差 '+(m.rel_err*100).toFixed(2)+'% > 0.5%）。<br>建议：以复算值为准，全文检索修正该数值。</div></div>';
  }).join("");
  document.getElementById("checkResult").innerHTML=
    '<div class="msg '+(chk.mismatches.length?"err":"ok")+' show"><b>'+esc(chk.verdict)+'</b>（共捕获 '+chk.claims.length+' 个关键量声称值，容差 0.5%）</div>'+html+
    (bad?'<div class="check-list">'+bad+'</div>':'<div class="check-list"><div class="check-item pass"><span class="st">通过</span><div>本次识别到的数值与复算一致；未识别的内容未核对，不能据此判定全文通过。本检查无法发现"用错公式"类错误（如误用悬臂公式），公式选择仍需对照任务书人工复核。</div></div></div>');
}
function download(name,content,mime){
  var blob=new Blob([content],{type:mime+";charset=utf-8"});
  var a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download=name;
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },800);
}
function exportMD(){
  if(!ensureResult()) return;
  if(!state.reportMD) buildReport();
  download("课设智辅_计算书.md",state.reportMD,"text/markdown");
  msg("exportMsg","ok","已下载 <b>课设智辅_计算书.md</b>（Markdown，可在 Typora/VS Code/Word 中编辑）。");
}
function exportDOC(){
  if(!ensureResult()) return;
  if(!state.reportMD) buildReport();
  var svgs=[];
  if(state.out&&state.out.status==="ok"){
    var p=state.out.params,s=state.out.results.internal.samples;
    svgs=[svgSchematic(p),svgCurve(s,"V_kN","剪力图 V(x)","kN","#2e86c1"),
      svgCurve(s,"M_kN_m","弯矩图 M(x)","kN·m","#8e44ad"),svgCurve(s,"delta_mm","挠度曲线 δ(x)","mm","#c0392b",true)];
  }
  var body=miniMD(state.reportMD);
  var figs=svgs.length?('<h2>内力与变形图</h2><div style="display:grid;gap:10px">'+svgs.map(function(v){return '<div style="border:1px solid #ccc;padding:6px">'+v+'</div>';}).join("")+'</div>'):"";
  var html='<!DOCTYPE html><html><head><meta charset="utf-8"><title>课设智辅计算书</title>'+
    '<style>body{font-family:"Microsoft YaHei",SimSun,serif;max-width:820px;margin:24px auto;line-height:1.7;color:#222}'+
    'h1{color:#1a5276;font-size:22px}h2{color:#1a5276;font-size:17px;margin:16px 0 6px}'+
    'table{border-collapse:collapse;width:100%;font-size:13px}th{background:#eef6fc}th,td{border:1px solid #bbb;padding:5px 8px}'+
    'blockquote{border-left:4px solid #2e86c1;background:#f2f8fd;padding:8px 12px;color:#34506b}'+
    '.formula{font-family:Consolas,monospace;background:#f4f7fa;border:1px dashed #ccd;padding:8px 12px;white-space:pre-wrap}'+
    'svg{max-width:100%;height:auto}</style></head><body>'+body+figs+'</body></html>';
  download("课设智辅_可编辑报告.doc",html,"application/msword");
  msg("exportMsg","ok","已下载 <b>课设智辅_可编辑报告.doc</b>（HTML 格式，Word/WPS 可直接打开编辑，图表已内嵌）。");
}
function exportJSON(){
  if(!ensureResult())return;
  if(!state.out||state.out.status!=="ok"){ msg("exportMsg","err","请先完成计算再导出数据。"); return; }
  var r=state.out.results;
  var data={engine:"课设智辅 "+ENGINE_VERSION,date:r.date,status:r.status,inputs_echo:r.inputs_echo,
    reactions:r.reactions,internal:r.internal,stress:r.stress,deflection:r.deflection,checks:r.checks,
    problems:r.problems};
  download("课设智辅_结果数据.json",JSON.stringify(data,null,2),"application/json");
  msg("exportMsg","ok","已下载 <b>课设智辅_结果数据.json</b>（含全部采样点与核验记录，可复算核对）。");
}
function copyReport(){
  if(!ensureResult()) return;
  if(!state.reportMD) buildReport();
  function ok(){ msg("exportMsg","ok","计算书全文已复制到剪贴板。"); }
  function fail(){ msg("exportMsg","warn","复制失败：请长按/选中预览区文字手动复制，或改用下载。"); }
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(state.reportMD).then(ok,fail);
  }else{
    try{
      var ta=document.createElement("textarea");
      ta.value=state.reportMD; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove(); ok();
    }catch(e){ fail(); }
  }
}
