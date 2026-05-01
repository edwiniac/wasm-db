import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { Compartment, EditorState } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { sql } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';

interface SQLEditorProps {
  value: string;
  disabled: boolean;
  onChange: (sql: string) => void;
  onRun: () => void;
}

export interface SQLEditorHandle {
  insertAtCursor: (text: string) => void;
}

export const SQLEditor = forwardRef<SQLEditorHandle, SQLEditorProps>(function SQLEditor(
  { value, disabled, onChange, onRun },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const editableCompartment = useRef(new Compartment());
  const onRunRef = useRef(onRun);
  const onChangeRef = useRef(onChange);

  useLayoutEffect(() => {
    onRunRef.current = onRun;
    onChangeRef.current = onChange;
  });

  useImperativeHandle(ref, () => ({
    insertAtCursor(text: string) {
      const view = viewRef.current;
      if (!view) return;
      const from = view.state.selection.main.from;
      view.dispatch({
        changes: { from, insert: text },
        selection: { anchor: from + text.length },
      });
      view.focus();
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    const runKeymap = keymap.of([
      {
        key: 'Ctrl-Enter',
        mac: 'Cmd-Enter',
        run: () => {
          onRunRef.current();
          return true;
        },
      },
    ]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          sql(),
          oneDark,
          keymap.of([...defaultKeymap, indentWithTab]),
          runKeymap,
          updateListener,
          editableCompartment.current.of(EditorView.editable.of(true)),
          EditorView.theme({
            '&': { height: '140px' },
            '.cm-scroller': { overflow: 'auto', fontFamily: 'monospace', fontSize: '13px' },
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (e.g. URL auto-populate) without losing cursor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  // Sync disabled state via Compartment reconfigure
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: editableCompartment.current.reconfigure(EditorView.editable.of(!disabled)),
    });
  }, [disabled]);

  return (
    <div
      ref={containerRef}
      style={{ border: '1px solid #444', borderRadius: '4px', overflow: 'hidden' }}
      aria-label="SQL editor"
    />
  );
});
