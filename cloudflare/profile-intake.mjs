import { cleanIntakeChanges } from '../src/utils/profileIntakePolicy.js';
import { decideIntakeFields, intakeResolvedStatus } from '../src/utils/profileIntakeReview.js';
const identityUrl='https://phocaptmt.netlify.app/.netlify/functions/profile-intake-identity';
const fail=(ok,status,message)=>{if(!ok)throw Object.assign(new Error(message),{status});};
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const rowView=row=>({id:row.id,schoolCode:row.school_code,schoolYear:row.school_year,grade:String(row.grade),accessCode:row.access_code,
  studentName:row.student_name,className:row.class_name,changes:JSON.parse(row.changes_json),status:row.status,
  createdAt:row.created_at,updatedAt:row.updated_at,payloadHash:row.payload_hash,storage:'cloudflare-d1',syncStatus:row.status==='synced'?'synced':'waiting',
  review:{version:row.review_version || 0,decisions:JSON.parse(row.decisions_json || '{}'),appliedFields:JSON.parse(row.applied_json || '[]'),updatedAt:row.reviewed_at || 0}});
const selectRows='SELECT p.*,r.version AS review_version,r.decisions_json,r.applied_json,r.updated_at AS reviewed_at FROM profile_intake p LEFT JOIN profile_intake_reviews r ON r.request_id=p.id';
const studentView=row=>{const view=rowView(row);view.changes=Object.fromEntries(Object.entries(view.changes).filter(([key])=>view.review.decisions[key]!=='reject' && !view.review.appliedFields.includes(key)));return view;};
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
    fail(payload && typeof payload==='object' && !Array.isArray(payload) && ['check','mine','submit','list','review','applied'].includes(payload.action),400,'Thao tác không hợp lệ.');
    const actor=await authenticate(payload,['list','review','applied'].includes(payload.action),fetchImpl);
    fail(env.PROFILE_INTAKE,503,'Nơi tiếp nhận hồ sơ chưa sẵn sàng. Nội dung đang nhập được giữ lại; hãy thử lại sau.');
    const db=env.PROFILE_INTAKE;
    if(['review','applied'].includes(payload.action)){
      fail(typeof payload.id==='string' && /^intake-[\w-]+$/.test(payload.id),400,'Mã yêu cầu không hợp lệ.');
      const stored=await db.prepare(`${selectRows} WHERE p.id=?`).bind(payload.id).first();fail(stored,404,'Không tìm thấy yêu cầu.');
      fail(stored.payload_hash===payload.expectedHash,409,'Nội dung yêu cầu đã thay đổi. Tải lại để đối chiếu.');
      const row=rowView(stored),review=row.review;
      let next,keys;
      if(payload.action==='review'){
        fail(row.status==='pending' && payload.expectedVersion===review.version,409,'Yêu cầu vừa được người khác xử lý. Tải lại danh sách.');
        try{next=decideIntakeFields(row,payload.decision,payload.field);keys=next.fields;}catch(error){throw Object.assign(error,{status:409});}
      }else{
        keys=payload.fields;
        fail(Array.isArray(keys) && keys.length>0 && keys.length<=50 && keys.every(key=>review.decisions[key]==='approve'),400,'Chỉ xác nhận những mục đã được quản trị viên đồng ý.');
        next={...review,appliedFields:[...new Set([...review.appliedFields,...keys])]};
      }
      const stamp=now(),operation=crypto.randomUUID(),version=review.version+1,status=intakeResolvedStatus(row,next);
      await db.prepare('INSERT OR IGNORE INTO profile_intake_reviews (request_id) VALUES (?)').bind(row.id).run();
      const results=await db.batch([
        db.prepare('UPDATE profile_intake_reviews SET version=?,decisions_json=?,applied_json=?,updated_at=?,last_operation=? WHERE request_id=? AND version=?')
          .bind(version,JSON.stringify(next.decisions),JSON.stringify(next.appliedFields),stamp,operation,row.id,review.version),
        db.prepare('UPDATE profile_intake SET status=?,updated_at=? WHERE id=? AND EXISTS (SELECT 1 FROM profile_intake_reviews WHERE request_id=? AND last_operation=?)').bind(status,stamp,row.id,row.id,operation),
        db.prepare('INSERT INTO profile_intake_review_events (id,request_id,version,action,fields_json,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM profile_intake_reviews WHERE request_id=? AND last_operation=?)')
          .bind(operation,row.id,version,payload.action==='review'?payload.decision:'applied',JSON.stringify(keys),stamp,row.id,operation)
      ]);
      fail(results[0]?.meta?.changes===1,409,'Yêu cầu vừa thay đổi. Quyết định hiện có được giữ nguyên; hãy tải lại.');
      return reply(200,{request:rowView(await db.prepare(`${selectRows} WHERE p.id=?`).bind(row.id).first())});
    }
    if(payload.action==='list'){
      fail(/^20\d{2}-20\d{2}$/.test(payload.schoolYear || ''),400,'Chọn năm học cần xem.');
      const level=payload.level==='primary'?' AND grade BETWEEN 1 AND 5':payload.level==='thcs'?' AND grade BETWEEN 6 AND 9':'';
      const cursor=payload.cursor || 0;fail(Number.isSafeInteger(cursor) && cursor>=0 && cursor<=100000,400,'Trang không hợp lệ.');
      const filter=`school_year=? AND status='pending'${level}`;
      const [items,count]=await Promise.all([db.prepare(`${selectRows} WHERE p.${filter} ORDER BY p.created_at DESC,p.id DESC LIMIT 100 OFFSET ?`).bind(payload.schoolYear,cursor).all(),
        db.prepare(`SELECT COUNT(*) AS count FROM profile_intake WHERE ${filter}`).bind(payload.schoolYear).first()]);
      return reply(200,{requests:(items.results || []).map(rowView),total:count.count,nextCursor:cursor+100<count.count?cursor+100:null});
    }
    const owner=await hash(JSON.stringify([actor.schoolCode,actor.schoolYear,actor.accessCode]));
    const pending=()=>db.prepare(`${selectRows} WHERE p.owner_key=? AND p.status='pending'`).bind(owner).first();
    if(payload.action!=='submit'){
      const row=await pending();return reply(200,{requests:row?[studentView(row)]:[]});
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
