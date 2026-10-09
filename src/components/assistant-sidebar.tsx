'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronsUpDown,
  HardDrive,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  SquarePen,
  Search,
  Trash2,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarInput,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
} from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Chat } from '@/lib/chat-models';

type ConversationAction = { kind: 'rename' | 'delete'; chat: Chat };

export function AssistantSidebar({
  user,
  plan,
  isAdmin,
  chats,
  currentId,
  roleLabel,
  loading,
  signingOut,
  mobile = false,
  collapsed = false,
  onExpand,
  onToggleCollapse,
  onNewChat,
  onOpenChat,
  onRenameChat,
  onDeleteChat,
  onSignOut,
  onFocusComposer,
}: {
  user: { name: string; email: string; image?: string | null };
  plan: 'free' | 'pro';
  isAdmin: boolean;
  chats: Chat[];
  currentId: string | null;
  roleLabel: string;
  loading: boolean;
  signingOut: boolean;
  mobile?: boolean;
  collapsed?: boolean;
  onExpand: () => void;
  onToggleCollapse?: () => void;
  onNewChat: () => void;
  onOpenChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onDeleteChat: (id: string) => void;
  onSignOut: () => void;
  onFocusComposer: () => void;
}) {
  const [query, setQuery] = useState('');
  const [action, setAction] = useState<ConversationAction | null>(null);
  const [title, setTitle] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const actionTrigger = useRef<HTMLButtonElement | null>(null);
  const focusSearch = useRef(false);
  const focusComposerOnClose = useRef(false);
  const normalize = (value: string) =>
    value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
  const filtered = chats.filter((chat) => normalize(chat.title).includes(normalize(query.trim())));
  const initials = user.name.trim().split(/\s+/).filter(Boolean);
  const avatar = (initials[0]?.[0] ?? 'U') + (initials.length > 1 ? initials.at(-1)![0] : '');
  const titleId = mobile ? 'mobile-conversation-name' : 'conversation-name';

  useEffect(() => {
    if (!collapsed && focusSearch.current) {
      search.current?.focus();
      focusSearch.current = false;
    }
  }, [collapsed]);

  function clearSearch() {
    setQuery('');
    search.current?.focus();
  }
  function startAction(kind: ConversationAction['kind'], chat: Chat) {
    focusComposerOnClose.current = false;
    setTitle(chat.title);
    setAction({ kind, chat });
  }

  return (
    <Sidebar
      collapsible="none"
      role="complementary"
      id={mobile ? 'mobile-chat-sidebar' : 'chat-sidebar'}
      className={`chat-sidebar workspace-sidebar border-r p-3 ${mobile ? 'mobile-sidebar w-full' : collapsed ? 'desktop-sidebar hidden w-20 lg:flex' : 'desktop-sidebar hidden w-72 lg:flex'}`}
      data-collapsed={collapsed}
      aria-label="Your conversations"
    >
      <SidebarHeader className="workspace-sidebar-header p-0">
        {/* Like ChatGPT/Claude: the toggle lives in the sidebar. Collapsed, the logo becomes it. */}
        {collapsed && onToggleCollapse ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                className="workspace-rail-toggle"
                aria-label="Expand sidebar"
                aria-controls="chat-sidebar"
                aria-expanded="false"
                onClick={onToggleCollapse}
              >
                <img src="/assets/univa-icon.png" alt="" width="32" height="32" />
                <PanelLeftOpen aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand sidebar</TooltipContent>
          </Tooltip>
        ) : (
          <div className="workspace-sidebar-brand">
            <Link href="/" className="brand" aria-label="UNUVIA home">
              <img src="/assets/univa-icon.png" alt="UNUVIA logo" width="32" height="32" />
              <span>UNUVIA</span>
            </Link>
            {!mobile && onToggleCollapse && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="workspace-sidebar-toggle"
                    aria-label="Collapse sidebar"
                    aria-controls="chat-sidebar"
                    aria-expanded="true"
                    onClick={onToggleCollapse}
                  >
                    <PanelLeftClose />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Collapse sidebar</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
        {!collapsed && (
          <div className="workspace-context">
            <span className="workspace-context-dot" aria-hidden="true" />
            <span>Personal workspace</span>
            <Badge variant="outline">{plan === 'pro' ? 'Pro' : 'Free'}</Badge>
          </div>
        )}
      </SidebarHeader>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={newButton}
            variant="secondary"
            size={collapsed ? 'icon' : 'default'}
            className="workspace-new-chat"
            onClick={() => {
              setQuery('');
              onNewChat();
            }}
            disabled={loading}
            aria-label="New conversation"
          >
            <SquarePen />
            {!collapsed && <span>New conversation</span>}
          </Button>
        </TooltipTrigger>
        {collapsed && <TooltipContent side="right">New conversation</TooltipContent>}
      </Tooltip>

      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              className="workspace-rail-action size-9"
              aria-label="Search conversations"
              onClick={() => {
                focusSearch.current = true;
                onExpand();
              }}
            >
              <Search />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Search conversations</TooltipContent>
        </Tooltip>
      ) : (
        <>
          <div className="workspace-history-heading">
            <h2>Conversations</h2>
            <span aria-live="polite">
              {query.trim() ? `${filtered.length} of ${chats.length}` : chats.length}
            </span>
          </div>
          <div className="workspace-search">
            <Search aria-hidden="true" />
            <SidebarInput
              className="pl-9 pr-9"
              ref={search}
              type="search"
              aria-label="Search conversations"
              placeholder="Search conversations"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <Button variant="ghost" size="icon" onClick={clearSearch} aria-label="Clear search">
                <X />
              </Button>
            )}
          </div>
        </>
      )}

      <SidebarContent className="chat-history workspace-history mt-3">
        <nav aria-label="Conversation history">
          {!collapsed &&
            (filtered.length ? (
              <SidebarMenu>
                {filtered.map((chat) => (
                  <SidebarMenuItem
                    key={chat.id}
                    className={`history-item ${chat.id === currentId ? 'active' : ''}`}
                  >
                    <SidebarMenuButton
                      size="lg"
                      isActive={chat.id === currentId}
                      onClick={() => onOpenChat(chat.id)}
                      aria-current={chat.id === currentId ? 'true' : undefined}
                      aria-label={`Open conversation ${chat.title}`}
                    >
                      <MessageSquare />
                      <span className="workspace-history-copy">
                        <strong title={chat.title}>{chat.title}</strong>
                        <small>
                          {chat.messages.length}{' '}
                          {chat.messages.length === 1 ? 'message' : 'messages'}
                        </small>
                      </span>
                    </SidebarMenuButton>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction
                          className="workspace-conversation-menu"
                          aria-label={`Conversation options for ${chat.title}`}
                          disabled={loading}
                          onPointerDown={(event) => {
                            actionTrigger.current = event.currentTarget;
                          }}
                          onKeyDown={(event) => {
                            actionTrigger.current = event.currentTarget;
                          }}
                        >
                          <MoreHorizontal />
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        sideOffset={6}
                        collisionPadding={12}
                        className="workspace-action-menu"
                        onCloseAutoFocus={(event) => {
                          if (action) event.preventDefault();
                        }}
                      >
                        <DropdownMenuItem onSelect={() => startAction('rename', chat)}>
                          <Pencil /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => startAction('delete', chat)}
                        >
                          <Trash2 /> Delete conversation
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            ) : (
              <Empty className="workspace-history-empty px-2 py-8 md:p-4">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    {query.trim() ? <Search /> : <MessageSquare />}
                  </EmptyMedia>
                  <EmptyTitle className="text-sm">
                    {query.trim() ? 'No matching conversations' : 'No conversations yet'}
                  </EmptyTitle>
                  <EmptyDescription>
                    {query.trim()
                      ? 'Try a different name or clear your search.'
                      : 'Start a chat. You can come back to it here.'}
                  </EmptyDescription>
                </EmptyHeader>
                {query.trim() && (
                  <Button variant="ghost" onClick={clearSearch}>
                    Clear search
                  </Button>
                )}
              </Empty>
            ))}
        </nav>
      </SidebarContent>

      <SidebarFooter className="chat-sidebar-bottom workspace-sidebar-footer p-0">
        {!collapsed && (
          <Button variant="ghost" asChild className="workspace-home-link justify-start text-xs">
            <Link href="/">
              <ArrowLeft /> Back to website
            </Link>
          </Button>
        )}
        {!collapsed && (
          <p className="workspace-storage-note">
            <HardDrive /> Saved on this device
          </p>
        )}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="chat-profile h-auto min-h-12 w-full justify-start whitespace-normal px-2 py-2 text-left"
              aria-label="Account menu"
            >
              <Avatar className="profile-avatar size-8">
                <AvatarImage src={user.image || undefined} alt="" />
                <AvatarFallback>{avatar.toUpperCase()}</AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <span className="workspace-profile-copy">
                    <strong>{user.name}</strong>
                    <small>
                      {roleLabel} · {plan === 'pro' ? 'Pro' : 'Free'} workspace
                    </small>
                  </span>
                  <ChevronsUpDown />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={8}
            collisionPadding={12}
            className="workspace-account-menu workspace-action-menu min-w-60"
          >
            <DropdownMenuLabel>
              <strong>{user.name}</strong>
              <span>{user.email}</span>
              <small>{plan === 'pro' ? 'Pro' : 'Free'} workspace</small>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/account">Profile and settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/account?tab=subscription">
                {plan === 'pro' ? 'Manage subscription' : 'Upgrade to Pro'}
              </Link>
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem asChild>
                <Link href="/admin/subscriptions">Subscription administration</Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link href="/">
                <ArrowLeft /> Back to website
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={loading || signingOut} onSelect={onSignOut}>
              <LogOut /> {signingOut ? 'Logging out…' : 'Log out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>

      <Dialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
      >
        <DialogContent
          className="workspace-conversation-dialog max-h-[calc(100dvh-2rem)] overflow-y-auto"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (action?.kind === 'rename') {
              renameInput.current?.focus();
              renameInput.current?.select();
            } else cancel.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (focusComposerOnClose.current) {
              focusComposerOnClose.current = false;
              onFocusComposer();
            } else if (actionTrigger.current?.isConnected) actionTrigger.current.focus();
            else newButton.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {action?.kind === 'rename' ? 'Rename conversation' : 'Delete conversation?'}
            </DialogTitle>
            <DialogDescription>
              {action?.kind === 'rename'
                ? 'Choose a name that’s easy to find later.'
                : `“${action?.chat.title ?? ''}” will be removed from this device. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          {action?.kind === 'rename' ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!title.trim() || loading) return;
                onRenameChat(action.chat.id, title.trim());
                setAction(null);
              }}
            >
              <Label htmlFor={titleId}>Conversation name</Label>
              <Input
                ref={renameInput}
                id={titleId}
                value={title}
                maxLength={100}
                onChange={(event) => setTitle(event.target.value)}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAction(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!title.trim() || loading}>
                  Save name
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <DialogFooter>
              <Button ref={cancel} variant="outline" onClick={() => setAction(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={loading}
                onClick={() => {
                  if (action) {
                    focusComposerOnClose.current = action.chat.id === currentId;
                    onDeleteChat(action.chat.id);
                  }
                  setAction(null);
                }}
              >
                Delete conversation
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
