"""Only disposable localhost fixtures; run after integration.py."""
from pathlib import Path
exec(Path(__file__).with_name('feedback-telegram.py').read_text().split('a=Client();admin=')[0])
a=Client();a.login('organizer')
p=Client();p.login('notice-student')
b=Client();b.login('student-b')
t=int(time.time()*1000)
c=a.call('course_save',{'title':'Проверка сроков','code':'DEADLINES-TEST','end':t+86400000})['id']
p.call('join',{'code':'DEADLINES-TEST'})
def lesson(title,start,end,cancelled=False):
 return a.call('lesson_save',{'course':c,'title':title,'start':start,'end':end,'teacher':'Тест','homework':'Личный ответ','cancelled':cancelled})['id']
l=lesson('Давнее занятие',t-10*86400000,t-9*86400000)
future=lesson('Будущее занятие',t-1000,t+3600000)
cancelled=lesson('Отменено',t-4*86400000,t-3*86400000,True)
f={'lesson':l,'takeaway':'Отзыв спустя девять дней','visibility':'private'}
p.call('feedback',f);p.call('homework',{'lesson':l,'answer':'Поздняя домашка'})
state=p.call('state');fid=next(x['id']for x in state['feedback']if x['lesson_id']==l)
award_count=len(state['awards']);p.call('feedback',{**f,'takeaway':'Правка позднего отзыва'})
assert len(p.call('state')['awards'])==award_count
p.call('feedback',{**f,'lesson':future},status=422)
p.call('feedback',{**f,'lesson':cancelled},status=422)
p.call('homework',{'lesson':cancelled,'answer':'Нет'},status=422)
b.call('read_feedback_notices',{'feedback':fid},status=403)
a.call('reply',{'feedback':fid,'text':'Ответ по позднему отзыву'})
s=p.call('state');notice=next(n for n in s['notifications']if n.get('feedback_id')==fid)
assert not notice['is_read'] and s['unread_count']>0
before=s['unread_count'];p.call('read_feedback_notices',{'feedback':fid});assert p.call('state')['unread_count']==before-1
# Remove the future lesson in this disposable course so its end can be set in the past.
a.call('lesson_save',{'id':future,'course':c,'title':'Завершённое занятие','start':t-7200000,'end':t-3600000,'teacher':'Тест','homework':'Личный ответ'})
a.call('course_save',{'id':c,'title':'Проверка сроков','code':'DEADLINES-TEST','end':t-1000})
p.call('feedback',f,status=422);p.call('homework',{'lesson':l,'answer':'После завершения'},status=422)
s=p.call('state');assert any(r['text']=='Ответ по позднему отзыву'for x in s['feedback']if x['id']==fid for r in x['replies'])
assert s['homework'][l]['text']=='Поздняя домашка'
# Restore open course and an unread answer for the browser student check.
a.call('course_save',{'id':c,'title':'Проверка сроков','code':'DEADLINES-TEST','end':t+86400000})
a.call('reply',{'feedback':fid,'text':'Ответ для проверки студентом'})
print('PASS: late feedback/homework, edit without extra award, future/cancelled protection, course closure, retained data, student linked unread and targeted read, privacy')
