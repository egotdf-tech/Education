'use strict';
const $ = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => [...root.querySelectorAll(q)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY = 'bridge.learning.v1';
const day = 86400000;
const creatures = [
 {name:'Глаз да практика',image:'hero',description:'Видит возможность там, где другие видят задачу.'},
 {name:'Тихий наблюдатель',image:'observer',description:'Всё замечает. Иногда даже слишком.'},
 {name:'Рыба вне шаблона',image:'fish',description:'Плывёт против привычных ответов.'},
 {name:'Не открывать до озарения',image:'bottle',description:'Ваше открытие подозрительно шевелится.'},
 {name:'Совет неочевидных',image:'owl',description:'Трое странных. Одна хорошая мысль.'}
];
function seed() {
 const d=new Date(); const ek=new Date(d.getTime()+5*3600000); const date=ek.toISOString().slice(0,10);
 const anchor=Date.parse(date+'T15:00:00+05:00');
 const courses=[
 {id:'c1',title:'Личная антихрупкость руководителя',subtitle:'Управление.PRO · 8 встреч',image:'hero',code:'BRIDGE-PRO',end:anchor+42*day},
 {id:'c2',title:'Коммуникация без лишнего напряжения',subtitle:'Команда и клиент · 8 встреч',image:'fish',code:'BRIDGE-TALK',end:anchor+42*day},
 {id:'c3',title:'Сервис с человеческим лицом',subtitle:'Продажи и сервис · 8 встреч',image:'observer',code:'BRIDGE-SERVICE',end:anchor+42*day}
 ];
 const titles=[['Опора на себя: с чего начать','Устойчивость и антихрупкость','Из точки тревоги в точку покоя','Фокус внимания','Четыре вида ресурса','Границы ответственности','Обратная связь без спасательства','Мой управленческий эксперимент'],['Факт и интерпретация','Почему мы слышим разное','Диалог вместо догадок','Уважение и ясность','Как говорить «нет»','Сложные разговоры','От эмоций к договорённости','Практика рабочих диалогов'],['Сервис начинается с внимания','Что на самом деле нужно клиенту','Вопросы, которые помогают','Работа с возражениями','Как держать границы','Трудный клиент','Продажа через пользу','Сервисный эксперимент']];
 const lessons=courses.flatMap((c,k)=>titles[k].map((title,i)=>({id:`${c.id}-${i}`,course:c.id,title,start:anchor+(i-2)*7*day+k*day,end:anchor+(i-2)*7*day+k*day+90*60000,teacher:i===4?'Мария, приглашённый эксперт':'Автор курса · БРИДЖ',address:'Аудитория БРИДЖ · адрес уточняется',url:'',image:c.image,description:'Разбираем реальные ситуации, проверяем привычные реакции и находим следующий шаг. Меньше абстракций — больше практики.',homework:'Опишите одну рабочую ситуацию: что произошло, что вы попробовали и какой результат получили.',cancelled:false})));
 return {version:1,profile:{name:'Александра',email:''},joined:['c1','c2'],courses,lessons,attendance:{},homework:{},feedback:{},notifications:[],rewardChoices:{},demo:{mode:'actual',lesson:'c1-2'}};
}
let state, storageWarning=false;
try {state=JSON.parse(localStorage.getItem(KEY)) || seed(); if(state.version!==1)state=seed();}catch{state=seed();storageWarning=true;}
let activeCourse=state.joined[0],toastTimer,modalLesson=null;
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{storageWarning=true;toast('Браузер запретил сохранение. Изменения останутся только до закрытия страницы.');}}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
function now(){const l=state.lessons.find(l=>l.id===state.demo.lesson);if(!l||state.demo.mode==='actual')return Date.now();return state.demo.mode==='during'?l.start+30*60000:state.demo.mode==='after'?l.end+3600000:l.end+49*3600000;}
function fmt(t,opts={}){return new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Yekaterinburg',...opts}).format(t);}
const dateLong=t=>fmt(t,{day:'numeric',month:'long'});
const time=t=>fmt(t,{hour:'2-digit',minute:'2-digit'});
function course(id){return state.courses.find(c=>c.id===id);}
function lessons(id){return state.lessons.filter(l=>l.course===id).sort((a,b)=>a.start-b.start);}
function notify(text,lesson){state.notifications.unshift({id:cryptoId(),text,lesson,read:false});}
function cryptoId(){return window.crypto?.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2);}
function safeUrl(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}}
function imagePath(l){return l.customImage || `assets/${l.image || 'hero'}.webp`;}
function rewardData(){
 const awards=[];
 for(const [id,f] of Object.entries(state.feedback)){
  const l=state.lessons.find(x=>x.id===id);if(!l)continue;
  const key='review-'+id;
  if(state.rewardChoices[key]===undefined){state.rewardChoices[key]=Math.floor(Math.random()*creatures.length);}
  awards.push({key,creature:state.rewardChoices[key],label:'За обратную связь',course:l.course});
 }
 for(const c of state.courses){
  let run=0,online=0,offline=0,max=0,mon=0,moff=0;
  for(const l of lessons(c.id).filter(l=>!l.cancelled && l.end<=now())){
   const a=state.attendance[l.id];run=a?run+1:0;online=a==='online'?online+1:0;offline=a==='offline'?offline+1:0;
   max=Math.max(max,run);mon=Math.max(mon,online);moff=Math.max(moff,offline);
  }
  for(const [condition,key,idx,label] of [[max>=5,'streak5',4,'5 встреч без пропусков'],[max>=10,'streak10',3,'10 встреч без пропусков'],[mon>=5,'online5',2,'5 встреч онлайн'],[moff>=5,'offline5',1,'5 встреч очно']])if(condition)awards.push({key:c.id+key,creature:idx,label,course:c.id});
  const tasks=lessons(c.id).filter(l=>!l.cancelled&&l.homework.trim());
  if(c.end<=now()&&tasks.length&&tasks.every(l=>state.homework[l.id]?.done))awards.push({key:c.id+'allhw',creature:0,label:'Все задания курса',course:c.id});
 }
 return awards;
}
function courseProgress(c){const ls=lessons(c.id).filter(l=>!l.cancelled);return {total:ls.length,attended:ls.filter(l=>state.attendance[l.id]).length};}
function render(){
 const awards=rewardData();save();
 const joined=state.courses.filter(c=>state.joined.includes(c.id));
 $('#profile-name').textContent=state.profile.name.split(' ')[0];$('.avatar').textContent=state.profile.name.split(/\s+/).map(x=>x[0]).slice(0,2).join('');
 $('#stat-courses').textContent=$('#course-count').textContent=joined.length;$('#heading-count').textContent=String(joined.length).padStart(2,'0');
 $('#stat-attendance').textContent=state.lessons.filter(l=>state.joined.includes(l.course)&&!l.cancelled&&state.attendance[l.id]).length;
 $('#stat-rewards').textContent=awards.length;$('#collection-count').textContent=`${awards.length} открыто`;
 $('#course-grid').innerHTML=joined.map((c,i)=>{
  const p=courseProgress(c);const next=lessons(c.id).find(l=>!l.cancelled&&l.end>now());
  return `<article class="course-card"><div class="course-visual ${i%2?'sand':''}"><span class="course-tag">ВАШ КУРС · БРИДЖ</span><div class="course-number">${String(i+1).padStart(2,'0')}</div><img src="assets/${c.image}.webp" alt="Персонаж курса"></div><div class="course-body"><h3>${esc(c.title)}</h3><p>${esc(c.subtitle)}</p><div class="progress-line"><span style="width:${p.total?p.attended/p.total*100:0}%"></span></div><div class="progress-caption"><span>Ваше участие</span><span>${p.attended} из ${p.total} занятий</span></div><div class="course-footer"><span>${next?'Ближайшее: '+dateLong(next.start):'Все встречи завершены'}</span><button data-course="${c.id}">К занятиям ↗</button></div></div></article>`;
 }).join('')||'<div class="empty">Добавьте первый курс по коду группы.</div>';
 $('#course-filter').innerHTML=joined.map(c=>`<option value="${c.id}">${esc(c.title)}</option>`).join('');if(!state.joined.includes(activeCourse))activeCourse=state.joined[0];$('#course-filter').value=activeCourse||'';
 renderSchedule();renderAwards(awards);renderNotifications();renderAdmin();
 $('#demo-settings').textContent=state.demo.mode==='actual'?'Настройки демо ↗':'Демо-время включено ↗';
}
function renderSchedule(){
 $('#lesson-list').innerHTML=lessons(activeCourse).map(l=>{
 const live=!l.cancelled&&now()>=l.start&&now()<l.end;const a=state.attendance[l.id];
 const label=l.cancelled?'Отменено':a?(a==='online'?'✓ Онлайн':'✓ Очно'):live?'● Идёт сейчас':l.end<=now()?'Завершено':'Скоро';
 return `<button class="lesson-row" data-lesson="${l.id}"><span class="date-box"><strong>${fmt(l.start,{day:'2-digit'})}</strong><span>${fmt(l.start,{month:'short'})}</span></span><span><span class="lesson-title">${esc(l.title)}</span><span class="lesson-meta">${time(l.start)}–${time(l.end)} · ${esc(l.teacher)}</span></span><span class="lesson-state">${label} ↗</span></button>`;
 }).join('')||'<div class="empty">Здесь появятся занятия выбранного курса.</div>';
}
function renderAwards(awards){
 const visible=awards.length?awards.slice(-8):[0,1,2,3].map((creature,i)=>({creature,label:['За первый отзыв','За 5 встреч подряд','За онлайн-серию','Неожиданный спутник'][i],locked:true}));
 $('#reward-grid').innerHTML=visible.map(a=>{const cr=creatures[a.creature];return `<div class="reward-card ${a.locked?'locked':''}"><img src="assets/${cr.image}.webp" alt="${a.locked?'Закрытый персонаж':esc(cr.name)}"><strong>${a.locked?'? Кто-то необычный':esc(cr.name)}</strong><small>${a.locked?'🔒 ':''}${esc(a.label)}</small></div>`;}).join('');
}
function renderNotifications(){
 $('#unread-count').textContent=state.notifications.filter(n=>!n.read).length;
 $('#notification-list').innerHTML=state.notifications.length?state.notifications.map(n=>`<div class="notification ${n.read?'':'unread'}">${esc(n.text)} ${n.lesson?`<button class="text-button" data-notification="${n.id}">Открыть ↗</button>`:''}</div>`).join(''):'<div class="empty">Пока тихо. Здесь появятся ответы организатора и результаты проверки заданий.</div>';
}
function openModal(title,html){$('#modal-title').textContent=title;$('#modal-content').innerHTML=html;const m=$('#modal');if(!m.open)m.showModal();}
function closeModal(){$('#modal').close();modalLesson=null;}
$('#close-modal').onclick=closeModal;
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
function feedbackText(f){const labels={takeaway:'Что беру в работу',impression:'Впечатление',question:'Вопрос',liked:'Что понравилось',wishes:'Чего не хватило / пожелания'};return Object.entries(labels).filter(([k])=>f[k]).map(([k,label])=>`<p class="review-body"><b>${label}</b><br>${esc(f[k])}</p>`).join('');}
function repliesHtml(f){return (f.replies||[]).map(r=>`<div class="reply"><b>${r.by==='organizer'?'Организатор':esc(state.profile.name)}</b><br>${esc(r.text)}</div>`).join('');}
function openLesson(id){
 const l=state.lessons.find(l=>l.id===id);if(!l||!state.joined.includes(l.course))return;
 modalLesson=id;const current=now(),live=!l.cancelled&&current>=l.start&&current<l.end;const canReview=!l.cancelled&&current>=l.end&&current<l.end+2*day;
 const a=state.attendance[id],hw=state.homework[id],f=state.feedback[id],deadline=l.end+2*day,c=course(l.course);
 openModal(l.title,`<div class="lesson-banner"><div><span class="eyebrow">${esc(c.title)}</span><p><b>${dateLong(l.start)}, ${time(l.start)}–${time(l.end)}</b> · Екатеринбург</p><p>${esc(l.teacher)}</p><p>${esc(l.address)}</p></div><img src="${esc(imagePath(l))}" alt="Иллюстрация занятия"></div><p>${esc(l.description)}</p>${l.cancelled?'<p class="notice">Занятие отменено. Не учитывается в сериях посещения.</p>':''}<div class="button-row">${safeUrl(l.url)?`<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer" class="button primary">Подключиться онлайн ↗</a>`:'<span class="form-hint">Ссылка на подключение пока не добавлена.</span>'}<button class="text-button" data-edit-lesson="${id}">Демо: редактировать занятие</button></div>
 <section class="modal-section"><h3>Я на занятии</h3>${a?`<p class="notice success">✓ Ваше присутствие отмечено: ${a==='online'?'онлайн':'очно'}</p>`:''}${live?`<form id="attendance-form"><fieldset><legend>Как вы участвуете?</legend><div class="choices"><label class="choice"><input type="radio" name="format" value="offline" ${a==='offline'?'checked':''} required>Я в аудитории</label><label class="choice"><input type="radio" name="format" value="online" ${a==='online'?'checked':''} required>Я онлайн</label></div></fieldset><button class="button primary">${a?'Изменить формат':'Подтвердить присутствие'}</button></form>`:`<p class="form-hint">${l.cancelled?'Отметка недоступна.':current<l.start?'Отметка откроется в '+time(l.start)+' в день занятия.':'Время самостоятельной отметки закончилось. Исправить посещение может организатор.'}</p>`}</section>
 <section class="modal-section"><h3>Что осталось с вами?</h3><p class="form-hint">Обратная связь до ${dateLong(deadline)}, ${time(deadline)} (Екатеринбург). Публикация не влияет на награду.</p>${canReview?`<form id="feedback-form">${[['takeaway','Что беру в работу *'],['impression','Впечатление от занятия'],['question','Какой вопрос остался?'],['liked','Что особенно понравилось?'],['wishes','Чего не хватило / пожелания']].map(([key,label])=>`<label class="field">${label}<textarea name="${key}" maxlength="5000" ${key==='takeaway'?'required':''} placeholder="${key==='takeaway'?'Один конкретный шаг, который попробуете…':'По желанию'}">${esc(f?.[key]||'')}</textarea></label>`).join('')}<fieldset><legend>КТО УВИДИТ ВАШ ОТЗЫВ?</legend><div class="choices"><label class="choice"><input type="radio" name="visibility" value="private" ${f?.visibility!=='public'?'checked':''}><span>🔒 Только мне и организатору<small>Личный разговор, без публикации.</small></span></label><label class="choice"><input type="radio" name="visibility" value="public" ${f?.visibility==='public'?'checked':''}><span>👥 Опубликовать для курса<small>Все заполненные поля и ответы увидят участники курса.</small></span></label></div></fieldset><button class="button primary">${f?'Сохранить изменения':'Отправить и открыть персонажа ✧'}</button></form>`:f?`<p class="notice">${f.visibility==='public'?'👥 Опубликовано для участников курса':'🔒 Только вам и организатору'}</p>${feedbackText(f)}`:`<p class="notice">${current<l.end?'Форма откроется после окончания занятия.':'48 часов прошли. Приём обратной связи закрыт.'}</p>`}
 ${f?`<div class="modal-section"><h3>Разговор с организатором</h3>${repliesHtml(f)||'<p class="form-hint">Ответ появится здесь и в уведомлениях.</p>'}<form id="student-reply" class="answer-form"><input name="text" aria-label="Сообщение организатору" required maxlength="5000" placeholder="Продолжить разговор…"><button class="button outline">Отправить</button></form></div>`:''}</section>
 <section class="modal-section"><h3>Домашнее задание</h3>${l.homework?`<p class="review-body">${esc(l.homework)}</p><p class="form-hint">🔒 Только вам и организатору · приём до ${dateLong(c.end)}, ${time(c.end)}</p>${hw?.done?`<p class="notice success">✓ Выполнено. Ответ проверен и закрыт для редактирования.</p><p class="review-body">${esc(hw.text)}</p>`:current<c.end&&!l.cancelled?`<form id="homework-form"><label class="field">Ваш ответ<textarea name="answer" required maxlength="15000" placeholder="Опишите, что попробовали…">${esc(hw?.text||'')}</textarea></label><button class="button primary">${hw?'Сохранить ответ':'Отправить на проверку'}</button>${hw?'<span class="form-hint"> Ожидает проверки</span>':''}</form>`:`<p class="notice">Приём заданий закрыт.</p>${hw?`<p class="review-body">${esc(hw.text)}</p>`:''}`}${hw?.comment?`<div class="reply"><b>Комментарий организатора</b><br>${esc(hw.comment)}</div>`:''}`:'<p class="form-hint">Задание пока не добавлено.</p>'}</section>`);
 const af=$('#attendance-form');if(af)af.onsubmit=e=>{e.preventDefault();if(now()<l.start||now()>=l.end||l.cancelled)return toast('Время отметки закончилось');state.attendance[id]=new FormData(af).get('format');save();render();openLesson(id);toast('Присутствие сохранено');};
 const ff=$('#feedback-form');if(ff)ff.onsubmit=e=>{e.preventDefault();if(now()<l.end||now()>=deadline)return toast('Срок отправки отзыва закончился');const values=Object.fromEntries(new FormData(ff));if(!values.takeaway.trim())return toast('Напишите, что берёте в работу');for(const k in values)values[k]=values[k].trim();const first=!state.feedback[id];state.feedback[id]={...values,replies:f?.replies||[],submitted:f?.submitted||now()};save();render();openLesson(id);toast(first?'Ваш спутник открыт! Загляните в коллекцию ✧':'Отзыв обновлён. Новая награда не начисляется.');};
 const hf=$('#homework-form');if(hf)hf.onsubmit=e=>{e.preventDefault();if(now()>=c.end||state.homework[id]?.done)return toast('Редактирование задания закрыто');const text=new FormData(hf).get('answer').trim();if(!text)return toast('Добавьте текст ответа');state.homework[id]={text,done:false,comment:hw?.comment||''};save();render();openLesson(id);toast('Задание отправлено на проверку');};
 const sr=$('#student-reply');if(sr)sr.onsubmit=e=>{e.preventDefault();const text=new FormData(sr).get('text').trim();if(!text)return;state.feedback[id].replies.push({by:'student',text,date:now()});save();render();openLesson(id);toast('Сообщение сохранено в демо');};
}
function renderAdmin(){
 const ls=lessons(activeCourse);
 $('#admin-table').innerHTML=ls.map(l=>{const hw=state.homework[l.id];return `<tr><td>${esc(state.profile.name)}<small>${esc(l.title)} · ${dateLong(l.start)}</small></td><td><select data-admin-attendance="${l.id}" aria-label="Посещение: ${esc(l.title)}"><option value="">${l.cancelled?'Отменено':l.end>now()?'Ещё не состоялось':'Отсутствовал'}</option><option value="offline" ${state.attendance[l.id]==='offline'?'selected':''}>Очно</option><option value="online" ${state.attendance[l.id]==='online'?'selected':''}>Онлайн</option></select></td><td>${!l.homework?'Не задано':hw?(hw.done?'✓ Выполнено':'Ожидает проверки'):'Не отправлено'}</td><td><button class="text-button" data-edit-lesson="${l.id}">Изменить</button><button class="text-button" data-copy-lesson="${l.id}">Копия</button>${hw?`<button class="text-button" data-check="${l.id}">Проверить ДЗ</button>`:''}</td></tr>`;}).join('');
 const reviews=ls.filter(l=>state.feedback[l.id]);
 $('#admin-feedback').innerHTML=reviews.length?reviews.map(l=>{const f=state.feedback[l.id];return `<article class="admin-review"><div class="eyebrow">${f.visibility==='public'?'ПУБЛИЧНЫЙ ОТЗЫВ':'ЛИЧНЫЙ ОТЗЫВ'}</div><h4>${esc(state.profile.name)} · ${esc(l.title)}</h4>${feedbackText(f)}${repliesHtml(f)}<form class="answer-form" data-admin-reply="${l.id}"><input name="text" placeholder="Ваш ответ студенту…" required maxlength="5000" aria-label="Ответ студенту"><button class="button primary">Ответить</button></form></article>`;}).join(''):'<p class="form-hint">Когда студент отправит обратную связь, она появится здесь. Для проверки выберите демо-время «После занятия».</p>';
}
function checkHomework(id){const hw=state.homework[id];if(!hw)return;const l=state.lessons.find(l=>l.id===id);openModal('Проверка домашнего задания',`<p class="eyebrow">${esc(state.profile.name)} · ${esc(l.title)}</p><p class="review-body">${esc(hw.text)}</p><form id="check-form"><label class="field">Комментарий<textarea name="comment" maxlength="5000">${esc(hw.comment||'')}</textarea></label><label class="choice"><input name="done" type="checkbox" ${hw.done?'checked':''}>Выполнено — закрыть ответ для изменений</label><br><button class="button primary">Сохранить проверку</button></form>`);$('#check-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);const done=f.has('done');state.homework[id]={...hw,done,comment:f.get('comment').trim()};notify(done?`Задание «${l.title}» выполнено. Отличная работа!`:`Обновлена проверка задания «${l.title}».`,id);save();render();closeModal();toast('Проверка сохранена. У студента появилось уведомление.');};}
function datetime(t){return new Date(t+5*3600000).toISOString().slice(0,16);}
function editLesson(id,copy=false){
 const original=state.lessons.find(l=>l.id===id);const l=original?{...original}:{course:activeCourse,title:'',start:Date.now()+day,end:Date.now()+day+90*60000,teacher:'Автор курса · БРИДЖ',address:'',url:'',image:'hero',description:'',homework:'',cancelled:false};
 if(copy){l.title+=' — копия';l.start+=7*day;l.end+=7*day;}
 openModal(copy?'Копировать занятие':original?'Изменить занятие':'Новое занятие',`<form id="lesson-editor"><div class="form-grid"><label class="field">Курс<select name="course">${state.courses.map(c=>`<option value="${c.id}" ${c.id===l.course?'selected':''}>${esc(c.title)}</option>`).join('')}</select></label><label class="field">Название<input name="title" required maxlength="150" value="${esc(l.title)}"></label><label class="field">Начало · Екатеринбург<input name="start" type="datetime-local" required value="${datetime(l.start)}"></label><label class="field">Окончание · Екатеринбург<input name="end" type="datetime-local" required value="${datetime(l.end)}"></label><label class="field">Преподаватель<input name="teacher" required maxlength="150" value="${esc(l.teacher)}" list="teachers"><datalist id="teachers"><option>Автор курса · БРИДЖ</option><option>Мария, приглашённый эксперт</option></datalist></label><label class="field">Адрес аудитории<input name="address" maxlength="300" value="${esc(l.address)}"></label></div><label class="field">Ссылка подключения (https://…)<input type="url" name="url" value="${esc(l.url)}"></label><label class="field">Краткое описание<textarea name="description" maxlength="5000">${esc(l.description)}</textarea></label><label class="field">Текст домашнего задания<textarea name="homework" maxlength="10000">${esc(l.homework)}</textarea></label><label class="field">Картинка занятия<input name="image" type="file" accept="image/png,image/jpeg,image/webp"><span class="form-hint">До 2 МБ. Изображение будет уменьшено для локального хранения.</span></label>${l.customImage?'<label class="field"><span><input name="removeImage" type="checkbox"> Удалить загруженную картинку</span></label>':''}<label class="field">Окончание курса<input name="courseEnd" type="datetime-local" required value="${datetime(course(l.course).end)}"></label><label class="choice"><input type="checkbox" name="cancelled" ${l.cancelled?'checked':''}>Занятие отменено</label><br><button class="button primary">Сохранить занятие</button></form>`);
 $('#lesson-editor').onsubmit=async e=>{
 e.preventDefault();const form=e.target,f=new FormData(form);const start=Date.parse(f.get('start')+':00+05:00'),end=Date.parse(f.get('end')+':00+05:00'),courseEnd=Date.parse(f.get('courseEnd')+':00+05:00');
 if(!f.get('title').trim()||!f.get('teacher').trim())return toast('Заполните название и преподавателя');if(end<=start)return toast('Окончание должно быть позже начала');if(courseEnd<end)return toast('Курс не может закончиться раньше занятия');
 if(f.get('url')&&!safeUrl(f.get('url')))return toast('Нужна ссылка с http:// или https://');
 const selectedCourse=f.get('course');if(state.lessons.some(x=>x.course===selectedCourse&&x.id!==(!copy?original?.id:null)&&x.end>courseEnd))return toast('Окончание курса должно быть после всех его занятий');
 const file=f.get('image');let customImage=f.has('removeImage')?null:l.customImage;
 if(file?.size){if(file.size>2*1024*1024)return toast('Картинка должна быть меньше 2 МБ');try{customImage=await resizeImage(file);}catch{return toast('Не удалось прочитать картинку. Выберите PNG, JPG или WebP.');}}
 const updated={...l,id:original&&!copy?original.id:cryptoId(),course:selectedCourse,title:f.get('title').trim(),start,end,teacher:f.get('teacher').trim(),address:f.get('address').trim(),url:f.get('url').trim(),description:f.get('description').trim(),homework:f.get('homework').trim(),cancelled:f.has('cancelled'),customImage};
 if(original&&!copy)state.lessons[state.lessons.findIndex(x=>x.id===original.id)]=updated;else state.lessons.push(updated);course(selectedCourse).end=courseEnd;save();render();closeModal();toast('Занятие сохранено. Расписание обновлено.');
 };
}
function resizeImage(file){return new Promise((resolve,reject)=>{const u=URL.createObjectURL(file),im=new Image();im.onload=()=>{const scale=Math.min(1,600/im.width,600/im.height),canvas=document.createElement('canvas');canvas.width=Math.round(im.width*scale);canvas.height=Math.round(im.height*scale);canvas.getContext('2d').drawImage(im,0,0,canvas.width,canvas.height);URL.revokeObjectURL(u);resolve(canvas.toDataURL('image/webp',.8));};im.onerror=()=>{URL.revokeObjectURL(u);reject();};im.src=u;});}
$('#join-button').onclick=()=>{openModal('Добавить курс',`<p>Введите код, который организатор передал вашей группе.</p><form id="join-form"><label class="field">Код группы<input name="code" required placeholder="Например, BRIDGE-SERVICE" autocomplete="off"></label><button class="button primary">Присоединиться</button></form><p class="form-hint">Для проверки: BRIDGE-SERVICE. Другие демо-коды: BRIDGE-PRO и BRIDGE-TALK.</p>`);$('#join-form').onsubmit=e=>{e.preventDefault();const c=state.courses.find(c=>c.code.toUpperCase()===new FormData(e.target).get('code').trim().toUpperCase());if(!c)return toast('Код не найден. Уточните его у организатора.');if(state.joined.includes(c.id))return toast('Этот курс уже есть в вашем кабинете');state.joined.push(c.id);activeCourse=c.id;save();render();closeModal();toast('Курс добавлен в ваш кабинет');};};
$('#profile-button').onclick=()=>{openModal('Ваш профиль',`<p class="notice">В прототипе нет проверки почты и настоящей авторизации. Это один локальный профиль, а не защищённый аккаунт.</p><form id="profile-form"><label class="field">Имя и фамилия<input name="name" required maxlength="100" value="${esc(state.profile.name)}"></label><label class="field">Электронная почта<input name="email" type="email" required value="${esc(state.profile.email)}"></label><button class="button primary">Сохранить профиль</button></form>`);$('#profile-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);if(!f.get('name').trim())return;state.profile={name:f.get('name').trim(),email:f.get('email').trim()};save();render();closeModal();toast('Локальный профиль сохранён. Письмо не отправляется.');};};
$('#demo-settings').onclick=()=>{openModal('Попробовать разные сценарии',`<p class="notice">Эти настройки меняют только время внутри прототипа. Устройство и настоящее расписание не меняются.</p><form id="demo-form"><label class="field">Занятие для проверки<select name="lesson">${state.lessons.filter(l=>state.joined.includes(l.course)).map(l=>`<option value="${l.id}" ${state.demo.lesson===l.id?'selected':''}>${esc(course(l.course).title)} · ${esc(l.title)}</option>`).join('')}</select></label><label class="field">Время<select name="mode"><option value="actual">Реальное время</option><option value="during">Во время занятия — отметка посещения</option><option value="after">Через час после занятия — отзыв</option><option value="expired">Через 49 часов — отзыв закрыт</option></select></label><button class="button primary">Применить и открыть занятие</button></form><p class="form-hint">Панель организатора расположена внизу страницы. Измените её отметки, чтобы проверить награды за серии. В реальном сервисе студенты не смогут менять время и чужие отметки.</p>`);$('#demo-form [name="mode"]').value=state.demo.mode;$('#demo-form').onsubmit=e=>{e.preventDefault();state.demo=Object.fromEntries(new FormData(e.target));save();render();openLesson(state.demo.lesson);};};
$('#course-filter').onchange=e=>{activeCourse=e.target.value;renderSchedule();renderAdmin();};
$('#read-all').onclick=()=>{state.notifications.forEach(n=>n.read=true);save();renderNotifications();toast('Все уведомления прочитаны');};
$('#new-lesson').onclick=()=>editLesson();
$('#reset-button').onclick=()=>{openModal('Сбросить демонстрацию?',`<p>Удалятся только данные этого прототипа в вашем браузере: отзывы, задания, отметки и изменения расписания.</p><button class="button primary" id="confirm-reset">Да, начать заново</button>`);$('#confirm-reset').onclick=()=>{state=seed();activeCourse=state.joined[0];save();render();closeModal();toast('Демонстрация сброшена');};};
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-course],[data-lesson],[data-check],[data-edit-lesson],[data-copy-lesson],[data-notification]');if(!el)return;
 if(el.dataset.course){activeCourse=el.dataset.course;$('#course-filter').value=activeCourse;renderSchedule();renderAdmin();location.hash='schedule';}
 if(el.dataset.lesson)openLesson(el.dataset.lesson);
 if(el.dataset.check)checkHomework(el.dataset.check);
 if(el.dataset.editLesson)editLesson(el.dataset.editLesson);
 if(el.dataset.copyLesson)editLesson(el.dataset.copyLesson,true);
 if(el.dataset.notification){const n=state.notifications.find(n=>n.id===el.dataset.notification);n.read=true;save();renderNotifications();openLesson(n.lesson);}
});
document.addEventListener('change',e=>{if(e.target.dataset.adminAttendance){const id=e.target.dataset.adminAttendance;state.audit=state.audit||[];state.audit.push({lesson:id,before:state.attendance[id]||'',after:e.target.value,date:Date.now(),by:'organizer'});if(e.target.value)state.attendance[id]=e.target.value;else delete state.attendance[id];save();render();toast('Посещение исправлено. Серии пересчитаны.');}});
document.addEventListener('submit',e=>{const id=e.target.dataset.adminReply;if(!id)return;e.preventDefault();const text=new FormData(e.target).get('text').trim();if(!text)return;state.feedback[id].replies.push({by:'organizer',text,date:now()});const l=state.lessons.find(l=>l.id===id);notify(`Организатор ответил на ваш отзыв к занятию «${l.title}».`,id);save();render();toast('Ответ сохранён. У студента появилось уведомление.');});
window.addEventListener('hashchange',()=>{const hash=location.hash||'#courses';$$('nav a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')===hash));});
window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue){try{state=JSON.parse(e.newValue);render();}catch{}}});
// Native XLSX export: small uncompressed ZIP, no library or network dependency.
function xml(v){return String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));}
function sheet(rows){return '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+rows.map((r,i)=>`<row r="${i+1}">`+r.map(v=>`<c t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join('')+'</row>').join('')+'</sheetData></worksheet>';}
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^(0xedb88320&-(c&1));}return(c^0xffffffff)>>>0;}
function zip(files){const chunks=[],central=[];let offset=0,cdsize=0;const enc=new TextEncoder();const header=(n)=>new DataView(new ArrayBuffer(n));
 for(const [path,content] of Object.entries(files)){const name=enc.encode(path),data=enc.encode(content),crc=crc32(data),h=header(30);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);chunks.push(h.buffer,name,data);const c=header(46);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.push(c.buffer,name);cdsize+=46+name.length;offset+=30+name.length+data.length;}
 const e=header(22),n=Object.keys(files).length;e.setUint32(0,0x06054b50,true);e.setUint16(8,n,true);e.setUint16(10,n,true);e.setUint32(12,cdsize,true);e.setUint32(16,offset,true);return new Blob([...chunks,...central,e.buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function exportExcel(){
 const cs=state.courses.filter(c=>state.joined.includes(c.id));
 const attendance=[['Студент','Почта','Курс','Занятие','Дата (Екатеринбург)','Посещение']],homework=[['Студент','Курс','Занятие','Статус']],summary=[['Студент','Курс','Очно','Онлайн','Пропуски','ДЗ выполнено']];
 for(const c of cs){let off=0,on=0,miss=0,done=0;for(const l of lessons(c.id)){const a=state.attendance[l.id],hw=state.homework[l.id];const status=l.cancelled?'Отменено':a==='online'?'Онлайн':a==='offline'?'Очно':l.end>now()?'Ещё не состоялось':'Отсутствовал';attendance.push([state.profile.name,state.profile.email,c.title,l.title,`${dateLong(l.start)} ${fmt(l.start,{year:'numeric'})}, ${time(l.start)}`,status]);homework.push([state.profile.name,c.title,l.title,!l.homework?'Не задано':hw?.done?'Выполнено':hw?'Ожидает проверки':now()>=c.end?'Срок сдачи истёк':'Не отправлено']);if(!l.cancelled){if(a==='online')on++;else if(a==='offline')off++;else if(l.end<=now())miss++;if(hw?.done)done++;}}summary.push([state.profile.name,c.title,off,on,miss,done]);}
 const files={'[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+[1,2,3].map(i=>`<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+['Посещаемость','Домашние задания','Сводка'].map((s,i)=>`<sheet name="${s}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+'</sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+[1,2,3].map(i=>`<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('')+'</Relationships>',
 'xl/worksheets/sheet1.xml':sheet(attendance),'xl/worksheets/sheet2.xml':sheet(homework),'xl/worksheets/sheet3.xml':sheet(summary)};
 const url=URL.createObjectURL(zip(files)),a=document.createElement('a');a.href=url;a.download='БРИДЖ_учебный_отчёт.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('Отчёт Excel сформирован: 3 листа, без личных отзывов.');
}
$('#export-button').onclick=exportExcel;
$('#nearest-lesson').onclick=e=>{e.preventDefault();const all=state.lessons.filter(l=>state.joined.includes(l.course)&&!l.cancelled).sort((a,b)=>a.start-b.start);const next=all.find(l=>l.end>now())||all[all.length-1];if(!next)return toast('Сначала добавьте курс');activeCourse=next.course;$('#course-filter').value=activeCourse;renderSchedule();renderAdmin();openLesson(next.id);};
render();if(storageWarning)toast('Локальное сохранение недоступно в этом браузере.');
setInterval(()=>{renderSchedule();if(modalLesson){/* Forms stay untouched while typing; submission rechecks deadlines. */}},30000);
