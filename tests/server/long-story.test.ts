import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync,statSync,utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {createHash,randomInt} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {JobService,GenerationError} from '../../server/jobs.ts';
import {SyntheticProvider} from '../../server/synthetic.ts';
import {EcnuProvider} from '../../server/ecnu.ts';
import {createApp} from '../../server/app.ts';
import {AuthService} from '../../server/auth.ts';
import {ShareService} from '../../server/share.ts';
import {CandidateError,freshReviewInput,validateStory,validateCanonicalStory,projectStory,storySchemaFor,type GenerationInput,type StoryWire,type LongStoryCandidate} from '../../server/generation.ts';
import type {JobResponse,ShareResponse,PublicShareResponse} from '../../shared/contracts.ts';

const owner='e'.repeat(32),signal=new AbortController().signal;
const request=(id:string)=>({concept:'反馈',format:'text' as const,storyLength:'long' as const,clientRequestId:id});
const directory=()=>mkdtempSync(join(tmpdir(),'studio-long-'));
function cleanup(dir:string){const target=resolve(dir);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&basename(target).startsWith('studio-long-'));rmSync(target,{recursive:true,force:true});}
async function listenForFetch(app:ReturnType<typeof createApp>){
 // Keep the public suite outside WHATWG-fetch forbidden dynamic ports on Windows.
 for(let attempt=0;attempt<20;attempt++){const server=app.listen(randomInt(20000,60000),'127.0.0.1');const error=await new Promise<Error|undefined>(done=>{server.once('listening',()=>done(undefined));server.once('error',done);});if(!error)return server;if((error as NodeJS.ErrnoException).code!=='EADDRINUSE')throw error;}
 throw new Error('No fetch-compatible local test port was allocated');
}
async function until(fn:()=>boolean){for(let i=0;i<400;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail('synthetic condition timed out');}
async function completed(service:JobService,id:string,jobOwner=owner){await until(()=>['completed','failed'].includes(service.get(jobOwner,id)!.status));const job=service.get(jobOwner,id)!;assert.equal(job.status,'completed',job.error?.code);return job;}
async function storyFixture(length:'standard'|'long'='long'){const p=new SyntheticProvider(),input:GenerationInput={concept:'反馈',knowledge:null,stories:[],storyCount:1,storyLength:length,storyIndex:0};input.knowledge=await p.knowledge(input,signal);const candidate=await p.story(input,signal);return {input,wire:validateStory(candidate,input),raw:candidate as LongStoryCandidate};}
function repage(wire:StoryWire,count:number){const copy=structuredClone(wire);copy.pages=Array.from({length:count},(_,i)=>({title:'场景'+(i+1),paragraphIds:copy.paragraphs.slice(Math.floor(i*copy.paragraphs.length/count),Math.floor((i+1)*copy.paragraphs.length/count)).map(p=>p.id),imagePrompt:'',activeCharacters:[copy.characters[0].name]}));return copy;}
function proseLength(wire:StoryWire){return wire.paragraphs.map(p=>p.text).join('\n\n').length;}
function rawFromCanonical(wire:StoryWire):LongStoryCandidate{const {paragraphs,pages,...meta}=wire;return {...meta,scenes:pages.map(page=>({title:page.title,paragraphs:page.paragraphIds.map(id=>paragraphs.find(p=>p.id===id)!.text)}))};}
function rawLength(raw:LongStoryCandidate){return raw.scenes.flatMap(s=>s.paragraphs).join('\n\n').length;}
function rescene(raw:LongStoryCandidate,count:number){const copy=structuredClone(raw),paragraphs=copy.scenes.flatMap(s=>s.paragraphs);while(paragraphs.length<count*2){const index=paragraphs.reduce((best,p,i)=>p.length>paragraphs[best].length?i:best,0),text=paragraphs[index],middle=Math.floor(text.length/2);paragraphs.splice(index,1,text.slice(0,middle),text.slice(middle));}copy.scenes=Array.from({length:count},(_,i)=>({title:'场景'+(i+1),paragraphs:paragraphs.slice(Math.floor(i*paragraphs.length/count),Math.floor((i+1)*paragraphs.length/count))}));return copy;}
function exactLength(raw:LongStoryCandidate,length:number){const copy=structuredClone(raw),paragraphs=copy.scenes.flatMap(s=>s.paragraphs),available=length-(paragraphs.length-1)*2;let i=0;for(const scene of copy.scenes)scene.paragraphs=scene.paragraphs.map(text=>{const count=Math.floor(available/paragraphs.length)+(i++<available%paragraphs.length?1:0);return (text+'，这是合成字数边界资料。'.repeat(100)).slice(0,count);});assert.equal(rawLength(copy),length);return copy;}
function repeatedReferenceFailure(raw:LongStoryCandidate,input:GenerationInput){const eight=structuredClone(raw);eight.scenes=eight.scenes.slice(0,8);const repair=exactLength(eight,3444),canonical=validateStory(repair,input),broken=structuredClone(canonical);broken.pages=[...Array.from({length:5},(_,i)=>({title:'原有效场景'+i,paragraphIds:canonical.paragraphs.slice(i*3,i===4?16:(i+1)*3).map(p=>p.id),imagePrompt:'',activeCharacters:[]})),...Array.from({length:11},(_,i)=>({title:'重复引用'+i,paragraphIds:canonical.paragraphs.map(p=>p.id),imagePrompt:'',activeCharacters:[]}))];return {repair,canonical,broken};}

test('raw long scenes accept 8/16, reject 6/7/17 and normalize one prose source into complete ordered IDs',async()=>{
 const {input,wire,raw}=await storyFixture();assert.ok(proseLength(wire)>=3200&&proseLength(wire)<=5600);assert.equal(new Set(wire.paragraphs.map(p=>p.text)).size,wire.paragraphs.length);assert.match(wire.title,/合成/);assert.equal('paragraphs' in raw,false);assert.equal('pages' in raw,false);
 for(const count of [8,16]){const candidate=rescene(raw,count),value=validateStory(candidate,input);assert.equal(value.pages.length,count);assert.deepEqual(value.paragraphs.map(p=>p.text),candidate.scenes.flatMap(s=>s.paragraphs));assert.deepEqual(value.paragraphs.map(p=>p.id),value.pages.flatMap(p=>p.paragraphIds));assert.equal(new Set(value.pages.flatMap(p=>p.paragraphIds)).size,value.paragraphs.length);assert.ok(value.pages.every(p=>p.paragraphIds.length>=2&&p.paragraphIds.length<=4&&p.imagePrompt===''&&p.activeCharacters.length===0));assert.equal('text' in value,false);assert.ok(value.pages.every(p=>!('text' in p)));assert.deepEqual(validateStory(candidate,input),value);}
 for(const count of [6,7,17])assert.throws(()=>validateStory(rescene(raw,count),input),CandidateError);
 for(const count of [0,1,5]){const wrong=structuredClone(raw);wrong.scenes[0].paragraphs=Array.from({length:count},()=>raw.scenes[0].paragraphs[0]);assert.throws(()=>validateStory(wrong,input),CandidateError);}
 const repeated=repage(wire,8);repeated.pages[1].paragraphIds[0]=repeated.pages[0].paragraphIds[0];assert.throws(()=>validateCanonicalStory(repeated,input),CandidateError);
 const empty=repage(wire,8);empty.pages[0].paragraphIds=[];assert.throws(()=>validateCanonicalStory(empty,input),CandidateError);
 const reversed=repage(wire,8);reversed.pages.reverse();assert.throws(()=>validateCanonicalStory(reversed,input),CandidateError);
});

test('long hard prose bounds reject a short story divided into more pages; standard limits remain intact',async()=>{
 const {input,wire,raw}=await storyFixture();for(const length of [2400,8000])assert.equal(proseLength(validateStory(exactLength(raw,length),input)),length);
 for(const length of [2399,8001])assert.throws(()=>validateStory(exactLength(raw,length),input),CandidateError);
 const standard=await storyFixture('standard');assert.equal(validateStory(standard.wire,standard.input).pages.length,4);assert.equal(storySchemaFor(),storySchemaFor('standard'));
 const sliced=structuredClone(standard.wire);sliced.paragraphs=sliced.paragraphs.flatMap(p=>[p.text.slice(0,Math.floor(p.text.length/2)),p.text.slice(Math.floor(p.text.length/2))]).map((text,i)=>({id:'p'+(i+1),text}));
 assert.equal(sliced.paragraphs.length,16);assert.ok(proseLength(sliced)<2400);assert.throws(()=>validateStory(rawFromCanonical(repage(sliced,8)),input),CandidateError);
 assert.throws(()=>validateStory(raw,standard.input),CandidateError);const longEmpty=structuredClone(raw);longEmpty.scenes[0].paragraphs[0]=' ';assert.throws(()=>validateStory(longEmpty,input),CandidateError);const named=structuredClone(raw);named.scenes[0].paragraphs[0]+='反馈';assert.throws(()=>validateStory(named,input),CandidateError);const wrongId=structuredClone(raw);wrongId.id='story-2';assert.throws(()=>validateStory(wrongId,input),CandidateError);
});

test('reproduced 3444-character, 16-paragraph failure with 11 repeated page references is rejected',async()=>{
 const {input,raw}=await storyFixture(),{canonical,broken}=repeatedReferenceFailure(raw,input);assert.equal(proseLength(broken),3444);assert.equal(broken.paragraphs.length,16);assert.equal(broken.pages.length,16);assert.deepEqual(broken.pages.slice(0,5).flatMap(p=>p.paragraphIds),canonical.paragraphs.map(p=>p.id));assert.ok(broken.pages.slice(5).every(p=>p.paragraphIds.length===16));assert.throws(()=>validateCanonicalStory(broken,input),CandidateError);assert.throws(()=>validateStory(broken,input),CandidateError);
});

test('long rejects an explanation scene in position seven without rejecting ordinary fictional titles',async()=>{
 const {input,raw}=await storyFixture(),eight=exactLength(rescene(raw,8),4323);assert.equal(rawLength(eight),4323);
 for(const title of ['解','议','概念解析','概念揭示','概念解释','概念定义','正式定义','学术解释',' 解 ']){const candidate=structuredClone(eight);candidate.scenes[6].title=title;assert.throws(()=>validateStory(candidate,input),(error:unknown)=>error instanceof CandidateError&&error.details.some(detail=>detail==='scenes.6.title:invalid_format'));}
 for(const title of ['解开的绳结','议事厅里的灯','争议之后','无解的棋局']){const candidate=structuredClone(eight);candidate.scenes[6].title=title;assert.equal(validateStory(candidate,input).pages[6].title,title);}
 const standard=await storyFixture('standard');standard.wire.pages[0].title='解';assert.equal(validateStory(standard.wire,standard.input).pages[0].title,'解');
});

test('restart repairs the same saved cross-reference failure from canonical input to raw scenes without resetting counters',async()=>{
 const dir=directory(),{input,raw}=await storyFixture(),{repair,canonical,broken}=repeatedReferenceFailure(raw,input),p=new SyntheticProvider();let service:JobService|undefined;
 p.story=async()=>structuredClone(broken);try{service=new JobService(dir,p);const job=service.create(owner,request('long-cross-reference-resume'));await until(()=>service!.get(owner,job.id)!.status==='failed');const before=service.get(owner,job.id)!;assert.equal(before.error?.code,'CONTENT_INVALID');assert.equal(before.progress.attempts,3);service.shutdown();const savedBefore=JSON.parse(readFileSync(join(dir,'jobs.json'),'utf8')).jobs[0];assert.deepEqual(savedBefore.candidates['story-1'],broken);
  const next=new SyntheticProvider();next.knowledge=async()=>assert.fail('must reuse saved knowledge');next.story=async(current)=>{assert.equal(current.storyLength,'long');assert.deepEqual(current.previousCandidate,broken);assert.ok(current.validationErrors?.length);return structuredClone(repair);};next.image=async()=>assert.fail('long cannot request images');service=new JobService(dir,next);service.resume(owner,job.id);const result=await completed(service,job.id),saved=JSON.parse(readFileSync(join(dir,'jobs.json'),'utf8')).jobs[0];assert.equal(result.id,job.id);assert.deepEqual(result.knowledge,before.knowledge);assert.equal(result.storyLength,'long');assert.equal(result.progress.attempts,6);assert.equal(result.progress.attemptBudget,before.progress.attemptBudget);assert.equal(result.stories[0].text,canonical.paragraphs.map(p=>p.text).join('\n\n'));assert.deepEqual(saved.contentRepaired,savedBefore.contentRepaired);assert.equal(saved.attempts['story-1'],3);assert.deepEqual(saved.wires[0],canonical);assert.equal('scenes' in saved.wires[0],false);
 }finally{service?.shutdown();cleanup(dir);}
});

test('long completes story, lesson, questions and fresh review with no image calls or extra stages',async()=>{
 const dir=directory(),p=new SyntheticProvider(),calls:string[]=[];
 for(const stage of ['knowledge','story','lesson','review'] as const){const original=p[stage].bind(p);p[stage]=async(input,abort)=>{assert.equal(input.storyLength,'long');calls.push(stage);if(stage==='review'){assert.equal('issues' in input,false);assert.equal('previousCandidate' in input,false);assert.equal('validationErrors' in input,false);}return original(input,abort);};}
 p.image=async()=>assert.fail('long must make zero image calls');const service=new JobService(dir,p);try{
  const job=service.create(owner,request('long-complete-01')),result=await completed(service,job.id);assert.equal(result.storyLength,'long');assert.equal(result.format,'text');assert.equal(result.storyCount,1);assert.equal(result.stories.length,1);assert.ok(result.stories[0].pages.length>=8);assert.ok(result.lesson&&result.discussion.length);assert.deepEqual(result.tasks.map(t=>t.kind),['comprehension','application']);assert.deepEqual(calls,['knowledge','story','lesson','review']);assert.equal(result.progress.attempts,4);assert.equal(result.progress.attemptBudget,48);assert.ok(result.stories[0].pages.every(p=>p.image.status==='not_requested'));
  for(const mapping of result.lesson!.mapping)assert.ok(result.stories[0].paragraphs.find(p=>p.id===mapping.paragraphId)!.text.includes(mapping.quote));
  assert.equal(freshReviewInput({concept:'反馈',knowledge:null,stories:[],storyLength:'long',previousCandidate:{stale:true}}).storyLength,'long');
 }finally{service.shutdown();cleanup(dir);}
});

test('normalized length participates in idempotency, legacy reads stay unchanged and comic rejection has no side effects',async()=>{
 const dir=directory();let service=new JobService(dir,new SyntheticProvider());try{
  const standard={concept:'反馈',format:'text' as const,clientRequestId:'old-length-request'},old=service.create(owner,standard);await completed(service,old.id);service.shutdown();const file=join(dir,'jobs.json'),saved=JSON.parse(readFileSync(file,'utf8'));delete saved.jobs[0].dto.storyLength;writeFileSync(file,JSON.stringify(saved),'utf8');utimesSync(file,new Date(0),new Date(0));const bytes=readFileSync(file,'utf8'),mtime=statSync(file).mtimeMs;
  service=new JobService(dir,new SyntheticProvider());assert.equal(service.get(owner,old.id)!.storyLength,'standard');assert.equal(service.create(owner,{...standard,storyLength:'standard'}).id,old.id);assert.throws(()=>service.create(owner,{...standard,storyLength:'long'}),{code:'REQUEST_CONFLICT'});assert.equal(readFileSync(file,'utf8'),bytes);assert.equal(statSync(file).mtimeMs,mtime);
  const a=service.create(owner,request('new-long-request'));await completed(service,a.id);assert.equal(service.create(owner,request('new-long-request')).id,a.id);assert.throws(()=>service.create(owner,{...request('new-long-request'),storyLength:undefined}),{code:'REQUEST_CONFLICT'});assert.throws(()=>service.create(owner,{...request('new-long-request'),concept:'另一个概念'}),{code:'REQUEST_CONFLICT'});
  const before=readFileSync(file,'utf8');assert.throws(()=>service.setFormat(owner,a.id,'comic'),{code:'LONG_TEXT_ONLY'});assert.throws(()=>service.create(owner,{...request('invalid-comic-long'),format:'comic'}),{code:'LONG_TEXT_ONLY'});assert.equal(readFileSync(file,'utf8'),before);assert.equal(service.list(owner).length,2);
 }finally{service.shutdown();cleanup(dir);}
});

test('long pause and automatic restart retain saved text, length and the original attempt budget',async()=>{
 for(const mode of ['pause','shutdown']){const dir=directory(),p=new SyntheticProvider();let service:JobService|undefined;
  p.lesson=async(_input,abort)=>new Promise((_resolve,reject)=>{abort.addEventListener('abort',()=>reject(new GenerationError('ABORTED')),{once:true});});
  try{service=new JobService(dir,p);const job=service.create(owner,request('long-restart-'+mode));await until(()=>service!.get(owner,job.id)!.phase==='lesson');const before=service.get(owner,job.id)!;assert.equal(before.progress.attempts,3);if(mode==='pause')service.pause(owner,job.id);service.shutdown();
   const file=join(dir,'jobs.json'),saved=JSON.parse(readFileSync(file,'utf8'));saved.jobs[0].dto.progress.attemptBudget=16;writeFileSync(file,JSON.stringify(saved),'utf8');
   const next=new SyntheticProvider(),lesson=next.lesson.bind(next),review=next.review.bind(next);next.knowledge=async()=>assert.fail('reuse knowledge');next.story=async()=>assert.fail('reuse saved long story');next.image=async()=>assert.fail('long image forbidden');next.lesson=async(input,abort)=>{assert.equal(input.storyLength,'long');return lesson(input,abort);};next.review=async(input,abort)=>{assert.equal(input.storyLength,'long');return review(input,abort);};
   service=new JobService(dir,next);if(mode==='pause'){assert.equal(service.get(owner,job.id)!.status,'paused');service.resume(owner,job.id);}const result=await completed(service,job.id);assert.equal(result.storyLength,'long');assert.deepEqual(result.stories,before.stories);assert.deepEqual(result.knowledge,before.knowledge);assert.equal(result.progress.attempts,5);assert.equal(result.progress.attemptBudget,16);
  }finally{service?.shutdown();cleanup(dir);}
 }
});

test('validation repair and a restarted quality continuation preserve long length and counters while re-grounding the lesson',async()=>{
 const dir=directory(),p=new SyntheticProvider(),originalStory=p.story.bind(p),lesson=p.lesson.bind(p);let service:JobService|undefined,stories=0,reviews=0;
 p.story=async(input,abort)=>{assert.equal(input.storyLength,'long');stories++;if(stories===1)return {invalid:true};if(stories===2){assert.deepEqual(input.previousCandidate,{invalid:true});assert.ok(input.validationErrors?.length);}const raw=input.issues?.length?rawFromCanonical(input.previousCandidate as StoryWire):await originalStory(input,abort);if(input.issues?.length){assert.ok((input.previousCandidate as StoryWire).paragraphs.length>=16);assert.equal('scenes' in (input.previousCandidate as object),false);raw.scenes[0].paragraphs[0]='当天又多了一次核对。'+raw.scenes[0].paragraphs[0];}return raw;};
 p.lesson=async(input,abort)=>{assert.equal(input.storyLength,'long');return lesson(input,abort);};
 p.review=async(input)=>{assert.equal(input.storyLength,'long');assert.equal('previousCandidate' in input,false);assert.equal('issues' in input,false);assert.equal('validationErrors' in input,false);reviews++;return reviews>=4?{passed:true,issues:[]}:{passed:false,issues:[{target:'story-1',detail:'核对当前行动并重建引用。',evidence:{paragraphId:'p1',quote:input.stories[0].paragraphs[0].text.slice(0,20)}}]};};p.image=async()=>assert.fail('long image forbidden');
 try{service=new JobService(dir,p);const job=service.create(owner,request('long-quality-01'));await until(()=>service!.get(owner,job.id)!.status==='failed');const before=service.get(owner,job.id)!;assert.equal(before.error?.code,'QUALITY_REVIEW_REQUIRED');assert.equal(before.error?.recoverable,true);assert.equal(before.progress.attempts,8);service.shutdown();
  const storedBefore=JSON.parse(readFileSync(join(dir,'jobs.json'),'utf8')).jobs[0];service=new JobService(dir,p);assert.deepEqual(service.get(owner,job.id)!.stories,before.stories);service.resume(owner,job.id);const result=await completed(service,job.id),stored=JSON.parse(readFileSync(join(dir,'jobs.json'),'utf8')).jobs[0];assert.equal(result.storyLength,'long');assert.equal(result.progress.attempts,12);assert.equal(result.progress.attemptBudget,before.progress.attemptBudget);assert.equal(stored.attempts['story-1'],storedBefore.attempts['story-1']);assert.deepEqual(stored.contentRepaired,storedBefore.contentRepaired);assert.equal(stored.qualityRecovery.state,'closed');assert.deepEqual(result.knowledge,before.knowledge);
  for(const mapping of result.lesson!.mapping)assert.ok(result.stories[0].paragraphs.find(p=>p.id===mapping.paragraphId)!.text.includes(mapping.quote));
 }finally{service?.shutdown();cleanup(dir);}
});

test('mock upstream receives matching long schema, larger stage budget and compact prose, preserving standard settings',async()=>{
 const dir=directory(),sent:any[]=[],{input,wire}=await storyFixture();try{
  const provider=new EcnuProvider({apiKey:'synthetic-long-test-key',enabled:true,traceDir:dir,fetcher:(async(_url,init)=>{sent.push(JSON.parse(String(init!.body)));return new Response('data: '+JSON.stringify({choices:[{delta:{content:'{}'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');}) as typeof fetch});
  await provider.story({...input,storyLength:'standard'},signal);await provider.story(input,signal);await provider.review({...input,stories:[projectStory(wire)],previousCandidate:{stale:true},validationErrors:['old']},signal);await provider.story({...input,previousCandidate:wire,validationErrors:['Reorganize the saved prose into its scenes.']},signal);
  const [standard,long,review,repair]=sent;assert.equal(standard.max_tokens,7000);assert.equal(long.max_tokens,14000);for(const payload of [standard,long]){assert.deepEqual(payload.thinking,{type:'disabled'});assert.equal('temperature' in payload,false);assert.equal('top_p' in payload,false);assert.equal(payload.stream,true);}
  const normal=standard.response_format.json_schema.schema.properties,extended=long.response_format.json_schema.schema.properties;assert.equal(normal.pages.minItems,4);assert.equal(normal.pages.maxItems,6);assert.equal(extended.scenes.minItems,8);assert.equal(extended.scenes.maxItems,16);assert.equal(extended.scenes.items.properties.paragraphs.minItems,2);assert.equal(extended.scenes.items.properties.paragraphs.maxItems,4);assert.equal(extended.scenes.items.properties.paragraphs.items.type,'string');assert.equal('paragraphs' in extended,false);assert.equal('pages' in extended,false);assert.deepEqual(repair.response_format,long.response_format);assert.deepEqual(JSON.parse(repair.messages[1].content).previousCandidate,wire);
  const user=JSON.parse(long.messages[1].content),audit=JSON.parse(review.messages[1].content);assert.equal(user.storyLength,'long');assert.equal('text' in long.response_format.json_schema.schema.properties,false);assert.equal(audit.storyLength,'long');assert.equal(audit.previousCandidate,undefined);assert.deepEqual(audit.stories[0].paragraphs,wire.paragraphs);assert.equal('text' in audit.stories[0],false);assert.equal('pages' in audit.stories[0],false);assert.equal(readFileSync(join(dir,'calls.jsonl'),'utf8').includes('synthetic-long-test-key'),false);
 }finally{cleanup(dir);}
});

test('new long shares freeze text and length without media capability; existing snapshot JSON survives refresh unchanged',async()=>{
 const dir=directory(),jobs=new JobService(dir,new SyntheticProvider());let shares=new ShareService(dir);try{
  const created=jobs.create(owner,request('long-share-01')),long=await completed(jobs,created.id),legacy=structuredClone(long);legacy.id='existing-legacy-share';delete legacy.storyLength;
  const old=shares.publish(owner,legacy,()=>null),oldToken=old.url.split('/').at(-1)!,readRows=()=>{const db=new DatabaseSync(join(dir,'accounts.sqlite'),{readOnly:true});try{return db.prepare('SELECT job_id, snapshot_json, media_json FROM shares ORDER BY job_id').all() as {job_id:string;snapshot_json:string;media_json:string}[];}finally{db.close();}};
  const oldRow=readRows()[0];assert.equal('storyLength' in JSON.parse(oldRow.snapshot_json),false);
  long.format='comic';const name='b'.repeat(64)+'.png';for(const page of long.stories[0].pages)page.image={status:'ready',url:'/learn/media/'+name};const published=shares.publish(owner,long,()=>assert.fail('long cannot resolve private pictures')),token=published.url.split('/').at(-1)!,snapshot=shares.read(token)!;assert.equal(snapshot.format,'text');assert.equal(snapshot.storyLength,'long');assert.ok(snapshot.stories[0].pages.every(p=>p.image.status==='not_requested'&&!p.image.url));assert.equal(shares.media(token,name),null);assert.deepEqual(readRows().find(row=>row.job_id===legacy.id),oldRow);assert.equal(readRows().find(row=>row.job_id===long.id)!.media_json,'[]');
  legacy.storyLength='long';assert.deepEqual(shares.publish(owner,legacy,()=>null),old);shares.close();shares=new ShareService(dir);assert.deepEqual(shares.read(token),snapshot);assert.equal('storyLength' in shares.read(oldToken)!,false);assert.deepEqual(readRows().find(row=>row.job_id===legacy.id),oldRow);
 }finally{jobs.shutdown();shares.close();cleanup(dir);}
});

test('HTTP validates length, rejects comic without modifying the job, and serves long public snapshots after refresh',async()=>{
 const dir=directory(),distDir=join(dir,'dist');mkdirSync(distDir);writeFileSync(join(distDir,'index.html'),'<html>synthetic</html>');const jobs=new JobService(dir,new SyntheticProvider()),auth=new AuthService(dir),shares=new ShareService(dir),app=createApp(jobs,{production:false,cookieSecret:'synthetic-long-secret-'.repeat(3),accessCodeHash:createHash('sha256').update('test-code').digest('hex'),distDir},{auth,shares}),server=await listenForFetch(app);const url='http://127.0.0.1:'+(server.address() as {port:number}).port;
 const post=(path:string,body:unknown,cookie='')=>fetch(url+'/learn/api'+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
 try{const account=await post('/auth/register',{code:'test-code',username:'long_reader',password:'local synthetic password'});assert.equal(account.status,201);const cookie=account.headers.get('set-cookie')!.split(';')[0],jobOwner=auth.authenticate(cookie.split('=')[1])!.owner;
  assert.equal((await post('/jobs',{...request('invalid-http-long'),format:'comic'},cookie)).status,400);assert.equal((await post('/jobs',{...request('invalid-http-enum'),storyLength:'extra'},cookie)).status,400);assert.equal(jobs.list(jobOwner).length,0);
  const response=await post('/jobs',request('long-http-01'),cookie);assert.equal(response.status,202);const {job}=await response.json() as JobResponse;await completed(jobs,job.id,jobOwner);assert.equal((await post('/jobs',request('long-http-01'),cookie)).status,202);assert.equal((await post('/jobs',{...request('long-http-01'),storyLength:'standard'},cookie)).status,409);
  const before=readFileSync(join(dir,'jobs.json'),'utf8'),rejected=await post('/jobs/'+job.id+'/format',{format:'comic'},cookie);assert.equal(rejected.status,400);assert.equal((await rejected.json() as {error:{code:string}}).error.code,'LONG_TEXT_ONLY');assert.equal(readFileSync(join(dir,'jobs.json'),'utf8'),before);
  const shared=await post('/jobs/'+job.id+'/share',{},cookie);assert.equal(shared.status,201);const {share}=await shared.json() as ShareResponse,token=share!.url.split('/').at(-1)!;for(let i=0;i<2;i++){const value=await(await fetch(url+'/learn/api/public/shares/'+token)).json() as PublicShareResponse;assert.equal(value.shared.storyLength,'long');assert.equal(value.shared.format,'text');assert.ok(value.shared.stories[0].pages.every(p=>!p.image.url));}assert.equal((await fetch(url+'/learn/api/public/shares/'+token+'/media/'+'a'.repeat(64)+'.png')).status,404);
 }finally{jobs.shutdown();await new Promise<void>(done=>server.close(()=>done()));shares.close();auth.close();cleanup(dir);}
});
