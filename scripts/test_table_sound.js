// The table sounds' pure parts: which sound an action or log entry makes, and the per-kind rate limit.
import assert from 'node:assert';
const { kindOf, soundsFor, allow, play, soundOn } = await import('../app/js/table/sound.js');

const mv = (zone, seat = 2, extra = {}) => ({ type: 'move', seat, to: { seat, zone }, cards: [{ zone: 'hand' }], ...extra });
assert.equal(kindOf(mv('battlefield')), 'play');
assert.equal(kindOf(mv('hand')), 'draw');
assert.equal(kindOf(mv('library', 2, { shuffle: true })), 'shuffle');
assert.equal(kindOf({ type: 'tap', tapped: true }), 'tap');
assert.equal(kindOf({ type: 'tap', tapped: false }), 'untap');
assert.equal(kindOf({ type: 'life', delta: -1 }), null);
assert.deepEqual(soundsFor([mv('battlefield', 1)], 1), [], 'your own echo is silent');
assert.deepEqual(soundsFor([mv('battlefield', 2)], 1), ['play'], 'an opponent plays a card');
assert.deepEqual(soundsFor(Array.from({ length: 7 }, () => ({ type: 'tap', seat: 2, tapped: false })), 1), ['untap'], 'seven untaps are one sound');
assert.ok(allow({}, 'tap', 0) && !allow({ tap: 100 }, 'tap', 130) && allow({ tap: 100 }, 'tap', 160) && allow({ tap: 100 }, 'draw', 110), 'one sound per kind per 60 ms');
assert.equal(soundOn(), false);
assert.equal(play('tap'), false, 'off means nothing');
console.log('table sound: mapping, echo, burst, rate limit and off all hold');
