#!/usr/bin/env python3
"""Render policies/legal markdown drafts to terms.html / privacy.html verbatim.
Usage: python3 scripts/build-legal-pages.py <terms.md> <privacy.md>
Supports the subset used by the drafts: #/## headings, > blockquote, - lists, **bold**, paragraphs."""
import html, re, sys

def inline(s):
    s = html.escape(s, quote=False)
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)

def render(md):
    out, para, lst = [], [], False
    title = ""
    def flush():
        nonlocal para, lst
        if para:
            out.append("<p>" + inline(" ".join(para)) + "</p>"); para = []
        if lst:
            out.append("</ul>"); lst = False
    for line in md.splitlines():
        if not line.strip():
            flush(); continue
        if line.startswith("# "):
            flush(); title = line[2:].strip(); continue
        if line.startswith("## "):
            flush(); out.append("<h2>" + inline(line[3:].strip()) + "</h2>"); continue
        if line.startswith("> "):
            flush(); out.append('<blockquote class="legal-draft-note"><p>' + inline(line[2:].strip()) + "</p></blockquote>"); continue
        if line.startswith("- "):
            if para:
                out.append("<p>" + inline(" ".join(para)) + "</p>"); para = []
            if not lst:
                out.append("<ul>"); lst = True
            out.append("<li>" + inline(line[2:].strip()) + "</li>"); continue
        if lst:
            out.append("</ul>"); lst = False
        para.append(line.strip())
    flush()
    return title, "\n        ".join(out)

PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="{title}">
  <title>{title}</title>
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>
  <!-- Generated from docs/legal/{src} by scripts/build-legal-pages.py. Do not hand-edit. -->

  <header class="site-header">
    <div class="container header-inner">
      <a class="logo" href="/"><span data-brand>COGNATION</span></a>
    </div>
  </header>

  <main id="main">
    <header class="page-banner">
      <div class="container">
        <p class="eyebrow">Legal</p>
        <h1>{title}</h1>
      </div>
    </header>

    <section class="section">
      <div class="container prose legal-prose">
        {body}
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="container footer-inner">
      <nav class="footer-nav" aria-label="Footer">
        <a href="/">Home</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
      </nav>
    </div>
  </footer>
</body>
</html>
"""

for src, dest in ((sys.argv[1], "terms.html"), (sys.argv[2], "privacy.html")):
    title, body = render(open(src, encoding="utf-8").read())
    with open(dest, "w", encoding="utf-8") as f:
        f.write(PAGE.format(title=html.escape(title), body=body, src=src.rsplit("/", 1)[-1]))
