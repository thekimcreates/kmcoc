/* KMC Gugak — original drum-color animation, homepage edition. */
(function () {
"use strict";
// Source color layers inside the drum; shared by browser and video renderer.
function createLogoMotion(ctx, logo, makeCanvas) {
  const W=1280,H=480,TAU=Math.PI*2;
  const clamp=x=>Math.max(0,Math.min(1,x));
  const phase=(t,a,b)=>clamp((t-a)/(b-a));
  const smooth=x=>x*x*x*(x*(x*6-15)+10);
  const out=x=>1-Math.pow(1-x,4);
  const mix=(a,b,p)=>a+(b-a)*p;
  const source=makeCanvas(386,391),sc=source.getContext('2d');
  sc.drawImage(logo,0,0);
  const pixels=sc.getImageData(0,0,386,391);
  const palette=[[237,27,65],[1,58,101],[255,217,102],[255,255,255],[118,28,42]];
  const layers=[0,1,2].map(()=>makeCanvas(386,391));
  const layerData=layers.map(c=>c.getContext('2d').createImageData(386,391));
  for(let y=79;y<330;y++)for(let x=131;x<342;x++){
    const i=(y*386+x)*4,r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2];
    let winner=-1,best=Infinity;
    for(let k=0;k<palette.length;k++){
      const p=palette[k],d=(r-p[0])**2+(g-p[1])**2+(b-p[2])**2;
      if(d<best){best=d;winner=k;}
    }
    if(winner<3){for(let c=0;c<4;c++)layerData[winner].data[i+c]=pixels.data[i+c];}
  }
  // Keep each main connected shape; omit isolated compression specks and rim fragments.
  for(const data of layerData){
    const visited=new Uint8Array(386*391);let largest=[];
    for(let pos=0;pos<visited.length;pos++){
      if(visited[pos]||!data.data[pos*4+3])continue;
      const component=[pos];visited[pos]=1;
      for(let head=0;head<component.length;head++){
        const at=component[head],x=at%386,y=Math.floor(at/386);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          const nx=x+dx,ny=y+dy,n=ny*386+nx;
          if(nx<0||nx>=386||ny<0||ny>=391||visited[n]||!data.data[n*4+3])continue;
          visited[n]=1;component.push(n);
        }
      }
      if(component.length>largest.length)largest=component;
    }
    const keep=new Uint8Array(386*391);for(const p of largest)keep[p]=1;
    for(let p=0;p<keep.length;p++)if(!keep[p])data.data[p*4+3]=0;
  }
  layers.forEach((c,i)=>c.getContext('2d').putImageData(layerData[i],0,0));
  return function render(t){
    ctx.clearRect(0,0,W,H);
    ctx.save();ctx.translate(-160,-210);
    const move=smooth(phase(t,3.35,4.75));
    const cx=mix(800,430,move),cy=450,s=1.12;
    ctx.save();ctx.translate(cx-193*s,cy-195.5*s);ctx.scale(s,s);
    const body=smooth(phase(t,2.35,3.45));
    if(body>0){
      ctx.save();ctx.globalAlpha=body;
      ctx.beginPath();ctx.arc(193,195.5,192,0,TAU);ctx.clip();
      ctx.drawImage(logo,0,0,386,391,0,0,386,391);ctx.restore();
    }
    if(t<3.45){
      ctx.save();ctx.beginPath();ctx.ellipse(236,205,103,125,-.02,0,TAU);ctx.clip();
      function shape(index,start,finish,turns,offset){
        const p=phase(t,start,finish);if(!p)return;
        const settle=out(p),angle=-TAU*turns*(1-settle);
        const opacity=smooth(phase(t,start,start+.5));
        const scale=mix(.58,1,out(phase(t,start,start+1.0)));
        ctx.save();ctx.globalAlpha=opacity;
        ctx.translate(236,205);ctx.rotate(angle);
        ctx.translate(offset*(1-settle),0);ctx.scale(scale,scale);
        ctx.drawImage(layers[index],-236,-205);ctx.restore();
      }
      shape(2,.95,2.65,.62,0);
      shape(1,.18,2.7,1.08,-35);
      shape(0,.34,2.78,1.18,35);
      ctx.restore();
    }
    ctx.restore();
    const originX=430-193*s,originY=450-195.5*s;
    function titleLine(start,end,sy,sh){
      const p=out(phase(t,start,end));if(!p)return;
      ctx.save();ctx.beginPath();ctx.rect(originX+440*s,originY-10,900,460);ctx.clip();
      ctx.globalAlpha=smooth(phase(t,start,start+.5));
      ctx.drawImage(logo,445,sy,599,sh,originX+445*s+190*(1-p),originY+sy*s,599*s,sh*s);
      ctx.restore();
    }
    titleLine(3.9,5.15,0,242);titleLine(4.14,5.43,242,149);
    ctx.restore();
  };
}

    const canvas = document.getElementById('home-logo-canvas');
    const logo = document.getElementById('home-logo-fallback');
    if (!canvas || !logo) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (preference.matches) return;

    const DURATION = 5.45;
    let render = null;
    let frameId = 0;
    let elapsed = 0;
    let previousTime = null;
    let inView = true;
    let observer = null;
    let finished = false;

    function pause() {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
        previousTime = null;
    }

    function detach() {
        pause();
        observer?.disconnect();
        document.removeEventListener('visibilitychange', syncPlayback);
        preference.removeEventListener('change', onMotionPreference);
    }

    function finish() {
        render(DURATION);
        finished = true;
        detach();
        render = null;
    }

    function tick(now) {
        frameId = 0;
        if (finished || document.hidden || !inView) { previousTime = null; return; }
        if (previousTime !== null) elapsed += Math.max(0, now - previousTime) / 1000;
        previousTime = now;
        if (elapsed >= DURATION) { finish(); return; }
        render(elapsed);
        frameId = window.requestAnimationFrame(tick);
    }

    function syncPlayback() {
        if (finished || !render) return;
        if (document.hidden || !inView) pause();
        else if (!frameId) frameId = window.requestAnimationFrame(tick);
    }

    function onMotionPreference() {
        if (preference.matches && render) finish();
    }

    function initialize() {
        if (!logo.naturalWidth || preference.matches) return;
        try {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            render = createLogoMotion(ctx, logo, (width, height) => {
                const layer = document.createElement('canvas');
                layer.width = width;
                layer.height = height;
                return layer;
            });
            render(0);
            canvas.hidden = false;
            logo.hidden = true;
            const bounds = canvas.getBoundingClientRect();
            inView = bounds.bottom > 0 && bounds.top < window.innerHeight;
            if ('IntersectionObserver' in window) {
                observer = new IntersectionObserver(entries => {
                    inView = entries[0].isIntersecting;
                    syncPlayback();
                });
                observer.observe(canvas);
            }
            document.addEventListener('visibilitychange', syncPlayback);
            preference.addEventListener('change', onMotionPreference);
            syncPlayback();
        } catch (error) {
            // Preserve the static logo if canvas or pixel access is unavailable.
            detach();
            canvas.hidden = true;
            logo.hidden = false;
            render = null;
            console.warn('Homepage logo animation unavailable:', error);
        }
    }

    if (logo.complete) initialize();
    else logo.addEventListener('load', initialize, { once: true });
})();
