// Build output also works when a teacher opens the files directly.
(() => {
  const audio = document.querySelector('#rhythm');
  const audioFile = document.querySelector('#audio-file');
  const errorMessage = document.querySelector('.audio-error');
  audio.addEventListener('error', () => { audioFile.href = audio.currentSrc || audio.src; errorMessage.hidden = false; });
  audio.addEventListener('loadedmetadata', () => { errorMessage.hidden = true; });
  if (audio.error) errorMessage.hidden = false;

  const home = document.body.dataset.lesson === 'home';
  let level = home ? 'easy' : 'standard';
  const playButton = document.querySelector('#toggle-play');
  const playLabel = document.querySelector('#play-label');
  const phase = document.querySelector('#phase');
  document.querySelector('.transport').hidden = false;
  document.querySelector('.native-transport').open = false;

  function updateTransport() {
    const beat = Math.floor(audio.currentTime * lessonPatterns[level].bpm / 60);
    const playing = !audio.paused && !audio.ended;
    const label = playing ? '잠시 멈춤' : (audio.ended ? '다시 듣기' : (audio.currentTime ? '이어서 듣기' : '리듬 재생'));
    playLabel.textContent = label;
    playButton.classList.toggle('is-playing', playing);
    phase.textContent = audio.ended ? '듣기 완료' : (beat >= 8 ? '두 번째 듣기' : (beat >= 4 ? '첫 번째 듣기' : '준비 박자'));
  }

  for (const event of ['play', 'pause', 'ended', 'timeupdate', 'emptied']) audio.addEventListener(event, updateTransport);
  playButton.addEventListener('click', () => {
    if (!audio.paused) return audio.pause();
    audio.play().catch(error => { if (error.name !== 'AbortError') errorMessage.hidden = false; });
  });
  updateTransport();

  if (home) {
    const result = document.querySelector('#choice-result');
    const choices = document.querySelectorAll('.choices button');
    choices.forEach(button => button.addEventListener('click', () => {
      const correct = lessonPatterns.easy.notes[Number(button.value) - 1] === 0;
      choices.forEach(choice => choice.removeAttribute('data-result'));
      button.dataset.result = correct ? 'right' : 'retry';
      document.querySelector('#bach-response').hidden = !correct;
      result.textContent = correct
        ? '맞았어요! 둘째 박에는 발끝만 짚고 손뼉은 한 번 쉬어요.'
        : '다시 들어볼까요? 발로 박을 세며 톡 소리만 들리는 자리를 찾아요.';
    }));
    return;
  }

  const board = [...document.querySelectorAll('.beats span')];
  const tempo = document.querySelector('#tempo');
  const answer = document.querySelector('#answer');
  const answerText = document.querySelector('#answer-text');
  const levels = document.querySelectorAll('input[name="pattern"]');
  const video = document.querySelector('video');
  const example = document.querySelector('#sound-example');
  const examples = document.querySelectorAll('[data-sound]');
  function clearExample() { examples.forEach(button => button.classList.remove('sounding')); }
  examples.forEach(button => button.addEventListener('click', () => {
    audio.pause();
    video.pause();
    clearExample();
    example.src = './audio/' + button.dataset.sound + '.wav';
    button.classList.add('sounding');
    example.play().catch(error => {
      if (error.name !== 'AbortError') {
        clearExample();
        errorMessage.hidden = false;
        audioFile.href = example.src;
      }
    });
  }));
  example.addEventListener('ended', clearExample);
  function stopExample() { example.pause(); clearExample(); }
  const keyBeats = document.querySelector('.key-beats');
  function showKeys(notes) {
    const tiles = notes.map(note => {
      const tile = document.createElement('span');
      tile.className = note ? 'note' : 'rest';
      tile.textContent = note ? '소리' : '쉼';
      return tile;
    });
    keyBeats.replaceChildren(...tiles);
  }
  showKeys(lessonPatterns[level].notes);
  let animation;
  let displayedBeat = -1;

  function highlight(beat) {
    if (beat === displayedBeat) return;
    board.forEach((tile, index) => tile.classList.toggle('on-beat', index === beat));
    displayedBeat = beat;
  }

  function followAudio() {
    const beatDuration = 60 / lessonPatterns[level].bpm;
    highlight(Math.floor(audio.currentTime / beatDuration) % 4);
    if (!audio.paused && !audio.ended) animation = requestAnimationFrame(followAudio);
  }

  function resetBeat() {
    cancelAnimationFrame(animation);
    highlight(-1);
  }

  const ordinals = ['첫', '두', '세', '네'];
  function setLevel(key) {
    audio.pause();
    stopExample();
    resetBeat();
    level = key;
    const pattern = lessonPatterns[key];
    showKeys(pattern.notes);
    audio.src = './audio/' + key + '.wav';
    audioFile.href = audio.src;
    errorMessage.hidden = true;
    tempo.textContent = pattern.bpm + ' BPM';
    const rests = pattern.notes.flatMap((note, i) => note === 0 ? [ordinals[i] + ' 번째 박'] : []);
    answer.open = false;
    answerText.textContent = rests.join('과 ') + '에서 건반이 쉬어요. 발끝은 계속 움직여요.';
  }

  levels.forEach(input => input.addEventListener('change', () => setLevel(input.value)));
  // Keep restored radio selections in sync after browser history navigation.
  const selected = [...levels].find(input => input.checked);
  if (selected && selected.value !== level) setLevel(selected.value);
  audio.addEventListener('play', () => {
    video.pause();
    stopExample();
    resetBeat();
    followAudio();
  });
  audio.addEventListener('pause', resetBeat);
  audio.addEventListener('ended', resetBeat);
  video.addEventListener('play', () => { audio.pause(); stopExample(); });

  // Register listeners immediately so a quick play is counted even while GA loads.
  const production = ['ddirori.com', 'www.ddirori.com'].includes(location.hostname);
  const params = new URLSearchParams(location.search);
  const analytics = production
    ? import('../analytics.js').then(module => { void module.configureAnalytics(); return module; }).catch(() => null)
    : null;
  function record(name, details = {}) {
    analytics?.then(module => module?.trackEvent(name, { content_type: 'free_lesson', ...details }));
  }
  const shared = params.get('utm_source') === 'teacher' && params.get('utm_medium') === 'referral';
  const entry = shared ? 'teacher_share' : (params.get('from') === 'homepage' ? 'homepage' : 'other');
  record('lesson_view', { location: entry });

  const activities = [...document.querySelectorAll('audio[data-activity]')];
  const materials = [audio, video, ...activities];
  const played = new Set();
  const ended = new Set();
  for (const media of materials) {
    const slug = media.dataset.activity || 'missing-beat';
    function context() {
      return {
        content_slug: slug, location: entry, activity_context: media === video ? 'video' : 'audio',
        difficulty: media === audio ? level : (media === video ? 'standard' : undefined),
      };
    }
    media.addEventListener('playing', () => {
      if (played.has(slug)) return;
      if (!played.size) record('lesson_start', context());
      played.add(slug);
      record('lesson_activity_play', context());
    });
    media.addEventListener('ended', () => {
      if (!played.has(slug) || ended.has(slug)) return;
      ended.add(slug);
      record('lesson_activity_end', context());
    });
  }
  // Only one teaching sound should be playing, including the short instrument demos.
  document.addEventListener('play', event => {
    if (!(event.target instanceof HTMLMediaElement)) return;
    for (const media of [...materials, example]) {
      if (media !== event.target && !media.paused) media.pause();
    }
  }, true);

  const homeLink = document.querySelector('#home-link');
  function installCopy(button, url, status, field, eventName, label) {
    button.addEventListener('click', async () => {
      field.hidden = true;
      try {
        await navigator.clipboard.writeText(url.href);
        status.textContent = label + ' 주소를 복사했어요.';
        record(eventName);
      } catch {
        field.value = url.href;
        field.hidden = false;
        field.focus();
        field.select();
        status.textContent = '선택된 주소를 복사해 주세요.';
      }
      if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || location.protocol === 'file:') {
        status.textContent += ' 현재 주소는 이 기기의 미리보기용이에요.';
      }
    });
  }
  const teacherUrl = new URL(location.protocol === 'file:' ? './index.html' : './', location.href);
  teacherUrl.search = new URLSearchParams({ utm_source: 'teacher', utm_medium: 'referral', utm_campaign: 'free_lessons' });
  installCopy(document.querySelector('#copy-teacher'), teacherUrl, document.querySelector('#teacher-status'),
    document.querySelector('#teacher-url'), 'lesson_teacher_share', '교사용');
  installCopy(document.querySelector('#copy-home'), new URL(homeLink.href), document.querySelector('#share-status'),
    document.querySelector('#share-url'), 'lesson_home_copy', '연습');
  homeLink.addEventListener('click', () => record('lesson_home_open'));
  document.querySelector('#print-sheet').addEventListener('click', () => {
    record('lesson_print_request');
    window.print();
  });
  document.querySelector('[data-event="lesson_use_draft"]').addEventListener('click', () => record('lesson_use_draft'));
})();
