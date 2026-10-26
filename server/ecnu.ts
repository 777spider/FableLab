import {createHash} from 'node:crypto';
import {appendFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
import {GenerationError,CandidateError,knowledgeSchema,storySchema,lessonSchema,reviewSchema,freshReviewInput,type GenerationProvider,type GenerationInput,type ImageInput,type ImageResult} from './generation.ts';
import {requestEcnuImage,EcnuImageError} from './ecnu-images.ts';
import {COMMON,KNOWLEDGE,STORY,LESSON,REVIEW,PROMPT_VERSION} from './prompts.ts';
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
// SSE repeats an envelope per delta; wire size is not the decoded answer size.
const MAX_WIRE_BYTES=8*1024*1024,MAX_CONTENT_BYTES=1024*1024;
interface StreamStats {wireBytes:number;contentBytes:number;chunks:number;returnedModel:string|null;}
export async function consumeCompletion(response:Response,signal:AbortSignal):Promise<{content:string;returnedModel:string|null;finishReason:string|null;chunks:number;usage:Record<string,number>;wireBytes:number;contentBytes:number}>{
 if(signal.aborted)throw new GenerationError('ABORTED');if(!response.body)throw new GenerationError('UPSTREAM_EMPTY',true);
 const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',content='',returnedModel:string|null=null,finishReason:string|null=null,doneMarker=false,wireBytes=0,contentBytes=0,chunks=0;const usage:Record<string,number>={};
 const abort=()=>{void reader.cancel();};signal.addEventListener('abort',abort,{once:true});
 const event=(frame:string)=>{const data=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(!data)return;if(data.trim()==='[DONE]'){doneMarker=true;return;}
  let v:any;try{v=JSON.parse(data);}catch{throw new GenerationError('UPSTREAM_STREAM_INVALID',true);}if(v.error)throw new GenerationError('UPSTREAM_REJECTED');
  if(typeof v.model==='string'&&v.model.length<=160)returnedModel=v.model;
  for(const key of ['prompt_tokens','completion_tokens','total_tokens'])if(Number.isSafeInteger(v.usage?.[key])&&v.usage[key]>=0)usage[key]=v.usage[key];
  const choice=v.choices?.[0];if(typeof choice?.delta?.content==='string'){contentBytes+=Buffer.byteLength(choice.delta.content,'utf8');if(contentBytes>MAX_CONTENT_BYTES)throw new GenerationError('UPSTREAM_CONTENT_TOO_LARGE');content+=choice.delta.content;}if(typeof choice?.finish_reason==='string')finishReason=choice.finish_reason;
 };
 try{while(true){if(signal.aborted)throw new GenerationError('ABORTED');const part=await reader.read();if(signal.aborted)throw new GenerationError('ABORTED');if(part.done)break;wireBytes+=part.value.byteLength;chunks++;if(wireBytes>MAX_WIRE_BYTES)throw new GenerationError('UPSTREAM_WIRE_TOO_LARGE');pending=(pending+decoder.decode(part.value,{stream:true})).replace(/\r\n/g,'\n');let boundary;while((boundary=pending.indexOf('\n\n'))!==-1){event(pending.slice(0,boundary));pending=pending.slice(boundary+2);}}
  pending+=decoder.decode();if(pending.trim())event(pending);if(signal.aborted)throw new GenerationError('ABORTED');
  if(!doneMarker&&!finishReason)throw new GenerationError('UPSTREAM_STREAM_INCOMPLETE',true);if(finishReason==='length')throw new CandidateError(content,['Completion truncated; keep required content concise within stage budget.']);
  if(!content.trim())throw new GenerationError('UPSTREAM_EMPTY',true);return {content,returnedModel,finishReason,chunks,usage,wireBytes,contentBytes};
 }catch(error){if(error instanceof Error)Object.defineProperty(error,'streamStats',{value:{wireBytes,contentBytes,chunks,returnedModel} satisfies StreamStats});throw error;}
 finally{signal.removeEventListener('abort',abort);try{await reader.cancel();}catch{}reader.releaseLock();}
}
export class EcnuProvider implements GenerationProvider {
 provenance='generated' as const;
 constructor(private config:{apiKey?:string;model?:string;reasoning?:string;timeoutMs?:number;enabled?:boolean;traceDir:string;fetcher?:typeof fetch}){mkdirSync(config.traceDir,{recursive:true,mode:0o700});}
 private log(value:Record<string,unknown>){appendFileSync(join(this.config.traceDir,'calls.jsonl'),JSON.stringify({...value,at:new Date().toISOString()})+'\n',{encoding:'utf8',mode:0o600});}
 private async text(stage:string,system:string,input:GenerationInput,schema:z.ZodType,maxTokens:number,signal:AbortSignal):Promise<unknown>{
  if(!this.config.enabled||!this.config.apiKey)throw new GenerationError('UPSTREAM_NOT_CONFIGURED');const started=Date.now(),timeout=AbortSignal.timeout(this.config.timeoutMs??240000),combined=AbortSignal.any([signal,timeout]);const model=this.config.model??'ecnu-max',effort=this.config.reasoning??'off';
  if(model!=='ecnu-max'&&model!=='ecnu-plus')throw new GenerationError('INVALID_MODEL_CONFIG');const levels=model==='ecnu-max'?['low','high','max']:['low','medium','xhigh'];if(effort!=='off'&&!levels.includes(effort))throw new GenerationError('INVALID_REASONING_CONFIG');
  // Public DTO pages repeat prose for rendering. Upstream receives only authored paragraphs once.
  const compact={...input,stories:input.stories.map(({id,title,sourceDomain,characters,paragraphs})=>({id,title,sourceDomain,characters,paragraphs}))};
  const user=JSON.stringify(compact);const meta={stage,promptVersion:PROMPT_VERSION,requestedModel:model,promptHash:sha(system+'\n'+user),thinking:effort,maxTokens};
  try{const response=await(this.config.fetcher??fetch)('https://chat.ecnu.edu.cn/open/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+this.config.apiKey,'Content-Type':'application/json'},redirect:'error',signal:combined,body:JSON.stringify({model,stream:true,thinking:{type:effort==='off'?'disabled':'enabled'},...(effort==='off'?{}:{reasoning_effort:effort}),max_tokens:maxTokens,response_format:{type:'json_schema',json_schema:{name:'studio_'+stage.replace(/-/g,'_'),schema:z.toJSONSchema(schema)}},messages:[{role:'system',content:COMMON+'\n'+system},{role:'user',content:user}]})});
   if(!response.ok){await response.body?.cancel();throw new GenerationError(response.status===429?'UPSTREAM_BUSY':response.status===504?'UPSTREAM_TIMEOUT':'UPSTREAM_HTTP_'+response.status,response.status===429||response.status>=500);}
   const result=await consumeCompletion(response,combined);if(signal.aborted)throw new GenerationError('ABORTED');this.log({...meta,status:'received',durationMs:Date.now()-started,responseHash:sha(result.content),responseChars:result.content.length,returnedModel:result.returnedModel?.includes(this.config.apiKey)?null:result.returnedModel,finishReason:result.finishReason,chunks:result.chunks,wireBytes:result.wireBytes,contentBytes:result.contentBytes,usage:result.usage});
   try{return JSON.parse(result.content);}catch{throw new CandidateError(result.content,['Output must be one complete valid JSON object matching the stage schema.']);}
  }catch(error){const failure=signal.aborted?new GenerationError('ABORTED'):timeout.aborted?new GenerationError('UPSTREAM_TIMEOUT',true):error instanceof GenerationError?error:new GenerationError('UPSTREAM_NETWORK',true);const stats=(error as {streamStats?:StreamStats})?.streamStats;this.log({...meta,status:'failed',code:failure.code,durationMs:Date.now()-started,...(stats?{wireBytes:stats.wireBytes,contentBytes:stats.contentBytes,chunks:stats.chunks,returnedModel:stats.returnedModel?.includes(this.config.apiKey)?null:stats.returnedModel}:{})});throw failure;}
 }
 knowledge(input:GenerationInput,signal:AbortSignal){return this.text('knowledge',KNOWLEDGE,{...input,stories:[]},knowledgeSchema,4000,signal);}
 story(input:GenerationInput,signal:AbortSignal){return this.text('story',STORY,{...input,lesson:null},storySchema,7000,signal);}
 lesson(input:GenerationInput,signal:AbortSignal){return this.text('lesson',LESSON,input,lessonSchema,6500,signal);}
 review(input:GenerationInput,signal:AbortSignal){return this.text('review',REVIEW,freshReviewInput(input),reviewSchema,3000,signal);}
 async image(input:ImageInput,signal:AbortSignal):Promise<ImageResult>{
  if(!this.config.enabled||!this.config.apiKey)throw new GenerationError('UPSTREAM_NOT_CONFIGURED');
  try{const result=await requestEcnuImage({apiKey:this.config.apiKey,prompt:input.prompt,reference:input.reference,promptVersion:PROMPT_VERSION,size:'1280x720',sceneBibleVersion:'studio-ink-v1',characterBibleVersion:'story-first-reference-v1',fetch:this.config.fetcher,signal});if(signal.aborted)throw new GenerationError('ABORTED');const {bytes,extension,hash,...metadata}=result;return {bytes,extension,hash,metadata};}
  catch(error){if(signal.aborted)throw new GenerationError('ABORTED');if(error instanceof EcnuImageError)throw new GenerationError(error.code,['IMAGE_REQUEST_TIMEOUT','IMAGE_REQUEST_FAILED','IMAGE_DOWNLOAD_FAILED','ECNU_HTTP_429','ECNU_HTTP_500','ECNU_HTTP_502','ECNU_HTTP_503','ECNU_HTTP_504'].includes(error.code));throw new GenerationError('IMAGE_FAILED');}
 }
}
