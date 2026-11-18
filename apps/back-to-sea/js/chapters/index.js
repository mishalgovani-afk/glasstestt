// Chapter registry. Order = play order. Each module's default export follows the Chapter module
// API in DESIGN.md. DOM-free at import time (the level tests import this file under Node).
import kitchen from './ch1-kitchen.js';
import bathroom from './ch2-bathroom.js';
import laundry from './ch3-laundry.js';
import basement from './ch4-basement.js';
import finale from './ch5-finale.js';

export const CHAPTERS = [kitchen, bathroom, laundry, basement, finale];

/** Flat list of { chapter, chapterIndex, level, levelIndex, index } in play order. */
export const LEVELS = CHAPTERS.flatMap((chapter, chapterIndex) =>
  (chapter.levels || []).map((level, levelIndex) => ({ chapter, chapterIndex, level, levelIndex })),
).map((e, index) => ({ ...e, index }));

export function findLevel(id) {
  return LEVELS.find((e) => e.level.id === id) || null;
}
