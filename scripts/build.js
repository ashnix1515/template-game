const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');
const CleanCSS = require('clean-css');
const { minify: minifyHtml } = require('html-minifier-terser');

const SRC = path.join(__dirname, '..', 'src');
const DIST = path.join(__dirname, '..', 'dist');
const REPO_ROOT = path.join(__dirname, '..');
const DEFAULT_REPO_URL = 'https://github.com/ashnix1515/template-game';

const PAGES = [
  { html: 'index.html', entry: 'main.ts' },
  { html: 'debug.html', entry: 'debug.ts' },
];

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT }).toString().trim();
}

function getBuildInfo() {
  let commit = 'unknown';
  let repoUrl = DEFAULT_REPO_URL;
  try {
    commit = git(['rev-parse', 'HEAD']);
  } catch (e) {}
  try {
    repoUrl = git(['config', '--get', 'remote.origin.url'])
      .replace(/^git@github\.com:/, 'https://github.com/')
      .replace(/\.git$/, '');
  } catch (e) {}
  return { commit, repoUrl, builtAt: new Date().toISOString() };
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const srcPath = path.join(from, entry.name);
    const destPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Bundles + type-strips + minifies one TypeScript entry point into a single
// IIFE. esbuild does not type-check (see `npm run typecheck` for that) - it
// just compiles fast, which is what both `npm run build` and the dev server
// want on every rebuild.
async function bundleScript(entryFile) {
  const result = await esbuild.build({
    entryPoints: [path.join(SRC, 'ts', entryFile)],
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'es2020',
    write: false,
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

// Builds one HTML page: inlines the bundled TS entry point of the same name
// as its <script src="*.js"> placeholder, inlines the stylesheet, minifies
// the result, and writes it to dist/<htmlFile>.
async function buildPage(htmlFile, entryFile, minifiedCss) {
  const js = await bundleScript(entryFile);

  let html = fs.readFileSync(path.join(SRC, htmlFile), 'utf8');

  const cssLinkPattern = /<link\s+rel="stylesheet"\s+href="style\.css"\s*\/?>/;
  const jsFile = entryFile.replace(/\.ts$/, '.js');
  const scriptPattern = new RegExp(`<script\\s+src="${jsFile}"></script>`);

  if (!cssLinkPattern.test(html))
    throw new Error(`build.js: stylesheet <link> not found in src/${htmlFile}`);
  if (!scriptPattern.test(html))
    throw new Error(`build.js: script tag <script src="${jsFile}"> not found in src/${htmlFile}`);

  html = html.replace(cssLinkPattern, `<style>${minifiedCss}</style>`);
  html = html.replace(scriptPattern, `<script>${js}</script>`);

  const minifiedHtml = await minifyHtml(html, {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true,
    minifyJS: true,
  });

  fs.writeFileSync(path.join(DIST, htmlFile), minifiedHtml);
  console.log('Built %s (%d bytes)', htmlFile, Buffer.byteLength(minifiedHtml));
}

async function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  copyDir(path.join(SRC, 'assets'), path.join(DIST, 'assets'));

  const buildInfo = getBuildInfo();

  // sw.js is served standalone (never inlined) so the browser can register
  // it, and so the service worker can re-fetch it independently of the page.
  const swJs = await bundleScript('sw.ts');
  fs.writeFileSync(path.join(DIST, 'sw.js'), swJs);

  // buildinfo.js: a small standalone file both the page and the service
  // worker fetch independently (with cache: 'no-store') to detect when a
  // new build is live. See src/ts/sw.ts checkForUpdate().
  fs.writeFileSync(
    path.join(DIST, 'buildinfo.js'),
    'self.BUILD_INFO=' + JSON.stringify(buildInfo) + ';\n'
  );

  const css = fs.readFileSync(path.join(SRC, 'style.css'), 'utf8');
  const minifiedCss = new CleanCSS({}).minify(css).styles;

  for (const page of PAGES) {
    await buildPage(page.html, page.entry, minifiedCss);
  }
}

if (require.main === module) {
  build().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { build };
