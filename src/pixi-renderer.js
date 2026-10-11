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
  const fighterLayer = new Container();
  fighterLayer.sortableChildren = true;
  const fxLayer = new Container();
  const particlePool = Array.from({ length: 32 }, () => new Graphics());
  fxLayer.addChild(...particlePool);
  scene.addChild(backgroundLayer, fighterLayer, fxLayer);
  app.stage.addChild(scene);

  const textureCache = new Map();
  const frameTextureCache = new Map();
  const spriteCache = new Map();
  const shadowCache = new Map();
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

  function renderFighter(fighter, info, time, slot) {
    if (!info) return;
    const baseTexture = textureFor(info.path);
    const action = fighter.action === 'hit' ? 'hurt' : fighter.action === 'special' ? 'punch' : fighter.action;
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
      fighterLayer.addChild(sprite);
    } else if (sprite.texture !== frameTexture) {
      sprite.texture = frameTexture;
    }
    const scale = info.frameHeight === 120 ? 1.92 : 1.72;
    sprite.scale.set(scale * fighter.facing, scale);
    sprite.x = fighter.x;
    sprite.y = ARENA.groundY + 5 - fighter.y + 12;
    sprite.zIndex = Math.round(fighter.x);
    sprite.visible = true;
    sprite.tint = fighter.action === 'special' && !reducedMotion ? 0xffd8b2 : 0xffffff;

    let shadow = shadowCache.get(key);
    if (!shadow) {
      shadow = new Graphics().ellipse(0, 0, 47, 9).fill({ color: 0x050907, alpha: 0.44 });
      shadowCache.set(key, shadow);
      fighterLayer.addChildAt(shadow, 0);
    }
    shadow.x = fighter.x;
    shadow.y = ARENA.groundY + 7;
    shadow.visible = true;
    shadow.zIndex = Math.round(fighter.x) - 0.1;
  }

  function updateParticles(particles = []) {
    // Reuse a fixed pool to avoid allocating graphics during combat.
    const visible = particles.slice(0, particlePool.length);
    particlePool.forEach((dot, index) => {
      const particle = visible[index];
      dot.clear();
      dot.visible = Boolean(particle);
      if (particle) dot.rect(particle.x, particle.y, 4, 4).fill({
        color: particle.color === '#b9dfe6' ? 0xb9dfe6 : 0xffd483,
        alpha: Math.max(0, particle.life / 0.28),
      });
    });
  }

  function draw({ stage, catalog, match, selectedFighter = 'tobi', elapsed, particles = [] }) {
    if (destroyed) return;
    for (const sprite of spriteCache.values()) sprite.visible = false;
    for (const shadow of shadowCache.values()) shadow.visible = false;
    const stageInfo = catalog.backgrounds.find(item => item.id === stage);
    if (stageInfo) setBackground(stageInfo.path);
    if (!match) {
      delete app.canvas.dataset.playerX;
      const left = catalog.fighters.find(f => f.id === selectedFighter) || catalog.fighters[0];
      const right = catalog.fighters.find(f => f.id === 'mateo' && f.id !== left.id) || catalog.fighters.find(f => f.id !== left.id);
      renderFighter({ id: left.id, x: 280, y: 0, facing: 1, action: 'idle' }, left, elapsed, 'preview-player');
      renderFighter({ id: right.id, x: 680, y: 0, facing: -1, action: 'idle' }, right, elapsed + 0.3, 'preview-opponent');
    } else {
      // Expose the player's world-space position for robust browser E2E assertions.
      // Avoid reading pixels back from WebGL, which is not reliable without preserveDrawingBuffer.
      app.canvas.dataset.playerX = String(match.fighters.player.x);
      const player = catalog.fighters.find(f => f.id === match.fighters.player.id);
      const opponent = catalog.fighters.find(f => f.id === match.fighters.opponent.id);
      renderFighter(match.fighters.player, player, elapsed, 'combat-player');
      renderFighter(match.fighters.opponent, opponent, elapsed + 0.2, 'combat-opponent');
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
    },
  };
}
