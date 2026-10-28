import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleProfileIntake } from '../cloudflare/profile-intake.mjs';
const scope={role:'student',accessCode:'HS26601',studentName:'Học sinh mẫu',schoolCode:'NAN',schoolYear:'2026-2027',className:'6A',expiresAt:Date.now()+600000};
function setup(){
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../cloudflare/profile-intake.sql',import.meta.url),'utf8'));
  const env={PROFILE_INTAKE:{prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args) || null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:db.prepare(sql).run(...args)};}};}};},async batch(statements){db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}}};
  const call=async(payload,actor=scope,opts={})=>{
    const response=await handleProfileIntake(new Request('https://site.test/.site/profile-intake',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://site.test',...opts.headers},body:JSON.stringify(payload)}),env,
      {fetchImpl:async(url,options)=>{assert.equal(url,'https://phocaptmt.netlify.app/.netlify/functions/profile-intake-identity');assert.equal(JSON.parse(options.body).kind,['list','review','applied'].includes(payload.action)?'admin':'student');return actor?Response.json({identity:actor}):Response.json({error:'expired'},{status:401});}});
    return {response,body:await response.json()};
  };
  return {db,env,call};
}
test('D1 receives profile changes with server identity, returns the durable pending request and ignores forged student IDs',async()=>{
  const {call,db}=setup();try{
    const {response,body}=await call({action:'submit',changes:{phone:'0123456789'},studentId:'another-student',accessCode:'HS99999',studentName:'forged'});
    assert.equal(response.status,200);assert.match(body.id,/^intake-/);assert.equal(body.storage,'cloudflare-d1');assert.match(response.headers.get('cache-control'),/no-store/);
    const mine=await call({action:'mine'});assert.equal(mine.body.requests.length,1);assert.equal(mine.body.requests[0].accessCode,'HS26601');assert.equal(mine.body.requests[0].studentName,scope.studentName);assert.equal(mine.body.requests[0].studentId,undefined);
    const other=await call({action:'mine'},{...scope,accessCode:'HS26602'});assert.deepEqual(other.body.requests,[]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM profile_intake').get().n,1);
  }finally{db.close();}
});

const admin={role:'admin',expiresAt:Date.now()+600000};
const reviewPayload=(row,extra={})=>({action:'review',id:row.id,expectedHash:row.payloadHash,expectedVersion:row.review.version,decision:'approve',...extra});
async function firstRequest(call){return (await call({action:'list',schoolYear:scope.schoolYear},admin)).body.requests[0];}
test('intake never approves itself; explicit admin decisions survive until confirmed official save',async()=>{
  const {call,db}=setup();try{
    await call({action:'submit',changes:{phone:'456',address:'new'}});
    const row=await firstRequest(call);assert.deepEqual(row.review.decisions,{});assert.equal(row.status,'pending');
    assert.equal((await call(reviewPayload(row))).response.status,401);
    const reviewed=await call(reviewPayload(row,{field:'phone'}),admin);
    assert.equal(reviewed.response.status,200);const staged=reviewed.body.request;
    assert.deepEqual(staged.review.decisions,{phone:'approve'});assert.deepEqual(staged.review.appliedFields,[]);assert.equal(staged.status,'pending');
    assert.equal((await call({action:'submit',changes:{phone:'789'}})).response.status,409);
    assert.equal((await call(reviewPayload(row),admin)).response.status,409);
    assert.equal((await call(reviewPayload(staged,{field:'phone',decision:'reject'}),admin)).response.status,409);
    assert.equal((await call({...reviewPayload(staged),expectedHash:'wrong'},admin)).response.status,409);
    const applied={action:'applied',id:row.id,expectedHash:row.payloadHash,fields:['phone']};
    assert.equal((await call(applied)).response.status,401);
    assert.equal((await call({...applied,fields:['address']},admin)).response.status,400);
    const acknowledged=(await call(applied,admin)).body.request;assert.deepEqual(acknowledged.review.appliedFields,['phone']);assert.equal(acknowledged.status,'pending');
    assert.deepEqual((await call({action:'mine'})).body.requests[0].changes,{address:'new'});
    const rejected=(await call(reviewPayload(acknowledged,{decision:'reject'}),admin)).body.request;
    assert.equal(rejected.status,'synced');assert.deepEqual(rejected.changes,row.changes);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM profile_intake_review_events').get().n,3);
    assert.equal((await call({action:'submit',changes:{phone:'789'}})).response.status,200);
  }finally{db.close();}
});
test('address parents must be approved first and rejection cascades to pending children',async()=>{
  const {call,db}=setup();try{
    await call({action:'submit',changes:{birthProvince:'P',birthDistrict:'D',birthWard:'W'}});
    const row=await firstRequest(call);
    assert.equal((await call(reviewPayload(row,{field:'birthWard'}),admin)).response.status,409);
    const rejected=await call(reviewPayload(row,{field:'birthProvince',decision:'reject'}),admin);
    assert.equal(rejected.response.status,200);assert.equal(rejected.body.request.status,'rejected');
    assert.deepEqual(rejected.body.request.review.decisions,{birthDistrict:'reject',birthProvince:'reject',birthWard:'reject'});
    assert.deepEqual((await call({action:'mine'})).body.requests,[]);
  }finally{db.close();}
});
test('simultaneous sends and lost-response retries keep one pending request; a different draft cannot overwrite it',async()=>{
  const {call,db}=setup();try{
    const results=await Promise.all([call({action:'submit',changes:{phone:'123'}}),call({action:'submit',changes:{phone:'123'}})]);
    assert.ok(results.every(r=>r.response.status===200));assert.equal(results[0].body.id,results[1].body.id);
    assert.equal((await call({action:'submit',changes:{phone:'456'}})).response.status,409);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM profile_intake').get().n,1);assert.equal(JSON.parse(db.prepare('SELECT changes_json FROM profile_intake').get().changes_json).phone,'123');
  }finally{db.close();}
});
test('only authenticated admin can list; school-year and level filters do not expose other scopes',async()=>{
  const {call,db}=setup();try{
    await call({action:'submit',changes:{phone:'1'}});await call({action:'submit',changes:{phone:'2'}},{...scope,accessCode:'HS26602',className:'3A'});
    const admin={role:'admin',expiresAt:Date.now()+600000};
    const list=await call({action:'list',schoolYear:scope.schoolYear,level:'thcs'},admin);assert.equal(list.body.total,1);assert.equal(list.body.requests[0].accessCode,scope.accessCode);
    assert.equal((await call({action:'list',schoolYear:'2025-2026'},admin)).body.total,0);
    assert.equal((await call({action:'list',schoolYear:scope.schoolYear})).response.status,401);
    assert.equal((await call({action:'list',schoolYear:scope.schoolYear,cursor:-1},admin)).response.status,400);
  }finally{db.close();}
});
test('invalid credentials, cross-origin requests and forbidden profile fields cannot insert rows',async()=>{
  const {call,db}=setup();try{
    assert.equal((await call({action:'submit',changes:{phone:'1'}},null)).response.status,401);
    for(const changes of [{role:'admin'},{accessCode:'HS99999'},{schoolYear:'2025-2026'},{className:'9A'},{phone:42},{phone:'x'.repeat(2001)},{}])assert.equal((await call({action:'submit',changes})).response.status,400);
    assert.equal((await call({action:'mine'},scope,{headers:{Origin:'https://other.test'}})).response.status,403);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM profile_intake').get().n,0);
  }finally{db.close();}
});
