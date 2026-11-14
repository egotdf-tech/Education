// Uses only the disposable test server initialized by integration.py, never production.
const {chromium}=require('playwright');
const base=process.env.BRIDGE_TEST_URL||'http://127.0.0.1:8890';
const PASSWORD='Test-password-only-4827';
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const errors=[];const admin=await b.newPage({viewport:{width:1440,height:1000}});admin.on('pageerror',e=>errors.push(e.message));
 async function login(p,login,password=PASSWORD){await p.goto(base);await p.locator('#login-form [name=login]').fill(login);await p.locator('#login-form [name=password]').fill(password);await p.locator('#login-form button').click();await p.locator('#workspace').waitFor({state:'visible'});}
 async function saveRecovery(p){await p.locator('#recovery-value').waitFor();const code=await p.locator('#recovery-value').inputValue();if(code.length!==71)throw Error('Recovery code format');await p.locator('#ack-recovery input').check();await p.locator('#ack-recovery button').click();await p.locator('#modal').waitFor({state:'hidden'});return code;}
 await login(admin,'organizer');await admin.locator('#organizer').waitFor({state:'visible'});
 if(await admin.locator('nav a[href="#courses"] span').first().textContent()!=='Курсы')throw Error('Admin still sees student courses');
 if(await admin.locator('#collection').isVisible())throw Error('Admin sees own student collection');
 if(await admin.locator('.progress-caption').count())throw Error('Admin sees student progress');
 await admin.locator('#join-button').click();await admin.locator('#course-editor').waitFor({state:'visible'});await admin.locator('#close-modal').click();

 await admin.locator('#new-course').click();await admin.locator('#course-editor [name=title]').fill('Курс из браузера');await admin.locator('#course-editor [name=description]').fill('Тест редактора');await admin.locator('#course-editor [name=code]').fill('BROWSER-GROUP');await admin.locator('#course-editor [name=image]').setInputFiles(require('path').join(__dirname,'../public_html/assets/fish.webp'));await admin.locator('#course-editor button').click();await admin.locator('#modal').waitFor({state:'hidden'});
 const cardImage=await admin.locator('.course-card').filter({has:admin.getByRole('heading',{name:'Курс из браузера'})}).locator('.course-visual img').getAttribute('src');if(!cardImage.startsWith('uploads/'))throw Error('Course picture not used');
 await admin.locator('#new-lesson').click();await admin.locator('#lesson-editor [name=title]').fill('Занятие из браузера');await admin.locator('#lesson-editor [name=teacher]').fill('Другой преподаватель');await admin.locator('#lesson-editor [name=homework]').fill('Текст задания');await admin.locator('#lesson-editor button').click();await admin.locator('#modal').waitFor({state:'hidden'});
 await admin.getByRole('button',{name:'Занятие из браузера',exact:false}).first().click();
 if(await admin.locator('#attendance-form,#feedback-form,#homework-form').count())throw Error('Admin sees student submission forms');
 await admin.getByRole('button',{name:'Изменить занятие',exact:true}).waitFor({state:'visible'});await admin.locator('#close-modal').click();
 const download=admin.waitForEvent('download');await admin.locator('#export-button').click();await(await download).saveAs('/tmp/bridge-runtime/report.xlsx');
 const student=await b.newPage({viewport:{width:390,height:844}});student.on('pageerror',e=>errors.push(e.message));await student.goto(base);
 await student.locator('[data-auth=register]').click();await student.locator('#login-form [name=name]').fill('Тестовый участник');await student.locator('#login-form [name=login]').fill('browser-user');await student.locator('#login-form [name=password]').fill(PASSWORD);await student.locator('#login-form button').click();
 const firstCode=await saveRecovery(student);await student.locator('#workspace').waitFor({state:'visible'});if(await student.locator('#organizer').isVisible())throw Error('Student sees admin');
 await student.locator('#join-button').click();await student.locator('#join-form input').fill('PRIVATE-GROUP');await student.locator('#join-form button').click();await student.locator('#modal').waitFor({state:'hidden'});
 await student.locator('#schedule-period').selectOption('all');
 await student.getByRole('button',{name:'После занятия',exact:false}).first().click();await student.locator('#feedback-form [name=takeaway]').fill('Попробую задавать уточняющий вопрос');await student.locator('#feedback-form button').click();await student.waitForTimeout(150);
 await student.locator('#homework-form textarea').fill('Проверяю рабочую ситуацию');await student.locator('#homework-form button').click();await student.waitForTimeout(150);await student.locator('#close-modal').click();
 if(await student.locator('#stat-rewards').textContent()!=='1')throw Error('Reward not shown');
 await student.locator('#profile-button').click();await student.locator('#rotate-form [name=current_password]').fill(PASSWORD);await student.locator('#rotate-form button').click();const rotated=await saveRecovery(student);if(rotated===firstCode)throw Error('Recovery not rotated');
 await student.locator('#logout-button').click();await student.locator('#login-screen').waitFor({state:'visible'});await student.locator('[data-auth=recover]').click();await student.locator('#login-form [name=login]').fill('browser-user');await student.locator('#login-form [name=recovery_code]').fill(rotated);await student.locator('#login-form [name=password]').fill('Changed-password-only-779');await student.locator('#login-form button').click();const afterReset=await saveRecovery(student);if(afterReset===rotated)throw Error('Recovery reused');
 await login(student,'browser-user','Changed-password-only-779');if(await student.locator('.course-card').count()!==1)throw Error('Course lost after recovery');
 await admin.reload();await admin.locator('#workspace').waitFor({state:'visible'});const cid=await admin.locator('#course-filter option').evaluateAll(opts=>opts.find(o=>o.textContent==='Тестовый курс').value);await admin.locator('#attendance-course').selectOption(cid);await admin.locator('[data-student-card]').first().click();await admin.locator('#modal [data-admin-reset]').click();await admin.locator('#admin-reset-form [name=verified]').check();await admin.locator('#admin-reset-form [name=current_password]').fill(PASSWORD);await admin.locator('#admin-reset-form button').click();await saveRecovery(admin);
 for(const width of [320,390,768,1440]){await student.setViewportSize({width,height:900});if(await student.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Overflow '+width);}
 await student.setViewportSize({width:390,height:844});await student.screenshot({path:'/tmp/bridge-runtime/student-mobile.png',fullPage:true});
 if(errors.length)throw Error(errors.join('\n'));await b.close();console.log('PASS: browser login/registration/recovery, code acknowledgement, admin reset, course/lesson editors, student join, feedback, homework, rewards, retained data after recovery, mobile 320–1440, XLSX, no JS errors');
})().catch(e=>{console.error(e);process.exit(1)});
