'use client';

import { extractDocumentText, MAX_FILE_BYTES } from '@/lib/extract-document';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { ThemeToggle } from './theme-provider';
import { MobileNavigation } from './mobile-navigation';
import { AssistantSidebar } from './assistant-sidebar';
import { ArrowDown, Download, MoreHorizontal } from 'lucide-react';
import { AssistantResponse } from './assistant-response';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ChatComposer } from './chat-composer';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { completeAssistant } from '@/lib/assistant';
import { AssistantError } from '@/lib/assistant-errors';
import { loadChats, saveChats } from '@/lib/chat-storage';
import {
  type Attachment,
  type Chat,
  DEFAULT_MODEL,
  MODELS,
  ROLES,
  type UniversityRole,
} from '@/lib/chat-models';
import { Icon } from './icon';

const assistants = [
  {
    icon: 'school',
    title: 'Understand a concept',
    description: 'Get an explanation and practice questions.',
    role: 'Student',
    prompt: 'Explain this concept simply, then ask three questions to check my understanding: ',
    color: 'sage',
  },
  {
    icon: 'book',
    title: 'Plan a lesson',
    description: 'Draft objectives, activities and exercises.',
    role: 'Faculty',
    prompt: 'Help me create a lesson plan with learning objectives about ',
    color: 'lavender',
  },
  {
    icon: 'flask',
    title: 'Explore a topic',
    description: 'Outline a research question or literature review.',
    role: 'Researcher',
    prompt: 'Help me structure a literature review about ',
    color: 'peach',
  },
  {
    icon: 'briefcase',
    title: 'Draft a document',
    description: 'Notes, summaries, and reports.',
    role: 'Staff',
    prompt: 'Help me draft a structured brief about ',
    color: 'sage',
  },
] as const;

export function Assistant({
  user,
  availableModels,
}: {
  user: { id: string; name: string; email: string };
  availableModels: string[] | null;
}) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  useEffect(() => {
    if (!isPending && (!session || session.user.id !== user.id)) router.refresh();
  }, [session, isPending, router, user.id]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const currentRef = useRef<string | null>(null);
  const [role, setRole] = useState<UniversityRole>('Faculty');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [modelNotice, setModelNotice] = useState('');
  const [modelOpen, setModelOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<Attachment | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [typingResponse, setTypingResponse] = useState<{ chatId: string; index: number } | null>(
    null
  );
  const busy = useRef(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const focusAfterSidebarClose = useRef(false);
  const [error, setError] = useState('');
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [copyError, setCopyError] = useState('');
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const followResponse = useRef(true);
  const lastFollowPosition = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = chats.find((c) => c.id === currentId);
  const messages = current?.messages ?? [];
  const roleLabel = ROLES.find((r) => r.id === role)!.label;
  const modelAvailable =
    availableModels === null ||
    availableModels.includes(model) ||
    (typeof window !== 'undefined' && typeof window.claude?.complete === 'function');
  const canSend = ready && modelAvailable && !loading && !fileLoading && (!!draft.trim() || !!file);
  const canRetry = failed?.id === currentId && !!failed && !loading;

  useEffect(() => {
    const saved = loadChats(user.id);
    const params = new URLSearchParams(window.location.search);
    const index = params.get('role');
    setChats(saved.chats);
    setRole(index !== null && /^[0-3]$/.test(index) ? ROLES[Number(index)].id : saved.role);
    const supported = typeof window.claude?.complete === 'function' ? null : availableModels;
    if (supported && !supported.includes(saved.model)) {
      const replacement = MODELS.find((item) => supported.includes(item.id));
      if (replacement) {
        setModel(replacement.id);
        setModelNotice(
          `${replacement.label} is selected from the models included in your connected plan.`
        );
      } else {
        setModel(saved.model);
        setModelNotice(
          'No supported models are available for this workspace. Please contact the workspace owner.'
        );
      }
    } else setModel(saved.model);
    setDraft((params.get('prompt') ?? '').slice(0, 10000));
    setReady(true);
    const resize = () => {
      if (window.innerWidth >= 1024) setSideOpen(false);
    };
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);
  useEffect(() => {
    if (ready) setStorageError(!saveChats(chats, role, model, user.id));
  }, [chats, role, model, ready, user.id]);
  const followLatest = useCallback(() => {
    const el = scroll.current;
    if (!el) return;
    // Detect an upward scroll before the browser dispatches its scroll event.
    if (el.scrollTop < lastFollowPosition.current - 1) followResponse.current = false;
    if (followResponse.current) {
      el.scrollTop = el.scrollHeight;
      lastFollowPosition.current = el.scrollTop;
    }
  }, []);
  const finishTyping = useCallback(() => setTypingResponse(null), []);
  useEffect(() => {
    if (!messages.length && scroll.current) {
      scroll.current.scrollTop = 0;
      lastFollowPosition.current = 0;
      followResponse.current = true;
    } else followLatest();
  }, [messages.length, loading, currentId, followLatest]);

  const focus = useCallback(
    () =>
      requestAnimationFrame(() => {
        const el = input.current;
        el?.focus();
        el?.setSelectionRange(el.value.length, el.value.length);
      }),
    []
  );
  function chooseChat(id: string | null) {
    setTypingResponse(null);
    setAwayFromLatest(false);
    followResponse.current = true;
    lastFollowPosition.current = 0;
    currentRef.current = id;
    setCurrentId(id);
  }
  function newChat() {
    focusAfterSidebarClose.current = sideOpen;
    chooseChat(null);
    setDraft('');
    setFile(null);
    setError('');
    setSideOpen(false);
    focus();
  }
  function openChat(id: string) {
    focusAfterSidebarClose.current = sideOpen;
    chooseChat(id);
    setError(failed?.id === id ? failed.message : '');
    setSideOpen(false);
    focus();
  }
  function renameChat(id: string, title: string) {
    if (busy.current || !title.trim()) return;
    setChats((chats) =>
      chats.map((chat) => (chat.id === id ? { ...chat, title: title.trim() } : chat))
    );
  }
  async function signOut() {
    if (signingOut || busy.current) return;
    setSigningOut(true);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error('Sign-out failed');
      router.refresh();
    } catch {
      setCopyError('Unable to log out. Please check your connection and try again.');
    } finally {
      setSigningOut(false);
    }
  }
  function removeChat(id: string) {
    if (busy.current) return;
    setChats((chats) => chats.filter((c) => c.id !== id));
    if (currentId === id) newChat();
    if (failed?.id === id) setFailed(null);
  }
  async function readFile(selected: File) {
    if (busy.current || fileLoading) return;
    setError('');
    if (!/\.(txt|md|csv|pdf|docx|jpe?g|png)$/i.test(selected.name)) {
      setError('Choose a .txt, .md, .csv, .pdf, .docx, .jpg, or .png file.');
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      setError('This file exceeds 10 MB. Choose a smaller file.');
      return;
    }
    setFileLoading(true);
    try {
      const { text, truncated } = await extractDocumentText(selected);
      setFile({ name: selected.name, text, truncated });
      focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to read the document.');
    } finally {
      setFileLoading(false);
    }
  }
  async function complete(chat: Chat) {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError('');
    setFailed(null);
    try {
      const content = await completeAssistant(chat.messages, role, model);
      if (currentRef.current === chat.id)
        setTypingResponse({ chatId: chat.id, index: chat.messages.length });
      setChats((chats) =>
        chats.map((c) =>
          c.id === chat.id ? { ...c, messages: [...c.messages, { role: 'assistant', content }] } : c
        )
      );
      return true;
    } catch (e) {
      const message =
        e instanceof AssistantError
          ? e.message
          : /429|rate/i.test(String(e))
            ? 'Too many requests. Please wait a moment and try again.'
            : /model.*(not found|not available|not supported|does not exist)|invalid.*model|permission|403|404/i.test(
                  String(e)
                )
              ? 'This model is unavailable for your account. Choose another model and try again.'
              : 'The assistant could not respond. Check your connection and try again.';
      setFailed({ id: chat.id, message });
      if (currentRef.current === chat.id) setError(message);
      return e instanceof AssistantError && e.code === 'not_configured' ? 'not_configured' : false;
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canSend || busy.current) return;
    const previousDraft = draft;
    const previousFile = file;
    const display = draft.trim() || 'Summarize this document and identify the main ideas.';
    const content = file
      ? `Attached document: ${file.name}\n<document>\n${file.text}\n</document>\n\n${display}`
      : display;
    const chat = current ?? { id: crypto.randomUUID(), title: display.slice(0, 60), messages: [] };
    const updated: Chat = {
      ...chat,
      messages: [...chat.messages, { role: 'user', content, display, fileName: file?.name }],
    };
    setChats((chats) => [updated, ...chats.filter((c) => c.id !== updated.id)].slice(0, 30));
    chooseChat(updated.id);
    setDraft('');
    setFile(null);
    const result = await complete(updated);
    if (result === 'not_configured') {
      setChats(chats);
      chooseChat(current?.id ?? null);
      setDraft(previousDraft);
      setFile(previousFile);
      setFailed(null);
    }
  }
  async function copy(text: string, index: number) {
    setCopyError('');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopyError('Copy is unavailable. You can select the response text instead.');
    }
  }

  function downloadConversation() {
    if (!current) return;
    const transcript =
      `# ${current.title}\n\n` +
      current.messages
        .map(
          (message) =>
            `## ${message.role === 'user' ? 'You' : 'UNUVIA'}\n\n` +
            (message.fileName ? `Attachment: ${message.fileName}\n\n` : '') +
            (message.display || message.content)
        )
        .join('\n\n');
    const url = URL.createObjectURL(
      new Blob([transcript], { type: 'text/markdown;charset=utf-8' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `UNUVIA-${
      current.title
        .replace(/[^\p{L}\p{N} -]/gu, '')
        .slice(0, 60)
        .trim() || 'conversation'
    }.md`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function composer() {
    return (
      <>
        {modelNotice && (
          <p className="storage-notice" role="status">
            {modelNotice}
          </p>
        )}
        {storageError && (
          <p className="storage-notice" role="status">
            Local saving is unavailable. Your conversations remain available during this session.
          </p>
        )}
        {copyError && (
          <p className="copy-notice" role="status">
            {copyError}
          </p>
        )}
        <ChatComposer
          inputRef={input}
          fileInputRef={fileInput}
          draft={draft}
          onDraftChange={setDraft}
          model={model}
          availableModels={
            typeof window !== 'undefined' && typeof window.claude?.complete === 'function'
              ? null
              : availableModels
          }
          onModelChange={setModel}
          onModelOpenChange={setModelOpen}
          file={file}
          onRemoveFile={() => setFile(null)}
          onFile={readFile}
          fileLoading={fileLoading}
          loading={loading}
          canSend={canSend}
          hasMessages={!!messages.length}
          onSend={send}
        />
        {error && (
          <Alert variant="destructive" className="chat-error">
            <AlertDescription>{error}</AlertDescription>
            {canRetry ? (
              <Button variant="ghost" onClick={() => current && complete(current)}>
                Try again <Icon name="right" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setError('')}
                aria-label="Dismiss message"
              >
                <Icon name="close" />
              </Button>
            )}
          </Alert>
        )}
      </>
    );
  }

  function sidebar(mobile = false) {
    return (
      <AssistantSidebar
        user={user}
        chats={chats}
        currentId={currentId}
        roleLabel={roleLabel}
        loading={loading}
        signingOut={signingOut}
        mobile={mobile}
        collapsed={!mobile && sidebarCollapsed}
        onExpand={() => setSidebarCollapsed(false)}
        onToggleCollapse={() => setSidebarCollapsed((collapsed) => !collapsed)}
        onNewChat={newChat}
        onOpenChat={openChat}
        onRenameChat={renameChat}
        onDeleteChat={removeChat}
        onSignOut={signOut}
        onFocusComposer={focus}
      />
    );
  }

  if (!isPending && (!session || session.user.id !== user.id)) return null;
  return (
    <>
      <a href="#chat-content" className="skip-link" inert={modelOpen}>
        Skip to assistant
      </a>
      <div
        className="assistant-shell conversation-workspace"
        data-ready={ready}
        data-sidebar-collapsed={sidebarCollapsed}
        inert={modelOpen}
      >
        {sidebar()}
        <main id="chat-content" className="chat-main">
          <header className="chat-topbar">
            <div>
              <Sheet open={sideOpen} onOpenChange={setSideOpen}>
                <MobileNavigation label="Mobile workspace navigation">
                  <SheetTrigger asChild>
                    <Button
                      variant="ghost"
                      className="mobile-nav-item"
                      aria-label="Open navigation"
                    >
                      <Icon name="chat" />
                      <span>Chats</span>
                    </Button>
                  </SheetTrigger>
                  <Button
                    variant="ghost"
                    className="mobile-nav-item mobile-nav-primary"
                    onClick={newChat}
                    disabled={loading}
                    aria-label="New conversation"
                  >
                    <Icon name="plus" />
                    <span>New chat</span>
                  </Button>
                  <Button variant="ghost" asChild className="mobile-nav-item">
                    <Link href="/">
                      <Icon name="home" />
                      <span>Home</span>
                    </Link>
                  </Button>
                  <ThemeToggle label="Theme" className="mobile-nav-item" />
                </MobileNavigation>
                <SheetContent
                  side="left"
                  className="mobile-chat-sheet workspace-chat-sheet"
                  onCloseAutoFocus={(event) => {
                    if (focusAfterSidebarClose.current) {
                      event.preventDefault();
                      focusAfterSidebarClose.current = false;
                      focus();
                    }
                  }}
                >
                  <SheetTitle className="sr-only">Your conversations</SheetTitle>
                  <SheetDescription className="sr-only">
                    Chat history and new conversation
                  </SheetDescription>
                  {sidebar(true)}
                </SheetContent>
              </Sheet>
              <strong className="workspace-header-title" title={current?.title}>
                {current ? (
                  current.title
                ) : (
                  <>
                    <span className="workspace-brand-short">UNUVIA</span>
                    <span className="workspace-brand-full">UNUVIA workspace</span>
                  </>
                )}
              </strong>
              <Badge variant="secondary" className="preview-label">
                Free
              </Badge>
            </div>
            <div className="role-control">
              <ThemeToggle />
              <Icon name="school" />
              <Label htmlFor="chat-role" className="sr-only">
                My workspace role
              </Label>
              <span className="role-caption" aria-hidden="true">
                My role
              </span>
              <Select
                value={role}
                onValueChange={(v) => {
                  if (ROLES.some((item) => item.id === v)) setRole(v as UniversityRole);
                }}
                disabled={loading}
              >
                <SelectTrigger id="chat-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {current && (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="workspace-topbar-menu"
                      aria-label="Conversation actions"
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="workspace-action-menu">
                    <DropdownMenuItem onSelect={downloadConversation}>
                      <Download /> Download conversation
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </header>
          <div
            ref={scroll}
            onScroll={() => {
              const el = scroll.current;
              if (el) {
                followResponse.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
                setAwayFromLatest(!followResponse.current);
                lastFollowPosition.current = el.scrollTop;
              }
            }}
            className={`chat-scroll ${messages.length ? 'conversation-scroll' : 'welcome-scroll'}`}
          >
            {!messages.length ? (
              <div className="assistant-welcome">
                <div className="welcome-intro">
                  <p className="workspace-greeting">
                    Hello, {user.name.trim().split(/\s+/)[0] || 'there'}.
                  </p>
                  <h1>What are you working on?</h1>
                  <p>A question, your notes, or an idea to work through.</p>
                </div>
                {composer()}
                <div className="suggestions-heading">
                  <span>A few starting points</span>
                  <span>Make them your own</span>
                </div>
                <div className="assistant-cards">
                  {assistants.map((assistant) => (
                    <Card className="assistant-card" key={assistant.title}>
                      <Button
                        variant="ghost"
                        className="assistant-card-action"
                        onClick={() => {
                          setRole(assistant.role);
                          setDraft(assistant.prompt);
                          focus();
                        }}
                      >
                        <span className={`feature-icon ${assistant.color}`}>
                          <Icon name={assistant.icon} />
                        </span>
                        <span className="assistant-card-copy">
                          <strong>{assistant.title}</strong>
                          <span>{assistant.description}</span>
                        </span>
                        <Icon name="arrow" />
                      </Button>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <div
                className="messages"
                aria-live={typingResponse?.chatId === currentId ? 'off' : 'polite'}
                aria-relevant="additions"
                aria-label="Conversation messages"
              >
                {messages.map((message, i) => (
                  <article
                    key={`${currentId}-${i}`}
                    className={`message ${message.role === 'user' ? 'user' : ''}`}
                    aria-label={message.role === 'user' ? 'Your message' : 'UNUVIA response'}
                  >
                    {message.role === 'assistant' && (
                      <span className="ai-mark">
                        <img src="/assets/univa-icon.png" alt="" width="22" height="22" />
                        <span>UNUVIA</span>
                      </span>
                    )}
                    <div className="message-body">
                      {message.fileName && (
                        <span className="message-file">
                          <Icon name="file" />
                          {message.fileName}
                        </span>
                      )}
                      {message.role === 'user' ? (
                        <p>{message.display || message.content}</p>
                      ) : (
                        <AssistantResponse
                          content={message.content}
                          animate={
                            typingResponse?.chatId === currentId && typingResponse.index === i
                          }
                          copied={copied === i}
                          onCopy={() => copy(message.content, i)}
                          onProgress={followLatest}
                          onRevealComplete={finishTyping}
                        />
                      )}
                    </div>
                  </article>
                ))}
                {loading && (
                  <div className="message">
                    <span className="ai-mark">
                      <img src="/assets/univa-icon.png" alt="" width="22" height="22" />
                      <span>UNUVIA</span>
                    </span>
                    <span
                      className="thinking"
                      role="status"
                      aria-label="UNUVIA is preparing a response"
                    >
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          {messages.length > 0 && (
            <div className="chat-composer-area">
              {awayFromLatest && (
                <Button
                  variant="outline"
                  size="icon"
                  className="workspace-jump-latest"
                  aria-label="Jump to latest message"
                  onClick={() => {
                    followResponse.current = true;
                    lastFollowPosition.current = 0;
                    followLatest();
                    setAwayFromLatest(false);
                  }}
                >
                  <ArrowDown />
                </Button>
              )}
              <div className="chat-composer-inner">{composer()}</div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
