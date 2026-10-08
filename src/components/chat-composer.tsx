'use client';

import { DOCUMENT_ACCEPT, DOCUMENT_HINT } from '@/lib/extract-document';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowUp, FileText, LoaderCircle, Paperclip, Plus, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DrivePicker, GoogleDriveMark } from './drive-picker';
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
  availableModels: string[] | null;
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
  availableModels,
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
  const [driveOpen, setDriveOpen] = useState(false);
  // Drive uses the Google sign-in credentials; without them the connector is hidden.
  const [driveEnabled, setDriveEnabled] = useState(false);
  useEffect(() => {
    fetch('/api/auth-config', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => setDriveEnabled(data.googleEnabled === true))
      .catch(() => setDriveEnabled(false));
  }, []);
  const selectedModel = MODELS.find((item) => item.id === model) ?? MODELS[0];
  // Like Claude/ChatGPT: a file dragged anywhere over the window can be dropped.
  // Refs keep one set of listeners for the whole drag (the parent recreates onFile each render).
  const blockedRef = useRef(false);
  const onFileRef = useRef(onFile);
  blockedRef.current = loading || fileLoading;
  onFileRef.current = onFile;
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      if (!blockedRef.current) setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = blockedRef.current ? 'none' : 'copy';
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const dropped = e.dataTransfer?.files[0];
      if (!blockedRef.current && dropped) void onFileRef.current(dropped);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
  }, [draft, inputRef]);
  function modelOption(item: AssistantModel) {
    const available = availableModels === null || availableModels.includes(item.id);
    return (
      <SelectItem
        key={item.id}
        value={item.id}
        textValue={item.label}
        className="model-option"
        disabled={!available}
      >
        <span className={`model-option-icon ${item.icon}`}>
          <Icon name={item.icon} />
        </span>
        <span className="model-option-copy">
          <span className="model-option-heading">
            <strong>{item.label}</strong>
            <Badge variant="secondary">{available ? item.badge : 'Not in your plan'}</Badge>
          </span>
          <span className="model-option-description">{item.description}</span>
        </span>
      </SelectItem>
    );
  }
  return (
    <div className="composer-block">
      {dragging && (
        <div className="window-drop-overlay" aria-hidden="true">
          <div className="window-drop-card">
            <FileText />
            <strong>Drop your file to add it to the chat</strong>
            <span>{DOCUMENT_HINT}</span>
          </div>
        </div>
      )}
      <Card className={`chat-composer ${dragging ? 'is-dragging' : ''}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSend();
          }}
        >
          {file && (
            <div className="attachment-pill">
              <span className="attachment-icon">
                <FileText size={19} />
              </span>
              <span className="attachment-copy">
                <strong>{file.name}</strong>
                <span>
                  Document · {file.text.length.toLocaleString('en-US')} characters
                  {file.truncated && ' · truncated to fit'}
                </span>
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
          <div className="composer-attach">
            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept={DOCUMENT_ACCEPT}
              aria-label="Choose a document or image"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                e.target.value = '';
                if (selected) void onFile(selected);
              }}
              tabIndex={-1}
            />
            {/* Like ChatGPT: one "+" opens a menu of sources (local files, connectors). */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="attach-button"
                  type="button"
                  disabled={fileLoading || loading}
                  aria-label={fileLoading ? 'Reading file' : 'Add files and more'}
                >
                  {fileLoading ? (
                    <LoaderCircle className="animate-spin" size={18} />
                  ) : (
                    <Plus size={21} />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="add-menu">
                <DropdownMenuLabel>Add</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                  <span className="add-menu-icon">
                    <Paperclip />
                  </span>
                  <span className="add-menu-copy">
                    <span className="add-menu-name">Files or images</span>
                    <span className="add-menu-hint">PDF, Word, text, images</span>
                  </span>
                </DropdownMenuItem>
                {driveEnabled && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Connectors</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => setDriveOpen(true)}>
                      <span className="add-menu-icon">
                        <GoogleDriveMark />
                      </span>
                      <span className="add-menu-copy">
                        <span className="add-menu-name">Google Drive</span>
                        <span className="add-menu-hint">Docs, Sheets, Slides, PDF</span>
                      </span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {driveEnabled && (
              <DrivePicker open={driveOpen} onOpenChange={setDriveOpen} onPick={onFile} />
            )}
          </div>
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
            rows={1}
            maxLength={10000}
            aria-describedby="composer-help"
            placeholder={
              file
                ? 'What would you like to know about this document?'
                : hasMessages
                  ? 'Keep the conversation going…'
                  : 'Message UNUVIA…'
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
                  if (
                    MODELS.some((item) => item.id === value) &&
                    (availableModels === null || availableModels.includes(value))
                  )
                    onModelChange(value);
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
                  <p className="model-menu-note">
                    {availableModels === null
                      ? 'Availability depends on your connected service.'
                      : 'Only models included in this workspace’s connected plan can be selected.'}
                  </p>
                </SelectContent>
              </Select>
            </div>
            <div className="composer-actions">
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
