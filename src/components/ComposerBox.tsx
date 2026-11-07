import { useRef, useState } from 'react';
import {
  AtSign,
  Bold,
  Eye,
  Image as ImageIcon,
  Italic,
  Link2,
  Quote,
  RotateCcw,
  RotateCw,
  Smile,
  Strikethrough,
  Underline,
} from 'lucide-react';

const QUICK_EMOJIS = ['😊', '🔥', '❤️', '👍', '😂', '😭', '💀', '🎉', '✨', '👀'];

interface ComposerBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  autoFocus?: boolean;
}

/**
 * Text box with the formatting toolbar (undo/redo, bold, italic, link, spoiler, emoji...).
 * Used for inline replies; it relies on the .composer-* styles from series-discussion.css.
 */
export function ComposerBox({
  value,
  onChange,
  placeholder = 'What are your thoughts?',
  rows = 3,
  maxLength = 5000,
  autoFocus = false,
}: ComposerBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [history, setHistory] = useState<string[]>([value]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const commit = (next: string) => {
    onChange(next);
    const updated = history.slice(0, historyIndex + 1);
    updated.push(next);
    setHistory(updated);
    setHistoryIndex(updated.length - 1);
  };

  const undo = () => {
    if (historyIndex <= 0) return;
    const previous = historyIndex - 1;
    setHistoryIndex(previous);
    onChange(history[previous]);
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    const next = historyIndex + 1;
    setHistoryIndex(next);
    onChange(history[next]);
  };

  const wrapText = (before: string, after: string, fallback = '') => {
    const el = textareaRef.current;
    if (!el) {
      commit(value + before + fallback + after);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.substring(start, end) || fallback;
    commit(value.substring(0, start) + before + selected + after + value.substring(end));
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  };

  const insertAtCursor = (text: string) => {
    const el = textareaRef.current;
    if (!el) {
      commit(value + text);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    commit(value.substring(0, start) + text + value.substring(end));
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  return (
    <div className="composer-box">
      <div className="composer-toolbar">
        <div className="toolbar-group">
          <button type="button" className="toolbar-btn" onClick={undo} title="Undo" disabled={historyIndex <= 0}>
            <RotateCcw size={9.5} />
          </button>
          <button
            type="button"
            className="toolbar-btn"
            onClick={redo}
            title="Redo"
            disabled={historyIndex >= history.length - 1}
          >
            <RotateCw size={9.5} />
          </button>
          <span className="toolbar-divider" />
          <button type="button" className="toolbar-btn" onClick={() => wrapText('**', '**', 'bold text')} title="Bold">
            <Bold size={9.5} />
          </button>
          <button type="button" className="toolbar-btn" onClick={() => wrapText('*', '*', 'italic text')} title="Italic">
            <Italic size={9.5} />
          </button>
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => wrapText('<u>', '</u>', 'underlined text')}
            title="Underline"
          >
            <Underline size={9.5} />
          </button>
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => wrapText('~~', '~~', 'strikethrough text')}
            title="Strikethrough"
          >
            <Strikethrough size={9.5} />
          </button>
          <span className="toolbar-divider" />
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => {
              const url = window.prompt('Enter link URL (https://...):');
              if (url) wrapText('[', `](${url})`, 'link text');
            }}
            title="Link"
          >
            <Link2 size={9.5} />
          </button>
          <button type="button" className="toolbar-btn" onClick={() => wrapText('||', '||', 'spoiler')} title="Spoiler tag">
            <Eye size={9.5} />
          </button>
          <button type="button" className="toolbar-btn" onClick={() => wrapText('> ', '\n', 'quoted text')} title="Quote">
            <Quote size={9.5} />
          </button>
        </div>

        <div className="toolbar-group">
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => {
              const url = window.prompt('Enter image URL:');
              if (url) insertAtCursor(`![image](${url})`);
            }}
            title="Add image"
          >
            <ImageIcon size={9.5} />
          </button>
          <button
            type="button"
            className={`toolbar-btn${showEmojiPicker ? ' is-active' : ''}`}
            onClick={() => setShowEmojiPicker((open) => !open)}
            title="Emoji"
          >
            <Smile size={9.5} />
          </button>
          <button type="button" className="toolbar-btn" onClick={() => insertAtCursor('@')} title="Mention">
            <AtSign size={9.5} />
          </button>
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => {
              const gif = window.prompt('Enter GIF URL:');
              if (gif) insertAtCursor(`![GIF](${gif})`);
            }}
            title="Insert GIF"
          >
            <span className="toolbar-gif-text">GIF</span>
          </button>
        </div>
      </div>

      {showEmojiPicker && (
        <div className="composer-emoji-picker">
          {QUICK_EMOJIS.map((emoji) => (
            <button key={emoji} type="button" className="composer-emoji-btn" onClick={() => insertAtCursor(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        className="composer-textarea"
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(event) => commit(event.target.value)}
        maxLength={maxLength}
        autoFocus={autoFocus}
      />
    </div>
  );
}
