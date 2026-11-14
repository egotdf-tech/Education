'use strict';
let attendanceCourse='',rewardCourse='all',rewardStudent='all',managementDirty=false;
const rewardKinds={streak5:'5 занятий подряд без пропусков',streak10:'10 занятий подряд без пропусков',online5:'5 занятий подряд онлайн',offline5:'5 занятий подряд очно',allhw:'Все домашние задания курса'};
const personList=()=>[...new Map((state.students||[]).map(s=>[String(s.id),s])).values()];
const attendanceValue=(sid,lid)=>(state.all_attendance||[]).find(a=>String(a.user_id)===String(sid)&&a.lesson_id===lid)?.format||'';
function percentText(m){return m?.percent==null?'—':String(m.percent).replace('.',',')+'%';}
function renderManagement(){
 const allowed=isAdmin();for(const id of ['students','students-nav','rewards','rewards-nav'])$('#'+id).hidden=!allowed;
 if(!allowed)return;
 if(!course(attendanceCourse))attendanceCourse=state.courses[0]?.id||'';
 $('#attendance-course').innerHTML=state.courses.map(c=>`<option value="${c.id}">${esc(c.title)}</option>`).join('');$('#attendance-course').value=attendanceCourse;
 renderAttendance();renderRewards();
}
function renderAttendance(){
 const c=course(attendanceCourse),group=state.students.filter(s=>s.course_id===attendanceCourse),ls=lessons(attendanceCourse),metrics=state.attendance_metrics?.[attendanceCourse];
 if(!c){$('#attendance-summary').textContent='Сначала создайте курс';$('#attendance-grid').innerHTML='';return;}
 $('#attendance-summary').innerHTML=`<span class="pill">${group.length} участников</span><span class="pill">${metrics?.completed||0} завершённых занятий</span><span class="pill">${metrics?.final?'Итог курса':'Промежуточный итог'}</span>`;
 const header=`<thead><tr><th class="sticky-student">Студент</th><th>Посещаемость</th>${ls.map(l=>`<th><button class="text-button matrix-lesson" data-lesson="${l.id}" title="${esc(l.title)}">${date(l.start)}<small>${esc(l.title)}</small>${l.cancelled?'<small>Отменено</small>':''}</button></th>`).join('')}</tr></thead>`;
 const body=group.map(s=>{
  const m=metrics?.students?.[String(s.id)];
  return `<tr><td class="sticky-student"><button class="text-button student-name" data-student-card="${s.id}">${esc(s.name)}</button><small>${esc(s.login||'Логин не назначен')}</small></td><td><strong>${percentText(m)}</strong><small>${m?.present||0} из ${m?.completed||0} завершённых</small></td>${ls.map(l=>{
   const value=attendanceValue(s.id,l.id);
   return `<td>${l.cancelled?'<span class="form-hint">Не учитывается</span>':`<select class="matrix-select" data-attendance="${l.id}" data-student="${s.id}" aria-label="${esc(s.name)} — ${esc(l.title)}"><option value="">${l.end>now()?'Пока нет отметки':'Отсутствовал'}</option><option value="offline" ${value==='offline'?'selected':''}>Очно</option><option value="online" ${value==='online'?'selected':''}>Онлайн</option></select>`}</td>`;
  }).join('')}</tr>`;
 }).join('')||`<tr><td colspan="${ls.length+2}">Студенты появятся после регистрации и ввода кода этого курса</td></tr>`;
 const footer=`<tfoot><tr><th class="sticky-student">Отмечено на занятии</th><td>Будущие и отменённые не входят в процент</td>${ls.map(l=>{const t=metrics?.lessons?.[l.id];return `<td>${l.cancelled?'—':`<b>${t?.present||0} / ${group.length}</b><small>Онлайн ${t?.online||0} · Очно ${t?.offline||0}</small>`}</td>`;}).join('')}</tr></tfoot>`;
 $('#attendance-grid').innerHTML=header+'<tbody>'+body+'</tbody>'+footer;
}
function openStudentCard(id){
 const p=personList().find(s=>String(s.id)===String(id));if(!p)return;
 const memberships=state.students.filter(s=>String(s.id)===String(id)),tasks=state.all_homework.filter(h=>String(h.user_id)===String(id)),feedback=state.feedback.filter(f=>String(f.user_id)===String(id));
 const awards=(state.student_awards||[]).filter(a=>String(a.user_id)===String(id));
 modal(p.name,`<p>Логин: ${esc(p.login||'Не назначен')}</p><h3>Курсы и посещаемость</h3>${memberships.map(m=>{const c=course(m.course_id),t=state.attendance_metrics?.[m.course_id]?.students?.[String(id)];return `<div class="admin-course-line"><b>${esc(c?.title)}</b><span>${t?.present||0} / ${t?.completed||0} · ${percentText(t)}</span></div>`;}).join('')}<section class="modal-section"><h3>Домашние задания</h3>${tasks.map(h=>`<div class="admin-course-line"><span>${esc(state.lessons.find(l=>l.id===h.lesson_id)?.title)} · ${Number(h.done)?'Выполнено':'Ожидает проверки'}</span><button class="text-button" data-check="${h.lesson_id}" data-student="${id}">Открыть</button></div>`).join('')||'<p class="form-hint">Пока нет отправленных заданий</p>'}</section><section class="modal-section"><h3>Обратная связь</h3>${feedback.map(f=>`<article class="admin-review"><span class="eyebrow">${f.visibility==='public'?'ДЛЯ ГРУППЫ':'ЛИЧНЫЙ ОТЗЫВ'}</span><h4>${esc(state.lessons.find(l=>l.id===f.lesson_id)?.title)}</h4>${feedbackBody(f)}${conversation(f)}</article>`).join('')||'<p class="form-hint">Отзывов пока нет</p>'}</section><section class="modal-section"><h3>Награды</h3>${!state.rewards_ready?'<p class="form-hint">Примените обновление наград, чтобы увидеть историю</p>':awards.map(a=>`<div class="admin-course-line"><span>${esc(a.name)} · ${esc(a.label)}<small>${esc(a.course_title)}</small></span><span>${Number(a.active)?'Получено':'Пересчитано — условие не выполнено'}</span></div>`).join('')||'<p class="form-hint">Награды ещё впереди</p>'}</section>${p.login?`<section class="modal-section"><button class="button outline" data-admin-reset="${id}">Восстановить доступ студенту</button></section>`:''}`);
}
function renderRewards(){
 $('#add-reward').disabled=!state.rewards_ready;$('#reward-management').hidden=!state.rewards_ready;
 $('#reward-upgrade').innerHTML=state.rewards_ready?'':`<div class="notice"><b>Нужно включить новые настройки наград</b><p>Сначала сохраните резервную копию базы и папки uploads через панель SpaceWeb — затем примените дополнение. Старые курсы, студенты и отзывы не удаляются</p><button class="button primary" id="upgrade-rewards">Применить обновление наград</button></div>`;
 if(!state.rewards_ready){$('#upgrade-rewards').onclick=()=>{
  modal('Дополнение базы для наград',`<p>Добавятся отдельные таблицы персонажей, правил и истории. Уже полученные персонажи будут перенесены</p><form id="upgrade-rewards-form"><label class="choice"><input name="backup" type="checkbox" required>Резервная копия базы и загруженных картинок сохранена</label><label class="field">Пароль организатора<input name="current_password" type="password" required autocomplete="current-password"></label><button class="button primary">Применить</button></form>`);
  form('#upgrade-rewards-form',async data=>{await api('upgrade_features',{current_password:data.current_password,backup_confirmed:data.backup==='on'});await refresh();closeModal();toast('Настройки наград включены — прежние записи сохранены');});
 };return;}
 const people=personList();if(rewardCourse!=='all'&&!course(rewardCourse))rewardCourse='all';if(rewardStudent!=='all'&&!people.some(s=>String(s.id)===rewardStudent))rewardStudent='all';
 $('#reward-course').innerHTML='<option value="all">Все курсы</option>'+state.courses.map(c=>`<option value="${c.id}">${esc(c.title)}</option>`).join('');$('#reward-course').value=rewardCourse;
 $('#reward-student').innerHTML='<option value="all">Все студенты</option>'+people.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');$('#reward-student').value=rewardStudent;
 const awards=state.student_awards.filter(a=>(rewardCourse==='all'||a.course_id===rewardCourse)&&(rewardStudent==='all'||String(a.user_id)===rewardStudent));
 $('#issued-rewards').innerHTML=awards.map(a=>`<article class="issued-award ${Number(a.active)?'':'inactive'}"><img src="${image(a)}" alt="${esc(a.name)}"><div><b>${esc(a.student_name)}</b><strong>${esc(a.name)}</strong><small>${esc(a.course_title)} · ${esc(a.label)}</small><small>${date(a.awarded_at)} · ${Number(a.active)?'Получено':'Условие больше не выполнено — пересчитано'}</small></div></article>`).join('')||'<div class="empty">Награды по выбранному фильтру пока не получены</div>';
 $('#reward-catalog').innerHTML=state.reward_catalog.map(a=>`<article class="reward-card ${Number(a.enabled)?'':'locked'}"><img src="${image(a)}" alt="${esc(a.name)}"><strong>${esc(a.name)}</strong><small>${Number(a.enabled)?'Доступен для будущих наград':'В архиве'}</small><button class="text-button" data-edit-reward="${a.id}">Изменить</button></article>`).join('');
 if(managementDirty)return;
 const active=state.reward_catalog.filter(a=>Number(a.enabled));
 $('#reward-rules-form').innerHTML=`<fieldset><legend>Сюрприз за отзыв — выберите набор</legend><div class="reward-pool">${active.map(a=>`<label class="choice"><input type="checkbox" name="pool" value="${a.id}" ${state.reward_pool.includes(a.id)?'checked':''}><img src="${image(a)}" alt=""><span>${esc(a.name)}</span></label>`).join('')}</div></fieldset><div class="form-grid">${Object.entries(rewardKinds).map(([kind,label])=>`<label class="field">${label}<select name="rule_${kind}" required>${active.map(a=>`<option value="${a.id}" ${state.reward_rules.find(r=>r.kind===kind)?.catalog_id===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>`).join('')}</div><p class="form-hint">Новые настройки действуют для будущих наград — полученные персонажи сохраняются</p><div class="button-row"><button type="submit" class="button primary">Сохранить правила</button><button type="button" id="cancel-rules" class="button outline">Отменить изменения</button></div>`;
 $('#reward-rules-form').oninput=()=>{managementDirty=true;};$('#reward-rules-form').onchange=()=>{managementDirty=true;};
 $('#cancel-rules').onclick=()=>{managementDirty=false;renderRewards();};
 form('#reward-rules-form',async(data,el)=>{
  const pool=new FormData(el).getAll('pool');if(!pool.length)throw Error('Выберите хотя бы одного персонажа за отзыв');
  const rules=Object.fromEntries(Object.keys(rewardKinds).map(k=>[k,data['rule_'+k]]));await api('reward_rules_save',{pool,rules});managementDirty=false;await refresh();toast('Правила сохранены — полученные награды не изменились');
 });
}
function editReward(id){
 const a=state.reward_catalog.find(a=>a.id===id)||{id:'',name:'',image:'hero',enabled:1};
 modal(a.id?'Изменить персонажа':'Новый персонаж',`<form id="reward-asset-form"><label class="field">Название<input name="name" required maxlength="120" value="${esc(a.name)}"></label><label class="field">Картинка<img class="course-image-preview" id="reward-image-preview" src="${image(a)}" alt="Предпросмотр персонажа"><input type="file" name="image" accept="image/png,image/jpeg,image/webp" ${a.id?'':'required'}><span class="form-hint">PNG/JPG/WebP до 2 МБ — картинки уменьшаются, пропорции сохраняются</span></label><label class="choice"><input type="checkbox" name="enabled" ${Number(a.enabled)?'checked':''}>Доступен для будущих наград</label><p class="form-hint">Чтобы убрать персонажа в архив, сначала исключите его из набора за отзыв и правил достижений</p><button class="button primary">Сохранить персонажа</button></form>`);
 $('#reward-asset-form [name=image]').onchange=e=>{const f=e.target.files[0];if(!f)return;if(f.size>2000000){e.target.value='';toast('Выберите файл до 2 МБ');return;}const url=URL.createObjectURL(f),im=$('#reward-image-preview');im.onload=()=>URL.revokeObjectURL(url);im.src=url;};
 form('#reward-asset-form',async(data,el)=>{const payload={id:a.id,name:data.name,enabled:data.enabled==='on'},f=$('[name=image]',el).files[0];if(f){if(f.size>2000000)throw Error('Выберите файл до 2 МБ');payload.image_data=await resize(f);}await api('reward_asset_save',payload);await refresh();closeModal();toast('Персонаж сохранён — добавьте его в набор или назначьте достижению');});
}
$('#attendance-course').onchange=e=>{attendanceCourse=e.target.value;activeCourse=e.target.value;renderAttendance();adminPanel();};
$('#reward-course').onchange=e=>{rewardCourse=e.target.value;renderRewards();};$('#reward-student').onchange=e=>{rewardStudent=e.target.value;renderRewards();};
$('#add-reward').onclick=()=>editReward();
document.addEventListener('click',e=>{const b=e.target.closest('[data-student-card],[data-edit-reward]');if(!b)return;if(b.dataset.studentCard)openStudentCard(b.dataset.studentCard);if(b.dataset.editReward)editReward(b.dataset.editReward);});
if(state)renderManagement();
