'use strict';
// Production batches keep their original cuts. Ready enhancements replace one
// existing slot without registering a duplicate action or losing its old media.
function resolvePomodoroSegments(manifest) {
  const segments = manifest.batches.flatMap(batch => batch.segments);
  const ids = new Set(segments.map(segment => segment.id)), replacements = new Map();
  if (ids.size !== segments.length) throw new Error('Duplicate pomodoro action in production batches');
  for (const variant of manifest.enhancements || []) {
    if (variant.status !== 'ready') continue;
    if (!ids.has(variant.replaces) || replacements.has(variant.replaces) || !variant.media || !variant.metadata || !variant.qa) throw new Error('Invalid ready pomodoro enhancement: ' + variant.id);
    replacements.set(variant.replaces, variant);
  }
  return segments.map(segment => replacements.has(segment.id)
    ? { ...segment, ...replacements.get(segment.id), id: segment.id, variantId: replacements.get(segment.id).id }
    : { ...segment });
}
module.exports = { resolvePomodoroSegments };
