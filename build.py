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
import sys
import re
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
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
# 링크 타깃 — ](url "제목") 형태
LINK = re.compile(r'\]\(\s*([^)\s]+)(\s+"[^"]*")?\s*\)')


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
    md = rewrite_md_links(md, md_path.resolve().parent)
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
