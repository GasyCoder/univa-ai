'use client';

import { useEffect, useState, type RefObject } from 'react';
import { ArrowUp, FileText, LoaderCircle, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MODELS, type Attachment, type AssistantModel } from '@/lib/chat-models';
import { Icon } from './icon';

interface ComposerProps {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  draft: string;
  onDraftChange: (value: string) => void;
  model: string;
  onModelChange: (value: string) => void;
  onModelOpenChange: (open: boolean) => void;
  file: Attachment | null;
  onRemoveFile: () => void;
  onFile: (file: File) => Promise<void>;
  fileLoading: boolean;
  loading: boolean;
  canSend: boolean;
  hasMessages: boolean;
  onSend: () => Promise<void>;
}

export function ChatComposer({
  inputRef,
  fileInputRef,
  draft,
  onDraftChange,
  model,
  onModelChange,
  onModelOpenChange,
  file,
  onRemoveFile,
  onFile,
  fileLoading,
  loading,
  canSend,
  hasMessages,
  onSend,
}: ComposerProps) {
  const [dragging, setDragging] = useState(false);
  const selectedModel = MODELS.find((item) => item.id === model) ?? MODELS[0];
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
  }, [draft, inputRef]);
  function modelOption(item: AssistantModel) {
    return (
      <SelectItem key={item.id} value={item.id} textValue={item.label} className="model-option">
        <span className={`model-option-icon ${item.icon}`}>
          <Icon name={item.icon} />
        </span>
        <span className="model-option-copy">
          <span className="model-option-heading">
            <strong>{item.label}</strong>
            <Badge variant="secondary">{item.badge}</Badge>
          </span>
          <span className="model-option-description">{item.description}</span>
        </span>
      </SelectItem>
    );
  }
  return (
    <div className="composer-block">
      <Card
        className={`chat-composer ${dragging ? 'is-dragging' : ''}`}
        onDragEnter={(e) => {
          if (e.dataTransfer.types.includes('Files') && !loading && !fileLoading) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = loading || fileLoading ? 'none' : 'copy';
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!loading && !fileLoading && e.dataTransfer.files[0])
            void onFile(e.dataTransfer.files[0]);
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSend();
          }}
        >
          {dragging && (
            <div className="composer-drop-hint" aria-hidden="true">
              <FileText />
              <strong>Drop your document here</strong>
              <span>.txt, .md, or .csv · up to 2 MB</span>
            </div>
          )}
          {file && (
            <div className="attachment-pill">
              <span className="attachment-icon">
                <FileText size={19} />
              </span>
              <span className="attachment-copy">
                <strong>{file.name}</strong>
                <span>Text document · {file.text.length.toLocaleString('en-US')} characters</span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                aria-label="Remove attachment"
                disabled={loading}
                onClick={onRemoveFile}
              >
                <X size={16} />
              </Button>
            </div>
          )}
          <Label htmlFor="chat-input" className="sr-only">
            Your question for UNUVIA
          </Label>
          <Textarea
            ref={inputRef}
            id="chat-input"
            name="draft"
            className="prompt-input"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                window.matchMedia('(pointer: fine)').matches
              ) {
                e.preventDefault();
                void onSend();
              }
            }}
            rows={3}
            maxLength={10000}
            aria-describedby="composer-help"
            placeholder={
              file
                ? 'What would you like to know about this document?'
                : hasMessages
                  ? 'Keep the conversation going…'
                  : 'Ask a question, share an idea, or drop a document…'
            }
          />
          <div className="composer-toolbar">
            <div className="composer-options">
              <Label className="sr-only" htmlFor="chat-model">
                AI model
              </Label>
              <Select
                value={model}
                onOpenChange={onModelOpenChange}
                onValueChange={(value) => {
                  if (MODELS.some((item) => item.id === value)) onModelChange(value);
                }}
                disabled={loading}
              >
                <SelectTrigger id="chat-model" className="model-control">
                  <span className="model-trigger-icon">
                    <Icon name={selectedModel.icon} />
                  </span>
                  <SelectValue>{selectedModel.label}</SelectValue>
                </SelectTrigger>
                <SelectContent position="popper" side="bottom" align="start" className="model-menu">
                  <SelectGroup>
                    <SelectLabel>Choose your model</SelectLabel>
                    {MODELS.filter((item) => !item.legacy).map(modelOption)}
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Other versions</SelectLabel>
                    {MODELS.filter((item) => item.legacy).map(modelOption)}
                  </SelectGroup>
                  <p className="model-menu-note">Availability depends on your connected service.</p>
                </SelectContent>
              </Select>
            </div>
            <div className="composer-actions">
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept=".txt,.md,.csv,text/plain,text/markdown,text/csv"
                aria-label="Choose a text document"
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  e.target.value = '';
                  if (selected) void onFile(selected);
                }}
                tabIndex={-1}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="attach-button"
                    type="button"
                    disabled={fileLoading || loading}
                    aria-label={fileLoading ? 'Reading file' : 'Attach a text document'}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {fileLoading ? (
                      <LoaderCircle className="animate-spin" size={18} />
                    ) : (
                      <Paperclip size={19} />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add a .txt, .md, or .csv file · up to 2 MB</TooltipContent>
              </Tooltip>
              <span className="composer-action-divider" aria-hidden="true" />
              <Button
                type="submit"
                className="send-button"
                disabled={!canSend}
                aria-label="Send message"
              >
                {loading ? (
                  <LoaderCircle className="animate-spin" size={17} />
                ) : (
                  <ArrowUp size={18} />
                )}
                <span>{loading ? 'Working' : 'Send'}</span>
              </Button>
            </div>
          </div>
        </form>
      </Card>
      <div className="composer-help" id="composer-help">
        <span>AI can make mistakes. Check important answers.</span>
        <span className="composer-keyboard-hint">
          <kbd>↵</kbd> Send <span aria-hidden="true">·</span> <kbd>Shift ↵</kbd> New line
        </span>
        {draft.length >= 8000 && (
          <span className="draft-count" aria-live="polite">
            {draft.length.toLocaleString('en-US')} / 10 000
          </span>
        )}
      </div>
    </div>
  );
}
