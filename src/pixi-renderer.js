import { Application, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
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

  app.canvas.setAttribute('aria-label', 'Arena de combate de Puente Grande');
  app.canvas.setAttribute('role', 'img');
  Object.assign(app.canvas.style, { width: '100%', height: '100%', display: 'block' });
  host.replaceChildren(app.canvas);

  const scene = new Container();
  const backgroundLayer = new Container();
  const fighterLayer = new Container();
  const fxLayer = new Container();
  scene.addChild(backgroundLayer, fighterLayer, fxLayer);
  app.stage.addChild(scene);

  const textureCache = new Map();
  const spriteCache = new Map();
  const shadowCache = new Map();
  let background = null;
  let shade = null;
  let destroyed = false;
  let drawToken = 0;

  const layout = () => {
    const scale = Math.min(host.clientWidth / ARENA.width, host.clientHeight / ARENA.height);
    scene.scale.set(Number.isFinite(scale) && scale > 0 ? scale : 1);
    scene.position.set(
      Math.max(0, (host.clientWidth - ARENA.width * scene.scale.x) / 2),
      Math.max(0, (host.clientHeight - ARENA.height * scene.scale.y) / 2),
    );
  };

  async function textureFor(path) {
    const url = assetUrl(path);
    if (!textureCache.has(url)) textureCache.set(url, Texture.fromURL(url));
    return textureCache.get(url);
  }

  async function setBackground(path) {
    if (background?.label === path) return;
    const texture = await textureFor(path);
    if (destroyed) return;
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

  async function renderFighter(fighter, info, time, slot, token) {
    if (!info) return;
    const baseTexture = await textureFor(info.path);
    if (destroyed || token !== drawToken) return;
    const action = fighter.action === 'hit' ? 'hurt' : fighter.action === 'special' ? 'punch' : fighter.action;
    const animation = info.animations[action] || info.animations.idle;
    const frame = Math.floor((reducedMotion && slot.startsWith('preview') ? 0 : time) * (action === 'idle' ? 7 : 15)) % animation.frames;
    const column = animation.startColumn + frame;
    const frameRect = new Rectangle(
      column * info.frameWidth, animation.row * info.frameHeight,
      info.frameWidth, info.frameHeight,
    );
    const key = slot;
    let sprite = spriteCache.get(key);
    if (!sprite) {
      sprite = new Sprite(new Texture({ source: baseTexture.source, frame: frameRect }));
      sprite.anchor.set(0.5, 1);
      spriteCache.set(key, sprite);
      fighterLayer.addChild(sprite);
    } else {
      sprite.texture.frame = frameRect;
      sprite.texture.updateUvs();
    }
    const scale = info.frameHeight === 120 ? 1.92 : 1.72;
    sprite.scale.set(scale * fighter.facing, scale);
    sprite.x = fighter.x;
    sprite.y = ARENA.groundY + 5 - fighter.y + 12 * scale;
    sprite.zIndex = Math.round(fighter.x);
    sprite.tint = fighter.action === 'special' && !reducedMotion ? 0xffd8b2 : 0xffffff;

    let shadow = shadowCache.get(key);
    if (!shadow) {
      shadow = new Graphics().ellipse(0, 0, 47, 9).fill({ color: 0x050907, alpha: 0.44 });
      shadowCache.set(key, shadow);
      fighterLayer.addChildAt(shadow, 0);
    }
    shadow.x = fighter.x;
    shadow.y = ARENA.groundY + 7;
  }

  function updateParticles(particles = []) {
    fxLayer.removeChildren();
    for (const particle of particles) {
      const dot = new Graphics().rect(particle.x, particle.y, 4, 4).fill({
        color: particle.color === '#b9dfe6' ? 0xb9dfe6 : 0xffd483,
        alpha: Math.max(0, particle.life / 0.28),
      });
      fxLayer.addChild(dot);
    }
  }

  async function draw({ stage, catalog, match, elapsed, particles = [] }) {
    if (destroyed) return;
    const token = ++drawToken;
    const stageInfo = catalog.backgrounds.find(item => item.id === stage);
    if (stageInfo) await setBackground(stageInfo.path);
    if (destroyed || token !== drawToken) return;
    if (!match) {
      const left = catalog.fighters.find(f => f.id === 'tobi') || catalog.fighters[0];
      const right = catalog.fighters.find(f => f.id !== left.id && f.id === 'mateo') || catalog.fighters.find(f => f.id !== left.id);
      await Promise.all([
        renderFighter({ id: left.id, x: 580, y: 0, facing: 1, action: 'idle' }, left, elapsed, 'preview-player', token),
        renderFighter({ id: right.id, x: 785, y: 0, facing: -1, action: 'idle' }, right, elapsed + 0.3, 'preview-opponent', token),
      ]);
    } else {
      const player = catalog.fighters.find(f => f.id === match.fighters.player.id);
      const opponent = catalog.fighters.find(f => f.id === match.fighters.opponent.id);
      await Promise.all([
        renderFighter(match.fighters.player, player, elapsed, 'combat-player', token),
        renderFighter(match.fighters.opponent, opponent, elapsed + 0.2, 'combat-opponent', token),
      ]);
    }
    if (destroyed || token !== drawToken) return;
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
    draw,
    destroy() {
      destroyed = true;
      observer.disconnect();
      window.removeEventListener('orientationchange', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
      textureCache.clear();
      spriteCache.clear();
      shadowCache.clear();
    },
  };
}
