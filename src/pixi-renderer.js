import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { ARENA } from './engine.js';

/**
 * Renderer adapter for the existing combat engine. Combat simulation stays in
 * engine.js and coordinates stay in the original 960x420 arena space.
 */
export async function createPixiRenderer(host, { assetUrl, reducedMotion = false } = {}) {
  const app = new Application();
  await app.init({
    resizeTo: host,
    background: '#10160f',
    antialias: false,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    powerPreference: 'high-performance',
    preference: 'webgl',
    autoStart: false,
  });

  app.canvas.id = 'game-canvas';
  app.canvas.setAttribute('aria-label', 'Arena de combate de Puente Grande');
  app.canvas.setAttribute('role', 'img');
  Object.assign(app.canvas.style, { width: '100%', height: '100%', display: 'block' });
  host.replaceChildren(app.canvas);

  const scene = new Container();
  const backgroundLayer = new Container();
  const audienceLayer = new Container();
  audienceLayer.sortableChildren = true;
  const fighterLayer = new Container();
  fighterLayer.sortableChildren = true;
  const fxLayer = new Container();
  const particlePool = Array.from({ length: 72 }, () => new Graphics());
  fxLayer.addChild(...particlePool);
  scene.addChild(backgroundLayer, audienceLayer, fighterLayer, fxLayer);
  app.stage.addChild(scene);

  const textureCache = new Map();
  const frameTextureCache = new Map();
  const spriteCache = new Map();
  const shadowCache = new Map();
  const feedbackCache = new Map();
  let background = null;
  let shade = null;
  let destroyed = false;

  const layout = () => {
    const scale = Math.min(host.clientWidth / ARENA.width, host.clientHeight / ARENA.height);
    scene.scale.set(Number.isFinite(scale) && scale > 0 ? scale : 1);
    scene.position.set(
      Math.max(0, (host.clientWidth - ARENA.width * scene.scale.x) / 2),
      Math.max(0, (host.clientHeight - ARENA.height * scene.scale.y) / 2),
    );
  };

  async function preload(catalog) {
    const paths = [...new Set([
      ...catalog.fighters.map(fighter => fighter.path),
      ...catalog.backgrounds.map(stage => stage.path),
    ])];
    await Promise.all(paths.map(async path => {
      const url = assetUrl(path);
      if (!textureCache.has(url)) textureCache.set(url, await Assets.load(url));
    }));
  }

  function textureFor(path) {
    const url = assetUrl(path);
    const texture = textureCache.get(url);
    if (!texture) throw new Error(`Atlas PixiJS no precargado: ${path}`);
    return texture;
  }

  function frameTextureFor(info, baseTexture, row, column) {
    const url = assetUrl(info.path);
    const key = `${url}:${row}:${column}`;
    if (!frameTextureCache.has(key)) {
      const frame = new Rectangle(
        column * info.frameWidth, row * info.frameHeight,
        info.frameWidth, info.frameHeight,
      );
      frameTextureCache.set(key, new Texture({ source: baseTexture.source, frame }));
    }
    return frameTextureCache.get(key);
  }

  function setBackground(path) {
    if (background?.label === path) return;
    const texture = textureFor(path);
    if (background) backgroundLayer.removeChild(background);
    background = new Sprite(texture);
    background.label = path;
    background.width = ARENA.width;
    background.height = ARENA.height;
    backgroundLayer.addChild(background);
    if (shade) backgroundLayer.removeChild(shade);
    shade = new Graphics().rect(0, 0, ARENA.width, ARENA.height).fill({ color: 0x07100b, alpha: 0.13 });
    backgroundLayer.addChild(shade);
  }

  function renderFighter(fighter, info, time, slot, options = {}) {
    if (!info) return;
    const baseTexture = textureFor(info.path);
    const action = fighter.action === 'hit' ? 'hurt' : ['special', 'hidden'].includes(fighter.action) ? 'punch' : fighter.action;
    const animation = info.animations[action] || info.animations.idle;
    const frame = Math.floor((reducedMotion && slot.startsWith('preview') ? 0 : time) * (action === 'idle' ? 7 : 15)) % animation.frames;
    const column = animation.startColumn + frame;
    const frameTexture = frameTextureFor(info, baseTexture, animation.row, column);
    const key = slot;
    let sprite = spriteCache.get(key);
    if (!sprite) {
      sprite = new Sprite(frameTexture);
      sprite.anchor.set(0.5, 1);
      spriteCache.set(key, sprite);
      (options.audience ? audienceLayer : fighterLayer).addChild(sprite);
    } else if (sprite.texture !== frameTexture) {
      sprite.texture = frameTexture;
    }
    const scale = (info.frameHeight === 120 ? 1.92 : 1.72) * (options.scaleMultiplier || 1);
    sprite.scale.set(scale * fighter.facing, scale);
    sprite.x = fighter.x;
    sprite.y = ARENA.groundY + 5 - fighter.y + 12 + (options.verticalOffset || 0);
    sprite.zIndex = Math.round(fighter.x);
    sprite.visible = true;
    sprite.alpha = options.alpha ?? 1;
    sprite.tint = options.audience ? 0x9aa18b : fighter.action === 'special' && !reducedMotion ? 0xffd8b2 : fighter.action === 'hidden' && !reducedMotion ? 0xff7a4b : 0xffffff;

    // Preserve the legacy renderer's readable guard and special-move cues.
    let feedback = options.audience ? null : feedbackCache.get(key);
    if (!options.audience && !feedback) {
      feedback = new Graphics();
      feedbackCache.set(key, feedback);
      fighterLayer.addChild(feedback);
    }
    if (feedback) {
    feedback.clear();
    feedback.visible = false;
    if (fighter.action === 'block') {
      feedback.arc(0, -95, 57, -1.4, 1.4).stroke({ color: 0xacd9ea, alpha: 0.6, width: 3 });
      feedback.visible = true;
    } else if (fighter.action === 'special' && !reducedMotion) {
      const radius = 48 + Math.sin(time * 16) * 8;
      feedback.arc(36, -90, radius, -1.3, 1.3).stroke({ color: 0xff7847, alpha: 0.4, width: 7 });
      feedback.visible = true;
    } else if (fighter.action === 'hidden' && !reducedMotion) {
      const radius = 65 + Math.sin(time * 23) * 10;
      feedback.circle(18, -94, radius).stroke({ color: 0xffcf72, alpha: 0.7, width: 5 });
      feedback.arc(18, -94, radius + 12, time * 2, time * 2 + 3.8).stroke({ color: 0xff7847, alpha: 0.85, width: 4 });
      feedback.visible = true;
    }
    feedback.x = fighter.x;
    feedback.y = sprite.y;
    feedback.scale.set(scale * fighter.facing, scale);
    feedback.zIndex = Math.round(fighter.x) + 0.05;
    }

    let shadow = options.audience ? null : shadowCache.get(key);
    if (!options.audience && !shadow) {
      shadow = new Graphics().ellipse(0, 0, 47, 9).fill({ color: 0x050907, alpha: 0.44 });
      shadowCache.set(key, shadow);
      fighterLayer.addChildAt(shadow, 0);
    }
    if (shadow) {
      shadow.x = fighter.x;
      shadow.y = ARENA.groundY + 7 + (options.verticalOffset || 0);
      shadow.visible = true;
      shadow.zIndex = Math.round(fighter.x) - 0.1;
    }
  }

  function updateParticles(particles = []) {
    // Reuse a fixed pool to avoid allocating graphics during combat.
    const visible = particles.slice(0, particlePool.length);
    particlePool.forEach((dot, index) => {
      const particle = visible[index];
      dot.clear();
      dot.visible = Boolean(particle);
      if (particle) {
        const alpha = Math.max(0, particle.life / (particle.maxLife || 0.55));
        const size = particle.size || 4;
        const color = particle.color === '#b9dfe6' ? 0xb9dfe6 : particle.color === '#ff7847' ? 0xff7847 : particle.color === '#f3a8ff' ? 0xf3a8ff : 0xffd483;
        if (particle.shape === 'ring') dot.circle(particle.x, particle.y, size + (1 - alpha) * 12).stroke({ color, alpha: alpha * 0.8, width: 2 });
        else if (particle.shape === 'streak') dot.moveTo(particle.x, particle.y).lineTo(particle.x - (particle.vx || 0) * 0.035, particle.y - (particle.vy || 0) * 0.035).stroke({ color, alpha, width: Math.max(1, size * alpha) });
        else dot.poly([particle.x, particle.y - size, particle.x + size * 0.7, particle.y, particle.x, particle.y + size, particle.x - size * 0.7, particle.y]).fill({ color, alpha });
      }
    });
  }

  function draw({ stage, catalog, match, selectedFighter = 'tobi', elapsed, particles = [] }) {
    if (destroyed) return;
    for (const sprite of spriteCache.values()) sprite.visible = false;
    for (const shadow of shadowCache.values()) shadow.visible = false;
    for (const feedback of feedbackCache.values()) feedback.visible = false;
    const stageInfo = catalog.backgrounds.find(item => item.id === stage);
    if (stageInfo) setBackground(stageInfo.path);
    const left = catalog.fighters.find(f => f.id === (match?.fighters.player.id || selectedFighter)) || catalog.fighters[0];
    const rightId = match?.fighters.opponent.id || (catalog.fighters.find(f => f.id === 'mateo' && f.id !== left.id) || catalog.fighters.find(f => f.id !== left.id))?.id;
    const right = catalog.fighters.find(f => f.id === rightId) || catalog.fighters[1];
    const occupied = new Set([left.id, right.id]);
    const audienceIds = catalog.fighters.filter(f => !occupied.has(f.id)).slice(0, 4);
    const crowdPositions = [100, 235, 725, 860];
    audienceIds.forEach((info, index) => renderFighter({ id: info.id, x: crowdPositions[index], y: 0, facing: index < 2 ? 1 : -1, action: 'idle' }, info, elapsed * 0.72 + index * 0.31, `audience-${index}`, { audience: true, scaleMultiplier: 0.43, verticalOffset: -24, alpha: 0.62 }));
    if (!match) {
      const phase = Math.max(0, elapsed - selectionPulse);
      const revealAction = phase < 0.55 ? 'idle' : phase < 1.1 ? 'walk' : phase < 1.65 ? 'punch' : 'idle';
      const playerPreview = left.animations?.[revealAction] ? revealAction : 'idle';
      const opponentAction = revealAction === 'punch' ? 'kick' : revealAction;
      const rivalPreview = right.animations?.[opponentAction] ? opponentAction : 'idle';
      renderFighter({ id: left.id, x: 280, y: 0, facing: 1, action: playerPreview }, left, elapsed, 'preview-player');
      renderFighter({ id: right.id, x: 680, y: 0, facing: -1, action: rivalPreview }, right, elapsed + 0.3, 'preview-opponent');
    } else {
      const introAction = introStep === 1 ? 'walk' : introStep === 2 ? 'punch' : 'idle';
      const playerAction = introStep >= 0 && introStep < 4 && left.animations?.[introAction] ? introAction : match.fighters.player.action;
      const opponentAction = introStep >= 0 && introStep < 4 && right.animations?.[introAction] ? introAction : match.fighters.opponent.action;
      renderFighter({ ...match.fighters.player, action: playerAction }, left, elapsed, 'combat-player');
      renderFighter({ ...match.fighters.opponent, action: opponentAction }, right, elapsed + 0.2, 'combat-opponent');
    }
    updateParticles(particles);
    app.renderer.render(app.stage);
  }

  function resize() {
    if (destroyed) return;
    app.renderer.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
    layout();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  window.addEventListener('orientationchange', resize, { passive: true });
  window.visualViewport?.addEventListener('resize', resize, { passive: true });
  resize();

  return {
    canvas: app.canvas,
    preload,
    draw,
    destroy() {
      destroyed = true;
      observer.disconnect();
      window.removeEventListener('orientationchange', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
      for (const texture of frameTextureCache.values()) texture.destroy(false);
      frameTextureCache.clear();
      textureCache.clear();
      spriteCache.clear();
      shadowCache.clear();
      feedbackCache.clear();
    },
  };
}
