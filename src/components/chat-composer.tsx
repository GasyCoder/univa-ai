'use client';

import { DOCUMENT_ACCEPT, DOCUMENT_HINT } from '@/lib/extract-document';
import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  ArrowUp,
  Check,
  ChevronDown,
  FileText,
  LoaderCircle,
  Mic,
  Paperclip,
  Plus,
  Square,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DrivePicker, GoogleDriveMark } from './drive-picker';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  MODELS,
  REASONING_LEVELS,
  reasoningLevelsFor,
  type Attachment,
  type AssistantModel,
  type ReasoningLevel,
} from '@/lib/chat-models';

// The Web Speech API is not in TypeScript's DOM types; only what is used here is declared.
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
const recognitionClass = () =>
  typeof window === 'undefined'
    ? undefined
    : (((window as unknown as Record<string, unknown>).SpeechRecognition ??
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as
        (new () => Recognition) | undefined);

interface ComposerProps {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  draft: string;
  onDraftChange: (value: string) => void;
  model: string;
  availableModels: string[] | null;
  onModelChange: (value: string) => void;
  onModelOpenChange: (open: boolean) => void;
  reasoning: ReasoningLevel | null;
  onReasoningChange: (value: ReasoningLevel | null) => void;
  onStop: () => void;
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
  reasoning,
  onReasoningChange,
  onStop,
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
  const supportedReasoning = reasoningLevelsFor(model);
  // Dictation with the browser's own speech recognition, where it exists.
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    setVoiceSupported(!!recognitionClass());
    return () => recognition.current?.stop();
  }, []);
  function toggleVoice() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Speech = recognitionClass();
    if (!Speech) return;
    const session = new Speech();
    session.lang = navigator.language;
    session.continuous = true;
    session.interimResults = false;
    session.onresult = (event) => {
      let heard = '';
      for (let i = event.resultIndex; i < event.results.length; i++)
        if (event.results[i].isFinal) heard += event.results[i][0].transcript;
      if (heard.trim())
        onDraftChange(
          `${draftRef.current}${draftRef.current && !/\s$/.test(draftRef.current) ? ' ' : ''}${heard.trim()}`.slice(
            0,
            10000
          )
        );
    };
    session.onend = session.onerror = () => {
      setListening(false);
      recognition.current = null;
    };
    recognition.current = session;
    setListening(true);
    try {
      session.start();
    } catch {
      setListening(false);
    }
  }
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
      <DropdownMenuRadioItem
        key={item.id}
        value={item.id}
        textValue={item.label}
        className="model-option"
        disabled={!available}
      >
        <span className="model-option-copy flex min-w-0 flex-1 flex-col gap-1">
          <span className="model-option-heading flex flex-wrap items-center gap-2">
            <strong>{item.label}</strong>
            <Badge variant="secondary">{available ? item.badge : 'Not in your plan'}</Badge>
          </span>
          <span className="model-option-description text-xs text-muted-foreground">
            {item.description}
          </span>
        </span>
        {item.id === model && (
          <Check className="model-option-check size-4 shrink-0" aria-hidden="true" />
        )}
      </DropdownMenuRadioItem>
    );
  }
  function pickModel(value: string) {
    if (
      MODELS.some((item) => item.id === value) &&
      (availableModels === null || availableModels.includes(value))
    )
      onModelChange(value);
  }
  const reasoningLabel = REASONING_LEVELS.find((level) => level.id === reasoning)?.label;
  const reasoningOffered = Object.keys(supportedReasoning).length > 0;
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
      <Card className={`chat-composer gap-0 p-2 ${dragging ? 'is-dragging' : ''}`}>
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
            <Input
              ref={fileInputRef}
              className="hidden"
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
                  className="attach-button size-11"
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
              <DropdownMenuContent align="start" side="top" className="add-menu w-64">
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
            className="prompt-input min-h-11 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
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
                AI model and reasoning effort
              </Label>
              {/* One menu for the model and its effort, as in Claude: two pickers side by side crowded the bar. */}
              <DropdownMenu onOpenChange={onModelOpenChange}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    type="button"
                    id="chat-model"
                    className="model-control h-11 max-w-full gap-1 px-2 text-xs"
                    disabled={loading}
                  >
                    <span className="model-control-label">{selectedModel.label}</span>
                    {reasoningLabel && (
                      <span className="model-control-effort">{reasoningLabel}</span>
                    )}
                    <ChevronDown aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="bottom"
                  align="end"
                  className="model-menu w-72 max-w-[calc(100vw-2rem)] max-h-[min(70dvh,32rem)] overflow-y-auto"
                  tabIndex={0}
                  aria-label="Choose an AI model"
                >
                  <DropdownMenuRadioGroup value={model} onValueChange={pickModel}>
                    {MODELS.map(modelOption)}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="model-menu-row" disabled={!reasoningOffered}>
                      <span>Effort</span>
                      <span className="model-menu-row-value">
                        {reasoningOffered ? (reasoningLabel ?? 'Default') : 'Not available'}
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="model-menu model-submenu w-72 max-w-[calc(100vw-2rem)] max-h-[min(70dvh,32rem)] overflow-y-auto w-60">
                      <DropdownMenuRadioGroup
                        value={reasoning ?? 'default'}
                        onValueChange={(value) =>
                          onReasoningChange(
                            value in supportedReasoning ? (value as ReasoningLevel) : null
                          )
                        }
                      >
                        {[
                          {
                            id: 'default',
                            label: 'Default',
                            description: 'The model decides how long to think.',
                          },
                          ...REASONING_LEVELS.filter((level) => level.id in supportedReasoning),
                        ].map((level) => (
                          <DropdownMenuRadioItem
                            key={level.id}
                            value={level.id}
                            textValue={level.label}
                            className="model-option"
                          >
                            <span className="model-option-copy flex min-w-0 flex-1 flex-col gap-1">
                              <strong>{level.label}</strong>
                              <span className="model-option-description text-xs text-muted-foreground">
                                {level.description}
                              </span>
                            </span>
                            {level.id === (reasoning ?? 'default') && (
                              <Check
                                className="model-option-check size-4 shrink-0"
                                aria-hidden="true"
                              />
                            )}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <p className="model-menu-note">
                    {availableModels === null
                      ? 'Availability depends on the Claude API.'
                      : 'Only models included in your plan can be selected.'}
                  </p>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="composer-actions">
              {voiceSupported && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="voice-button size-11 aria-pressed:bg-destructive aria-pressed:text-white"
                  aria-label={listening ? 'Stop dictation' : 'Dictate your message'}
                  title={listening ? 'Stop dictation' : 'Dictate'}
                  aria-pressed={listening}
                  disabled={loading}
                  onClick={toggleVoice}
                >
                  {listening ? (
                    <span className="voice-wave" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    <Mic size={18} />
                  )}
                </Button>
              )}
              {loading ? (
                <Button
                  type="button"
                  size="icon"
                  className="send-button stop-button size-11"
                  aria-label="Stop response"
                  onClick={onStop}
                >
                  <Square size={14} fill="currentColor" />
                  <span>Stop</span>
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  className="send-button size-11"
                  disabled={!canSend}
                  aria-label="Send message"
                >
                  <ArrowUp size={18} />
                  <span>Send</span>
                </Button>
              )}
            </div>
          </div>
        </form>
      </Card>
      <div className="composer-help" id="composer-help">
        <span>AI can make mistakes. Check important answers.</span>
        <span className="composer-keyboard-hint">
          <Kbd>↵</Kbd> Send <span aria-hidden="true">·</span> <Kbd>Shift ↵</Kbd> New line
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
