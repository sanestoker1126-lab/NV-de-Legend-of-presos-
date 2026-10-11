import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { ARENA } from './engine.js';

/**
 * PixiJS renderer adapter for the existing combat engine.
 * Engine state remains authoritative. Coordinates use the same 960x420 arena.
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
  app.canvas.style.width = '100%';
  app.canvas.style.height = '100%';
  app.canvas.style.display = 'block';
  host.replaceChildren(app.canvas);

  const scene = new Container();
  const backgroundLayer = new Container();
  const fighterLayer = new Container();
  const fxLayer = new Container();
  scene.addChild(backgroundLayer, fighterLayer, fxLayer);
  app.stage.addChild(scene);

  const arenaScale = () => {
    const scale = Math.min(host.clientWidth / ARENA.width, host.clientHeight / ARENA.height);
    scene.scale.set(Number.isFinite(scale) && scale > 0 ? scale : 1);
    scene.position.set(
      Math.max(0, (host.clientWidth - ARENA.width * scene.scale.x) / 2),
      Math.max(0, (host.clientHeight - ARENA.height * scene.scale.y) / 2),
    );
  };

  const textureCache = new Map();
  const spriteCache = new Map();
  const shadowCache = new Map();
  const fx = [];
  let background = null;
  let destroyed = false;

  async function textureFor(url) {
    if (!textureCache.has(url)) {
      const texture = await Texture.fromURL(url);
      textureCache.set(url, texture);
    }
    return textureCache.get(url);
  }

  async function setBackground(url) {
    if (background?.label === url) return;
    const texture = await textureFor(assetUrl(url));
    if (destroyed) return;
    if (background) backgroundLayer.removeChild(background);
    background = new Sprite(texture);
    background.label = url;
    background.width = ARENA.width;
    background.height = ARENA.height;
    backgroundLayer.addChild(background);
    const shade = new Graphics().rect(0, 0, ARENA.width, ARENA.height).fill({ color: 0x07100b, alpha: 0.13 });
    shade.label = 'arena-tint';
    backgroundLayer.addChild(shade);
  }

  function clearFighters() {
    for (const sprite of spriteCache.values()) sprite.destroy();
    for (const graphic of shadowCache.values()) graphic.destroy();
    spriteCache.clear();
    shadowCache.clear();
    fighterLayer.removeChildren();
    fxLayer.removeChildren();
  }

  async function renderFighter(fighter, info, time, slot) {
    const url = assetUrl(info.path);
    const texture = await textureFor(url);
    if (destroyed) return;
    const action = fighter.action === 'hit' ? 'hurt' : fighter.action === 'special' ? 'punch' : fighter.action;
    const animation = info.animations[action] || info.animations.idle;
    const frame = Math.floor((reducedMotion && !slot.startsWith('combat') ? 0 : time) * (action === 'idle' ? 7 : 15)) % animation.frames;
    const column = animation.startColumn + frame;
    const frameRect = new Rectangle(
      column * info.frameWidth,
      animation.row * info.frameHeight,
      info.frameWidth,
      info.frameHeight,
    );
    const key = slot;
    let sprite = spriteCache.get(key);
    if (!sprite) {
      sprite = new Sprite(new Texture({ source: texture.source, frame: frameRect }));
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
    sprite.alpha = 1;
    if (fighter.action === 'special' && !reducedMotion) {
      sprite.tint = 0xffd0a0;
      sprite.filters = [];
    } else {
      sprite.tint = 0xffffff;
    }

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
    // Rebuild a small, bounded graphics layer only when hit effects change.
    fxLayer.removeChildren();
    for (const particle of particles) {
      const alpha = Math.max(0, particle.life / 0.28);
      const dot = new Graphics().rect(particle.x, particle.y, 4, 4).fill({
        color: particle.color === '#b9dfe6' ? 0xb9dfe6 : 0xffd483,
        alpha,
      });
      fxLayer.addChild(dot);
    }
  }

  async function draw({ stage, catalog, match, elapsed, particles = [] }) {
    if (destroyed) return;
    const stageInfo = catalog.backgrounds.find(item => item.id === stage);
    if (stageInfo) await setBackground(stageInfo.path);
    if (!match) {
      const left = catalog.fighters.find(f => f.id === 'tobi') || catalog.fighters[0];
      const right = catalog.fighters.find(f => f.id !== left.id && f.id === 'mateo') || catalog.fighters.find(f => f.id !== left.id);
      await Promise.all([
        renderFighter({ id: left.id, x: 580, y: 0, facing: 1, action: 'idle' }, left, elapsed, 'preview-player'),
        renderFighter({ id: right.id, x: 785, y: 0, facing: -1, action: 'idle' }, right, elapsed + 0.3, 'preview-opponent'),
      ]);
    } else {
      const player = catalog.fighters.find(f => f.id === match.fighters.player.id);
      const opponent = catalog.fighters.find(f => f.id === match.fighters.opponent.id);
      if (player && opponent) {
        await Promise.all([
          renderFighter(match.fighters.player, player, elapsed, 'combat-player'),
          renderFighter(match.fighters.opponent, opponent, elapsed + 0.2, 'combat-opponent'),
        ]);
      }
    }
    updateParticles(particles);
    app.renderer.render(app.stage);
  }

  function resize() { if (!destroyed) { arenaScale(); app.renderer.resize(host.clientWidth, host.clientHeight); } }
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
      clearFighters();
      app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
      textureCache.clear();
    },
  };
}
