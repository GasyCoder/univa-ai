'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { ThemeToggle } from './theme-provider';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
import { completeAssistant } from '@/lib/assistant';
import { loadChats, saveChats } from '@/lib/chat-storage';
import {
  type Attachment,
  type Chat,
  DEFAULT_MODEL,
  ROLES,
  type UniversityRole,
} from '@/lib/chat-models';
import { Icon } from './icon';

const assistants = [
  {
    icon: 'school',
    title: 'Understand a concept',
    description: 'Clear explanations, at your pace.',
    role: 'Student',
    prompt: 'Explain this concept simply, then ask three questions to check my understanding: ',
    color: 'sage',
  },
  {
    icon: 'book',
    title: 'Plan a lesson',
    description: 'Turn teaching ideas into a clear plan.',
    role: 'Faculty',
    prompt: 'Help me create a lesson plan with learning objectives about ',
    color: 'lavender',
  },
  {
    icon: 'flask',
    title: 'Explore a topic',
    description: 'Give your research a useful starting point.',
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

export function Assistant({ user }: { user: { id: string; name: string; email: string } }) {
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
  const [modelOpen, setModelOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<Attachment | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [error, setError] = useState('');
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [copyError, setCopyError] = useState('');
  const scroll = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = chats.find((c) => c.id === currentId);
  const messages = current?.messages ?? [];
  const roleLabel = ROLES.find((r) => r.id === role)!.label;
  const canSend = ready && !loading && !fileLoading && (!!draft.trim() || !!file);
  const canRetry = failed?.id === currentId && !!failed && !loading;

  useEffect(() => {
    const saved = loadChats(user.id);
    const params = new URLSearchParams(window.location.search);
    const index = params.get('role');
    setChats(saved.chats);
    setRole(index !== null && /^[0-3]$/.test(index) ? ROLES[Number(index)].id : saved.role);
    setModel(saved.model);
    setDraft((params.get('prompt') ?? '').slice(0, 10000));
    setReady(true);
    const resize = () => {
      if (window.innerWidth >= 768) setSideOpen(false);
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
  useEffect(() => {
    if (scroll.current) {
      scroll.current.scrollTop = messages.length ? scroll.current.scrollHeight : 0;
    }
  }, [messages.length, loading, currentId]);

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
    currentRef.current = id;
    setCurrentId(id);
  }
  function newChat() {
    chooseChat(null);
    setDraft('');
    setFile(null);
    setError('');
    setSideOpen(false);
    focus();
  }
  function openChat(id: string) {
    chooseChat(id);
    setError(failed?.id === id ? failed.message : '');
    setSideOpen(false);
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
    if (!/\.(txt|md|csv)$/i.test(selected.name)) {
      setError('Choose a text file in .txt, .md, or .csv format.');
      return;
    }
    if (selected.size > 2_000_000) {
      setError('This file exceeds 2 MB. Choose a smaller file.');
      return;
    }
    setFileLoading(true);
    try {
      const text = await selected.text();
      if (!text.trim()) throw new Error('This file is empty.');
      if (text.includes('\u0000'))
        throw new Error('This file contains binary data. Choose a text file.');
      if (text.length > 60000)
        throw new Error('This document exceeds 60,000 characters. Choose a shorter excerpt.');
      setFile({ name: selected.name, text });
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
      setChats((chats) =>
        chats.map((c) =>
          c.id === chat.id ? { ...c, messages: [...c.messages, { role: 'assistant', content }] } : c
        )
      );
    } catch (e) {
      const message = /429|rate/i.test(String(e))
        ? 'Too many requests. Please wait a moment and try again.'
        : /model.*(not found|not available|not supported|does not exist)|invalid.*model|permission|403|404/i.test(
              String(e)
            )
          ? 'This model is unavailable for your account. Choose another model and try again.'
          : 'The assistant could not respond. Check your connection and try again.';
      setFailed({ id: chat.id, message });
      if (currentRef.current === chat.id) setError(message);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canSend || busy.current) return;
    if (typeof window.claude?.complete !== 'function') {
      setError(
        'The assistant service is currently unavailable. Your question and attachment are saved in this composer. Please try again later.'
      );
      return;
    }
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
    await complete(updated);
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

  function composer() {
    return (
      <>
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
      <aside
        id={mobile ? 'mobile-chat-sidebar' : 'chat-sidebar'}
        className={mobile ? 'chat-sidebar mobile-sidebar' : 'chat-sidebar desktop-sidebar'}
        aria-label="Your conversations"
      >
        <Link href="/" className="brand" aria-label="UNUVIA home">
          <img src="/assets/univa-icon.png" alt="UNUVIA logo" width="34" height="34" />
          <span>UNUVIA</span>
        </Link>
        <Link href="/" className="back-to-site">
          <Icon name="chevron" className="rotate-180" /> Back to website
        </Link>
        <Button className="btn new-chat" onClick={newChat}>
          <Icon name="plus" /> New conversation
        </Button>
        <span className="sidebar-label">YOUR CONVERSATIONS</span>
        <div className="chat-history">
          {chats.length ? (
            chats.map((chat) => (
              <div
                key={chat.id}
                className={`history-item ${chat.id === currentId ? 'active' : ''}`}
              >
                <Button
                  variant="ghost"
                  onClick={() => openChat(chat.id)}
                  aria-current={chat.id === currentId ? 'true' : undefined}
                >
                  <Icon name="chat" />
                  <span>{chat.title}</span>
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="delete-chat"
                      disabled={loading}
                      aria-label={`Delete conversation ${chat.title}`}
                      onClick={() => removeChat(chat.id)}
                    >
                      <Icon name="trash" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete conversation</TooltipContent>
                </Tooltip>
              </div>
            ))
          ) : (
            <p className="history-empty">
              Your next ideas
              <br />
              start here.
            </p>
          )}
        </div>
        <div className="chat-sidebar-bottom">
          <p>
            <Icon name="lock" /> History saved on this device.
          </p>
          <div className="chat-profile">
            <span className="profile-avatar">
              <Icon name="school" />
            </span>
            <div>
              {user.name}
              <small>{roleLabel} · Free workspace</small>
            </div>
          </div>
          <Button
            variant="ghost"
            className="signout-button"
            disabled={loading}
            onClick={async () => {
              await authClient.signOut();
              router.refresh();
            }}
          >
            Log out
          </Button>
        </div>
      </aside>
    );
  }

  if (!isPending && (!session || session.user.id !== user.id)) return null;
  return (
    <>
      <a href="#chat-content" className="skip-link" inert={modelOpen}>
        Skip to assistant
      </a>
      <div className="assistant-shell" data-ready={ready} inert={modelOpen}>
        {sidebar()}
        <main id="chat-content" className="chat-main">
          <header className="chat-topbar">
            <div>
              <Sheet open={sideOpen} onOpenChange={setSideOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="icon-button menu-toggle"
                    aria-label="Open navigation"
                  >
                    <Icon name="menu" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="mobile-chat-sheet">
                  <SheetTitle className="sr-only">Your conversations</SheetTitle>
                  <SheetDescription className="sr-only">
                    Chat history and new conversation
                  </SheetDescription>
                  {sidebar(true)}
                </SheetContent>
              </Sheet>
              <strong>UNUVIA workspace</strong>
              <Badge variant="secondary" className="preview-label">
                FREE
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
            </div>
          </header>
          <div
            ref={scroll}
            className={`chat-scroll ${messages.length ? 'conversation-scroll' : 'welcome-scroll'}`}
          >
            {!messages.length ? (
              <div className="assistant-welcome">
                <div className="welcome-intro">
                  <span className="welcome-symbol">
                    <Icon name="flower" />
                  </span>
                  <span className="eyebrow">AI WORKSPACE FOR UNIVERSITIES</span>
                  <h1>What’s on your mind?</h1>
                  <p>
                    A question, a lesson, a new idea.
                    <br />
                    Explore learning, teaching, research, and university work.
                  </p>
                </div>
                {composer()}
                <div className="suggestions-heading">
                  <span>A few ways to get started</span>
                  <span>Make it yours</span>
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
                <div className="welcome-note">
                  <Icon name="shield" /> Your documents, your context. Always verify important
                  answers.
                </div>
              </div>
            ) : (
              <div
                className="messages"
                aria-live="polite"
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
                        <Icon name="sparkles" />
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
                        <>
                          <div className="markdown-content">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.content}
                            </ReactMarkdown>
                          </div>
                          <Button
                            variant="ghost"
                            className="message-copy"
                            onClick={() => copy(message.content, i)}
                          >
                            <Icon name={copied === i ? 'check' : 'copy'} />
                            {copied === i ? 'Copied' : 'Copy response'}
                          </Button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
                {loading && (
                  <div className="message">
                    <span className="ai-mark">
                      <Icon name="sparkles" />
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
              <div className="chat-composer-inner">{composer()}</div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
