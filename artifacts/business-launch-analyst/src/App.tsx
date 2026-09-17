import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { ArrowUpRight, BarChart3, Check, ChevronRight, CircleAlert, Compass, Crosshair, LoaderCircle, Network, Scale, Target, WalletCards, X } from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
type AgentResult = { name: string; status: 'complete' | 'running' | 'waiting'; summary: string; bullets: string[]; metrics: { label: string; value: string }[] };
type AnalysisReport = { recommendation: string; verdict: 'GO' | 'WAIT' | 'RETHINK' | 'UNKNOWN'; confidence?: string; summary: string; actions: string[]; marketPotential: string; recommendedPrice: string; estimatedMargin: string; mainRisk: string; finance: AgentResult; market: AgentResult; raw?: string };

const sampleQuestion = 'Should I launch a premium weekly meal-planning service for busy parents in Portland at $18/month?';

function normalizeText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function normalizeDisplay(value: unknown): string {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(', ');
  return normalizeText(value);
}

function findValue(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) if (source[key] !== undefined && source[key] !== null) return source[key];
  return undefined;
}

function normalizeAgent(value: unknown, name: string, status: AgentResult['status']): AgentResult {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const bulletsValue = findValue(source, ['bullets', 'findings', 'insights', 'key_points', 'keyPoints', 'risks']);
  const bullets = Array.isArray(bulletsValue) ? bulletsValue.map(normalizeText).filter(Boolean) : [];
  const summary = normalizeText(findValue(source, ['summary', 'result', 'analysis', 'recommendation', 'content', 'text'])) || (typeof value === 'string' ? value : '');
  const definitions = name === 'Finance'
    ? [{ label: 'Revenue', keys: ['revenue', 'monthly_revenue', 'monthlyRevenue'] }, { label: 'Cost', keys: ['cost', 'monthly_cost', 'monthlyCost'] }, { label: 'Profit', keys: ['profit', 'monthly_profit', 'monthlyProfit'] }, { label: 'Margin', keys: ['margin', 'margin_percent', 'marginPercent', 'margin_percentage'] }]
    : [{ label: 'Market size', keys: ['market_size', 'marketSize', 'tam', 'market_potential'] }, { label: 'Competitors', keys: ['competitors', 'competitive_landscape'] }, { label: 'Opportunities', keys: ['opportunities', 'opportunity'] }, { label: 'Risks', keys: ['risks', 'risk', 'threats'] }];
  const metrics = definitions.map(({ label, keys }) => ({ label, value: normalizeDisplay(findValue(source, keys)) })).filter((metric) => metric.value);
  return { name, status, summary: summary || 'No structured finding was returned for this perspective.', bullets, metrics };
}

function normalizeResponse(payload: unknown): AnalysisReport | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const nested = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
  const financeValue = findValue(nested, ['finance', 'financial', 'finance_agent', 'financial_agent', 'financeResult']);
  const marketValue = findValue(nested, ['market', 'market_agent', 'marketResult', 'research']);
  const finalValue = findValue(nested, ['final_report', 'finalReport', 'report', 'recommendation', 'final']);
  const finalSource = finalValue && typeof finalValue === 'object' ? finalValue as Record<string, unknown> : nested;
  const financeSource = financeValue && typeof financeValue === 'object' ? financeValue as Record<string, unknown> : {};
  const marketSource = marketValue && typeof marketValue === 'object' ? marketValue as Record<string, unknown> : {};
  const recommendation = normalizeText(findValue(finalSource, ['recommendation', 'decision', 'verdict', 'headline'])) || (typeof finalValue === 'string' ? finalValue : '');
  const summary = normalizeText(findValue(finalSource, ['summary', 'executive_summary', 'executiveSummary', 'overview', 'rationale', 'analysis']));
  const actionsValue = findValue(finalSource, ['actions', 'next_steps', 'nextSteps', 'recommendations']);
  const actions = Array.isArray(actionsValue) ? actionsValue.map(normalizeText).filter(Boolean) : [];
  const verdictSource = `${recommendation} ${summary}`.toUpperCase();
  const verdict: AnalysisReport['verdict'] = verdictSource.includes('RETHINK') || verdictSource.includes('NO-GO') ? 'RETHINK' : verdictSource.includes('WAIT') || verdictSource.includes('CAUTION') ? 'WAIT' : verdictSource.includes('GO') || verdictSource.includes('LAUNCH') ? 'GO' : 'UNKNOWN';
  const finance = normalizeAgent(financeValue, 'Finance', financeValue ? 'complete' : 'waiting');
  const market = normalizeAgent(marketValue, 'Market', marketValue ? 'complete' : 'waiting');
  if (!recommendation && !summary && !financeValue && !marketValue) return null;
  return {
    recommendation: recommendation || 'A considered recommendation is ready.',
    verdict,
    confidence: normalizeText(findValue(finalSource, ['confidence', 'confidence_score', 'confidenceScore'])),
    summary: summary || 'The analyst perspectives have been assembled into a concise decision view.',
    actions,
    marketPotential: normalizeDisplay(findValue(finalSource, ['market_potential', 'marketPotential', 'market_size', 'marketSize'])) || normalizeDisplay(findValue(marketSource, ['market_potential', 'marketPotential', 'market_size', 'marketSize'])),
    recommendedPrice: normalizeDisplay(findValue(finalSource, ['recommended_price', 'recommendedPrice', 'price', 'pricing'])) || normalizeDisplay(findValue(financeSource, ['recommended_price', 'recommendedPrice', 'price'])),
    estimatedMargin: normalizeDisplay(findValue(finalSource, ['estimated_margin', 'estimatedMargin', 'margin', 'margin_percent', 'marginPercent'])) || normalizeDisplay(findValue(financeSource, ['estimated_margin', 'estimatedMargin', 'margin', 'margin_percent', 'marginPercent'])),
    mainRisk: normalizeDisplay(findValue(finalSource, ['main_risk', 'mainRisk', 'risk', 'key_risk'])) || normalizeDisplay(findValue(marketSource, ['main_risk', 'mainRisk', 'risk', 'key_risk'])),
    finance,
    market,
    raw: JSON.stringify(payload, null, 2),
  };
}

function Header() {
  return <header className="container-wide flex items-center justify-between py-6">
    <Link href="/" className="flex items-center gap-3 no-underline" data-testid="link-brand"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"><Crosshair size={18} strokeWidth={2.5} /></span><span className="text-[15px] font-bold tracking-[-.02em]">Business Launch <span className="font-normal text-[hsl(var(--muted-foreground))]">Analyst</span></span></Link>
    <nav className="flex items-center gap-5 text-[13px] font-medium" aria-label="Primary navigation"><a className="nav-link hidden sm:inline" href="#method" data-testid="link-method">Method</a><Link href="/analysis" className="button-dark rounded-full px-4 py-2.5 no-underline" data-testid="link-start-analysis">Start an analysis <ArrowUpRight size={14} className="ml-1 inline" /></Link></nav>
  </header>;
}

function Home() {
  return <div className="site-shell">
    <Header />
    <main>
      <section className="hero-grid relative border-y border-[hsl(var(--border))]"><div className="container-wide grid min-h-[600px] items-center gap-12 py-20 lg:grid-cols-[1.05fr_.95fr] lg:py-24">
        <div className="reveal max-w-[690px]"><div className="eyebrow mb-6 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" /> A sharper second opinion</div><h1 className="display max-w-[700px] text-[clamp(3.6rem,8vw,7.4rem)] leading-[.86]">Decide with<br /><em>conviction.</em></h1><p className="mt-8 max-w-[530px] text-[17px] leading-7 text-[hsl(var(--muted-foreground))]">Business Launch Analyst turns a raw business question into a clear point of view — tested through finance and market lenses, then brought together in one honest recommendation.</p><div className="mt-9 flex flex-wrap items-center gap-4"><Link href="/analysis" className="button-primary inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold no-underline" data-testid="button-hero-analysis">Ask the analyst <ArrowUpRight size={16} /></Link><span className="mono text-[10px] uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">No decks. No filler.</span></div></div>
        <div className="reveal delay-2 relative"><div className="signal-card relative overflow-hidden rounded-[2px] p-7 sm:p-9"><div className="relative z-[1]"><div className="mb-16 flex items-center justify-between"><span className="mono text-[10px] uppercase tracking-[.14em] text-[hsl(42 35% 97% / .6)]">Decision brief / 001</span><span className="flex items-center gap-2 text-[11px] text-[hsl(42 35% 97% / .65)]"><span className="pulse-dot h-2 w-2 rounded-full bg-[hsl(82 68% 69%)]" /> Live perspective</span></div><p className="eyebrow !text-[hsl(82 68% 69%)]">The question</p><p className="mt-3 max-w-[360px] text-[25px] leading-8">“Is this the right moment to put my next six months behind this idea?”</p><div className="mt-12 grid grid-cols-2 gap-3 border-t border-[hsl(42 35% 97% / .17)] pt-5"><div><p className="mono text-[10px] uppercase text-[hsl(42 35% 97% / .5)]">Finance lens</p><p className="mt-2 text-sm">Unit economics</p></div><div><p className="mono text-[10px] uppercase text-[hsl(42 35% 97% / .5)]">Market lens</p><p className="mt-2 text-sm">Demand signals</p></div></div></div></div><div className="absolute -bottom-5 -left-5 hidden rounded-sm border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-[var(--shadow-sm)] sm:block"><p className="mono text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Output</p><p className="mt-1 text-sm font-bold">A point of view, not a score</p></div></div>
      </div></section>
      <section id="method" className="container-wide py-24 sm:py-32"><div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr]"><div><p className="eyebrow">Why it works</p><h2 className="display mt-5 text-5xl leading-[.94] sm:text-6xl">Clarity comes<br /><em>from tension.</em></h2></div><div className="grid gap-0 border-t border-[hsl(var(--border))]">{[{ icon: Scale, n: '01', title: 'Two independent lenses', copy: 'Finance asks whether the business can work. Market asks whether anyone will care. Different questions, one decision.' }, { icon: Network, n: '02', title: 'A useful disagreement', copy: 'The best advice does not flatten uncertainty. It surfaces the tension so you know what to test next.' }, { icon: Target, n: '03', title: 'A clear next move', copy: 'Walk away with a recommendation you can act on today — and the assumptions worth proving before you commit.' }].map(({ icon: Icon, n, title, copy }) => <div key={n} className="grid gap-5 border-b border-[hsl(var(--border))] py-7 sm:grid-cols-[60px_1fr_1.2fr] sm:items-start"><span className="mono text-xs text-[hsl(var(--accent))]">{n}</span><div className="flex items-center gap-3"><Icon size={18} strokeWidth={1.6} /><h3 className="font-bold">{title}</h3></div><p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">{copy}</p></div>)}</div></div></section>
      <section className="bg-[hsl(var(--primary))] py-20 text-[hsl(var(--primary-foreground))] sm:py-28"><div className="container-wide grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-end"><div><p className="eyebrow !text-[hsl(82 68% 69%)]">A sample output</p><h2 className="display mt-5 max-w-[560px] text-5xl leading-[.95] sm:text-6xl">Know what to do<br /><em>before you build.</em></h2></div><div className="border-l border-[hsl(42 35% 97% / .2)] pl-6 sm:pl-10"><p className="mono text-[10px] uppercase tracking-[.15em] text-[hsl(42 35% 97% / .5)]">Recommendation</p><p className="mt-4 text-[25px] leading-8">“Proceed with a 30-customer pilot. Do not invest in the full product until retention clears the first-month threshold.”</p><div className="mt-8 flex items-center gap-2 text-sm text-[hsl(82 68% 69%)]"><Check size={16} /> Specific enough to act on</div></div></div></section>
      <section className="container-wide flex flex-col items-start justify-between gap-7 py-20 sm:flex-row sm:items-center sm:py-24"><div><p className="eyebrow">Your next decision</p><h2 className="display mt-3 text-4xl sm:text-5xl">Bring the question.</h2></div><Link href="/analysis" className="button-dark inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold no-underline" data-testid="button-bottom-analysis">Run your analysis <ChevronRight size={16} /></Link></section>
    </main>
    <footer className="container-wide flex flex-col gap-2 border-t border-[hsl(var(--border))] py-7 text-xs text-[hsl(var(--muted-foreground))] sm:flex-row sm:items-center sm:justify-between"><span>Business Launch Analyst</span><span className="mono text-[10px] uppercase tracking-[.12em]">A clear head is a competitive advantage.</span></footer>
  </div>;
}

function AgentProgress({ agent, index }: { agent: AgentResult; index: number }) {
  const Icon = index === 0 ? WalletCards : BarChart3;
  return <div className="progress-line flex gap-4 pb-8" data-testid={`status-agent-${agent.name.toLowerCase()}`}><span className={`relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${agent.status === 'complete' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))]'}`}>{agent.status === 'complete' ? <Check size={15} /> : <Icon size={15} />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">{agent.name} perspective</p><span className="mono text-[10px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">{agent.status === 'complete' ? 'Complete' : 'Waiting'}</span></div>{agent.status === 'complete' ? <div className="mt-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"><p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">{agent.summary}</p>{agent.metrics.length > 0 && <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[hsl(var(--border))] pt-3 sm:grid-cols-4">{agent.metrics.map((metric) => <div key={metric.label}><p className="mono text-[9px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">{metric.label}</p><p className="mt-1 text-sm font-semibold" data-testid={`text-agent-metric-${agent.name.toLowerCase()}-${metric.label.toLowerCase().replaceAll(' ', '-')}`}>{metric.value}</p></div>)}</div>}{agent.bullets.length > 0 && <ul className="mt-3 space-y-2 border-t border-[hsl(var(--border))] pt-3">{agent.bullets.slice(0, 4).map((bullet, itemIndex) => <li className="flex gap-2 text-sm leading-5" key={`${agent.name}-${itemIndex}`} data-testid={`text-agent-finding-${agent.name.toLowerCase()}-${itemIndex}`}><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--accent))]" />{bullet}</li>)}</ul>}</div> : <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">No structured result returned.</p>}</div></div>;
}

function Analysis() {
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<'idle' | 'loading' | 'success' | 'error' | 'malformed'>('idle');
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeStep, setActiveStep] = useState(0);
  const apiBase = import.meta.env.VITE_API_BASE || '';
  const steps = ['Frame the question', 'Ask Finance', 'Ask Market', 'Synthesize a recommendation'];
  const canSubmit = query.trim().length >= 12 && phase !== 'loading';
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setPhase('loading'); setReport(null); setErrorMessage(''); setActiveStep(1);
    const timer = window.setInterval(() => setActiveStep((step) => Math.min(step + 1, 3)), 850);
    try {
      const response = await fetch(`${apiBase.replace(/\/$/, '')}/orchestrate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: query.trim() }) });
      if (!response.ok) throw new Error(`The analyst returned a ${response.status} response.`);
      const payload: unknown = await response.json();
      const normalized = normalizeResponse(payload);
      if (!normalized) { setPhase('malformed'); return; }
      setReport(normalized); setActiveStep(3); setPhase('success');
    } catch (error) {
      setPhase('error'); setErrorMessage(error instanceof Error ? error.message : 'We could not reach the analyst.');
    } finally { window.clearInterval(timer); }
  };
  const resultAgents = useMemo(() => report ? [report.finance, report.market] : [], [report]);
  return <div className="site-shell"><Header /><main className="container-wide pb-24 pt-12 sm:pt-20"><div className="mx-auto max-w-[850px]">
    <div className="reveal"><Link href="/" className="mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))] no-underline" data-testid="link-back-home">← Back to overview</Link><p className="eyebrow mt-12">Analysis room</p><h1 className="display mt-4 text-[clamp(3.2rem,7vw,6.4rem)] leading-[.87]">What are you<br /><em>deciding?</em></h1><p className="mt-7 max-w-[590px] text-base leading-7 text-[hsl(var(--muted-foreground))]">Give the analyst the context you would give a sharp advisor. Include the customer, offer, price, and the decision you are stuck on.</p></div>
    <form className="reveal delay-1 mt-12" onSubmit={handleSubmit}><label htmlFor="business-question" className="mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Your business question</label><textarea id="business-question" className="analysis-textarea mt-3 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 text-lg leading-7 shadow-[var(--shadow-sm)]" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={sampleQuestion} data-testid="input-business-question" /><div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><span className={`text-xs ${query.length > 0 && query.trim().length < 12 ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--muted-foreground))]'}`}>{query.length > 0 && query.trim().length < 12 ? 'Add a little more context for a useful read.' : 'Usually takes under a minute.'}</span><button type="submit" disabled={!canSubmit} className="button-primary inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-run-analysis">{phase === 'loading' ? <><LoaderCircle size={16} className="animate-spin" /> Reading the signals</> : <>Run the analysis <ArrowUpRight size={16} /></>}</button></div></form>
    {phase === 'idle' && <div className="reveal delay-2 mt-20 grid gap-5 border-t border-[hsl(var(--border))] pt-6 sm:grid-cols-3">{[{ title: 'Finance', copy: 'Can the numbers hold?', Icon: WalletCards }, { title: 'Market', copy: 'Will people care?', Icon: BarChart3 }, { title: 'Recommendation', copy: 'What should you do?', Icon: Compass }].map(({ title, copy, Icon }, index) => <div key={title} data-testid={`card-lens-${index}`}><Icon size={18} /><p className="mt-4 font-bold">{title}</p><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{copy}</p></div>)}</div>}
     {phase === 'loading' && <section className="reveal mt-16 border-t border-[hsl(var(--border))] pt-8" aria-live="polite"><p className="eyebrow">Working through the question</p><div className="mt-8 grid gap-3 sm:grid-cols-2">{['Finance', 'Market'].map((name, index) => { const status = index === 0 ? (activeStep >= 2 ? 'done' : activeStep === 1 ? 'running' : 'pending') : (activeStep >= 3 ? 'done' : activeStep === 2 ? 'running' : 'pending'); return <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4" key={name} data-testid={`status-agent-loading-${name.toLowerCase()}`}><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className={`flex h-8 w-8 items-center justify-center rounded-full ${status === 'done' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--secondary))]'}`}>{status === 'done' ? <Check size={15} /> : status === 'running' ? <LoaderCircle size={15} className="animate-spin" /> : index === 0 ? <WalletCards size={15} /> : <BarChart3 size={15} />}</span><p className="font-bold">{name}</p></div><span className="mono text-[10px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">{status}</span></div><p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">{status === 'done' ? 'Perspective complete.' : status === 'running' ? 'Analyzing now.' : 'Pending.'}</p></div>; })}</div><div className="mt-8">{steps.map((step, index) => <div className="progress-line flex gap-4 pb-8" key={step} data-testid={`status-step-${index}`}><span className={`relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${index <= activeStep ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))]'}`}>{index < activeStep ? <Check size={15} /> : index === activeStep ? <LoaderCircle size={15} className="animate-spin" /> : <span className="mono text-[10px]">{index + 1}</span>}</span><div><p className={`font-bold ${index > activeStep ? 'text-[hsl(var(--muted-foreground))]' : ''}`}>{step}</p><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{index === activeStep ? 'The perspective is being assembled now.' : index < activeStep ? 'Done.' : 'Up next.'}</p></div></div>)}</div></section>}
    {phase === 'error' && <div className="reveal mt-16 rounded-md border border-[hsl(var(--accent))] bg-[hsl(var(--accent)/.08)] p-6" role="alert" data-testid="status-analysis-error"><CircleAlert size={20} className="text-[hsl(var(--accent))]" /><h2 className="mt-4 font-bold">The analyst could not be reached.</h2><p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{errorMessage || 'Check your connection and try again.'}</p><button type="button" className="button-dark mt-5 rounded-full px-4 py-2 text-sm font-bold" onClick={() => setPhase('idle')} data-testid="button-retry-analysis">Try again</button></div>}
    {phase === 'malformed' && <div className="reveal mt-16 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6" role="alert" data-testid="status-analysis-malformed"><X size={20} className="text-[hsl(var(--accent))]" /><h2 className="mt-4 font-bold">The response was hard to read.</h2><p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">The service responded, but not with enough structured detail to make a useful recommendation.</p><button type="button" className="button-dark mt-5 rounded-full px-4 py-2 text-sm font-bold" onClick={() => setPhase('idle')} data-testid="button-retry-malformed">Try again</button></div>}
     {phase === 'success' && report && <section className="reveal mt-16 border-t border-[hsl(var(--border))] pt-8" aria-live="polite" data-testid="section-analysis-results"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">The readout</p><h2 className="display mt-3 text-5xl leading-[.9]">Here is the<br /><em>clear version.</em></h2></div><span className={`mono self-start rounded-full px-3 py-2 text-[10px] tracking-[.13em] ${report.verdict === 'GO' ? 'bg-[hsl(82 68% 69%)] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]'}`} data-testid="status-recommendation">{report.verdict === 'UNKNOWN' ? 'REVIEW' : report.verdict === 'RETHINK' ? 'DO NOT LAUNCH' : report.verdict === 'WAIT' ? 'WAIT' : 'LAUNCH'}</span></div><div className="signal-card relative mt-10 overflow-hidden rounded-[2px] p-7 sm:p-10"><div className="relative z-[1]"><p className="mono text-[10px] uppercase tracking-[.14em] text-[hsl(42 35% 97% / .55)]">Final recommendation</p><p className="mt-4 max-w-[690px] text-[clamp(1.6rem,3.4vw,2.5rem)] leading-[1.15]" data-testid="text-final-recommendation">{report.recommendation}</p>{report.confidence && <p className="mt-6 text-sm text-[hsl(42 35% 97% / .6)]">Confidence: <span className="text-[hsl(82 68% 69%)]">{report.confidence}</span></p>}</div></div>{report.summary && <div className="mt-8 border-l-2 border-[hsl(var(--accent))] pl-5"><p className="mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">In plain terms</p><p className="mt-2 max-w-[700px] text-lg leading-7" data-testid="text-final-summary">{report.summary}</p></div>}<div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[{ label: 'Market potential', value: report.marketPotential }, { label: 'Recommended price', value: report.recommendedPrice }, { label: 'Estimated margin', value: report.estimatedMargin }, { label: 'Main risk', value: report.mainRisk }].map((metric) => <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4" key={metric.label}><p className="mono text-[9px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">{metric.label}</p><p className="mt-3 text-base font-semibold leading-6" data-testid={`text-report-metric-${metric.label.toLowerCase().replaceAll(' ', '-')}`}>{metric.value || 'Not provided'}</p></div>)}</div><div className="mt-12"><p className="eyebrow mb-6">Two perspectives</p>{resultAgents.map((agent, index) => <AgentProgress agent={agent} index={index} key={agent.name} />)}</div>{report.actions.length > 0 && <div className="mt-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"><p className="mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">What to do next</p><ol className="mt-4 space-y-3">{report.actions.slice(0, 5).map((action, index) => <li className="flex gap-3 text-sm leading-6" key={`${action}-${index}`} data-testid={`text-next-action-${index}`}><span className="mono text-xs text-[hsl(var(--accent))]">0{index + 1}</span>{action}</li>)}</ol></div>}{report.raw && <details className="mt-8 text-xs text-[hsl(var(--muted-foreground))]" data-testid="details-raw-response"><summary className="cursor-pointer hover:text-[hsl(var(--foreground))]">View raw response</summary><pre className="mt-3 max-h-72 overflow-auto rounded-md bg-[hsl(var(--secondary))] p-4 text-[10px] leading-5">{report.raw}</pre></details>}<div className="mt-12 flex flex-wrap gap-3"><button type="button" className="button-primary inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold" onClick={() => { setPhase('idle'); setReport(null); }} data-testid="button-new-analysis">Ask another question <ArrowUpRight size={15} /></button><Link href="/" className="inline-flex items-center rounded-full border border-[hsl(var(--border))] px-5 py-3 text-sm font-bold no-underline hover:bg-[hsl(var(--secondary))]">Return to overview</Link></div></section>}
  </div></main></div>;
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route path="/analysis" component={Analysis} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;