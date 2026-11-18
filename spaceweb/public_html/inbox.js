'use strict';
let feedbackCourse='all',feedbackVisibility='all',feedbackQuery='',feedbackModalId=null,deepFeedbackOpened='';
const feedbackDrafts=new Map();
function inboxHasDrafts(){return [...feedbackDrafts.values()].some(v=>v.trim());}
function feedbackReplySent(id){feedbackDrafts.delete(id);$$(`[data-reply="${id}"] input`).forEach(el=>el.value='');}
function preserveFeedbackDrafts(){for(const el of $$('#feedback-inbox [data-reply]')){const text=$('input',el)?.value||'';if(text)feedbackDrafts.set(el.dataset.reply,text);}}
function restoreFeedbackDrafts(root=document){for(const el of $$('[data-reply]',root)){const draft=feedbackDrafts.get(el.dataset.reply);if(draft)$('input',el).value=draft;}}
function renderInbox(){
 const admin=isAdmin();$('#feedback').hidden=$('#feedback-nav').hidden=$('#organizer-notification-tools').hidden=!admin;
 if(!admin){feedbackDrafts.clear();return;}
 preserveFeedbackDrafts();
 if(feedbackCourse!=='all'&&!course(feedbackCourse))feedbackCourse='all';
 $('#feedback-course').innerHTML='<option value="all">Все курсы</option>'+state.courses.map(c=>`<option value="${c.id}">${esc(c.title)}</option>`).join('');$('#feedback-course').value=feedbackCourse;
 $('#feedback-visibility').value=feedbackVisibility;
 const query=feedbackQuery.toLocaleLowerCase('ru');
 const list=state.feedback.filter(f=>{
  const l=state.lessons.find(l=>l.id===f.lesson_id);if(feedbackCourse!=='all'&&l?.course!==feedbackCourse)return false;
  if(['public','private'].includes(feedbackVisibility)&&f.visibility!==feedbackVisibility)return false;
  if(feedbackVisibility==='questions'&&!f.question.trim())return false;
  return !query||[f.name,f.takeaway,f.impression,f.question,f.liked,f.wishes,l?.title,course(l?.course)?.title].join(' ').toLocaleLowerCase('ru').includes(query);
 });
 $('#feedback-count').textContent=list.length;
 $('#feedback-inbox').innerHTML=list.map(f=>{const l=state.lessons.find(l=>l.id===f.lesson_id);return `<article class="admin-review inbox-card" id="review-${f.id}"><div class="eyebrow">${f.visibility==='private'?'ЛИЧНЫЙ ОТЗЫВ':'ДЛЯ УЧАСТНИКОВ КУРСА'}</div><h3>${esc(f.name)}</h3><p class="form-hint">${esc(course(l?.course)?.title||'')} · ${esc(l?.title||'')} · ${date(f.created_at)}</p>${feedbackBody(f)}${conversation(f)}<button class="text-button" data-feedback-open="${f.id}">Открыть отдельно →</button></article>`;}).join('')||'<div class="empty">Нет отзывов для выбранных фильтров</div>';
 restoreFeedbackDrafts($('#feedback-inbox'));
 const deep=location.hash.match(/^#review-([a-f0-9]{32})$/);
 if(deep&&deepFeedbackOpened!==deep[1]&&state.feedback.some(f=>f.id===deep[1])){deepFeedbackOpened=deep[1];setTimeout(()=>openFeedback(deep[1]),0);}
}
async function openFeedback(id,mark=true){
 const f=state.feedback.find(f=>f.id===id);if(!f||(!isAdmin()&&String(f.user_id)!==String(state.profile.id)))return toast('Отзыв не найден');
 preserveFeedbackDrafts();
 if(mark){try{const read=await api('read_feedback_notices',{feedback:id});state.notifications=state.notifications.map(n=>n.feedback_id===id?{...n,is_read:1}:n);state.unread_count=read.unread_count;notifications();}catch(e){toast(e.message);}}
 const l=state.lessons.find(l=>l.id===f.lesson_id);
 modal('Отзыв · '+f.name,`<p class="eyebrow">${f.visibility==='private'?'ТОЛЬКО АВТОРУ И ОРГАНИЗАТОРУ':'ДЛЯ ГРУППЫ'}</p><p>${esc(course(l?.course)?.title||'')}<br><b>${esc(l?.title||'')}</b></p>${feedbackBody(f)}<section class="modal-section"><h3>Переписка</h3>${conversation(f)}</section>`);
 feedbackModalId=id;restoreFeedbackDrafts($('#modal-content'));
}
$('#feedback-course').onchange=e=>{feedbackCourse=e.target.value;renderInbox();};$('#feedback-visibility').onchange=e=>{feedbackVisibility=e.target.value;renderInbox();};$('#feedback-search').oninput=e=>{feedbackQuery=e.target.value;renderInbox();};
document.addEventListener('input',e=>{const f=e.target.closest('[data-reply]');if(f)feedbackDrafts.set(f.dataset.reply,e.target.value);});
document.addEventListener('click',e=>{const b=e.target.closest('[data-feedback-open]');if(b)openFeedback(b.dataset.feedbackOpen);});
window.addEventListener('hashchange',()=>{if(state&&isAdmin())renderInbox();});
$('#backfill-feedback').onclick=async()=>{const b=$('#backfill-feedback');b.disabled=true;try{const r=await api('backfill_feedback_notices',{});await refresh();toast('Добавлено уведомлений: '+r.added+' — отзывы не изменены');}catch(e){toast(e.message);}finally{b.disabled=false;}};
function showTelegramStatus(s){
 $('#telegram-status-text').textContent=!s.token_present?'Токен бота ещё не сохранён на хостинге':s.connected?'Личный чат подключён'+(s.username?' · @'+s.username:'')+' · в очереди сообщений: '+s.pending:'Токен сохранён — осталось подключить ваш личный чат';
 $('#telegram-test').disabled=!s.connected;
 $('#telegram-worker-path').textContent=s.connected?'Для планировщика потребуется приватный файл: '+s.worker_path:'';
}
$('#telegram-check-status').onclick=async()=>{try{showTelegramStatus(await api('telegram_status',{}));}catch(e){toast(e.message);}};
$('#telegram-connect').onclick=()=>{
 modal('Подключить личный Telegram',`<p>Сначала создайте отдельного бота через официальный @BotFather и сохраните токен только в приватном bridge-config.php</p><p class="form-hint">Не присылайте токен в чат и не вставляйте в адресную строку браузера</p><form id="telegram-pair-form"><label class="field">Пароль организатора<input type="password" name="current_password" required autocomplete="current-password"></label><button class="button primary">Получить ссылку подключения</button></form>`);
 form('#telegram-pair-form',async data=>{const r=await api('telegram_pair_start',data);if(!r.link.startsWith('https://t.me/'))throw Error('Неверная ссылка подключения');modal('Свяжите бота со своим Telegram',`<p>Откройте ссылку, нажмите <b>Start / Запустить</b> в боте и вернитесь сюда</p><a class="button primary" href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">Открыть бота →</a><p class="form-hint">Ссылка действует 10 минут — не передавайте её другим</p><button class="button outline" id="telegram-finish">Я нажал Start — проверить подключение</button>`);$('#telegram-finish').onclick=async()=>{const b=$('#telegram-finish');b.disabled=true;try{showTelegramStatus(await api('telegram_pair_finish',{}));closeModal();toast('Личный чат привязан — отправьте тестовое сообщение');}catch(e){toast(e.message);}finally{b.disabled=false;}};});
};
$('#telegram-test').onclick=async()=>{const b=$('#telegram-test');b.disabled=true;try{await api('telegram_test',{});toast('Тестовое сообщение отправлено в ваш Telegram');}catch(e){toast(e.message);}finally{b.disabled=false;}};
if(state)renderInbox();
