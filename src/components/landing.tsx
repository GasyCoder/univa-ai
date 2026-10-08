'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Layers,
  Menu,
  MessageSquare,
  FileText,
  Lock,
  Plus,
  Sparkles,
  LogOut,
  CreditCard,
  PanelsTopLeft,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './ui/accordion';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from './ui/sheet';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { Alert, AlertDescription } from './ui/alert';
import { AccessDialog, type AuthMode } from './access-dialog';
import { ThemeToggle } from './theme-provider';
import { MobileNavigation } from './mobile-navigation';
import { AssistantLink, assistantUrl } from './assistant-link';
import { authClient } from '@/lib/auth-client';
import { faqs, useCases } from '@/lib/landing-data';
import { Icon } from './icon';

export function Landing() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [menuOpen, setMenuOpen] = useState(false);
  const [legal, setLegal] = useState<'privacy' | 'terms' | null>(null);
  const [proIntent, setProIntent] = useState(false);
  const [waitlist, setWaitlist] = useState('');
  const [joining, setJoining] = useState(false);
  const { data: session, isPending } = authClient.useSession();
  const returnFocus = useRef<HTMLElement | null>(null);
  const followedMenuLink = useRef(false);
  const autoJoined = useRef(false);
  useEffect(() => {
    if (
      !session ||
      autoJoined.current ||
      new URLSearchParams(window.location.search).get('join') !== 'pro'
    )
      return;
    autoJoined.current = true;
    fetch('/api/waitlist', { method: 'POST' })
      .then((response) =>
        setWaitlist(
          response.ok
            ? 'You’re on the Pro waitlist. No payment required.'
            : 'We couldn’t join the waitlist. Please try again.'
        )
      )
      .catch(() => setWaitlist('Unable to connect. Please try again.'));
    window.history.replaceState(null, '', '/#pricing');
    document.getElementById('pricing')?.scrollIntoView();
  }, [session]);
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
  async function joinPro() {
    if (!session) {
      openAuth('signup', true);
      return;
    }
    setJoining(true);
    setWaitlist('');
    try {
      const response = await fetch('/api/waitlist', { method: 'POST' });
      setWaitlist(
        response.ok
          ? 'You’re on the Pro waitlist. No payment required.'
          : 'We couldn’t join the waitlist. Please try again.'
      );
    } catch {
      setWaitlist('Unable to connect. Please try again.');
    } finally {
      setJoining(false);
    }
  }
  const links = [
    { label: 'Product', href: '#product' },
    { label: 'Use cases', href: '#use-cases' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'FAQ', href: '#faq' },
  ];
  const navLinks = links.map((link) => (
    <a
      key={link.href}
      href={link.href}
      onClick={() => {
        followedMenuLink.current = menuOpen;
        setMenuOpen(false);
      }}
    >
      {link.label}
    </a>
  ));
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
            <ThemeToggle />
            <div className="saas-account-actions">{accountActions}</div>
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <MobileNavigation label="Mobile site navigation">
                <Button variant="ghost" asChild className="mobile-nav-item">
                  <a href="#product">
                    <PanelsTopLeft size={21} />
                    <span>Product</span>
                  </a>
                </Button>
                <Button variant="ghost" asChild className="mobile-nav-item">
                  <a href="#pricing">
                    <CreditCard size={21} />
                    <span>Pricing</span>
                  </a>
                </Button>
                <Button variant="ghost" asChild className="mobile-nav-item mobile-nav-primary">
                  <AssistantLink>
                    <MessageSquare size={21} />
                    <span>Workspace</span>
                  </AssistantLink>
                </Button>
                <ThemeToggle label="Theme" className="mobile-nav-item" />
                <SheetTrigger asChild>
                  <Button variant="ghost" className="mobile-nav-item" aria-label="Open menu">
                    <Menu size={21} />
                    <span>Menu</span>
                  </Button>
                </SheetTrigger>
              </MobileNavigation>
              <SheetContent
                className="saas-mobile-sheet"
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
        <section className="saas-hero saas-container">
          <div className="saas-hero-copy">
            <span className="saas-eyebrow">UNUVIA for universities</span>
            <h1>
              One AI workspace <br />
              <span>for the entire university.</span>
            </h1>
            <p>
              Give students, faculty, researchers, and university staff secure access to AI,
              institutional knowledge, and intelligent workflows from one platform.
            </p>
            <div className="saas-hero-actions">
              <Button className="saas-primary" onClick={() => openAuth('signup')}>
                Start for free <ArrowRight size={17} />
              </Button>
              <Button variant="outline" asChild>
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
          <Card className="saas-preview" aria-label="Workspace preview">
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
                  <Sparkles size={22} />
                  <h2>Your university workspace</h2>
                  <p>Questions, notes and documents, in one place.</p>
                </div>
                <div className="preview-prompt">
                  Help me turn my research notes into a clear outline.
                </div>
                <div className="preview-response">
                  <span>
                    <Sparkles size={15} />
                    UNUVIA
                  </span>
                  <p>Start with your main question. Then group your notes into three sections:</p>
                  <ul>
                    <li>What you already know</li>
                    <li>What you want to explore</li>
                    <li>Your next steps</li>
                  </ul>
                </div>
                <AssistantLink
                  href={assistantUrl({
                    prompt: 'Help me turn my research notes into a clear outline.',
                  })}
                  className="saas-preview-composer"
                >
                  Try this in your workspace
                  <ArrowUpRight size={17} />
                </AssistantLink>
              </div>
            </div>
            <div className="saas-preview-foot">
              <Lock size={12} />
              Illustrative conversation · actual responses depend on the connected service
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
                text: 'Select a model for your task. Available models depend on your connected service.',
              },
            ].map((feature) => (
              <Card className="saas-feature" key={feature.title}>
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
            <Tabs defaultValue="Learning" className="saas-use-tabs">
              <TabsList>
                {useCases.map((item) => (
                  <TabsTrigger key={item.name} value={item.name}>
                    <Icon name={item.icon} />
                    {item.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              {useCases.map((item) => (
                <TabsContent value={item.name} key={item.name}>
                  <Card className="saas-use-card">
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
              <p>Start with Free. Pro and Team features are in development.</p>
            </div>
            <div className="saas-pricing-grid">
              <Card className="saas-price-card">
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
                    'Text document attachments',
                    'Model selection',
                  ].map((x) => (
                    <li key={x}>
                      <Check size={16} />
                      {x}
                    </li>
                  ))}
                </ul>
                <small>Model service access is required for responses.</small>
              </Card>
              <Card className="saas-price-card saas-featured-price">
                <Badge>Coming next</Badge>
                <span className="saas-plan-name">Pro</span>
                <p>For a more connected workflow.</p>
                <div className="saas-price">
                  $12<span>/ month</span>
                </div>
                <Button className="saas-primary" disabled={joining || isPending} onClick={joinPro}>
                  {joining ? 'Joining…' : 'Join Pro waitlist'}
                  <ArrowRight size={16} />
                </Button>
                <ul>
                  {[
                    'Everything in Free',
                    'Planned: history across devices',
                    'Planned: expanded document support',
                    'Planned: project organization',
                  ].map((x) => (
                    <li key={x}>
                      <Check size={16} />
                      {x}
                    </li>
                  ))}
                </ul>
                <small>Planned price in USD. No payment collected.</small>
              </Card>
              <Card className="saas-price-card">
                <span className="saas-plan-name">Team</span>
                <p>For groups building something together.</p>
                <div className="saas-price custom">Let’s talk</div>
                <Button variant="outline" asChild>
                  <a href="mailto:contact@univa.ai?subject=UNUVIA%20Team%20enquiry">
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
            {waitlist && (
              <Alert className="saas-waitlist-status">
                <AlertDescription role="status">{waitlist}</AlertDescription>
              </Alert>
            )}
            <p className="saas-pricing-note">
              No hidden checkout. Free is available; Pro and Team expansion features are in
              development.
            </p>
          </div>
        </section>
        <section id="faq" className="saas-section saas-container saas-faq">
          <div>
            <span className="saas-eyebrow">Help & support</span>
            <h2>Frequently asked questions</h2>
            <p>Need help with your account or workspace?</p>
            <a className="saas-text-link" href="mailto:contact@univa.ai">
              Contact us <ArrowUpRight size={16} />
            </a>
          </div>
          <Accordion type="single" collapsible>
            {faqs.map((faq, i) => (
              <AccordionItem value={String(i)} key={faq.question}>
                <AccordionTrigger>{faq.question}</AccordionTrigger>
                <AccordionContent>{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
        <section className="saas-container saas-final">
          <div>
            <span className="saas-eyebrow">AI WORKSPACE FOR UNIVERSITIES</span>
            <h2>
              Bring AI to <br />
              your university.
            </h2>
            <p>
              Give your university community one secure place to access AI, knowledge, and
              intelligent workflows.
            </p>
          </div>
          <Button onClick={() => openAuth('signup')}>
            Get started for free <ArrowRight size={17} />
          </Button>
        </section>
      </main>
      <footer className="saas-footer saas-container">
        <div>
          <a className="saas-brand" href="/" aria-label="UNUVIA home">
            UNUVIA
          </a>
          <p>
            UNUVIA is an AI workspace for universities, designed to simplify access to AI across
            teaching, research, administration, and institutional knowledge.
          </p>
        </div>
        <nav aria-label="Footer navigation">
          {navLinks}
          <a href="mailto:contact@univa.ai">Contact</a>
        </nav>
        <div className="saas-footer-bottom">
          <span>© {new Date().getFullYear()} UNUVIA</span>
          <div>
            <Button variant="link" onClick={() => setLegal('privacy')}>
              Privacy
            </Button>
            <Button variant="link" onClick={() => setLegal('terms')}>
              Terms
            </Button>
            <ThemeToggle />
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
        <DialogContent className="legal-dialog">
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
                  the connected model service. Delete conversations from the sidebar or clear your
                  browser storage to remove local history.
                </p>
                <h3>Your choices</h3>
                <p>
                  Your theme preference is saved on this device. Joining the Pro waitlist saves your
                  account ID and the date you joined. Contact contact@univa.ai with account or data
                  questions.
                </p>
              </>
            ) : (
              <>
                <h3>Current availability</h3>
                <p>
                  The personal workspace is free. Responses depend on an available model service.
                  Pro is a waitlist, and its displayed price is planned; no payment is collected
                  here. Team features require a separate agreement.
                </p>
                <h3>Your work</h3>
                <p>
                  You are responsible for the material you upload and for reviewing generated
                  answers. Verify important facts and sources before relying on them. Do not submit
                  material you are not permitted to share.
                </p>
                <h3>Need help?</h3>
                <p>Contact contact@univa.ai for product, account, or pricing questions.</p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
