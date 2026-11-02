'use strict';
const {EventEmitter}=require('node:events'),{CodexTaskRunner}=require('./codex-bridge.cjs'),{CodexInteractiveRunner}=require('./codex-interactive.cjs');
class TaskRunner extends EventEmitter{
  constructor(options={}){super();this.cli=options.cli||new CodexTaskRunner(options);this.interactive=options.interactive||new CodexInteractiveRunner(options);for(const runner of [this.cli,this.interactive])runner.on('event',event=>this.emit('event',event));}
  get tasks(){return new Map([...this.cli.tasks,...this.interactive.tasks]);}
  start(prompt,options={}){if(this.tasks.size)throw new Error('已有任务在执行，请完成或停止后重试。');return options.runtime?.approvalPolicy==='never'?this.cli.start(prompt,options):this.interactive.start(prompt,options);}
  cancel(id=this.tasks.keys().next().value){return this.cli.cancel(id)||this.interactive.cancel(id);}
  respondApproval(taskId,id,decision){return this.interactive.respondApproval(taskId,id,decision);}
  dispose(){this.cli.dispose();this.interactive.dispose();}
  getActiveTasks(){return [...this.cli.getActiveTasks(),...this.interactive.getActiveTasks()];}
}
module.exports={TaskRunner};
