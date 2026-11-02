'use strict';
// Run while the pet is closed so two processes cannot overwrite its settings.
const path = require('node:path');
const { PetStore } = require('../main/store.cjs');
async function main() {
  const [id, source, enter, hold, exit] = process.argv.slice(2);
  if (!id || !source || !process.env.APPDATA) throw new Error('Usage: node scripts/import-action.cjs <slot-id> <video-file> (pet must be closed)');
  const root = path.resolve(__dirname, '..');
  const store = new PetStore(path.join(process.env.APPDATA, 'QiqiCodexPet'), root);
  if (id === 'drag-pack' && (!enter || !hold || !exit)) throw new Error('Usage: node scripts/import-action.cjs drag-pack <preview> <enter> <hold> <exit> (pet must be closed)');
  const result = id === 'drag-pack'
    ? await store.importDragPack({ preview: path.resolve(source), enter: path.resolve(enter), hold: path.resolve(hold), exit: path.resolve(exit) })
    : await store.importAction(id, path.resolve(source));
  const slotId = id === 'drag-pack' ? 'drag' : id;
  const slot = slotId === 'idle' ? result.idle : [...result.actions,...result.pomodoroActions,...(result.gardenActions||[])].find(action => action.id === slotId);
  console.log(JSON.stringify({ installed: slotId, name: slot.media.name, phases: Object.keys(slot.media.phases || {}), scale: result.settings.scale, actionVideos: result.actions.filter(action => action.media).length }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
