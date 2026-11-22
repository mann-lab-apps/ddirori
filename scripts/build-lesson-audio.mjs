import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Each entry is one beat. Zero keeps the time click and silences the keyboard.
const patterns = {
  easy: { bpm: 80, notes: [294, 0, 370, 440] },
  standard: { bpm: 100, notes: [294, 330, 0, 440] },
  challenge: { bpm: 100, notes: [294, 0, 370, 0] },
};

function renderSequence(bpm, notes, withClick = true, gains = []) {
  const sampleRate = 22050;
  const beatSeconds = 60 / bpm;
  const samples = Math.ceil(notes.length * beatSeconds * sampleRate);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const seconds = i / sampleRate;
    const beat = Math.floor(seconds / beatSeconds);
    const t = seconds - beat * beatSeconds;
    const angle = 2 * Math.PI * t;
    const clickHz = beat % 4 === 0 ? 1430 : 1050;
    const click = 0.34 * Math.min(t / 0.002, 1) * Math.exp(-85 * t) * Math.sin(angle * clickHz);
    const pitch = notes[beat] ?? 0;
    const envelope = Math.min(t / 0.008, 1) * Math.exp(-6 * t) * Math.max(0, Math.min((0.44 - t) / 0.06, 1));
    const key = (gains[beat] ?? 1) * envelope * (0.50 * Math.sin(angle * pitch) + 0.16 * Math.sin(angle * pitch * 2));
    buffer.writeInt16LE(Math.round(((withClick ? click : 0) + key) * 30000), 44 + i * 2);
  }
  return buffer;
}

export function buildLessonAudio(lessonDir) {
  const audioDir = path.join(lessonDir, 'audio');
  mkdirSync(audioDir, { recursive: true });
  for (const [key, pattern] of Object.entries(patterns)) {
    const notes = [0, 0, 0, 0, ...pattern.notes, ...pattern.notes];
    writeFileSync(path.join(audioDir, key + '.wav'), renderSequence(pattern.bpm, notes));
  }
  writeFileSync(path.join(audioDir, 'clock.wav'), renderSequence(100, [0, 0]));
  writeFileSync(path.join(audioDir, 'key.wav'), renderSequence(100, [294, 330], false));
  writeFileSync(path.join(audioDir, 'dynamics.wav'), renderSequence(80, [330, 330, 330, 330], false, [1, 0.24, 1, 0.24]));
  writeFileSync(path.join(audioDir, 'melody.wav'), renderSequence(90, [262, 294, 330, 392, 0, 392, 330, 294, 262], false));
  writeFileSync(path.join(audioDir, 'echo.wav'), renderSequence(90, [330, 0, 330, 330, 0, 0, 0, 0]));
  // A classic script keeps the built lesson usable directly from a local file.
  writeFileSync(path.join(audioDir, 'patterns.js'), 'const lessonPatterns = ' + JSON.stringify(patterns) + ';\n');
}
