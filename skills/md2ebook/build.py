#!/usr/bin/env python3
"""md -> 책 리더 HTML 변환기.

AI 가 HTML 을 만들거나 손댈 필요 없이, 이 스크립트만 실행하면 된다.
reader.html(템플릿) 안의 마크다운 블록만 입력 .md 내용으로 교체한다.

사용법:
    python build.py <문서.md> [출력.html]
    python build.py --build-template      # src/ 모듈 → reader.html 재조립(유지보수용)

출력 경로를 생략하면 <문서>.html 로 저장한다.
예:  python build.py ../docs/research.md research.html

[유지보수] reader.html 은 src/ 모듈(template.html·styles.css·app.js)을 조립한
단일 파일이다. src/ 를 고친 뒤 `python build.py --build-template` 로 재조립한다.
최종 사용자는 이 단계가 필요 없다 — 조립본 reader.html 이 이미 커밋돼 있다.
"""
import os
import sys
import re
import base64
import pathlib

try:
    sys.stdout.reconfigure(encoding="utf-8")   # 콘솔 코드페이지와 무관하게 한글/기호 출력
except Exception:
    pass

HERE = pathlib.Path(__file__).absolute().parent
TEMPLATE = HERE / "reader.html"
SRC = HERE / "src"
# template.html 안의 주입 마커 — 조립 시 모듈 내용으로 치환.
STYLE_MARK = "/*__STYLES__*/"
APP_MARK = "//__APP__"
# reader.html 안의 콘텐츠 블록. 마커는 보존하고 내용만 바꾼다.
BLOCK = re.compile(
    r'(<script type="text/markdown" id="book-md">)(.*?)(</script>)',
    re.DOTALL,
)
# YAML frontmatter (--- ... ---) — 첫 줄부터 닫는 --- 까지. SKILL.md 같은 메타 보존용.
FRONTMATTER = re.compile(r'^---\n(.*?\n)---\n+', re.DOTALL)
# 링크 타깃 — ](url "제목") 형태
LINK = re.compile(r'\]\(\s*([^)\s]+)(\s+"[^"]*")?\s*\)')
# 이미지 — ![대체](src "제목"). src/title 보존하며 src 만 교체할 수 있게 그룹 분리.
IMG = re.compile(r'(!\[[^\]]*\]\()\s*([^)\s]+)((?:\s+"[^"]*")?)\s*(\))')
# 인라인 대상 이미지 확장자 → MIME
IMG_MIME = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".bmp": "image/bmp",
}
# 인라인 크기 가드 — 이보다 큰 이미지는 단일 HTML 폭주를 막으려 인라인하지 않고
# 파일 참조로 남긴 뒤 경고한다. 작게 넣고 싶으면 사전 최적화하거나 webp 로 넣으면 된다.
# 큰 데모 자산을 의도적으로 인라인하려면 MD2EBOOK_MAX_INLINE_MB=4 처럼 한도를 올린다(옵트인).
try:
    IMG_INLINE_MAX = int(float(os.environ.get("MD2EBOOK_MAX_INLINE_MB", "1.5")) * 1_000_000)
except ValueError:
    IMG_INLINE_MAX = 1_500_000  # bytes (~1.5MB)


def fold_frontmatter(md):
    """YAML frontmatter 를 본문 위 인용블록으로 변환 — 키별로 단락 분리해 가독성 회복.
    프런트매터가 없으면 그대로 반환(일반 .md 영향 없음)."""
    m = FRONTMATTER.match(md)
    if not m:
        return md
    pairs = []
    for line in m.group(1).splitlines():
        s = line.rstrip()
        if not s.strip() or ":" not in s:
            continue
        k, v = s.split(":", 1)
        pairs.append((k.strip(), v.strip()))
    if not pairs:
        return md[m.end():]
    # `> **키** · 값` 단락 사이에 빈 인용줄(> )을 끼워 단락 분리.
    block = "\n> \n".join(f"> **{k}** · {v}" for k, v in pairs)
    return block + "\n\n" + md[m.end():]


def rewrite_md_links(md, base_dir):
    """`.md` 링크는 같은 위치에 `.html` 이 이미 있을 때만 그쪽으로 바꾼다.
    외부 URL·없는 파일은 건드리지 않는다 (자동 변환·크롤링 없음)."""
    def repl(m):
        href, title = m.group(1), m.group(2) or ""
        if re.match(r'^(https?:|//|mailto:|#)', href, re.I):
            return m.group(0)
        path, sep, frag = href.partition("#")
        if not path.lower().endswith(".md"):
            return m.group(0)
        sibling = path[:-3] + ".html"
        if (base_dir / sibling).is_file():
            return "](" + sibling + (sep + frag if sep else "") + title + ")"
        return m.group(0)
    return LINK.sub(repl, md)


def inline_images(md, base_dir):
    """로컬 이미지 파일을 base64 data-URI 로 인라인한다 → 결과 HTML 이 자기완결(단일 파일).
    외부 URL·data: URI·없는 파일·미지원 확장자는 건드리지 않는다.
    IMG_INLINE_MAX 보다 큰 파일은 인라인하지 않고 파일 참조로 남기며 경고한다."""
    def repl(m):
        pre, src, title, close = m.group(1), m.group(2), m.group(3), m.group(4)
        if re.match(r'^(https?:|//|data:|mailto:|#)', src, re.I):
            return m.group(0)
        path = src.split("#", 1)[0].split("?", 1)[0]
        mime = IMG_MIME.get(pathlib.Path(path).suffix.lower())
        if not mime:
            return m.group(0)
        f = base_dir / path
        if not f.is_file():
            return m.group(0)
        size = f.stat().st_size
        if size > IMG_INLINE_MAX:
            print(f"warn: {path} ({size // 1024} KB) > 인라인 한도 "
                  f"({IMG_INLINE_MAX // 1024} KB), 파일 참조로 두고 인라인 생략 "
                  f"(줄이거나 webp 로 넣으면 인라인됨)")
            return m.group(0)
        b64 = base64.b64encode(f.read_bytes()).decode("ascii")
        return pre + "data:" + mime + ";base64," + b64 + title + close
    return IMG.sub(repl, md)


def assemble_template():
    """src/ 모듈을 조립해 단일 reader.html 로 쓴다. (유지보수용)"""
    tpl = (SRC / "template.html").read_text(encoding="utf-8")
    css = (SRC / "styles.css").read_text(encoding="utf-8").rstrip("\n")
    js = (SRC / "app.js").read_text(encoding="utf-8").rstrip("\n")
    if STYLE_MARK not in tpl or APP_MARK not in tpl:
        print(f"error: markers not found in {SRC/'template.html'}")
        return 2
    out = tpl.replace(STYLE_MARK, css, 1).replace(APP_MARK, js, 1)
    TEMPLATE.write_text(out, encoding="utf-8")
    print(f"OK  src/ -> {TEMPLATE} ({len(out)} chars)")
    return 0


def main(argv):
    if len(argv) >= 2 and argv[1] in ("--build-template", "-t"):
        return assemble_template()
    if len(argv) < 2:
        print("usage: python build.py <input.md> [output.html]")
        print("       python build.py --build-template   (src/ -> reader.html)")
        return 1
    md_path = pathlib.Path(argv[1])
    if not md_path.is_file():
        print(f"error: input not found: {md_path}")
        return 1
    if not TEMPLATE.is_file():
        print(f"error: template not found: {TEMPLATE}")
        return 1

    md = md_path.read_text(encoding="utf-8")
    base_dir = md_path.absolute().parent
    md = fold_frontmatter(md)                   # YAML --- ... --- 을 인용블록으로 보존
    md = rewrite_md_links(md, base_dir)
    md = inline_images(md, base_dir)            # 로컬 이미지 → data-URI (단일 파일 유지)
    tpl = TEMPLATE.read_text(encoding="utf-8")
    if not BLOCK.search(tpl):
        print("error: '<script type=text/markdown id=book-md>' block not found in reader.html")
        return 2

    # 본문에 리터럴 </script> 가 있으면 블록이 조기 종료되므로 방어 처리
    safe = md.replace("</script>", "<\\/script>")
    out_html = BLOCK.sub(lambda m: m.group(1) + "\n" + safe + "\n" + m.group(3), tpl, count=1)

    out_path = pathlib.Path(argv[2]) if len(argv) > 2 else md_path.with_suffix(".html")
    out_path.write_text(out_html, encoding="utf-8")
    print(f"OK  {md_path.name} ({len(md)} chars) -> {out_path} ({len(out_html)} chars)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
