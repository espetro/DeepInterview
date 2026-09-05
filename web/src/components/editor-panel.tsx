import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { FormattedMessage, useIntl } from "react-intl";
import { LanguageDescription, LanguageSupport } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { markdown } from "@codemirror/lang-markdown";

import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { sql } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  $editorBuffer,
  $editorLanguage,
  $editorTheme,
} from "../stores/session";

const LANGUAGES = [
  "markdown",
  "javascript",
  "typescript",
  "python",
  "json",
  "sql",
] as const;

const LANGUAGE_DESCRIPTIONS: readonly LanguageDescription[] = [
  LanguageDescription.of({
    name: "markdown",
    load: () => Promise.resolve(markdown()),
  }),
  LanguageDescription.of({
    name: "javascript",
    load: () => Promise.resolve(javascript()),
  }),
  LanguageDescription.of({
    name: "typescript",
    load: () => Promise.resolve(javascript({ typescript: true })),
  }),
  LanguageDescription.of({
    name: "python",
    load: () => Promise.resolve(python()),
  }),
  LanguageDescription.of({
    name: "json",
    load: () => Promise.resolve(json()),
  }),
  LanguageDescription.of({
    name: "sql",
    load: () => Promise.resolve(sql()),
  }),
];

function languageSupport(name: string): LanguageSupport {
  const desc =
    LANGUAGE_DESCRIPTIONS.find((d) => d.name === name) ??
    LANGUAGE_DESCRIPTIONS[0]!;
  // loaders resolve synchronously (Promise.resolve), so support is populated
  // immediately after the first load(); this covers the initial render.
  if (!desc.support) void desc.load();
  return desc.support!;
}

/** Dark theme matching the app's espresso palette. */
const espressoDark = EditorView.theme(
  {
    "&": { color: "#e8e0d8", backgroundColor: "#1a1512" },
    ".cm-content": { caretColor: "#e8624a" },
    "&.cm-focused": { outline: "none" },
    ".cm-gutters": {
      backgroundColor: "#1a1512",
      color: "#6b5d4f",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "#241d18" },
    ".cm-activeLineGutter": { backgroundColor: "#241d18" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "#3d2f28",
    },
    ".cm-cursor": { borderLeftColor: "#e8624a" },
    ".cm-placeholder": { color: "#6b5d4f" },
  },
  { dark: true },
);

/** Light theme with hairline accents, keeping the default light feel. */
const plainLight = EditorView.theme(
  {
    "&": { backgroundColor: "#ffffff", color: "#2d2118" },
    "&.cm-focused": { outline: "none" },
    ".cm-gutters": {
      backgroundColor: "#ffffff",
      color: "#a08e7d",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "#f7f3ee" },
    ".cm-activeLineGutter": { backgroundColor: "#f7f3ee" },
    ".cm-placeholder": { color: "#a08e7d" },
  },
  { dark: false },
);

/**
 * CodeMirror 6 editor for the interview screen. Pure editing surface: syntax
 * highlighting only, no execution of any kind. Buffer mirrors $editorBuffer
 * for the worker's read_editor tool. Language choice and editor theme persist
 * independently of the app theme.
 */
export function EditorPanel() {
  const intl = useIntl();
  const buffer = useStore($editorBuffer);
  const language = useStore($editorLanguage);
  const theme = useStore($editorTheme);
  const dark = theme === "dark";

  const languageComp = useRef(new Compartment());
  const themeComp = useRef(new Compartment());

  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const latest = useRef({ buffer });
  latest.current = { buffer };

  const languageExtension = useMemo(
    () => languageSupport(language),
    [language],
  );
  const themeExtension = useMemo(
    () => (dark ? espressoDark : plainLight),
    [dark],
  );

  useEffect(() => {
    if (!host) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: latest.current.buffer,
        extensions: [
          EditorView.lineWrapping,
          languageComp.current.of(languageExtension),
          themeComp.current.of(themeExtension),
          EditorView.updateListener.of(
            (update: import("@codemirror/view").ViewUpdate) => {
              if (update.docChanged)
                $editorBuffer.set(update.state.doc.toString());
            },
          ),
        ],
      }),
      parent: host,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [host]);

  useEffect(() => {
    const view = viewRef.current;
    if (view)
      view.dispatch({
        effects: languageComp.current.reconfigure(languageExtension),
      });
  }, [languageExtension]);

  useEffect(() => {
    const view = viewRef.current;
    if (view)
      view.dispatch({ effects: themeComp.current.reconfigure(themeExtension) });
  }, [themeExtension]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== buffer) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: buffer },
      });
    }
  }, [buffer, host]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={language}
          onChange={(e) => $editorLanguage.set(e.target.value)}
          aria-label={intl.formatMessage({ id: "editor.language" })}
          className="cursor-pointer rounded-full bg-white px-3 py-1.5 text-sm font-medium text-espresso-soft ring-1 ring-hairline outline-none transition-fluid hover:ring-persimmon/40 focus:ring-2 focus:ring-persimmon/50"
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => $editorTheme.set(dark ? "light" : "dark")}
          aria-label={intl.formatMessage({ id: "editor.theme" })}
          className="cursor-pointer rounded-full bg-white px-3 py-1.5 text-sm font-medium text-espresso-soft ring-1 ring-hairline outline-none transition-fluid hover:ring-persimmon/40 focus:ring-2 focus:ring-persimmon/50"
        >
          {dark ? "dark" : "light"}
        </button>
        <span className="text-sm text-espresso-soft">
          <FormattedMessage id="editor.language" />
        </span>
      </div>
      <div
        ref={setHost}
        aria-label={intl.formatMessage({ id: "interview.editorPlaceholder" })}
        className="flex-1 overflow-hidden rounded-2xl font-mono text-sm leading-relaxed"
        style={{ backgroundColor: dark ? "#1a1512" : "#ffffff" }}
      />
    </div>
  );
}
