// Only localhost disposable fixtures from course-deadlines.py.
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:8890/');await p.locator('#login-form [name=login]').fill('notice-student');await p.locator('#login-form [name=password]').fill('Test-password-only-4827');await p.locator('#login-form button').click();await p.locator('#workspace').waitFor({state:'visible'});
 const fid=await p.evaluate(()=>state.feedback.find(f=>f.takeaway==='Правка позднего отзыва').id);
 if(!Number(await p.locator('#unread-count').textContent()))throw Error('Missing unread count');
 await p.locator(`#notification-list [data-feedback-open="${fid}"]`).last().click();
 await p.locator('#modal .reply').filter({hasText:'Ответ для проверки студентом'}).waitFor();
 const read=await p.evaluate(id=>state.notifications.filter(n=>n.feedback_id===id).every(n=>Number(n.is_read)),fid);if(!read)throw Error('Unread state not cleared');
 await p.locator('#close-modal').click();
 await p.evaluate(()=>openLesson(state.lessons.find(l=>l.title==='Давнее занятие').id));await p.locator('#feedback-form').waitFor();await p.locator('#homework-form').waitFor();
 if((await p.locator('#modal-content').textContent()).includes('48 часов'))throw Error('Old deadline');
 if(errors.length)throw Error(errors.join('\n'));await b.close();console.log('PASS: student unread counter, exact review answer modal, targeted read, old lesson feedback/homework forms');
})().catch(e=>{console.error(e);process.exit(1)});
