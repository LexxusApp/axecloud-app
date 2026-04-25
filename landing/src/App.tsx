import { motion } from 'framer-motion';
import {
  BookOpen,
  CalendarDays,
  Check,
  Crown,
  Facebook,
  Instagram,
  MessageCircle,
  Menu,
  Package,
  Users,
  Wallet,
  Youtube,
  TrendingUp,
} from 'lucide-react';
import { cn } from './lib/utils';

/** Mesmo contato comercial do Login (`Login.tsx`) */
const WA_COMERCIAL = 'https://wa.me/5511912276156';
const CNPJ = '66.335.964/0001-07';

const nav = [
  { href: '#telas', label: 'Telas' },
  { href: '#funcionalidades', label: 'Módulos' },
  { href: '#para-quem', label: 'Para quem' },
  { href: '#planos', label: 'Planos' },
] as const;

const features = [
  {
    icon: Package,
    title: 'Almoxarifado inteligente',
    description:
      'Estoque de velas, defumadores, ervas e materiais do chão. Entradas, saídas e alertas sem planilha espalhada.',
  },
  {
    icon: Wallet,
    title: 'Financeiro transparente',
    description:
      'Mensalidades e doações com Pix, histórico e leitura clara para a diretoria. Menos dúvida, mais confiança.',
  },
  {
    icon: BookOpen,
    title: 'Portal do filho de santo',
    description:
      'Biblioteca de estudos, mural e acesso ao que importa. Calendário e presença nas giras, no mesmo fluxo do app.',
    extra: (
      <p className="mt-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-primary/90">
        <CalendarDays className="h-4 w-4 text-primary" />
        Agenda e giras integradas
      </p>
    ),
  },
] as const;

const audience = [
  {
    icon: Users,
    title: 'Zeladores e quem cuida do chão',
    text: 'Rotina, oferenda e pessoas no mesmo lugar. Menos corre-corre, mais clareza para cuidar da casa.',
  },
  {
    icon: Crown,
    title: 'Pais e mães de santo',
    text: 'Comando com profissionalismo: números e processos alinhados ao axé, não ao improviso burocrático.',
  },
  {
    icon: TrendingUp,
    title: 'Terreiro em crescimento',
    text: 'Do pequeno ao que já gira muito: escala a organização sem perder a sensibilidade com a comunidade.',
  },
] as const;

const plans = [
  {
    name: 'Pequeno',
    price: 'R$ 49,90',
    period: '/mês',
    blurb: 'Até ~25 filhos de santo',
    features: ['Almoxarifado e mural', 'Financeiro + Pix e histórico', '1 perfil de filho de santo'],
    highlight: false,
  },
  {
    name: 'Médio',
    price: 'R$ 89,90',
    period: '/mês',
    blurb: 'Até ~80 filhos de santo',
    features: ['Tudo do plano pequeno', 'Calendário e giras ativas', 'Biblioteca e comunicação com a casa'],
    highlight: true,
  },
  {
    name: 'Grande',
    price: 'R$ 119,90',
    period: '/mês',
    blurb: 'Maior volume e necessidade específica',
    features: ['Suporte dedicado', 'Múltiplas frentes e regras', 'Integração sob medida, se precisar'],
    highlight: false,
  },
] as const;

const appTelaAcessoPublica = {
  src: '/screenshots/tela-acesso-axecloud.png',
  label: 'Tela de acesso',
  desc: 'Visual de identidade (AX, É, Cloud) e fundo — o mesmo que o app apresenta ao abrir o login.',
} as const;

const appScreensLogado: { src: string; label: string; desc: string }[] = [
  { src: '/screenshots/painel-inicio.png', label: 'Início (painel)', desc: 'Resumo, números e o que a casa precisa enxergar de primeira.' },
  { src: '/screenshots/filhos-de-santo.png', label: 'Filhos de Santo', desc: 'Pessoas do terreiro, cadastros e atalhos para a rotina.' },
  { src: '/screenshots/calendario-eventos.png', label: 'Calendário e eventos', desc: 'Giras, compromissos e a agenda alinhada à casa.' },
  { src: '/screenshots/mural.png', label: 'Mural', desc: 'Comunicados e avisos visíveis para a comunidade.' },
  { src: '/screenshots/almoxarifado.png', label: 'Almoxarifado', desc: 'Estoque, materiais e tudo o que o chão consome no dia a dia.' },
  { src: '/screenshots/financeiro.png', label: 'Financeiro', desc: 'Entradas, saídas, Pix e histórico com transparência.' },
  { src: '/screenshots/biblioteca-estudo.png', label: 'Biblioteca de estudo', desc: 'Materiais e estudos acessíveis a quem precisa aprender.' },
  { src: '/screenshots/loja-axe.png', label: 'Loja do Axé', desc: 'Ofertas e itens vinculados à casa, quando a loja estiver ativa no plano.' },
];

function LogoMark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex items-baseline gap-0.5">
        <span className={cn('font-black tracking-tighter text-white', compact ? 'text-2xl' : 'text-3xl sm:text-4xl')}>
          AX
        </span>
        <span className={cn('text-primary font-black', compact ? 'text-2xl' : 'text-3xl sm:text-4xl')}>É</span>
      </div>
      <span
        className={cn(
          'font-black text-white/55 tracking-[0.28em] -mt-0.5',
          compact ? 'text-base ml-0.5' : 'text-lg sm:text-xl ml-1',
        )}
      >
        CLOUD
      </span>
    </div>
  );
}

const fade = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
} as const;

export function App() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 -z-20">
        <img
          src="https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1920&q=80"
          alt=""
          className="h-full w-full object-cover opacity-55"
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/80 to-background" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/50" />
        <div className="absolute top-1/2 left-1/2 h-[min(100vw,720px)] w-[min(100vw,720px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/8 blur-[100px]" />
        <div className="grid-faint absolute inset-0 opacity-60" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/5 bg-background/80 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <a href="#top" className="shrink-0" id="top" aria-label="AxéCloud — início">
              <LogoMark compact />
            </a>
            <nav
              className="hidden items-center gap-7 text-[11px] font-black uppercase tracking-widest text-zinc-500 md:flex"
              aria-label="Seções"
            >
              {nav.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="transition hover:text-primary"
                >
                  {l.label}
                </a>
              ))}
            </nav>
            <div className="flex items-center gap-1.5">
              <details className="relative z-[60] md:hidden" id="landing-nav">
                <summary
                  className="list-none cursor-pointer rounded-lg border border-white/10 p-2.5 text-zinc-300 transition hover:border-white/20 hover:text-white [&::-webkit-details-marker]:hidden"
                >
                  <span className="sr-only">Menu</span>
                  <Menu className="h-5 w-5" />
                </summary>
                <div className="landing-glass absolute right-0 mt-2 w-56 overflow-hidden rounded-xl p-1.5">
                  {nav.map((l) => (
                    <a
                      key={l.href}
                      href={l.href}
                      className="block rounded-lg px-3 py-2.5 text-left text-sm font-bold text-zinc-300 transition hover:bg-white/5 hover:text-white"
                      onClick={() => document.getElementById('landing-nav')?.removeAttribute('open')}
                    >
                      {l.label}
                    </a>
                  ))}
                </div>
              </details>
              <a
                href="#planos"
                className="inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2.5 text-xs font-black text-black shadow-[0_0_30px_rgba(251,188,0,0.18)] transition hover:scale-[1.02] active:scale-[0.98] sm:px-4"
              >
                Ver planos
              </a>
            </div>
        </div>
      </header>

      <main>
        <section className="relative px-4 pt-10 pb-16 sm:px-6 sm:pt-14 sm:pb-20 lg:px-8" aria-labelledby="hero-title">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="sm:max-w-xl"
              >
                <LogoMark />
              </motion.div>
              <h1
                id="hero-title"
                className="mt-6 text-2xl font-extrabold leading-snug text-white sm:text-4xl sm:leading-tight md:text-5xl"
              >
                Tecnologia a serviço do sagrado.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
                O AxéCloud é o braço direito do Zelador. Transforme a organização da sua casa com o primeiro sistema
                inteligente feito para comunidades de axé.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <a
                  href={WA_COMERCIAL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-primary py-3.5 px-6 text-sm font-black text-black shadow-[0_0_32px_rgba(251,188,0,0.22)] transition hover:scale-[1.02] active:scale-[0.99]"
                >
                  <MessageCircle className="h-5 w-5" />
                  Levar AxéCloud para meu terreiro
                </a>
                <a
                  href="#funcionalidades"
                  className="inline-flex items-center justify-center rounded-md border border-white/15 bg-white/5 py-3.5 px-6 text-sm font-bold text-zinc-200 transition hover:border-primary/30 hover:text-white"
                >
                  Conhecer o sistema
                </a>
              </div>
            </div>

            <div className="mt-12 grid gap-3 sm:grid-cols-3 sm:mt-16">
              {[
                { k: 'Almoxarifado, mural e notificações' },
                { k: 'Financeiro, Pix e histórico' },
                { k: 'Filho de santo, agenda e estudos' },
              ].map((s) => (
                <div
                  key={s.k}
                  className="rounded-xl border border-white/8 bg-elevated/50 px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-zinc-500 sm:text-center"
                >
                  {s.k}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="telas"
          className="relative border-t border-white/5 py-16 sm:py-20"
          aria-labelledby="telas-head"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <motion.div {...fade} className="mx-auto max-w-2xl text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/90">Verdade do produto</p>
              <h2 id="telas-head" className="mt-2 text-2xl font-extrabold text-white sm:text-3xl">
                Telas reais do AxéCloud
              </h2>
              <p className="mt-2 text-sm text-zinc-500 sm:text-base">
                Primeiro a tela pública de acesso; abaixo, módulos reais do painel, capturados a partir de uma
                sessão de zelador.
              </p>
            </motion.div>
            <div className="mt-10 flex flex-col gap-8">
              <motion.figure
                {...fade}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-elevated/30 shadow-2xl shadow-black/50 ring-1 ring-primary/5"
              >
                <div className="flex items-center gap-2 border-b border-white/8 bg-background/60 px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500/90" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400/90" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
                  <span className="ml-2 text-[10px] font-mono text-zinc-500">acesso.axecloud — janela ampla</span>
                </div>
                <div className="bg-[#0c0c0c] p-1 sm:p-1.5">
                  <img
                    src={appTelaAcessoPublica.src}
                    alt="Captura da tela de acesso do AxéCloud no computador, com o logo AX, É, Cloud e a floresta de fundo."
                    className="h-auto w-full rounded-lg object-cover object-top"
                    width={1400}
                    height={900}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <figcaption className="px-3 pb-3 pt-2 text-center sm:px-4 sm:text-left">
                  <span className="text-xs font-black uppercase tracking-widest text-primary">
                    {appTelaAcessoPublica.label}
                  </span>
                  <p className="mt-1 text-sm text-zinc-500">{appTelaAcessoPublica.desc}</p>
                </figcaption>
              </motion.figure>
            </div>
            <motion.div {...fade} className="mt-16">
              <p className="text-center text-[10px] font-black uppercase tracking-[0.4em] text-primary/90">Painel logado</p>
              <h3 className="mt-2 text-center text-xl font-extrabold text-white sm:text-2xl">Módulos do sistema</h3>
              <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-zinc-500">
                Cada tela abaixo corresponde a um item da barra lateral do zelador — mesma aparência que a sua equipe
                vê após o login.
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {appScreensLogado.map((shot, i) => (
                  <motion.figure
                    key={shot.src}
                    initial={fade.initial}
                    whileInView={fade.whileInView}
                    viewport={fade.viewport}
                    transition={{ ...fade.transition, delay: 0.03 * i }}
                    className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-elevated/25 shadow-lg"
                  >
                    <div className="border-b border-white/5 bg-background/50 px-2.5 py-1.5">
                      <span className="text-[10px] font-mono text-zinc-500">axecloud.app — {shot.label}</span>
                    </div>
                    <div className="bg-[#0a0a0a] p-1 sm:p-1.5">
                      <img
                        src={shot.src}
                        alt={shot.label}
                        className="h-auto w-full rounded-md object-top object-contain"
                        width={1200}
                        height={800}
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    <figcaption className="p-3 sm:p-3.5">
                      <span className="text-[11px] font-black uppercase tracking-widest text-primary">{shot.label}</span>
                      <p className="mt-0.5 text-sm text-zinc-500">{shot.desc}</p>
                    </figcaption>
                  </motion.figure>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        <section
          id="funcionalidades"
          className="relative border-t border-white/5 py-16 sm:py-20"
          aria-labelledby="feat-head"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <motion.div {...fade} className="mx-auto max-w-2xl text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/90">Dentro do app</p>
              <h2
                id="feat-head"
                className="mt-2 text-2xl font-extrabold text-white sm:text-3xl"
              >
                Tudo o que a casa gira, organizado
              </h2>
              <p className="mt-2 text-sm text-zinc-500 sm:text-base">
                Mesma linguagem do app real: módulos que a diretoria já conhece ao abrir o painel.
              </p>
            </motion.div>
            <ul className="mt-10 grid list-none gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3" role="list">
              {features.map((f, i) => (
                <motion.li
                  key={f.title}
                  {...fade}
                  transition={{ ...fade.transition, delay: 0.06 * i }}
                >
                  <div className="mystic-card h-full p-6 sm:p-7">
                    <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                      <f.icon className="h-5 w-5" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-lg font-bold text-white">{f.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-500">{f.description}</p>
                    {'extra' in f && f.extra}
                  </div>
                </motion.li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="para-quem"
          className="relative border-t border-white/5 bg-black/20 py-16 sm:py-20"
          aria-labelledby="quem-head"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 lg:items-start">
              <motion.div {...fade}>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/90">Para quem</p>
                <h2
                  id="quem-head"
                  className="mt-2 text-2xl font-extrabold text-white sm:text-3xl"
                >
                  Quem manda, quem cuida e quem cresce junto
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-zinc-500 sm:text-base">
                  A landing segue a mesma promessa do sistema: profissionalismo com respeito. Feito para quem
                  segura a casa—do zelador ao sacerdote—sem transformar a fé em burocracia.
                </p>
              </motion.div>
              <ul className="space-y-3" role="list">
                {audience.map((a, i) => (
                  <motion.li
                    key={a.title}
                    {...fade}
                    transition={{ ...fade.transition, delay: 0.05 * i }}
                    className="flex gap-4 rounded-xl border border-white/6 bg-elevated/50 p-4 sm:p-5"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-background text-primary">
                      <a.icon className="h-4 w-4" strokeWidth={1.5} />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-white sm:text-base">{a.title}</h3>
                      <p className="mt-0.5 text-sm text-zinc-500 leading-relaxed">{a.text}</p>
                    </div>
                  </motion.li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section
          id="planos"
          className="relative border-t border-white/5 py-16 sm:py-20"
          aria-labelledby="planos-head"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <motion.div {...fade} className="text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/90">Investimento</p>
              <h2 id="planos-head" className="mt-2 text-2xl font-extrabold text-white sm:text-3xl">
                Planos por porte de terreiro
              </h2>
              <p className="mt-1 text-sm text-zinc-500 sm:text-base">
                Valores por mês, por porte. O comercial alinha teste, limites reais e condições com a sua casa.
              </p>
            </motion.div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((p, i) => (
                <motion.div
                  key={p.name}
                  {...fade}
                  transition={{ ...fade.transition, delay: 0.06 * i }}
                  className={cn(
                    'relative flex flex-col rounded-2xl border p-5 sm:p-6',
                    p.highlight
                      ? 'border-primary/50 bg-gradient-to-b from-elevated to-card shadow-[0_0_0_1px_rgba(250,204,21,0.2),0_20px_50px_-20px_rgba(0,0,0,0.9)] sm:scale-[1.02] sm:z-10'
                      : 'border-white/8 bg-elevated/30',
                  )}
                >
                  {p.highlight && (
                    <span className="mb-2 inline-flex w-max rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-primary">
                      O mais comum
                    </span>
                  )}
                  <h3 className="text-lg font-bold text-white">Terreiro {p.name}</h3>
                  <p className="mt-0.5 text-xs text-zinc-500">{p.blurb}</p>
                  <div className="mt-4 flex items-baseline gap-1.5 text-white">
                    <span className="text-2xl font-black sm:text-3xl">{p.price}</span>
                    {p.period ? <span className="text-sm text-zinc-500">{p.period}</span> : null}
                  </div>
                  <ul className="mt-5 grow space-y-2 text-left text-sm text-zinc-400" role="list">
                    {p.features.map((line) => (
                      <li key={line} className="flex gap-2">
                        <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" strokeWidth={2.2} />
                        {line}
                      </li>
                    ))}
                  </ul>
                  <a
                    href={WA_COMERCIAL}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      'mt-5 inline-flex w-full items-center justify-center rounded-md py-3 text-xs font-black uppercase tracking-widest transition',
                      p.highlight
                        ? 'bg-primary text-black hover:scale-[1.02] shadow-[0_0_24px_rgba(251,188,0,0.2)]'
                        : 'border border-white/15 bg-white/5 text-zinc-200 hover:border-primary/30 hover:text-white',
                    )}
                  >
                    Negociar no WhatsApp
                  </a>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section
          className="relative border-t border-white/5 py-12 sm:py-14"
          aria-label="Fechamento"
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-600">Que o axé acompanhe</p>
            <p className="mt-3 text-lg text-zinc-300 sm:text-xl">
              Paz na casa, luz no caminho e a organização no que é sagrado. Saravá.
            </p>
            <a
              href={WA_COMERCIAL}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center justify-center gap-2 text-sm font-black text-primary transition hover:text-primary/85"
            >
              <MessageCircle className="h-4 w-4" />
              falar com o comercial
            </a>
          </div>
        </section>
      </main>

      <footer
        className="relative border-t border-white/5 py-8 sm:py-10"
        role="contentinfo"
      >
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-4 sm:flex-row sm:px-6 sm:items-start">
          <div className="text-center sm:text-left">
            <LogoMark compact />
            <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600">Landing independente do app</p>
            <p className="mt-0.5 text-[10px] text-zinc-500">
              © {new Date().getFullYear()} AxéCloud — CNPJ: {CNPJ}
            </p>
          </div>
          <ul className="flex items-center gap-2" aria-label="Redes">
            {[
              { href: 'https://instagram.com', label: 'Instagram', Icon: Instagram },
              { href: 'https://facebook.com', label: 'Facebook', Icon: Facebook },
              { href: 'https://youtube.com', label: 'YouTube', Icon: Youtube },
            ].map(({ href, label, Icon }) => (
              <li key={label}>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-zinc-500 transition hover:border-primary/30 hover:text-primary"
                  aria-label={label}
                >
                  <Icon className="h-4 w-4" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </div>
  );
}
