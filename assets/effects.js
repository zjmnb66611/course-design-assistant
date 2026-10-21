/* Presentation only. Pointer positions remain transient and are never persisted. */
(function(){
  "use strict";
  var root=document.documentElement,canvas=document.getElementById("cursorTrail");
  var ctx=canvas.getContext("2d"),toggle=document.getElementById("motionToggle"),label=document.getElementById("motionLabel");
  var reduced=matchMedia("(prefers-reduced-motion: reduce)"),fine=matchMedia("(any-pointer: fine)"),forced=matchMedia("(forced-colors: active)");
  var key="course-assistant.effects.v1",enabled=readStorage(key)!=="off",frame=0,particles=[],pending=null;
  var lastPoint=null,lastEmit=0,framesDrawn=0,width=0,height=0,left=0,top=0,suppressedUntil=0,rgb="91,114,222";
  var sprite=document.createElement("canvas"),spriteCtx=sprite.getContext("2d"),rippleTimers=new Map(),indicatorFrame=0;
  var panelAnimation=null,indicator=document.createElement("span"),switcher=document.querySelector(".theme-switch");
  indicator.className="theme-indicator";indicator.setAttribute("aria-hidden","true");switcher.prepend(indicator);

  function active(){return enabled&&!reduced.matches&&!forced.matches;}
  function canTrail(){return active()&&fine.matches&&!!ctx&&!!spriteCtx&&!document.hidden&&root.dataset.appReady==="true"&&!root.hasAttribute("data-busy");}
  function clear(){
    if(frame)cancelAnimationFrame(frame);frame=0;pending=null;lastPoint=null;particles.length=0;lastEmit=0;
    if(ctx)ctx.clearRect(0,0,width,height);
  }
  function cleanupRipples(){rippleTimers.forEach(function(timer,node){clearTimeout(timer);node.remove();});rippleTimers.clear();}
  function positionIndicator(){
    if(indicatorFrame)return;
    indicatorFrame=requestAnimationFrame(function(){
      indicatorFrame=0;var selected=switcher.querySelector('[aria-pressed="true"]');if(!selected)return;
      var size=selected.offsetWidth,x=selected.offsetLeft;
      indicator.style.width=size+"px";indicator.style.transform="translateX("+x+"px)";
    });
  }
  function prepareSprites(){
    rgb=getComputedStyle(root).getPropertyValue("--accent-rgb").trim()||"91,114,222";
    if(!spriteCtx)return;sprite.width=160;sprite.height=20;
    spriteCtx.font="11px ui-monospace,Consolas,monospace";spriteCtx.fillStyle="rgb("+rgb+")";
    for(var i=0;i<10;i++)spriteCtx.fillText(String(i),i*16+4,14);
  }
  function sync(){
    root.dataset.motion=active()?"on":"off";toggle.setAttribute("aria-pressed",String(active()));toggle.disabled=reduced.matches||forced.matches;
    label.textContent=reduced.matches?"已减少动态":forced.matches?"静态显示":"动态效果";
    toggle.title=reduced.matches?"已遵循系统的减少动态效果设置":forced.matches?"已遵循系统的高对比度设置":"开启或关闭交互动画与数码光迹";
    canvas.hidden=!canTrail();clear();cleanupRipples();prepareSprites();positionIndicator();
    if(!active()&&panelAnimation){panelAnimation.cancel();panelAnimation=null;}
  }
  function resize(){
    clear();width=Math.min(innerWidth,480);height=Math.min(innerHeight,280);
    canvas.width=width;canvas.height=height;canvas.style.width=width+"px";canvas.style.height=height+"px";
    positionIndicator();
  }
  function emit(point,now){
    var distance=lastPoint?Math.hypot(point.x-lastPoint.x,point.y-lastPoint.y):12;
    if(distance<7||now-lastEmit<30)return;
    var count=Math.min(2,Math.max(1,Math.ceil(distance/25)));
    for(var i=0;i<count;i++){
      var t=(i+1)/count;
      particles.push({x:(lastPoint?lastPoint.x+(point.x-lastPoint.x)*t:point.x)+(Math.random()-.5)*12,y:(lastPoint?lastPoint.y+(point.y-lastPoint.y)*t:point.y)+(Math.random()-.5)*16,born:now,life:420+Math.random()*180,glyph:Math.floor(Math.random()*10),vy:-8-Math.random()*12});
    }
    if(particles.length>32)particles.splice(0,particles.length-32);
    lastPoint={x:point.x,y:point.y};lastEmit=now;
  }
  function draw(now){
    frame=0;if(!canTrail()||now<suppressedUntil){clear();return;}
    if(pending){
      left=Math.max(0,Math.min(innerWidth-width,pending.x-width/2));top=Math.max(0,Math.min(innerHeight-height,pending.y-height/2));
      canvas.style.transform="translate3d("+Math.round(left)+"px,"+Math.round(top)+"px,0)";
      emit(pending,now);pending=null;
    }
    ctx.clearRect(0,0,width,height);framesDrawn++;
    var kept=0;
    for(var i=0;i<particles.length;i++){
      var p=particles[i],age=(now-p.born)/p.life,x=p.x-left,y=p.y-top+p.vy*age;
      if(age>=1||x<-16||x>width||y<-20||y>height)continue;
      particles[kept++]=p;ctx.globalAlpha=(1-age)*(1-age)*.7;
      ctx.drawImage(sprite,p.glyph*16,0,16,20,x-4,y-14,16,20);
    }
    particles.length=kept;ctx.globalAlpha=1;
    if(kept||pending)frame=requestAnimationFrame(draw);else lastPoint=null;
  }
  document.addEventListener("pointermove",function(event){
    if(event.pointerType!=="mouse"||!canTrail()||performance.now()<suppressedUntil)return;
    pending={x:event.clientX,y:event.clientY};if(!frame)frame=requestAnimationFrame(draw);
  },{passive:true});
  window.addEventListener("scroll",function(){suppressedUntil=performance.now()+120;if(frame||particles.length)clear();},{passive:true,capture:true});
  document.addEventListener("pointerdown",function(event){
    if(!active()||document.hidden)return;
    var button=event.target.closest(".btn,.starter,.motion-toggle");if(!button||button.disabled)return;
    if(rippleTimers.size>=4)return;
    var rect=button.getBoundingClientRect(),node=document.createElement("span");node.className="control-ripple";node.setAttribute("aria-hidden","true");
    node.style.left=(event.clientX-rect.left)+"px";node.style.top=(event.clientY-rect.top)+"px";button.appendChild(node);
    rippleTimers.set(node,setTimeout(function(){node.remove();rippleTimers.delete(node);},360));
  },{passive:true});
  toggle.addEventListener("click",function(){enabled=!enabled;writeStorage(key,enabled?"on":"off");sync();});
  reduced.addEventListener("change",sync);fine.addEventListener("change",sync);forced.addEventListener("change",sync);
  themeMedia.addEventListener("change",sync);window.addEventListener("resize",resize,{passive:true});window.addEventListener("blur",clear);
  document.addEventListener("pointerleave",clear);document.addEventListener("visibilitychange",function(){root.dataset.pageHidden=String(document.hidden);sync();});
  window.addEventListener("pagehide",function(){clear();cleanupRipples();});window.addEventListener("pageshow",sync);
  new MutationObserver(function(changes){
    if(changes.some(function(c){return c.attributeName==="data-theme"||c.attributeName==="data-accent";})){prepareSprites();positionIndicator();}
    if(root.hasAttribute("data-busy"))clear();
  }).observe(root,{attributes:true,attributeFilter:["data-theme","data-accent","data-busy"]});
  new MutationObserver(positionIndicator).observe(switcher,{attributes:true,subtree:true,attributeFilter:["aria-pressed"]});
  if(typeof ResizeObserver!=="undefined")new ResizeObserver(positionIndicator).observe(switcher);
  window.CourseEffects=Object.freeze({
    enter:function(panel){
      if(panelAnimation)panelAnimation.cancel();
      if(!active()||!panel.animate)return;
      panelAnimation=panel.animate([{opacity:.65,transform:"translateY(5px)"},{opacity:1,transform:"none"}],{duration:180,easing:"cubic-bezier(.2,.8,.2,1)"});
    },
    status:function(){return{enabled:active(),trailEnabled:canTrail(),particles:particles.length,scheduled:!!frame,framesDrawn:framesDrawn,ripples:rippleTimers.size,maxParticles:32,canvasPixels:canvas.width*canvas.height};}
  });
  resize();sync();
})();
