"""Run after integration.py/browser.cjs on the disposable database only."""
import json,time,urllib.request,urllib.error,http.cookiejar,base64,re,subprocess
from pathlib import Path
BASE='http://127.0.0.1:8890';PASSWORD='Test-password-only-4827'
class Client:
 def __init__(self):self.csrf='';self.opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 def call(self,action,data=None,status=200):
  req=urllib.request.Request(BASE+'/api.php?action='+action,data=json.dumps(data).encode()if data is not None else None,headers={'Content-Type':'application/json','X-CSRF-Token':self.csrf})
  try:r=self.opener.open(req);code=r.status;body=r.read()
  except urllib.error.HTTPError as e:code=e.code;body=e.read()
  assert code==status,(action,code,body.decode());v=json.loads(body);self.csrf=v.get('csrf',self.csrf);return v
 def login(self,name):self.call('session');return self.call('login',{'login':name,'password':PASSWORD})
a=Client();a.login('organizer');s=a.call('state');c=next(c for c in s['courses']if c['title']=='Тестовый курс');m=s['attendance_metrics'][c['id']]
u=next(p for p in s['students']if p['login']=='student-a');assert m['students'][str(u['id'])]['percent']==50.0
assert m['completed']==2  # Live/future lessons do not lower the percentage.
expired=next(l for l in s['lessons']if l['title']=='48 часов прошли')
after=next(l for l in s['lessons']if l['title']=='После занятия')
a.call('admin_attendance',{'student':u['id'],'lesson':expired['id'],'format':'online'})
m=a.call('state')['attendance_metrics'][c['id']];assert m['students'][str(u['id'])]['percent']==100
assert m['lessons'][expired['id']]['online']==1
# Cancellation removes a lesson from both the denominator and lesson totals.
a.call('lesson_save',{**expired,'cancelled':True})
m=a.call('state')['attendance_metrics'][c['id']];assert m['completed']==1 and m['students'][str(u['id'])]['percent']==100
assert m['lessons'][expired['id']]['present']==0
# Capture issued rewards before editing the catalog and future rules.
old=a.call('state')['student_awards'];review=next(x for x in old if str(x['user_id'])==str(u['id'])and x['kind']=='review')
image='data:image/webp;base64,'+base64.b64encode((Path(__file__).parents[1]/'public_html/assets/fish.webp').read_bytes()).decode()
custom=a.call('reward_asset_save',{'name':'Своя странная рыба','image_data':image,'enabled':True})['id']
s=a.call('state');rules={r['kind']:custom for r in s['reward_rules']}
a.call('reward_rules_save',{'pool':[],'rules':rules},status=422)
a.call('reward_rules_save',{'pool':[custom],'rules':rules})
s=a.call('state');unchanged=next(x for x in s['student_awards']if x['id']==review['id']);assert unchanged['name']==review['name']and unchanged['image']==review['image']
# New feedback uses only the selected pool, including private reviews.
p=Client();p.call('session');reg=p.call('register',{'login':'reward-user','name':'Участник наград','password':PASSWORD});sid=reg['user']['id'];p.call('join',{'code':'PRIVATE-GROUP'})
p.call('feedback',{'lesson':after['id'],'takeaway':'Проверка нового набора','visibility':'private'})
aw=p.call('state')['awards'];assert len(aw)==1 and aw[0]['name']=='Своя странная рыба'
p.call('feedback',{'lesson':after['id'],'takeaway':'Правка','visibility':'private'});assert len(p.call('state')['awards'])==1
# A student cannot change settings or inspect the award ledger/roster.
p.call('reward_rules_save',{'pool':[custom],'rules':rules},status=403);p.call('upgrade_features',{'backup_confirmed':True,'current_password':PASSWORD},status=403)
assert not any(k in p.call('state')for k in ['students','student_awards','reward_catalog','attendance_metrics'])
# Catalog edits do not change already granted names/images, even on future refreshes.
a.call('reward_asset_save',{'id':custom,'name':'Переименован для будущих','enabled':True})
assert p.call('state')['awards'][0]['name']=='Своя странная рыба'
# Issue a 5-online achievement, then correct one attendance: eligibility changes, snapshot remains.
t=int(time.time()*1000);ids=[]
for i in range(5):
 l=a.call('lesson_save',{'course':c['id'],'title':f'Серия {i}','start':t-(6-i)*86400000,'end':t-(6-i)*86400000+3600000,'teacher':'Тест','description':'','homework':'','cancelled':False})['id'];ids.append(l)
 a.call('admin_attendance',{'student':sid,'lesson':l,'format':'online'})
s=a.call('state');five=next(x for x in s['student_awards']if str(x['user_id'])==str(sid)and x['kind']=='online5'and int(x['active']))
assert five['catalog_id']==custom
# Deleting the middle attendance breaks the series. Cancelled classes are ignored.
a.call('admin_attendance',{'student':sid,'lesson':ids[2],'format':''});s=a.call('state');saved=next(x for x in s['student_awards']if x['id']==five['id']);assert int(saved['active'])==0
assert not any(x.get('key')==five['award_key']for x in p.call('state')['awards'])
a.call('admin_attendance',{'student':sid,'lesson':ids[2],'format':'online'});s=a.call('state');saved=next(x for x in s['student_awards']if x['id']==five['id']);assert int(saved['active'])==1 and saved['image']==five['image']
# Upgrade the original live-style schema without deleting existing rows.
# Remove only test feature tables; legacy rewards and all enrollment/attendance remain.
before=a.call('state');legacy_creature=subprocess.run(['docker','--host=unix:///var/run/docker.sock','exec','bridge-test-db','mysql','-N','-uroot','bridge','-e',f"SELECT creature FROM bridge_rewards WHERE user_id={int(u['id'])} AND lesson_id='{after['id']}'"],capture_output=True,text=True,check=True).stdout.strip()
subprocess.run(['docker','--host=unix:///var/run/docker.sock','exec','bridge-test-db','mysql','-uroot','bridge','-e','DROP TABLE bridge_reward_rules; DROP TABLE bridge_reward_pool; DROP TABLE bridge_award_ledger; DROP TABLE bridge_reward_catalog; DROP TABLE bridge_features;'],check=True,capture_output=True)
assert a.call('state')['rewards_ready']is False
# Still usable without the new tables: attendance metrics and legacy collections work.
assert a.call('state')['attendance_metrics']
a.call('upgrade_features',{'backup_confirmed':False,'current_password':PASSWORD},status=422)
a.call('upgrade_features',{'backup_confirmed':True,'current_password':'wrong'},status=422)
a.call('upgrade_features',{'backup_confirmed':True,'current_password':PASSWORD})
s=a.call('state');migrated=next(x for x in s['student_awards']if str(x['user_id'])==str(u['id'])and x['lesson_id']==after['id']);assert migrated['catalog_id']=='builtin-'+legacy_creature
assert len(s['students'])==len(before['students'])and len(s['all_attendance'])==len(before['all_attendance'])
a.call('upgrade_features',{'backup_confirmed':True,'current_password':PASSWORD});assert len(a.call('state')['student_awards'])==len(s['student_awards'])
print('PASS: lesson totals, percentages, cancellations, catalog/pool settings, award snapshots, private/public parity, idempotence, achievement recalculation, student isolation, additive legacy upgrade and repeated upgrade')
