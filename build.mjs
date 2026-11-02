import {build} from 'esbuild';
import {copyFile, mkdir} from 'node:fs/promises';

await mkdir('dist', {recursive: true});
await Promise.all([
  build({entryPoints: ['src/server.ts'], outfile: 'dist/server.js', bundle: true,
    platform: 'node', format: 'esm', target: 'node24', packages: 'external'}),
  build({entryPoints: ['src/client.ts'], outfile: 'dist/app.js', bundle: true,
    platform: 'browser', format: 'iife', target: 'es2022'}),
  copyFile('src/index.html', 'dist/index.html'),
  copyFile('src/style.css', 'dist/style.css')
]);
