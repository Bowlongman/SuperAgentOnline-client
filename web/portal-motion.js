const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const hero=document.querySelector('.hero');
let framePending=false;
let observer;
let storyNarrative;

function updateScroll(){
 framePending=false;
 document.documentElement.classList.toggle('has-scrolled',scrollY>30);
 if(reducedMotion.matches)return;
 updateStoryNarrative();
 if(hero&&!hero.closest('[hidden]')){
  const box=hero.getBoundingClientRect();
  if(box.bottom>0&&box.top<innerHeight)hero.style.setProperty('--hero-shift',Math.min(70,Math.max(0,-box.top*.12))+'px');
 }

}
function scheduleScroll(){
 if(framePending)return;
 framePending=true;requestAnimationFrame(updateScroll);
}
function configureMotion(){
 observer?.disconnect();
 document.documentElement.classList.remove('motion-ready');
 configureStoryNarrative();
 if(reducedMotion.matches||!('IntersectionObserver' in window)){
  hero?.style.removeProperty('--hero-shift');return;
 }
 observer=new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting){
   entry.target.classList.add('is-visible');observer.unobserve(entry.target);
  }
 },{threshold:.08,rootMargin:'0px 0px 30px 0px'});
 for(const element of document.querySelectorAll('[data-reveal]'))observer.observe(element);
 document.documentElement.classList.add('motion-ready');scheduleScroll();
}
document.querySelector('.skip-link')?.addEventListener('click',event=>{
 event.preventDefault();
 document.querySelector('#main-content')?.focus({preventScroll:true});
 window.scrollTo({top:0,behavior:'instant'});
});
document.querySelector('[data-character-link]')?.addEventListener('click',event=>{
 event.preventDefault();
 const character=document.querySelector('#xingling');
 character?.classList.add('is-visible');
 character?.focus({preventScroll:true});
 character?.scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth',block:'start'});
});
document.addEventListener('focusin',event=>event.target.closest('[data-reveal]')?.classList.add('is-visible'));
window.addEventListener('scroll',scheduleScroll,{passive:true});
window.addEventListener('resize',scheduleScroll,{passive:true});
window.addEventListener('hashchange',scheduleScroll);
reducedMotion.addEventListener('change',configureMotion);
configureMotion();scheduleScroll();

function configureStoryNarrative(){
 const wrapper=document.querySelector('#story-sequence');
 storyNarrative?.stage.remove();storyNarrative=null;
 if(!wrapper)return;
 wrapper.classList.remove('is-enhanced');
 const scenes=[...wrapper.querySelectorAll('.story-scene')];
 for(const scene of scenes){scene.classList.remove('is-current');scene.classList.add('is-visible')}
 if(reducedMotion.matches||scenes.length!==3)return;
 const stage=document.createElement('div');stage.className='story-stage';
 const heading=document.createElement('div');heading.className='story-stage-heading';
 const label=document.createElement('span');label.textContent='WORLD STORIES';
 const counter=document.createElement('span');heading.append(label,counter);
 const visuals=document.createElement('div');visuals.className='story-stage-images';visuals.setAttribute('aria-hidden','true');
 const frames=scenes.map((scene,index)=>{
  const frame=document.createElement('div');frame.className='story-stage-frame';frame.dataset.storyIndex=index;
  const picture=scene.querySelector('.story-visual picture').cloneNode(true);
  picture.querySelector('img').alt='';frame.append(picture);visuals.append(frame);return frame;
 });
 const caption=document.createElement('p');caption.className='story-stage-caption';caption.setAttribute('aria-hidden','true');
 const progress=document.createElement('nav');progress.className='story-progress';progress.setAttribute('aria-label','故事章节');
 const labels=['雨后相遇','共同创作','天台探索'];
 const buttons=scenes.map((scene,index)=>{
  const button=document.createElement('button');button.type='button';button.className='story-progress-step';button.dataset.storyIndex=index;
  button.setAttribute('aria-label','滚动到第'+(index+1)+'章，'+labels[index]);
  const title=document.createElement('span');title.textContent=String(index+1).padStart(2,'0')+' / '+labels[index];
  const track=document.createElement('span');track.className='story-progress-track';track.setAttribute('aria-hidden','true');
  const fill=document.createElement('span');track.append(fill);button.append(title,track);
  button.onclick=()=>scene.scrollIntoView({behavior:'smooth',block:innerWidth>=900?'center':'start'});
  button.onkeydown=event=>{
   const keys={ArrowLeft:Math.max(0,index-1),ArrowRight:Math.min(2,index+1),Home:0,End:2};
   if(keys[event.key]===undefined)return;
   event.preventDefault();buttons[keys[event.key]].focus();buttons[keys[event.key]].click();
  };
  progress.append(button);return button;
 });
 stage.append(heading,visuals,caption,progress);wrapper.prepend(stage);wrapper.classList.add('is-enhanced');
 storyNarrative={wrapper,scenes,stage,frames,buttons,counter,caption,current:-1};
 updateStoryNarrative();
}
function updateStoryNarrative(){
 const story=storyNarrative;
 if(!story||story.wrapper.closest('[hidden]'))return;
 const bounds=story.wrapper.getBoundingClientRect();
 if(bounds.bottom<0||bounds.top>innerHeight)return;
 const anchor=innerHeight*.52,rects=story.scenes.map(scene=>scene.getBoundingClientRect());
 let current=0,distance=Infinity;
 rects.forEach((rect,index)=>{
  const candidate=Math.abs(rect.top+rect.height*.5-anchor);
  if(candidate<distance){current=index;distance=candidate}
 });
 story.buttons.forEach((button,index)=>{
  const rect=rects[index],progress=Math.max(0,Math.min(1,(anchor-rect.top)/Math.max(1,rect.height)));
  button.style.setProperty('--chapter-progress',String(index<current?1:index>current?0:progress));
 });
 if(current===story.current)return;
 story.current=current;
 story.scenes.forEach((scene,index)=>scene.classList.toggle('is-current',index===current));
 story.frames.forEach((frame,index)=>frame.classList.toggle('is-current',index===current));
 story.buttons.forEach((button,index)=>{
  if(index===current)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
 });
 story.counter.textContent=String(current+1).padStart(2,'0')+' / 03';
 story.caption.textContent=story.scenes[current].querySelector('figcaption').textContent;
}
