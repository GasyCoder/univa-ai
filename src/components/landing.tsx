'use client';
import { SITE } from '@/lib/site';
import { useEffect, useRef, useState } from 'react';
import { proPrice, type Price, type AccountData } from '@/lib/plans';
import { accountRequest } from '@/lib/account-client';
import { useTheme } from 'next-themes';
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  Layers,
  Menu,
  MessageSquare,
  FileText,
  Lock,
  Plus,
  LogOut,
  CreditCard,
  PanelsTopLeft,
  Mail,
  LifeBuoy,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './ui/accordion';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from './ui/sheet';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { AccessDialog, type AuthMode } from './access-dialog';
import { ThemeToggle } from './theme-provider';
import { MobileNavigation } from './mobile-navigation';
import { AssistantLink, assistantUrl } from './assistant-link';
import { authClient } from '@/lib/auth-client';
import { faqs, useCases } from '@/lib/landing-data';
import { Icon } from './icon';
import { Alert, AlertDescription } from './ui/alert';

export function Landing() {
  const { setTheme } = useTheme();
  const themeChanged = useRef(false);
  const [themeError, setThemeError] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [menuOpen, setMenuOpen] = useState(false);
  const [legal, setLegal] = useState<'privacy' | 'terms' | null>(null);
  const [proIntent, setProIntent] = useState(false);
  const [price, setPrice] = useState<Price>(proPrice(''));
  const { data: session, isPending } = authClient.useSession();
  const returnFocus = useRef<HTMLElement | null>(null);
  const followedMenuLink = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/pricing', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((result) => {
        if (result) setPrice(result.price);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!session) return;
    let ignore = false;
    accountRequest<AccountData>('/api/account')
      .then((data) => {
        if (!ignore && !themeChanged.current) setTheme(data.profile.theme);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [session?.user.id, setTheme]);
  async function saveTheme(theme: 'light' | 'dark') {
    themeChanged.current = true;
    setThemeError('');
    if (!session) return;
    try {
      await accountRequest('/api/account', { theme }, 'PUT');
    } catch {
      setThemeError(
        'Your theme changed on this device, but could not be saved to your account. Please try again.'
      );
    }
  }
  function openAuth(mode: AuthMode, pro = false) {
    if (session && !pro) {
      window.open('/assistant', '_blank', 'noopener,noreferrer');
      return;
    }
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAuthMode(mode);
    setProIntent(pro);
    setAuthOpen(true);
    setMenuOpen(false);
  }
  function joinPro() {
    if (!session) {
      openAuth('signup', true);
      return;
    }
    window.location.assign('/account?tab=subscription');
  }
  const links = [
    { label: 'Product', href: '#product' },
    { label: 'Use cases', href: '#use-cases' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'FAQ', href: '#faq' },
  ];
  const navLinks = links.map((link) => (
    <Button key={link.href} variant="ghost" asChild>
      <a
        href={link.href}
        onClick={() => {
          followedMenuLink.current = menuOpen;
          setMenuOpen(false);
        }}
      >
        {link.label}
      </a>
    </Button>
  ));
  const footerLinkClass =
    'h-auto min-h-11 justify-start whitespace-normal px-0 text-left text-muted-foreground has-[>svg]:px-0';
  const accountActions = session ? (
    <>
      <Button asChild className="saas-primary">
        <AssistantLink>
          Open workspace <ArrowUpRight size={16} />
        </AssistantLink>
      </Button>
      <Button variant="ghost" size="icon" aria-label="Log out" onClick={() => authClient.signOut()}>
        <LogOut size={18} />
      </Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={() => openAuth('login')}>
        Log in
      </Button>
      <Button className="saas-primary" onClick={() => openAuth('signup')}>
        Get started <ArrowRight size={16} />
      </Button>
    </>
  );
  return (
    <div className="startup-site">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="saas-header">
        <div className="saas-container saas-nav">
          <a className="saas-brand" href="/" aria-label="UNUVIA home">
            <img src="/assets/univa-icon.png" width="30" height="30" alt="UNUVIA logo" />
            UNUVIA
          </a>
          <nav className="saas-desktop-links" aria-label="Main navigation">
            {navLinks}
          </nav>
          <div className="saas-nav-actions">
            <ThemeToggle onThemeChange={saveTheme} />
            <div className="saas-account-actions">{accountActions}</div>
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <MobileNavigation label="Mobile site navigation">
                <Button
                  variant="ghost"
                  asChild
                  className="mobile-nav-item flex h-auto min-h-12 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] text-muted-foreground"
                >
                  <a href="#product">
                    <PanelsTopLeft size={21} />
                    <span>Product</span>
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  asChild
                  className="mobile-nav-item flex h-auto min-h-12 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] text-muted-foreground"
                >
                  <a href="#pricing">
                    <CreditCard size={21} />
                    <span>Pricing</span>
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  asChild
                  className="mobile-nav-item mobile-nav-primary flex h-auto min-h-12 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] text-muted-foreground text-foreground"
                >
                  <AssistantLink>
                    <MessageSquare size={21} />
                    <span>Workspace</span>
                  </AssistantLink>
                </Button>
                <ThemeToggle
                  label="Theme"
                  className="mobile-nav-item flex h-auto min-h-12 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] text-muted-foreground"
                  onThemeChange={saveTheme}
                />
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    className="mobile-nav-item flex h-auto min-h-12 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] text-muted-foreground"
                    aria-label="Open menu"
                  >
                    <Menu size={21} />
                    <span>Menu</span>
                  </Button>
                </SheetTrigger>
              </MobileNavigation>
              <SheetContent
                className="saas-mobile-sheet gap-6 p-6 pt-14"
                onCloseAutoFocus={(event) => {
                  if (followedMenuLink.current) {
                    event.preventDefault();
                    followedMenuLink.current = false;
                  }
                }}
              >
                <SheetTitle>Explore UNUVIA</SheetTitle>
                <SheetDescription>AI Workspace for Universities</SheetDescription>
                <nav aria-label="Mobile navigation">{navLinks}</nav>
                <div>{accountActions}</div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <main id="main">
        {themeError && (
          <Alert className="saas-container">
            <AlertDescription role="alert">{themeError}</AlertDescription>
          </Alert>
        )}
        <section className="saas-hero saas-container">
          <div className="saas-hero-copy saas-hero-reveal">
            <Badge variant="outline" className="mb-6 gap-2 px-3 py-1.5 font-normal text-brand">
              <BookOpen aria-hidden="true" />
              UNUVIA for universities
            </Badge>
            <h1>
              One AI workspace <br />
              <span className="text-brand">for the entire university.</span>
            </h1>
            <p>
              Give students, faculty, researchers, and university staff secure access to AI,
              institutional knowledge, and intelligent workflows from one platform.
            </p>
            <div className="saas-hero-actions">
              <Button
                className="saas-primary group min-h-11 w-full sm:w-auto"
                onClick={() => openAuth('signup')}
              >
                Start for free{' '}
                <ArrowRight
                  size={17}
                  className="motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
                />
              </Button>
              <Button variant="outline" className="min-h-11 w-full sm:w-auto" asChild>
                <a href="#product">
                  Explore the product <ArrowUpRight size={16} />
                </a>
              </Button>
            </div>
            <div className="saas-hero-proof">
              <span>
                <Check size={14} />
                No credit card
              </span>
              <span>
                <Check size={14} />
                Any email address
              </span>
              <span>
                <Check size={14} />
                Free to get started
              </span>
            </div>
          </div>
          <Card className="saas-preview saas-hero-reveal gap-0 p-0" aria-label="Workspace preview">
            <div className="saas-preview-top">
              <span>
                <img src="/assets/univa-icon.png" alt="UNUVIA logo" width="22" height="22" />
                UNUVIA
              </span>
              <Badge variant="outline">Product preview</Badge>
            </div>
            <div className="saas-preview-body">
              <div className="saas-preview-sidebar">
                <span>
                  <Plus size={14} />
                  New chat
                </span>
                <small>YOUR WORKSPACE</small>
                <span className="active">
                  <MessageSquare size={14} />
                  Research outline
                </span>
                <span>
                  <FileText size={14} />
                  Project notes
                </span>
              </div>
              <div className="saas-preview-chat">
                <div className="saas-preview-greeting">
                  <BookOpen size={22} className="text-brand" aria-hidden="true" />
                  <h2>Your university workspace</h2>
                  <p>Questions, notes and documents, in one place.</p>
                </div>
                <div className="preview-prompt">
                  Help me turn my research notes into a clear outline.
                </div>
                <div className="preview-response">
                  <span>
                    <img src="/assets/univa-icon.png" alt="" width="16" height="16" />
                    UNUVIA
                  </span>
                  <p>Start with your main question. Then group your notes into three sections:</p>
                  <ul>
                    <li>What you already know</li>
                    <li>What you want to explore</li>
                    <li>Your next steps</li>
                  </ul>
                </div>
                <Button variant="outline" asChild className="min-h-11 w-full justify-between">
                  <AssistantLink
                    href={assistantUrl({
                      prompt: 'Help me turn my research notes into a clear outline.',
                    })}
                    className="saas-preview-composer h-auto whitespace-normal text-xs"
                  >
                    Try this in your workspace
                    <ArrowUpRight size={17} />
                  </AssistantLink>
                </Button>
              </div>
            </div>
            <div className="saas-preview-foot">
              <Lock size={12} />
              Illustrative conversation · actual answers are generated by Claude
            </div>
          </Card>
        </section>
        <div className="saas-audience-strip saas-container">
          <span>FOR THE ENTIRE UNIVERSITY</span>
          <div>
            Learning<span>·</span>Teaching<span>·</span>Research<span>·</span>Writing
          </div>
        </div>
        <section id="product" className="saas-section saas-container">
          <div className="saas-section-heading">
            <span className="saas-eyebrow">The workspace</span>
            <h2>Work with your questions and documents.</h2>
            <p>Ask a question, attach your notes and keep your conversations together.</p>
          </div>
          <div className="saas-feature-grid">
            {[
              {
                icon: MessageSquare,
                number: '01',
                title: 'Start a conversation',
                text: 'Work through a question, refine a draft, or explore a new direction. Return to your conversations on this device.',
              },
              {
                icon: FileText,
                number: '02',
                title: 'Add your documents',
                text: 'Attach a text, Markdown or CSV file and ask questions about its contents.',
              },
              {
                icon: Layers,
                number: '03',
                title: 'Choose a model',
                text: 'Select a Claude model for your task. Available models depend on your plan.',
              },
            ].map((feature) => (
              <Card className="saas-feature gap-4 px-6" key={feature.title}>
                <div>
                  <feature.icon size={23} />
                  <span>{feature.number}</span>
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </Card>
            ))}
          </div>
        </section>
        <section id="use-cases" className="saas-use-section">
          <div className="saas-container">
            <div className="saas-section-heading">
              <span className="saas-eyebrow">For your university</span>
              <h2>Study, teach, research and write.</h2>
            </div>
            <Tabs
              defaultValue="Learning"
              className="saas-use-tabs [&>[data-slot=tabs-list]]:h-auto [&>[data-slot=tabs-list]]:flex-wrap"
            >
              <TabsList className="h-auto max-w-full flex-wrap">
                {useCases.map((item) => (
                  <TabsTrigger className="min-h-11" key={item.name} value={item.name}>
                    <Icon name={item.icon} />
                    {item.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              {useCases.map((item) => (
                <TabsContent value={item.name} key={item.name}>
                  <Card className="saas-use-card grid gap-8 p-6 sm:p-8 md:grid-cols-2">
                    <div>
                      <Badge variant="outline">{item.name}</Badge>
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                      <ul>
                        {item.points.map((point) => (
                          <li key={point}>
                            <Check size={16} />
                            {point}
                          </li>
                        ))}
                      </ul>
                      <Button asChild className="saas-primary">
                        <AssistantLink
                          href={assistantUrl({ role: item.role, prompt: item.prompt })}
                        >
                          Try a {item.name.toLowerCase()} prompt <ArrowUpRight size={16} />
                        </AssistantLink>
                      </Button>
                    </div>
                    <div className="saas-prompt-example">
                      <span>
                        <FileText size={18} />
                        Example question
                      </span>
                      <blockquote>“{item.prompt}”</blockquote>
                      <p>Edit this question to suit your course or project.</p>
                    </div>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </section>
        <section className="saas-section saas-container saas-how">
          <div>
            <span className="saas-eyebrow">Getting started</span>
            <h2>Your workspace in three steps.</h2>
            <p>No university email address required.</p>
            <Button variant="outline" onClick={() => openAuth('signup')}>
              Create your account <ArrowRight size={16} />
            </Button>
          </div>
          <ol>
            {[
              {
                title: 'Create an account',
                text: 'Register with Google or any email address. No university account needed.',
              },
              {
                title: 'Open your workspace',
                text: 'Pick a role, choose a model, and bring a question or document.',
              },
              {
                title: 'Find your previous work',
                text: 'Your conversations are saved in this browser so you can return to them.',
              },
            ].map((step, index) => (
              <li key={step.title}>
                <span>{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section id="pricing" className="saas-pricing-section">
          <div className="saas-container">
            <div className="saas-section-heading">
              <span className="saas-eyebrow">Plans & pricing</span>
              <h2>Plans for individuals and teams.</h2>
              <p>Start with Free. Upgrade to Pro when you need more model access.</p>
            </div>
            <div className="saas-pricing-grid">
              <Card className="saas-price-card relative gap-5 px-6">
                <span className="saas-plan-name">Free</span>
                <p>For your own ideas and everyday work.</p>
                <div className="saas-price">
                  $0<span>/ forever</span>
                </div>
                <Button variant="outline" onClick={() => openAuth('signup')}>
                  Start for free <ArrowRight size={16} />
                </Button>
                <ul>
                  {[
                    'Personal workspace',
                    'Local conversation history',
                    'Documents and image text extraction',
                    'Claude Haiku 5.5',
                    'A daily usage allowance',
                  ].map((x) => (
                    <li key={x}>
                      <Check size={16} />
                      {x}
                    </li>
                  ))}
                </ul>
                <small>Answers are generated by Claude, from Anthropic.</small>
              </Card>
              <Card className="saas-price-card saas-featured-price relative gap-5 px-6">
                <Badge>More model access</Badge>
                <span className="saas-plan-name">Pro</span>
                <p>For a more connected workflow.</p>
                <div className="saas-price">
                  {price.formatted}
                  <span>/ 30 days</span>
                </div>
                <Button className="saas-primary" disabled={isPending} onClick={joinPro}>
                  Get Pro
                  <ArrowRight size={16} />
                </Button>
                <ul>
                  {[
                    'Everything in Free',
                    'Claude Sonnet 5.5, Opus 5.5 and Fable 5.1',
                    'A larger monthly usage allowance',
                    '30 days of Pro access',
                  ].map((x) => (
                    <li key={x}>
                      <Check size={16} />
                      {x}
                    </li>
                  ))}
                </ul>
                <small>
                  Activated after manual payment review. Larger models use the allowance faster.
                </small>
              </Card>
              <Card className="saas-price-card relative gap-5 px-6">
                <span className="saas-plan-name">Team</span>
                <p>For groups building something together.</p>
                <div className="saas-price custom">Let’s talk</div>
                <Button variant="outline" asChild>
                  <a href={`mailto:${SITE.email}?subject=UNUVIA%20Team%20enquiry`}>
                    Contact sales <ArrowUpRight size={16} />
                  </a>
                </Button>
                <ul>
                  {[
                    'Discuss your team’s needs',
                    'Custom rollout proposal',
                    'Planned: shared workspaces',
                    'Planned: organization controls',
                  ].map((x) => (
                    <li key={x}>
                      <Check size={16} />
                      {x}
                    </li>
                  ))}
                </ul>
                <small>Custom pricing. Availability by agreement.</small>
              </Card>
            </div>
            <p className="saas-pricing-note">
              Pro is activated after payment verification. No automatic renewal. Check payment
              availability in your account before paying.
            </p>
          </div>
        </section>
        <section
          id="faq"
          className="saas-section saas-container saas-faq"
          aria-labelledby="faq-title"
        >
          <div className="saas-faq-intro">
            <span className="saas-eyebrow">
              <LifeBuoy size={16} aria-hidden="true" /> Help & support
            </span>
            <h2 id="faq-title" className="type-section-title">
              Frequently asked questions
            </h2>
            <p>Getting started, choosing a plan or finding your conversations? Start here.</p>
            <Card className="mt-8 gap-4 bg-muted/30 p-5 sm:p-6">
              <span className="flex size-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <Mail size={20} aria-hidden="true" />
              </span>
              <div className="space-y-2">
                <h3 className="text-lg">Still have a question?</h3>
                <p className="text-sm text-muted-foreground">
                  Tell us what you need help with. Include the page or action you were using so we
                  can understand the issue.
                </p>
              </div>
              <Button variant="outline" className="min-h-11 w-full justify-between" asChild>
                <a href={`mailto:${SITE.email}?subject=UNUVIA%20support`}>
                  Contact support <ArrowUpRight size={16} />
                </a>
              </Button>
              <p className="break-all text-xs text-muted-foreground">{SITE.email}</p>
            </Card>
          </div>
          <Card className="gap-0 p-2 sm:p-3">
            <Accordion type="single" collapsible defaultValue="0">
              {faqs.map((faq, i) => (
                <AccordionItem value={String(i)} key={faq.question} className="px-3 sm:px-4">
                  <AccordionTrigger className="min-h-14 font-sans text-base leading-6">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 pr-6 text-sm leading-relaxed text-muted-foreground">
                    <p>{faq.answer}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Card>
        </section>
        <section className="saas-container my-16" aria-labelledby="get-started-title">
          <Card className="saas-final-cta flex-col gap-6 bg-muted/40 p-6 sm:p-10 md:flex-row">
            <div>
              <span className="saas-eyebrow">AI WORKSPACE FOR UNIVERSITIES</span>
              <h2 id="get-started-title">
                Bring AI to <br />
                your university.
              </h2>
              <p>
                Give your university community one secure place to access AI, knowledge, and
                intelligent workflows.
              </p>
            </div>
            <Button
              className="min-h-11 w-full shrink-0 md:w-auto"
              onClick={() => openAuth('signup')}
            >
              Get started for free <ArrowRight size={17} />
            </Button>
          </Card>
        </section>
      </main>
      <footer className="saas-footer">
        <div className="saas-container">
          <div className="saas-footer-grid">
            <div className="saas-footer-brand">
              <Button
                variant="link"
                asChild
                className="saas-brand h-11 justify-start px-0 text-lg font-semibold"
              >
                <a href="#main" aria-label="UNUVIA home">
                  <img src="/assets/univa-icon.png" alt="" width="30" height="30" />
                  UNUVIA
                </a>
              </Button>
              <p>
                One workspace for learning, teaching and research. Built around your university day.
              </p>
              <span className="text-xs text-brand">For the entire university.</span>
            </div>
            <nav className="saas-footer-links" aria-label="Footer product navigation">
              <h2>Explore</h2>
              {links
                .filter((link) => link.href !== '#faq')
                .map((link) => (
                  <Button key={link.href} variant="link" className={footerLinkClass} asChild>
                    <a href={link.href}>{link.label}</a>
                  </Button>
                ))}
            </nav>
            <nav className="saas-footer-links" aria-label="Footer workspace navigation">
              <h2>Your workspace</h2>
              <Button variant="link" className={footerLinkClass} asChild>
                <AssistantLink>
                  Open workspace <ArrowUpRight size={14} />
                </AssistantLink>
              </Button>
              {session ? (
                <Button variant="link" className={footerLinkClass} asChild>
                  <a href="/account">Account settings</a>
                </Button>
              ) : (
                <>
                  <Button
                    variant="link"
                    className={footerLinkClass}
                    onClick={() => openAuth('signup')}
                  >
                    Create an account
                  </Button>
                  <Button
                    variant="link"
                    className={footerLinkClass}
                    onClick={() => openAuth('login')}
                  >
                    Sign in
                  </Button>
                </>
              )}
            </nav>
            <nav className="saas-footer-links" aria-label="Footer support navigation">
              <h2>Need a hand?</h2>
              <Button variant="link" className={footerLinkClass} asChild>
                <a href="#faq">FAQ</a>
              </Button>
              <Button variant="link" className={footerLinkClass} asChild>
                <a href={`mailto:${SITE.email}`}>
                  <Mail size={14} /> Contact us
                </a>
              </Button>
            </nav>
          </div>
          <Separator />
          <div className="saas-footer-bottom">
            <span>
              © {new Date().getFullYear()} UNUVIA by {SITE.publisher}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="link"
                className="min-h-11 text-xs text-muted-foreground"
                onClick={() => setLegal('privacy')}
              >
                Privacy
              </Button>
              <Button
                variant="link"
                className="min-h-11 text-xs text-muted-foreground"
                onClick={() => setLegal('terms')}
              >
                Terms
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle className="size-11" onThemeChange={saveTheme} />
              <Button variant="ghost" className="min-h-11 text-xs" asChild>
                <a href="#main">
                  Back to top <ArrowUp size={14} />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </footer>
      <AccessDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        initialMode={authMode}
        proIntent={proIntent}
        returnFocus={returnFocus}
      />
      <Dialog
        open={legal !== null}
        onOpenChange={(open) => {
          if (!open) setLegal(null);
        }}
      >
        <DialogContent className="legal-dialog max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogTitle>{legal === 'privacy' ? 'Your data in UNUVIA' : 'Using UNUVIA'}</DialogTitle>
          <DialogDescription>
            {legal === 'privacy'
              ? 'How the current workspace handles your information.'
              : 'What to expect from the current product.'}
          </DialogDescription>
          <div>
            {legal === 'privacy' ? (
              <>
                <h3>Account information</h3>
                <p>
                  Your name, email, password hash, and session information are stored on the UNUVIA
                  server. Google sign-in, when enabled, shares the profile information needed to
                  create your account.
                </p>
                <h3>Conversations and documents</h3>
                <p>
                  History is stored in your browser, separately for each account. It does not sync
                  across devices. Sending a message shares the message and any attached text with
                  Anthropic, whose Claude models generate the answer. UNUVIA records how many tokens
                  each request used, not its content. Delete conversations from the sidebar or clear
                  your browser storage to remove local history.
                </p>
                <h3>Your choices</h3>
                <p>
                  Profile, workspace preferences, subscription periods and payment references are
                  saved on the server. You can update your profile or delete your account in
                  Settings. Contact {SITE.email} with account or data questions.
                </p>
              </>
            ) : (
              <>
                <h3>Current availability</h3>
                <p>
                  UNUVIA is published by {SITE.publisher}. The personal workspace is free, within a
                  daily usage allowance. Pro is activated manually after an administrator verifies
                  your payment. Payments are made outside this application using the configured
                  instructions. Team features require a separate agreement.
                </p>
                <h3>Your work</h3>
                <p>
                  You are responsible for the material you upload and for reviewing generated
                  answers. Verify important facts and sources before relying on them. Do not submit
                  material you are not permitted to share.
                </p>
                <h3>Need help?</h3>
                <p>Contact {SITE.email} for product, account, or pricing questions.</p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
