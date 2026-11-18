"""Uses local disposable fixtures only; Telegram is an in-network fake server."""
import json,time,urllib.request,urllib.error,http.cookiejar,subprocess,re
from pathlib import Path
BASE='http://127.0.0.1:8890';PASSWORD='Test-password-only-4827';RUNTIME=Path('/tmp/bridge-runtime')
class Client:
 def __init__(self):self.csrf='';self.o=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 def call(self,action,data=None,status=200):
  req=urllib.request.Request(BASE+'/api.php?action='+action,data=None if data is None else json.dumps(data).encode(),headers={'Content-Type':'application/json','X-CSRF-Token':self.csrf})
  try:r=self.o.open(req);code=r.status;raw=r.read()
  except urllib.error.HTTPError as e:code=e.code;raw=e.read()
  assert code==status,(action,code,raw.decode());v=json.loads(raw);self.csrf=v.get('csrf',self.csrf);return v
 def login(self,login):self.call('session');return self.call('login',{'login':login,'password':PASSWORD})
a=Client();admin=a.login('organizer')['user'];s=a.call('state');c=next(c for c in s['courses']if c['title']=='Тестовый курс')
p=Client();p.call('session');student=p.call('register',{'login':'notice-student','name':'Участник уведомлений','password':PASSWORD})['user'];p.call('join',{'code':'PRIVATE-GROUP'})
l=next(l for l in s['lessons']if l['title']=='После занятия');before=a.call('state')['unread_count']
f={'lesson':l['id'],'takeaway':'Только организатору','question':'Можно уточнить?','visibility':'private'}
p.call('feedback',f);s=a.call('state');notice=next(n for n in s['notifications']if 'Участник уведомлений' in n['body']);fid=notice['feedback_id']
assert s['unread_count']==before+1 and notice['lesson_id']==l['id']
assert any(x['id']==fid and x['visibility']=='private'for x in s['feedback'])
other=Client();other.login('student-b');assert not any(x['id']==fid for x in other.call('state')['feedback'])
other.call('backfill_feedback_notices',{},status=403);other.call('telegram_status',{},status=403);other.call('read_feedback_notices',{'feedback':fid},status=403)
p.call('feedback',{**f,'takeaway':'Правка'});s=a.call('state');assert s['unread_count']==before+2
p.call('reply',{'feedback':fid,'text':'Ещё один вопрос'});s=a.call('state');assert s['unread_count']==before+3
assert all(n.get('feedback_id')==fid for n in s['notifications']if 'Участник уведомлений' in n['body'])
a.call('read_feedback_notices',{'feedback':fid});assert a.call('state')['unread_count']==before
# Legacy feedback becomes linked notifications; repeating backfill does not duplicate rows or rewards.
subprocess.run(['docker','--host=unix:///var/run/docker.sock','exec','bridge-test-db','mysql','-uroot','bridge','-e',f"DELETE FROM bridge_notifications WHERE user_id={int(admin['id'])}"],check=True,capture_output=True)
count=len(a.call('state')['feedback']);assert a.call('backfill_feedback_notices',{})['added']==count
assert a.call('backfill_feedback_notices',{})['added']==0
# Status contains no token or chat ID.
status=a.call('telegram_status',{});assert status['token_present']and not status['connected'];assert 'token'not in status and 'chat_id'not in status
# Do not hijack an existing webhook bot.
fixture=RUNTIME/'telegram-fixture.json';fixture.write_text(json.dumps({'webhook':'https://example.test/existing-webhook'}))
a.call('telegram_pair_start',{'current_password':PASSWORD},status=503)
fixture.write_text('{}');a.call('telegram_pair_start',{'current_password':'wrong'},status=422)
started=a.call('telegram_pair_start',{'current_password':PASSWORD});assert started['link'].startswith('https://t.me/BridgeTestBot?start=')
nonce=started['link'].split('start=')[1]
fixture.write_text(json.dumps({'updates':[{'update_id':1,'message':{'chat':{'id':12345,'type':'group'},'date':int(time.time()),'text':'/start '+nonce}}]}))
a.call('telegram_pair_finish',{},status=422)
fixture.write_text(json.dumps({'updates':[{'update_id':2,'message':{'chat':{'id':12345,'type':'private'},'date':int(time.time()),'text':'/start wrong'}}]}))
a.call('telegram_pair_finish',{},status=422)
fixture.write_text(json.dumps({'updates':[{'update_id':3,'message':{'chat':{'id':12345,'type':'private'},'date':int(time.time()),'text':'/start '+nonce}}]}))
status=a.call('telegram_pair_finish',{});assert status['connected']and status['username']=='BridgeTestBot'
a.call('telegram_pair_finish',{},status=422)
a.call('telegram_test',{})
messages=[json.loads(x)for x in(RUNTIME/'telegram-sent.jsonl').read_text().splitlines()];assert len(messages)==1
assert messages[0]['chat_id']=='12345'
# Worker retries on failure, then delivers queue once without exposing private feedback text.
fixture.write_text(json.dumps({'fail':'sendMessage'}))
run=['docker','--host=unix:///var/run/docker.sock','exec','bridge-test-web','php','/site/bridge-app/notify.php']
subprocess.run(run,check=True,capture_output=True)
assert a.call('telegram_status',{})['pending']>0
fixture.write_text('{}')
subprocess.run(['docker','--host=unix:///var/run/docker.sock','exec','bridge-test-db','mysql','-uroot','bridge','-e','UPDATE bridge_outbox SET available_at=0 WHERE sent_at IS NULL'],check=True,capture_output=True)
subprocess.run(run,check=True,capture_output=True)
assert a.call('telegram_status',{})['pending']==0
before=len((RUNTIME/'telegram-sent.jsonl').read_text().splitlines());subprocess.run(run,check=True,capture_output=True);assert len((RUNTIME/'telegram-sent.jsonl').read_text().splitlines())==before
messages=[json.loads(x)for x in(RUNTIME/'telegram-sent.jsonl').read_text().splitlines()]
assert not any('Только организатору'in m['text']or 'Можно уточнить?'in m['text']for m in messages)
assert any('/#review-'+fid in m['text']for m in messages)
print('PASS: organizer notices for private feedback/updates/replies, targeted read, legacy backfill idempotence, student isolation, no token exposure, private nonce pairing, webhook protection, Telegram test, worker retry/dedup and private-text exclusion')
