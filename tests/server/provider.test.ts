import test from 'node:test';import assert from 'node:assert/strict';
import {consumeCompletion,EcnuProvider} from '../../server/ecnu.ts';import {SyntheticProvider} from '../../server/synthetic.ts';import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
const response=(lines:string[])=>new Response(new ReadableStream({start(c){for(const line of lines)c.enqueue(new TextEncoder().encode(line));c.close();}}));
test('SSE parses split UTF8 frames, excludes reasoning and captures finish reason',async()=>{
 const r=await consumeCompletion(response(['data: {"model":"provider-model","choices":[{"delta":{"reasoning_content":"private"}}]}\r\n\r\n','data: {"choices":[{"delta":{"content":"{\\\"msg\\\":\\\"你"}}]}\n\n','data: {"choices":[{"delta":{"content":"好\\\"}"},"finish_reason":"stop"}]}\n\ndata: [DO','NE]\n\n']),new AbortController().signal);
 assert.deepEqual(JSON.parse(r.content),{msg:'你好'});assert.equal(r.returnedModel,'provider-model');assert.equal(r.content.includes('private'),false);
});
test('truncated stream is rejected rather than accepting a partial JSON completion',async()=>{
 await assert.rejects(()=>consumeCompletion(response(['data: {"choices":[{"delta":{"content":"{}"}}]}\n\n']),new AbortController().signal),{code:'UPSTREAM_STREAM_INCOMPLETE'});
});
test('aborted reader cannot produce a late successful completion',async()=>{
 const controller=new AbortController();const body=new ReadableStream<Uint8Array>({start(c){setTimeout(()=>{try{c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));c.close();}catch{}},20);}});
 const pending=consumeCompletion(new Response(body),controller.signal);controller.abort();await assert.rejects(()=>pending,{code:'ABORTED'});
});
test('stream framing tolerates CRLF and a multibyte character split across byte chunks',async()=>{
 const encoded=new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你好"}}]}\r\n\r\ndata: [DONE]\r\n\r\n');const chunks:Array<Uint8Array>=[];for(let i=0;i<encoded.length;i++)chunks.push(encoded.subarray(i,i+1));const res=new Response(new ReadableStream({start(c){chunks.forEach(x=>c.enqueue(x));c.close();}}));assert.equal((await consumeCompletion(res,new AbortController().signal)).content,'你好');
});
test('provider sends a single prose source and records safe usage without leaking its key',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'studio-provider-')),fixture=new SyntheticProvider(),signal=new AbortController().signal;try{
 const knowledge=await fixture.knowledge({concept:'反馈',knowledge:null,stories:[]},signal);const story=await fixture.story({concept:'反馈',knowledge,stories:[],storyIndex:0},signal);let sent:any;
 const provider=new EcnuProvider({apiKey:'test-private-key',enabled:true,traceDir:dir,fetcher:(async(_url,init)=>{sent=JSON.parse(String(init!.body));return response(['data: '+JSON.stringify({model:'test-provider',choices:[{delta:{content:'{"passed":true,"issues":[]}'},finish_reason:'stop'}],usage:{prompt_tokens:71,completion_tokens:8,total_tokens:79}})+'\n\ndata: [DONE]\n\n']);}) as typeof fetch});
 await provider.review({concept:'反馈',knowledge,stories:[{...story,text:'DUPLICATE PROSE',pages:[{text:'DUPLICATE PAGE'}]}],issues:[{target:'story-1',detail:'STALE_ISSUE',evidence:{paragraphId:'p2',quote:'OLD_QUOTE'}}],previousCandidate:{obsolete:'STALE_CANDIDATE'},validationErrors:['STALE_ERROR']},signal);const upstream=JSON.parse(sent.messages[1].content);assert.equal('text' in upstream.stories[0],false);assert.equal('pages' in upstream.stories[0],false);assert.equal('issues' in upstream,false);assert.equal('previousCandidate' in upstream,false);assert.equal('validationErrors' in upstream,false);assert.equal(JSON.stringify(upstream).includes('STALE_'),false);assert.equal(sent.stream,true);assert.deepEqual(sent.thinking,{type:'disabled'});assert.equal('reasoning_effort' in sent,false);
 const trace=readFileSync(join(dir,'calls.jsonl'),'utf8');assert.equal(trace.includes('test-private-key'),false);assert.equal(JSON.parse(trace).usage.total_tokens,79);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
const envelope=(content:string,finish:string|null=null)=>'data: '+JSON.stringify({id:'chatcmpl-stream-boundary-fixture-0001',object:'chat.completion.chunk',created:1792944000,model:'deepseek-v4-flash',choices:[{index:0,delta:{content},finish_reason:finish}],usage:null})+'\n\n';
test('6500 token-sized SSE events can exceed 1 MiB on the wire while small decoded content succeeds',async()=>{
 const pieces=['{"text":"',...Array.from({length:6500},()=>'知'),'"}'];const frames=pieces.map(piece=>envelope(piece));frames.push(envelope('','stop'),'data: [DONE]\n\n');
 const result=await consumeCompletion(response(frames),new AbortController().signal);assert.equal(JSON.parse(result.content).text,'知'.repeat(6500));assert.ok(result.wireBytes>1024*1024);assert.equal(result.contentBytes,Buffer.byteLength(pieces.join('')));assert.equal(result.returnedModel,'deepseek-v4-flash');
});
test('wire cap stops the reader independently of decoded content and logs only safe stream counters',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'studio-wire-cap-'));let pulls=0,cancelled=false;const wire=[envelope('tiny'),': '+(' '.repeat(8*1024*1024))+'\n\n',envelope('must never be read')];
 const body=new ReadableStream<Uint8Array>({pull(c){c.enqueue(new TextEncoder().encode(wire[pulls++]));},cancel(){cancelled=true;}},{highWaterMark:0});
 try{const provider=new EcnuProvider({apiKey:'test-private-key',enabled:true,traceDir:dir,fetcher:(async()=>new Response(body,{headers:{'x-private-header':'DO_NOT_LOG_HEADER'}})) as typeof fetch});
 await assert.rejects(()=>provider.review({concept:'反馈',knowledge:null,stories:[]},new AbortController().signal),{code:'UPSTREAM_WIRE_TOO_LARGE'});assert.equal(pulls,2);assert.equal(cancelled,true);
 const raw=readFileSync(join(dir,'calls.jsonl'),'utf8'),entry=JSON.parse(raw);assert.ok(entry.wireBytes>8*1024*1024);assert.equal(entry.contentBytes,4);assert.equal(entry.chunks,2);assert.equal(entry.returnedModel,'deepseek-v4-flash');for(const privateValue of ['test-private-key','DO_NOT_LOG_HEADER','tiny','must never be read'])assert.equal(raw.includes(privateValue),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('decoded UTF8 content cap stops below the wire cap and does not append the oversized delta',async()=>{
 let pulls=0,cancelled=false;const frames=[envelope(''),envelope('知'.repeat(Math.floor(1024*1024/3)+1)),envelope('must never be read')];const body=new ReadableStream<Uint8Array>({pull(c){c.enqueue(new TextEncoder().encode(frames[pulls++]));},cancel(){cancelled=true;}},{highWaterMark:0});
 await assert.rejects(()=>consumeCompletion(new Response(body),new AbortController().signal),(error:any)=>{assert.equal(error.code,'UPSTREAM_CONTENT_TOO_LARGE');assert.ok(error.streamStats.contentBytes>1024*1024);assert.ok(error.streamStats.wireBytes<8*1024*1024);assert.equal(error.streamStats.returnedModel,'deepseek-v4-flash');return true;});assert.equal(pulls,2);assert.equal(cancelled,true);
});
