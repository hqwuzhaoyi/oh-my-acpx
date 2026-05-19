import type { CSSProperties } from 'react';
import { Activity, Braces, CheckCircle2, GitBranch, MonitorCog, Route, Sparkles } from 'lucide-react';

const agents = [
  {
    name: 'gemini',
    role: 'deep',
    status: 'Foundation owner',
    accent: '#0f9b8e',
    metric: 'Project setup',
    description: 'Owns package metadata, TypeScript settings, HTML shell, and React entrypoint files.',
  },
  {
    name: 'qoder',
    role: 'visual',
    status: 'UI owner',
    accent: '#f05d23',
    metric: 'Interface build',
    description: 'Owns the React surface, layout, visual hierarchy, and responsive presentation.',
  },
  {
    name: 'claude',
    role: 'deep',
    status: 'Documentation owner',
    accent: '#b65f1f',
    metric: 'Run notes',
    description: 'Owns usage notes and coordination context for the generated example application.',
  },
];

const timeline = ['gemini foundation', 'qoder interface', 'claude notes', 'host verification'];

export function App() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="page-title">
        <div className="heroCopy">
          <p className="eyebrow"><Route size={16} /> Split OMA plan</p>
          <h1 id="page-title">Agent routing desk</h1>
          <p className="lede">
            A compact React workspace generated from separate OMA Auxiliary Tasks with explicit agent ownership.
          </p>
        </div>
        <div className="statusPanel" aria-label="Current execution status">
          <div className="statusTopline">
            <Activity size={18} />
            <span>Current route</span>
          </div>
          <strong>examples/oma-react-app</strong>
          <p>gemini + qoder + claude</p>
        </div>
      </section>

      <section className="board" aria-label="Approved agents and ownership">
        {agents.map((agent) => (
          <article
            className="agentCard"
            key={agent.name}
            style={{ '--accent': agent.accent } as CSSProperties}
          >
            <div className="cardHeader">
              <span className="agentMark"><MonitorCog size={20} /></span>
              <span className="rolePill">{agent.role}</span>
            </div>
            <h2>{agent.name}</h2>
            <p>{agent.description}</p>
            <div className="cardFooter">
              <span>{agent.metric}</span>
              <strong>{agent.status}</strong>
            </div>
          </article>
        ))}
      </section>

      <section className="lowerGrid">
        <div className="workflow" aria-label="OMA workflow">
          <div className="sectionTitle">
            <GitBranch size={18} />
            <h2>Task flow</h2>
          </div>
          <ol>
            {timeline.map((step, index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{step}</strong>
              </li>
            ))}
          </ol>
        </div>

        <div className="artifact" aria-label="Return contract">
          <div className="sectionTitle">
            <Braces size={18} />
            <h2>Return contract</h2>
          </div>
          <div className="contractLine"><CheckCircle2 size={18} /> task status: completed</div>
          <div className="contractLine"><Sparkles size={18} /> verdict: provisional_accept</div>
          <div className="contractLine"><Route size={18} /> hostPlanComplete: false</div>
        </div>
      </section>
    </main>
  );
}
