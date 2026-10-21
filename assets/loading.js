/* Real startup / task feedback. No artificial minimum duration or fake percentage. */
(function(){
  "use strict";
  var root=document.documentElement,boot=document.getElementById("bootLoader"),toast=document.getElementById("taskLoader");
  var shell=document.querySelector(".app-shell"),startup=true,busy=false,failed=false;
  function fail(text){failed=true;clearTimeout(watchdog);boot.classList.add("load-failed");document.getElementById("bootLabel").textContent=text;}
  var watchdog=setTimeout(function(){if(startup)fail("页面准备时间较长，请检查网络后刷新重试。");},8000);
  function ready(){
    if(typeof calc!=="function"||typeof showStep!=="function"||typeof applyAppearance!=="function"){
      fail("部分页面资源未能加载，请检查网络后刷新重试。");return;
    }
    startup=false;failed=false;boot.classList.remove("load-failed");clearTimeout(watchdog);root.dataset.appReady="true";
    // Let the ready workspace receive its first paint, then release the cover.
    requestAnimationFrame(function(){requestAnimationFrame(function(){boot.hidden=true;shell.inert=false;});});
  }
  async function run(text,button,task){
    if(busy)return false;
    busy=true;root.setAttribute("data-busy","");shell.inert=true;
    var wasDisabled=button?button.disabled:false;
    if(button){button.disabled=true;button.setAttribute("aria-busy","true");button.classList.add("is-loading");}
    document.getElementById("taskLoadingLabel").textContent=text;toast.hidden=false;shell.setAttribute("aria-busy","true");
    try{
      // Two animation frames and a new task allow the loading state to paint first.
      await new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(function(){setTimeout(resolve,0);});});});
      await task();return true;
    }catch(error){
      if(typeof notify==="function")notify("err","本次操作未完成，请检查输入后重试。"+(error&&error.message?"（"+error.message+"）":""));
      return false;
    }finally{
      busy=false;root.removeAttribute("data-busy");shell.inert=false;shell.removeAttribute("aria-busy");toast.hidden=true;
      if(button){button.disabled=wasDisabled;button.removeAttribute("aria-busy");button.classList.remove("is-loading");}
    }
  }
  window.CourseLoading=Object.freeze({ready:ready,run:run,status:function(){return{startup:startup,busy:busy,failed:failed};}});
})();
