import {createHash} from 'node:crypto';
import type {GenerationInput,GenerationProvider,ImageInput,ImageResult} from './generation.ts';
/** Local flow fixture only: not evidence of real AI generation or academic accuracy. */
export class SyntheticProvider implements GenerationProvider {
 provenance='preset' as const;
 async knowledge(input:GenerationInput,_signal:AbortSignal):Promise<any>{return {concept:input.concept,definition:'这是仅供本地界面与断点恢复检查的固定资料。',coreRelations:['行动造成可以观察的结果，后续行动依据记录调整。','同一规则的作用依赖初始状态与当时的条件。'],prerequisites:['先确定观察对象与时间范围。'],misconceptions:['固定示例不能证明在线模型的学理质量。'],academicUse:'仅用于离线流程验证。',searchTerms:[input.concept],sources:[]};}
 async story(input:GenerationInput,_signal:AbortSignal):Promise<any>{
  const index=input.storyIndex??0,name=index?'圆杯':'栗鼠',place=index?'旧茶馆':'山坡仓房';
  const paragraphs=[
   `${name}接手${place}的时候，前任留下一本磨破封面的账簿。第一页写着“照旧”，后面的纸却全被撕走了。门外的客人已经排到石桥边，它决定先把今天熬过去。它挂上营业的木牌，搬来一只空筐，把每次忙不过来的时刻记在纸条上，原以为等太阳落山，就能知道哪里出了岔子。谁知道刚过中午，装纸条的筐已经比装货物的筐还满。`,
   `帮手看见纸条，以为它在收集愿望，往里面塞了一张“早点关门”。它笑了一阵，又把这张纸摊平压在桌角。它想把事情做好，却不愿意假装所有问题都能靠跑得更快解决。那天它试着把取货的位置搬到门边。前面的客人走快了，后面送货的人却进不来，一只大篮子卡在门框上，谁都不肯先往后退。`,
   `晚上收拾的时候，它没有把失败的纸条烧掉。它把门口的桌子、篮子和通道画成小图，另外记下每一批客人什么时候到、每次能搬走多少东西。帮手问它是不是打算开一家纸上的店。它说纸上的篮子堵住了门，总比真的篮子砸到脚好。两个人坐在灯下，把木片沿着画好的路线推过去，又一块一块收回原处。`,
   `第一遍走到半路就乱了。帮手偷偷让两块木片挤在同一个位置，说它们很瘦，应该挤得下。它拿起那只真实的大篮子放在桌旁，两个人看着篮子，都没有再坚持。它们重新定好每个位置能放多少东西，每次移动后都留下记号，连无人领取的东西也没有从图上偷偷擦掉。灯油少了一半，纸上的店终于从开门走到了关门。`,
   `第二天，它没有直接把纸上的办法搬出去。它只先挪开最碍事的一张桌子，留出通道，在墙边放一个临时等候的篮子。忙起来的时候，帮手又想把所有东西一起往前推。它拦住帮手，指了指昨天留下的记号。那一小段停顿让后面的人觉得奇怪，却也给送货的人留下了转身的位置。门终于没有再被篮子塞住。`,
   `傍晚来了一场小雨，纸上没有雨。客人站在屋檐下不肯离开，刚空出的通道又慢慢堵起来。帮手举起那张小图，说它果然不顶用。它没有辩解，只把图收进干燥的抽屉，另拿一张纸记下今天发生的事。它知道图上的每一步都走得通，却还不知道有多少真实的事没有画进去。那晚它关门稍晚，账簿里终于有了能读懂的第二页。`,
   `几天以后，帮手又问起那本撕掉纸的旧账簿。它翻开“照旧”那一页，用指甲摸了摸纸边，忽然想起自己第一天也差点留下同样的两个字。它把所有纸条按日期夹进去：哪里改过，为什么改，后来实际发生了什么。没有成功的地方也留下，没有为了让账面好看，替过去补上一场从没来过的顺利。`,
   `来接班的人看见厚厚一叠纸，先叹了口气。它便挑了其中一张，让对方先把桌上的木片走完。对方走错了两次，第三次才留出了转身的位置。门外又传来客人的脚步声，两个人把木片收好，一起去开门。账簿没有替他们决定今天会发生什么，至少这一次，昨天做过的事不必从头再猜。`
  ].map((text,i)=>({id:'p'+(i+1),text}));
  return {id:'story-'+(index+1),title:index?'账簿的第二页':'纸上的小店',sourceDomain:index?'object_world':'animal_society',characters:[{name,visualDesign:index?'porcelain cup, blue rim, tiny brown apron':'chestnut squirrel, ochre vest, curled tail'}],paragraphs,pages:[0,1,2,3].map(i=>({title:['旧账簿','纸上的店','门口的雨','重新开门'][i],paragraphIds:['p'+(i*2+1),'p'+(i*2+2)],imagePrompt:'A small shop with '+(index?'a porcelain cup':'a squirrel')+', wooden tokens and a worn ledger, scene '+i,activeCharacters:[name]}))};
 }
 async lesson(input:GenerationInput,_signal:AbortSignal):Promise<any>{const firstKind=(input.storyCount??input.stories.length)===1?'comprehension':'comparison';return {lesson:{definition:input.knowledge!.definition,principles:input.knowledge!.coreRelations,academicExplanation:'固定示例仅用于检查界面、保存与恢复。真实知识应经过独立学科审查。',mapping:input.stories.flatMap(s=>input.knowledge!.coreRelations.map((relation,i)=>({storyId:s.id,paragraphId:s.paragraphs[i].id,quote:s.paragraphs[i].text.slice(0,18),relation,explanation:'这一原文片段用于验证引用映射，不表示真实学术验证。'}))),boundaries:['这是固定流程资料，不能代表在线生成质量。','机器初检不能代替学科专家核验。'],workedExample:'从真实情境中先明确对象、条件和证据，再判断关系是否成立。'},tasks:[{id:'task-0',kind:firstKind,prompt:firstKind==='comprehension'?'故事中，角色记下改动及实际结果，体现了哪种关系？':'两则故事中，角色保留行动记录的共同作用是什么？',options:[{id:'a',text:'依据观察到的结果调整后续行动。'},{id:'b',text:'只要记录足够多，就不必再采取行动。'},{id:'c',text:'一次顺利就能证明今后总会顺利。'},{id:'d',text:'同一规则的效果不受现场条件影响。'}],correctAnswer:'a',explanation:'角色把改动与实际后果连起来，供下一次选择使用；记录本身不能保证成功，条件变化仍需重新观察。'},{id:'task-1',kind:'application',prompt:'社团改变物资领取路线后，准备决定是否沿用。哪种做法符合故事呈现的关系？',options:[{id:'a',text:'记录不同现场条件下的拥堵与领取结果，再调整路线。'},{id:'b',text:'第一次没有拥堵，就宣布所有活动都应使用这条路线。'},{id:'c',text:'删去不顺利的记录，让路线看起来始终有效。'},{id:'d',text:'只检查纸上路线能走通，无须观察现场结果。'}],correctAnswer:'a',explanation:'新情境也需要依据行动结果调整，并考察当时的条件；一次成功或纸面可行不能代替后续观察。'}],discussion:[{prompt:'如果现场条件改变，先前的记录还能支持哪些判断？',guidance:'列出改变的条件，区分已经观察到的事实与仍需核验的推断。'}]};}
 async review(_input:GenerationInput,_signal:AbortSignal):Promise<any>{return {passed:true,issues:[]};}
 async image(_input:ImageInput,_signal:AbortSignal):Promise<ImageResult>{const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a09kAAAAASUVORK5CYII=','base64');return {bytes,extension:'.png',hash:createHash('sha256').update(bytes).digest('hex'),metadata:{provenance:'preset',purpose:'local flow fixture'}};}
}
