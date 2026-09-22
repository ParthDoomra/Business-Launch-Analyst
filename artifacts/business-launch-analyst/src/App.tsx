import { type FormEvent, type ReactNode, useMemo, useState, useRef, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleAlert,
  Compass,
  Crosshair,
  Handshake,
  HelpCircle,
  LoaderCircle,
  MessageSquare,
  Network,
  RotateCcw,
  Scale,
  Send,
  Sparkles,
  Target,
  User,
  WalletCards,
  X
} from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

type AgentResult = {
  name: string;
  status: 'complete' | 'running' | 'waiting' | 'done' | 'pending';
  summary: string;
  strategy?: string;
  bullets: string[];
  metrics: { label: string; value: string }[];
};

type AnalysisReport = {
  recommendation: string;
  verdict: 'GO' | 'WAIT' | 'RETHINK' | 'UNKNOWN';
  confidence?: string;
  summary: string;
  actions: string[];
  marketPotential: string;
  recommendedPrice: string;
  estimatedMargin: string;
  mainRisk: string;
  finance: AgentResult;
  market: AgentResult;
  sales?: AgentResult | null;
  agents: AgentResult[];
  hasSales?: boolean;
  raw?: string;
};

type ConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: 'clarification' | 'result' | 'answer';
  report?: AnalysisReport | null;
  raw?: string;
  timestamp: number;
};

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
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function normalizeAgent(value: unknown, name: string, status: AgentResult['status']): AgentResult {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const bulletsValue = findValue(source, [
    'bullets',
    'findings',
    'insights',
    'key_points',
    'keyPoints',
    'risks',
    'key_talking_points',
    'keyTalkingPoints',
    'talking_points',
    'talkingPoints'
  ]);
  const bullets = Array.isArray(bulletsValue) ? bulletsValue.map(normalizeText).filter(Boolean) : [];
  
  const strategy = normalizeText(
    findValue(source, ['negotiation_strategy', 'negotiationStrategy', 'strategy'])
  );

  let summary =
    normalizeText(findValue(source, ['summary', 'result', 'analysis', 'recommendation', 'content', 'text'])) ||
    (typeof value === 'string' ? value : '');

  if (!summary && strategy) {
    summary = strategy;
  }

  const lowerName = name.toLowerCase();
  let definitions: { label: string; keys: string[] }[] = [];

  if (lowerName === 'finance') {
    definitions = [
      { label: 'Revenue', keys: ['revenue', 'monthly_revenue', 'monthlyRevenue'] },
      { label: 'Cost', keys: ['cost', 'monthly_cost', 'monthlyCost'] },
      { label: 'Profit', keys: ['profit', 'monthly_profit', 'monthlyProfit'] },
      { label: 'Margin', keys: ['margin', 'margin_percent', 'marginPercent', 'margin_percentage'] }
    ];
  } else if (lowerName === 'market') {
    definitions = [
      { label: 'Market size', keys: ['market_size', 'marketSize', 'tam', 'market_potential'] },
      { label: 'Competitors', keys: ['competitors', 'competitive_landscape'] },
      { label: 'Opportunities', keys: ['opportunities', 'opportunity'] },
      { label: 'Risks', keys: ['risks', 'risk', 'threats'] }
    ];
  } else if (lowerName === 'sales') {
    definitions = [
      { label: 'Min acceptable price', keys: ['min_acceptable_price', 'minAcceptablePrice', 'floor_price', 'min_price'] },
      { label: 'Opening offer', keys: ['recommended_opening_offer', 'recommendedOpeningOffer', 'opening_offer'] },
      { label: 'Max asking price', keys: ['max_asking_price', 'maxAskingPrice', 'ceiling_price', 'max_price'] },
      { label: 'Negotiation strategy', keys: ['negotiation_strategy', 'negotiationStrategy', 'strategy'] }
    ];
  } else {
    definitions = Object.keys(source)
      .filter((k) => !['bullets', 'findings', 'insights', 'summary', 'key_talking_points', 'keyTalkingPoints', 'strategy', 'negotiation_strategy'].includes(k))
      .slice(0, 4)
      .map((k) => ({ label: k.replace(/_/g, ' '), keys: [k] }));
  }

  const metrics = definitions
    .map(({ label, keys }) => {
      const rawVal = findValue(source, keys);
      let displayVal = normalizeDisplay(rawVal);
      if (lowerName === 'sales' && typeof rawVal === 'number') {
        displayVal = `₹${rawVal.toLocaleString()}`;
      } else if (lowerName === 'finance' && typeof rawVal === 'number' && label !== 'Margin') {
        displayVal = `₹${rawVal.toLocaleString()}`;
      } else if (lowerName === 'finance' && label === 'Margin' && typeof rawVal === 'number') {
        displayVal = `${rawVal}%`;
      }
      return { label, value: displayVal };
    })
    .filter((metric) => metric.value);

  return {
    name,
    status,
    summary: summary || 'No structured finding was returned for this perspective.',
    strategy: strategy || undefined,
    bullets,
    metrics
  };
}

function normalizeReport(payload: unknown): AnalysisReport | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const nested = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;

  const rawAgents =
    root.agents && typeof root.agents === 'object'
      ? (root.agents as Record<string, unknown>)
      : nested.agents && typeof nested.agents === 'object'
      ? (nested.agents as Record<string, unknown>)
      : {};

  const financeValue =
    findValue(nested, ['finance', 'financial', 'finance_agent', 'financial_agent', 'financeResult']) ||
    rawAgents.finance ||
    root.finance;
  const marketValue =
    findValue(nested, ['market', 'market_agent', 'marketResult', 'research']) ||
    rawAgents.market ||
    root.market;
  const salesValue =
    findValue(nested, ['sales', 'sales_agent', 'salesResult']) ||
    rawAgents.sales ||
    root.sales;

  const finalValue = findValue(nested, ['final_report', 'finalReport', 'report', 'recommendation', 'final']);
  const finalSource = finalValue && typeof finalValue === 'object' ? (finalValue as Record<string, unknown>) : nested;
  const financeSource = financeValue && typeof financeValue === 'object' ? (financeValue as Record<string, unknown>) : {};
  const marketSource = marketValue && typeof marketValue === 'object' ? (marketValue as Record<string, unknown>) : {};
  const salesSource = salesValue && typeof salesValue === 'object' ? (salesValue as Record<string, unknown>) : {};

  const recommendation =
    normalizeText(findValue(finalSource, ['recommendation', 'decision', 'verdict', 'headline'])) ||
    (typeof finalValue === 'string' ? finalValue : '');
  const summary = normalizeText(
    findValue(finalSource, ['summary', 'executive_summary', 'executiveSummary', 'overview', 'rationale', 'analysis'])
  );
  const actionsValue = findValue(finalSource, ['actions', 'next_steps', 'nextSteps', 'recommendations']);
  const actions = Array.isArray(actionsValue) ? actionsValue.map(normalizeText).filter(Boolean) : [];
  const verdictSource = `${recommendation} ${summary}`.toUpperCase();
  const verdict: AnalysisReport['verdict'] =
    verdictSource.includes('RETHINK') || verdictSource.includes('NO-GO')
      ? 'RETHINK'
      : verdictSource.includes('WAIT') || verdictSource.includes('CAUTION')
      ? 'WAIT'
      : verdictSource.includes('GO') || verdictSource.includes('LAUNCH')
      ? 'GO'
      : 'UNKNOWN';

  const finance = normalizeAgent(financeValue, 'Finance', financeValue ? 'complete' : 'waiting');
  const market = normalizeAgent(marketValue, 'Market', marketValue ? 'complete' : 'waiting');
  const sales = salesValue ? normalizeAgent(salesValue, 'Sales', 'complete') : null;

  // Dynamically extract all agents present in response
  const agentsList: AgentResult[] = [];
  const agentKeys = Object.keys(rawAgents);
  if (agentKeys.length > 0) {
    const preferredOrder = ['finance', 'market', 'sales'];
    agentKeys.sort((a, b) => {
      const idxA = preferredOrder.indexOf(a.toLowerCase());
      const idxB = preferredOrder.indexOf(b.toLowerCase());
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    for (const key of agentKeys) {
      const val = rawAgents[key];
      const displayName = key.charAt(0).toUpperCase() + key.slice(1);
      agentsList.push(normalizeAgent(val, displayName, val ? 'complete' : 'waiting'));
    }
  } else {
    if (financeValue) agentsList.push(finance);
    if (marketValue) agentsList.push(market);
    if (sales) agentsList.push(sales);
  }

  const hasSales = Boolean(salesValue || rawAgents.sales);

  if (!recommendation && !summary && !financeValue && !marketValue && !salesValue) return null;

  return {
    recommendation: recommendation || 'A considered recommendation is ready.',
    verdict,
    confidence: normalizeText(findValue(finalSource, ['confidence', 'confidence_score', 'confidenceScore'])),
    summary: summary || 'The analyst perspectives have been assembled into a concise decision view.',
    actions,
    marketPotential:
      normalizeDisplay(findValue(finalSource, ['market_potential', 'marketPotential', 'market_size', 'marketSize'])) ||
      normalizeDisplay(findValue(marketSource, ['market_potential', 'marketPotential', 'market_size', 'marketSize'])),
    recommendedPrice:
      normalizeDisplay(findValue(finalSource, ['recommended_price', 'recommendedPrice', 'price', 'pricing'])) ||
      normalizeDisplay(findValue(financeSource, ['recommended_price', 'recommendedPrice', 'price'])),
    estimatedMargin:
      normalizeDisplay(
        findValue(finalSource, ['estimated_margin', 'estimatedMargin', 'margin', 'margin_percent', 'marginPercent'])
      ) ||
      normalizeDisplay(
        findValue(financeSource, ['estimated_margin', 'estimatedMargin', 'margin', 'margin_percent', 'marginPercent'])
      ),
    mainRisk:
      normalizeDisplay(findValue(finalSource, ['main_risk', 'mainRisk', 'risk', 'key_risk'])) ||
      normalizeDisplay(findValue(marketSource, ['main_risk', 'mainRisk', 'risk', 'key_risk'])),
    finance,
    market,
    sales,
    hasSales,
    agents: agentsList.length > 0 ? agentsList : [finance, market],
    raw: JSON.stringify(payload, null, 2),
  };
}

function Header() {
  return (
    <header className="container-wide flex items-center justify-between py-6">
      <Link href="/" className="flex items-center gap-3 no-underline" data-testid="link-brand">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]">
          <Crosshair size={18} strokeWidth={2.5} />
        </span>
        <span className="text-[15px] font-bold tracking-[-.02em]">
          Business Launch <span className="font-normal text-[hsl(var(--muted-foreground))]">Analyst</span>
        </span>
      </Link>
      <nav className="flex items-center gap-5 text-[13px] font-medium" aria-label="Primary navigation">
        <a className="nav-link hidden sm:inline" href="#method" data-testid="link-method">
          Method
        </a>
        <Link href="/analysis" className="button-dark rounded-full px-4 py-2.5 no-underline" data-testid="link-start-analysis">
          Start an analysis <ArrowUpRight size={14} className="ml-1 inline" />
        </Link>
      </nav>
    </header>
  );
}

function Home() {
  return (
    <div className="site-shell">
      <Header />
      <main>
        <section className="hero-grid relative border-y border-[hsl(var(--border))]">
          <div className="container-wide grid min-h-[600px] items-center gap-12 py-20 lg:grid-cols-[1.05fr_.95fr] lg:py-24">
            <div className="reveal max-w-[690px]">
              <div className="eyebrow mb-6 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" /> A sharper second opinion
              </div>
              <h1 className="display max-w-[700px] text-[clamp(3.6rem,8vw,7.4rem)] leading-[.86]">
                Decide with<br />
                <em>conviction.</em>
              </h1>
              <p className="mt-8 max-w-[530px] text-[17px] leading-7 text-[hsl(var(--muted-foreground))]">
                Business Launch Analyst turns a raw business question into a clear point of view — tested through finance and market lenses, then brought together in one honest recommendation.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <Link
                  href="/analysis"
                  className="button-primary inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold no-underline"
                  data-testid="button-hero-analysis"
                >
                  Ask the analyst <ArrowUpRight size={16} />
                </Link>
                <span className="mono text-[10px] uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">
                  No decks. No filler.
                </span>
              </div>
            </div>
            <div className="reveal delay-2 relative">
              <div className="signal-card relative overflow-hidden rounded-[2px] p-7 sm:p-9">
                <div className="relative z-[1]">
                  <div className="mb-16 flex items-center justify-between">
                    <span className="mono text-[10px] uppercase tracking-[.14em] text-[hsl(42 35% 97% / .6)]">
                      Decision brief / 001
                    </span>
                    <span className="flex items-center gap-2 text-[11px] text-[hsl(42 35% 97% / .65)]">
                      <span className="pulse-dot h-2 w-2 rounded-full bg-[hsl(82 68% 69%)]" /> Live perspective
                    </span>
                  </div>
                  <p className="eyebrow !text-[hsl(82 68% 69%)]">The question</p>
                  <p className="mt-3 max-w-[360px] text-[25px] leading-8">
                    “Is this the right moment to put my next six months behind this idea?”
                  </p>
                  <div className="mt-12 grid grid-cols-2 gap-3 border-t border-[hsl(42 35% 97% / .17)] pt-5">
                    <div>
                      <p className="mono text-[10px] uppercase text-[hsl(42 35% 97% / .5)]">Finance lens</p>
                      <p className="mt-2 text-sm">Unit economics</p>
                    </div>
                    <div>
                      <p className="mono text-[10px] uppercase text-[hsl(42 35% 97% / .5)]">Market lens</p>
                      <p className="mt-2 text-sm">Demand signals</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-5 -left-5 hidden rounded-sm border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-[var(--shadow-sm)] sm:block">
                <p className="mono text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Output</p>
                <p className="mt-1 text-sm font-bold">A point of view, not a score</p>
              </div>
            </div>
          </div>
        </section>
        <section id="method" className="container-wide py-24 sm:py-32">
          <div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr]">
            <div>
              <p className="eyebrow">Why it works</p>
              <h2 className="display mt-5 text-5xl leading-[.94] sm:text-6xl">
                Clarity comes<br />
                <em>from tension.</em>
              </h2>
            </div>
            <div className="grid gap-0 border-t border-[hsl(var(--border))]">
              {[
                {
                  icon: Scale,
                  n: '01',
                  title: 'Two independent lenses',
                  copy: 'Finance asks whether the business can work. Market asks whether anyone will care. Different questions, one decision.'
                },
                {
                  icon: Network,
                  n: '02',
                  title: 'A useful disagreement',
                  copy: 'The best advice does not flatten uncertainty. It surfaces the tension so you know what to test next.'
                },
                {
                  icon: Target,
                  n: '03',
                  title: 'A clear next move',
                  copy: 'Walk away with a recommendation you can act on today — and the assumptions worth proving before you commit.'
                }
              ].map(({ icon: Icon, n, title, copy }) => (
                <div
                  key={n}
                  className="grid gap-5 border-b border-[hsl(var(--border))] py-7 sm:grid-cols-[60px_1fr_1.2fr] sm:items-start"
                >
                  <span className="mono text-xs text-[hsl(var(--accent))]">{n}</span>
                  <div className="flex items-center gap-3">
                    <Icon size={18} strokeWidth={1.6} />
                    <h3 className="font-bold">{title}</h3>
                  </div>
                  <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="bg-[hsl(var(--primary))] py-20 text-[hsl(var(--primary-foreground))] sm:py-28">
          <div className="container-wide grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-end">
            <div>
              <p className="eyebrow !text-[hsl(82 68% 69%)]">A sample output</p>
              <h2 className="display mt-5 max-w-[560px] text-5xl leading-[.95] sm:text-6xl">
                Know what to do<br />
                <em>before you build.</em>
              </h2>
            </div>
            <div className="border-l border-[hsl(42 35% 97% / .2)] pl-6 sm:pl-10">
              <p className="mono text-[10px] uppercase tracking-[.15em] text-[hsl(42 35% 97% / .5)]">Recommendation</p>
              <p className="mt-4 text-[25px] leading-8">
                “Proceed with a 30-customer pilot. Do not invest in the full product until retention clears the first-month threshold.”
              </p>
              <div className="mt-8 flex items-center gap-2 text-sm text-[hsl(82 68% 69%)]">
                <Check size={16} /> Specific enough to act on
              </div>
            </div>
          </div>
        </section>
        <section className="container-wide flex flex-col items-start justify-between gap-7 py-20 sm:flex-row sm:items-center sm:py-24">
          <div>
            <p className="eyebrow">Your next decision</p>
            <h2 className="display mt-3 text-4xl sm:text-5xl">Bring the question.</h2>
          </div>
          <Link
            href="/analysis"
            className="button-dark inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold no-underline"
            data-testid="button-bottom-analysis"
          >
            Run your analysis <ChevronRight size={16} />
          </Link>
        </section>
      </main>
      <footer className="container-wide flex flex-col gap-2 border-t border-[hsl(var(--border))] py-7 text-xs text-[hsl(var(--muted-foreground))] sm:flex-row sm:items-center sm:justify-between">
        <span>Business Launch Analyst</span>
        <span className="mono text-[10px] uppercase tracking-[.12em]">A clear head is a competitive advantage.</span>
      </footer>
    </div>
  );
}

function AgentProgress({ agent, index }: { agent: AgentResult; index: number }) {
  const getIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('finance')) return WalletCards;
    if (n.includes('market')) return BarChart3;
    if (n.includes('sales')) return Handshake;
    return Compass;
  };
  const Icon = getIcon(agent.name);
  const isDone = agent.status === 'complete' || agent.status === 'done';

  return (
    <div className="progress-line flex gap-4 pb-8" data-testid={`status-agent-${agent.name.toLowerCase()}`}>
      <span
        className={`relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isDone
            ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
            : 'border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))]'
        }`}
      >
        {isDone ? <Check size={15} /> : <Icon size={15} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold">{agent.name} perspective</p>
          <span className="mono text-[10px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">
            {isDone ? 'Done' : 'Pending'}
          </span>
        </div>
        {isDone ? (
          <div className="mt-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">{agent.summary}</p>

            {agent.strategy && (
              <div
                className="mt-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.4)] p-3.5 text-xs leading-5"
                data-testid={`text-agent-strategy-${agent.name.toLowerCase()}`}
              >
                <span className="mono font-semibold uppercase tracking-[.1em] text-[hsl(var(--accent))]">
                  Negotiation strategy:{' '}
                </span>
                <span className="text-[hsl(var(--foreground))]">{agent.strategy}</span>
              </div>
            )}

            {agent.metrics.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[hsl(var(--border))] pt-3 sm:grid-cols-4">
                {agent.metrics.map((metric) => (
                  <div key={metric.label}>
                    <p className="mono text-[9px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">
                      {metric.label}
                    </p>
                    <p
                      className="mt-1 text-sm font-semibold"
                      data-testid={`text-agent-metric-${agent.name.toLowerCase()}-${metric.label.toLowerCase().replaceAll(' ', '-')}`}
                    >
                      {metric.value}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {agent.bullets.length > 0 && (
              <ul className="mt-3 space-y-2 border-t border-[hsl(var(--border))] pt-3">
                {agent.bullets.slice(0, 4).map((bullet, itemIndex) => (
                  <li
                    className="flex gap-2 text-sm leading-5"
                    key={`${agent.name}-${itemIndex}`}
                    data-testid={`text-agent-finding-${agent.name.toLowerCase()}-${itemIndex}`}
                  >
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--accent))]" />
                    {bullet}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">No structured result returned.</p>
        )}
      </div>
    </div>
  );
}

function AnalysisReportView({ report }: { report: AnalysisReport }) {
  const resultAgents = useMemo(() => {
    if (report.agents && report.agents.length > 0) {
      return report.agents;
    }
    const list = [report.finance, report.market];
    if (report.sales) list.push(report.sales);
    return list.filter(Boolean);
  }, [report]);

  return (
    <div className="reveal mt-6 space-y-6" data-testid="section-analysis-results">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">The readout</p>
          <h2 className="display mt-2 text-4xl leading-[.92] sm:text-5xl">
            Here is the<br />
            <em>clear version.</em>
          </h2>
        </div>
        <span
          className={`mono self-start rounded-full px-3 py-1.5 text-[11px] font-bold tracking-[.13em] ${
            report.verdict === 'GO'
              ? 'bg-[hsl(82 68% 69%)] text-[hsl(var(--primary))]'
              : report.verdict === 'RETHINK'
              ? 'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]'
              : 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]'
          }`}
          data-testid="status-recommendation"
        >
          {report.verdict === 'UNKNOWN'
            ? 'REVIEW'
            : report.verdict === 'RETHINK'
            ? 'DO NOT LAUNCH'
            : report.verdict === 'WAIT'
            ? 'WAIT'
            : 'LAUNCH'}
        </span>
      </div>

      <div className="signal-card relative overflow-hidden rounded-[2px] p-6 sm:p-9">
        <div className="relative z-[1]">
          <p className="mono text-[10px] uppercase tracking-[.14em] text-[hsl(42 35% 97% / .55)]">
            Final recommendation
          </p>
          <p
            className="mt-3 max-w-[690px] text-[clamp(1.5rem,3.2vw,2.3rem)] leading-[1.18]"
            data-testid="text-final-recommendation"
          >
            {report.recommendation}
          </p>
          {report.confidence && (
            <p className="mt-5 text-sm text-[hsl(42 35% 97% / .6)]">
              Confidence: <span className="text-[hsl(82 68% 69%)]">{report.confidence}</span>
            </p>
          )}
        </div>
      </div>

      {report.summary && (
        <div className="border-l-2 border-[hsl(var(--accent))] pl-5 py-1">
          <p className="mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">
            In plain terms
          </p>
          <p className="mt-2 max-w-[700px] text-base leading-7" data-testid="text-final-summary">
            {report.summary}
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Market potential', value: report.marketPotential },
          { label: 'Recommended price', value: report.recommendedPrice },
          { label: 'Estimated margin', value: report.estimatedMargin },
          { label: 'Main risk', value: report.mainRisk }
        ].map((metric) => (
          <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4" key={metric.label}>
            <p className="mono text-[9px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">
              {metric.label}
            </p>
            <p
              className="mt-2 text-base font-semibold leading-6"
              data-testid={`text-report-metric-${metric.label.toLowerCase().replaceAll(' ', '-')}`}
            >
              {metric.value || 'Not provided'}
            </p>
          </div>
        ))}
      </div>

      <div className="pt-4">
        <p className="eyebrow mb-5">
          {resultAgents.length === 2
            ? 'Two perspectives'
            : resultAgents.length === 3
            ? 'Three perspectives'
            : `${resultAgents.length} perspectives`}
        </p>
        {resultAgents.map((agent, index) => (
          <AgentProgress agent={agent} index={index} key={agent.name} />
        ))}
      </div>

      {report.actions.length > 0 && (
        <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
          <p className="mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">
            What to do next
          </p>
          <ol className="mt-4 space-y-3">
            {report.actions.slice(0, 5).map((action, index) => (
              <li className="flex gap-3 text-sm leading-6" key={`${action}-${index}`} data-testid={`text-next-action-${index}`}>
                <span className="mono text-xs text-[hsl(var(--accent))]">0{index + 1}</span>
                <span>{action}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {report.raw && (
        <details className="text-xs text-[hsl(var(--muted-foreground))]" data-testid="details-raw-response">
          <summary className="cursor-pointer hover:text-[hsl(var(--foreground))]">View raw response</summary>
          <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-[hsl(var(--secondary))] p-4 text-[10px] leading-5">
            {report.raw}
          </pre>
        </details>
      )}
    </div>
  );
}

function Analysis() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<'idle' | 'loading' | 'error' | 'malformed'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [activeStep, setActiveStep] = useState(0);
  const [hasSalesData, setHasSalesData] = useState(false);

  const apiBase = import.meta.env.VITE_API_BASE || '';

  const negotiationKeywords = useMemo(
    () => [
      'negotiat',
      'discount',
      'deal',
      'retailer',
      'distributor',
      'wholesale',
      'bulk',
      'b2b',
      'consignment',
      'opening offer',
      'asking price',
      'floor price',
      'concession'
    ],
    []
  );

  const isSalesActive = useMemo(() => {
    return (
      hasSalesData ||
      messages.some((m) => Boolean(m.report?.hasSales || m.report?.sales)) ||
      negotiationKeywords.some((k) => query.toLowerCase().includes(k))
    );
  }, [hasSalesData, messages, query, negotiationKeywords]);

  const steps = useMemo(() => {
    if (isSalesActive) {
      return ['Frame the question', 'Ask Finance', 'Ask Market', 'Ask Sales', 'Synthesize a recommendation'];
    }
    return ['Frame the question', 'Ask Finance', 'Ask Market', 'Synthesize a recommendation'];
  }, [isSalesActive]);

  const loadingAgentNames = useMemo(() => {
    return isSalesActive ? ['Finance', 'Market', 'Sales'] : ['Finance', 'Market'];
  }, [isSalesActive]);

  const hasExistingReport = useMemo(
    () => messages.some((m) => m.type === 'result' && Boolean(m.report)),
    [messages]
  );

  const canSubmit = query.trim().length > 0 && phase !== 'loading';

  const sendQuery = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed || phase === 'loading') return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}-${Math.random()}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now()
    };

    // Full conversation history array sent on every call
    const conversationHistory: ConversationTurn[] = messages.map((m) => ({
      role: m.role,
      content: m.content
    }));

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setQuery('');
    setPhase('loading');
    setErrorMessage('');
    setActiveStep(1);

    const isNegotiation =
      negotiationKeywords.some((k) => trimmed.toLowerCase().includes(k)) ||
      conversationHistory.some((turn) => negotiationKeywords.some((k) => turn.content.toLowerCase().includes(k))) ||
      messages.some((m) => Boolean(m.report?.hasSales || m.report?.sales));

    if (isNegotiation) {
      setHasSalesData(true);
    }

    const currentStepCount = isNegotiation || isSalesActive ? 5 : 4;
    const maxLoadingStep = currentStepCount - 1;

    const timer = window.setInterval(() => {
      setActiveStep((step) => Math.min(step + 1, maxLoadingStep));
    }, 850);

    try {
      const payloadBody: { session_id?: string; history: ConversationTurn[]; query: string } = {
        session_id: sessionId || undefined,
        history: conversationHistory,
        query: trimmed
      };

      const response = await fetch(`${apiBase.replace(/\/$/, '')}/api/orchestrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBody)
      });

      if (!response.ok) {
        throw new Error(`The analyst returned a ${response.status} response.`);
      }

      const payload: Record<string, unknown> = await response.json();

      // Maintain session_id from response
      if (typeof payload.session_id === 'string' && payload.session_id) {
        setSessionId(payload.session_id);
      }

      const resType = normalizeText(payload.type);
      const isClarification =
        resType === 'clarification' ||
        (Boolean(payload.message) && !payload.report && !payload.agents && !payload.recommendation && !payload.finance);

      const hasExistingReport = messages.some((m) => m.type === 'result' && Boolean(m.report));

      if (isClarification) {
        // Clarification: show assistant chat bubble asking the question.
        // Do NOT show agent cards or a report.
        const clarificationText =
          normalizeText(payload.message) ||
          'Could you provide a few more details (e.g. estimated unit cost, selling price, target volume, or customer segment) to complete the analysis?';

        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}-${Math.random()}`,
          role: 'assistant',
          type: 'clarification',
          content: clarificationText,
          raw: JSON.stringify(payload, null, 2),
          timestamp: Date.now()
        };

        setMessages([...updatedMessages, assistantMessage]);
        setPhase('idle');
      } else if (hasExistingReport) {
        // Follow-up Turn: The initial report was already rendered.
        // Answer the follow-up question directly like a chatbot with researched insights,
        // without reloading or re-duplicating the entire report card.
        const normalized = normalizeReport(payload);
        if (normalized?.hasSales) {
          setHasSalesData(true);
        }
        const answerText =
          normalizeText(payload.message) ||
          normalized?.summary ||
          normalized?.recommendation ||
          'Here is the follow-up assessment based on your updated parameters.';

        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}-${Math.random()}`,
          role: 'assistant',
          type: 'answer',
          content: answerText,
          report: normalized,
          raw: JSON.stringify(payload, null, 2),
          timestamp: Date.now()
        };

        setMessages([...updatedMessages, assistantMessage]);
        setActiveStep(normalized?.hasSales || isNegotiation || isSalesActive ? 4 : 3);
        setPhase('idle');
      } else {
        // Initial Result: show full agent cards and final synthesized report
        const normalized = normalizeReport(payload);
        if (!normalized) {
          setPhase('malformed');
          return;
        }
        if (normalized.hasSales) {
          setHasSalesData(true);
        }

        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}-${Math.random()}`,
          role: 'assistant',
          type: 'result',
          content: normalized.recommendation || normalized.summary || 'Analysis complete.',
          report: normalized,
          raw: JSON.stringify(payload, null, 2),
          timestamp: Date.now()
        };

        setMessages([...updatedMessages, assistantMessage]);
        setActiveStep(normalized.hasSales || isNegotiation || isSalesActive ? 4 : 3);
        setPhase('idle');
      }
    } catch (error) {
      setPhase('error');
      setErrorMessage(error instanceof Error ? error.message : 'We could not reach the analyst.');
    } finally {
      window.clearInterval(timer);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendQuery(query);
  };

  const handleReset = () => {
    setMessages([]);
    setSessionId('');
    setQuery('');
    setPhase('idle');
    setErrorMessage('');
    setHasSalesData(false);
  };

  const hasClarificationPending = useMemo(() => {
    const lastMsg = messages[messages.length - 1];
    return lastMsg?.role === 'assistant' && lastMsg?.type === 'clarification';
  }, [messages]);

  return (
    <div className="site-shell">
      <Header />
      <main className="container-wide pb-24 pt-10 sm:pt-16">
        <div className="mx-auto max-w-[850px]">
          {/* Top navigation */}
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))] no-underline hover:text-[hsl(var(--foreground))]"
              data-testid="link-back-home"
            >
              ← Back to overview
            </Link>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--foreground))] hover:text-[hsl(var(--foreground))]"
                data-testid="button-new-analysis"
              >
                <RotateCcw size={12} /> Start new analysis
              </button>
            )}
          </div>

          {/* Intro block when no messages yet */}
          {messages.length === 0 && (
            <div className="reveal">
              <p className="eyebrow mt-10">Analysis room</p>
              <h1 className="display mt-4 text-[clamp(3.2rem,7vw,6.4rem)] leading-[.87]">
                What are you<br />
                <em>deciding?</em>
              </h1>
              <p className="mt-7 max-w-[590px] text-base leading-7 text-[hsl(var(--muted-foreground))]">
                Give the analyst the context you would give a sharp advisor. Include the customer, offer, price, and the decision you are stuck on.
              </p>

              <form className="reveal delay-1 mt-12" onSubmit={handleSubmit}>
                <label
                  htmlFor="business-question"
                  className="mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]"
                >
                  Your business question
                </label>
                <textarea
                  id="business-question"
                  className="analysis-textarea mt-3 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 text-lg leading-7 shadow-[var(--shadow-sm)]"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={sampleQuestion}
                  data-testid="input-business-question"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (canSubmit) sendQuery(query);
                    }
                  }}
                />
                <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <span
                    className={`text-xs ${
                      query.length > 0 && query.trim().length < 8
                        ? 'text-[hsl(var(--accent))]'
                        : 'text-[hsl(var(--muted-foreground))]'
                    }`}
                  >
                    {query.length > 0 && query.trim().length < 8
                      ? 'Add a little more context for a useful read.'
                      : 'Usually takes under a minute.'}
                  </span>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="button-primary inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
                    data-testid="button-run-analysis"
                  >
                    Run the analysis <ArrowUpRight size={16} />
                  </button>
                </div>
              </form>

              <div className="reveal delay-2 mt-20 grid gap-5 border-t border-[hsl(var(--border))] pt-6 sm:grid-cols-3">
                {[
                  { title: 'Finance', copy: 'Can the numbers hold?', Icon: WalletCards },
                  { title: 'Market', copy: 'Will people care?', Icon: BarChart3 },
                  { title: 'Recommendation', copy: 'What should you do?', Icon: Compass }
                ].map(({ title, copy, Icon }, index) => (
                  <div key={title} data-testid={`card-lens-${index}`}>
                    <Icon size={18} />
                    <p className="mt-4 font-bold">{title}</p>
                    <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{copy}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conversation Thread */}
          {messages.length > 0 && (
            <div className="mt-8 space-y-8" data-testid="chat-conversation-thread">
              {messages.map((message, idx) => (
                <div key={message.id} className="reveal">
                  {message.role === 'user' ? (
                    /* User message card */
                    <div className="flex flex-col items-end gap-2" data-testid="message-user">
                      <div className="flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                        <span className="mono uppercase tracking-[.1em]">You</span>
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]">
                          <User size={12} />
                        </span>
                      </div>
                      <div className="max-w-[85%] rounded-2xl rounded-tr-sm border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-4 text-base leading-7 shadow-[var(--shadow-sm)]">
                        {message.content}
                      </div>
                    </div>
                  ) : message.type === 'clarification' ? (
                    /* Clarification assistant chat bubble (NO agent cards or report) */
                    <div className="flex flex-col items-start gap-2" data-testid="message-clarification">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]">
                          <HelpCircle size={14} />
                        </span>
                        <span className="mono font-semibold uppercase tracking-[.1em] text-[hsl(var(--accent))]">
                          Analyst Clarification
                        </span>
                      </div>
                      <div className="w-full max-w-[90%] rounded-2xl rounded-tl-sm border-2 border-[hsl(var(--accent)/.35)] bg-[hsl(var(--card))] p-6 shadow-[var(--shadow-sm)]">
                        <p className="text-lg font-medium leading-7 text-[hsl(var(--foreground))]">
                          {message.content}
                        </p>
                        <div className="mt-4 flex items-center gap-2 border-t border-[hsl(var(--border))] pt-3 text-xs text-[hsl(var(--muted-foreground))]">
                          <MessageSquare size={13} className="text-[hsl(var(--accent))]" />
                          <span>Please reply below to proceed with the full business analysis.</span>
                        </div>
                      </div>
                    </div>
                  ) : message.type === 'answer' ? (
                    /* Follow-up answer chat bubble (Direct researched response, no giant report reload) */
                    <div className="flex flex-col items-start gap-2" data-testid="message-followup-answer">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
                          <Sparkles size={13} />
                        </span>
                        <span className="mono font-semibold uppercase tracking-[.1em] text-[hsl(var(--primary))]">
                          Analyst Response
                        </span>
                      </div>
                      <div className="w-full max-w-[90%] rounded-2xl rounded-tl-sm border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-[var(--shadow-sm)]">
                        <div className="text-base leading-7 text-[hsl(var(--foreground))] whitespace-pre-line">
                          {message.content}
                        </div>
                        {message.report && (
                          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[hsl(var(--border))] pt-3 text-xs">
                            {message.report.estimatedMargin && (
                              <span className="rounded-full bg-[hsl(var(--secondary))] px-3 py-1 font-medium text-[hsl(var(--foreground))]">
                                Margin: <strong className="font-semibold">{message.report.estimatedMargin}%</strong>
                              </span>
                            )}
                            {message.report.recommendedPrice && (
                              <span className="rounded-full bg-[hsl(var(--secondary))] px-3 py-1 font-medium text-[hsl(var(--foreground))]">
                                Price: <strong className="font-semibold">₹{message.report.recommendedPrice}</strong>
                              </span>
                            )}
                            {message.report.verdict && (
                              <span
                                className={`rounded-full px-3 py-1 font-semibold ${
                                  message.report.verdict === 'GO'
                                    ? 'bg-[hsl(82 68% 69%)] text-[hsl(var(--primary))]'
                                    : message.report.verdict === 'RETHINK'
                                    ? 'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]'
                                    : 'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]'
                                }`}
                              >
                                Verdict: {message.report.verdict === 'RETHINK' ? 'DO NOT LAUNCH' : message.report.verdict}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : message.report ? (
                    /* Initial Result assistant response (Full agent cards & report) */
                    <div className="space-y-4" data-testid="message-result">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
                          <Sparkles size={14} />
                        </span>
                        <span className="mono font-semibold uppercase tracking-[.1em] text-[hsl(var(--primary))]">
                          Analyst Assessment
                        </span>
                      </div>
                      <AnalysisReportView report={message.report} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {/* Loading status section during generation */}
          {phase === 'loading' && (
            hasExistingReport ? (
              <div className="reveal mt-6 flex flex-col items-start gap-2" data-testid="status-followup-loading">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
                    <Sparkles size={13} />
                  </span>
                  <span className="mono font-semibold uppercase tracking-[.1em] text-[hsl(var(--primary))]">
                    Analyst
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-2xl rounded-tl-sm border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-4 text-sm text-[hsl(var(--muted-foreground))] shadow-[var(--shadow-sm)]">
                  <LoaderCircle size={16} className="animate-spin text-[hsl(var(--primary))]" />
                  <span>Synthesizing perspectives for your follow-up...</span>
                </div>
              </div>
            ) : (
              <section className="reveal mt-10 border-t border-[hsl(var(--border))] pt-8" aria-live="polite">
                <p className="eyebrow">Working through the question</p>
                <div className={`mt-6 grid gap-3 ${loadingAgentNames.length > 2 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                  {loadingAgentNames.map((name, index) => {
                    const status =
                      index === 0
                        ? activeStep >= 2
                          ? 'done'
                          : activeStep === 1
                          ? 'running'
                          : 'pending'
                        : index === 1
                        ? activeStep >= 3
                          ? 'done'
                          : activeStep === 2
                          ? 'running'
                          : 'pending'
                        : activeStep >= 4
                        ? 'done'
                        : activeStep === 3
                        ? 'running'
                        : 'pending';
                    const Icon =
                      name === 'Finance'
                        ? WalletCards
                        : name === 'Market'
                        ? BarChart3
                        : Handshake;
                    return (
                      <div
                        className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
                        key={name}
                        data-testid={`status-agent-loading-${name.toLowerCase()}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                                status === 'done'
                                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                                  : 'bg-[hsl(var(--secondary))]'
                              }`}
                            >
                              {status === 'done' ? (
                                <Check size={15} />
                              ) : status === 'running' ? (
                                <LoaderCircle size={15} className="animate-spin" />
                              ) : (
                                <Icon size={15} />
                              )}
                            </span>
                            <p className="font-bold">{name}</p>
                          </div>
                          <span className="mono text-[10px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">
                            {status}
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
                          {status === 'done'
                            ? 'Perspective complete.'
                            : status === 'running'
                            ? 'Analyzing now.'
                            : 'Pending.'}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-8">
                  {steps.map((step, index) => (
                    <div className="progress-line flex gap-4 pb-8" key={step} data-testid={`status-step-${index}`}>
                      <span
                        className={`relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          index <= activeStep
                            ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                            : 'border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))]'
                        }`}
                      >
                        {index < activeStep ? (
                          <Check size={15} />
                        ) : index === activeStep ? (
                          <LoaderCircle size={15} className="animate-spin" />
                        ) : (
                          <span className="mono text-[10px]">{index + 1}</span>
                        )}
                      </span>
                      <div>
                        <p className={`font-bold ${index > activeStep ? 'text-[hsl(var(--muted-foreground))]' : ''}`}>
                          {step}
                        </p>
                        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                          {index === activeStep
                            ? 'The perspective is being assembled now.'
                            : index < activeStep
                            ? 'Done.'
                            : 'Up next.'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )
          )}

          {/* Error Message */}
          {phase === 'error' && (
            <div
              className="reveal mt-8 rounded-md border border-[hsl(var(--accent))] bg-[hsl(var(--accent)/.08)] p-6"
              role="alert"
              data-testid="status-analysis-error"
            >
              <CircleAlert size={20} className="text-[hsl(var(--accent))]" />
              <h2 className="mt-4 font-bold">The analyst could not be reached.</h2>
              <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                {errorMessage || 'Check your connection and try again.'}
              </p>
              <button
                type="button"
                className="button-dark mt-5 rounded-full px-4 py-2 text-sm font-bold"
                onClick={() => setPhase('idle')}
                data-testid="button-retry-analysis"
              >
                Try again
              </button>
            </div>
          )}

          {/* Malformed response message */}
          {phase === 'malformed' && (
            <div
              className="reveal mt-8 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
              role="alert"
              data-testid="status-analysis-malformed"
            >
              <X size={20} className="text-[hsl(var(--accent))]" />
              <h2 className="mt-4 font-bold">The response was hard to read.</h2>
              <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                The service responded, but not with enough structured detail to make a useful recommendation.
              </p>
              <button
                type="button"
                className="button-dark mt-5 rounded-full px-4 py-2 text-sm font-bold"
                onClick={() => setPhase('idle')}
                data-testid="button-retry-malformed"
              >
                Try again
              </button>
            </div>
          )}

          {/* Follow-up Reply Input Form (shown when there are messages in the thread) */}
          {messages.length > 0 && phase !== 'loading' && (
            <form onSubmit={handleSubmit} className="reveal mt-12 border-t border-[hsl(var(--border))] pt-8">
              {/* Suggested Follow-up / Reply Chips */}
              <div className="mb-4">
                <p className="mono mb-2 text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">
                  {hasClarificationPending ? 'Suggested quick responses:' : 'Suggested follow-up questions:'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(hasClarificationPending
                    ? [
                        'Unit cost is $5, selling price $18, expecting 500 units/mo in US',
                        'Manufacturing cost ₹1,200, selling at ₹2,499, targeting 1,000 units in India',
                        'Procurement cost $25, selling at $65, targeting 300 customers in UK'
                      ]
                    : [
                        'What if I lower the price by 20% to gain market share?',
                        'How can I mitigate the primary identified risk?',
                        'What if monthly sales volume doubles to 1,000 units?'
                      ]
                  ).map((suggestion, sIdx) => (
                    <button
                      key={sIdx}
                      type="button"
                      onClick={() => sendQuery(suggestion)}
                      className="group inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 py-1.5 text-xs text-[hsl(var(--muted-foreground))] transition-all hover:border-[hsl(var(--accent))] hover:bg-[hsl(var(--card))] hover:text-[hsl(var(--foreground))] hover:shadow-sm text-left"
                      data-testid={`button-suggested-followup-${sIdx}`}
                    >
                      <Sparkles size={12} className="text-[hsl(var(--accent))] group-hover:scale-110 transition-transform" />
                      <span>{suggestion}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label
                htmlFor="thread-reply-input"
                className="mono flex items-center justify-between text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]"
              >
                <span>{hasClarificationPending ? 'Your response to the analyst' : 'Ask a follow-up or provide updates'}</span>
                <span>Enter ↵ to send</span>
              </label>
              <div className="relative mt-3">
                <textarea
                  id="thread-reply-input"
                  className="analysis-textarea w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 pr-24 text-base leading-6 shadow-[var(--shadow-sm)]"
                  style={{ minHeight: '110px' }}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    hasClarificationPending
                      ? 'Type your details here...'
                      : 'Type your follow-up question here...'
                  }
                  data-testid="input-reply"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (canSubmit) sendQuery(query);
                    }
                  }}
                />
                <div className="absolute bottom-4 right-4">
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="button-primary inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40"
                    data-testid="button-send-reply"
                  >
                    <Send size={13} /> Send
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/analysis" component={Analysis} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;