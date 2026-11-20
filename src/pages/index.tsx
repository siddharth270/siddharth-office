/**
 * Landing page — STATIC (no providers, no auth fetch, no websocket) and
 * prerendered at build so crawlers and link previews read real content.
 * The live office is behind the link at /home.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { seo } from '../seo'

const DESKS = [
  {
    name: 'Siddharth',
    role: 'Front desk',
    body: 'My AI twin. Ask about my experience, projects, publications, or what I do outside of code. It answers from my resume, not from guesses.',
  },
  {
    name: 'Project agents',
    role: 'One per repo',
    body: 'Each desk works on one of my GitHub repos. Ask how it works or what changed this week — they read the README, the code and recent commits live.',
  },
  {
    name: 'Research desks',
    role: 'One per paper',
    body: 'Two agents look after my peer-reviewed papers on finding untagged places with NLP and geospatial clustering. Ask what they found and how.',
  },
  {
    name: 'Other visitors',
    role: 'Live',
    body: "Everyone in the office is on the same floor. You'll see other people walk around, and every agent visibly reads, types and answers in real time.",
  },
]

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="office-room min-h-screen px-6 py-16 text-foreground">
        <main className="mx-auto flex max-w-3xl flex-col gap-14">
          <header className="flex flex-col gap-5">
            <p className="font-pixel text-[13px] text-primary">Siddharth&apos;s Office</p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              A tiny pixel office where AI agents work on my projects. Walk in and ask them anything.
            </h1>
            <p className="max-w-xl text-[17px] leading-relaxed text-muted-foreground">
              Instead of a resume PDF and a list of links: a room. Each character is an agent with live
              access to one of my repositories, and the one at the front desk knows my background.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                to="/home"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Walk into the office →
              </Link>
              <span className="text-[13px] text-muted-foreground">Look around freely · sign in to chat</span>
            </div>
          </header>

          <section aria-labelledby="who" className="flex flex-col gap-5">
            <h2 id="who" className="font-pixel text-[13px] text-muted-foreground">
              Who&apos;s in the room
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {DESKS.map((d) => (
                <li key={d.name} className="rounded-lg border border-border bg-card/60 p-4">
                  <p className="text-[15px] font-medium">{d.name}</p>
                  <p className="mb-2 text-[12px] text-primary">{d.role}</p>
                  <p className="text-[14px] leading-relaxed text-muted-foreground">{d.body}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="how" className="flex flex-col gap-3">
            <h2 id="how" className="font-pixel text-[13px] text-muted-foreground">
              How the characters know what they&apos;re doing
            </h2>
            <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              Every animation comes from the agent&apos;s real response stream. When it calls a tool you see it
              reading (&ldquo;reading README&rdquo;, &ldquo;checking notes&rdquo;); when text streams back it types; when
              the turn ends it says so. Nothing is faked with timers, and everyone in the room sees the
              same thing at the same moment.
            </p>
          </section>

          <footer className="border-t border-border pt-6 text-[12px] text-muted-foreground">
            Built on DeepSpace · source on{' '}
            <a className="underline underline-offset-2 hover:text-foreground" href="https://github.com/siddharth270/siddharth-office">
              GitHub
            </a>
          </footer>
        </main>
      </div>
    </>
  )
}
