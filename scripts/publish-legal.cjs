// Local document packaging only: no network, dependencies, or app build.
// Despite its historical name, this script NEVER publishes or activates anything.
// The only mutable archive exception is explicit refresh of unreleased v1 drafts.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const frontend = path.resolve(root, '../TowerClimber/src/legal');
const versions = { privacy: '1', terms: '1' };
const base = 'https://towerclimber-game.netlify.app';
const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (!['--check', '--refresh-unreleased-v1'].includes(arg)) throw Error(`Unknown option: ${arg}`);
}
const checkOnly = args.has('--check');
const refreshDrafts = args.has('--refresh-unreleased-v1');
if (checkOnly && refreshDrafts) throw Error('Use --check separately from draft refresh.');
const documents = [];
const outputs = [];
const manifest = { status: null, documents: [] };
// Git may check text out as CRLF on Windows. Fingerprints use canonical LF text.
const normalize = text => text.replace(/\r\n?/g, '\n');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const decode = text => text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&middot;/g, '·').replace(/&rsaquo;/g, '›').replace(/&lsaquo;/g, '‹')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
for (const [type, version] of Object.entries(versions)) {
  const html = normalize(fs.readFileSync(path.join(root, `${type}.html`), 'utf8'));
  if (!html.includes(`name="legal-version" content="${version}"`)) throw Error('Version mismatch');
  const status = html.match(/name="legal-status" content="(draft|approved)"/)?.[1];
  if (!status) throw Error(`Missing legal-status in ${type}.html`);
  if (manifest.status && manifest.status !== status) throw Error('Document approval statuses differ.');
  manifest.status = status;
  if (refreshDrafts && (status !== 'draft' || version !== '1')) {
    throw Error('Draft refresh is restricted to explicitly unreleased v1 documents.');
  }
  if (status === 'approved' && /Before publication|Release condition|pending approval|review draft/i.test(html)) {
    throw Error(`Unresolved review text remains in ${type}.html`);
  }
  // Archives live one folder down; relative paths work on both file:// and HTTPS.
  const archived = html.replace(/(href|src)="(?![a-z]+:|\/\/|#)([^"]+)"/gi,
    (_, attr, href) => `${attr}="../${href.replace(/^\//, '')}"`);
  const target = path.join(root, `legal/${type}-v${version}.html`);
  const body = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  if (!body) throw Error(`Missing document body in ${type}.html`);
  // The app's text reader must retain destinations, not just "contact us".
  const content = decode(body.replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, label) => `${label} (${new URL(href, `${base}/${type}.html`).href})`)
    .replace(/<\/(?:p|h[1-6]|li|tr)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/td>/gi, ': ')
    .replace(/<[^>]+>/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim());
  const doc = { type, version, url: `${base}/${type}.html`,
    archiveUrl: `${base}/legal/${type}-v${version}.html`,
    contentUrl: `${base}/legal/${type}-v${version}.json`, content };
  const json = JSON.stringify(doc, null, 2) + '\n';
  outputs.push({ file: target, text: archived, immutable: true },
    { file: path.join(root, `legal/${type}-v${version}.json`), text: json, immutable: true });
  manifest.documents.push({ type, version, publicUrl: doc.url, archiveUrl: doc.archiveUrl,
    contentUrl: doc.contentUrl, htmlSha256: hash(archived), jsonSha256: hash(json) });
  documents.push(doc);
}
outputs.push({ file: path.join(frontend, 'bundled.json'), text: JSON.stringify(documents, null, 2) + '\n' },
  { file: path.join(root, 'legal/package-manifest.json'), text: JSON.stringify(manifest, null, 2) + '\n' });
// Validate ALL outputs before writing. Neither HTML nor JSON archives are silently overwritten.
for (const output of outputs) {
  const exists = fs.existsSync(output.file);
  const matches = exists && normalize(fs.readFileSync(output.file, 'utf8')) === output.text;
  if (checkOnly && !matches) throw Error(`Out-of-sync document output: ${output.file}`);
  if (!checkOnly && exists && !matches && output.immutable && !refreshDrafts) {
    throw Error(`Refusing to overwrite archive ${output.file}. Use a new version after release.`);
  }
}
if (!checkOnly) {
  for (const output of outputs) {
    fs.mkdirSync(path.dirname(output.file), { recursive: true });
    fs.writeFileSync(output.file, output.text);
  }
}
console.log(`${checkOnly ? 'Verified' : 'Packaged'} ${manifest.status} documents locally; nothing published or activated.`);
