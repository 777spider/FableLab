import {createHash} from 'node:crypto';

// Verified 2026-10-26 against developer.ecnu.edu.cn imagegenerate.html/imageedit.html.
// The edit API documents one image file. Its size field is ignored by the provider.
const API='https://chat.ecnu.edu.cn/open/api/v1/images/';
const MODEL='ecnu-image';
const MAX_IMAGE_BYTES=20*1024*1024;
const MAX_RESPONSE_BYTES=Math.ceil(MAX_IMAGE_BYTES/3)*4+65536;
const IMAGE_HOSTS=new Set(['ecnunic-data-public.oss-cn-shanghai.aliyuncs.com']);
const SIZES=new Set(['512x512','768x768','720x1280','1280x720','1024x1024']);
const CACHE_CONTRACT='fablelab-ecnu-image-single-reference-v1';
const digest=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');

export type EcnuImageSize='512x512'|'768x768'|'720x1280'|'1280x720'|'1024x1024';
export type EcnuImageOperation='generations'|'edits';
export type EcnuImageReference={bytes:Uint8Array;hash:string};
export type EcnuImageIdentity={
  prompt:string;
  promptVersion:string;
  size?:EcnuImageSize;
  reference?:{hash:string};
  sceneBibleVersion:string;
  characterBibleVersion:string;
};
export type EcnuImageRequest=Omit<EcnuImageIdentity,'reference'>&{
  apiKey:string;
  signal?:AbortSignal;
  reference?:EcnuImageReference;
  fetch?:typeof globalThis.fetch;
};
export type EcnuImageResult={
  bytes:Buffer;
  extension:'.png'|'.jpg';
  hash:string;
  cacheKey:string;
  model:'ecnu-image';
  requestedModel:'ecnu-image';
  returnedModel:string|null;
  operation:EcnuImageOperation;
  referenceAssetHash:string|null;
  promptHash:string;
  promptVersion:string;
  sceneBibleVersion:string;
  characterBibleVersion:string;
  requestedSize:EcnuImageSize;
  sizeApplied:boolean;
  responseEncoding:'base64'|'download';
  revisedPrompt:string|null;
  startedAt:string;
  completedAt:string;
  generationMs:number;
  downloadMs:number;
  durationMs:number;
};

export class EcnuImageError extends Error {
  constructor(public readonly code:string,public readonly returnedModel:string|null=null){super(code);this.name='EcnuImageError';}
}
function fail(code:string):never{throw new EcnuImageError(code);}

/** This only identifies a request. The caller validates any cached asset before reuse. */
export function ecnuImageCacheKey(request:EcnuImageIdentity):string{
  return digest(JSON.stringify({
    contract:CACHE_CONTRACT,operation:request.reference?'edits':'generations',model:MODEL,
    promptVersion:request.promptVersion,promptHash:digest(request.prompt),size:request.size||'1280x720',
    referenceAssetHash:request.reference?.hash||null,
    sceneBibleVersion:request.sceneBibleVersion,characterBibleVersion:request.characterBibleVersion
  }));
}

function imageExtension(bytes:Buffer):'.png'|'.jpg'{
  if(bytes.length>MAX_IMAGE_BYTES)fail('INVALID_IMAGE');
  if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return '.png';
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return '.jpg';
  return fail('INVALID_IMAGE');
}
function safeProviderText(value:unknown,apiKey:string,maxLength:number):string|null{
  if(typeof value!=='string'||!value.trim()||value.length>maxLength||value.includes(apiKey))return null;
  return value.trim();
}
async function readBounded(response:Response,limit:number,errorCode:string):Promise<Buffer>{
  const declared=Number(response.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>limit)fail(errorCode);
  if(!response.body)fail(errorCode);
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];
  let length=0;
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      length+=value.byteLength;
      if(length>limit){await reader.cancel();fail(errorCode);}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  return Buffer.concat(chunks,length);
}
async function request(fetcher:typeof globalThis.fetch,url:string,init:RequestInit,errorCode:string):Promise<Response>{
  try{return await fetcher(url,init);}
  catch(error){
    if(error instanceof EcnuImageError)throw error;
    return fail(init.signal?.aborted?'IMAGE_REQUEST_TIMEOUT':errorCode);
  }
}
function downloadUrl(value:unknown):URL{
  if(typeof value!=='string')return fail('NO_IMAGE');
  let url:URL;
  try{url=new URL(value);}catch{return fail('UNTRUSTED_IMAGE_HOST');}
  if(url.protocol!=='https:'||!IMAGE_HOSTS.has(url.hostname)||url.username||url.password||url.port)return fail('UNTRUSTED_IMAGE_HOST');
  return url;
}

/** One paid request, no automatic retries or reference-free fallback. No environment or file access. */
export async function requestEcnuImage(options:EcnuImageRequest):Promise<EcnuImageResult>{
  if(!options.apiKey?.trim())fail('ECNU_API_KEY_MISSING');
  if(!options.prompt.trim()||[...options.prompt].length>1024)fail('PROMPT_TOO_LONG');
  if(!options.promptVersion||!options.sceneBibleVersion||!options.characterBibleVersion)fail('IMAGE_VERSION_MISSING');
  const requestedSize=options.size||'1280x720';
  if(!SIZES.has(requestedSize))fail('INVALID_IMAGE_SIZE');
  const reference=options.reference?Buffer.from(options.reference.bytes):null;
  let referenceExtension:'.png'|'.jpg'|null=null;
  if(reference){
    referenceExtension=imageExtension(reference);
    if(!/^[a-f0-9]{64}$/.test(options.reference!.hash)||digest(reference)!==options.reference!.hash)fail('REFERENCE_HASH_MISMATCH');
  }
  const operation:EcnuImageOperation=reference?'edits':'generations';
  const headers:Record<string,string>={Authorization:'Bearer '+options.apiKey};
  let body:string|FormData;
  if(reference){
    const form=new FormData();
    form.set('model',MODEL);form.set('prompt',options.prompt);form.set('response_format','b64_json');form.set('n','1');
    // Always the supplied first scene bytes: no URL dereference or previous-page substitution.
    form.set('image',new Blob([new Uint8Array(reference)],{type:referenceExtension==='.png'?'image/png':'image/jpeg'}),'reference'+referenceExtension);
    body=form;
  }else{
    headers['Content-Type']='application/json';
    body=JSON.stringify({model:MODEL,prompt:options.prompt,size:requestedSize,response_format:'b64_json'});
  }
  const fetcher=options.fetch||globalThis.fetch;
  const started=Date.now(),startedAt=new Date(started).toISOString();
  const response=await request(fetcher,API+operation,{method:'POST',headers,body,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(240000)]):AbortSignal.timeout(240000),redirect:'error'},'IMAGE_REQUEST_FAILED');
  if(!response.ok)fail('ECNU_HTTP_'+response.status);
  let payload:any;
  try{payload=JSON.parse((await readBounded(response,MAX_RESPONSE_BYTES,'IMAGE_RESPONSE_TOO_LARGE')).toString('utf8'));}
  catch(error){if(error instanceof EcnuImageError)throw error;return fail('IMAGE_RESPONSE_INVALID');}
  if(!payload||typeof payload!=='object'||Array.isArray(payload))fail('IMAGE_RESPONSE_INVALID');
  const returnedModel=safeProviderText(payload.model,options.apiKey,160)||safeProviderText(payload.data?.[0]?.model,options.apiKey,160);
  try{
  if(payload.err_message)fail('IMAGE_REJECTED');
  const item=payload.data?.[0];
  const generationMs=Date.now()-started;
  let bytes:Buffer,downloadMs=0,responseEncoding:'base64'|'download';
  if(typeof item?.b64_json==='string'&&item.b64_json){
    const encoded=item.b64_json;
    if(encoded.length>MAX_RESPONSE_BYTES||encoded.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))fail('INVALID_IMAGE');
    bytes=Buffer.from(encoded,'base64');responseEncoding='base64';
  }else{
    const url=downloadUrl(item?.url),downloadStarted=Date.now();
    // Never send Authorization to a temporary object-storage URL, and never follow redirects.
    const downloaded=await request(fetcher,url.href,{signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000),redirect:'error'},'IMAGE_DOWNLOAD_FAILED');
    if(!downloaded.ok)fail('IMAGE_DOWNLOAD_FAILED');
    try{bytes=await readBounded(downloaded,MAX_IMAGE_BYTES,'INVALID_IMAGE');}
    catch(error){if(error instanceof EcnuImageError)throw error;return fail('IMAGE_DOWNLOAD_FAILED');}
    downloadMs=Date.now()-downloadStarted;responseEncoding='download';
  }
  const extension=imageExtension(bytes),completed=Date.now();
  return {
    bytes,extension,hash:digest(bytes),cacheKey:ecnuImageCacheKey(options),model:MODEL,requestedModel:MODEL,
    returnedModel,
    operation,referenceAssetHash:options.reference?.hash||null,promptHash:digest(options.prompt),promptVersion:options.promptVersion,
    sceneBibleVersion:options.sceneBibleVersion,characterBibleVersion:options.characterBibleVersion,
    requestedSize,sizeApplied:operation==='generations',responseEncoding,
    revisedPrompt:safeProviderText(item?.revised_prompt,options.apiKey,16384),startedAt,completedAt:new Date(completed).toISOString(),
    generationMs,downloadMs,durationMs:completed-started
  };
  }catch(error){
    // Retain only the model field actually returned in this response, never raw provider text.
    if(error instanceof EcnuImageError)throw new EcnuImageError(error.code,returnedModel);
    throw error;
  }
}

/** Fixed user-facing messages; provider errors, URLs and credentials never enter them. */
export function ecnuImageErrorMessage(error:unknown):string{
  const code=error instanceof EcnuImageError?error.code:'';
  if(code==='REFERENCE_HASH_MISMATCH'||code==='REFERENCE_UNAVAILABLE')return '首张参考图不可用，本页未生成；正文仍可阅读。';
  if(code==='IMAGE_REJECTED')return '本页图像未通过图像服务审核；正文仍可阅读。';
  if(code==='IMAGE_REQUEST_TIMEOUT')return '本页图像生成超时；正文仍可阅读。';
  return '本页图像暂未生成成功；正文仍可阅读。';
}
