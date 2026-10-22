// Exercise archive safety without writing files, loading packages or building the app.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, 'publish-legal.cjs'), 'utf8');
const root = path.resolve(__dirname, '..');
const archive = name => path.join(root, 'legal', name);

function fixture() {
  const files = new Map(['privacy', 'terms'].map(type => [
    path.join(root, `${type}.html`),
    `<meta name="legal-version" content="1"><meta name="legal-status" content="draft">` +
    `<main><p>${type} review draft</p><p><a href="/privacy.html">Privacy</a></p></main>`,
  ]));
  let writes = [];
  function run(args = []) {
    writes = [];
    const fakeFs = {
      readFileSync(file) {
        if (!files.has(file)) throw Error(`Missing ${file}`);
        return files.get(file);
      },
      existsSync: file => files.has(file),
      mkdirSync() {},
      writeFileSync(file, text) { writes.push(file); files.set(file, text); },
    };
    vm.runInNewContext(source, {
      URL,
      __dirname,
      process: { argv: ['node', 'publish-legal.cjs', ...args] },
      console: { log() {} },
      require(id) {
        if (id === 'node:fs') return fakeFs;
        if (id === 'node:path') return path;
        if (id === 'node:crypto') return crypto;
        throw Error(`Unexpected module ${id}`);
      },
    });
  }
  return { files, run, writes: () => writes };
}

test('packaged v1 text keeps URLs and check mode writes nothing', () => {
  const f = fixture();
  f.run();
  const doc = JSON.parse(f.files.get(archive('privacy-v1.json')));
  assert.equal(doc.version, '1');
  assert.match(doc.content, /Privacy \(https:\/\/towerclimber-game.netlify.app\/privacy.html\)/);
  const manifest = JSON.parse(f.files.get(archive('package-manifest.json')));
  assert.equal(manifest.status, 'draft');
  assert.equal(manifest.documents[0].jsonSha256,
    crypto.createHash('sha256').update(f.files.get(archive('privacy-v1.json'))).digest('hex'));
  f.run(['--check']);
  assert.equal(f.writes().length, 0);
});

test('a mismatched second document prevents all writes', () => {
  const f = fixture();
  f.run();
  f.files.set(archive('terms-v1.html'), 'existing historical text');
  assert.throws(() => f.run(), /Refusing to overwrite archive/);
  assert.equal(f.writes().length, 0);
});

test('JSON archives are protected independently of HTML', () => {
  const f = fixture();
  f.run();
  f.files.set(archive('privacy-v1.json'), '{"content":"different"}');
  assert.throws(() => f.run(), /Refusing to overwrite archive/);
  assert.equal(f.writes().length, 0);
  assert.throws(() => f.run(['--check']), /Out-of-sync/);
  assert.equal(f.writes().length, 0);
});

test('explicit unreleased-v1 refresh updates draft copies together', () => {
  const f = fixture();
  f.run();
  const current = path.join(root, 'privacy.html');
  f.files.set(current, f.files.get(current).replace('privacy review draft', 'Changed privacy draft'));
  f.run(['--refresh-unreleased-v1']);
  assert.match(JSON.parse(f.files.get(archive('privacy-v1.json'))).content, /Changed privacy draft/);
  f.run(['--check']);
});

test('draft refresh cannot overwrite approved documents', () => {
  const f = fixture();
  for (const type of ['privacy', 'terms']) {
    const file = path.join(root, `${type}.html`);
    f.files.set(file, f.files.get(file).replace('content="draft"', 'content="approved"'));
  }
  assert.throws(() => f.run(['--refresh-unreleased-v1']), /restricted/);
  assert.equal(f.writes().length, 0);
});

test('approval metadata alone cannot hide unresolved review text', () => {
  const f = fixture();
  for (const type of ['privacy', 'terms']) {
    const file = path.join(root, `${type}.html`);
    f.files.set(file, f.files.get(file).replace('content="draft"', 'content="approved"'));
  }
  assert.throws(() => f.run(), /Unresolved review text/);
  assert.equal(f.writes().length, 0);
});

test('Windows text checkout keeps the same package fingerprints', () => {
  const f = fixture();
  f.run();
  for (const [file, text] of f.files) f.files.set(file, text.replace(/\n/g, '\r\n'));
  f.run(['--check']);
  assert.equal(f.writes().length, 0);
});

test('relative navigation and images work in archives and app links stay absolute', () => {
  const f = fixture();
  const file = path.join(root, 'terms.html');
  f.files.set(file, f.files.get(file).replace('/privacy.html', 'privacy.html') +
    '<footer><a href="index.html">Home</a><img src="background.jpg"></footer>');
  f.run();
  const html = f.files.get(archive('terms-v1.html'));
  assert.match(html, /href="\.\.\/privacy.html"/);
  assert.match(html, /href="\.\.\/index.html"/);
  assert.match(html, /src="\.\.\/background.jpg"/);
  const doc = JSON.parse(f.files.get(archive('terms-v1.json')));
  assert.match(doc.content, /https:\/\/towerclimber-game.netlify.app\/privacy.html/);
});
