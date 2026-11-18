// Local browser test; Telegram calls are served by a fake in the disposable Docker network.
const {chromium}=require('playwright');const fs=require('fs');
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:8890/');await p.locator('[name=login]').fill('organizer');await p.locator('[name=password]').fill('Test-password-only-4827');await p.locator('#login-form button').click();await p.locator('#workspace').waitFor({state:'visible'});
 const feedback=await p.evaluate(()=>state.feedback.find(f=>f.name==='Участник уведомлений'));
 await p.locator('#feedback-nav').click();await p.locator('#feedback-search').fill('Участник уведомлений');
 if(await p.locator('#feedback-inbox .inbox-card').count()!==1)throw Error('Feedback search failed');
 await p.locator('#feedback-visibility').selectOption('questions');if(await p.locator('#feedback-inbox .inbox-card').count()!==1)throw Error('Question filter failed');
 const input=p.locator(`#feedback-inbox [data-reply="${feedback.id}"] input`);await input.fill('Ответ организатора из общего списка');
 await p.evaluate(()=>refresh());if(await input.inputValue()!=='Ответ организатора из общего списка')throw Error('Draft lost after refresh');
 await p.locator(`#feedback-inbox [data-reply="${feedback.id}"] button`).click();await p.waitForFunction(id=>state.feedback.find(f=>f.id===id).replies.some(r=>r.text==='Ответ организатора из общего списка'),feedback.id);
 await p.locator(`#notification-list [data-feedback-open="${feedback.id}"]`).first().click();await p.locator('#modal-title').filter({hasText:'Отзыв ·'}).waitFor();
 await p.locator('#modal [data-reply] input').fill('Ответ в отдельном окне');await p.locator('#modal [data-reply] button').click();await p.locator('#modal .reply').filter({hasText:'Ответ в отдельном окне'}).last().waitFor();if(!(await p.locator('#modal-title').textContent()).startsWith('Отзыв ·'))throw Error('Reply navigated away from feedback');await p.locator('#close-modal').click();
 // Telegram setup uses only the public bot link. No token is entered or returned in the browser.
 await p.locator('#telegram-connect').click();await p.locator('#telegram-pair-form [name=current_password]').fill('Test-password-only-4827');await p.locator('#telegram-pair-form button').click();
 const link=await p.locator('#modal a[href^="https://t.me/"]').getAttribute('href');const nonce=new URL(link).searchParams.get('start');
 fs.writeFileSync('/tmp/bridge-runtime/telegram-fixture.json',JSON.stringify({updates:[{update_id:10,message:{chat:{id:12345,type:'private'},date:Math.floor(Date.now()/1000),text:'/start '+nonce}}]}));
 await p.locator('#telegram-finish').click();await p.locator('#modal').waitFor({state:'hidden'});
 if(!(await p.locator('#telegram-status-text').textContent()).includes('Личный чат подключён'))throw Error('Pairing status missing');
 await p.locator('#telegram-test').click();
 // A Telegram link can open the exact review after authentication/refresh.
 await p.goto('http://127.0.0.1:8890/#review-'+feedback.id);await p.locator('#modal-title').filter({hasText:'Отзыв ·'}).waitFor();await p.locator('#close-modal').click();
 for(const width of [320,390,768,1440]){await p.setViewportSize({width,height:900});if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Overflow '+width);}
 await p.setViewportSize({width:390,height:844});await p.locator('#feedback-search').fill('Участник уведомлений');await p.locator('#feedback').screenshot({path:'/tmp/bridge-runtime/feedback-mobile.png'});
 if(errors.length)throw Error(errors.join('\n'));await b.close();console.log('PASS: all-course feedback/search/question filter, draft preservation, notification opens exact review, in-place reply, private Telegram pairing/test, deep link and mobile widths');
})().catch(e=>{console.error(e);process.exit(1)});
