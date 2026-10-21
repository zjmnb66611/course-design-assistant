"use strict";
/* ============================================================
 * 课设智辅 JS 引擎（Euler–Bernoulli 线弹性简支梁）
 * 计算逻辑与文字生成严格分离：calc/verify 只产数值，renderReport 只消费数值
 * ============================================================ */
var ENGINE_VERSION = "2.1.0";
var N_SAMPLES = 4001;
var LIMITS = {Lmin:0.05, Lmax:30, qmax:5000, Pmax:10000, Emin:0.001, Emax:1200};

function fnum(x, nd){
  if (nd === undefined) nd = 4;
  if (!isFinite(x)) return String(x);
  var s = x.toFixed(nd);
  if (s.indexOf(".") >= 0) s = s.replace(/0+$/,"").replace(/\.$/,"");
  return s === "-0" ? "0" : s;
}
function relerr(a, b){ return Math.abs(a-b)/Math.max(Math.abs(a), Math.abs(b), 1e-30); }
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function strictNumber(value){
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "object" || String(value).trim() === "") return null;
  var n = Number(value); return Number.isFinite(n) ? n : null;
}

/* ---------- 校验层 ---------- */
function validate(inp){
  var errors=[], warnings=[], missing=[], notes=[];
  var p = {L:null,q:0,P:0,a:null,E:null,E_SI:null,shape:null,b:null,h:null,d:null,
           I_mm4:null,W_mm3:null,I_SI:null,sigma_allow_MPa:null,tau_allow_MPa:null,
           defl_div:250,section_desc:""};
  var beam=inp.beam||{}, loads=inp.loads||{}, mat=inp.material||{}, sec=inp.section||{}, crit=inp.criteria||{};
  function num(v){ return strictNumber(v); }
  [[beam,["L_m"]],[loads,["q_kN_m","P_kN","a_m"]],[mat,["E_GPa","sigma_allow_MPa","tau_allow_MPa"]],[sec,["b_mm","h_mm","d_mm","I_mm4","W_mm3"]],[crit,["deflection_limit_divisor"]]].forEach(function(pair){
    pair[1].forEach(function(key){ var v=pair[0][key]; if(v!==undefined && v!==null && v!=="" && num(v)===null) errors.push(key+" 必须为有限数字，不能包含其他字符"); });
  });

  var L=num(beam.L_m);
  if (L===null){ missing.push({key:"beam.L_m",name:"跨度 L",unit:"m",reason:"任务书未给出且未人工补充"}); }
  else{
    if (!(LIMITS.Lmin<=L && L<=LIMITS.Lmax)) errors.push("跨度 L="+L+" m 超出适用范围 ["+LIMITS.Lmin+", "+LIMITS.Lmax+"] m（单位检查：是否误用 mm/cm？）");
    else if (L<0.2) warnings.push("跨度 L="+L+" m 偏小，请确认单位是否为 m");
    p.L=L;
  }
  var q=num(loads.q_kN_m);
  if (q===null) notes.push("均布荷载 q 未给出，按 0 处理");
  else{
    if (q<0) errors.push("均布荷载 q 不能为负");
    else if (q>LIMITS.qmax) errors.push("q="+q+" kN/m 超出计算器上限");
    else p.q=q;
  }
  var P=num(loads.P_kN), a=num(loads.a_m);
  if (P===null && loads.P_kN===undefined && loads.a_m===undefined) notes.push("集中荷载 P 未给出，按 0 处理");
  if (P!==null){
    if (P<0) errors.push("集中荷载 P 不能为负");
    else if (P>LIMITS.Pmax) errors.push("P="+P+" kN 超出计算器上限");
    else p.P=P;
  }
  if (a!==null && loads.a_m!==undefined && loads.a_m!==null && loads.a_m!==""){
    if (p.L!==null){
      if (a<0 || a>p.L) errors.push("集中荷载位置 a="+a+" m 不在梁跨 [0, "+p.L+"] m 内（单位/边界检查未通过）");
      else if (a===0 || a===p.L) warnings.push("a="+a+" m：集中荷载作用于支座正上方，对梁内力无贡献，请确认任务书意图");
      if (a>=0 && a<=p.L) p.a=a;
    }
  }
  if (p.P>0 && p.a===null) missing.push({key:"loads.a_m",name:"集中荷载作用位置 a",unit:"m",reason:"给出了 P 但未给出作用位置"});
  if (p.q===0 && p.P===0) warnings.push("q 与 P 均为 0：梁上无荷载，计算结果仅为形式解");

  var E=num(mat.E_GPa);
  if (E===null) missing.push({key:"material.E_GPa",name:"弹性模量 E",unit:"GPa",reason:"未给出（可从知识库材料表按牌号查得）"});
  else{
    if (!(LIMITS.Emin<=E && E<=LIMITS.Emax)) errors.push("E="+E+" GPa 超出常见工程材料范围（单位检查：是否误用 MPa？）");
    else{
      if (!(E>=50 && E<=500)) warnings.push("E="+E+" GPa 不在常见金属范围 [50, 500] GPa，请核对材料与单位");
      p.E=E; p.E_SI=E*1e9;
    }
  }

  var shape=sec.shape||sec.type;
  if (!shape) missing.push({key:"section.shape",name:"截面形状与尺寸",unit:"mm",reason:"未给出截面"});
  else if (shape==="rect"||shape==="矩形"){
    var b=num(sec.b_mm), h=num(sec.h_mm);
    if (b===null||h===null) missing.push({key:"section.b_mm/h_mm",name:"矩形截面宽 b、高 h",unit:"mm",reason:"矩形截面缺少 b 或 h"});
    else if (b<0.1||h<0.1||b>3000||h>3000) errors.push("截面尺寸须在 0.1–3000 mm 内：b="+b+" mm, h="+h+" mm");
    else{
      if (h/b>8) warnings.push("h/b="+(h/b).toFixed(1)+" > 8：矩形高宽比偏大，稳定与构造需另行复核");
      if (Math.max(b,h)>3000) warnings.push("截面尺寸超过 3000 mm，请确认单位为 mm");
      p.shape="rect"; p.b=b; p.h=h;
      p.I_mm4=b*Math.pow(h,3)/12; p.W_mm3=b*h*h/6;
      p.section_desc="矩形 b×h = "+fnum(b)+"×"+fnum(h)+" mm";
    }
  } else if (shape==="circle"||shape==="圆形"){
    var d=num(sec.d_mm);
    if (d===null) missing.push({key:"section.d_mm",name:"圆截面直径 d",unit:"mm",reason:"圆形截面缺少 d"});
    else if (d<0.1||d>3000) errors.push("直径须在 0.1–3000 mm 内：d="+d+" mm");
    else{
      p.shape="circle"; p.d=d;
      p.I_mm4=Math.PI*Math.pow(d,4)/64; p.W_mm3=Math.PI*Math.pow(d,3)/32;
      p.section_desc="圆形 d = "+fnum(d)+" mm";
    }
  } else if (shape==="custom"||shape==="自定义"){
    var I=num(sec.I_mm4), W=num(sec.W_mm3);
    if (I===null||W===null) missing.push({key:"section.I_mm4/W_mm3",name:"自定义截面 I 与 W",unit:"mm⁴/mm³",reason:"自定义截面需同时给出 I 与 W"});
    else if (I<1e-6||I>1e16||W<1e-6||W>1e12) errors.push("自定义截面超出数值范围：I 应为 10⁻⁶–10¹⁶ mm⁴，W 应为 10⁻⁶–10¹² mm³");
    else{
      p.shape="custom"; p.I_mm4=I; p.W_mm3=W;
      p.section_desc="自定义截面 I="+fnum(I,1)+" mm⁴, W="+fnum(W,1)+" mm³";
    }
  } else errors.push("不支持的截面类型："+shape);

  if (p.I_mm4!==null) p.I_SI=p.I_mm4*1e-12;

  var sa=num(mat.sigma_allow_MPa);
  if (sa!==null){
    if (sa<=0||sa>100000) errors.push("许用应力须大于 0 且不超过 100000 MPa");
    else p.sigma_allow_MPa=sa;
  } else missing.push({key:"material.sigma_allow_MPa",name:"许用/设计应力",unit:"MPa",reason:"未给出，正应力仅计算数值、不作合格判定"});
  var ta=num(mat.tau_allow_MPa);
  if (ta!==null) { if(ta<=0||ta>100000) errors.push("许用剪应力须大于 0 且不超过 100000 MPa"); else p.tau_allow_MPa=ta; }
  var dv=num(crit.deflection_limit_divisor);
  if (dv!==null){
    if (!(dv>=50 && dv<=1000)) errors.push("挠度限值分母须在 50–1000 内，不能静默改用默认值");
    else p.defl_div=dv;
  } else notes.push("未给出挠度限值，按课程设计常用值 L/250 校核（实际工程须执行现行规范）");

  if (p.L && p.h){
    var lh=p.L*1000/p.h;
    if (lh<10) warnings.push("跨高比 L/h="+lh.toFixed(1)+" < 10：深梁范围，剪切变形不可忽略，Euler-Bernoulli 解仅作参考");
    else notes.push("跨高比 L/h="+lh.toFixed(1)+" ≥ 10，满足细长梁假设");
  }
  return {params:p, problems:{errors:errors,warnings:warnings,missing:missing,notes:notes,conflicts:[]}};
}

/* ---------- 计算层（闭式解） ---------- */
function calc(p){
  var L=p.L,q=p.q,P=p.P,a=p.a,EI=p.E_SI*p.I_SI;
  var b=(a!==null)?L-a:L;
  var RA=q*L/2+((a!==null)?P*b/L:0);
  var RB=q*L/2+((a!==null)?P*a/L:0);
  function V(x){ var v=RA-q*x; if(a!==null && x>=a && a<L) v-=P; return v; }
  function M(x){ var m=RA*x-q*x*x/2; if(a!==null && x>=a) m-=P*(x-a); return m; }
  var qN=q*1000, PN=P*1000;
  function dUdl(x){ return qN*x*(Math.pow(L,3)-2*L*x*x+Math.pow(x,3))/(24*EI)*1000; }
  function dP(x){
    if(a===null||P===0) return 0;
    if(x<=a) return PN*b*x*(L*L-b*b-x*x)/(6*L*EI)*1000;
    return PN*a*(L-x)*(L*L-a*a-(L-x)*(L-x))/(6*L*EI)*1000;
  }
  function delta(x){ return dUdl(x)+dP(x); }

  var n=N_SAMPLES, xs=[],Vs=[],Ms=[],ds=[],i;
  for(i=0;i<n;i++){ var x=i*L/(n-1); xs.push(x); Vs.push(V(x)); Ms.push(M(x)); ds.push(delta(x)); }

  var cands=[0,L]; if(a!==null) cands.push(a);
  for(i=0;i<n-1;i++){
    if(Vs[i]===0) cands.push(xs[i]);
    else if(Vs[i]*Vs[i+1]<0){
      var lo=xs[i],hi=xs[i+1],k;
      for(k=0;k<60;k++){ var mid=(lo+hi)/2; if(V(lo)*V(mid)<=0) hi=mid; else lo=mid; }
      cands.push((lo+hi)/2);
    }
  }
  var x_Mmax=0,Mmax=0,j;
  for(j=0;j<cands.length;j++){ var xc=cands[j]; if(xc>=0&&xc<=L&&M(xc)>Mmax){Mmax=M(xc);x_Mmax=xc;} }
  var Vmax=Math.max(Math.abs(RA-(a===0?P:0)),Math.abs(RA-q*L-((a!==null&&a<L)?P:0)));

  var ib=0; for(i=1;i<n;i++) if(ds[i]>ds[ib]) ib=i;
  var lo2=xs[Math.max(0,ib-2)], hi2=xs[Math.min(n-1,ib+2)];
  for(i=0;i<80;i++){
    var m1=lo2+(hi2-lo2)*0.382, m2=lo2+(hi2-lo2)*0.618;
    if(delta(m1)<delta(m2)) lo2=m1; else hi2=m2;
  }
  var x_dmax=(lo2+hi2)/2, dmax=delta(x_dmax);

  var sigma_max=Mmax*1e6/p.W_mm3;
  var util=(p.sigma_allow_MPa!==null)?sigma_max/p.sigma_allow_MPa:null;
  var stress_pass=(util!==null)?(util<=1):null;
  var tau_max=null,tau_pass=null;
  if(p.shape==="rect"){
    tau_max=1.5*Vmax*1e3/(p.b*p.h);
    if(p.tau_allow_MPa!==null) tau_pass=tau_max<=p.tau_allow_MPa;
  }
  var defl_limit=L*1000/p.defl_div;
  var samples=[];
  var step=Math.max(1,Math.floor(n/40));
  for(i=0;i<n;i+=step) samples.push({x_m:xs[i],V_kN:Vs[i],M_kN_m:Ms[i],delta_mm:ds[i]});
  if(a!==null && a>0 && a<L && P>0){
    samples=samples.filter(function(row){ return Math.abs(row.x_m-a)>1e-10; });
    samples.push({x_m:a,V_kN:RA-q*a,M_kN_m:M(a),delta_mm:delta(a),side:"left"});
    samples.push({x_m:a,V_kN:RA-q*a-P,M_kN_m:M(a),delta_mm:delta(a),side:"right"});
    samples.sort(function(x,y){ return x.x_m-y.x_m || (x.side==="left"?-1:1); });
  }
  return {
    date:new Date().toISOString().slice(0,10),
    inputs_echo:(function(){
      var o={}; ["L","q","P","a","E","shape","b","h","d","I_mm4","W_mm3","sigma_allow_MPa","tau_allow_MPa","defl_div"].forEach(function(k){ if(p[k]!==null&&p[k]!==undefined) o[k]=p[k]; }); return o;
    })(),
    section_desc:p.section_desc,
    reactions:{RA_kN:RA,RB_kN:RB},
    internal:{Vmax_kN:Vmax,Mmax_kN_m:Mmax,x_Mmax_m:x_Mmax,M_at_load_kN_m:(a!==null)?M(a):null,samples:samples},
    stress:{sigma_max_MPa:sigma_max,utilization:util,pass:stress_pass,tau_max_MPa:tau_max,tau_pass:tau_pass},
    deflection:{delta_max_mm:dmax,x_delta_max_m:x_dmax,limit_mm:defl_limit,pass:dmax<=defl_limit,
                small_deflection_ok:dmax<=0.1*L*1000}
  };
}

/* ---------- 验证层（三重数值核验） ---------- */
function verify(p,res){
  var L=p.L,q=p.q,P=p.P,a=p.a,EI=p.E_SI*p.I_SI;
  var RA=res.reactions.RA_kN,RB=res.reactions.RB_kN;
  var eqErr=relerr(RA+RB,q*L+P);
  var equilibrium={check:"ΣFy: RA+RB = qL+P",left:RA+RB,right:q*L+P,rel_err:eqErr,pass:eqErr<1e-10};
  function delta(x){
    var d=q*1000*x*(Math.pow(L,3)-2*L*x*x+Math.pow(x,3))/(24*EI)*1000;
    if(a!==null&&P>0){
      var b=L-a;
      if(x<=a) d+=P*1000*b*x*(L*L-b*b-x*x)/(6*L*EI)*1000;
      else d+=P*1000*a*(L-x)*(L*L-a*a-(L-x)*(L-x))/(6*L*EI)*1000;
    }
    return d;
  }
  function M(x){ var m=RA*x-q*x*x/2; if(a!==null&&x>=a) m-=P*(x-a); return m; }
  var bc={delta_0_mm:delta(0),delta_L_mm:delta(L),pass:Math.abs(delta(0))<1e-9&&Math.abs(delta(L))<1e-9};
  var h=L/2000,worst=0,i,x;
  for(i=20;i<=1980;i+=97){
    x=i*L/2000;
    if(a!==null&&Math.abs(x-a)<3*h) continue;
    var ypp=(delta(x+h)-2*delta(x)+delta(x-h))/(h*h);
    worst=Math.max(worst,(Math.abs(ypp*EI/1e6+M(x))/Math.max(Math.abs(M(x)),1e-8,res.internal.Mmax_kN_m*1e-8)));
  }
  var curvature={check:"EI·y″ ≈ −M(x)（中心差分）",worst_rel_err:worst,pass:worst<1e-4};
  var n2=2000,xs=[],ms=[],j;
  for(j=0;j<=n2;j++){ xs.push(j*L/n2); ms.push(M(xs[j])*1000/EI); }
  function simpson(f){
    var s=f[0]+f[f.length-1],k;
    for(k=1;k<f.length-1;k++) s+=f[k]*(k%2?4:2);
    return s*(L/n2)/3;
  }
  var k1=simpson(xs.map(function(xv,jj){return (L-xv)*ms[jj];}));
  var worst2=0;
  for(i=100;i<=n2;i+=100){
    var xx=xs[i], part=0, fs=[];
    for(j=0;j<=i;j++) fs.push((xx-xs[j])*ms[j]);
    part=simpson(fs);
    worst2=Math.max(worst2,(Math.abs((xx/L*k1-part)*1000-delta(xx))/Math.max(Math.abs(delta(xx)),1e-8,res.deflection.delta_max_mm*1e-6)));
  }
  var integration={check:"挠度 = M/EI 的辛普森二次积分（独立路径）",worst_rel_err:worst2,pass:worst2<1e-3};
  res.checks={equilibrium:equilibrium,boundary:bc,curvature:curvature,integration:integration,
              all_pass:equilibrium.pass&&bc.pass&&curvature.pass&&integration.pass};
  return res.checks;
}

/* ---------- 任务书解析 ---------- */
var ULEN={m:1,米:1,mm:0.001,毫米:0.001,cm:0.01,厘米:0.01};
var UFRC={kN:1,千牛:1,N:0.001,牛:0.001};
var UPRE={GPa:1,MPa:0.001,Pa:1e-9,kPa:1e-6};
var ULINE={"kN/m":1,"kN·m/m":1,"N/mm":1,"N/m":0.001};
function matchUnit(u,um){
  if(u===undefined||u===null||u==="") return null;
  if(um[u]!==undefined) return um[u];
  return null;
}
function findVals(text,alts,scale,um){
  var out=[],lines=text.split(/\r?\n/),rx=new RegExp("(?:"+alts+")(?:\\s|[=:：＝\\[\\]()（）]|[A-Za-z_σδτ]|大概|大约|大致|约|为|是|有|取|差不多|支座){0,12}(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\s*([a-zA-Zμ·/]+|毫米|厘米|米|千牛|牛)?","g");
  for(var i=0;i<lines.length;i++){
    var m,ln=lines[i];
    rx.lastIndex=0;
    while((m=rx.exec(ln))!==null){
      var val=parseFloat(m[1]), unit=m[2]||"", u=matchUnit(unit,um);
      out.push({value:(u!==null)?val*scale*u:val*scale,unit:unit||"?",line:i+1,snippet:ln.trim().slice(0,80),unit_ok:u!==null});
    }
  }
  return out;
}
/* Everyday input is normalized deterministically; unknown facts stay unknown. */
function chineseNumber(token){
  var digits={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
  var negative=token[0]==="负";if(negative)token=token.slice(1);
  var parts=token.split("点"),value=0,section=0,current=0;
  if(!/[十百千万亿]/.test(parts[0]))value=Number(Array.from(parts[0]).map(function(c){return digits[c];}).join(""));
  else{
    Array.from(parts[0]).forEach(function(c){
      if(Object.hasOwn(digits,c))current=digits[c];
      else if(c==="万"){section=(section+current)*10000;value+=section;section=0;current=0;}
      else if(c==="亿"){value=(value+section+current)*100000000;section=0;current=0;}
      else {section+=(current||1)*({十:10,百:100,千:1000}[c]||0);current=0;}
    });value+=section+current;
  }
  if(parts[1])value+=Number("0."+Array.from(parts[1]).map(function(c){return digits[c];}).join(""));
  return negative?-value:value;
}
function normalizeIntakeText(text){
  return text.replace(/[０-９Ａ-Ｚａ-ｚ．＝／]/g,function(c){return String.fromCharCode(c.charCodeAt(0)-0xfee0);})
    .replace(/公分/g,"厘米").replace(/公尺/g,"米").replace(/千牛顿/g,"千牛").replace(/牛顿/g,"牛")
    .replace(/(\d+(?:\.\d+)?)\s*(万|千|百)\s*(毫米|厘米|米|牛|帕)/g,function(s,n,magnitude,unit){return String(Number(n)*({万:10000,千:1000,百:100}[magnitude]))+unit;})
    .replace(/(\d+(?:\.\d+)?\s*(?:毫米|厘米|米|千牛|牛|GPa|MPa|kPa|Pa|[kK]?[nN]|[cm]?m))|([负零〇一二两三四五六七八九十百千万亿]+?(?:点[零〇一二三四五六七八九]+)?)(\s*(?:毫米|厘米|米|千牛|牛|GPa|MPa|kPa|Pa|[kK]?[nN]|[cm]?m|[×乘]))/g,function(s,arabic,chinese,unit){return arabic||String(chineseNumber(chinese))+unit;})
    .replace(/千牛\s*(?:每米|\/米)/g,"kN/m").replace(/牛\s*(?:每米|\/米)/g,"N/m")
    .replace(/\bkn\b/gi,"kN").replace(/\bgpa\b/gi,"GPa").replace(/\bmpa\b/gi,"MPa")
    .replace(/(\d)\s*乘\s*(?=\d)/g,"$1 × ");
}
function speechFacts(text){
  var number="(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)";
  var length="(mm|cm|m(?![a-zA-Z/])|毫米|厘米|米)";
  var force="(kN|N(?![a-zA-Z])|千牛|牛)(?!\\s*(?:/|每))";
  var filler="(?:\\s|[:：=]|大概|大约|大致|差不多|约|有|是|为|取|左右){0,18}";
  var lines=text.split(/\r?\n/),normalized=normalizeIntakeText(text).split(/\r?\n/);
  var facts={L:[],q:[],P:[],a:[],right:[],b:[],h:[],d:[]};
  function scan(key,pattern,units,scale){
    var rx=new RegExp(pattern,"g");
    normalized.forEach(function(line,index){var m;rx.lastIndex=0;while((m=rx.exec(line))!==null){var unit=matchUnit(m[2],units);if(unit!==null)facts[key].push({value:Number(m[1])*unit*(scale||1),unit:m[2],unit_ok:true,line:index+1,snippet:lines[index].trim().slice(0,80)});}});
  }
  scan("L","(?:梁(?:长|的长度)|(?:长|跨度))"+filler+number+"\\s*"+length,ULEN);
  scan("L","梁"+filler+number+"\\s*"+length,ULEN);
  scan("L",number+"\\s*"+length+"\\s*(?:长的|长|的)(?:简支|钢|木)?梁",ULEN);
  scan("q","每(?:米|m)"+filler+"(?:压|承受|放|有|荷载|载荷|重){0,4}"+filler+number+"\\s*"+force,UFRC);
  scan("P","(?:集中力|集中荷载|集中载荷|点荷载|设备(?:重|荷载)?|中间(?:放|压|有)|跨中(?:放|压|有))"+filler+number+"\\s*"+force,UFRC);
  scan("P",number+"\\s*"+force+"(?:重)?的(?:设备|集中力|点荷载)",UFRC);
  scan("a","(?:离|距离|距)左(?:边|端|侧|头|支座)(?:支座|A)?"+filler+number+"\\s*"+length,ULEN);
  scan("right","(?:离|距离|距)右(?:边|端|侧|头|支座)(?:支座|B)?"+filler+number+"\\s*"+length,ULEN);
  scan("b","(?:截面宽|宽度|宽|b\\b)"+filler+number+"\\s*"+length,ULEN,1000);
  scan("h","(?:截面高|高度|高|h\\b)"+filler+number+"\\s*"+length,ULEN,1000);
  scan("d","(?:直径|圆钢直径|d\\b)"+filler+number+"\\s*"+length,ULEN,1000);
  normalized.forEach(function(line,index){
    function zero(key,pattern){if(pattern.test(line))facts[key].push({value:0,unit:key==="q"?"kN/m":"kN",unit_ok:true,line:index+1,snippet:lines[index].trim().slice(0,80)});}
    zero("P",/(?:没有|没|无|不设|不考虑|不加)(?:任何)?(?:集中(?:荷载|力|载荷)|设备荷载)|只(?:有|受|考虑|承受)(?:满跨)?均布/);
    zero("q",/(?:没有|没|无|不设|不考虑|不加)(?:任何)?(?:均布(?:荷载|载荷)?|分布荷载)|只(?:有|受|考虑|承受)(?:一个|单个)?集中(?:力|荷载)/);
    if(/(?:没有|无|不加)(?:任何)?荷载/.test(line)){zero("P",/.*/);zero("q",/.*/);}
  });
  return facts;
}
function parseTaskbook(text){
  var originalText=text,originalLines=text.split(/\r?\n/),spoken=speechFacts(text);
  text=normalizeIntakeText(text);
  var out={found:{},missing:[],conflicts:[],unrecognized_unit:[],source_chars:text.length};
  out.unsupported=[];
  if(/悬臂梁|连续梁|外伸梁|固支梁|三角形荷载|梯形荷载|局部均布|多个集中荷载|两[个处]集中荷载/.test(text)) out.unsupported.push("任务包含当前简支梁模型未支持的边界或荷载，请核对后改用对应模型");
  if(!/梁/.test(text)&&/减速器|齿轮|电路|单片机|数据库|电机设计/.test(text))out.unsupported.push("这段描述涉及当前工作台尚未支持的课设类型，已保留原文，但不能套用简支梁公式计算");
  var L=findVals(text,"跨度|计算跨度|梁长|梁的长度|长度",1,ULEN);
  var q=findVals(text,"均布荷载|均布载荷|线荷载|分布荷载|荷载集度|均布(?=\\s*\\d)",1000,ULINE);
  var P=findVals(text,"集中荷载|集中力|集中载荷",1000,UFRC);
  var a=findVals(text,"作用位置|距左端|距A端|距左支座|作用点距|距支座A|距离左端",1,ULEN);
  var E=findVals(text,"弹性模量|杨氏模量",1,UPRE);
  var sa=findVals(text,"许用应力|许用正应力|设计应力|允许应力",1,{MPa:1,Pa:1e-6,kPa:1e-3,GPa:1000});
  L=L.concat(spoken.L);q=q.concat(spoken.q.map(function(it){return Object.assign({},it,{value:it.value*1000});}));P=P.concat(spoken.P.map(function(it){return Object.assign({},it,{value:it.value*1000});}));a=a.concat(spoken.a);
  [["L",L,"\\bL(?=\\s*(?:[:=：]|-?\\d))",ULEN],["q",q,"\\bq(?=\\s*(?:[:=：]|-?\\d))",ULINE],["P",P,"\\bP(?=\\s*(?:[:=：]|-?\\d))",UFRC],["a",a,"\\ba(?=\\s*(?:[:=：]|-?\\d))",ULEN],["E",E,"\\bE(?=\\s*(?:[:=：]|-?\\d))",UPRE]].forEach(function(pair){
    var values=findVals(text,pair[2],pair[0]==="q"||pair[0]==="P"?1000:1,pair[3]);pair[1].push.apply(pair[1],values);
  });
  var dv=[],lines=text.split(/\r?\n/),i,m;
  var rx1=/[挠度]{2}[^。\n]{0,25}?(?:[≤<≤]|不超过|不大于|不得超过|控制在)\s*[lL]\s*\/\s*(\d+)/;
  var rx2=/[lL]\s*\/\s*(\d+)\s*[^。\n]{0,12}[的]?\s*[挠度]{2}/;
  for(i=0;i<lines.length;i++){
    m=lines[i].match(rx1)||lines[i].match(rx2);
    if(m) dv.push({value:parseFloat(m[1]),unit:"L/x",line:i+1,snippet:lines[i].trim().slice(0,80),unit_ok:true});
    var fraction=lines[i].match(/(?:挠度|变形)[^。\n]{0,20}?跨度的?([零〇一二两三四五六七八九十百千万\d]+)分之一/);
    if(fraction)dv.push({value:/^\d+$/.test(fraction[1])?Number(fraction[1]):chineseNumber(fraction[1]),unit:"L/x",line:i+1,snippet:lines[i].trim().slice(0,80),unit_ok:true});
  }
  var sec=[];
  for(i=0;i<lines.length;i++){
    m=lines[i].match(/(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)\s*([a-zA-Z/]+|毫米|厘米|米)?/);
    if(m && /矩形|截面|b\s*[×xX*]\s*h|宽/.test(lines[i])){
      var unitScale=matchUnit(m[3],ULEN);
      var sectionValue={b_mm:Number(m[1])*(unitScale===null?1:unitScale*1000),h_mm:Number(m[2])*(unitScale===null?1:unitScale*1000),line:i+1,snippet:lines[i].trim().slice(0,80),unit_ok:unitScale!==null};
      sec.push(sectionValue);
      if(unitScale===null)out.unrecognized_unit.push({key:"section",item:sectionValue});
    }
  }
  var mat=[];
  for(i=0;i<lines.length;i++){
    m=lines[i].match(/(Q235|Q345|Q355|Q420|16Mn|铝合金|木材|松木|杉木|不锈钢|45钢|A3钢)/);
    if(m) mat.push({material:m[1],line:i+1,snippet:lines[i].trim().slice(0,80)});
    else if(/钢(?:的|材|梁)|普通钢|材料.{0,4}钢/.test(lines[i]))mat.push({material:"钢材（牌号待确认）",line:i+1,snippet:lines[i].trim().slice(0,80)});
  }
  function dedup(key,items){
    if(!items.length){ out.missing.push(key); return; }
    var recognized=items.filter(function(it){return it.unit_ok!==false;});
    if(recognized.length)items=recognized;
    var v0=items[0].value;
    for(var k=1;k<items.length;k++)
      if(Math.abs(items[k].value-v0)>1e-9*Math.max(1,Math.abs(v0))){ out.conflicts.push({key:key,items:items}); break; }
    out.found[key]=items[0];
  }
  dedup("L_m",L);
  if(L.length&&spoken.right.length)spoken.right.forEach(function(it){a.push(Object.assign({},it,{value:L[0].value-it.value,derived_from:"由距右支座距离与跨度换算"}));});
  var centerLine=lines.findIndex(function(line){return /(?:集中(?:力|荷载|载荷)|设备|位置|作用点)[^。；;\n]{0,25}(?:正中间|跨中|中点)|(?:正中间|跨中|中间).{0,6}(?:放|压|有)|(?:放|压|位于|在).{0,3}(?:正中间|跨中|中点)/.test(line);});
  if(out.found.L_m&&out.found.L_m.unit_ok!==false&&P.some(function(it){return it.value>0;})&&centerLine>=0){
    a.push({value:out.found.L_m.value/2,unit:"m",unit_ok:true,line:centerLine+1,snippet:originalLines[centerLine].trim().slice(0,80),derived_from:"由明确的跨中位置与跨度换算"});
  }
  dedup("q_kN_m",q.map(function(it){return {value:it.value/1000,unit:"kN/m",line:it.line,snippet:it.snippet,unit_ok:it.unit_ok};}));
  dedup("P_kN",P.map(function(it){return {value:it.value/1000,unit:"kN",line:it.line,snippet:it.snippet,unit_ok:it.unit_ok};}));
  dedup("a_m",a);
  dedup("E_GPa",E);
  dedup("sigma_allow_MPa",sa);
  dedup("deflection_limit_divisor",dv);
  if(spoken.b.length)dedup("b_mm",spoken.b);
  if(spoken.h.length)dedup("h_mm",spoken.h);
  if(spoken.d.length)dedup("d_mm",spoken.d);
  if(spoken.b.length&&spoken.h.length)sec.push({b_mm:spoken.b[0].value,h_mm:spoken.h[0].value,line:spoken.b[0].line,snippet:spoken.b[0].snippet,unit_ok:true});
  if(sec.length){
    out.found.section=sec[0];
    if(sec.some(function(s){return s.b_mm!==sec[0].b_mm||s.h_mm!==sec[0].h_mm;})) out.conflicts.push({key:"section",items:sec});
  } else if(spoken.d.length){out.found.section={shape:"circle",d_mm:spoken.d[0].value,line:spoken.d[0].line,snippet:spoken.d[0].snippet,unit_ok:true};}
  else out.missing.push("section");
  if(mat.length) out.found.material_name=mat[0]; else out.missing.push("material_name");
  [[L,"L"],[q,"q"],[P,"P"],[a,"a"],[E,"E"],[sa,"σ"]].forEach(function(pair){
    pair[0].forEach(function(it){ if(!it.unit_ok) out.unrecognized_unit.push({key:pair[1],item:it}); });
  });
  Object.values(out.found).forEach(function(it){if(it&&it.line)it.snippet=originalLines[it.line-1].trim().slice(0,80);});
  out.conflicts.forEach(function(conflict){conflict.items.forEach(function(it){if(it.line)it.snippet=originalLines[it.line-1].trim().slice(0,80);});});
  out.unrecognized_unit.forEach(function(u){if(u.item.line)u.item.snippet=originalLines[u.item.line-1].trim().slice(0,80);});
  out.source_chars=originalText.length;
  out.intake_questions=intakeQuestions(out);
  return out;
}
function intakeQuestions(parsed){
  var f=parsed.found,questions=[];
  if(parsed.unsupported.length)return questions;
  function known(key){return f[key]&&f[key].unit_ok!==false;}
  if(!known("L_m"))questions.push({key:"L_m",label:"这根梁有多长？（单位：米）",example:"比如：6米、六米长，或直接填米数",prefix:"跨度 "});
  if(!known("q_kN_m"))questions.push({key:"q_kN_m",label:"梁上每米承受多少均匀分布的力？（kN/m）",example:"比如：每米10千牛；没有的话说“没有均布荷载”",prefix:"均布荷载 "});
  if(!known("P_kN"))questions.push({key:"P_kN",label:"还有单独压在某个位置的力吗？（kN）",example:"比如：集中力20千牛；没有的话说“没有集中力”",prefix:"集中荷载 "});
  if(known("P_kN")&&f.P_kN.value>0&&!known("a_m"))questions.push({key:"a_m",label:"这个集中力距左支座多远？（米）",example:"比如：离左边2米，或在正中间",prefix:"距左支座 "});
  if(!known("section"))questions.push({key:"section",label:known("b_mm")?"截面有多高？":known("h_mm")?"截面有多宽？":"截面是什么形状、多大？",example:"比如：宽16厘米、高40厘米；或圆钢直径10厘米",prefix:known("b_mm")?"截面高 ":known("h_mm")?"截面宽 ":"矩形截面 "});
  if(!known("E_GPa"))questions.push({key:"E_GPa",label:"知道材料的弹性模量吗？（GPa）",example:"比如：206GPa；不知道可先留空，稍后选教学预设",prefix:"弹性模量 "});
  return questions;
}
function parsedToInput(parsed, overrides){
  var f=parsed.found, o=overrides||{};
  var inp={beam:{},loads:{},material:{},section:{},criteria:{}};
  function take(key,setter){
    if(o[key]!==undefined && o[key]!==null && o[key]!==""){ setter(o[key]); return; }
    if(f[key] && f[key].unit_ok !== false) setter(f[key].value);
  }
  take("L_m",function(v){inp.beam.L_m=v;});
  take("q_kN_m",function(v){inp.loads.q_kN_m=v;});
  take("P_kN",function(v){inp.loads.P_kN=v;});
  take("a_m",function(v){inp.loads.a_m=v;});
  take("E_GPa",function(v){inp.material.E_GPa=v;});
  take("sigma_allow_MPa",function(v){inp.material.sigma_allow_MPa=v;});
  if(o.deflection_limit_divisor!==undefined&&o.deflection_limit_divisor!=="") inp.criteria.deflection_limit_divisor=o.deflection_limit_divisor;
  else if(f.deflection_limit_divisor) inp.criteria.deflection_limit_divisor=f.deflection_limit_divisor.value;
  if(f.material_name) inp.material.name=f.material_name.material;
  if(o.section_b!==undefined||o.section_h!==undefined){ inp.section={shape:"rect",b_mm:o.section_b,h_mm:o.section_h}; }
  else if(f.section&&f.section.unit_ok!==false) inp.section=f.section.shape==="circle"?{shape:"circle",d_mm:f.section.d_mm}:{shape:"rect",b_mm:f.section.b_mm,h_mm:f.section.h_mm};
  return inp;
}

/* ---------- 图表层（数据生成的 SVG） ---------- */
function svgFrame(title){
  return ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 260" font-family="Microsoft YaHei,PingFang SC,sans-serif">',
    '<rect x="0" y="0" width="720" height="260" fill="#ffffff"/>',
    '<text x="360" y="24" text-anchor="middle" font-size="15" fill="#1a5276" font-weight="bold">'+esc(title)+'</text>'];
}
function svgSchematic(p){
  var L=p.L,a=p.a,q=p.q,P=p.P,x0=60,x1=660,yb=170,s=svgFrame("计算简图（荷载、跨度与截面）");
  s.push('<line x1="'+x0+'" y1="'+yb+'" x2="'+x1+'" y2="'+yb+'" stroke="#333" stroke-width="3"/>');
  [[x0,"A"],[x1,"B"]].forEach(function(d){
    s.push('<polygon points="'+(d[0]-7)+','+(yb+4)+' '+(d[0]+7)+','+(yb+4)+' '+d[0]+','+(yb+18)+'" fill="#333"/>');
    s.push('<text x="'+d[0]+'" y="'+(yb+36)+'" text-anchor="middle" font-size="13">'+d[1]+'</text>');
  });
  s.push('<text x="360" y="'+(yb+36)+'" text-anchor="middle" font-size="13">L = '+fnum(L)+' m</text>');
  if(q>0){
    var n=14,i;
    for(i=0;i<=n;i++){
      var x=x0+i*(x1-x0)/n;
      s.push('<line x1="'+x.toFixed(1)+'" y1="'+(yb-40)+'" x2="'+x.toFixed(1)+'" y2="'+(yb-6)+'" stroke="#2e86c1" stroke-width="1.4"/>');
      s.push('<polygon points="'+x.toFixed(1)+','+(yb-6)+' '+(x-3.5).toFixed(1)+','+(yb-12)+' '+(x+3.5).toFixed(1)+','+(yb-12)+'" fill="#2e86c1"/>');
    }
    s.push('<line x1="'+x0+'" y1="'+(yb-40)+'" x2="'+x1+'" y2="'+(yb-40)+'" stroke="#2e86c1" stroke-width="1.6"/>');
    s.push('<text x="360" y="'+(yb-48)+'" text-anchor="middle" font-size="13" fill="#2e86c1">q = '+fnum(q)+' kN/m</text>');
  }
  if(a!==null&&P>0){
    var ax=x0+a/L*(x1-x0);
    s.push('<line x1="'+ax.toFixed(1)+'" y1="'+(yb-78)+'" x2="'+ax.toFixed(1)+'" y2="'+(yb-6)+'" stroke="#c0392b" stroke-width="2.4"/>');
    s.push('<polygon points="'+ax.toFixed(1)+','+(yb-6)+' '+(ax-5).toFixed(1)+','+(yb-16)+' '+(ax+5).toFixed(1)+','+(yb-16)+'" fill="#c0392b"/>');
    s.push('<text x="'+ax.toFixed(1)+'" y="'+(yb-86)+'" text-anchor="middle" font-size="13" fill="#c0392b">P = '+fnum(P)+' kN（a = '+fnum(a)+' m）</text>');
  }
  s.push('<text x="'+x0+'" y="'+(yb+58)+'" font-size="12" fill="#666">'+esc("截面："+p.section_desc+"；E = "+fnum(p.E)+" GPa")+'</text>');
  s.push('</svg>');
  return s.join("\n");
}
function svgCurve(samples,key,title,unit,color,posDown){
  var x0=70,x1=690,y0=50,y1=250,vals=samples.map(function(s){return s[key];});
  var vmax=Math.max.apply(null,vals.map(Math.abs))||1;
  var Lm=samples[samples.length-1].x_m||1;
  var s=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 300" font-family="Microsoft YaHei,PingFang SC,sans-serif">',
    '<rect x="0" y="0" width="720" height="300" fill="#ffffff"/>',
    '<text x="360" y="24" text-anchor="middle" font-size="15" fill="#1a5276" font-weight="bold">'+esc(title+"（单位："+unit+"）")+'</text>',
    '<line x1="'+x0+'" y1="150" x2="'+x1+'" y2="150" stroke="#999" stroke-width="1"/>',
    '<line x1="'+x0+'" y1="'+(y0-8)+'" x2="'+x0+'" y2="'+(y1+8)+'" stroke="#999" stroke-width="1"/>'];
  function X(x){ return x0+x/Lm*(x1-x0); }
  function Y(v){ var f=v/(vmax*1.15); if(posDown) f=-f; return 150-f*100; }
  s.push('<polyline points="'+samples.map(function(sm){return X(sm.x_m).toFixed(1)+","+Y(sm[key]).toFixed(1);}).join(" ")+'" fill="none" stroke="'+color+'" stroke-width="2.2"/>');
  var iv=0,i;
  for(i=1;i<vals.length;i++) if(Math.abs(vals[i])>Math.abs(vals[iv])) iv=i;
  s.push('<circle cx="'+X(samples[iv].x_m).toFixed(1)+'" cy="'+Y(vals[iv]).toFixed(1)+'" r="4" fill="'+color+'"/>');
  s.push('<text x="'+Math.min(X(samples[iv].x_m)+8,x1-70).toFixed(0)+'" y="'+(Y(vals[iv])-8).toFixed(0)+'" font-size="12" fill="'+color+'">x='+fnum(samples[iv].x_m,2)+' m, '+fnum(vals[iv],2)+' '+unit+'</text>');
  s.push('<text x="380" y="288" text-anchor="middle" font-size="12" fill="#666">x / m（0 → '+fnum(Lm)+'）</text>');
  s.push('<text x="'+(x0-8)+'" y="'+y0+'" text-anchor="end" font-size="11" fill="#666">'+(posDown?'-':'+')+fnum(vmax,1)+'</text>');
  s.push('<text x="'+(x0-8)+'" y="'+y1+'" text-anchor="end" font-size="11" fill="#666">'+(posDown?'+':'-')+fnum(vmax,1)+'</text>');
  s.push('</svg>');
  return s.join("\n");
}

/* ---------- 报告层（只消费结果，不参与计算） ---------- */
var ASSUMPTIONS=[
  "等截面直梁，材料均质、线弹性（胡克定律适用），拉压弹性模量相同",
  "Euler-Bernoulli 细长梁假设：变形前横截面保持平面且垂直于轴线（忽略剪切变形与转动惯量）",
  "小挠度与几何线性：仅适用于转角及位移足够小的情况；L/10 是极端变形报警阈值，不能作为适用性证明",
  "简支边界：两端仅约束竖向位移，不约束转角；支座无沉降、无摩擦力偶",
  "荷载为静力荷载，不含动力/冲击/疲劳效应",
  "集中荷载 P 作用于跨内一点（a ∈ [0, L]），均布荷载满跨布置",
  "自重已包含于 q（如任务书另有说明需另行叠加）",
  "应力校核采用材料力学弹性方法：σ = M/W；挠度采用叠加法闭式解"];
var NOT_COVERED=[
  "非简支梁（悬臂、外伸、连续梁、固支梁）与其他支承组合",
  "多个集中荷载、梯形/三角形分布荷载、局部均布荷载、移动荷载",
  "变截面梁、组合梁、复合材料梁、开口薄壁截面的扭转与翘曲",
  "剪切变形（Timoshenko 梁）、深梁（跨高比 < 10）效应",
  "稳定性问题：整体/局部屈曲、侧向扭转失稳、欧拉临界荷载验算",
  "疲劳、蠕变、温度应力、动力与地震作用、冲击",
  "连接与节点设计（焊缝、螺栓）、构造要求与现行结构设计规范全套条文",
  "木结构、砌体、混凝土配筋等按专门规范设计的构件"];
var NOTICE="本工具面向工科课程设计的教学验算，公式来源与适用范围见知识库；不能替代注册工程师按现行国家/行业规范进行的正式结构设计。";

function renderReport(inp,p,probs,res,meta,srcLines){
  var L=p.L,q=p.q,P=p.P,a=p.a,E=p.E;
  var RA=res.reactions.RA_kN,RB=res.reactions.RB_kN;
  var it=res.internal,st=res.stress,df=res.deflection,ck=res.checks;
  var b=(a!==null)?L-a:null, W=p.W_mm3, I=p.I_mm4, x_star=it.x_Mmax_m;
  meta=meta||{}; srcLines=srcLines||[];
  var A=[];
  A.push("# 《"+(meta.project||"材料力学课程设计")+"》计算书（课设智辅 生成）");
  A.push("");
  A.push("> 生成工具：课设智辅 v"+ENGINE_VERSION+"（确定性计算引擎，可复算）  ");
  A.push("> 生成日期："+res.date+"  ");
  A.push("> 任务来源："+(meta.source||"手工输入"));
  A.push("");
  A.push("## 一、任务与参数");
  A.push("");
  A.push("| 参数 | 符号 | 数值 | 单位 | 状态 |");
  A.push("|---|---|---|---|---|");
  [["跨度","L",fnum(L),"m",""],
   ["均布荷载","q",fnum(q),"kN/m",q?"":"未给出，取 0"],
   ["集中荷载","P",fnum(P),"kN",P?"":"未给出，取 0"],
   ["集中荷载位置","a",(a!==null)?fnum(a):"—","m",(a!==null)?"距左支座 A":"未给出"],
   ["弹性模量","E",fnum(E),"GPa",""],
   ["截面","—",p.section_desc,"—",""],
   ["惯性矩","I",(I).toPrecision(4).replace(/\.?0+e/,"e"),"mm⁴",""],
   ["抗弯截面模量","W",(W).toPrecision(4).replace(/\.?0+e/,"e"),"mm³",""],
   ["许用应力","[σ]",p.sigma_allow_MPa!==null?fnum(p.sigma_allow_MPa):"—","MPa",p.sigma_allow_MPa!==null?"给出":"未给出，不判定"],
   ["挠度限值","[δ]","L/"+fnum(p.defl_div),"—",p.defl_div===250?"默认课程设计值":""]
  ].forEach(function(r){ A.push("| "+r.join(" | ")+" |"); });
  if(srcLines.length){
    A.push(""); A.push("任务书来源摘录（保留原文行号，便于核对）："); A.push("");
    srcLines.slice(0,12).forEach(function(s){ A.push("- 第"+s.line+"行："+s.snippet); });
  }
  if(probs.missing.length){
    A.push(""); A.push("**缺失项（需人工补充或确认）：**");
    probs.missing.forEach(function(m){ A.push("- "+(typeof m==="object"?(m.name+"（"+m.reason+"）"):m)); });
  }
  if(probs.conflicts&&probs.conflicts.length){
    A.push(""); A.push("**冲突项（需人工裁决）：**");
    probs.conflicts.forEach(function(c){ A.push("- "+c.key+"："+JSON.stringify(c.items)); });
  }
  A.push(""); A.push("## 二、计算模型、假设与适用范围"); A.push("");
  A.push("计算模型：**简支梁 + 满跨均布荷载 q + 单个集中荷载 P（作用位置 a）**，等截面线弹性小挠度梁。"); A.push("");
  ASSUMPTIONS.forEach(function(t,i){ A.push((i+1)+". "+t); });
  A.push(""); A.push("**本工具未覆盖事项（不得用于下列场景的结论）：**"); A.push("");
  NOT_COVERED.forEach(function(t){ A.push("- "+t); });
  A.push(""); A.push("> "+NOTICE); A.push("");
  A.push("## 三、支反力计算（推导）"); A.push("");
  if(a!==null){
    A.push("由竖向力平衡与力矩平衡（对 B 支座取矩）："); A.push("");
    A.push("$$R_A = qL/2 + Pb/L,  R_B = qL/2 + Pa/L,  b = L - a$$"); A.push("");
    A.push("代入：b = "+fnum(L)+" − "+fnum(a)+" = "+fnum(b)+" m"); A.push("");
    A.push("R_A = "+fnum(q)+"×"+fnum(L)+"/2 + "+fnum(P)+"×"+fnum(b)+"/"+fnum(L)+" = "+fnum(q*L/2)+" + "+fnum(P*b/L)+" = **"+fnum(RA,3)+" kN**"); A.push("");
    A.push("R_B = "+fnum(q)+"×"+fnum(L)+"/2 + "+fnum(P)+"×"+fnum(a)+"/"+fnum(L)+" = "+fnum(q*L/2)+" + "+fnum(P*a/L)+" = **"+fnum(RB,3)+" kN**");
  }else{
    A.push("$$R_A = R_B = qL/2$$"); A.push("");
    A.push("R_A = R_B = "+fnum(q)+"×"+fnum(L)+"/2 = **"+fnum(RA,3)+" kN**");
  }
  A.push(""); var e=ck.equilibrium;
  A.push("**平衡检查**："+e.check+" → "+fnum(e.left,3)+" vs "+fnum(e.right,3)+"，相对误差 "+e.rel_err.toExponential(2)+"，"+(e.pass?"通过":"未通过")+"。"); A.push("");
  A.push("## 四、内力分析（剪力与弯矩）"); A.push("");
  if(a!==null){
    A.push("分段内力方程（x 自左支座 A 起量，[x≥a] 表示该项仅在 x≥a 时计入）："); A.push("");
    A.push("$$V(x) = R_A − qx − P·[x≥a]$$"); A.push("");
    A.push("$$M(x) = R_A·x − qx²/2 − P(x−a)·[x≥a]$$"); A.push("");
    A.push("比较支座、荷载点与分段剪力零点，得到弯矩最大值位置 x* = "+fnum(x_star,4)+" m，代入弯矩方程："); A.push("");
    A.push("M_max = "+fnum(RA)+"×"+fnum(x_star,4)+" − "+fnum(q)+"×"+fnum(x_star,4)+"²/2 − "+fnum(P)+"×max(0, "+fnum(x_star,4)+"−"+fnum(a)+") = **"+fnum(it.Mmax_kN_m,3)+" kN·m**");
    if(it.M_at_load_kN_m!==null){ A.push(""); A.push("荷载作用点处：M(a) = "+fnum(it.M_at_load_kN_m,3)+" kN·m"); }
  }else{
    A.push("$$V(x) = R_A − qx,  M(x) = R_A·x − qx²/2$$"); A.push("");
    A.push("跨中 V = 0，M_max = qL²/8 = "+fnum(q)+"×"+fnum(L)+"²/8 = **"+fnum(it.Mmax_kN_m,3)+" kN·m**（x* = "+fnum(x_star,3)+" m）");
  }
  A.push(""); A.push("**V_max = "+fnum(it.Vmax_kN,3)+" kN**（支座内侧，取 |V| 最大值）。"); A.push("");
  A.push("**一致性核验**：① 曲率方程 "+ck.curvature.check+"，最差相对误差 "+ck.curvature.worst_rel_err.toExponential(2)+"，"+(ck.curvature.pass?"通过":"未通过")+
    "；② "+ck.integration.check+"，最差相对误差 "+ck.integration.worst_rel_err.toExponential(2)+"，"+(ck.integration.pass?"通过":"未通过")+"。"); A.push("");
  A.push("## 五、截面特性与应力校核"); A.push("");
  if(p.shape==="rect") A.push("矩形截面：I = bh³/12 = "+fnum(p.b)+"×"+fnum(p.h)+"³/12 = "+I.toPrecision(4)+" mm⁴；W = bh²/6 = "+W.toPrecision(4)+" mm³。");
  else if(p.shape==="circle") A.push("圆截面：I = πd⁴/64 = "+I.toPrecision(4)+" mm⁴；W = πd³/32 = "+W.toPrecision(4)+" mm³。");
  else A.push("自定义截面：I = "+I.toPrecision(4)+" mm⁴；W = "+W.toPrecision(4)+" mm³。");
  A.push(""); A.push("σ_max = M_max / W = "+it.Mmax_kN_m.toPrecision(6)+"×10⁶ / "+W.toPrecision(4)+" = **"+fnum(st.sigma_max_MPa,3)+" MPa**"); A.push("");
  if(st.utilization!==null){
    A.push("校核：σ_max = "+fnum(st.sigma_max_MPa,3)+" MPa "+(st.pass?"≤":">")+" [σ] = "+fnum(p.sigma_allow_MPa)+" MPa，利用率 "+st.utilization.toFixed(3)+"，"+(st.pass?"满足":"**不满足**")+"强度要求。");
  }else A.push("未给出许用应力 [σ]，仅给出计算值（请查知识库材料表后人工判定）。");
  if(st.tau_max_MPa!==null){
    A.push("");
    if(st.tau_pass!==null) A.push("剪应力（矩形截面 τ_max = 1.5V/A）："+fnum(st.tau_max_MPa,3)+" MPa "+(st.tau_pass?"≤":">")+" [τ] = "+fnum(p.tau_allow_MPa)+" MPa，"+(st.tau_pass?"满足":"不满足")+"。");
    else A.push("剪应力（矩形截面 τ_max = 1.5V/A）："+fnum(st.tau_max_MPa,3)+" MPa（未给出 [τ]，仅计算数值）。");
  }
  A.push(""); A.push("## 六、变形计算与刚度校核"); A.push("");
  A.push("挠度采用叠加法闭式解（简支梁，δ 以向下为正）："); A.push("");
  A.push("$$δ_q(x) = qx(L³ − 2Lx² + x³) / 24EI$$");
  if(a!==null&&P>0){ A.push(""); A.push("$$δ_P(x) = Pbx(L²−b²−x²)/6LEI  (x ≤ a)；  Pa(L−x)(L²−a²−(L−x)²)/6LEI  (x ≥ a)$$"); }
  A.push(""); A.push("EI = "+fnum(E)+"×10⁹ Pa × "+I.toPrecision(4)+"×10⁻¹² m⁴ = "+(E*I*1e-6).toPrecision(4)+" kN·m²"); A.push("");
  A.push("数值扫描（"+N_SAMPLES+" 点 + 黄金分割细化）得：**δ_max = "+fnum(df.delta_max_mm,3)+" mm**（x = "+fnum(df.x_delta_max_m,3)+" m）"); A.push("");
  A.push("刚度校核：δ_max = "+fnum(df.delta_max_mm,3)+" mm "+(df.pass?"≤":">")+" L/"+fnum(p.defl_div)+" = "+fnum(df.limit_mm,3)+" mm，"+(df.pass?"满足":"**不满足**")+"刚度要求。"); A.push("");
  if(!df.small_deflection_ok) A.push("> ⚠ 最大挠度超过 L/10，小挠度线性假设误差增大，结果仅供参考，需改用大挠度/非线性分析。");
  else A.push("挠跨比 δ_max/L = "+(df.delta_max_mm/(L*1000)).toFixed(4)+"；L/10 仅作极端变形报警阈值，小挠度适用性仍需结合课程要求人工核对。");
  A.push(""); A.push("## 七、内力与变形图（见工作台步骤④，导出文件内嵌）"); A.push("");
  A.push("## 八、关键结果汇总（供报告一致性检查复核）"); A.push("");
  A.push("| 量 | 数值 | 单位 |"); A.push("|---|---|---|");
  A.push("| RA | "+fnum(RA,3)+" | kN |");
  A.push("| RB | "+fnum(RB,3)+" | kN |");
  A.push("| Vmax | "+fnum(it.Vmax_kN,3)+" | kN |");
  A.push("| Mmax | "+fnum(it.Mmax_kN_m,3)+" | kN·m |");
  A.push("| sigma_max | "+fnum(st.sigma_max_MPa,3)+" | MPa |");
  A.push("| delta_max | "+fnum(df.delta_max_mm,3)+" | mm |");
  A.push("| I | "+I.toPrecision(4)+" | mm⁴ |");
  A.push("| W | "+W.toPrecision(4)+" | mm³ |");
  A.push(""); A.push("## 九、采样数据表（约每 L/40 一行，可复算核对）"); A.push("");
  A.push("| x/m | V/kN | M/(kN·m) | δ/mm |"); A.push("|---|---|---|---|");
  it.samples.forEach(function(s){ A.push("| "+fnum(s.x_m,3)+(s.side==="left"?"（左侧）":s.side==="right"?"（右侧）":"")+" | "+fnum(s.V_kN,3)+" | "+fnum(s.M_kN_m,3)+" | "+fnum(s.delta_mm,4)+" |"); });
  A.push(""); A.push("## 十、结论与建议"); A.push("");
  if(st.pass===true) A.push("- 强度：σ_max = "+fnum(st.sigma_max_MPa,3)+" MPa ≤ [σ]，利用率 "+st.utilization.toFixed(2)+"，满足。");
  else if(st.pass===false) A.push("- 强度：σ_max = "+fnum(st.sigma_max_MPa,3)+" MPa > [σ]，不满足，需增大截面或调整荷载。");
  else A.push("- 强度：未给出 [σ]，无法判定。");
  A.push("- 刚度：δ_max = "+fnum(df.delta_max_mm,3)+" mm，限值 "+fnum(df.limit_mm,3)+" mm，"+(df.pass?"满足":"不满足")+"。");
  A.push("- 计算一致性："+(ck.all_pass?"全部通过":"存在未通过项，请核查")+"。");
  if(probs.warnings.length){ A.push(""); A.push("**警告（需人工确认）：**"); probs.warnings.forEach(function(w){ A.push("- "+w); }); }
  A.push(""); A.push("---"); A.push("*"+NOTICE+"*");
  return A.join("\n");
}

/* ---------- 报告一致性检查 ---------- */
var CLAIM_PATTERNS=[
  [/\|\s*RA\s*\|\s*(-?[\d.]+)\s*\|\s*kN/g,"RA_kN"],
  [/\|\s*RB\s*\|\s*(-?[\d.]+)\s*\|\s*kN/g,"RB_kN"],
  [/\|\s*Vmax\s*\|\s*(-?[\d.]+)\s*\|\s*kN/g,"Vmax_kN"],
  [/\|\s*Mmax\s*\|\s*(-?[\d.]+)\s*\|\s*kN[·.]?m/g,"Mmax_kN_m"],
  [/\|\s*sigma_max\s*\|\s*(-?[\d.]+)\s*\|\s*MPa/g,"sigma_max_MPa"],
  [/\|\s*delta_max\s*\|\s*(-?[\d.]+)\s*\|\s*mm/g,"delta_max_mm"],
  [/\|\s*I\s*\|\s*([\d.eE+-]+)\s*\|\s*mm/g,"I_mm4"],
  [/\|\s*W\s*\|\s*([\d.eE+-]+)\s*\|\s*mm/g,"W_mm3"],
  [/σ_?max\s*=\s*(-?[\d.]+)\s*MPa/g,"sigma_max_MPa"],
  [/δ_?max\s*=\s*(-?[\d.]+)\s*mm/g,"delta_max_mm"],
  [/\bRA\s*=\s*(-?[\d.]+)\s*kN/g,"RA_kN"],
  [/\bRB\s*=\s*(-?[\d.]+)\s*kN/g,"RB_kN"]
];
function checkReport(res,text,tol){
  tol=tol||0.005;
  var truth={RA_kN:res.reactions.RA_kN,RB_kN:res.reactions.RB_kN,Vmax_kN:res.internal.Vmax_kN,
    Mmax_kN_m:res.internal.Mmax_kN_m,sigma_max_MPa:res.stress.sigma_max_MPa,
    delta_max_mm:res.deflection.delta_max_mm,I_mm4:res.inputs_echo.I_mm4,W_mm3:res.inputs_echo.W_mm3};
  var claims=[],mismatches=[];
  CLAIM_PATTERNS.forEach(function(cp){
    var m; cp[0].lastIndex=0;
    while((m=cp[0].exec(text))!==null){
      var claimed=Number(m[1]); if(!Number.isFinite(claimed)) continue;
      claims.push({key:cp[1],claimed:claimed});
      if(truth[cp[1]]!==undefined){
        var err=relerr(claimed,truth[cp[1]]);
        if(err>tol) mismatches.push({key:cp[1],claimed:claimed,recomputed:truth[cp[1]],rel_err:err});
      }
    }
  });
  return {claims:claims,mismatches:mismatches,tolerance:tol,
    verdict:!claims.length?"未识别到可核对数值":mismatches.length? "FAIL（"+mismatches.length+" 处不一致）":"已识别数值一致（不代表全文通过）"};
}

/* ============================================================
 * UI 层
 * ============================================================ */
