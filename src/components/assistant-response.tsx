'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Icon } from './icon';

interface ResponseProps {
  content: string;
  animate: boolean;
  copied: boolean;
  onCopy: () => void;
  onProgress: () => void;
  onRevealComplete: () => void;
}

export function AssistantResponse({
  content,
  animate,
  copied,
  onCopy,
  onProgress,
  onRevealComplete,
}: ResponseProps) {
  const [visible, setVisible] = useState(animate ? '' : content);
  const frame = useRef<number | null>(null);
  const typing = animate && visible.length < content.length;

  function reveal() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setVisible(content);
    onRevealComplete();
  }

  useEffect(() => {
    if (!animate) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finish = () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      setVisible(content);
      onRevealComplete();
    };
    if (motion.matches || document.hidden) {
      finish();
      return;
    }

    // Reveal whole graphemes so accented characters and emoji stay intact.
    const characters = Array.from(
      new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(content),
      ({ segment }) => segment
    );
    const rate = Math.max(65, characters.length / 24);
    const start = performance.now();
    let shown = 0;
    let lastUpdate = 0;
    setVisible('');
    const tick = (now: number) => {
      const count = Math.min(
        characters.length,
        Math.max(1, Math.floor(((now - start) * rate) / 1000))
      );
      if (count === characters.length) {
        finish();
        return;
      }
      if (count > shown && now - lastUpdate >= 35) {
        shown = count;
        lastUpdate = now;
        setVisible(characters.slice(0, count).join(''));
      }
      frame.current = requestAnimationFrame(tick);
    };
    const onMotion = () => {
      if (motion.matches) finish();
    };
    const onVisibility = () => {
      if (document.hidden) finish();
    };
    motion.addEventListener('change', onMotion);
    document.addEventListener('visibilitychange', onVisibility);
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      motion.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [animate, content, onRevealComplete]);

  useEffect(() => {
    onProgress();
  }, [visible, onProgress]);

  return (
    <div className={`assistant-response ${typing ? 'response-typing' : ''}`} aria-busy={typing}>
      <div className="markdown-content" aria-live="off">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{typing ? visible : content}</ReactMarkdown>
      </div>
      <span className="sr-only" role="status">
        {typing ? 'UNUVIA is writing a response.' : 'UNUVIA response is ready.'}
      </span>
      {typing ? (
        <Button variant="ghost" className="message-copy response-reveal" onClick={reveal}>
          <Icon name="arrow" /> Show full response
        </Button>
      ) : (
        <Button variant="ghost" className="message-copy" onClick={onCopy}>
          <Icon name={copied ? 'check' : 'copy'} />
          {copied ? 'Copied' : 'Copy response'}
        </Button>
      )}
    </div>
  );
}
