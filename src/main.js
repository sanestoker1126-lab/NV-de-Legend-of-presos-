import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-700.css';
import './style.css';
import { createPixiRenderer } from './pixi-renderer.js';
import { createMatch, stepMatch, startNextRound, setPaused, ARENA } from './engine.js';

const $ = id => document.getElementById(id);
const canvasHost = $('arena-viewport');
let pixiRenderer = null;
const assetUrl = path => `${import.meta.env.BASE_URL}${path}`;
const textures = new Map();
const keyboard = new Set();
const touch = new Map();
const queuedPresses = new Set();
const edgeControls = new Set(['jump', 'punch', 'kick', 'special', 'hidden']);
const keyMap = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'jump', ArrowUp: 'jump', KeyS: 'block', ArrowDown: 'block', KeyJ: 'punch', KeyK: 'kick', KeyL: 'special', KeyI: 'hidden' };
const colorways = ['#665a36', '#516442', '#4e5367', '#794e35', '#5b4259', '#485c5c'];
const hiddenPalette = { tobi: '#ff7847', mateo: '#b9dfe6', nadia: '#f3a8ff', semillas: '#d8e77a', oscuro: '#9a9fff', callejero: '#ffd483' };
let catalog;
let selectedFighter = 'tobi';
let selectedStage = 'patio';
let match = null;
let soundOn = false;
let lastFrame = performance.now();
let elapsed = 0;
let particles = [];
let wins = 0;
let displayedStatus = '';
let storySeen = false;
let tournament = null;
let campaign = null;
let introSequence = null;
let selectionPulse = 0;
const audioPool = new Map();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
try { wins = Math.max(0, Number.parseInt(localStorage.getItem('puente-grande-wins'), 10) || 0); } catch { /* Browser storage is optional. */ }
$('wins-count').textContent = String(wins).padStart(2, '0');

function announce(text) { $('announcement').textContent = text; }
function fighterById(id) { return catalog.fighters.find(fighter => fighter.id === id); }
function stageById(id) { return catalog.backgrounds.find(stage => stage.id === id); }
function loadImage(path) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { textures.set(path, image); resolve(image); };
    image.onerror = () => reject(new Error(`No se pudo cargar ${path}`));
    image.src = assetUrl(path);
  });
}

function buildSelection() {
  const ordered = [...catalog.fighters].sort((a, b) => (a.id === 'tobi' ? -1 : b.id === 'tobi' ? 1 : 0));
  for (const [index, fighter] of ordered.entries()) {
    const button = document.createElement('button');
    button.className = 'fighter-card';
    button.dataset.fighter = fighter.id;
    button.setAttribute('aria-label', `Elegir a ${fighter.name}`);
    button.setAttribute('aria-pressed', String(fighter.id === selectedFighter));
    button.style.setProperty('--fighter-color', colorways[index]);
    // Names and paths come from the validated local catalog, never injected markup.
    const portrait = document.createElement('div'); portrait.className = 'fighter-portrait';
    const number = document.createElement('span'); number.className = 'fighter-index'; number.textContent = `${String(index + 1).padStart(2, '0')} / PG`;
    const badge = document.createElement('span'); badge.className = 'fighter-badge'; badge.textContent = '✓'; badge.hidden = fighter.id !== selectedFighter;
    const imageCanvas = document.createElement('canvas'); imageCanvas.width = 240; imageCanvas.height = 180; imageCanvas.setAttribute('aria-hidden', 'true');
    portrait.append(number, imageCanvas, badge);
    const description = document.createElement('div'); description.className = 'fighter-description';
    const name = document.createElement('span'); name.className = 'fighter-name'; name.textContent = fighter.name.toUpperCase();
    const hint = document.createElement('span'); hint.textContent = fighter.id === selectedFighter ? 'ELEGIDO' : '+';
    description.append(name, hint); button.append(portrait, description);
    const bounds = fighter.portrait.alphaBounds;
    const scale = Math.min(150 / bounds.height, 160 / bounds.width);
    const ctx = imageCanvas.getContext('2d');
    ctx.drawImage(textures.get(fighter.path), bounds.x, bounds.y, bounds.width, bounds.height, 120 - bounds.width * scale / 2, 178 - bounds.height * scale, bounds.width * scale, bounds.height * scale);
    button.addEventListener('click', () => { if (!match) selectFighter(fighter.id); });
    $('fighters-grid').append(button);
  }
  const stages = [...catalog.backgrounds].sort((a, b) => (a.id === 'patio' ? -1 : b.id === 'patio' ? 1 : 0));
  for (const [index, stage] of stages.entries()) {
    const button = document.createElement('button'); button.className = 'stage-card'; button.dataset.stage = stage.id;
    button.setAttribute('aria-label', `Elegir escenario ${stage.name}`); button.setAttribute('aria-pressed', String(stage.id === selectedStage));
    const image = document.createElement('img'); image.src = assetUrl(stage.path); image.alt = ''; image.loading = 'lazy';
    const title = document.createElement('span'); title.textContent = stage.name.toUpperCase();
    const number = document.createElement('span'); number.className = 'stage-index'; number.textContent = String(index + 1).padStart(2, '0');
    button.append(image, title, number); button.addEventListener('click', () => { if (!match) selectStage(stage.id); });
    $('stages-grid').append(button);
  }
  selectFighter(selectedFighter);
  selectStage(selectedStage);
}

function selectFighter(id) {
  selectedFighter = id;
  selectionPulse = elapsed;
  document.querySelectorAll('[data-fighter]').forEach(button => {
    const selected = button.dataset.fighter === id;
    button.setAttribute('aria-pressed', String(selected));
    button.querySelector('.fighter-badge').hidden = !selected;
    button.querySelector('.fighter-description>span:last-child').textContent = selected ? 'ELEGIDO' : '+';
  });
  $('selected-label').textContent = `${fighterById(id).name.toUpperCase()} · LISTO PARA EL SIGUIENTE ROUND`;
  announce(`${fighterById(id).name} seleccionado`);
}
function selectStage(id) {
  selectedStage = id;
  document.querySelectorAll('[data-stage]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.stage === id)));
  $('stage-title').textContent = stageById(id).name.toUpperCase();
  const stageIndex = [...document.querySelectorAll('[data-stage]')].findIndex(button => button.dataset.stage === id) + 1;
  document.querySelector('.caption-label').textContent = `ESCENARIO ${String(stageIndex).padStart(2, '0')} / 05`;
  announce(`Escenario: ${stageById(id).name}`);
}
function lockSelection(locked) {
  document.querySelectorAll('[data-fighter],[data-stage]').forEach(button => button.disabled = locked);
  $('difficulty').disabled = locked;
  $('game-mode').disabled = locked;
}
function clearInput() {
  keyboard.clear(); touch.clear(); queuedPresses.clear();
  document.querySelectorAll('[data-control]').forEach(button => button.classList.remove('pressed'));
}
function getInput() {
  const input = {};
  for (const code of keyboard) input[keyMap[code]] = true;
  for (const control of touch.values()) input[control] = true;
  for (const control of queuedPresses) input[control] = true;
  return input;
}

function startGame() {
  if (!catalog) return;
  if (!storySeen && $('game-mode').value === 'story') {
    showMessage('EXPEDIENTE PUENTE GRANDE · 03:17 AM', 'EL RECUENTO NO CUADRA', 'Las luces del patio parpadean. Falta un preso, sobran rumores y los pasillos empiezan a cerrarse. Sobrevive a tres combates, reúne aliados y encuentra la ruta antes del amanecer.', 'COMENZAR EL ESCAPE', () => { storySeen = true; campaign = makeEscapeCampaign(); tournament = null; beginMatch(); });
    $('back-button').textContent = 'VOLVER AL PATIO';
    $('arena-shell').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center' });
    return;
  }
  if ($('game-mode').value === 'tournament') {
    const opponents = catalog.fighters.filter(fighter => fighter.id !== selectedFighter).map(fighter => fighter.id);
    tournament = { opponents: opponents.slice(0, Math.min(3, opponents.length)), index: 0, wins: 0 };
    campaign = null;
  } else if ($('game-mode').value === 'story') {
    campaign = makeEscapeCampaign();
    tournament = null;
  } else { tournament = null; campaign = null; }
  beginMatch();
}
function makeEscapeCampaign() {
  const opponents = catalog.fighters.filter(fighter => fighter.id !== selectedFighter).map(fighter => fighter.id);
  return { opponents: opponents.slice(0, Math.min(3, opponents.length)), index: 0, wins: 0 };
}
function beginMatch() {
  clearInput();
  const options = catalog.fighters.filter(fighter => fighter.id !== selectedFighter);
  const series = tournament || campaign;
  const opponentId = series ? series.opponents[series.index] : options[Math.floor(Math.random() * options.length)].id;
  const opponent = fighterById(opponentId);
  match = createMatch({ playerId: selectedFighter, opponentId: opponent.id, difficulty: $('difficulty').value, duration: 50 });
  setPaused(match, true);
  introSequence = { step: 0, remaining: 0.68, beats: [
    ['3', 'RECUENTO CERRADO', 'Las puertas se cierran. Nadie sale sin pelear.'],
    ['2', 'OJOS AL PATIO', 'Los que esperan al fondo ya eligieron bando.'],
    ['1', 'PREPARA EL ESCAPE', 'Golpea, conserva energía y busca tu oportunidad.'],
    ['¡PELEA!', 'SE ABRE EL PATIO', 'Cincuenta segundos. No los desperdicies.'],
  ] };
  particles = []; displayedStatus = '';
  $('hud').hidden = false; $('arena-caption').hidden = true;
  $('arena-message').hidden = true; $('pause-button').hidden = true; $('touch-controls').hidden = false;
  $('play-button').textContent = 'NUEVA PARTIDA';
  $('player-name').textContent = fighterById(selectedFighter).name.toUpperCase();
  $('opponent-name').textContent = `${opponent.name.toUpperCase()} · CPU`;
  lockSelection(true); updateHud();
  canvasHost.dataset.playerX = String(match.fighters.player.x);
  if (tournament) $('round-label').textContent = `TORNEO ${tournament.index + 1}/${tournament.opponents.length} · ROUND 1`;
  const beat = introSequence.beats[0];
  showMessage('CINEMÁTICA DE ENTRADA', beat[0], beat[2], 'SALTAR INTRO', finishIntro);
  $('message-eyebrow').textContent = beat[1];
  $('arena-shell').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center' });
}
function advanceIntro(dt) {
  if (!introSequence || !match) return;
  introSequence.remaining -= dt;
  if (introSequence.remaining > 0) return;
  introSequence.step += 1;
  if (introSequence.step >= introSequence.beats.length) { finishIntro(); return; }
  introSequence.remaining = 0.68;
  const beat = introSequence.beats[introSequence.step];
  $('message-eyebrow').textContent = beat[1];
  $('message-title').textContent = beat[0];
  $('message-copy').textContent = beat[2];
  $('message-title').style.animation = 'none'; void $('message-title').offsetWidth; $('message-title').style.animation = '';
}
function finishIntro() {
  introSequence = null;
  if (!match || match.status !== 'playing') return;
  setPaused(match, false);
  $('arena-message').hidden = true; $('pause-button').hidden = false;
  $('arena-state').textContent = 'EN COMBATE';
  playSound('entrada_g', 0.35); announce('¡PELEA! Tienes 50 segundos.');
  $('pause-button').focus({ preventScroll: true });
}
function returnToSelection() {
  match = null; tournament = null; campaign = null; introSequence = null; particles = []; clearInput();
  $('hud').hidden = true; $('arena-caption').hidden = false; $('arena-message').hidden = true;
  $('pause-button').hidden = true; $('touch-controls').hidden = true;
  $('play-button').textContent = 'INICIAR ESCAPE'; $('arena-state').textContent = 'EL PATIO TE ESPERA'; $('round-label').textContent = 'CAMPAÑA · 50 SEGUNDOS';
  $('back-button').textContent = 'ELEGIR LUCHADOR';
  lockSelection(false); selectFighter(selectedFighter);
  $('play-button').focus({ preventScroll: true });
}
function showMessage(eyebrow, title, copy, buttonText, action) {
  $('message-eyebrow').textContent = eyebrow; $('message-title').textContent = title; $('message-copy').textContent = copy;
  $('continue-button').textContent = buttonText; $('continue-button').onclick = action;
  $('arena-message').hidden = false;
  $('pause-button').hidden = true;
  $('continue-button').focus({ preventScroll: true });
  announce(`${title}. ${copy}`);
}
function pauseGame() {
  if (!match || match.status !== 'playing') return;
  if (match.paused) { resumeGame(); return; }
  setPaused(match, true); clearInput(); $('arena-state').textContent = 'PARTIDA EN PAUSA';
  showMessage('TÓMATE UN RESPIRO', 'PAUSA', 'El patio puede esperar un momento.', 'CONTINUAR', resumeGame);
}
function resumeGame() {
  if (!match || match.status !== 'playing') return;
  clearInput(); setPaused(match, false); $('arena-message').hidden = true; $('pause-button').hidden = false;
  $('pause-button').focus({ preventScroll: true }); displayedStatus = ''; updateHud();
}
function showResult() {
  if (match.status === 'roundOver') {
    const title = match.roundWinner === 'player' ? 'ROUND PARA TI' : match.roundWinner === 'draw' ? 'EMPATE' : 'ROUND PARA LA CPU';
    const { player, opponent } = match.fighters;
    const chapterBeat = campaign ? (campaign.index === 0 ? 'La pelea abre un hueco en el patio. Al fondo, alguien señala la puerta de servicio.' : campaign.index === 1 ? 'En los pasillos, las llaves suenan cada vez más cerca.' : 'La carretera ya se escucha detrás del último portón.') : tournament ? 'Cada victoria decide quién manda en el patio.' : match.round === 1 ? 'La pelea abre un hueco en el patio. Al fondo, alguien señala la puerta de servicio.' : 'Las sirenas se acercan. La ruta por los pasillos queda como única salida.';
    showMessage(`ROUND ${match.round} · ${tournament ? 'TORNEO DEL PATIO' : campaign ? 'CAPÍTULO DE FUGA' : 'COMBATE RÁPIDO'}`, title, `Marcador ${player.wins} — ${opponent.wins}. ${chapterBeat}`, 'SIGUIENTE ROUND', () => {
      clearInput(); startNextRound(match); displayedStatus = ''; particles = [];
      $('arena-message').hidden = true; $('pause-button').hidden = false; updateHud();
      $('pause-button').focus({ preventScroll: true });
    });
  } else if (match.status === 'finished') {
    const won = match.winner === 'player';
    const series = tournament || campaign;
    if (series && won && series.index < series.opponents.length - 1) {
      series.wins += 1;
      const nextName = fighterById(series.opponents[series.index + 1]).name;
      const isTournament = Boolean(tournament);
      const eyebrow = isTournament ? 'TORNEO DEL PATIO · CLASIFICACIÓN' : `CAPÍTULO ${series.index + 1} COMPLETADO`;
      const title = isTournament ? 'SIGUES EN PIE' : series.index === 0 ? 'LA PUERTA DE SERVICIO' : 'LA RUTA SE ABRE';
      const copy = isTournament ? `Combate ${series.index + 1} superado. El siguiente rival es ${nextName}. Cada victoria decide quién manda en el patio.` : series.index === 0 ? `El patio queda atrás. ${nextName} controla el pasillo que lleva a la zona de servicio. La fuga sigue.` : `Queda un último rival: ${nextName}. Detrás de él está la salida y ya se oyen las sirenas.`;
      showMessage(eyebrow, title, copy, isTournament ? 'SIGUIENTE COMBATE' : 'CONTINUAR LA FUGA', () => { series.index += 1; beginMatch(); });
      return;
    }
    if (won) {
      wins += 1; $('wins-count').textContent = String(wins).padStart(2, '0');
      try { localStorage.setItem('puente-grande-wins', String(wins)); } catch { /* Optional persistence. */ }
    }
    const title = tournament && won && tournament.index === tournament.opponents.length - 1 ? 'CAMPEÓN DEL PATIO' : campaign && won && campaign.index === campaign.opponents.length - 1 ? 'CRUZASTE EL PORTÓN' : won ? 'EL PATIO ES TUYO' : match.winner === 'draw' ? 'NADIE SE RINDE' : 'HABRÁ REVANCHA';
    const score = `${match.fighters.player.wins} — ${match.fighters.opponent.wins}`;
    const chapter = tournament ? (won && tournament.index === tournament.opponents.length - 1 ? 'Ganaste el torneo. El último portón queda a tu alcance.' : won ? 'Ganaste este combate, pero el torneo sigue.' : 'El torneo termina aquí. La fuga tendrá que esperar.') : campaign ? (won && campaign.index === campaign.opponents.length - 1 ? 'La ruta queda libre. Al amanecer, el patio ya es parte del pasado.' : 'La fuga se detiene aquí. El penal sigue en alerta y habrá que intentarlo otra vez.') : won ? 'El patio quedó atrás. La ruta de escape sigue abierta.' : 'Cada round deja una lección. El penal no ha terminado de contar tu historia.';
    showMessage(tournament ? 'TORNEO DEL PATIO · RESULTADO' : campaign ? 'EXPEDIENTE DE FUGA · FINAL' : 'COMBATE RÁPIDO · RESULTADO', title, `${score} · ${chapter}`, 'REPETIR', () => { tournament = null; campaign = null; startGame(); });
    if (tournament && (!won || tournament.index === tournament.opponents.length - 1)) tournament = null;
    if (campaign && (!won || campaign.index === campaign.opponents.length - 1)) campaign = null;
    playSound('remate_g', 0.3);
  }
}
function updateHud() {
  if (!match) return;
  for (const side of ['player', 'opponent']) {
    const fighter = match.fighters[side];
    $(`${side}-health`).style.width = `${fighter.health}%`;
    $(`${side}-health-text`).textContent = `${Math.ceil(fighter.health)} HP`;
    $(`${side}-energy`).style.width = `${fighter.energy}%`;
    $(`${side}-health`).parentElement.setAttribute('aria-valuenow', String(Math.ceil(fighter.health)));
    $(`${side}-energy`).parentElement.setAttribute('aria-valuenow', String(Math.round(fighter.energy)));
  }
  $('timer').textContent = String(Math.ceil(match.timeLeft)).padStart(2, '0');
  $('round-label').textContent = tournament ? `TORNEO ${tournament.index + 1}/${tournament.opponents.length} · ROUND ${match.round} · ${match.fighters.player.wins} — ${match.fighters.opponent.wins}` : campaign ? `CAPÍTULO ${campaign.index + 1}/${campaign.opponents.length} · ROUND ${match.round} · ${match.fighters.player.wins} — ${match.fighters.opponent.wins}` : `ROUND ${match.round} · ${match.fighters.player.wins} — ${match.fighters.opponent.wins}`;
  $('arena-state').textContent = match.paused ? 'PARTIDA EN PAUSA' : match.status === 'playing' ? 'EN COMBATE' : match.status === 'finished' ? 'PARTIDA COMPLETADA' : 'ROUND COMPLETADO';
}

function playSound(id, volume = 0.35) {
  if (!soundOn || !catalog) return;
  const metadata = catalog.audio.find(audio => audio.id === id);
  if (!metadata) return;
  let pool = audioPool.get(id);
  if (!pool) { pool = []; audioPool.set(id, pool); }
  let audio = pool.find(item => item.paused || item.ended);
  if (!audio && pool.length < 4) {
    // Use a typed source because some uploaded .wav files actually contain Ogg.
    audio = new Audio(); const source = document.createElement('source');
    source.src = assetUrl(metadata.path); source.type = metadata.mime; audio.append(source); pool.push(audio);
  }
  if (!audio) return;
  audio.currentTime = 0; audio.volume = volume;
  audio.play().catch(() => announce('No se pudo reproducir el sonido en este navegador. Puedes seguir jugando.'));
}
$('sound-toggle').addEventListener('click', () => {
  soundOn = !soundOn; $('sound-toggle').setAttribute('aria-pressed', String(soundOn));
  $('sound-toggle').setAttribute('aria-label', soundOn ? 'Desactivar sonido' : 'Activar sonido');
  $('sound-label').textContent = soundOn ? 'Sonido activado' : 'Sonido apagado';
  if (soundOn) playSound('punchLight', 0.3);
  else for (const pool of audioPool.values()) for (const audio of pool) audio.pause();
});

function handleEvents() {
  for (const event of match.events) {
    if (event.type === 'hit') {
      if (!reducedMotion) {
        const count = event.attack === 'hidden' ? 42 : event.attack === 'special' ? 22 : event.blocked ? 10 : 16;
        const color = event.blocked ? '#b9dfe6' : event.attack === 'hidden' ? (hiddenPalette[match.fighters[event.side].id] || '#ff7847') : event.attack === 'special' ? '#ff7847' : '#ffd483';
        for (let i = 0; i < count; i += 1) {
          const angle = (Math.PI * 2 * i / count) + Math.random() * 0.25;
          const speed = event.attack === 'hidden' ? 110 + Math.random() * 330 : 70 + Math.random() * 220;
          const maxLife = event.attack === 'hidden' ? 0.72 : 0.42;
          particles.push({ x: event.x, y: ARENA.groundY - event.y - 100, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 55, life: maxLife, maxLife, size: 2 + Math.random() * (event.attack === 'hidden' ? 7 : 4), color, shape: i % 3 === 0 ? 'ring' : i % 2 ? 'streak' : 'spark' });
        }
      }
      playSound(event.blocked ? 'grab' : 'punchHeavy', event.attack === 'hidden' ? 0.5 : 0.25);
    } else if (event.type === 'hiddenSpecial') {
      const fighter = match.fighters[event.side];
      const color = hiddenPalette[fighter.id] || '#ff7847';
      if (!reducedMotion) for (let i = 0; i < 24; i += 1) particles.push({ x: fighter.x, y: ARENA.groundY - 115, vx: (Math.random() - 0.5) * 180, vy: (Math.random() - 0.5) * 200, life: 0.65, maxLife: 0.65, size: 4 + Math.random() * 6, color, shape: 'ring' });
      announce(`${fighterById(fighter.id).name.toUpperCase()} · ESPECIAL OCULTO`);
      playSound('special', 0.5);
    } else if (event.type === 'punch') playSound('punchLight', 0.25);
    else if (event.type === 'kick') playSound('kickLight', 0.3);
    else if (event.type === 'special') playSound('special', 0.3);
  }
}
function render(dt) {
  if (!catalog) return;
  if (!match?.paused || introSequence) { for (const particle of particles) { particle.life -= dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += (particle.shape === 'ring' ? 0 : 320) * dt; } }
  particles = particles.filter(particle => particle.life > 0);
  pixiRenderer?.draw({ stage: selectedStage, catalog, match, selectedFighter, elapsed, particles, selectionPulse, introStep: introSequence?.step ?? -1 });
}
function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05); lastFrame = now;
  if (!match?.paused || introSequence) elapsed += dt;
  if (introSequence) advanceIntro(dt);
  else if (match && !match.paused && match.status === 'playing') {
    stepMatch(match, dt, getInput()); queuedPresses.clear(); handleEvents(); updateHud();
    canvasHost.dataset.playerX = String(match.fighters.player.x);
    if (match.status !== 'playing' && match.status !== displayedStatus) { displayedStatus = match.status; showResult(); }
  }
  render(dt); requestAnimationFrame(frame);
}

$('play-button').addEventListener('click', startGame);
$('pause-button').addEventListener('click', pauseGame);
$('back-button').addEventListener('click', returnToSelection);
window.addEventListener('keydown', event => {
  if (event.code === 'Escape' && match && match.status === 'playing') { event.preventDefault(); if (!event.repeat) { if (introSequence) finishIntro(); else pauseGame(); } return; }
  if (!keyMap[event.code] || !match || introSequence || match.paused || match.status !== 'playing' || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
  event.preventDefault(); keyboard.add(event.code);
  if (!event.repeat && edgeControls.has(keyMap[event.code])) queuedPresses.add(keyMap[event.code]);
});
window.addEventListener('keyup', event => {
  keyboard.delete(event.code);
  if (event.code === 'Space' || event.code === 'Enter') {
    for (const key of touch.keys()) if (String(key).startsWith('key-')) touch.delete(key);
    document.querySelectorAll('[data-control]').forEach(button => {
      if (![...touch.values()].includes(button.dataset.control)) button.classList.remove('pressed');
    });
  }
});
window.addEventListener('blur', () => { clearInput(); if (match?.status === 'playing' && !match.paused) pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (match?.status === 'playing' && !match.paused) pauseGame(); } });
for (const button of document.querySelectorAll('[data-control]')) {
  button.addEventListener('pointerdown', event => {
    if (!match || introSequence || match.paused || match.status !== 'playing') return;
    event.preventDefault(); button.setPointerCapture(event.pointerId); touch.set(event.pointerId, button.dataset.control); button.classList.add('pressed');
    if (edgeControls.has(button.dataset.control)) queuedPresses.add(button.dataset.control);
  });
  const release = event => { touch.delete(event.pointerId); if (![...touch.values()].includes(button.dataset.control)) button.classList.remove('pressed'); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  // Keyboard users can activate the visible control buttons too.
  button.addEventListener('keydown', event => {
    if ((event.code === 'Space' || event.code === 'Enter') && match?.status === 'playing' && !introSequence && !match.paused) {
      event.preventDefault(); touch.set(`key-${button.dataset.control}`, button.dataset.control); button.classList.add('pressed');
      if (!event.repeat && edgeControls.has(button.dataset.control)) queuedPresses.add(button.dataset.control);
    }
  });
  button.addEventListener('keyup', event => { if (event.code === 'Space' || event.code === 'Enter') { touch.delete(`key-${button.dataset.control}`); button.classList.remove('pressed'); } });
  button.addEventListener('blur', () => { touch.delete(`key-${button.dataset.control}`); button.classList.remove('pressed'); });
  button.addEventListener('click', event => {
    if (event.detail !== 0 || !match || introSequence || match.paused || match.status !== 'playing') return;
    const key = `assistive-${button.dataset.control}`;
    touch.set(key, button.dataset.control);
    if (edgeControls.has(button.dataset.control)) queuedPresses.add(button.dataset.control);
    setTimeout(() => touch.delete(key), 100);
  });
}

async function init() {
  try {
    const response = await fetch(assetUrl('assets/catalog.json'));
    if (!response.ok) throw new Error('Catálogo no disponible');
    catalog = await response.json();
    await Promise.all([...catalog.fighters, ...catalog.backgrounds].map(item => loadImage(item.path)));
    pixiRenderer = await createPixiRenderer(canvasHost, { assetUrl, reducedMotion });
    await pixiRenderer.preload(catalog);
    $('loading-message').hidden = true; $('play-button').disabled = false;
    $('arena-state').textContent = 'EL PATIO TE ESPERA'; $('play-button').textContent = 'INICIAR ESCAPE'; $('round-label').textContent = 'CAMPAÑA · 50 SEGUNDOS'; buildSelection(); requestAnimationFrame(frame);
  } catch (error) {
    $('loading-message').textContent = 'No pudimos cargar el patio. Recarga la página para intentarlo de nuevo.';
    announce('Error al cargar los recursos del juego.'); console.error(error);
  }
}
init();
