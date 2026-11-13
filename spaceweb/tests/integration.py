"""Integration checks against disposable PHP 8.4/MySQL 8.4, never production.
Run with BRIDGE_TEST_URL and BRIDGE_TEST_MAILBOX pointing to local test fixtures.
The private PHP configuration must explicitly use environment=test.
"""
import os,json,time,urllib.request,urllib.error,http.cookiejar,urllib.parse
BASE=os.environ.get('BRIDGE_TEST_URL','http://127.0.0.1:8890')
MAILBOX=os.environ.get('BRIDGE_TEST_MAILBOX','/tmp/bridge-runtime/mailbox.jsonl')
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
 def login(self,email,name):
  self.call('session');r=self.call('request_code',{'email':email,'name':name})
  messages=[json.loads(line)for line in open(MAILBOX)];code=next(x['code']for x in reversed(messages)if x['email']==email)
  result=self.call('verify_code',{'request_id':r['request_id'],'code':code})
  self.call('verify_code',{'request_id':r['request_id'],'code':code},status=422)
  return result['user']
admin=Client()
admin.call('state',status=401)
key='test-setup-key-'*4
req=urllib.request.Request(BASE+'/install.php',data=urllib.parse.urlencode({'key':key}).encode())
text=urllib.request.urlopen(req).read().decode();assert 'Таблицы созданы' in text,text
au=admin.login('organizer@example.test','Организатор')
assert au['role']=='admin'
t=int(time.time()*1000)
c=admin.call('course_save',{'title':'Тестовый курс','description':'Проверка общей базы','code':'PRIVATE-GROUP','end':t+40*86400000})['id']
c2=admin.call('course_save',{'title':'Закрытая другая группа','description':'','code':'OTHER-GROUP','end':t+40*86400000})['id']
def lesson(title,start,end,cid=c):
 return admin.call('lesson_save',{'course':cid,'title':title,'start':start,'end':end,'teacher':'Тестовый преподаватель','address':'Аудитория','url':'','description':'Тест','homework':'Опишите свой шаг','cancelled':False})['id']
live=lesson('Текущая встреча',t-1800000,t+1800000)
after=lesson('После занятия',t-7200000,t-3600000)
expired=lesson('48 часов прошли',t-51*3600000,t-49*3600000)
foreign=lesson('Чужая встреча',t-1800000,t+1800000,c2)
a=Client();u=a.login('student-a@example.test','Студент А')
b=Client();v=b.login('student-b@example.test','Студент Б')
a.call('course_save',{'title':'Обход прав'},status=403)
a.call('join',{'code':'PRIVATE-GROUP'},status=403,csrf=False)
a.call('join',{'code':'WRONG'},status=422)
a.call('join',{'code':'PRIVATE-GROUP'});b.call('join',{'code':'PRIVATE-GROUP'})
assert len(a.call('state')['courses'])==1
for lid in [foreign]:a.call('attendance',{'lesson':lid,'format':'online'},status=403)
a.call('attendance',{'lesson':live,'format':'online'});a.call('attendance',{'lesson':live,'format':'online'})
assert a.call('state')['attendance'][live]=='online'
a.call('attendance',{'lesson':after,'format':'online'},status=422)
feedback={'lesson':after,'takeaway':'Пауза перед ответом','impression':'','question':'Как закрепить?','liked':'','wishes':'','visibility':'private'}
a.call('feedback',{**feedback,'takeaway':'  '},status=422)
a.call('feedback',{**feedback,'lesson':live},status=422)
a.call('feedback',{**feedback,'lesson':expired},status=422)
a.call('feedback',feedback);a.call('feedback',feedback)
s=a.call('state');assert len(s['awards'])==1
fid=s['feedback'][0]['id']
assert not b.call('state')['feedback']
a.call('homework',{'lesson':after,'answer':'Мой личный ответ'})
assert not b.call('state')['homework']
admin.call('check_homework',{'student':u['id'],'lesson':after,'done':True,'comment':'Выполнено'})
a.call('homework',{'lesson':after,'answer':'Обход блокировки'},status=422)
admin.call('reply',{'feedback':fid,'text':'Ответ организатора'})
assert a.call('state')['notifications']
b.call('reply',{'feedback':fid,'text':'Чужое вмешательство'},status=403)
a.call('feedback',{**feedback,'visibility':'public'})
public=b.call('state')['feedback'];assert len(public)==1 and public[0]['takeaway']=='Пауза перед ответом'
assert 'email' not in public[0]
b.call('reply',{'feedback':fid,'text':'Вмешательство в публичную переписку'},status=403)
admin.call('admin_attendance',{'student':u['id'],'lesson':after,'format':'offline'})
assert a.call('state')['attendance'][after]=='offline'
a.call('admin_attendance',{'student':u['id'],'lesson':after,'format':'online'},status=403)
a.call('read_notifications',{});assert all(int(n['is_read'])for n in a.call('state')['notifications'])
# Upload validation must reject executable content.
admin.call('lesson_save',{'id':live,'course':c,'title':'Тест','start':t-1800000,'end':t+1800000,'teacher':'Тест','description':'','homework':'','image_data':'data:image/png;base64,PD9waHAgZWNobyAxOw=='},status=422)
a.call('logout',{});a.call('state',status=401)
print('PASS: installer, OTP single use, roles, CSRF, course access, timed attendance, 48h feedback, privacy, public feedback, homework lock, notifications, replies, reward idempotence, image validation, logout')
# Credentials remain in disposable private fixtures, never repository artifacts.
