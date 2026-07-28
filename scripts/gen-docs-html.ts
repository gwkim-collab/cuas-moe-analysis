// ────────────────────────────────────────────────────────────
// Render docs/*.md → docs/*.html (self-contained, styled).
//
//   pnpm gen:docs
//
// MD is the source of truth; run this after editing any doc so the
// paired .html stays in sync. Output is a single standalone HTML file
// per markdown (inline CSS, Korean fonts, styled tables) — openable
// directly in a browser or shareable as-is.
// ────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { marked } from 'marked'

const here = dirname(fileURLToPath(import.meta.url))
const docsDir = join(here, '..', 'docs')

const CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  font-family: "Malgun Gothic","맑은 고딕",system-ui,-apple-system,"Segoe UI",sans-serif;
  line-height: 1.7; color: #1c2b28; background: #f7faf9;
  max-width: 900px; margin: 0 auto; padding: 40px 24px 80px;
}
h1,h2,h3,h4 { line-height: 1.3; color: #0f2320; margin: 1.8em 0 .6em; }
h1 { font-size: 1.9rem; border-bottom: 2px solid #17a884; padding-bottom: .3em; }
h2 { font-size: 1.4rem; border-bottom: 1px solid #d5e5e0; padding-bottom: .25em; }
h3 { font-size: 1.12rem; color: #12695a; }
a { color: #0f8f74; }
code { font-family: "Cascadia Code",Consolas,monospace; background: #e7f1ee; padding: .12em .4em; border-radius: 4px; font-size: .92em; }
pre { background: #0f2320; color: #d8f3ea; padding: 14px 16px; border-radius: 8px; overflow-x: auto; border-left: 3px solid #17a884; }
pre code { background: none; color: inherit; padding: 0; }
blockquote { margin: 1em 0; padding: .6em 1em; background: #eef6f3; border-left: 4px solid #17a884; color: #33504a; border-radius: 0 6px 6px 0; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: .95em; overflow-x: auto; display: block; }
th,td { border: 1px solid #cfe2dc; padding: 7px 11px; text-align: left; }
th { background: #17a884; color: #fff; font-weight: 600; }
tr:nth-child(even) td { background: #f0f7f5; }
hr { border: none; border-top: 1px solid #d5e5e0; margin: 2.4em 0; }
.doc-meta { color: #6b8580; font-size: .82rem; margin-bottom: 1.5em; }
@media (prefers-color-scheme: dark) {
  body { color: #d8e6e2; background: #0d1a18; }
  h1,h2,h3,h4 { color: #eafaf5; } h1 { border-color: #17a884; } h2 { border-color: #23423b; } h3 { color: #4fd6b4; }
  code { background: #17302b; } blockquote { background: #13251f; color: #b8ccc6; }
  th,td { border-color: #23423b; } tr:nth-child(even) td { background: #10201c; }
  .doc-meta { color: #6b8580; }
}
`

function wrap(title: string, body: string): string {
  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${CSS}</style>
</head><body>
<div class="doc-meta">AIRLOCK MOE 문서 · MD에서 자동 생성(pnpm gen:docs) · 원본은 ${title.replace(/\.html$/, '.md')}</div>
${body}
</body></html>`
}

const files = readdirSync(docsDir).filter((f) => f.endsWith('.md'))
for (const f of files) {
  const md = readFileSync(join(docsDir, f), 'utf8')
  const html = marked.parse(md, { async: false }) as string
  const out = join(docsDir, basename(f, '.md') + '.html')
  writeFileSync(out, wrap(basename(f, '.md') + '.html', html), 'utf8')
  console.log(`wrote ${out}`)
}
