'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null,csrf='',activeCourse='',scheduleCourse='all',schedulePeriod='upcoming',offset=0,toastTimer,recoveryPending=false;
const creatures=[['Глаз да практика','hero'],['Тихий наблюдатель','observer'],['Рыба вне шаблона','fish'],['Не открывать до озарения','bottle'],['Совет неочевидных','owl']];
const now=()=>Date.now()+offset;
const fmt=(t,o={})=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Yekaterinburg',...o}).format(Number(t));
const date=t=>fmt(t,{day:'numeric',month:'long'}),time=t=>fmt(t,{hour:'2-digit',minute:'2-digit'});
const dt=t=>new Date(Number(t)+18000000).toISOString().slice(0,16);
const parseDate=s=>Date.parse(s+':00+05:00');
const isAdmin=()=>state?.profile.role==='admin';
const course=id=>state.courses.find(c=>c.id===id);
const lessons=id=>state.lessons.filter(l=>l.course===id).sort((a,b)=>a.start-b.start);
function image(l){return /^(?:[a-f0-9]{20}|[a-f0-9]{32})\.(png|jpg|webp)$/.test(l.image)?'uploads/'+l.image:'assets/'+(['hero','fish','observer','bottle','owl'].includes(l.image)?l.image:'hero')+'.webp';}
function safeUrl(s){try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),6000);}
async function api(action,data){
 const r=await fetch('api.php?action='+encodeURIComponent(action),{credentials:'same-origin',cache:'no-store',...(data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(data)})});
 let result;try{result=await r.json();}catch{throw new Error('Сервер вернул неожиданный ответ — проверьте установку приложения');}
 if(!r.ok){if(r.status===401)showLogin();throw new Error(result.error||'Не удалось выполнить действие');}if(result.csrf)csrf=result.csrf;return result;
}
function form(id,handler){const el=$(id);if(!el)return;el.onsubmit=async e=>{e.preventDefault();const button=$('button[type=submit],button:not([type])',el);if(button)button.disabled=true;try{await handler(Object.fromEntries(new FormData(el)),el);}catch(err){toast(err.message);}finally{if(button)button.disabled=false;}};}
async function refresh(){state=await api('state');offset=state.server_time-Date.now();if(!course(activeCourse))activeCourse=state.courses[0]?.id||'';render();}
function modal(title,content){$('#modal-title').textContent=title;$('#modal-content').innerHTML=content;if(!$('#modal').open)$('#modal').showModal();}
function closeModal(){if(recoveryPending)return;$('#modal').close();}
$('#close-modal').onclick=closeModal;
$('#modal').addEventListener('cancel',e=>{if(recoveryPending)e.preventDefault();});
$('#modal').onclick=e=>{if(!recoveryPending&&e.target===$('#modal')){const b=e.target.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)closeModal();}};
function showLogin(){state=null;$('#workspace').hidden=true;$('.sidebar').classList.add('auth-sidebar');$('#login-screen').hidden=false;if($('#modal').open&&!recoveryPending)closeModal();renderLogin('login');}
const studentNote=$('.attendance-note').innerHTML;
function render(){
 $('#workspace').hidden=false;$('.sidebar').classList.remove('auth-sidebar');$('#login-screen').hidden=true;
 $('#organizer').hidden=$('#admin-nav').hidden=!isAdmin();
 $('nav a[href="#courses"] span').textContent=isAdmin()?'Курсы':'Мои курсы';
 $('nav a[href="#collection"]').hidden=$('#collection').hidden=isAdmin();
 $('#courses .section-heading h2').firstChild.textContent=isAdmin()?'Курсы ':'Мои курсы ';
 $('.side-label').textContent=isAdmin()?'КАБИНЕТ ОРГАНИЗАТОРА':'ВАШ КАБИНЕТ';
 $('.profile small').textContent=isAdmin()?'Организатор · изменить':'Участник · изменить';
 $('#join-button').textContent=isAdmin()?'＋ Создать курс':'＋ Добавить курс';
 $('#nearest-lesson').innerHTML=isAdmin()?'Управлять курсами <span>→</span>':'К ближайшему занятию <span>→</span>';
 $('.stats').setAttribute('aria-label',isAdmin()?'Сводка организатора':'Ваш прогресс');
 const labels=$$('.stats>div>span:last-child');
 labels[0].textContent=isAdmin()?'курсов':'курса в работе';
 labels[1].textContent=isAdmin()?'участников':'занятий посещено';
 labels[2].textContent=isAdmin()?'занятий':'персонажей в коллекции';
 $('.attendance-note').innerHTML=isAdmin()?'<span class="eyebrow">ДЛЯ ОРГАНИЗАТОРА</span><h3>Расписание<br>под контролем</h3><p>Создавайте занятия, назначайте преподавателей и следите за работой группы</p><div class="note-bottom"><span>Все ответы — в кабинете организатора</span><img src="assets/observer.webp" alt="Наблюдатель"></div>':studentNote;

 $('#profile-name').textContent=state.profile.name;$('.avatar').textContent=state.profile.name.split(/\s+/).map(x=>x[0]).slice(0,2).join('');
 $('#stat-courses').textContent=$('#course-count').textContent=state.courses.length;$('#heading-count').textContent=String(state.courses.length).padStart(2,'0');
 $('#stat-attendance').textContent=Object.keys(state.attendance).filter(id=>state.lessons.some(l=>l.id===id&&!l.cancelled)).length;$('#stat-rewards').textContent=state.awards.length;
 if(isAdmin()){
  $('#stat-attendance').textContent=new Set(state.students.map(s=>String(s.id))).size;
  $('#stat-rewards').textContent=state.lessons.filter(l=>!l.cancelled).length;
 }
 $('#course-grid').innerHTML=state.courses.map((c,i)=>{
  const ls=lessons(c.id).filter(l=>!l.cancelled),n=ls.filter(l=>state.attendance[l.id]).length,next=ls.find(l=>l.end>now());
  const participants=isAdmin()?state.students.filter(s=>s.course_id===c.id).length:0;
  const custom=/^(?:[a-f0-9]{20}|[a-f0-9]{32})\.(png|jpg|webp)$/.test(c.image);
  return `<article class="course-card"><div class="course-visual ${i%2?'sand':''} ${custom?'has-custom-image':''}"><span class="course-tag">${isAdmin()?'ВЫ ОРГАНИЗАТОР':'ВАШ КУРС'} · БРИДЖ</span><div class="course-number">${String(i+1).padStart(2,'0')}</div><img src="${image(c)}" alt="Картинка курса ${esc(c.title)}"></div><div class="course-body"><h3>${esc(c.title)}</h3><p>${esc(c.description)}</p>${isAdmin()?`<div class="course-summary"><span>${ls.length} занятий</span><span>${participants} участников</span></div><button class="text-button" data-edit-course="${c.id}">Изменить курс и картинку</button>`:`<div class="progress-line"><span style="width:${ls.length?n/ls.length*100:0}%"></span></div><div class="progress-caption"><span>Ваше участие</span><span>${n} из ${ls.length} занятий</span></div>`}<div class="course-footer"><span>${next?'Ближайшее: '+date(next.start):'До '+date(c.end)}</span><button data-course="${esc(c.id)}">К занятиям →</button></div></div></article>`;
 }).join('')||`<div class="empty">${isAdmin()?'Создайте первый курс кнопкой выше':'Добавьте курс по коду, который выдал организатор'}</div>`;
 if(scheduleCourse!=='all'&&!course(scheduleCourse))scheduleCourse='all';
 $('#course-filter').innerHTML='<option value="all">Все курсы</option>'+state.courses.map(c=>`<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('');$('#course-filter').value=scheduleCourse;$('#schedule-period').value=schedulePeriod;
 schedule();collection();notifications();if(isAdmin())adminPanel();if(typeof renderManagement==='function')renderManagement();
}
function schedule(){
 const ls=state.lessons.filter(l=>(scheduleCourse==='all'||l.course===scheduleCourse)&&(schedulePeriod==='all'||(schedulePeriod==='upcoming'?l.end>now():l.end<=now()))).sort((a,b)=>a.start-b.start||a.title.localeCompare(b.title,'ru'));
 let lastDay='';
 $('#lesson-list').innerHTML=ls.map(l=>{
  const a=state.attendance[l.id],live=!l.cancelled&&now()>=l.start&&now()<l.end;
  const day=fmt(l.start,{day:'numeric',month:'long',year:'numeric'});
  const heading=lastDay===day?'':`<h3 class="schedule-day">${esc(day)}</h3>`;lastDay=day;
  const totals=isAdmin()?state.attendance_metrics?.[l.course]?.lessons?.[l.id]:null;
  return heading+`<button class="lesson-row" data-lesson="${esc(l.id)}"><span class="date-box"><strong>${fmt(l.start,{day:'2-digit'})}</strong><span>${fmt(l.start,{month:'short'})}</span></span><span><span class="lesson-title">${esc(l.title)}</span><span class="lesson-course">${esc(course(l.course)?.title||'')}</span><span class="lesson-meta">${time(l.start)}–${time(l.end)} · ${esc(l.teacher)}${totals&&!l.cancelled?' · Отмечено: '+totals.present+' (онлайн '+totals.online+', очно '+totals.offline+')':''}</span></span><span class="lesson-state">${l.cancelled?'Отменено':!isAdmin()&&a?(a==='online'?'✓ Онлайн':'✓ Очно'):live?'Идёт сейчас':l.end<=now()?'Завершено':'Скоро'} →</span></button>`;
 }).join('')||'<div class="empty">Нет занятий для выбранного курса и периода</div>';
}
function goToSchedule(id){
 scheduleCourse=id;schedulePeriod='all';activeCourse=id;
 $('#course-filter').value=id;$('#schedule-period').value='all';schedule();if(isAdmin())adminPanel();
 history.replaceState(null,'','#schedule');window.dispatchEvent(new Event('hashchange'));
 const target=$('#schedule');target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 const title=$('h2',target);title.tabIndex=-1;title.focus({preventScroll:true});
 target.classList.remove('schedule-highlight');void target.offsetWidth;target.classList.add('schedule-highlight');
 setTimeout(()=>target.classList.remove('schedule-highlight'),2200);
}
function collection(){
 $('#collection-count').textContent=state.awards.length+' открыто';
 const list=state.awards.length?state.awards:[0,1,2,3].map(creature=>({creature,locked:true,label:'Ваш следующий спутник'}));
 $('#reward-grid').innerHTML=list.map(a=>{const cr=creatures[a.creature??0];return `<div class="reward-card ${a.locked?'locked':''}"><img src="${a.image?image(a):'assets/'+cr[1]+'.webp'}" alt="${a.locked?'Закрытый персонаж':esc(a.name||cr[0])}"><strong>${a.locked?'? Кто-то необычный':esc(a.name||cr[0])}</strong><small>${esc(a.label)}</small></div>`;}).join('');
}
function notifications(){const n=state.notifications;$('#unread-count').textContent=n.filter(x=>!Number(x.is_read)).length;$('#notification-list').innerHTML=n.map(x=>`<div class="notification ${Number(x.is_read)?'':'unread'}">${esc(x.body)} <button class="text-button" data-notification="${esc(x.lesson_id)}">Открыть →</button></div>`).join('')||'<div class="empty">Здесь появятся ответы организатора и результаты проверки заданий</div>';}
function feedbackBody(f){return [['takeaway','Что беру в работу'],['impression','Впечатление'],['question','Вопрос'],['liked','Что понравилось'],['wishes','Чего не хватило']].filter(([k])=>f[k]).map(([k,t])=>`<p class="review-body"><b>${t}</b><br>${esc(f[k])}</p>`).join('');}
function replies(f){return f.replies.map(r=>`<div class="reply"><b>${r.role==='admin'?'Организатор':esc(r.name)}</b><br>${esc(r.text)}</div>`).join('');}
function ownFeedback(id){return state.feedback.find(f=>f.lesson_id===id&&String(f.user_id)===String(state.profile.id));}
function conversation(f){return `${replies(f)}${isAdmin()||String(f.user_id)===String(state.profile.id)?`<form class="answer-form" data-reply="${esc(f.id)}"><input name="text" required maxlength="5000" placeholder="Продолжить разговор…" aria-label="Сообщение"><button class="button outline">Отправить</button></form>`:''}`;}
function openLesson(id){
 const l=state.lessons.find(l=>l.id===id);if(!l)return;if(isAdmin()){openOrganizerLesson(l);return;}const c=course(l.course),a=state.attendance[id],hw=state.homework[id],f=ownFeedback(id),live=!l.cancelled&&now()>=l.start&&now()<l.end,review=!l.cancelled&&now()>=l.end&&now()<l.end+172800000;
 modal(l.title,`<div class="lesson-banner"><div><span class="eyebrow">${esc(c.title)}</span><p><b>${date(l.start)}, ${time(l.start)}–${time(l.end)}</b> · Екатеринбург</p><p>${esc(l.teacher)}</p><p>${esc(l.address)}</p></div><img src="${image(l)}" alt="Картинка занятия"></div><p class="review-body">${esc(l.description)}</p>${l.cancelled?'<p class="notice">Занятие отменено — в серии не учитывается</p>':''}${safeUrl(l.url)?`<a class="button primary" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">Подключиться онлайн →</a>`:'<p class="form-hint">Ссылка подключения пока не добавлена</p>'}
 <section class="modal-section"><h3>Я на занятии</h3>${a?`<p class="notice success">✓ Отмечено: ${a==='online'?'онлайн':'очно'}</p>`:''}${live?`<form id="attendance-form"><fieldset><legend>Как вы участвуете?</legend><div class="choices"><label class="choice"><input type="radio" name="format" value="offline" required ${a==='offline'?'checked':''}>Я в аудитории</label><label class="choice"><input type="radio" name="format" value="online" required ${a==='online'?'checked':''}>Я онлайн</label></div></fieldset><button class="button primary">${a?'Изменить формат':'Подтвердить присутствие'}</button></form>`:`<p class="form-hint">${now()<l.start?'Отметка откроется с началом занятия':'Самостоятельная отметка сейчас недоступна'}</p>`}</section>
 <section class="modal-section"><h3>Что осталось с вами?</h3><p class="form-hint">Приём до ${date(l.end+172800000)}, ${time(l.end+172800000)} · Екатеринбург</p>${review?`<form id="feedback-form">${[['takeaway','Что беру в работу *'],['impression','Впечатление'],['question','Какой вопрос остался?'],['liked','Что понравилось'],['wishes','Чего не хватило / пожелания']].map(([k,t])=>`<label class="field">${t}<textarea name="${k}" ${k==='takeaway'?'required':''} maxlength="5000">${esc(f?.[k]||'')}</textarea></label>`).join('')}<fieldset><legend>КТО УВИДИТ ВАШ ОТЗЫВ?</legend><div class="choices"><label class="choice"><input type="radio" name="visibility" value="private" ${f?.visibility!=='public'?'checked':''}><span>🔒 Мне и организатору<small>Без публикации для группы</small></span></label><label class="choice"><input type="radio" name="visibility" value="public" ${f?.visibility==='public'?'checked':''}><span>👥 Опубликовать для курса<small>Все поля и ответы увидят участники этого курса</small></span></label></div></fieldset><button class="button primary">${f?'Сохранить изменения':'Отправить и открыть персонажа ✧'}</button></form>`:f?`<p class="notice">${f.visibility==='public'?'👥 Опубликовано для курса':'🔒 Только вам и организатору'}</p>${feedbackBody(f)}`:`<p class="notice">${now()<l.end?'Форма откроется после занятия':'Срок отправки отзыва закончился'}</p>`}${f?`<div class="modal-section"><h3>Разговор с организатором</h3>${conversation(f)}</div>`:''}</section>
 <section class="modal-section"><h3>Домашнее задание</h3>${l.homework?`<p class="review-body">${esc(l.homework)}</p><p class="form-hint">🔒 Личный ответ · до ${date(c.end)}, ${time(c.end)}</p>${hw?.done?`<p class="notice success">✓ Выполнено — редактирование закрыто</p><p class="review-body">${esc(hw.text)}</p>`:now()<c.end&&!l.cancelled?`<form id="homework-form"><label class="field">Ваш ответ<textarea name="answer" maxlength="15000" required>${esc(hw?.text||'')}</textarea></label><button class="button primary">${hw?'Сохранить изменения':'Отправить на проверку'}</button></form>`:`<p class="notice">Приём задания закрыт</p><p class="review-body">${esc(hw?.text||'')}</p>`}${hw?.comment?`<div class="reply"><b>Организатор</b><br>${esc(hw.comment)}</div>`:''}`:'<p class="form-hint">Задание пока не добавлено</p>'}</section>
 <section class="modal-section"><h3>Открытия группы</h3>${state.feedback.filter(x=>x.lesson_id===id&&x.visibility==='public'&&String(x.user_id)!==String(state.profile.id)).map(x=>`<article class="public-review"><b>${esc(x.name)}</b>${feedbackBody(x)}${replies(x)}</article>`).join('')||'<p class="form-hint">Здесь появятся отзывы, которыми участники захотят поделиться</p>'}</section>`);
 form('#attendance-form',async data=>{await api('attendance',{...data,lesson:id});await refresh();openLesson(id);toast('Присутствие сохранено');});
 form('#feedback-form',async data=>{if(!data.takeaway.trim())throw Error('Напишите, что берёте в работу');await api('feedback',{...data,lesson:id});await refresh();openLesson(id);toast(f?'Отзыв обновлён':'Открыт новый спутник — загляните в коллекцию ✧');});
 form('#homework-form',async data=>{await api('homework',{...data,lesson:id});await refresh();openLesson(id);toast('Ответ сохранён на сервере');});
}
function openOrganizerLesson(l){
 const group=state.students.filter(s=>s.course_id===l.course);
 const attendance=state.all_attendance.filter(a=>a.lesson_id===l.id&&group.some(s=>String(s.id)===String(a.user_id)));
 const feedback=state.feedback.filter(f=>f.lesson_id===l.id);
 modal(l.title,`<div class="lesson-banner"><div><span class="eyebrow">ПРОСМОТР ОРГАНИЗАТОРА</span><p><b>${date(l.start)}, ${time(l.start)}–${time(l.end)}</b> · Екатеринбург</p><p>${esc(l.teacher)}</p><p>${esc(l.address)}</p></div><img src="${image(l)}" alt="Картинка занятия"></div><p class="review-body">${esc(l.description)}</p>${l.cancelled?'<p class="notice">Занятие отменено</p>':''}<div class="button-row"><button class="button primary" data-edit-lesson="${l.id}">Изменить занятие</button><button class="button outline" data-copy-lesson="${l.id}">Создать копию</button>${safeUrl(l.url)?`<a class="button outline" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">Подключиться онлайн →</a>`:''}</div><section class="modal-section"><h3>Участие группы</h3><p>Онлайн: ${attendance.filter(a=>a.format==='online').length} · Очно: ${attendance.filter(a=>a.format==='offline').length} · Всего участников: ${group.length}</p><p class="form-hint">Вы управляете занятием — личная отметка посещения вам не требуется</p></section><section class="modal-section"><h3>Домашнее задание для группы</h3><p class="review-body">${esc(l.homework||'Задание пока не добавлено')}</p>${group.map(s=>{const h=state.all_homework.find(h=>h.lesson_id===l.id&&String(h.user_id)===String(s.id));return h?`<div class="admin-course-line"><span>${esc(s.name)} · ${Number(h.done)?'Выполнено':'Ожидает проверки'}</span><button class="text-button" data-check="${l.id}" data-student="${s.id}">Проверить ДЗ</button></div>`:'';}).join('')}</section><section class="modal-section"><h3>Обратная связь</h3>${feedback.map(f=>`<article class="admin-review"><span class="eyebrow">${f.visibility==='public'?'ДЛЯ ГРУППЫ':'ЛИЧНЫЙ ОТЗЫВ'}</span><h4>${esc(f.name)}</h4>${feedbackBody(f)}${conversation(f)}</article>`).join('')||'<p class="form-hint">Отзывы пока не поступали</p>'}</section>`);
}
function adminPanel(){
 $('#admin-courses').innerHTML=state.courses.map(c=>`<div class="admin-course-line"><div><b>${esc(c.title)}</b><small>Код группы: ${esc(c.code)} · до ${date(c.end)}</small></div><button class="text-button" data-edit-course="${esc(c.id)}">Изменить курс</button></div>`).join('');
 const group=(state.students||[]).filter(s=>s.course_id===activeCourse),ls=lessons(activeCourse),allA=state.all_attendance,allH=state.all_homework;
 $('#admin-table').innerHTML='';$('#organizer .table-wrap').hidden=true;
 $('#admin-feedback').innerHTML='<h3>Занятия курса</h3>'+ls.map(l=>`<div class="admin-course-line"><span>${esc(l.title)}</span><span><button class="text-button" data-edit-lesson="${l.id}">Изменить</button><button class="text-button" data-copy-lesson="${l.id}">Копия</button></span></div>`).join('')+'<h3>Обратная связь</h3>'+state.feedback.filter(f=>ls.some(l=>l.id===f.lesson_id)).map(f=>`<article class="admin-review"><div class="eyebrow">${f.visibility==='public'?'ПУБЛИЧНЫЙ ОТЗЫВ':'ЛИЧНЫЙ ОТЗЫВ'}</div><h4>${esc(f.name)} · ${esc(state.lessons.find(l=>l.id===f.lesson_id)?.title)}</h4>${feedbackBody(f)}${conversation(f)}</article>`).join('');
 $('.telegram-note').textContent='Уведомления Telegram: '+state.outbox_pending+' в очереди · для доставки нужен настроенный обработчик на хостинге';
}
function editCourse(id){
 const c=course(id)||{id:'',title:'',description:'',code:'',image:'hero',end:Date.now()+180*86400000};
 const custom=/^(?:[a-f0-9]{20}|[a-f0-9]{32})\.(png|jpg|webp)$/.test(c.image);
 modal(c.id?'Изменить курс':'Новый курс',`<form id="course-editor"><label class="field">Название<input name="title" required maxlength="150" value="${esc(c.title)}"></label><label class="field">Описание<textarea name="description" maxlength="5000">${esc(c.description)}</textarea></label><label class="field">Код группы<input name="code" required maxlength="80" value="${esc(c.code)}" autocomplete="off"><span class="form-hint">Выдавайте код только участникам — смена кода не удаляет уже записанных</span></label><label class="field">Окончание курса · Екатеринбург<input name="end" type="datetime-local" required value="${dt(c.end)}"></label><label class="field">Картинка курса<img id="course-image-preview" class="course-image-preview" src="${image(c)}" alt="Текущая картинка курса"><input name="image" type="file" accept="image/png,image/jpeg,image/webp"><span class="form-hint">Выберите свою картинку — PNG, JPG или WebP до 2 МБ</span></label>${custom?'<label class="choice"><input type="checkbox" name="remove_image">Вернуть стандартного персонажа</label>':''}<br><button class="button primary">Сохранить курс</button></form>`);
 $('#course-editor [name=image]').onchange=e=>{const f=e.target.files[0];if(!f)return;if(f.size>2000000){toast('Выберите картинку до 2 МБ');e.target.value='';return;}const url=URL.createObjectURL(f),preview=$('#course-image-preview');preview.onload=()=>URL.revokeObjectURL(url);preview.src=url;};
 form('#course-editor',async(data,el)=>{
  const payload={...data,id:c.id,end:parseDate(data.end),remove_image:data.remove_image==='on'};delete payload.image;
  const f=$('[name=image]',el).files[0];if(f){if(f.size>2000000)throw Error('Выберите картинку до 2 МБ');payload.image_data=await resize(f);}
  const result=await api('course_save',payload);activeCourse=result.id;await refresh();closeModal();toast('Курс и картинка сохранены');
 });
}
function editLesson(id,copy=false){
 if(!state.courses.length)return toast('Сначала создайте курс');const old=state.lessons.find(l=>l.id===id),l=old?{...old}:{course:activeCourse||state.courses[0].id,title:'',start:now()+86400000,end:now()+91800000,teacher:'',address:'',url:'',description:'',homework:'',cancelled:false};if(copy){l.title+=' — копия';l.start+=604800000;l.end+=604800000;}
 modal(copy?'Копия занятия':old?'Изменить занятие':'Новое занятие',`<form id="lesson-editor"><label class="field">Курс<select name="course" ${old&&!copy?'disabled':''}>${state.courses.map(c=>`<option value="${c.id}" ${l.course===c.id?'selected':''}>${esc(c.title)}</option>`).join('')}</select></label><label class="field">Название<input name="title" required maxlength="150" value="${esc(l.title)}"></label><div class="form-grid"><label class="field">Начало · Екатеринбург<input name="start" type="datetime-local" required value="${dt(l.start)}"></label><label class="field">Окончание · Екатеринбург<input name="end" type="datetime-local" required value="${dt(l.end)}"></label></div><label class="field">Преподаватель<input name="teacher" required maxlength="150" value="${esc(l.teacher)}" list="teacher-list"><datalist id="teacher-list">${[...new Set(state.lessons.map(l=>l.teacher))].map(t=>`<option value="${esc(t)}">`).join('')}</datalist></label><label class="field">Адрес аудитории<input name="address" maxlength="300" value="${esc(l.address)}"></label><label class="field">Ссылка подключения<input name="url" type="url" value="${esc(l.url)}"></label><label class="field">Краткое описание<textarea name="description" maxlength="5000">${esc(l.description)}</textarea></label><label class="field">Домашнее задание<textarea name="homework" maxlength="10000">${esc(l.homework)}</textarea></label><label class="field">Картинка<input type="file" name="image" accept="image/png,image/jpeg,image/webp"><span class="form-hint">До 2 МБ — изображение будет уменьшено</span></label><label class="choice"><input type="checkbox" name="cancelled" ${l.cancelled?'checked':''}>Занятие отменено</label><br><button class="button primary">Сохранить занятие</button></form>`);
 form('#lesson-editor',async (data,el)=>{const file=$('[name=image]',el).files[0];const payload={...data,id:old&&!copy?old.id:'',course:data.course||l.course,start:parseDate(data.start),end:parseDate(data.end),cancelled:data.cancelled==='on'};delete payload.image;if(file){if(file.size>2000000)throw Error('Выберите картинку до 2 МБ');payload.image_data=await resize(file);}await api('lesson_save',payload);await refresh();closeModal();toast('Занятие сохранено');});
}
function resize(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),im=new Image();im.onload=()=>{const ratio=Math.min(1,800/im.width,800/im.height),c=document.createElement('canvas');c.width=Math.round(im.width*ratio);c.height=Math.round(im.height*ratio);c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(url);resolve(c.toDataURL('image/webp',.85));};im.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Не удалось открыть картинку'));};im.src=url;});}
function checkHomework(sid,id){const h=state.all_homework.find(h=>String(h.user_id)===String(sid)&&h.lesson_id===id);if(!h)return;modal('Проверка домашнего задания',`<p class="review-body">${esc(h.body)}</p><form id="check-form"><label class="field">Комментарий<textarea name="comment" maxlength="5000">${esc(h.comment)}</textarea></label><label class="choice"><input type="checkbox" name="done" ${Number(h.done)?'checked':''}>Выполнено — закрыть ответ для изменений</label><br><button class="button primary">Сохранить проверку</button></form>`);form('#check-form',async data=>{await api('check_homework',{...data,student:sid,lesson:id,done:data.done==='on'});await refresh();closeModal();toast('Проверка сохранена — студент получит уведомление');});}
$('#join-button').onclick=()=>{if(isAdmin()){editCourse();return;}modal('Добавить курс',`<p>Введите код вашей группы</p><form id="join-form"><label class="field">Код группы<input name="code" required maxlength="80" autocomplete="off"></label><button class="button primary">Присоединиться</button></form>`);form('#join-form',async data=>{const result=await api('join',data);activeCourse=result.course;await refresh();closeModal();toast('Курс добавлен');});};
$('#profile-button').onclick=()=>{
 if(!state)return;
 modal('Ваш профиль',`<p>Логин: <b>${esc(state.profile.login)}</b></p><form id="profile-form"><label class="field">Имя и фамилия<input name="name" required maxlength="100" value="${esc(state.profile.name)}"></label><button class="button primary">Сохранить имя</button></form><section class="modal-section"><h3>Сменить пароль</h3><form id="password-form"><label class="field">Текущий пароль<input name="current_password" type="password" required autocomplete="current-password"></label><label class="field">Новый пароль — минимум 12 символов<input name="password" type="password" required minlength="12" autocomplete="new-password"></label><button class="button outline">Сменить пароль</button><p class="form-hint">Остальные сеансы входа закроются</p></form></section><section class="modal-section"><h3>Новый код восстановления</h3><p class="form-hint">Старый код перестанет действовать — сохраните новый</p><form id="rotate-form"><label class="field">Подтвердите текущий пароль<input name="current_password" type="password" required autocomplete="current-password"></label><button class="button outline">Заменить код восстановления</button></form></section>`);
 form('#profile-form',async data=>{await api('profile',data);await refresh();closeModal();});
 form('#password-form',async data=>{await api('change_password',data);await refresh();closeModal();toast('Пароль изменён — другие сеансы закрыты');});
 form('#rotate-form',async data=>{const result=await api('rotate_recovery',data);showRecovery(result.recovery_code,()=>refresh());});
};
$('#logout-button').onclick=async()=>{try{await api('logout',{});location.reload();}catch(e){toast(e.message);}};
$('#read-all').onclick=async()=>{try{await api('read_notifications',{});await refresh();}catch(e){toast(e.message);}};
$('#course-filter').onchange=e=>{scheduleCourse=e.target.value;if(scheduleCourse!=='all'){activeCourse=scheduleCourse;if(isAdmin())adminPanel();}schedule();};
$('#schedule-period').onchange=e=>{schedulePeriod=e.target.value;schedule();};
$('#new-course').onclick=()=>editCourse();$('#new-lesson').onclick=()=>editLesson();
$('#nearest-lesson').onclick=e=>{e.preventDefault();if(isAdmin()){location.hash='organizer';return;}const ls=state.lessons.filter(l=>!l.cancelled).sort((a,b)=>a.start-b.start);const l=ls.find(l=>l.end>now())||ls.at(-1);if(l)openLesson(l.id);else toast('Пока нет занятий');};
document.addEventListener('click',async e=>{const b=e.target.closest('[data-course],[data-lesson],[data-edit-course],[data-edit-lesson],[data-copy-lesson],[data-check],[data-notification]');if(!b)return;try{if(b.dataset.course)goToSchedule(b.dataset.course);if(b.dataset.lesson)openLesson(b.dataset.lesson);if(b.dataset.editCourse)editCourse(b.dataset.editCourse);if(b.dataset.editLesson)editLesson(b.dataset.editLesson);if(b.dataset.copyLesson)editLesson(b.dataset.copyLesson,true);if(b.dataset.check)checkHomework(b.dataset.student,b.dataset.check);if(b.dataset.notification){await api('read_notifications',{});await refresh();openLesson(b.dataset.notification);}}catch(err){toast(err.message);}});
document.addEventListener('change',async e=>{if(!e.target.dataset.attendance)return;try{await api('admin_attendance',{lesson:e.target.dataset.attendance,student:e.target.dataset.student,format:e.target.value});await refresh();toast('Посещение исправлено');}catch(err){toast(err.message);await refresh();}});
document.addEventListener('submit',async e=>{const id=e.target.dataset.reply;if(!id)return;e.preventDefault();const el=e.target,text=$('input',el).value.trim();if(!text)return;const b=$('button',el);b.disabled=true;try{const l=state.feedback.find(f=>f.id===id)?.lesson_id;await api('reply',{feedback:id,text});await refresh();if($('#modal').open&&l)openLesson(l);toast('Сообщение сохранено');}catch(err){toast(err.message);}finally{b.disabled=false;}});
function renderLogin(mode='login'){
 const registration=mode==='register',recover=mode==='recover';
 $('#login-status').textContent='';
 $$('#auth-tabs button').forEach(b=>{b.classList.toggle('primary',b.dataset.auth===mode);b.classList.toggle('outline',b.dataset.auth!==mode);b.setAttribute('aria-pressed',String(b.dataset.auth===mode));});
 $('#login-form').innerHTML=`${registration?'<label class="field">Имя и фамилия<input name="name" required maxlength="100" autocomplete="name"></label>':''}<label class="field">Логин<input name="login" required pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}" maxlength="32" autocomplete="username" autocapitalize="none" spellcheck="false"><span class="form-hint">3–32 символа: латинские буквы, цифры, точка, дефис или подчёркивание</span></label>${recover?'<label class="field">Личный или одноразовый код восстановления<input name="recovery_code" required maxlength="120" autocomplete="off" spellcheck="false"><span class="form-hint">Нет кода? Свяжитесь с организатором для проверки личности</span></label>':''}<label class="field">${mode==='login'?'Пароль':'Новый пароль — минимум 12 символов'}<input name="password" type="password" required ${mode==='login'?'':'minlength="12"'} autocomplete="${mode==='login'?'current-password':'new-password'}"></label>${registration?'<p class="form-hint">После регистрации сохраните личный код восстановления — почта не потребуется</p>':''}<button class="button primary">${registration?'Создать аккаунт':recover?'Сменить пароль':'Войти'}</button>`;
 form('#login-form',async data=>{
  const result=await api(mode,data);
  if(registration)showRecovery(result.recovery_code,()=>refresh());
  else if(recover)showRecovery(result.recovery_code,async()=>{showLogin();toast('Пароль восстановлен — войдите с новым паролем');});
  else await refresh();
 });
}
function showRecovery(code,after,temporary=false){
 recoveryPending=true;
 modal(temporary?'Одноразовый код для студента':'Сохраните личный код восстановления',`<p>${temporary?'Передайте код только этому студенту после проверки личности — действует 15 минут':'Код позволяет сменить пароль без почты — сохраните его в менеджере паролей, он показывается один раз'}</p><label class="field">${temporary?'Одноразовый код':'Личный код'}<textarea id="recovery-value" readonly spellcheck="false" autocomplete="off">${esc(code)}</textarea></label><button class="button outline" type="button" id="copy-recovery">Скопировать код</button><form id="ack-recovery"><label class="choice"><input name="saved" type="checkbox" required>${temporary?'Я сохранил код для передачи студенту':'Я сохранил код в надёжном месте'}</label><br><button class="button primary">Продолжить</button></form>`);
 $('#close-modal').disabled=true;
 $('#copy-recovery').onclick=async()=>{try{await navigator.clipboard.writeText(code);toast('Код скопирован — сохраните его в менеджере паролей');}catch{$('#recovery-value').focus();$('#recovery-value').select();toast('Нажмите Ctrl+C, чтобы скопировать выделенный код');}};
 form('#ack-recovery',async()=>{recoveryPending=false;$('#close-modal').disabled=false;closeModal();$('#modal-content').replaceChildren();await after();});
}
async function resetStudent(id){
 const s=state.students.find(s=>String(s.id)===String(id));if(!s)return;
 modal('Восстановить доступ студенту',`<p><b>${esc(s.name)}</b> · логин ${esc(s.login)}</p><p class="form-hint">Сначала лично убедитесь, что запрос пришёл от этого студента — код группы не подтверждает личность</p><form id="admin-reset-form"><label class="choice"><input type="checkbox" name="verified" required>Личность студента проверена</label><label class="field">Ваш пароль организатора<input name="current_password" type="password" required autocomplete="current-password"></label><button class="button primary">Выдать одноразовый код</button></form>`);
 form('#admin-reset-form',async data=>{const result=await api('admin_reset',{...data,student:id});showRecovery(result.reset_code,()=>refresh(),true);});
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-auth],[data-admin-reset]');if(!b)return;if(b.dataset.auth)renderLogin(b.dataset.auth);if(b.dataset.adminReset)resetStudent(b.dataset.adminReset);});
(async()=>{showLogin();try{const s=await api('session');if(s.user)await refresh();}catch(err){$('#login-status').textContent=err.message;}})();
window.addEventListener('hashchange',()=>$$('nav a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')===(location.hash||'#courses'))));

function xml(v){return String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));}
function sheet(rows){return '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+rows.map((r,i)=>`<row r="${i+1}">`+r.map(v=>`<c t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join('')+'</row>').join('')+'</sheetData></worksheet>';}
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^(0xedb88320&-(c&1));}return(c^0xffffffff)>>>0;}
function zip(files){const chunks=[],central=[];let offset=0,cdsize=0;const enc=new TextEncoder();const header=(n)=>new DataView(new ArrayBuffer(n));
 for(const [path,content] of Object.entries(files)){const name=enc.encode(path),data=enc.encode(content),crc=crc32(data),h=header(30);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);chunks.push(h.buffer,name,data);const c=header(46);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.push(c.buffer,name);cdsize+=46+name.length;offset+=30+name.length+data.length;}
 const e=header(22),n=Object.keys(files).length;e.setUint32(0,0x06054b50,true);e.setUint16(8,n,true);e.setUint16(10,n,true);e.setUint32(12,cdsize,true);e.setUint32(16,offset,true);return new Blob([...chunks,...central,e.buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
$('#export-button').onclick=()=>{
 if(!isAdmin())return;
 const attendance=[['Студент','Логин','Курс','Занятие','Дата (Екатеринбург)','Посещение']],homework=[['Студент','Курс','Занятие','Статус']],summary=[['Студент','Курс','Очно (завершённые)','Онлайн (завершённые)','Пропуски','ДЗ выполнено','Состоялось занятий','Посещаемость, %']];
 for(const c of state.courses)for(const s of state.students.filter(s=>s.course_id===c.id)){
  let off=0,on=0,miss=0,done=0;
  for(const l of lessons(c.id)){
   const a=state.all_attendance.find(a=>String(a.user_id)===String(s.id)&&a.lesson_id===l.id),h=state.all_homework.find(h=>String(h.user_id)===String(s.id)&&h.lesson_id===l.id);
   attendance.push([s.name,s.login,c.title,l.title,fmt(l.start,{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}),l.cancelled?'Отменено':a?(a.format==='online'?'Онлайн':'Очно'):l.end>now()?'Ещё не состоялось':'Отсутствовал']);
   homework.push([s.name,c.title,l.title,!l.homework?'Не задано':h?(Number(h.done)?'Выполнено':'Ожидает проверки'):now()>=c.end?'Срок сдачи истёк':'Не отправлено']);
   if(!l.cancelled){if(a?.format==='online')on++;else if(a?.format==='offline')off++;else if(l.end<=now())miss++;if(Number(h?.done))done++;}
  }const m=state.attendance_metrics?.[c.id]?.students?.[String(s.id)];summary.push([s.name,c.title,m?.offline??off,m?.online??on,m?.absent??miss,done,m?.completed??'',m?.percent??'—']);
 }
 const lessonTotals=[['Курс','Занятие','Дата (Екатеринбург)','Студентов в группе','Присутствовали','Онлайн','Очно','Отсутствовали','Статус']];for(const c of state.courses)for(const l of lessons(c.id)){const m=state.attendance_metrics?.[c.id],t=m?.lessons?.[l.id];lessonTotals.push([c.title,l.title,fmt(l.start,{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}),m?.enrolled??'',t?.present??'',t?.online??'',t?.offline??'',t?.absent??'—',l.cancelled?'Отменено':l.end<=now()?'Завершено':'Предстоит']);}
 const files={'[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+[1,2,3,4].map(i=>`<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+['Посещаемость','Домашние задания','Сводка','Итоги занятий'].map((s,i)=>`<sheet name="${s}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+'</sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+[1,2,3,4].map(i=>`<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('')+'</Relationships>',
 'xl/worksheets/sheet1.xml':sheet(attendance),'xl/worksheets/sheet2.xml':sheet(homework),'xl/worksheets/sheet3.xml':sheet(summary),'xl/worksheets/sheet4.xml':sheet(lessonTotals)};
 const u=URL.createObjectURL(zip(files)),a=document.createElement('a');a.href=u;a.download='БРИДЖ_отчёт.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);
};

setInterval(()=>{if(state&&document.visibilityState==='visible'&&!$('#modal').open&&(typeof managementDirty==='undefined'||!managementDirty))refresh().catch(e=>toast(e.message));},60000);
