// Uses only the local disposable test server/mailbox from integration.py.
const {chromium}=require('playwright');const fs=require('fs');
const base=process.env.BRIDGE_TEST_URL||'http://127.0.0.1:8890';const mailbox=process.env.BRIDGE_TEST_MAILBOX||'/tmp/bridge-runtime/mailbox.jsonl';
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const errors=[];const admin=await b.newPage({viewport:{width:1440,height:1000}});admin.on('pageerror',e=>errors.push(e.message));
 async function login(p,email,name){await p.goto(base);await p.locator('#login-form [name=name]').fill(name);await p.locator('#login-form [name=email]').fill(email);await p.locator('#login-form button').click();await p.locator('#login-form [name=code]').waitFor();const entries=fs.readFileSync(mailbox,'utf8').trim().split('\n').map(JSON.parse);const code=entries.filter(e=>e.email===email).at(-1).code;await p.locator('#login-form [name=code]').fill(code);await p.locator('#login-form .primary').click();await p.locator('#workspace').waitFor({state:'visible'});}
 await login(admin,'organizer@example.test','Организатор');await admin.locator('#organizer').waitFor({state:'visible'});
 await admin.locator('#new-course').click();await admin.locator('#course-editor [name=title]').fill('Курс из браузера');await admin.locator('#course-editor [name=description]').fill('Тест редактора');await admin.locator('#course-editor [name=code]').fill('BROWSER-GROUP');await admin.locator('#course-editor button').click();await admin.locator('#modal').waitFor({state:'hidden'});
 await admin.locator('#new-lesson').click();await admin.locator('#lesson-editor [name=title]').fill('Занятие из браузера');await admin.locator('#lesson-editor [name=teacher]').fill('Другой преподаватель');await admin.locator('#lesson-editor [name=homework]').fill('Текст задания');await admin.locator('#lesson-editor button').click();await admin.locator('#modal').waitFor({state:'hidden'});
 const download=admin.waitForEvent('download');await admin.locator('#export-button').click();await(await download).saveAs('/tmp/bridge-runtime/report.xlsx');
 const student=await b.newPage({viewport:{width:390,height:844}});student.on('pageerror',e=>errors.push(e.message));await login(student,'browser-student@example.test','Тестовый участник');
 if(await student.locator('#organizer').isVisible())throw Error('Student sees admin');
 await student.locator('#join-button').click();await student.locator('#join-form input').fill('PRIVATE-GROUP');await student.locator('#join-form button').click();await student.locator('#modal').waitFor({state:'hidden'});
 await student.getByRole('button',{name:'После занятия',exact:false}).first().click();await student.locator('#feedback-form [name=takeaway]').fill('Попробую задавать уточняющий вопрос');await student.locator('#feedback-form button').click();await student.locator('#feedback-form button').waitFor();
 await student.locator('#homework-form textarea').fill('Проверяю рабочую ситуацию');await student.locator('#homework-form button').click();await student.waitForTimeout(250);await student.locator('#close-modal').click();
 if(await student.locator('#stat-rewards').textContent()!=='1')throw Error('Reward not shown');
 await student.reload();await student.locator('#workspace').waitFor({state:'visible'});if(await student.locator('.course-card').count()!==1)throw Error('Database persistence');
 for(const width of [320,390,768,1440]){await student.setViewportSize({width,height:900});if(await student.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Overflow '+width);}
 await student.setViewportSize({width:390,height:844});await student.screenshot({path:'/tmp/bridge-runtime/student-mobile.png',fullPage:true});await admin.screenshot({path:'/tmp/bridge-runtime/admin-desktop.png',fullPage:true});
 await student.locator('#logout-button').click();await student.locator('#login-screen').waitFor({state:'visible'});if(errors.length)throw Error(errors.join('\n'));
 await b.close();console.log('PASS: browser email-code flow, admin course/lesson editor, student join, private feedback, homework, rewards, reload, logout, 320–1440 widths, XLSX download, no JS errors');
})().catch(e=>{console.error(e);process.exit(1)});
