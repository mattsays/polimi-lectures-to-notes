#!/usr/bin/env node
// Store a Webex session cookie for PoliWebex, so its SPID autologin never runs.
//
// PoliWebex keeps the session in config.json under the key "cookie" and reuses it
// while it stays valid. Its own login assumes a username+password form, which
// does not work for accounts that authenticate with CIE on a phone. Injecting a
// cookie captured from a normal browser session skips that path entirely.
//
//   node scripts/poliwebex-cookie.mjs                 # read the cookie from stdin
//   node scripts/poliwebex-cookie.mjs --check         # validate what is stored
//   node scripts/poliwebex-cookie.mjs --poliwebex <dir>
//
// stdin accepts either a bare Cookie header or a whole curl command pasted from
// the browser's "Copy as cURL", which is the easier of the two to obtain.
//
// The cookie is read from stdin so it never appears in the shell history or in a
// chat message. It is never printed back.

import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const DEFAULT_DIR = process.env.POLIWEBEX_DIR || path.join(homedir(), 'tools', 'PoliWebex');
const PROBE = 'https://politecnicomilano.webex.com/webappng/api/v1/pmrs/recent';

function parseArgs(argv) {
  const opts = { config: null, dir: DEFAULT_DIR, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') opts.config = argv[++i];
    else if (a === '--poliwebex') opts.dir = argv[++i] ?? opts.dir;
    else if (a === '--check') opts.check = true;
    else if (a === '--help' || a === '-h') {
      console.log([
        'usage: node scripts/poliwebex-cookie.mjs [options]',
        '',
        '  --poliwebex <dir>   PoliWebex checkout, default $POLIWEBEX_DIR or ~/tools/PoliWebex',
        '  --config <file>     config.json to patch, default <dir>/config.json',
        '  --check             only validate the cookie already stored',
        '',
        'Reads the cookie from stdin: either the Cookie header, or a whole curl command',
        'copied from the browser with "Copy as cURL".',
      ].join('\n'));
      process.exit(0);
    } else throw new Error(`unknown option ${a}`);
  }
  if (!opts.config) opts.config = path.join(opts.dir, 'config.json');
  return opts;
}

// A pasted curl command is the easiest thing to obtain from DevTools, so accept it
// and pull the cookie out, rather than making people hunt for the right header.
function extractCookie(input) {
  const text = input.replace(/\\\r?\n/g, ' ').trim();
  if (!/^curl\b/i.test(text)) return text;

  const header = text.match(/(?:-H|--header)\s+(['"])cookie:\s*([^'"]+)\1/i);
  if (header) return header[2].trim();
  const cookieJar = text.match(/(?:-b|--cookie)\s+(['"])([^'"]+)\1/i);
  if (cookieJar) return cookieJar[2].trim();
  return '';
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', reject);
  });
}

// The endpoint answers 302 to the login page when the session is missing. Following
// that redirect yields a 200 with an HTML login page, which would look like success,
// so redirects are not followed and a 200 must also parse as JSON.
async function validate(cookie) {
  try {
    const res = await fetch(PROBE, {
      headers: { Cookie: cookie },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status !== 200) return { ok: false, status: res.status };
    const body = await res.text();
    try {
      JSON.parse(body);
    } catch {
      return { ok: false, status: 200, error: 'response is not JSON, the session is not authenticated' };
    }
    return { ok: true, status: 200 };
  } catch (err) {
    return { ok: false, status: 0, error: err.name === 'TimeoutError' ? 'timed out' : err.message };
  }
}

function loadConfig(file) {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`${file} is not valid JSON; fix or remove it before injecting a cookie`);
  }
}

function saveConfig(file, config) {
  try {
    writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
    chmodSync(file, 0o600);
  } catch (err) {
    throw new Error(`cannot write ${file} (${err.code || err.message}); if this runs inside a sandbox, run it in your own terminal`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const config = loadConfig(opts.config);

  if (opts.check) {
    const cookie = config.cookie;
    if (!cookie) {
      console.error(`no cookie stored in ${opts.config}`);
      process.exitCode = 1;
      return;
    }
    const result = await validate(cookie);
    console.log(result.ok
      ? 'cookie is valid'
      : `cookie is not valid (HTTP ${result.status || result.error}) — capture a fresh one from the browser`);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (process.stdin.isTTY) {
    console.error([
      'Paste one of these, then press Ctrl-D:',
      '  - the Cookie header value, or',
      '  - a curl command copied from DevTools with "Copy as cURL"',
      '',
    ].join('\n'));
  }
  const raw = await readStdin();
  if (!raw) {
    console.error('nothing on stdin');
    process.exitCode = 1;
    return;
  }
  const cookie = extractCookie(raw);
  if (!cookie) {
    console.error('could not find a cookie in that input');
    process.exitCode = 1;
    return;
  }
  if (!cookie.includes('=')) {
    console.error('that does not look like a Cookie header (expected "name=value; name2=value2")');
    process.exitCode = 1;
    return;
  }

  const result = await validate(cookie);
  if (!result.ok) {
    console.error(`cookie rejected by Webex (HTTP ${result.status || result.error}); not saved.`);
    process.exitCode = 1;
    return;
  }

  config.cookie = cookie;
  saveConfig(opts.config, config);
  console.log(`cookie saved to ${opts.config} and accepted by Webex`);
}

main().catch((err) => {
  console.error(`error: ${err.message}`);
  process.exitCode = 1;
});
