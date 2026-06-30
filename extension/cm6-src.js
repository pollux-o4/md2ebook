import { EditorState } from '@codemirror/state';
import {
  EditorView, ViewPlugin, Decoration,
  keymap
} from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands';

/* ================================================================
   1) 테마 — CSS 변수를 참조해 테마 전환 자동 반영
   ================================================================ */
const baseTheme = EditorView.theme({
  '&': {
    height: 'auto',
    minHeight: '100%',
    backgroundColor: 'var(--page)',
    color: 'var(--ink)',
    fontFamily: 'var(--reader-font)',
    fontSize: 'var(--reader-size)',
    lineHeight: 'var(--reader-leading)',
    border: 'none',
    outline: 'none',
  },
  '.cm-scroller': {
    overflow: 'visible',
    fontFamily: 'inherit',
  },
  '.cm-content': {
    padding: '0',
    caretColor: 'var(--ink)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  '.cm-line': { padding: '0' },
  '.cm-cursor': { borderLeftColor: 'var(--ink)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--accent)', opacity: '0.25' },
  '.cm-md-strong': { fontWeight: 'bold' },
  '.cm-md-em':     { fontStyle: 'italic' },
  '.cm-md-code': {
    fontFamily: 'monospace',
    backgroundColor: 'var(--code-bg)',
    borderRadius: '3px',
    padding: '0 3px',
  },
  '.cm-md-h1': { fontSize: '1.6em', fontWeight: 'bold' },
  '.cm-md-h2': { fontSize: '1.3em', fontWeight: 'bold' },
  '.cm-md-h3': { fontSize: '1.1em', fontWeight: 'bold' },
});

/* ================================================================
   2) Live Preview ViewPlugin
   ================================================================ */
function cursorLines(state) {
  const lines = new Set();
  for (const range of state.selection.ranges) {
    const from = state.doc.lineAt(range.from).number;
    const to   = state.doc.lineAt(range.to).number;
    for (let n = from; n <= to; n++) lines.add(n);
  }
  return lines;
}

function buildDecorations(view) {
  const { state } = view;
  const onLines = cursorLines(state);
  const decos = [];

  syntaxTree(state).iterate({
    enter(node) {
      const startLine = state.doc.lineAt(node.from).number;
      const onCursor  = onLines.has(startLine);

      if (node.name === 'StrongEmphasis') {
        if (!onCursor) {
          node.node.cursor().iterate(child => {
            if (child.name === 'EmphasisMark') {
              if (child.from < child.to)
                decos.push(Decoration.replace({}).range(child.from, child.to));
            }
          });
          decos.push(Decoration.mark({ class: 'cm-md-strong' }).range(node.from, node.to));
        }
        return false;
      }

      if (node.name === 'Emphasis') {
        if (!onCursor) {
          node.node.cursor().iterate(child => {
            if (child.name === 'EmphasisMark') {
              if (child.from < child.to)
                decos.push(Decoration.replace({}).range(child.from, child.to));
            }
          });
          decos.push(Decoration.mark({ class: 'cm-md-em' }).range(node.from, node.to));
        }
        return false;
      }

      if (node.name === 'InlineCode') {
        if (!onCursor) {
          node.node.cursor().iterate(child => {
            if (child.name === 'CodeMark') {
              if (child.from < child.to)
                decos.push(Decoration.replace({}).range(child.from, child.to));
            }
          });
          decos.push(Decoration.mark({ class: 'cm-md-code' }).range(node.from, node.to));
        }
        return false;
      }

      if (/^ATXHeading[1-3]$/.test(node.name)) {
        const level = parseInt(node.name.slice(-1), 10);
        if (!onCursor) {
          node.node.cursor().iterate(child => {
            if (child.name === 'HeaderMark') {
              if (child.from < child.to)
                decos.push(Decoration.replace({}).range(child.from, child.to));
            }
          });
        }
        decos.push(Decoration.mark({ class: `cm-md-h${level}` }).range(node.from, node.to));
        return false;
      }
    }
  });

  decos.sort((a, b) => a.from - b.from || a.startSide - b.startSide);
  return Decoration.set(decos, true);
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) { this.decorations = buildDecorations(view); }
    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: v => v.decorations }
);

/* ================================================================
   3) 공개 API
   ================================================================ */
export function mount(container, { initialDoc = '', onChange } = {}) {
  const view = new EditorView({
    state: EditorState.create({
      doc: initialDoc,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        livePreviewPlugin,
        baseTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of(update => {
          if (update.docChanged && onChange) {
            onChange(update.state.doc.toString());
          }
        }),
      ],
    }),
    parent: container,
  });

  return {
    hasFocus() { return view.hasFocus; },
    setDoc(text) {
      const current = view.state.doc.toString();
      if (current === text) return;
      view.dispatch({ changes: { from: 0, to: current.length, insert: text } });
    },
    getDoc() { return view.state.doc.toString(); },
    destroy() { view.destroy(); },
  };
}
