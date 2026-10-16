import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDirectory = join(repository, 'public');
const assetDirectory = await realpath(join(publicDirectory, 'assets'));
const catalog = JSON.parse(await readFile(join(assetDirectory, 'catalog.json'), 'utf8'));
const manifestPaths = [1, 2, 3].map(part => `assets/manifest_parte_${part}.json`);
const seen = new Set();
const failures = [];

async function assetFile(path) {
  if (typeof path !== 'string' || !path.startsWith('assets/') || path.includes('\\') || path.split('/').includes('..')) {
    throw new Error(`Ruta de recurso inválida: ${String(path)}`);
  }
  const fullPath = join(publicDirectory, path);
  const resolved = await realpath(fullPath);
  const confined = relative(assetDirectory, resolved);
  if (confined === '..' || confined.startsWith(`..${sep}`) || confined.startsWith(sep)) {
    throw new Error(`Recurso fuera de public/assets: ${path}`);
  }
  const metadata = await lstat(fullPath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`El recurso no es un archivo normal: ${path}`);
  }
  return readFile(fullPath);
}

for (let index = 0; index < manifestPaths.length; index += 1) {
  const manifest = JSON.parse(await assetFile(manifestPaths[index]));
  if (manifest.part !== index + 1 || manifest.of !== 3 || manifest.count !== manifest.files.length) {
    failures.push(`Metadatos del manifiesto inválidos: ${manifestPaths[index]}`);
  }
  for (const file of manifest.files) {
    if (seen.has(file.path)) failures.push(`Ruta duplicada: ${file.path}`);
    seen.add(file.path);
    try {
      const bytes = await assetFile(file.path);
      if (bytes.length !== file.bytes) failures.push(`Tamaño incorrecto: ${file.path}`);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (sha256 !== file.sha256) failures.push(`SHA256 incorrecto: ${file.path}`);
    } catch (error) {
      failures.push(error.message);
    }
  }
}

if (seen.size !== catalog.counts.assets) failures.push('El conteo del catálogo no coincide con los manifiestos.');

for (const item of [...catalog.fighters, ...catalog.backgrounds, ...catalog.audio]) {
  if (!seen.has(item.path)) failures.push(`Recurso del catálogo no incluido en los manifiestos: ${item.path}`);
}

function webpDimensions(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

for (const fighter of catalog.fighters) {
  try {
    const bytes = await assetFile(fighter.path);
    const dimensions = webpDimensions(bytes);
    if (dimensions && (dimensions.width !== fighter.frameWidth * fighter.columns
      || dimensions.height !== fighter.frameHeight * fighter.rows)) {
      failures.push(`Dimensiones incompatibles para ${fighter.id}: atlas ${dimensions.width}×${dimensions.height}, cuadrícula esperada ${fighter.frameWidth * fighter.columns}×${fighter.frameHeight * fighter.rows}`);
    } else if (!dimensions) {
      failures.push(`No se pudieron leer las dimensiones WebP del atlas: ${fighter.id}`);
    }
  } catch (error) {
    failures.push(error.message);
  }
  for (const [action, mapping] of Object.entries(fighter.animations)) {
    if (![mapping.row, mapping.startColumn, mapping.frames].every(Number.isInteger)
      || mapping.row < 0 || mapping.row >= fighter.rows || mapping.startColumn < 0
      || mapping.frames < 1 || mapping.startColumn + mapping.frames > fighter.columns) {
      failures.push(`Fotogramas fuera del atlas: ${fighter.id}/${action}`);
    }
  }
}

for (const sound of catalog.audio) {
  const bytes = await assetFile(sound.path);
  const header = bytes.subarray(0, sound.format === 'ogg' ? 4 : 3).toString('ascii');
  if (sound.format === 'ogg' ? header !== 'OggS' : header !== 'ID3') {
    failures.push(`Formato de audio incorrecto: ${sound.path}`);
  }
  if (sound.mime !== (sound.format === 'ogg' ? 'audio/ogg' : 'audio/mpeg')) {
    failures.push(`MIME de audio incorrecto: ${sound.path}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`${seen.size} recursos verificados con SHA256; ${catalog.fighters.length} luchadores, ${catalog.backgrounds.length} escenarios y ${catalog.audio.length} audios.`);
}
