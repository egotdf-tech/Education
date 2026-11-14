// Requires the disposable integration/browser/management fixtures, never production.
const {chromium}=require('playwright');const path=require('path');
const BASE='http://127.0.0.1:8890',PASSWORD='Test-password-only-4827';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const creatureName='Чудик из браузера '+Date.now();
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 async function login(p,name){await p.goto(BASE);await p.locator('[name=login]').fill(name);await p.locator('[name=password]').fill(PASSWORD);await p.locator('#login-form button').click();await p.locator('#workspace').waitFor({state:'visible'});}
 await login(page,'organizer');await page.locator('#students-nav').waitFor({state:'visible'});
 const ids=await page.evaluate(()=>({course:state.courses.find(c=>c.title==='Тестовый курс').id,student:state.students.find(s=>s.login==='student-b').id,lesson:state.lessons.find(l=>l.title==='После занятия').id}));
 // The same course link must scroll every time, even with an unchanged hash.
 for(let i=0;i<2;i++){
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.locator(`[data-course="${ids.course}"]`).click();
  await page.waitForFunction(()=>Math.abs(document.querySelector('#schedule').getBoundingClientRect().top)<100);
  if(await page.locator('#course-filter').inputValue()!==ids.course)throw Error('Course not selected');
 }
 await page.locator('#course-filter').selectOption('all');await page.locator('#schedule-period').selectOption('all');
 const order=await page.locator('#lesson-list [data-lesson]').evaluateAll(nodes=>nodes.map(n=>n.dataset.lesson));
 const expected=await page.evaluate(()=>[...state.lessons].sort((a,b)=>a.start-b.start||a.title.localeCompare(b.title,'ru')).map(l=>l.id));if(order.join()!==expected.join())throw Error('All-course schedule is not chronological');
 await page.locator('#attendance-course').selectOption(ids.course);
 await page.locator(`#attendance-grid [data-student="${ids.student}"][data-attendance="${ids.lesson}"]`).selectOption('online');
 await page.waitForFunction(({c,s,l})=>state.all_attendance.some(a=>String(a.user_id)===String(s)&&a.lesson_id===l&&a.format==='online'),{c:ids.course,s:ids.student,l:ids.lesson});
 const percent=await page.evaluate(({c,s})=>state.attendance_metrics[c].students[String(s)].percent,{c:ids.course,s:ids.student});
 const studentRow=page.locator('#attendance-grid tbody tr').filter({has:page.locator(`[data-student-card="${ids.student}"]`)});if(!(await studentRow.textContent()).includes(String(percent).replace('.',',')+'%'))throw Error('Percentage not visible');
 await page.locator(`[data-student-card="${ids.student}"]`).click();await page.getByRole('heading',{name:'Курсы и посещаемость',exact:true}).waitFor();await page.locator('#close-modal').click();
 await page.locator('#add-reward').click();await page.locator('#reward-asset-form [name=name]').fill(creatureName);await page.locator('#reward-asset-form [name=image]').setInputFiles(path.join(__dirname,'../public_html/assets/fish.webp'));await page.locator('#reward-asset-form button').click();await page.locator('#modal').waitFor({state:'hidden'});
 const rid=await page.evaluate(name=>state.reward_catalog.find(a=>a.name===name).id,creatureName);
 for(const box of await page.locator('#reward-rules-form [name=pool]').all())await box.uncheck();
 await page.locator(`#reward-rules-form [name=pool][value="${rid}"]`).check();
 for(const select of await page.locator('#reward-rules-form select').all())await select.selectOption(rid);
 // Background or attendance refresh must preserve unsaved rule selections.
 await page.evaluate(()=>refresh());if(!await page.locator(`#reward-rules-form [name=pool][value="${rid}"]`).isChecked())throw Error('Unsaved rules lost');
 await page.locator('#reward-rules-form button[type=submit]').click();await page.waitForFunction(id=>state.reward_pool.length===1&&state.reward_pool[0]===id,rid);
 const created=await page.evaluate(async cid=>{const t=Date.now();const r=await api('lesson_save',{course:cid,title:'Награда из нового набора',start:t-7200000,end:t-3600000,teacher:'Тест','description':'','homework':''});await refresh();return r.id;},ids.course);
 const student=await browser.newPage({viewport:{width:390,height:844}});student.on('pageerror',e=>errors.push(e.message));await login(student,'reward-user');
 if(await student.locator('#students-nav').isVisible()||await student.locator('#rewards-nav').isVisible())throw Error('Student sees administrative data');
 await student.locator('#schedule-period').selectOption('past');await student.locator(`[data-lesson="${created}"]`).click();await student.locator('#feedback-form [name=takeaway]').fill('Возьму в работу практику');await student.locator('#feedback-form button').click();await student.waitForTimeout(150);await student.locator('#close-modal').click();
 const award=student.locator('#reward-grid .reward-card').filter({hasText:creatureName});await award.waitFor();if(!(await award.locator('img').getAttribute('src')).startsWith('uploads/'))throw Error('Uploaded creature not shown');
 const dl=page.waitForEvent('download');await page.locator('#export-button').click();await(await dl).saveAs('/tmp/bridge-runtime/management-report.xlsx');
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Admin horizontal overflow '+width);}
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'/tmp/bridge-runtime/management-desktop.png',fullPage:true});await student.screenshot({path:'/tmp/bridge-runtime/management-student.png',fullPage:true});
 if(errors.length)throw Error(errors.join('\n'));await browser.close();console.log('PASS: repeated course scroll, chronological all-course schedule, attendance matrix/totals/percent, student card, custom creature upload/rules, dirty form preservation, student collection and access isolation, XLSX, 320–1440 layout');
})().catch(e=>{console.error(e);process.exit(1)});
