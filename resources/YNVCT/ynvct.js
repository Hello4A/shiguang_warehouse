/** 云南交通职业技术学院 qzh5 -> 拾光课程表 v3 */
const YNVCT={
  loginUrl:"https://qzh5.ynvct.com/bzb_njwhd/login",
  curriculumUrl:"https://qzh5.ynvct.com/bzb_njwhd/student/curriculum",
  kbjcmsid:"F144CF7B11C446FAA4F813BCE82A79E3"
};

function validateUserNo(v){return /^\d{6,20}$/.test(String(v||"").trim())?false:"请输入正确的学号";}
function validateEncryptedPwd(v){return String(v||"").trim()?false:"加密 pwd 不能为空";}
async function getCredentials(){
  const userNo=await shiguangBridgePromise.showPrompt("学号","请输入 qzh5 登录学号","","validateUserNo");
  if(userNo===null)return null;
  const encryptedPwd=await shiguangBridgePromise.showPrompt("加密 pwd","请输入抓包中 /bzb_njwhd/login 的 pwd 参数（不是明文密码）","","validateEncryptedPwd");
  if(encryptedPwd===null)return null;
  return {userNo:String(userNo).trim(),encryptedPwd:String(encryptedPwd).trim()};
}
async function loginQzh5(c){
  const body=new URLSearchParams({userNo:c.userNo,pwd:c.encryptedPwd,encode:"1",captchaData:"",codeVal:""});
  const r=await fetch(YNVCT.loginUrl,{method:"POST",headers:{Accept:"application/json, text/plain, */*","Content-Type":"application/x-www-form-urlencoded"},credentials:"include",body:body.toString()});
  if(!r.ok)throw new Error("登录接口 HTTP "+r.status);
  const j=await r.json();
  if(String(j.code)!=="1"||!j.data||!j.data.token)throw new Error(j.Msg||"qzh5 登录失败");
  return j.data.token;
}
async function fetchWeek(token,week){
  const u=YNVCT.curriculumUrl+"?week="+encodeURIComponent(week==null?"":week)+"&kbjcmsid="+encodeURIComponent(YNVCT.kbjcmsid);
  const r=await fetch(u,{method:"POST",headers:{Accept:"application/json, text/plain, */*",token},credentials:"include"});
  if(!r.ok)throw new Error("课程表接口 HTTP "+r.status);
  const j=await r.json();
  if(String(j.code)!=="1"||!Array.isArray(j.data)||!j.data[0])throw new Error(j.Msg||"课表获取失败");
  return j;
}
function data0(j){return j&&Array.isArray(j.data)?j.data[0]:null;}
function responseWeek(j,fallback){
  const d=data0(j),z=d&&Array.isArray(d.date)&&d.date[0]?Number(d.date[0].zc):NaN;
  return Number.isInteger(z)&&z>0?z:fallback;
}
function maxWeek(j){
  const d=data0(j),t=d&&Array.isArray(d.topInfo)?d.topInfo[0]:null,n=Number(t&&t.maxWeek);
  return Number.isInteger(n)&&n>0&&n<=60?n:20;
}
function parseSections(c){
  const a=(String(c.weekNoteDetail||c.classTime||"").match(/\d+/g)||[]).map(Number).map(n=>n>=100?n%100:n).filter(n=>n>=1&&n<=30).sort((a,b)=>a-b);
  return a.length?[a[0],a[a.length-1]]:null;
}
function normCourse(c,week){
  const s=parseSections(c),day=Number(c.weekDay);
  if(!s||!(day>=1&&day<=7)||!c.courseName)return null;
  const st=String(c.startTime||""),et=String(c.endTIme||c.endTime||""),custom=/^([01]\d|2[0-3]):[0-5]\d$/.test(st)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(et);
  return {name:String(c.courseName).trim(),teacher:String(c.teacherName||"").trim(),position:String(c.classroomName||c.location||"").trim(),day,startSection:s[0],endSection:s[1],weeks:[week],isCustomTime:custom,customStartTime:custom?st:null,customEndTime:custom?et:null};
}
function key(c){return [c.name,c.teacher,c.position,c.day,c.startSection,c.endSection,c.isCustomTime,c.customStartTime||"",c.customEndTime||""].join("\u001f");}
async function fetchSemester(token){
  const metadata=await fetchWeek(token,null),mw=maxWeek(metadata),m=new Map();
  shiguangBridge.showToast("正在获取整学期课表，共 "+mw+" 周…");
  for(let w=1;w<=mw;w++){
    const j=await fetchWeek(token,w),actual=responseWeek(j,w);
    if(actual!==w)throw new Error("请求第 "+w+" 周，但 date[0].zc 返回第 "+actual+" 周");
    const d=data0(j),arr=Array.isArray(d.courses)?d.courses:[];
    for(const raw of arr){
      const c=normCourse(raw,actual); if(!c)continue;
      const k=key(c),old=m.get(k);
      if(old)old.weeks=Array.from(new Set(old.weeks.concat(actual))).sort((a,b)=>a-b); else m.set(k,c);
    }
    if(w===1||w===mw||w%4===0)shiguangBridge.showToast("整学期课表读取中："+w+"/"+mw+" 周");
  }
  return {metadata,maxWeek:mw,courses:Array.from(m.values()).sort((a,b)=>a.day-b.day||a.startSection-b.startSection||a.name.localeCompare(b.name))};
}
function dateOnly(s){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s||""));return m?new Date(Date.UTC(+m[1],+m[2]-1,+m[3])):null;}
function fmt(d){return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0")+"-"+String(d.getUTCDate()).padStart(2,"0");}
function courseConfig(meta){
  const d=data0(meta),t=d&&Array.isArray(d.topInfo)?d.topInfo[0]:null;if(!t)return null;
  const cw=Number(t.week||d.week),mw=Number(t.maxWeek),today=dateOnly(t.today);if(!today||!Number.isInteger(cw)||cw<1)return null;
  const dow=today.getUTCDay(),monday=new Date(today.getTime()-(dow===0?6:dow-1)*86400000),start=new Date(monday.getTime()-(cw-1)*7*86400000);
  const out={semesterStartDate:fmt(start),firstDayOfWeek:1};if(Number.isInteger(mw)&&mw>0)out.semesterTotalWeeks=mw;return out;
}
async function saveSemester(s){
  if(!s.courses.length)throw new Error("没有解析到可导入的课程");
  const cfg=courseConfig(s.metadata);if(cfg)await shiguangBridgePromise.saveCourseConfig(JSON.stringify(cfg));
  if(await shiguangBridgePromise.saveImportedCourses(JSON.stringify(s.courses))!==true)throw new Error("拾光返回课程保存失败");
  return cfg;
}
async function runYNVCTImport(){
  try{
    const ok=await shiguangBridgePromise.showAlert("云南交通职业技术学院","将逐周读取 qzh5 整学期课程，避免漏课。\n\n当前需要输入抓包得到的加密 pwd。","开始导入");
    if(!ok)return;
    const c=await getCredentials();if(!c)return;
    shiguangBridge.showToast("正在登录 qzh5…");
    const token=await loginQzh5(c),semester=await fetchSemester(token),cfg=await saveSemester(semester);
    let auto=false;
    if(window.Qzh5SyncBridge&&typeof Qzh5SyncBridge.enableAutoSync==="function")auto=Qzh5SyncBridge.enableAutoSync(c.userNo,c.encryptedPwd,typeof window.currentTableId==="string"?window.currentTableId:"")===true;
    let msg="成功导入 "+semester.courses.length+" 个课程块，已覆盖 "+semester.maxWeek+" 周";
    if(cfg&&cfg.semesterStartDate)msg+="，开学日期 "+cfg.semesterStartDate;if(auto)msg+="，自动同步已开启";
    shiguangBridge.showToast(msg);shiguangBridge.notifyTaskCompletion();
  }catch(e){console.error("[YNVCT]",e);shiguangBridge.showToast("导入失败："+(e&&e.message?e.message:String(e)));}
}
runYNVCTImport();