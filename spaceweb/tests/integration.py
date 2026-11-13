"""Run ONLY against a fresh disposable PHP 8.4/MySQL 8.4 test installation.
No production credentials, mail, personal data or external services are used.
"""
import os,json,time,urllib.request,urllib.error,http.cookiejar,urllib.parse,re,subprocess
BASE=os.environ.get('BRIDGE_TEST_URL','http://127.0.0.1:8890')
PASSWORD='Test-password-only-4827'
class Client:
 def __init__(self):
  self.cookies=http.cookiejar.CookieJar();self.opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(self.cookies));self.csrf=''
 def call(self,action,data=None,status=200,csrf=True):
  headers={'Content-Type':'application/json'}
  if csrf:headers['X-CSRF-Token']=self.csrf
  req=urllib.request.Request(BASE+'/api.php?action='+action,headers=headers,data=json.dumps(data).encode() if data is not None else None)
  try:
   r=self.opener.open(req);code=r.status;body=r.read().decode()
  except urllib.error.HTTPError as e:code=e.code;body=e.read().decode()
  assert code==status,(action,code,body)
  value=json.loads(body)
  if 'csrf'in value:self.csrf=value['csrf']
  return value
 def login(self,login,password=PASSWORD):
  self.call('session');return self.call('login',{'login':login,'password':password})['user']
 def register(self,login,name):
  self.call('session');return self.call('register',{'login':login,'password':PASSWORD,'name':name})
admin=Client();admin.call('state',status=401)
key='test-setup-key-'*4
req=urllib.request.Request(BASE+'/install.php',data=urllib.parse.urlencode({'key':key,'login':'organizer','name':'Организатор','password':PASSWORD}).encode())
text=urllib.request.urlopen(req).read().decode();assert 'Кабинет организатора создан' in text,text
admin_code=re.search(r'<code id="recovery-code">([^<]+)</code>',text).group(1)
assert len(admin_code)==71
assert admin.login('organizer')['role']=='admin'
t=int(time.time()*1000)
c=admin.call('course_save',{'title':'Тестовый курс','description':'Проверка общей базы','code':'PRIVATE-GROUP','end':t+40*86400000})['id']
c2=admin.call('course_save',{'title':'Другая группа','description':'','code':'OTHER-GROUP','end':t+40*86400000})['id']
def lesson(title,start,end,cid=c):
 return admin.call('lesson_save',{'course':cid,'title':title,'start':start,'end':end,'teacher':'Тестовый преподаватель','address':'Аудитория','url':'','description':'Тест','homework':'Опишите свой шаг','cancelled':False})['id']
live=lesson('Текущая встреча',t-1800000,t+1800000)
after=lesson('После занятия',t-7200000,t-3600000)
expired=lesson('48 часов прошли',t-51*3600000,t-49*3600000)
foreign=lesson('Чужая встреча',t-1800000,t+1800000,c2)
a=Client();ar=a.register('student-a','Студент А');u=ar['user'];acode=ar['recovery_code']
b=Client();br=b.register('student-b','Студент Б');v=br['user']
assert ar['user']['role']=='student' and 'email' not in ar['user']
# Neither a reserved admin login nor a role in the request can escalate privileges.
b.call('register',{'login':'organizer','name':'Подмена','password':PASSWORD,'role':'admin'},status=422)
weak=Client();weak.call('session');weak.call('register',{'login':'weak-user','name':'Тест','password':'123456'},status=422)
a.call('course_save',{'title':'Обход прав'},status=403)
a.call('join',{'code':'PRIVATE-GROUP'},status=403,csrf=False)
a.call('join',{'code':'PRIVATE-GROUP'});b.call('join',{'code':'PRIVATE-GROUP'})
assert len(a.call('state')['courses'])==1
a.call('attendance',{'lesson':foreign,'format':'online'},status=403)
a.call('attendance',{'lesson':live,'format':'online'});a.call('attendance',{'lesson':live,'format':'online'})
a.call('attendance',{'lesson':after,'format':'online'},status=422)
feedback={'lesson':after,'takeaway':'Пауза перед ответом','impression':'','question':'Как закрепить?','liked':'','wishes':'','visibility':'private'}
a.call('feedback',{**feedback,'takeaway':'  '},status=422)
a.call('feedback',{**feedback,'lesson':live},status=422)
a.call('feedback',{**feedback,'lesson':expired},status=422)
a.call('feedback',feedback);a.call('feedback',feedback)
s=a.call('state');assert len(s['awards'])==1;fid=s['feedback'][0]['id']
assert not b.call('state')['feedback']
a.call('homework',{'lesson':after,'answer':'Мой личный ответ'});assert not b.call('state')['homework']
admin.call('check_homework',{'student':u['id'],'lesson':after,'done':True,'comment':'Выполнено'})
a.call('homework',{'lesson':after,'answer':'Обход блокировки'},status=422)
admin.call('reply',{'feedback':fid,'text':'Ответ организатора'});assert a.call('state')['notifications']
b.call('reply',{'feedback':fid,'text':'Чужое вмешательство'},status=403)
a.call('feedback',{**feedback,'visibility':'public'});assert len(b.call('state')['feedback'])==1
admin.call('admin_attendance',{'student':u['id'],'lesson':after,'format':'offline'})
assert a.call('state')['attendance'][after]=='offline'
admin.call('lesson_save',{'id':live,'course':c,'title':'Тест','start':t-1800000,'end':t+1800000,'teacher':'Тест','description':'','homework':'','image_data':'data:image/png;base64,PD9waHAgZWNobyAxOw=='},status=422)
# Permanent recovery changes password, rotates the code and invalidates ALL old sessions.
other=Client();other.login('student-a')
recovery=Client();recovery.call('session')
recovery.call('recover',{'login':'student-a','password':PASSWORD,'recovery_code':'wrong'},status=422)
newpass='New-password-only-5781'
result=recovery.call('recover',{'login':'student-a','password':newpass,'recovery_code':acode})
a.call('state',status=401);other.call('state',status=401)
recovery.call('recover',{'login':'student-a','password':PASSWORD,'recovery_code':acode},status=422)
a.call('login',{'login':'student-a','password':PASSWORD},status=401);a.login('student-a',newpass)
# Password changes require current password, preserve the recovery code and revoke other sessions.
other.login('student-a',newpass)
a.call('change_password',{'current_password':'wrong','password':PASSWORD},status=422)
a.call('change_password',{'current_password':newpass,'password':PASSWORD});other.call('state',status=401)
# Rotating a recovery code also requires the current password and does not leak it in state.
a.call('rotate_recovery',{'current_password':'wrong'},status=422)
rotated=a.call('rotate_recovery',{'current_password':PASSWORD})['recovery_code']
recovery.call('recover',{'login':'student-a','password':PASSWORD,'recovery_code':result['recovery_code']},status=422)
assert 'recovery_hash' not in json.dumps(a.call('state'))
# An organizer can issue a temporary code for STUDENTS, never for an administrator.
b.call('admin_reset',{'student':u['id'],'current_password':PASSWORD},status=403)
admin.call('admin_reset',{'student':u['id'],'current_password':'wrong'},status=422)
admin.call('admin_reset',{'student':admin.call('state')['profile']['id'],'current_password':PASSWORD},status=422)
temp=admin.call('admin_reset',{'student':u['id'],'current_password':PASSWORD})['reset_code']
temp2=admin.call('admin_reset',{'student':u['id'],'current_password':PASSWORD})['reset_code']
recovery.call('recover',{'login':'student-a','password':PASSWORD,'recovery_code':temp},status=422)
recovery.call('recover',{'login':'student-a','password':PASSWORD,'recovery_code':temp2})
recovery.call('recover',{'login':'student-a','password':PASSWORD,'recovery_code':temp2},status=422)
recovery.call('recover',{'login':'student-a','password':PASSWORD,'recovery_code':rotated},status=422)
# Recovery of the organizer uses the same private saved code, without student reset privileges.
owner=Client();owner.call('session');owner.call('recover',{'login':'organizer','password':PASSWORD,'recovery_code':admin_code})
admin.call('state',status=401);admin.login('organizer')
# Expired temporary codes do not reset a password.
expired_code=admin.call('admin_reset',{'student':v['id'],'current_password':PASSWORD})['reset_code']
subprocess.run(['docker','--host=unix:///var/run/docker.sock','exec','bridge-test-db','mysql','-uroot','bridge','-e',"UPDATE bridge_credentials SET reset_expires_at=0 WHERE login='student-b'"],check=True,capture_output=True)
recovery.call('recover',{'login':'student-b','password':PASSWORD,'recovery_code':expired_code},status=422)
# Host-only emergency recovery must not depend on mail or web-session access.
cli=subprocess.run(['docker','--host=unix:///var/run/docker.sock','exec','-i','bridge-test-web','php','/site/bridge-app/recover-admin.php'],input='organizer\n',text=True,capture_output=True,check=True)
emergency=re.search(r'[a-f0-9]{8}(?:-[a-f0-9]{8}){7}',cli.stdout).group(0)
owner.call('recover',{'login':'organizer','password':PASSWORD,'recovery_code':emergency})
admin.call('state',status=401)
# Stale sessions gracefully become anonymous on the initial session endpoint.
assert admin.call('session')['user'] is None
admin.login('organizer')
a.login('student-a');a.call('logout',{});a.call('state',status=401)
print('PASS: password registration/login, installer, roles, CSRF, course access, deadlines, privacy, homework, rewards, recovery rotation/single use, session revocation, password change, organizer-issued codes, admin recovery, logout')
