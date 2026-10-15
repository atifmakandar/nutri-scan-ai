import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { build, loadEnv, resolveConfig } from 'vite';
import { CACHE_NAMESPACE, PNG_FILES, PUBLIC_FILES } from '../pwa-plugin.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('production build emits a verified static allowlist, local install icons and preserves both API proxies', { timeout: 60000 }, async () => {
  const output = await mkdtemp(join(tmpdir(), 'nutriscan-pwa-build-'));
  try {
    await build({ root, configFile: join(root, 'vite.config.js'), logLevel: 'silent', build: { outDir: output, emptyOutDir: true } });
    const worker = await readFile(join(output, 'sw.js'), 'utf8');
    const allowlist = JSON.parse(worker.match(/const STATIC_PATHS = new Set\((\[[^\n]+\])\);/)[1]);
    assert.equal(new Set(allowlist).size, allowlist.length);
    assert.ok(worker.includes(CACHE_NAMESPACE));
    assert.match(worker, /CACHE_NAME = CACHE_NAMESPACE \+ "[a-f0-9]{20}"/);
    for (const name of [...PUBLIC_FILES, ...PNG_FILES]) {
      assert.ok(allowlist.includes(`/${name}`), name);
      assert.ok((await readFile(join(output, name))).length > 0);
    }
    for (const name of await readdir(join(output, 'assets'))) {
      assert.ok(allowlist.includes(`/assets/${name}`), `Emitted bundle asset missing: ${name}`);
    }
    for (const path of allowlist) {
      assert.ok(path.startsWith('/') && !path.startsWith('//') && !/[?#]/.test(path));
      assert.doesNotMatch(path, /(?:index\.html|\/api|\/health|\/auth|\/reports|\/photos|\.map$|\/sw\.js)/);
      await readFile(join(output, path.slice(1)));
    }
    assert.ok(allowlist.some((path) => /^\/assets\/.+\.js$/.test(path)));
    assert.ok(allowlist.some((path) => /^\/assets\/.+\.css$/.test(path)));
    const manifest = JSON.parse(await readFile(join(output, 'manifest.webmanifest'), 'utf8'));
    assert.deepEqual([manifest.id, manifest.start_url, manifest.scope, manifest.display], ['/', '/', '/', 'standalone']);
    assert.ok(manifest.name && manifest.short_name && manifest.theme_color);
    for (const size of [192, 512]) {
      const icon = manifest.icons.find((entry) => entry.sizes === `${size}x${size}`);
      assert.ok(icon.purpose.includes('maskable'));
      const png = await readFile(join(output, icon.src.slice(1)));
      assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(png.readUInt32BE(16), size);
      assert.equal(png.readUInt32BE(20), size);
    }
    const html = await readFile(join(output, 'index.html'), 'utf8');
    assert.match(html, /id="root"/);
    assert.match(html, /type="module"[^>]*src="\/assets\//);
    assert.match(html, /rel="manifest" href="\/manifest.webmanifest"/);
    assert.match(html, /fonts\.googleapis\.com/);
    assert.match(html, /fonts\.gstatic\.com/);
    const offline = await readFile(join(output, 'offline.html'), 'utf8');
    assert.doesNotMatch(offline, /https?:\/\/|fonts\.google|localStorage/);
    for (const language of ['en', 'hi', 'mr']) assert.ok(offline.includes(`data-help="${language}"`));
    assert.match(offline, /not a laboratory test/);
    const config = await resolveConfig({ root, configFile: join(root, 'vite.config.js'), logLevel: 'silent' }, 'build', 'production');
    const env = loadEnv('production', process.cwd(), 'VITE_');
    const target = env.VITE_PROXY_TARGET || env.VITE_API_URL || 'http://127.0.0.1:8000';
    const expected = { '/api': { target, changeOrigin: false }, '/health': { target, changeOrigin: false } };
    assert.deepEqual(config.server.proxy, expected);
    assert.deepEqual(config.preview.proxy, expected);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
