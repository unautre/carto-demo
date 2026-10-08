import { useMemo } from 'react';
import { javascript } from '@codemirror/lang-javascript';
import { sql } from '@codemirror/lang-sql';
import { EditorView } from '@codemirror/view';
import ReactCodeMirror from '@uiw/react-codemirror';

/** Matches this app's own field styling (see `.field textarea` in styles.css) — follows light/dark via the CSS custom properties themselves, no JS theme-switching needed. */
const appTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
  },
  '&.cm-focused': {
    outline: 'none',
    borderColor: 'var(--accent)',
  },
  '.cm-content': {
    fontFamily: 'ui-monospace, monospace',
    padding: '8px 10px',
    caretColor: 'var(--text)',
  },
  '.cm-gutters': { display: 'none' },
  '.cm-placeholder': { color: 'var(--muted)' },
});

export type CodeEditorLanguage = 'sql' | 'javascript';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: CodeEditorLanguage;
  placeholder?: string;
  minHeight?: string;
  autoFocus?: boolean;
  /** Fired when focus leaves the editor — e.g. to commit a value only once editing is done, instead of on every keystroke. */
  onBlur?: () => void;
}

/** A CodeMirror 6 editor (syntax highlighting + basic completion) shared by every SQL and JS code field in the app. */
export function CodeEditor({ value, onChange, language, placeholder, minHeight = '80px', autoFocus, onBlur }: CodeEditorProps) {
  const extensions = useMemo(() => [language === 'sql' ? sql() : javascript(), EditorView.lineWrapping, appTheme], [language]);

  return (
    <ReactCodeMirror
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      extensions={extensions}
      theme="none"
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLineGutter: false,
        highlightActiveLine: false,
      }}
      placeholder={placeholder}
      minHeight={minHeight}
      autoFocus={autoFocus}
    />
  );
}
