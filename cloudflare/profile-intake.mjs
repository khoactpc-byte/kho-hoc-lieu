import { cleanIntakeChanges } from '../src/utils/profileIntakePolicy.js';
const identityUrl='https://phocaptmt.netlify.app/.netlify/functions/profile-intake-identity';
const fail=(ok,status,message)=>{if(!ok)throw Object.assign(new Error(message),{status});};
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const rowView=row=>({id:row.id,schoolCode:row.school_code,schoolYear:row.school_year,grade:String(row.grade),accessCode:row.access_code,
  studentName:row.student_name,className:row.class_name,changes:JSON.parse(row.changes_json),status:row.status,
  createdAt:row.created_at,updatedAt:row.updated_at,storage:'cloudflare-d1',syncStatus:'waiting'});
async function authenticate(payload,admin,fetchImpl){
  const response=await fetchImpl(identityUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:admin?'admin':'student',
    adminSessionToken:payload.adminSessionToken || '',staffSessionToken:payload.staffSessionToken || '',studentSessionToken:payload.studentSessionToken || ''}),signal:AbortSignal.timeout(22000)});
  let result;try{result=await response.json();}catch{throw Object.assign(new Error('Máy chủ xác thực chưa phản hồi đúng.'),{status:502});}
  fail(response.ok,[401,403].includes(response.status)?response.status:503,result.error || 'Chưa xác thực được tài khoản.');
  const actor=result.identity;
  fail(actor?.role===(admin?'admin':'student') && actor.expiresAt>Date.now(),401,'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
  if(!admin)fail(/^HS\d{3,15}$/.test(actor.accessCode || '') && ['NAN','TQK'].includes(actor.schoolCode) && /^20\d{2}-20\d{2}$/.test(actor.schoolYear || '') && /^[1-9]/.test(actor.className || ''),401,'Phiên học sinh chưa có đủ phạm vi hồ sơ.');
  return actor;
}
export async function handleProfileIntake(request,env,{fetchImpl=fetch,now=Date.now}={}){
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  try{
    const url=new URL(request.url);
    fail(!url.search,404,'Không tìm thấy.');
    fail(request.method==='POST',405,'Chỉ nhận POST.');
    const origin=request.headers.get('origin');fail(!origin || origin===url.origin,403,'Yêu cầu không cùng địa chỉ web.');
    fail(/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || ''),415,'Chỉ nhận dữ liệu JSON.');
    const reader=request.body?.getReader();let size=0;const parts=[];
    if(reader){try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>32000){await reader.cancel();throw Object.assign(new Error('Yêu cầu quá lớn.'),{status:413});}parts.push(value);}}finally{reader.releaseLock();}}
    const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}
    let payload;try{payload=JSON.parse(new TextDecoder().decode(bytes) || '{}');}catch{return reply(400,{error:'JSON không hợp lệ.'});}
    fail(payload && typeof payload==='object' && !Array.isArray(payload) && ['check','mine','submit','list'].includes(payload.action),400,'Thao tác không hợp lệ.');
    const actor=await authenticate(payload,payload.action==='list',fetchImpl);
    fail(env.PROFILE_INTAKE,503,'Nơi tiếp nhận hồ sơ chưa sẵn sàng. Nội dung đang nhập được giữ lại; hãy thử lại sau.');
    const db=env.PROFILE_INTAKE;
    if(payload.action==='list'){
      fail(/^20\d{2}-20\d{2}$/.test(payload.schoolYear || ''),400,'Chọn năm học cần xem.');
      const level=payload.level==='primary'?' AND grade BETWEEN 1 AND 5':payload.level==='thcs'?' AND grade BETWEEN 6 AND 9':'';
      const cursor=payload.cursor || 0;fail(Number.isSafeInteger(cursor) && cursor>=0 && cursor<=100000,400,'Trang không hợp lệ.');
      const filter=`school_year=? AND status='pending'${level}`;
      const [items,count]=await Promise.all([db.prepare(`SELECT * FROM profile_intake WHERE ${filter} ORDER BY created_at DESC,id DESC LIMIT 100 OFFSET ?`).bind(payload.schoolYear,cursor).all(),
        db.prepare(`SELECT COUNT(*) AS count FROM profile_intake WHERE ${filter}`).bind(payload.schoolYear).first()]);
      return reply(200,{requests:(items.results || []).map(rowView),total:count.count,nextCursor:cursor+100<count.count?cursor+100:null});
    }
    const owner=await hash(JSON.stringify([actor.schoolCode,actor.schoolYear,actor.accessCode]));
    const pending=()=>db.prepare("SELECT * FROM profile_intake WHERE owner_key=? AND status='pending'").bind(owner).first();
    if(payload.action!=='submit'){
      const row=await pending();return reply(200,{requests:row?[rowView(row)]:[]});
    }
    let changes;try{changes=cleanIntakeChanges(payload.changes);}catch(error){return reply(400,{error:error.message});}
    const payloadHash=await hash(JSON.stringify(changes)),stamp=now();
    // Unique partial index makes concurrent requests from two phones atomic.
    await db.prepare("INSERT OR IGNORE INTO profile_intake (id,owner_key,school_code,school_year,grade,access_code,student_name,class_name,changes_json,payload_hash,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'pending',?,?)")
      .bind(`intake-${crypto.randomUUID()}`,owner,actor.schoolCode,actor.schoolYear,Number(actor.className.match(/^\d+/)[0]),actor.accessCode,actor.studentName || '',actor.className,JSON.stringify(changes),payloadHash,stamp,stamp).run();
    const saved=await pending();fail(saved,503,'Chưa xác nhận được hồ sơ đã lưu. Giữ trang mở và thử gửi lại.');
    fail(saved.payload_hash===payloadHash,409,'Em đã có yêu cầu chờ xử lý trên Cloudflare. Vui lòng chờ quản trị viên kiểm tra trước khi gửi thay đổi khác.');
    return reply(200,{id:saved.id,status:'pending',storage:'cloudflare-d1',createdAt:saved.created_at});
  }catch(error){return reply(error.status || 503,{error:error.status?error.message:'Chưa kết nối được nơi tiếp nhận hồ sơ. Nội dung đang nhập vẫn được giữ; hãy thử lại.'});}
}
