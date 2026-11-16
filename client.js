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
      saved: '已保存',
      saving: '保存中…',
      error: '未能保存：浏览器存储不可用或已满',
      hint: '内容保存在本浏览器',
      hintError: '内容仅保留在当前页面',
      chars: '{n} 字符',
    };

    const en = {
      title: 'Notes',
      editor: 'Note text',
      placeholder: 'Jot something down…',
      desc: 'A scratch pad whose text is saved in this browser',
      saved: 'Saved',
      saving: 'Saving…',
      error: 'Not saved: this browser’s storage is unavailable or full',
      hint: 'Saved in this browser',
      hintError: 'Kept on this page only',
      chars: '{n} chars',
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
.dsh-notes-tab-status {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--dsw-alias-label-secondary);
}
.dsh-notes-tab-status[data-state="error"] {
  color: var(--dsw-alias-state-error-primary);
}
.dsh-notes-tab-meta {
  flex: none;
  max-width: 60%;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
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
      const latest = React.useRef(state);
      const timer = React.useRef(null);
      const input = React.useRef(null);
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

      const statusText = status === 'saving' ? t('saving') : status === 'error' ? t('error') : t('saved');
      const hint = status === 'error' ? t('hintError') : t('hint');

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
        }),
        h('div', { key: 'foot', className: 'dsh-notes-tab-foot' },
          h('span', {
            key: 'status',
            className: 'dsh-notes-tab-status',
            'data-state': status,
            title: statusText,
          }, statusText),
          h('span', {
            key: 'alert',
            className: 'dsh-notes-tab-sr',
            role: 'alert',
          }, status === 'error' ? t('error') : ''),
          h('span', { key: 'meta', className: 'dsh-notes-tab-meta' },
            hint + ' · ' + t('chars', { n: charCount(state.text) }),
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
