import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import Link from 'next/link'
import { Sparkles, ArrowRight, Layers, MessageSquare, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default async function HomePage() {
  const { userId } = await auth()
  if (userId) redirect('/app')

  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A0B]">
      <header className="flex items-center justify-between px-8 py-5 border-b border-[#27272A]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#E8D5B0]" />
          <span className="font-serif italic text-xl text-[#FAFAF9]">Olivia</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sign-in">
            <Button variant="ghost" className="text-[#71717A] hover:text-[#FAFAF9] text-sm">
              Sign in
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button className="bg-[#E8D5B0] hover:bg-[#F5E6C8] text-[#0A0A0B] text-sm font-medium">
              Get started
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#27272A] text-xs text-[#71717A] mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4ADE80] animate-pulse" />
          AI-powered · No design skills needed
        </div>

        <h1 className="text-5xl md:text-7xl font-serif italic text-[#FAFAF9] tracking-tight leading-tight max-w-3xl mb-6">
          Stunning product ads,{' '}
          <span className="text-[#E8D5B0]">in seconds</span>
        </h1>

        <p className="text-lg text-[#71717A] max-w-xl mb-10 leading-relaxed">
          Upload your product image. Our AI removes the background, generates professional scenes,
          and writes ad copy — all on a fully editable canvas.
        </p>

        <div className="flex items-center gap-4">
          <Link href="/sign-up">
            <Button className="h-12 px-8 bg-[#E8D5B0] hover:bg-[#F5E6C8] text-[#0A0A0B] font-medium gap-2">
              Start creating
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24 max-w-3xl w-full">
          {[
            {
              icon: <Layers className="w-5 h-5 text-[#E8D5B0]" />,
              title: 'Canvas editor',
              desc: 'Layers, drag/resize/rotate, undo/redo, multi-format export',
            },
            {
              icon: <Sparkles className="w-5 h-5 text-[#E8D5B0]" />,
              title: 'Agentic AI',
              desc: 'Auto-detects your product, suggests backgrounds, picks the right model',
            },
            {
              icon: <MessageSquare className="w-5 h-5 text-[#E8D5B0]" />,
              title: 'Chat iterations',
              desc: '"Make it warmer", "add a headline" — streamed responses, instant updates',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="flex flex-col gap-3 p-6 rounded-xl bg-[#111113] border border-[#27272A] text-left"
            >
              <div className="p-2.5 rounded-lg bg-[#1A1A1D] w-fit">{f.icon}</div>
              <h3 className="text-sm font-semibold text-[#FAFAF9]">{f.title}</h3>
              <p className="text-xs text-[#71717A] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="py-8 text-center border-t border-[#27272A]">
        <p className="text-xs text-[#71717A]">
          Built for the Olivia take-home challenge · 48-hour sprint
        </p>
      </footer>
    </div>
  )
}
