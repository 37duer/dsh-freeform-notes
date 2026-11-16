window.__ModuleLoader__.load({
  id: '@local/dsh-freeform-notes',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const LOCALE_NS = 'freeformNotes';
    const STORAGE_KEY = 'dsh.freeform-notes.v1';
    const SAVE_DELAY = 400;
    const justOpened = new Set();

    const zh = {
      title: '速记',
      editor: '速记内容',
      placeholder: '随手记点什么……',
      desc: '随手记录文字，内容保存在当前浏览器中',
      error: '未能保存：浏览器存储不可用或已满',
      hint: '内容保存在本浏览器',
      hintError: '内容仅保留在当前页面',
      chars: '{n} 字符',
      clear: '清空内容',
      clearTitle: '清空速记内容',
      push: '推送到对话',
      pushTitle: '追加到对话输入框，不自动发送',
      pushOk: '已追加到对话输入框',
      pushFail: '推送失败：对话输入框不可用',
    };

    const en = {
      title: 'Notes',
      editor: 'Note text',
      placeholder: 'Jot something down…',
      desc: 'A scratch pad whose text is saved in this browser',
      error: 'Not saved: this browser’s storage is unavailable or full',
      hint: 'Saved in this browser',
      hintError: 'Kept on this page only',
      chars: '{n} chars',
      clear: 'Clear',
      clearTitle: 'Clear the note',
      push: 'Push to chat',
      pushTitle: 'Append to the chat input; nothing is sent',
      pushOk: 'Added to the chat input',
      pushFail: 'Push failed: chat input unavailable',
    };

    const CSS = `
.dsh-notes-tab {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
}
.dsh-notes-tab-input {
  flex: 1;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 10px 14px 8px;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  caret-color: var(--dsw-alias-state-business-primary);
  font-family: var(--ds-font-family-code);
  font-size: 13px;
  line-height: 1.65;
}
.dsh-notes-tab-input:focus-visible {
  outline-style: solid;
  outline-offset: -2px;
}
.dsh-notes-tab-input::placeholder {
  color: var(--dsw-alias-label-secondary);
  opacity: 0.8;
}
.dsh-notes-tab-foot {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 14px 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 16px;
}
.dsh-notes-tab-meta {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.dsh-notes-tab-meta[data-state="error"] {
  color: var(--dsw-alias-state-error-primary);
}
.dsh-notes-tab-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}
.dsh-notes-tab-btn {
  flex: none;
  margin: 0;
  padding: 2px 10px;
  border: 1px solid var(--dsw-alias-label-secondary);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
}
.dsh-notes-tab-btn:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-primary);
}
.dsh-notes-tab-btn:focus-visible {
  outline-style: solid;
  outline-offset: 1px;
}
.dsh-notes-tab-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.dsh-notes-tab-btn-primary {
  color: var(--dsw-alias-state-business-primary);
  border-color: var(--dsw-alias-state-business-primary);
}
.dsh-notes-tab-btn-primary:hover:not(:disabled) {
  color: var(--dsw-alias-state-business-primary);
  border-color: var(--dsw-alias-state-business-primary);
}
.dsh-notes-tab-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
@media (pointer: coarse) {
  .dsh-notes-tab-input {
    font-size: 16px;
  }
}
`;

    let segmenter;
    function charCount(text) {
      if (segmenter === undefined) {
        segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
          ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
          : null;
      }
      if (segmenter === null) return Array.from(text).length;
      let count = 0;
      for (const unused of segmenter.segment(text)) count += 1;
      return count;
    }

    function readStored() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.text === 'string') return { text: parsed.text, ok: true };
        }
        return { text: '', ok: true };
      } catch (error) {
        // Storage unavailable or unreadable; keep the editor usable in memory only.
        return { text: '', ok: false };
      }
    }

    // ----- Markdown editing aids (plain-text editing only; no rendering) -----
    // List line: indent + quote prefix + spaces + (bullet | ordered marker) + spaces + content.
    // Group 1 indent, 2 quote, 3 pad, 4 bullet, 5 task state, 6 ordered number,
    // 7 ordered separator, 8 spaces after marker, 9 content.
    const LIST_LINE = /^([ \t]*)((?:>[ \t]?)*)([ \t]*)(?:([-*+])(?:[ \t]+\[([ xX])\])?|(\d+)([.)]))([ \t]+)(.*)$/;
    // Quote-only line: indent + one or more ">" markers + content.
    const QUOTE_LINE = /^([ \t]*)((?:>[ \t]?)+)[ \t]*(.*)$/;

    /**
     * Decide what Enter should do on `line`.
     * - { mode: 'continue', prefix }: insert a newline carrying the same Markdown prefix
     *   (ordered lists increment, task items restart unchecked).
     * - { mode: 'exit', keep }: drop the marker of an empty list/quote line.
     * - null: let the browser insert a plain newline.
     */
    function planLineEnter(line) {
      const list = LIST_LINE.exec(line);
      if (list !== null) {
        const indent = list[1];
        const quote = list[2];
        const pad = list[3];
        const bullet = list[4];
        const task = list[5];
        const ordNum = list[6];
        const ordSep = list[7];
        const content = list[9];
        if (content.trim() === '') return { mode: 'exit', keep: indent + quote };
        const marker = bullet !== undefined
          ? bullet + (task !== undefined ? ' [ ]' : '') + ' '
          : String(parseInt(ordNum, 10) + 1) + ordSep + ' ';
        return { mode: 'continue', prefix: indent + quote + pad + marker };
      }
      const quoteLine = QUOTE_LINE.exec(line);
      if (quoteLine !== null) {
        const indent = quoteLine[1];
        const quote = quoteLine[2];
        const content = quoteLine[3];
        if (content.trim() === '') return { mode: 'exit', keep: indent };
        return { mode: 'continue', prefix: indent + (/[ \t]$/.test(quote) ? quote : quote + ' ') };
      }
      return null;
    }

    // ----- Push note text into the DSH conversation composer (draft only) -----
    // Mirrors dsh-better-sidebar's appendToDraft path: the conversation service
    // is resolved lazily through ctx.get, the session scope is the tab's own
    // props.scope.sessionId, and setDraft is the input machine's single public
    // write path. A missing service degrades to a failed push, never a crash.

    /**
     * Splice `text` into `draft` at `caret` (replacing any live selection) with
     * whitespace-aware joins and report the caret position right after the
     * inserted text. `caret === null` (position unknown) appends at the end.
     */
    function spliceInsert(draft, text, caret) {
      if (caret === null || draft === '') {
        const next = draft.trim() === '' ? text : draft + (/\s$/.test(draft) ? '' : ' ') + text;
        return { draft: next, caretAfter: next.length };
      }
      const prefix = draft.slice(0, caret.start);
      const suffix = draft.slice(caret.end);
      if (prefix === '' && suffix === '') return { draft: text, caretAfter: text.length };
      const left = prefix === '' || /\s$/.test(prefix) ? '' : ' ';
      return {
        draft: prefix + left + text + (suffix === '' || /^\s/.test(suffix) || /\s$/.test(text) ? '' : ' ') + suffix,
        caretAfter: prefix.length + left.length + text.length,
      };
    }

    /**
     * Locate the composer <textarea> in the conversation column: prefer the
     * data-phase-tagged textarea (the composer's marker), falling back to any
     * textarea in the column, then to a bare data-phase textarea.
     */
    function findComposerTextarea() {
      if (typeof document === 'undefined') return null;
      const column = document.querySelector('#root [data-slot="conversation"]');
      const find = function (scope) {
        return scope.querySelector('textarea[data-phase]') || scope.querySelector('textarea');
      };
      return column !== null ? find(column) : document.querySelector('textarea[data-phase]');
    }

    /**
     * Resolve the composer's live caret from its DOM <textarea>. The value-sync
     * check (el.value === draft) discards stale or wrong-composer reads.
     * Returns null when the composer is missing, disabled/read-only, out of
     * sync with the store draft, or has no measurable selection.
     */
    function probeComposerCaret(draft) {
      const el = findComposerTextarea();
      if (el === null || el.disabled || el.readOnly) return null;
      if (el.value !== draft) return null;
      let start = el.selectionStart;
      let end = el.selectionEnd;
      if (typeof start !== 'number' || typeof end !== 'number') return null;
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      start = Math.max(0, Math.min(start, draft.length));
      end = Math.max(start, Math.min(end, draft.length));
      return { start: start, end: end };
    }

    /**
     * Restore the composer caret to `caretIndex` after a programmatic setDraft
     * commit (a controlled textarea update resets the caret). Scheduled and
     * retried across at most two animation frames, and only applied when the
     * textarea still matches `expectedDraft`.
     */
    function placeComposerCaretAfterInsert(expectedDraft, caretIndex) {
      let remaining = 2;
      let scheduled = false;
      const schedule = function (fn) {
        if (scheduled) return;
        scheduled = true;
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
        else window.setTimeout(fn, 0);
      };
      const place = function () {
        scheduled = false;
        if (remaining <= 0) return;
        remaining -= 1;
        const el = findComposerTextarea();
        if (el === null || el.disabled || el.readOnly) return;
        if (el.value !== expectedDraft) {
          schedule(place);
          return;
        }
        const clamped = Math.max(0, Math.min(caretIndex, el.value.length));
        el.setSelectionRange(clamped, clamped);
      };
      schedule(place);
    }

    /**
     * Append `text` to the session's composer draft at the composer's live
     * caret (falls back to appending at the end). Returns false — and logs —
     * when the conversation service or the session scope is unavailable.
     * Never sends: it only writes the draft.
     */
    function appendToComposer(ctx, scope, text) {
      try {
        if (scope === undefined || scope === null || typeof scope.sessionId !== 'string') {
          console.warn('[dsh-freeform-notes] push skipped: no session scope');
          return false;
        }
        const actx = ctx.sessions.scope(scope.sessionId);
        if (actx === undefined) {
          console.warn('[dsh-freeform-notes] push skipped: no session scope', scope.sessionId);
          return false;
        }
        const conversation = ctx.get('conversation');
        if (conversation === undefined) {
          console.warn('[dsh-freeform-notes] push skipped: conversation service unavailable');
          return false;
        }
        const input = conversation.input.for(actx);
        const draft = input.state.getSnapshot().draft;
        const result = spliceInsert(draft, text, probeComposerCaret(draft));
        input.setDraft(result.draft);
        placeComposerCaretAfterInsert(result.draft, result.caretAfter);
        return true;
      } catch (error) {
        console.warn('[dsh-freeform-notes] push failed:', error);
        return false;
      }
    }

    function useTranslator(ctx) {
      const subscribe = React.useCallback(function (callback) {
        return ctx.locale.subscribe(callback);
      }, [ctx]);
      React.useSyncExternalStore(subscribe, function () {
        return ctx.locale.getSnapshot().revision;
      });
      return ctx.locale.bind(LOCALE_NS);
    }

    function NotesTab(props) {
      const t = useTranslator(props.ctx);
      const [initial] = React.useState(readStored);
      const [state, setState] = React.useState(function () { return { text: initial.text }; });
      const [status, setStatus] = React.useState(initial.ok ? 'saved' : 'error');
      const [flash, setFlash] = React.useState(null);
      const latest = React.useRef(state);
      const timer = React.useRef(null);
      const input = React.useRef(null);
      const caret = React.useRef(null);
      const flashTimer = React.useRef(null);
      latest.current = state;

      const write = React.useCallback(function (next) {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          return true;
        } catch (error) {
          // Quota exceeded or storage disabled; the text stays in memory only.
          return false;
        }
      }, []);

      const flush = React.useCallback(function () {
        if (timer.current === null) return;
        window.clearTimeout(timer.current);
        timer.current = null;
        write(latest.current);
      }, [write]);

      React.useEffect(function () {
        return flush;
      }, [flush]);

      React.useEffect(function () {
        window.addEventListener('pagehide', flush);
        function onVisibility() {
          if (document.visibilityState === 'hidden') flush();
        }
        document.addEventListener('visibilitychange', onVisibility);
        return function () {
          window.removeEventListener('pagehide', flush);
          document.removeEventListener('visibilitychange', onVisibility);
        };
      }, [flush]);

      React.useEffect(function () {
        if (!props.visible) return;
        if (!justOpened.delete(props.tab.id)) return;
        if (input.current !== null) input.current.focus();
      }, [props.visible, props.tab.id]);

      React.useEffect(function () {
        function onStorage(event) {
          if (event.key !== STORAGE_KEY || event.newValue === null) return;
          if (timer.current !== null) return;
          try {
            const parsed = JSON.parse(event.newValue);
            if (!parsed || typeof parsed.text !== 'string') return;
            if (parsed.text === latest.current.text) return;
            const next = { text: parsed.text };
            latest.current = next;
            setState(next);
          } catch (error) {
            // Ignore malformed payloads written by another tab.
          }
        }
        window.addEventListener('storage', onStorage);
        return function () { window.removeEventListener('storage', onStorage); };
      }, []);

      const commit = React.useCallback(function (text) {
        const next = { text };
        setState(next);
        latest.current = next;
        if (timer.current !== null) {
          window.clearTimeout(timer.current);
          timer.current = null;
        }
        setStatus('saving');
        timer.current = window.setTimeout(function () {
          timer.current = null;
          setStatus(write(latest.current) ? 'saved' : 'error');
        }, SAVE_DELAY);
      }, [write]);

      const handleKeyDown = React.useCallback(function (event) {
        if (event.key !== 'Enter') return;
        // Shift/Ctrl/Alt/Enter combos keep the browser default (plain newline etc.).
        if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
        // Never intercept Enter while an IME composition is in flight.
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        const el = input.current;
        if (el === null || el.selectionStart !== el.selectionEnd) return;
        const value = latest.current.text;
        const pos = el.selectionStart;
        const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
        let lineEnd = value.indexOf('\n', pos);
        if (lineEnd === -1) lineEnd = value.length;
        const plan = planLineEnter(value.slice(lineStart, lineEnd));
        if (plan === null) return;
        event.preventDefault();
        let nextText;
        let nextCaret;
        if (plan.mode === 'exit') {
          nextText = value.slice(0, lineStart) + plan.keep + value.slice(lineEnd);
          nextCaret = lineStart + plan.keep.length;
        } else {
          nextText = value.slice(0, pos) + '\n' + plan.prefix + value.slice(pos);
          nextCaret = pos + 1 + plan.prefix.length;
        }
        caret.current = nextCaret;
        commit(nextText);
      }, [commit]);

      React.useLayoutEffect(function () {
        if (caret.current === null) return;
        const el = input.current;
        if (el !== null) {
          el.selectionStart = caret.current;
          el.selectionEnd = caret.current;
        }
        caret.current = null;
      });

      const showFlash = React.useCallback(function (message) {
        setFlash(message);
        if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(function () {
          flashTimer.current = null;
          setFlash(null);
        }, 1600);
      }, []);

      React.useEffect(function () {
        return function () {
          if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
        };
      }, []);

      const handleClear = React.useCallback(function () {
        if (latest.current.text.length === 0) return;
        commit('');
        if (input.current !== null) input.current.focus();
      }, [commit]);

      const handlePush = React.useCallback(function () {
        const text = latest.current.text;
        if (text.length === 0) return;
        // Appends to the composer draft at its caret; never sends, never clears.
        const ok = appendToComposer(props.ctx, props.scope, text);
        showFlash(ok ? t('pushOk') : t('pushFail'));
      }, [props.ctx, props.scope, showFlash, t]);

      const hint = status === 'error' ? t('hintError') : t('hint');
      const metaText = flash !== null
        ? flash
        : hint + ' · ' + t('chars', { n: charCount(state.text) });

      return h('div', { className: 'dsh-notes-tab' },
        h('style', { key: 'style' }, CSS),
        h('textarea', {
          key: 'editor',
          ref: input,
          className: 'dsh-notes-tab-input',
          value: state.text,
          placeholder: t('placeholder'),
          'aria-label': t('editor'),
          spellCheck: false,
          autoComplete: 'off',
          onChange: function (event) {
            commit(event.target.value);
          },
          onKeyDown: handleKeyDown,
        }),
        h('div', { key: 'foot', className: 'dsh-notes-tab-foot' },
          h('span', {
            key: 'meta',
            className: 'dsh-notes-tab-meta',
            'data-state': status,
          }, metaText),
          h('span', {
            key: 'alert',
            className: 'dsh-notes-tab-sr',
            role: 'alert',
          }, status === 'error' ? t('error') : ''),
          h('div', { key: 'actions', className: 'dsh-notes-tab-actions' },
            h('button', {
              key: 'clear',
              type: 'button',
              className: 'dsh-notes-tab-btn',
              title: t('clearTitle'),
              disabled: state.text.length === 0,
              onClick: handleClear,
            }, t('clear')),
            h('button', {
              key: 'push',
              type: 'button',
              className: 'dsh-notes-tab-btn dsh-notes-tab-btn-primary',
              title: t('pushTitle'),
              disabled: state.text.length === 0,
              onClick: handlePush,
            }, t('push')),
          ),
        ),
      );
    }

    function NoteIcon(size) {
      return h('svg', {
        width: size, height: size, viewBox: '6 7 24 24', 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', strokeWidth: 2.2,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      },
        h('path', { d: 'M11 8.5h9.8L26 13.6V27a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 10 27V10a1.5 1.5 0 0 1 1-1.5z' }),
        h('path', { d: 'M20.4 8.5v5.4h5.2' }),
        h('path', { d: 'M14 18h8M14 21.5h8M14 25h5' }),
      );
    }

    return {
      inject: ['locale', 'betterSidebar'],
      apply(ctx) {
        ctx.effect(function () {
          return ctx.locale.register(LOCALE_NS, { zh, en });
        });
        const t = ctx.locale.bind(LOCALE_NS);
        ctx.effect(function () {
          return ctx.betterSidebar.registerTab({
            id: 'dsh-freeform-notes:notes',
            title: function () { return t('title'); },
            description: function () { return t('desc'); },
            icon: NoteIcon,
            order: 45,
            bottomOnly: true,
            single: true,
            onOpen: function (tab) { justOpened.add(tab.id); },
            onClose: function (tab) { justOpened.delete(tab.id); },
            component: NotesTab,
          });
        });
      },
    };
  },
});
