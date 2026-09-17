'use client'

import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import {
  Activity,
  AlertCircle,
  AudioLines,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Film,
  FolderKanban,
  Image as ImageIcon,
  Languages,
  LayoutDashboard,
  Lightbulb,
  Loader2,
  Mic2,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Video,
  Volume2,
  Wand2,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Skeleton } from '@/components/ui/skeleton'
import { Toaster } from '@/components/ui/sonner'
import { ScrollArea } from '@/components/ui/scroll-area'
import { API_ENDPOINTS, API_CATEGORIES, type ApiEndpoint } from './api-endpoints'

// ========================================================================== //
//  Types — loose shapes that mirror the VibesAI API responses
// ========================================================================== //

interface Project {
  id: string
  name: string
  thumbnailUrl?: string
  exportStatus?: string
  createdAt?: string
  updatedAt?: string
  isShared?: boolean
}
interface ProjectsResponse {
  success?: boolean
  projects: Project[]
  page?: { count: number; hasMore: boolean; nextOffset: number }
}
interface MediaItem {
  id: string
  batchId?: string
  type: string
  thumbnailUrl?: string
  fullUrl?: string
  videoUrl?: string
  imageUrl?: string
  prompt?: string
  createdAt?: string
}
interface MediaResponse {
  items: MediaItem[]
}
interface Voice {
  id: string
  name: string
  description?: string
  sample?: string
  gender?: string
  language?: string
}
interface VoicesResponse {
  voices: Voice[]
}
interface Ingredient {
  ingredientId: string
  ingredientType: string
  name?: string
  imageUri?: string
  description?: string
}
interface IngredientsResponse {
  ingredients: Ingredient[]
}
interface HealthResponse {
  status: 'healthy' | 'unhealthy'
  user?: string | null
  error?: string
}
interface MeResponse {
  id: string
  username: string
  accountStatus?: string
  roles?: string[]
  createdAt?: string
}
interface BatchContentItem {
  id: string
  type?: string
  videoUrl?: string
  imageUrl?: string
  thumbnailUrl?: string
  prompt?: string
  isLoading?: boolean
  hasError?: boolean
}
interface Batch {
  id: string
  type?: string
  prompt?: string
  isComplete?: boolean
  hasError?: boolean
  error?: string
  content?: BatchContentItem[]
  timestamp?: string
}
interface VideoGenResponse {
  batchId?: string
  batch?: { id?: string }
  id?: string
}
interface ImageGenResponse {
  success?: boolean
  data?: Array<{ url?: string; prompt?: string; imageEntId?: string }>
  updatedBatch?: Batch
  batch?: Batch
}

// ========================================================================== //
//  Fetch helper + resource hook
// ========================================================================== //

async function vibesFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const text = await res.text()
  let json: any = null
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      /* response was not JSON */
    }
  }
  if (!res.ok) {
    const msg = json?.error || `HTTP ${res.status}`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return json as T
}

function useMounted() {
  // Canonical "is this running on the client" guard without a setState-in-effect.
  return React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
}

function useVibesResource<T>(path: string | null) {
  const [state, setState] = useState<{
    data: T | null
    loading: boolean
    error: string | null
    path: string | null
    nonce: number
  }>(() => ({ data: null, loading: !!path, error: null, path, nonce: 0 }))

  // Adjust state during render when the path changes — the React-recommended
  // replacement for setState-in-effect (avoids cascading renders).
  if (state.path !== path) {
    setState({ data: null, loading: true, error: null, path, nonce: 0 })
  }

  useEffect(() => {
    if (!path) return
    let active = true
    vibesFetch<T>(path)
      .then((d) => {
        if (active) setState((s) => ({ ...s, data: d, loading: false, error: null }))
      })
      .catch((e: any) => {
        if (active) {
          setState((s) => ({
            ...s,
            data: null,
            loading: false,
            error: e?.message || 'Request failed',
          }))
        }
      })
    return () => {
      active = false
    }
  }, [path, state.nonce])

  const refresh = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null, nonce: s.nonce + 1 }))
  }, [])

  const setData = useCallback((d: T | null) => {
    setState((s) => ({ ...s, data: d }))
  }, [])

  return { data: state.data, loading: state.loading, error: state.error, refresh, setData }
}

// ========================================================================== //
//  Small shared UI primitives
// ========================================================================== //

function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin', className)} />
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-8 text-center">
      <AlertCircle className="size-8 text-rose-500" aria-hidden />
      <div>
        <p className="font-medium text-rose-600 dark:text-rose-400">Something went wrong</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="size-4" /> Try again
        </Button>
      )}
    </div>
  )
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <Skeleton className="size-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-16" />
        </div>
      </CardContent>
    </Card>
  )
}

interface StatCardProps {
  label: string
  value: number | string
  icon: LucideIcon
  tint: 'violet' | 'rose' | 'amber' | 'emerald' | 'fuchsia'
  hint?: string
}

const TINTS: Record<StatCardProps['tint'], string> = {
  violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/20',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
  fuchsia: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 ring-fuchsia-500/20',
}

function StatCard({ label, value, icon: Icon, tint, hint }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card className="overflow-hidden transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-4 p-5">
          <div className={cn('flex size-12 items-center justify-center rounded-xl ring-1', TINTS[tint])}>
            <Icon className="size-6" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tracking-tight">{value}</p>
            {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function SectionHeading({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string
  description?: string
  icon?: LucideIcon
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-5 text-violet-500" aria-hidden />}
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ========================================================================== //
//  Header + footer + theme toggle
// ========================================================================== //

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()
  const isDark = mounted && resolvedTheme === 'dark'
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {mounted && isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}

function DashboardHeader({
  health,
  me,
  onRefresh,
}: {
  health: HealthResponse | null
  me: MeResponse | null
  onRefresh: () => void
}) {
  const healthy = health?.status === 'healthy'
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 via-fuchsia-500 to-rose-500 text-white shadow-lg shadow-violet-500/20">
            <Sparkles className="size-5" aria-hidden />
          </div>
          <div className="leading-tight">
            <p className="text-base font-semibold tracking-tight">
              VibesAI <span className="text-muted-foreground">Studio</span>
            </p>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Python → TypeScript port · dashboard
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div
            className={cn(
              'hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium sm:flex',
              healthy
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400',
            )}
            title={healthy ? `Authenticated as ${health?.user ?? 'unknown'}` : health?.error || 'Unhealthy'}
          >
            <span
              className={cn(
                'size-2 rounded-full',
                healthy ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500',
              )}
            />
            {healthy ? (health?.user || 'healthy') : 'unhealthy'}
          </div>

          {me && (
            <div className="hidden text-right md:block">
              <p className="max-w-[12rem] truncate text-xs font-medium">{me.username}</p>
              <p className="text-[10px] text-muted-foreground">{me.accountStatus || 'ACTIVE'}</p>
            </div>
          )}

          <Button variant="outline" size="icon" aria-label="Refresh data" onClick={onRefresh}>
            <RefreshCw className="size-4" />
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

function DashboardFooter() {
  return (
    <footer className="mt-auto border-t bg-background/80">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          <span className="font-medium text-foreground">VibesAI</span> · Python → TypeScript port
          · {API_ENDPOINTS.length} API endpoints wired
        </p>
        <p>Built with Next.js 16 · Tailwind CSS 4 · shadcn/ui</p>
      </div>
    </footer>
  )
}

// ========================================================================== //
//  1. Overview tab
// ========================================================================== //

function OverviewSection({
  health,
  me,
  projects,
  voices,
  ingredients,
  media,
  loading,
  onJump,
}: {
  health: HealthResponse | null
  me: MeResponse | null
  projects: Project[]
  voices: Voice[]
  ingredients: Ingredient[]
  media: MediaItem[]
  loading: boolean
  onJump: (tab: string) => void
}) {
  const healthy = health?.status === 'healthy'
  return (
    <div className="space-y-6">
      {/* Health + user hero */}
      <Card className="overflow-hidden">
        <div className="relative bg-gradient-to-br from-violet-600 via-fuchsia-500 to-rose-500 p-6 text-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Activity className="size-5" aria-hidden />
                <span className="text-sm font-medium uppercase tracking-wide text-white/80">
                  System status
                </span>
              </div>
              <p className="text-2xl font-semibold">
                {healthy ? 'All systems operational' : 'Service degraded'}
              </p>
              <p className="text-sm text-white/80">
                {healthy
                  ? `Authenticated as ${health?.user ?? 'unknown'}`
                  : health?.error || 'The VibesAI backend is unreachable.'}
              </p>
            </div>
            <div className="flex items-center gap-4 rounded-xl bg-white/10 p-4 backdrop-blur">
              <div className="flex size-12 items-center justify-center rounded-full bg-white/20">
                <Volume2 className="size-6" aria-hidden />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-white/70">Account</p>
                <p className="font-semibold">{me?.username || '—'}</p>
                <p className="text-xs text-white/70">{me?.accountStatus || 'ACTIVE'}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard label="Projects" value={projects.length} icon={FolderKanban} tint="violet" hint="across workspace" />
            <StatCard label="TTS voices" value={voices.length} icon={Mic2} tint="rose" hint="PlayAI library" />
            <StatCard label="Ingredients" value={ingredients.length} icon={Lightbulb} tint="amber" hint="characters & styles" />
            <StatCard label="Media items" value={media.length} icon={Film} tint="emerald" hint="videos & images" />
          </>
        )}
      </div>

      {/* Quick links */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutDashboard className="size-5 text-violet-500" aria-hidden /> Quick actions
          </CardTitle>
          <CardDescription>Jump to the most-used parts of the dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { tab: 'generate', title: 'Generate a video', desc: 'Text → video with live polling', icon: Video, tint: 'violet' },
            { tab: 'generate', title: 'Generate an image', desc: 'Synchronous image variations', icon: ImageIcon, tint: 'rose' },
            { tab: 'projects', title: 'Manage projects', desc: 'Create, browse, inspect batches', icon: FolderKanban, tint: 'amber' },
            { tab: 'media', title: 'Media library', desc: 'All generated videos & images', icon: Film, tint: 'emerald' },
            { tab: 'voices', title: 'Text to speech', desc: '41 voices, instant synthesis', icon: AudioLines, tint: 'fuchsia' },
            { tab: 'reference', title: 'API reference', desc: 'All 33 endpoints at a glance', icon: BookOpen, tint: 'violet' },
          ].map((q) => (
            <button
              key={q.title}
              onClick={() => onJump(q.tab)}
              className="group flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:border-violet-500/40 hover:bg-violet-500/5"
            >
              <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg ring-1', TINTS[q.tint as StatCardProps['tint']])}>
                <q.icon className="size-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="font-medium">{q.title}</p>
                <p className="text-xs text-muted-foreground">{q.desc}</p>
              </div>
              <ChevronRight className="ml-auto size-4 shrink-0 self-center text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

// ========================================================================== //
//  2. Projects tab
// ========================================================================== //

function ProjectsSection({ projects, loading, onCreated }: { projects: Project[]; loading: boolean; onCreated: (p: Project) => void }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!newName.trim()) {
      toast.error('Project name is required')
      return
    }
    setCreating(true)
    try {
      const res = await vibesFetch<Project>('/api/vibes/projects', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() }),
      })
      onCreated(res)
      toast.success(`Project “${res.name}” created`)
      setNewName('')
      setDialogOpen(false)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create project')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Projects"
        description="Browse, create and inspect VibesAI projects. Click a card to reveal its generation batches."
        icon={FolderKanban}
        action={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-violet-600 text-white hover:bg-violet-700">
                <Plus className="size-4" /> Create project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a new project</DialogTitle>
                <DialogDescription>
                  Give your project a name. You can rename it later from the VibesAI workspace.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="proj-name">Project name</Label>
                <Input
                  id="proj-name"
                  placeholder="e.g. Sunset promo reel"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate()
                  }}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={creating} className="bg-violet-600 text-white hover:bg-violet-700">
                  {creating ? <Spinner className="size-4" /> : <Plus className="size-4" />}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="aspect-video w-full rounded-t-xl" />
              <CardContent className="space-y-2 p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <ErrorBanner message="No projects found. Create one to get started." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              open={openId === p.id}
              onToggle={() => setOpenId((cur) => (cur === p.id ? null : p.id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project, open, onToggle }: { project: Project; open: boolean; onToggle: () => void }) {
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      {project.thumbnailUrl ? (
        <img
          src={project.thumbnailUrl}
          alt={project.name}
          className="aspect-video w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center bg-muted">
          <FolderKanban className="size-8 text-muted-foreground" aria-hidden />
        </div>
      )}
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{project.name}</p>
            <p className="text-xs text-muted-foreground">{formatDate(project.createdAt)}</p>
          </div>
          <Badge variant="secondary" className="capitalize">
            {project.exportStatus || 'draft'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {project.isShared && <Badge variant="outline">shared</Badge>}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onToggle} aria-expanded={open}>
            {open ? 'Hide batches' : 'Show batches'}
            <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
          </Button>
        </div>
        {open && <ProjectBatches projectId={project.id} />}
      </CardContent>
    </Card>
  )
}

function ProjectBatches({ projectId }: { projectId: string }) {
  const { data, loading, error, refresh } = useVibesResource<{ batches: Batch[] }>(
    `/api/vibes/batches?limit=12&project_id=${encodeURIComponent(projectId)}`,
  )
  const batches = data?.batches || []
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Recent batches
        </p>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Refresh batches" onClick={refresh}>
          <RefreshCw className="size-3.5" />
        </Button>
      </div>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : error ? (
        <p className="text-xs text-rose-500">{error}</p>
      ) : batches.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">No batches yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {batches.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-3 rounded-md border bg-card p-2 text-xs"
            >
              <Badge
                variant="outline"
                className={cn(
                  'capitalize',
                  b.isComplete
                    ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                    : b.hasError
                      ? 'border-rose-500/30 text-rose-600 dark:text-rose-400'
                      : 'border-amber-500/30 text-amber-600 dark:text-amber-400',
                )}
              >
                {b.hasError ? 'error' : b.isComplete ? 'done' : 'pending'}
              </Badge>
              <span className="truncate font-mono text-[11px] text-muted-foreground">{b.id}</span>
              <span className="ml-auto shrink-0 text-muted-foreground">
                {b.content?.length || 0} items
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ========================================================================== //
//  3. Generate tab (video + image)
// ========================================================================== //

const ASPECT_OPTIONS = [
  { value: '9:16', label: '9:16', hint: 'Portrait', w: 9, h: 16 },
  { value: '16:9', label: '16:9', hint: 'Landscape', w: 16, h: 9 },
  { value: '1:1', label: '1:1', hint: 'Square', w: 1, h: 1 },
] as const

function GenerateSection({ projects, onProjectCreated }: { projects: Project[]; onProjectCreated: (p: Project) => void }) {
  return (
    <div className="space-y-8">
      <VideoGenerateCard projects={projects} onProjectCreated={onProjectCreated} />
      <ImageGenerateCard projects={projects} onProjectCreated={onProjectCreated} />
    </div>
  )
}

function AspectPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {ASPECT_OPTIONS.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              'flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors',
              active
                ? 'border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300'
                : 'hover:border-violet-500/40 hover:bg-violet-500/5',
            )}
          >
            <div
              className={cn(
                'rounded-sm border-2',
                active ? 'border-violet-500' : 'border-muted-foreground/40',
              )}
              style={{
                width: 26 * (opt.w >= opt.h ? 1 : opt.w / opt.h),
                height: 26 * (opt.h >= opt.w ? 1 : opt.h / opt.w),
              }}
            />
            <span className="text-xs font-medium">{opt.label}</span>
            <span className="text-[10px] text-muted-foreground">{opt.hint}</span>
          </button>
        )
      })}
    </div>
  )
}

function ProjectPicker({
  projects,
  value,
  onChange,
  onProjectCreated,
}: {
  projects: Project[]
  value: string
  onChange: (v: string) => void
  onProjectCreated: (p: Project) => void
}) {
  const [mode, setMode] = useState<'existing' | 'new'>(
    projects.length > 0 ? 'existing' : 'new',
  )
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (projects.length === 0 && mode === 'existing') setMode('new')
  }, [projects.length, mode])

  async function handleCreate() {
    if (!name.trim()) {
      toast.error('Project name is required')
      return
    }
    setCreating(true)
    try {
      const res = await vibesFetch<Project>('/api/vibes/projects', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      })
      onProjectCreated(res)
      onChange(res.id)
      setName('')
      setMode('existing')
      toast.success(`Project “${res.name}” created`)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create project')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1 rounded-lg border p-1">
        <button
          type="button"
          disabled={projects.length === 0}
          onClick={() => setMode('existing')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40',
            mode === 'existing' ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300' : 'text-muted-foreground',
          )}
        >
          Existing
        </button>
        <button
          type="button"
          onClick={() => setMode('new')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            mode === 'new' ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300' : 'text-muted-foreground',
          )}
        >
          <Plus className="size-3" /> New
        </button>
      </div>
      {mode === 'existing' ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a project…" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="flex gap-2">
          <Input
            placeholder="New project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
            }}
          />
          <Button type="button" variant="outline" onClick={handleCreate} disabled={creating}>
            {creating ? <Spinner className="size-4" /> : <Plus className="size-4" />}
            Add
          </Button>
        </div>
      )}
    </div>
  )
}

function VideoGenerateCard({ projects, onProjectCreated }: { projects: Project[]; onProjectCreated: (p: Project) => void }) {
  const [prompt, setPrompt] = useState('')
  const [aspect, setAspect] = useState<string>('9:16')
  const [resolution, setResolution] = useState<string>('480p')
  const [variations, setVariations] = useState<number>(1)
  const [projectId, setProjectId] = useState<string>(projects[0]?.id || '')

  const [submitting, setSubmitting] = useState(false)
  const [polling, setPolling] = useState(false)
  const [batch, setBatch] = useState<Batch | null>(null)

  useEffect(() => {
    if (!projectId && projects.length > 0) setProjectId(projects[0].id)
  }, [projects, projectId])

  async function handleGenerate() {
    if (!prompt.trim()) {
      toast.error('Prompt is required')
      return
    }
    if (!projectId) {
      toast.error('Select or create a project first')
      return
    }
    setSubmitting(true)
    setBatch(null)
    try {
      const res = await vibesFetch<VideoGenResponse>('/api/vibes/videos/generate', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          prompt: prompt.trim(),
          aspect_ratio: aspect,
          resolution,
          variations,
          poll: false,
        }),
      })
      const batchId = res.batchId || res.batch?.id || res.id
      if (!batchId) throw new Error('No batchId returned from server')
      setBatch({ id: batchId, isComplete: false, content: [], prompt: prompt.trim() })
      toast.success(`Generation started — batch ${batchId.slice(0, 18)}…`)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to start video generation')
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePoll() {
    if (!batch?.id) return
    setPolling(true)
    try {
      const updated = await vibesFetch<Batch>(
        `/api/vibes/batches/${batch.id}/poll?timeout=180`,
        { method: 'POST' },
      )
      setBatch(updated)
      if (updated.hasError) {
        toast.error(updated.error || 'Batch failed')
      } else if (updated.isComplete) {
        toast.success(`Batch complete — ${updated.content?.length || 0} variations ready`)
      } else {
        toast.info('Still processing — click poll again to keep waiting')
      }
    } catch (e: any) {
      toast.error(e?.message || 'Polling failed')
    } finally {
      setPolling(false)
    }
  }

  const done = batch?.content?.filter((c) => c.videoUrl).length || 0
  const total = batch?.content?.length || 0
  const progress = total > 0 ? Math.round((done / total) * 100) : batch?.isComplete ? 100 : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="size-5 text-violet-500" aria-hidden /> Generate video
        </CardTitle>
        <CardDescription>
          Submit a text-to-video job (returns instantly) then poll until the variations are ready.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        {/* Form */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="video-prompt">Prompt</Label>
            <Textarea
              id="video-prompt"
              placeholder="e.g. a serene drone shot of misty mountains at sunrise, cinematic, slow push-in"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-24"
            />
          </div>

          <div className="space-y-2">
            <Label>Aspect ratio</Label>
            <AspectPicker value={aspect} onChange={setAspect} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Resolution</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="480p">480p</SelectItem>
                  <SelectItem value="720p">720p</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                Variations <span className="text-muted-foreground">({variations})</span>
              </Label>
              <Slider
                min={1}
                max={4}
                step={1}
                value={[variations]}
                onValueChange={(v) => setVariations(v[0] ?? 1)}
                aria-label="Number of variations"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Project</Label>
            <ProjectPicker
              projects={projects}
              value={projectId}
              onChange={setProjectId}
              onProjectCreated={onProjectCreated}
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={submitting}
            className="w-full bg-violet-600 text-white hover:bg-violet-700"
            size="lg"
          >
            {submitting ? <Spinner className="size-4" /> : <Wand2 className="size-4" />}
            {submitting ? 'Starting…' : 'Generate video'}
          </Button>
        </div>

        {/* Status / result */}
        <div className="space-y-4">
          {!batch ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              <Video className="size-8 text-muted-foreground/50" aria-hidden />
              <p>Your generated variations will appear here.</p>
              <p className="text-xs">Submit a prompt to get a batch ID, then poll for completion.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
                <Badge variant="outline" className="font-mono text-[11px]">
                  {batch.id}
                </Badge>
                {batch.isComplete && (
                  <Badge className="border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3" /> complete
                  </Badge>
                )}
                {batch.hasError && (
                  <Badge className="border-transparent bg-rose-500/15 text-rose-600 dark:text-rose-400">
                    <AlertCircle className="size-3" /> error
                  </Badge>
                )}
                {!batch.isComplete && !batch.hasError && (
                  <Badge className="border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    <Clock className="size-3" /> processing
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={handlePoll}
                  disabled={polling || batch.isComplete}
                >
                  {polling ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />}
                  {polling ? 'Polling…' : 'Poll for completion'}
                </Button>
              </div>

              {batch.prompt && (
                <p className="rounded-md bg-muted/40 p-2 text-xs italic text-muted-foreground">
                  “{batch.prompt}”
                </p>
              )}

              {(total > 0 || batch.isComplete) && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span>{done}/{total} ready</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {batch.hasError && batch.error && (
                <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-600 dark:text-rose-400">
                  {batch.error}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {batch.content?.map((c) => (
                  <VideoVariationCard key={c.id} item={c} />
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function VideoVariationCard({ item }: { item: BatchContentItem }) {
  const ready = !!item.videoUrl
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {ready ? (
        <video
          src={item.videoUrl}
          poster={item.thumbnailUrl}
          controls
          playsInline
          className="aspect-video w-full bg-black object-contain"
        />
      ) : item.thumbnailUrl ? (
        <img src={item.thumbnailUrl} alt="" className="aspect-video w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center bg-muted">
          {item.isLoading ? <Spinner className="size-6 text-muted-foreground" /> : <ImageIcon className="size-6 text-muted-foreground" />}
        </div>
      )}
      <div className="flex items-center gap-2 p-2">
        <Badge variant="secondary" className="text-[10px]">video</Badge>
        <a
          href={`/api/vibes/media/${item.id}/download?type=video`}
          download
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
        >
          <Download className="size-3.5" /> Download
        </a>
      </div>
    </div>
  )
}

function ImageGenerateCard({ projects, onProjectCreated }: { projects: Project[]; onProjectCreated: (p: Project) => void }) {
  const [prompt, setPrompt] = useState('')
  const [aspect, setAspect] = useState<string>('1:1')
  const [variations, setVariations] = useState<number>(1)
  const [projectId, setProjectId] = useState<string>(projects[0]?.id || '')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ImageGenResponse | null>(null)

  useEffect(() => {
    if (!projectId && projects.length > 0) setProjectId(projects[0].id)
  }, [projects, projectId])

  async function handleGenerate() {
    if (!prompt.trim()) {
      toast.error('Prompt is required')
      return
    }
    if (!projectId) {
      toast.error('Select or create a project first')
      return
    }
    setSubmitting(true)
    setResult(null)
    try {
      const res = await vibesFetch<ImageGenResponse>('/api/vibes/images/generate', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          prompt: prompt.trim(),
          aspect_ratio: aspect,
          variations,
        }),
      })
      setResult(res)
      const count = res.data?.length || 0
      toast.success(count > 0 ? `Generated ${count} image${count > 1 ? 's' : ''}` : 'Image generated')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate image')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="size-5 text-rose-500" aria-hidden /> Generate image
        </CardTitle>
        <CardDescription>
          Synchronous image generation — variations are returned immediately, no polling required.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="image-prompt">Prompt</Label>
            <Textarea
              id="image-prompt"
              placeholder="e.g. a cozy bookshop interior, warm light, plants everywhere, film grain"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-24"
            />
          </div>
          <div className="space-y-2">
            <Label>Aspect ratio</Label>
            <AspectPicker value={aspect} onChange={setAspect} />
          </div>
          <div className="space-y-2">
            <Label>
              Variations <span className="text-muted-foreground">({variations})</span>
            </Label>
            <Slider
              min={1}
              max={4}
              step={1}
              value={[variations]}
              onValueChange={(v) => setVariations(v[0] ?? 1)}
              aria-label="Number of image variations"
            />
          </div>
          <div className="space-y-2">
            <Label>Project</Label>
            <ProjectPicker
              projects={projects}
              value={projectId}
              onChange={setProjectId}
              onProjectCreated={onProjectCreated}
            />
          </div>
          <Button
            onClick={handleGenerate}
            disabled={submitting}
            className="w-full bg-rose-600 text-white hover:bg-rose-700"
            size="lg"
          >
            {submitting ? <Spinner className="size-4" /> : <Sparkles className="size-4" />}
            {submitting ? 'Generating…' : 'Generate image'}
          </Button>
        </div>

        <div className="space-y-3">
          {!result ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              <ImageIcon className="size-8 text-muted-foreground/50" aria-hidden />
              <p>Generated images will appear here.</p>
            </div>
          ) : result.data && result.data.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {result.data.map((img, i) => (
                <div key={img.imageEntId || i} className="overflow-hidden rounded-lg border bg-card">
                  {img.url ? (
                    <a href={img.url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={img.url}
                        alt={img.prompt || `variation ${i + 1}`}
                        className="aspect-square w-full object-cover transition-transform hover:scale-105"
                        loading="lazy"
                      />
                    </a>
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-muted">
                      <ImageIcon className="size-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex items-center gap-2 p-2">
                    <Badge variant="secondary" className="text-[10px]">image</Badge>
                    <a
                      href={img.url}
                      download
                      className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:underline dark:text-rose-400"
                    >
                      <Download className="size-3.5" /> Open
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/40 p-3 text-[11px]">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ========================================================================== //
//  4. Media library tab
// ========================================================================== //

function MediaSection() {
  const [type, setType] = useState<string>('all')
  const [search, setSearch] = useState('')
  const { data, loading, error, refresh } = useVibesResource<MediaResponse>(
    `/api/vibes/media?limit=50${type !== 'all' ? `&type=${type}` : ''}`,
  )
  const items = useMemo(() => {
    const all = data?.items || []
    if (!search.trim()) return all
    const q = search.toLowerCase()
    return all.filter((m) => (m.prompt || '').toLowerCase().includes(q))
  }, [data, search])

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Media library"
        description="All generated videos and images across your workspace."
        icon={Film}
        action={
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="size-4" /> Refresh
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-1 rounded-lg border p-1">
          {['all', 'video', 'image'].map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                type === t ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300' : 'text-muted-foreground',
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            placeholder="Search prompts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="aspect-square w-full rounded-t-xl" />
              <CardContent className="space-y-2 p-3">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <ErrorBanner message={error} onRetry={refresh} />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          <Film className="size-8 text-muted-foreground/50" aria-hidden />
          <p>No media items found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((m) => (
            <MediaCard key={m.id} item={m} />
          ))}
        </div>
      )}
    </div>
  )
}

function MediaCard({ item }: { item: MediaItem }) {
  const isVideo = item.type === 'video'
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      {isVideo ? (
        item.videoUrl ? (
          <video
            src={item.videoUrl}
            poster={item.thumbnailUrl}
            controls
            playsInline
            className="aspect-square w-full bg-black object-contain"
          />
        ) : item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" className="aspect-square w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center bg-muted">
            <Film className="size-8 text-muted-foreground" />
          </div>
        )
      ) : item.imageUrl || item.thumbnailUrl ? (
        <img
          src={item.imageUrl || item.thumbnailUrl}
          alt=""
          className="aspect-square w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-muted">
          <ImageIcon className="size-8 text-muted-foreground" />
        </div>
      )}
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              'capitalize',
              isVideo
                ? 'border-violet-500/30 text-violet-600 dark:text-violet-400'
                : 'border-rose-500/30 text-rose-600 dark:text-rose-400',
            )}
          >
            {isVideo ? <Video className="size-3" /> : <ImageIcon className="size-3" />}
            {item.type}
          </Badge>
          <a
            href={`/api/vibes/media/${item.id}/download?type=${isVideo ? 'video' : 'image'}`}
            download
            className="ml-auto inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={`Download ${item.type}`}
          >
            <Download className="size-3.5" />
          </a>
        </div>
        {item.prompt && (
          <p className="line-clamp-2 text-xs text-muted-foreground" title={item.prompt}>
            {item.prompt}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground">{formatDate(item.createdAt)}</p>
      </CardContent>
    </Card>
  )
}

// ========================================================================== //
//  5. Voices & TTS tab
// ========================================================================== //

function VoicesSection({ voices, loading }: { voices: Voice[]; loading: boolean }) {
  const [selectedVoice, setSelectedVoice] = useState<string>('')
  const [text, setText] = useState('Hello from the VibesAI dashboard. This is a text-to-speech test.')
  const [synthesizing, setSynthesizing] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!selectedVoice && voices.length > 0) setSelectedVoice(voices[0].id)
  }, [voices, selectedVoice])

  const filtered = useMemo(() => {
    if (!query.trim()) return voices
    const q = query.toLowerCase()
    return voices.filter(
      (v) => v.name.toLowerCase().includes(q) || (v.description || '').toLowerCase().includes(q),
    )
  }, [voices, query])

  async function handleSynthesize() {
    if (!text.trim()) {
      toast.error('Enter some text to synthesize')
      return
    }
    if (!selectedVoice) {
      toast.error('Pick a voice first')
      return
    }
    setSynthesizing(true)
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
    }
    try {
      const res = await vibesFetch<{ audioBase64?: string; contentType?: string }>('/api/vibes/tts', {
        method: 'POST',
        body: JSON.stringify({ text: text.trim(), voice: selectedVoice, output_format: 'mp3' }),
      })
      if (!res.audioBase64) throw new Error('No audioBase64 in response')
      const bytes = Uint8Array.from(atob(res.audioBase64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: res.contentType || 'audio/mpeg' })
      setAudioUrl(URL.createObjectURL(blob))
      toast.success('Speech synthesized')
    } catch (e: any) {
      toast.error(e?.message || 'TTS failed')
    } finally {
      setSynthesizing(false)
    }
  }

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Voices & TTS"
        description={`${voices.length} PlayAI voices available. Synthesize speech and play it back instantly.`}
        icon={AudioLines}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* TTS form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic2 className="size-5 text-fuchsia-500" aria-hidden /> Synthesize speech
            </CardTitle>
            <CardDescription>Pick a voice, type your text and hit synthesize.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="voice-select">Voice</Label>
              <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a voice…" />
                </SelectTrigger>
                <SelectContent>
                  {voices.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} <span className="text-muted-foreground">· {v.id.replace('play_ai_', '')}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tts-text">Text</Label>
              <Textarea
                id="tts-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="min-h-32"
                maxLength={1000}
              />
              <p className="text-right text-xs text-muted-foreground">{text.length}/1000</p>
            </div>
            <Button
              onClick={handleSynthesize}
              disabled={synthesizing}
              className="w-full bg-fuchsia-600 text-white hover:bg-fuchsia-700"
              size="lg"
            >
              {synthesizing ? <Spinner className="size-4" /> : <Volume2 className="size-4" />}
              {synthesizing ? 'Synthesizing…' : 'Synthesize'}
            </Button>

            {audioUrl && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Result</p>
                <audio src={audioUrl} controls className="w-full" />
                <a
                  href={audioUrl}
                  download="vibesai-tts.mp3"
                  className="inline-flex items-center gap-1 text-xs font-medium text-fuchsia-600 hover:underline dark:text-fuchsia-400"
                >
                  <Download className="size-3.5" /> Download MP3
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Voice list */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Languages className="size-5 text-rose-500" aria-hidden /> Voice library
            </CardTitle>
            <CardDescription>{voices.length} voices across languages and styles.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                placeholder="Search voices…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <ScrollArea className="max-h-96 rounded-lg border">
              {loading ? (
                <div className="space-y-2 p-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <ul className="divide-y">
                  {filtered.map((v) => (
                    <li
                      key={v.id}
                      className={cn(
                        'flex items-center gap-3 p-3 transition-colors hover:bg-accent',
                        selectedVoice === v.id && 'bg-fuchsia-500/10',
                      )}
                    >
                      <button
                        onClick={() => setSelectedVoice(v.id)}
                        className="flex flex-1 items-center gap-3 text-left"
                      >
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500/20 to-rose-500/20 text-fuchsia-600 dark:text-fuchsia-400">
                          <Mic2 className="size-4" aria-hidden />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{v.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {v.description || v.id}
                          </p>
                        </div>
                      </button>
                      {selectedVoice === v.id && <CheckCircle2 className="size-4 shrink-0 text-fuchsia-500" aria-hidden />}
                    </li>
                  ))}
                  {filtered.length === 0 && (
                    <li className="p-6 text-center text-sm text-muted-foreground">No voices match.</li>
                  )}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ========================================================================== //
//  6. API reference tab
// ========================================================================== //

const METHOD_STYLES: Record<ApiEndpoint['method'], string> = {
  GET: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  POST: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  PUT: 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400',
  DELETE: 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400',
}

function ApiReferenceSection() {
  const [category, setCategory] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return API_ENDPOINTS.filter((e) => {
      if (category !== 'all' && e.category !== category) return false
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return (
        e.path.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
      )
    })
  }, [category, query])

  async function copyRow(ep: ApiEndpoint) {
    try {
      await navigator.clipboard.writeText(ep.path)
      setCopied(ep.path)
      toast.success(`Copied ${ep.method} ${ep.path}`)
      setTimeout(() => setCopied((c) => (c === ep.path ? null : c)), 1800)
    } catch {
      toast.error('Clipboard not available')
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        title="API reference"
        description={`All ${API_ENDPOINTS.length} VibesAI endpoints wired under /api/vibes. Click any row to copy its path.`}
        icon={BookOpen}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {API_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            placeholder="Search endpoints…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Badge variant="secondary" className="h-9 self-end px-3">
          {filtered.length} of {API_ENDPOINTS.length}
        </Badge>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="hidden grid-cols-[80px_1fr_120px] gap-2 border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid md:grid-cols-[80px_1fr_160px_1.5fr]">
          <span>Method</span>
          <span>Path</span>
          <span className="hidden md:block">Category</span>
          <span>Description</span>
        </div>
        <ul className="divide-y">
          {filtered.map((ep) => (
            <li
              key={`${ep.method}-${ep.path}`}
              onClick={() => copyRow(ep)}
              className="grid cursor-pointer grid-cols-[80px_1fr] items-center gap-2 px-4 py-3 transition-colors hover:bg-accent sm:grid-cols-[80px_1fr_120px] md:grid-cols-[80px_1fr_160px_1.5fr]"
            >
              <Badge variant="outline" className={cn('w-fit justify-center font-mono text-[10px]', METHOD_STYLES[ep.method])}>
                {ep.method}
              </Badge>
              <div className="flex min-w-0 items-center gap-2">
                <code className="truncate font-mono text-xs">{ep.path}</code>
                {copied === ep.path ? (
                  <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" aria-hidden />
                ) : (
                  <Copy className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </div>
              <span className="hidden text-xs text-muted-foreground sm:block md:order-none">
                {ep.category}
              </span>
              <span className="col-span-2 hidden text-xs text-muted-foreground md:col-span-1 md:col-start-4 md:block">
                {ep.description}
              </span>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="p-8 text-center text-sm text-muted-foreground">No endpoints match your filters.</li>
          )}
        </ul>
      </div>
    </div>
  )
}

// ========================================================================== //
//  Main dashboard
// ========================================================================== //

export function VibesDashboard() {
  const [tab, setTab] = useState('overview')

  const health = useVibesResource<HealthResponse>('/api/vibes/health')
  const me = useVibesResource<MeResponse>('/api/vibes/me')
  const projects = useVibesResource<ProjectsResponse>('/api/vibes/projects?limit=50')
  const voices = useVibesResource<VoicesResponse>('/api/vibes/voices')
  const ingredients = useVibesResource<IngredientsResponse>('/api/vibes/ingredients?limit=50')
  const media = useVibesResource<MediaResponse>('/api/vibes/media?limit=50')

  const refreshAll = useCallback(() => {
    health.refresh()
    me.refresh()
    projects.refresh()
    voices.refresh()
    ingredients.refresh()
    media.refresh()
  }, [health, me, projects, voices, ingredients, media])

  const projectList = projects.data?.projects || []
  const voiceList = voices.data?.voices || []
  const ingredientList = ingredients.data?.ingredients || []
  const mediaList = media.data?.items || []

  const onProjectCreated = useCallback(
    (p: Project) => {
      projects.setData({ ...(projects.data as ProjectsResponse | null), projects: [p, ...(projects.data?.projects || [])] } as ProjectsResponse)
    },
    [projects],
  )

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <DashboardHeader health={health.data} me={me.data} onRefresh={refreshAll} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Tabs value={tab} onValueChange={setTab} className="gap-6">
          <nav aria-label="Dashboard sections">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
              <TabsTrigger value="overview" className="gap-1.5">
                <LayoutDashboard className="size-4" /> Overview
              </TabsTrigger>
              <TabsTrigger value="projects" className="gap-1.5">
                <FolderKanban className="size-4" /> Projects
              </TabsTrigger>
              <TabsTrigger value="generate" className="gap-1.5">
                <Wand2 className="size-4" /> Generate
              </TabsTrigger>
              <TabsTrigger value="media" className="gap-1.5">
                <Film className="size-4" /> Media
              </TabsTrigger>
              <TabsTrigger value="voices" className="gap-1.5">
                <AudioLines className="size-4" /> Voices
              </TabsTrigger>
              <TabsTrigger value="reference" className="gap-1.5">
                <BookOpen className="size-4" /> API
              </TabsTrigger>
            </TabsList>
          </nav>

          <TabsContent value="overview">
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              <OverviewSection
                health={health.data}
                me={me.data}
                projects={projectList}
                voices={voiceList}
                ingredients={ingredientList}
                media={mediaList}
                loading={health.loading || projects.loading || voices.loading || ingredients.loading || media.loading}
                onJump={setTab}
              />
            </motion.div>
          </TabsContent>

          <TabsContent value="projects">
            <ProjectsSection projects={projectList} loading={projects.loading} onCreated={onProjectCreated} />
          </TabsContent>

          <TabsContent value="generate">
            <GenerateSection projects={projectList} onProjectCreated={onProjectCreated} />
          </TabsContent>

          <TabsContent value="media">
            <MediaSection />
          </TabsContent>

          <TabsContent value="voices">
            <VoicesSection voices={voiceList} loading={voices.loading} />
          </TabsContent>

          <TabsContent value="reference">
            <ApiReferenceSection />
          </TabsContent>
        </Tabs>
      </main>

      <DashboardFooter />
      <Toaster richColors closeButton position="bottom-right" />
    </div>
  )
}
