const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const source = html.slice(html.indexOf('async function regenerateTasks(){'), html.indexOf('function renderTaskCards(){'));
const nodes = new Map();
const $ = id => {
  if (!nodes.has(id)) nodes.set(id, { value: '', disabled: false, innerHTML: '', classList: { add(){}, remove(){} } });
  return nodes.get(id);
};
const original = [{ variant_label: 'A안', items: [{text:'기존 과제'}] }];
const state = { methods:[], orientations:[], selectedStandard:{code:'test', standard_text:'성취기준'}, contextNote:'수업', taskDrafts:[], groundingChunks:[], taskVariants:original, selectedTaskIdx:0, rubricVariants:[{}], selectedRubricIdx:0, revisionCounts:{task:0} };
let prompts=[], searches=[], patches=[], fail=false;
const context = { state, $, console, buildStandardBlock:()=> '확정한 성취기준 및 수준', ensureAgentSession:async()=>{}, renderTaskCards(){}, renderTaskDrafts(){}, renderGrounding(){}, docTypeLabel:x=>x, showMsg:(node,text)=>node.message=text, retryStatusMsg:()=>'',
  callLLM:async (system,prompt)=>{ prompts.push(prompt); if(fail)throw Error('테스트 오류'); return prompts.length%2 ? [{variant_label:'초안',evaluation_elements:['요소'],key_search_terms:['핵심어']}] : [{variant_label:'새 안',items:[{text:'새 과제'}]}]; },
  gatherDiverseGrounding:async q=>{searches.push(q);return [];},
  pgInsert:async()=>[{id:1}], pgPatch:async (...args)=>{patches.push(args);}
};
vm.createContext(context); vm.runInContext(source,context);
(async()=>{
  await context.regenerateTasks(); assert.equal(prompts.length,0);
  $('taskRegenerateInput').value='개인 활동으로 바꾸고 20분 이내로 구성해주세요';
  fail=true; await context.regenerateTasks();
  assert.equal(state.taskVariants, original); assert.equal(state.selectedTaskIdx,0);
  assert.equal(state.rubricVariants.length,1); assert.ok($('taskRegenerateInput').value);
  assert.equal(state.taskGenerationBusy,false); assert.equal($('btnRegenerateTasks').disabled,false);
  fail=false; prompts=[]; await context.regenerateTasks();
  assert.equal(prompts.length,2);
  for(const p of prompts){assert.ok(p.includes('개인 활동'));assert.ok(p.includes('기존 과제'));}
  assert.ok(searches[0].includes('개인 활동'));
  assert.equal(state.selectedTaskIdx,-1); assert.equal(state.selectedRubricIdx,-1);
  assert.equal(state.rubricVariants.length,0); assert.equal(state.revisionCounts.task,1);
  assert.ok(patches.some(p=>p[2].selected_task===null && p[2].selected_rubric===null));
  state.taskGenerationBusy=true; await context.regenerateTasks(); assert.equal(prompts.length,2);
  console.log('PASS: blank comment, failure recovery, feedback in both prompts and search, stale selection reset, duplicate request guard');
})().catch(error=>{console.error(error);process.exitCode=1;});
