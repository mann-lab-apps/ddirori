import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Verify the actual emitted PCM against the audible rests promised in the lesson.
export function verifyLessonAudio(dist) {
  for (const [name, bpm, rests] of [['easy', 80, [2]], ['standard', 100, [3]], ['challenge', 100, [2, 4]]]) {
    const pcm = fs.readFileSync(path.join(dist, 'lessons', 'audio', name + '.wav'));
    const sampleRate = pcm.readUInt32LE(24);
    assert.equal(pcm.toString('ascii', 8, 12), 'WAVE');
    assert.equal(pcm.readUInt32LE(40), pcm.length - 44);
    const beatSeconds = 60 / bpm;
    assert(Math.abs((pcm.length - 44) / (2 * sampleRate) - 12 * beatSeconds) < 1 / sampleRate);
    function peak(start, end) {
      let maximum = 0;
      for (let i = Math.ceil(start * sampleRate); i < end * sampleRate; i++) {
        maximum = Math.max(maximum, Math.abs(pcm.readInt16LE(44 + 2 * i)));
      }
      return maximum;
    }
    for (let beat = 0; beat < 12; beat++) {
      const start = beat * beatSeconds;
      assert(peak(start, start + 0.04) > 2000, name + ' time click present');
      const hasNote = beat >= 4 && !rests.includes(1 + beat % 4);
      const keyPeak = peak(start + .12, start + .25);
      assert(hasNote ? keyPeak > 2000 : keyPeak < 5, name + ' keyboard at beat ' + beat);
    }
  }
}
