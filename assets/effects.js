/* Presentation only: no task text, persisted pointer data, network, or dependencies. */
(function(){
  "use strict";
  var root=document.documentElement,canvas=document.getElementById("cursorTrail");
  var ctx=canvas.getContext("2d"),toggle=document.getElementById("motionToggle"),label=document.getElementById("motionLabel");
  var reduced=matchMedia("(prefers-reduced-motion: reduce)"),fine=matchMedia("(any-pointer: fine)"),forced=matchMedia("(forced-colors: active)");
  var key="course-assistant.effects.v1",enabled=readStorage(key)!=="off",frame=0,particles=[],pending=null;
  var lastPoint=null,lastEmit=0,lastDraw=0,framesDrawn=0,dpr=1,width=0,height=0,rgb="91,114,222";
  var rippleTimers=new Map();
  var indicator=document.createElement("span");indicator.className="theme-indicator";indicator.setAttribute("aria-hidden","true");
  var switcher=document.querySelector(".theme-switch");switcher.prepend(indicator);

  function active(){return enabled&&!reduced.matches&&!forced.matches;}
  function canTrail(){return active()&&fine.matches&&!!ctx&&!document.hidden;}
  function clear(){
    if(frame)cancelAnimationFrame(frame);frame=0;pending=null;lastPoint=null;particles=[];lastEmit=0;lastDraw=0;
    if(ctx)ctx.clearRect(0,0,width,height);
  }
  function cleanupRipples(){
    rippleTimers.forEach(function(timer,node){clearTimeout(timer);node.remove();});rippleTimers.clear();
  }
  function positionIndicator(){
    var selected=switcher.querySelector('[aria-pressed="true"]');if(!selected)return;
    indicator.style.width=selected.offsetWidth+"px";indicator.style.transform="translateX("+selected.offsetLeft+"px)";
  }
  function sync(){
    root.dataset.motion=active()?"on":"off";
    toggle.setAttribute("aria-pressed",String(active()));toggle.disabled=reduced.matches||forced.matches;
    label.textContent=reduced.matches?"已减少动态":forced.matches?"静态显示":"动态效果";
    toggle.title=reduced.matches?"已遵循系统的减少动态效果设置":forced.matches?"已遵循系统的高对比度设置":"开启或关闭背景、交互动画与数码光迹";
    canvas.hidden=!canTrail();clear();cleanupRipples();
    rgb=getComputedStyle(root).getPropertyValue("--accent-rgb").trim()||"91,114,222";
    positionIndicator();
  }
  function resize(){
    clear();width=innerWidth;height=innerHeight;
    // Four million backing pixels maximum, including large / high density displays.
    dpr=Math.min(devicePixelRatio||1,1.5,Math.sqrt(4000000/(width*height)));
    canvas.width=Math.floor(width*dpr);canvas.height=Math.floor(height*dpr);
    if(ctx)ctx.setTransform(dpr,0,0,dpr,0,0);
    positionIndicator();
  }
  function emit(point,now){
    var distance=lastPoint?Math.hypot(point.x-lastPoint.x,point.y-lastPoint.y):12;
    if(distance<7||now-lastEmit<26)return;
    var count=Math.min(4,Math.max(1,Math.ceil(distance/20)));
    for(var i=0;i<count;i++){
      var t=(i+1)/count,x=lastPoint?lastPoint.x+(point.x-lastPoint.x)*t:point.x,y=lastPoint?lastPoint.y+(point.y-lastPoint.y)*t:point.y;
      particles.push({x:x+(Math.random()-.5)*16,y:y+(Math.random()-.5)*20,born:now,life:500+Math.random()*250,char:String(Math.floor(Math.random()*10)),size:9+Math.random()*3,vx:(Math.random()-.5)*14,vy:-10-Math.random()*15});
    }
    if(particles.length>72)particles.splice(0,particles.length-72);
    lastPoint={x:point.x,y:point.y};lastEmit=now;
  }
  function draw(now){
    frame=0;if(!canTrail()){clear();return;}
    // Cap the decorative drawing rate; input and scrolling use the browser's normal rate.
    if(now-lastDraw<28){frame=requestAnimationFrame(draw);return;}lastDraw=now;
    if(pending){emit(pending,now);pending=null;}
    ctx.clearRect(0,0,width,height);framesDrawn++;
    particles=particles.filter(function(p){return now-p.born<p.life;});
    particles.forEach(function(p){
      var age=(now-p.born)/p.life,fade=Math.pow(1-age,1.7),x=p.x+p.vx*age,y=p.y+p.vy*age;
      ctx.fillStyle="rgba("+rgb+","+(fade*.65)+")";ctx.font=p.size+"px ui-monospace,Consolas,monospace";
      ctx.fillText(p.char,x,y);
      ctx.beginPath();ctx.arc(x-5,y-8,1.3*fade,0,Math.PI*2);ctx.fillStyle="rgba("+rgb+","+(fade*.22)+")";ctx.fill();
    });
    if(particles.length||pending)frame=requestAnimationFrame(draw);
    else{lastPoint=null;lastDraw=0;}
  }
  document.addEventListener("pointermove",function(event){
    if(event.pointerType!=="mouse"||!canTrail())return;
    // Keep the most recent event only; the renderer owns emission and its fixed budget.
    pending={x:event.clientX,y:event.clientY};
    var button=event.target.closest(".btn");
    if(button){var rect=button.getBoundingClientRect();button.style.setProperty("--glass-x",(event.clientX-rect.left)+"px");button.style.setProperty("--glass-y",(event.clientY-rect.top)+"px");}
    if(!frame)frame=requestAnimationFrame(draw);
  },{passive:true});
  document.addEventListener("pointerdown",function(event){
    if(!active()||document.hidden)return;
    var button=event.target.closest(".btn,.starter,.motion-toggle");if(!button||button.disabled)return;
    if(rippleTimers.size>=8){var oldest=rippleTimers.keys().next().value;clearTimeout(rippleTimers.get(oldest));oldest.remove();rippleTimers.delete(oldest);}
    var rect=button.getBoundingClientRect(),node=document.createElement("span");node.className="control-ripple";node.setAttribute("aria-hidden","true");
    node.style.left=(event.clientX-rect.left)+"px";node.style.top=(event.clientY-rect.top)+"px";button.appendChild(node);
    rippleTimers.set(node,setTimeout(function(){node.remove();rippleTimers.delete(node);},520));
  },{passive:true});
  toggle.addEventListener("click",function(){enabled=!enabled;writeStorage(key,enabled?"on":"off");sync();});
  reduced.addEventListener("change",sync);fine.addEventListener("change",sync);forced.addEventListener("change",sync);
  themeMedia.addEventListener("change",sync);
  window.addEventListener("resize",resize,{passive:true});
  window.addEventListener("blur",clear);
  document.addEventListener("pointerleave",clear);
  document.addEventListener("visibilitychange",function(){root.dataset.pageHidden=String(document.hidden);sync();});
  window.addEventListener("pagehide",function(){clear();cleanupRipples();});
  window.addEventListener("pageshow",sync);

  // Watch only existing presentation attributes, never task input or report content.
  new MutationObserver(function(changes){
    if(changes.some(function(change){return change.attributeName==="data-theme"||change.attributeName==="data-accent";})){
      rgb=getComputedStyle(root).getPropertyValue("--accent-rgb").trim()||"91,114,222";positionIndicator();
    }
  }).observe(root,{attributes:true,attributeFilter:["data-theme","data-accent"]});
  new MutationObserver(positionIndicator).observe(switcher,{attributes:true,subtree:true,attributeFilter:["aria-pressed"]});
  if(typeof ResizeObserver!=="undefined")new ResizeObserver(positionIndicator).observe(switcher);
  document.querySelectorAll("main section.card").forEach(function(panel){
    new MutationObserver(function(changes){
      if(!active()||getComputedStyle(panel).display==="none")return;
      if(changes.some(function(change){return change.attributeName==="hidden"||change.attributeName==="style";})){
        panel.classList.remove("motion-enter");void panel.offsetWidth;panel.classList.add("motion-enter");
      }
    }).observe(panel,{attributes:true,attributeFilter:["style","hidden"]});
    panel.addEventListener("animationend",function(event){if(event.target===panel)panel.classList.remove("motion-enter");});
  });
  window.CourseEffects=Object.freeze({status:function(){return{enabled:active(),trailEnabled:canTrail(),particles:particles.length,scheduled:!!frame,framesDrawn:framesDrawn,ripples:rippleTimers.size,maxParticles:72};}});
  resize();sync();
})();
