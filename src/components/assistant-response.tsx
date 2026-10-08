'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { type Artifact, splitResponse } from '@/lib/artifacts';
import { ArtifactCard } from './artifact-panel';
import { Icon } from './icon';

interface ResponseProps {
  content: string;
  /** Stable key of the message, so its files keep their ids. */
  messageKey: string;
  /** The text is still arriving from the model. */
  streaming?: boolean;
  stopped?: boolean;
  copied: boolean;
  onCopy: () => void;
  activeArtifactId?: string;
  onOpenArtifact: (artifact: Artifact) => void;
}

export function AssistantResponse({
  content,
  messageKey,
  streaming = false,
  stopped = false,
  copied,
  onCopy,
  activeArtifactId,
  onOpenArtifact,
}: ResponseProps) {
  const segments = useMemo(
    () => splitResponse(content, messageKey, streaming),
    [content, messageKey, streaming]
  );
  return (
    <div
      className={`assistant-response ${streaming ? 'response-typing' : ''}`}
      aria-busy={streaming}
    >
      <div className="markdown-content" aria-live="off">
        {segments.map((segment, i) =>
          segment.kind === 'text' ? (
            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
              {segment.text}
            </ReactMarkdown>
          ) : (
            <ArtifactCard
              key={segment.artifact.id}
              artifact={segment.artifact}
              active={segment.artifact.id === activeArtifactId}
              onOpen={onOpenArtifact}
            />
          )
        )}
      </div>
      <span className="sr-only" role="status">
        {streaming ? 'UNUVIA is writing a response.' : 'UNUVIA response is ready.'}
      </span>
      {stopped && <p className="response-stopped">Response stopped.</p>}
      {!streaming && (
        <Button variant="ghost" className="message-copy" onClick={onCopy}>
          <Icon name={copied ? 'check' : 'copy'} />
          {copied ? 'Copied' : 'Copy response'}
        </Button>
      )}
    </div>
  );
}
