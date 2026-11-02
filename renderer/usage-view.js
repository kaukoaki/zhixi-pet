'use strict';
(function(root){
  const isPro = plan => ['pro','prolite','promax'].includes(String(plan || '').toLowerCase().replace(/[_-]/g,''));
  function displayBuckets(usage) {
    return (usage?.buckets || []).map(bucket => ({ ...bucket, windows: (bucket.windows || []).filter(win => !isPro(usage.planType || bucket.planType) || win.durationMins === 10080) })).filter(bucket => bucket.windows.length);
  }
  const view = { isPro, displayBuckets };
  if(typeof module==='object' && module.exports) module.exports=view; else root.usageView=view;
})(globalThis);
