import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  Clipboard,
  Code2,
  Copy,
  Crosshair,
  FileCode2,
  FileImage,
  FileJson,
  FilePlus2,
  Image as ImageIcon,
  Layers3,
  LayoutGrid,
  Menu,
  MousePointer2,
  Palette,
  PanelLeft,
  RefreshCw,
  ScanSearch,
  Smartphone,
  Sparkles,
  Type,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react';

type ViewId = 'overview' | 'colors' | 'typography' | 'layout' | 'components' | 'responsive' | 'recreate';
type AppStatus = 'empty' | 'analyzing' | 'ready' | 'error';
type ColorToken = { hex: string; rgb: string; share: number; name: string };
type Region = {
  id: string; label: string; role: string; x: number; y: number; w: number; h: number;
  color: string; confidence: number; properties: { label: string; value: string }[];
};
type Analysis = {
  fileName: string; fileSize: number; fileType: string; width: number; height: number;
  aspectRatio: string; luminance: number; contrast: number; darkPixels: number;
  colors: ColorToken[]; regions: Region[]; dataUrl: string; analyzedAt: string;
};

const VIEWS: { id: ViewId; label: string; icon: typeof Palette; caption: string }[] = [
  { id: 'overview', label: 'Overview', icon: ScanSearch, caption: 'Signal at a glance' },
  { id: 'colors', label: 'Colors', icon: Palette, caption: 'Chromatic system' },
  { id: 'typography', label: 'Typography', icon: Type, caption: 'Type direction' },
  { id: 'layout', label: 'Layout', icon: LayoutGrid, caption: 'Spatial rhythm' },
  { id: 'components', label: 'Components', icon: Layers3, caption: 'Pattern inventory' },
  { id: 'responsive', label: 'Responsive', icon: Smartphone, caption: 'Breakpoint notes' },
  { id: 'recreate', label: 'Recreate', icon: Code2, caption: 'Build sequence' },
];

const FALLBACK_COLORS = [
  { hex: '#0F172A', rgb: '15, 23, 42', share: 29, name: 'Ink' },
  { hex: '#F8FAFC', rgb: '248, 250, 252', share: 24, name: 'Canvas' },
  { hex: '#14B8A6', rgb: '20, 184, 166', share: 18, name: 'Signal' },
  { hex: '#F59E0B', rgb: '245, 158, 11', share: 14, name: 'Accent' },
  { hex: '#64748B', rgb: '100, 116, 139', share: 9, name: 'Muted' },
];

function bytesToSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function colorName(hex: string, index: number) {
  const names = ['Primary ink', 'Surface', 'Signal', 'Highlight', 'Secondary', 'Quiet tone'];
  return names[index] ?? `Token ${index + 1}`;
}

function luminanceFor(r: number, g: number, b: number) {
  const values = [r, g, b].map((value) => value / 255).map((value) => value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function canvasAnalysis(file: File, dataUrl: string) {
  return new Promise<Analysis>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        const scale = Math.min(1, 1000 / Math.max(width, height));
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Canvas analysis is unavailable in this browser.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const buckets = new Map<string, number>();
        let luminanceTotal = 0;
        let darkCount = 0;
        const stride = Math.max(4, Math.floor(pixels.length / 12000 / 4) * 4);
        let sampleCount = 0;
        for (let i = 0; i < pixels.length; i += stride) {
          const r = pixels[i]; const g = pixels[i + 1]; const b = pixels[i + 2]; const a = pixels[i + 3];
          if (a < 80) continue;
          const qr = Math.round(r / 32) * 32;
          const qg = Math.round(g / 32) * 32;
          const qb = Math.round(b / 32) * 32;
          const key = `${clamp(qr, 0, 255)},${clamp(qg, 0, 255)},${clamp(qb, 0, 255)}`;
          buckets.set(key, (buckets.get(key) ?? 0) + 1);
          const lum = luminanceFor(r, g, b);
          luminanceTotal += lum;
          if (lum < 0.35) darkCount += 1;
          sampleCount += 1;
        }
        const sorted = Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
        const colors = sorted.map(([key, count], index) => {
          const [r, g, b] = key.split(',').map(Number);
          return { hex: rgbToHex(r, g, b), rgb: `${r}, ${g}, ${b}`, share: Math.round((count / Math.max(1, sampleCount)) * 100), name: colorName(key, index) };
        });
        const average = luminanceTotal / Math.max(1, sampleCount);
        const contrast = Math.max(1.1, (1.05 / (average + 0.05)));
        const columns = width / height > 1.15 ? 3 : 2;
        const regions: Region[] = Array.from({ length: columns * 2 }, (_, index) => {
          const row = Math.floor(index / columns);
          const column = index % columns;
          const regionWidth = 100 / columns;
          const regionHeight = 48;
          const sample = colors[index % Math.max(1, colors.length)]?.hex ?? '#64748B';
          const labels = ['Navigation', 'Hero / focal', 'Content group', 'Utility rail', 'Action cluster', 'Footer signal'];
          return {
            id: `region-${index + 1}`, label: labels[index], role: index === 1 ? 'Focal area' : index % 2 ? 'Content group' : 'Interface chrome',
            x: column * regionWidth + 3, y: row * 50 + 3, w: regionWidth - 6, h: regionHeight - 6, color: sample, confidence: clamp(91 - index * 6, 58, 91),
            properties: [
              { label: 'Estimated bounds', value: `${Math.round(width * (regionWidth / 100))} × ${Math.round(height * 0.48)} px` },
              { label: 'Sampled tone', value: sample },
              { label: 'Position', value: `${Math.round(column * regionWidth)}% / ${Math.round(row * 50)}%` },
            ],
          };
        });
        resolve({
          fileName: file.name, fileSize: file.size, fileType: file.type, width, height,
          aspectRatio: `${(width / height).toFixed(2)}:1`, luminance: Math.round(average * 100) / 100,
          contrast: Math.round(contrast * 10) / 10, darkPixels: Math.round((darkCount / Math.max(1, sampleCount)) * 100),
          colors: colors.length ? colors : FALLBACK_COLORS, regions, dataUrl, analyzedAt: new Date().toISOString(),
        });
      } catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error('The image could not be decoded. Try exporting it as PNG, JPG, or WebP.'));
    image.src = dataUrl;
  });
}

function App() {
  const [analysis, setAnalysis] = useState<Analysis | null>(() => {
    try { const saved = localStorage.getItem('colorforge.latest-analysis'); return saved ? JSON.parse(saved) as Analysis : null; } catch { return null; }
  });
  const [status, setStatus] = useState<AppStatus>(() => analysis ? 'ready' : 'empty');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [view, setView] = useState<ViewId>('overview');
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [toast, setToast] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => analysis?.regions.find((region) => region.id === selectedRegion) ?? analysis?.regions[0], [analysis, selectedRegion]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = (message: string) => setToast(message);

  const runAnalysis = async (file: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Unsupported file. Choose a PNG, JPG, or WebP image.');
      setStatus('error');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('That image is larger than 15 MB. Use a compressed export and try again.');
      setStatus('error');
      return;
    }
    setError('');
    setStatus('analyzing');
    setProgress(8);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read this file.'));
        reader.readAsDataURL(file);
      });
      setProgress(32);
      await new Promise((resolve) => window.setTimeout(resolve, 260));
      setProgress(58);
      const result = await canvasAnalysis(file, dataUrl);
      setProgress(82);
      await new Promise((resolve) => window.setTimeout(resolve, 360));
      setProgress(100);
      setAnalysis(result);
      setSelectedRegion(null);
      setView('overview');
      setStatus('ready');
      localStorage.setItem('colorforge.latest-analysis', JSON.stringify(result));
      notify('Analysis complete — report saved locally.');
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : 'Analysis failed unexpectedly.');
      setStatus('error');
    }
  };

  const handleFile = (file?: File) => { if (file) void runAnalysis(file); };
  const reset = () => {
    setAnalysis(null); setStatus('empty'); setProgress(0); setError(''); setSelectedRegion(null); setView('overview');
    localStorage.removeItem('colorforge.latest-analysis');
    if (inputRef.current) inputRef.current.value = '';
  };
  const copyText = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); notify(`${label} copied to clipboard.`); } catch { notify('Copy unavailable in this browser.'); }
  };
  const download = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
    notify(`${filename} downloaded.`);
  };
  const exportJson = () => analysis && download(JSON.stringify(analysis, null, 2), 'colorforge-report.json', 'application/json');
  const cssVariables = analysis ? `:root {\n${analysis.colors.map((color, index) => `  --cf-color-${index + 1}: ${color.hex};`).join('\n')}\n  --cf-luminance: ${analysis.luminance};\n}` : '';
  const tailwindConfig = analysis ? `export default {\n  theme: {\n    extend: {\n      colors: {\n${analysis.colors.map((color, index) => `        forge${index + 1}: '${color.hex}',`).join('\n')}\n      },\n    },\n  },\n};` : '';

  return (
    <div className="noise min-h-[100dvh] bg-background text-foreground">
      <header className="flex h-[68px] items-center justify-between border-b border-sidebar-border bg-sidebar px-5 text-sidebar-foreground md:hidden">
        <Logo compact />
        <button data-testid="button-mobile-nav" onClick={() => setMobileNav((open) => !open)} className="rounded-md p-2 hover:bg-white/10" aria-label="Toggle navigation">
          {mobileNav ? <X size={19} /> : <Menu size={19} />}
        </button>
      </header>
      <div className="flex min-h-[calc(100dvh-68px)] md:min-h-[100dvh]">
        <aside className={`${mobileNav ? 'block' : 'hidden'} absolute inset-x-0 top-[68px] z-40 min-h-[calc(100dvh-68px)] bg-sidebar md:relative md:top-0 md:block md:w-[248px] md:shrink-0`}>
          <div className="flex h-full flex-col px-4 py-5">
            <div className="hidden px-2 md:block"><Logo /></div>
            <div className="mb-5 mt-9 flex items-center gap-2 border-y border-white/10 px-2 py-3 md:mt-10">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sidebar"><Crosshair size={17} strokeWidth={2.5} /></div>
              <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-white/45">Workspace</p><p className="text-sm font-semibold">Untitled reference</p></div>
              <ChevronDown size={14} className="ml-auto text-white/35" />
            </div>
            <p className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[.18em] text-white/35">Report sections</p>
            <nav className="space-y-1">
              {VIEWS.map((item) => {
                const Icon = item.icon; const active = view === item.id;
                return <button key={item.id} data-testid={`nav-${item.id}`} onClick={() => { setView(item.id); setMobileNav(false); }} disabled={!analysis && item.id !== 'overview'} className={`group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors ${active ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-40`}>
                  <Icon size={16} className={active ? 'text-accent' : 'text-white/45'} /><span className="text-sm">{item.label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}
                </button>;
              })}
            </nav>
            <div className="mt-auto space-y-3">
              {analysis && <div className="rounded-md border border-white/10 bg-white/[.04] p-3"><div className="mb-2 flex items-center gap-2 text-[11px] text-white/50"><FileImage size={13} /> Latest capture</div><p className="truncate text-xs text-white/85">{analysis.fileName}</p><p className="mt-1 font-mono text-[10px] text-white/35">{analysis.width} × {analysis.height} / {bytesToSize(analysis.fileSize)}</p></div>}
              <button data-testid="button-new-analysis-sidebar" onClick={reset} className="flex w-full items-center justify-center gap-2 rounded-md border border-white/15 px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/10"><FilePlus2 size={14} /> New analysis</button>
              <p className="flex items-center gap-2 px-2 font-mono text-[10px] text-white/30"><Zap size={11} className="text-accent" /> Runs entirely in your browser</p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="flex h-[68px] items-center justify-between border-b border-border bg-card/75 px-5 backdrop-blur md:px-8">
            <div className="flex items-center gap-2 text-sm"><PanelLeft size={16} className="text-muted-foreground" /><span className="text-muted-foreground">ColorForge</span><span className="text-border">/</span><span className="font-medium">{analysis?.fileName ?? 'New analysis'}</span></div>
            <div className="flex items-center gap-2">
              {analysis && <><button data-testid="button-export-json" onClick={exportJson} className="hidden items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold transition-colors hover:border-primary/50 sm:flex"><FileJson size={14} /> Export JSON</button><button data-testid="button-reset-analysis" onClick={reset} className="flex items-center gap-2 rounded-md bg-sidebar px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-sidebar/90"><RefreshCw size={13} /> <span className="hidden sm:inline">Start over</span></button></>}
              {!analysis && <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Local mode</div>}
            </div>
          </div>

          <div className="mx-auto max-w-[1440px] px-5 py-7 md:px-8 md:py-9">
            {status === 'empty' && <EmptyState onFile={handleFile} inputRef={inputRef} dragActive={dragActive} setDragActive={setDragActive} />}
            {status === 'error' && <ErrorState message={error} onReset={reset} onFile={handleFile} inputRef={inputRef} />}
            {status === 'analyzing' && <AnalysisProgress progress={progress} />}
            {status === 'ready' && analysis && <Report analysis={analysis} view={view} setView={setView} selected={selected} selectRegion={setSelectedRegion} copyText={copyText} download={download} cssVariables={cssVariables} tailwindConfig={tailwindConfig} notify={notify} />}
          </div>
        </main>
      </div>
      {toast && <div data-testid="status-toast" className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-md bg-sidebar px-4 py-3 text-xs font-medium text-white shadow-lg"><Check size={14} className="text-accent" />{toast}</div>}
    </div>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-2.5"><div className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-accent"><span className="absolute -right-2 -top-2 h-7 w-7 rounded-full border-[5px] border-sidebar/80" /><span className="absolute -bottom-2 -left-2 h-7 w-7 rounded-full border-[5px] border-sidebar/80" /><span className="relative h-2 w-2 rounded-full bg-sidebar" /></div>{!compact && <div><div className="font-sans text-[17px] font-bold tracking-[-.04em] text-white">Color<span className="text-accent">Forge</span></div><div className="font-mono text-[9px] uppercase tracking-[.18em] text-white/35">visual intelligence</div></div>}</div>;
}

function EmptyState({ onFile, inputRef, dragActive, setDragActive }: { onFile: (file?: File) => void; inputRef: React.RefObject<HTMLInputElement | null>; dragActive: boolean; setDragActive: (active: boolean) => void }) {
  return <div className="animate-rise mx-auto max-w-[1120px]">
    <div className="mb-9 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.2em] text-primary"><Sparkles size={13} /> Reference to rationale</p><h1 className="max-w-[680px] font-sans text-4xl font-bold leading-[.98] tracking-[-.055em] text-foreground md:text-6xl">Turn a screenshot<br /><span className="text-muted-foreground">into a build plan.</span></h1></div><p className="max-w-[260px] text-sm leading-6 text-muted-foreground">Upload a UI reference. ColorForge extracts the signals that make it feel the way it does.</p></div>
    <div onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); onFile(event.dataTransfer.files[0]); }} className={`relative overflow-hidden rounded-xl border-2 border-dashed p-6 transition-colors md:p-10 ${dragActive ? 'border-primary bg-primary/[.06]' : 'border-border bg-card hover:border-primary/50'}`}>
      <div className="absolute right-0 top-0 h-32 w-32 opacity-40" style={{ background: 'conic-gradient(from 160deg at 50% 50%, #14B8A6, #F59E0B, #E8675B, #14B8A6)', filter: 'blur(35px)' }} />
      <div className="relative flex min-h-[340px] flex-col items-center justify-center text-center"><div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-border bg-background"><div className="absolute inset-2 rounded-full border border-primary/30" /><UploadCloud size={27} className="text-primary" /></div><h2 className="font-sans text-xl font-bold tracking-[-.02em]">Drop your reference here</h2><p className="mt-2 max-w-[380px] text-sm leading-6 text-muted-foreground">The image stays on this device. No upload, account, or server round-trip required.</p><input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => onFile(event.target.files?.[0])} /><button data-testid="button-choose-file" onClick={() => inputRef.current?.click()} className="mt-6 flex items-center gap-2 rounded-md bg-sidebar px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"><ImageIcon size={16} /> Choose image</button><p className="mt-4 font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">PNG / JPG / WEBP · MAX 15 MB</p></div>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3"><Feature icon={Activity} title="Pixel-level signal" text="Dominant color, luminance, and contrast sampling." /><Feature icon={MousePointer2} title="Heuristic regions" text="Click through inferred interface zones and bounds." /><Feature icon={FileCode2} title="Ready to recreate" text="Copy CSS variables, tokens, and a build sequence." /></div>
  </div>;
}

function Feature({ icon: Icon, title, text }: { icon: typeof Activity; title: string; text: string }) {
  return <div className="rounded-md border border-border bg-card p-4"><Icon size={16} className="mb-4 text-primary" /><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div>;
}

function ErrorState({ message, onReset, onFile, inputRef }: { message: string; onReset: () => void; onFile: (file?: File) => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  return <div className="animate-rise mx-auto flex min-h-[65vh] max-w-[560px] flex-col items-center justify-center text-center"><div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive"><X size={24} /></div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-destructive">Analysis interrupted</p><h1 className="mt-3 font-sans text-3xl font-bold tracking-[-.04em]">That reference needs another look.</h1><p data-testid="status-upload-error" className="mt-3 text-sm leading-6 text-muted-foreground">{message}</p><div className="mt-7 flex gap-3"><button data-testid="button-retry-upload" onClick={() => inputRef.current?.click()} className="rounded-md bg-sidebar px-4 py-2.5 text-sm font-semibold text-white">Choose another file</button><button data-testid="button-reset-error" onClick={onReset} className="rounded-md border border-border bg-card px-4 py-2.5 text-sm font-semibold">Reset</button></div><input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => onFile(event.target.files?.[0])} /></div>;
}

function AnalysisProgress({ progress }: { progress: number }) {
  const stage = progress < 40 ? 'Reading pixels' : progress < 70 ? 'Finding visual clusters' : progress < 95 ? 'Structuring report' : 'Finishing signal map';
  return <div className="animate-rise mx-auto flex min-h-[65vh] max-w-[680px] flex-col items-center justify-center text-center"><div className="relative mb-8 h-28 w-28 rounded-full border border-border bg-card"><div className="absolute inset-4 rounded-full border-2 border-primary/20" /><div className="absolute inset-7 rounded-full bg-primary progress-pulse" /><div className="absolute -inset-3 rounded-full border border-dashed border-primary/30" /></div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">Browser-side analysis</p><h1 className="mt-3 font-sans text-3xl font-bold tracking-[-.04em]">Reading the visual language.</h1><p className="mt-3 text-sm text-muted-foreground">{stage} — nothing leaves this browser.</p><div className="mt-8 h-1.5 w-full overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} /></div><div className="mt-3 flex w-full justify-between font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground"><span>Signal extraction</span><span>{progress}%</span></div></div>;
}

function Report({ analysis, view, setView, selected, selectRegion, copyText, download, cssVariables, tailwindConfig, notify }: { analysis: Analysis; view: ViewId; setView: (view: ViewId) => void; selected?: Region; selectRegion: (id: string) => void; copyText: (value: string, label: string) => void; download: (content: string, filename: string, type: string) => void; cssVariables: string; tailwindConfig: string; notify: (message: string) => void }) {
  return <div className="animate-rise">
    <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Analysis ready <span className="text-border">/</span> {analysis.fileType.split('/')[1]?.toUpperCase()}</div><h1 className="font-sans text-3xl font-bold tracking-[-.045em] md:text-5xl">Reference report<span className="text-primary">.</span></h1><p className="mt-2 max-w-xl text-sm text-muted-foreground">A practical read of <span className="font-medium text-foreground">{analysis.fileName}</span>, sampled from {analysis.width} × {analysis.height} pixels.</p></div><div className="flex items-center gap-2"><button data-testid="button-export-css" onClick={() => download(cssVariables, 'colorforge-tokens.css', 'text/css')} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold hover:border-primary/50"><FileCode2 size={14} /> <span className="hidden sm:inline">CSS</span></button><button data-testid="button-export-tailwind" onClick={() => download(tailwindConfig, 'colorforge-tailwind.ts', 'text/plain')} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold hover:border-primary/50"><ArrowDownToLine size={14} /> <span className="hidden sm:inline">Tailwind</span></button></div></div>
    <div className="scrollbar-thin mb-7 flex gap-1 overflow-x-auto border-b border-border pb-px">{VIEWS.map((item) => { const Icon = item.icon; return <button key={item.id} data-testid={`tab-${item.id}`} onClick={() => setView(item.id)} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-semibold transition-colors ${view === item.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><Icon size={14} />{item.label}</button>; })}</div>
    {view === 'overview' && <Overview analysis={analysis} selected={selected} selectRegion={selectRegion} copyText={copyText} setView={setView} notify={notify} />}
    {view === 'colors' && <Colors analysis={analysis} copyText={copyText} download={download} cssVariables={cssVariables} />}
    {view === 'typography' && <Typography analysis={analysis} />}
    {view === 'layout' && <LayoutReport analysis={analysis} selected={selected} selectRegion={selectRegion} />}
    {view === 'components' && <Components analysis={analysis} />}
    {view === 'responsive' && <Responsive analysis={analysis} />}
    {view === 'recreate' && <Recreate analysis={analysis} copyText={copyText} cssVariables={cssVariables} tailwindConfig={tailwindConfig} />}
  </div>;
}

function Metric({ label, value, note, accent = false }: { label: string; value: string; note: string; accent?: boolean }) {
  return <div className="rounded-md border border-border bg-card p-4"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">{label}</p><p className={`mt-3 font-sans text-2xl font-bold tracking-[-.04em] ${accent ? 'text-primary' : ''}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div>;
}

function Overview({ analysis, selected, selectRegion, copyText, setView, notify }: { analysis: Analysis; selected?: Region; selectRegion: (id: string) => void; copyText: (value: string, label: string) => void; setView: (view: ViewId) => void; notify: (message: string) => void }) {
  return <><div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Canvas" value={`${analysis.width} × ${analysis.height}`} note={`${analysis.aspectRatio} aspect ratio`} /><Metric label="Luminance" value={`${Math.round(analysis.luminance * 100)}%`} note="Average perceived light" accent /><Metric label="Contrast index" value={`${analysis.contrast}:1`} note="Approx. foreground range" /><Metric label="Dark pixel field" value={`${analysis.darkPixels}%`} note="Sampled below 35% luminance" /></div><div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,.8fr)]"><ImageWorkspace analysis={analysis} selected={selected} selectRegion={selectRegion} /><div className="space-y-5"><section className="rounded-md border border-border bg-card p-5"><SectionHeading eyebrow="Dominant palette" title="The visual anchors" action="View all" onAction={() => setView('colors')} /><div className="mt-5 space-y-3">{analysis.colors.slice(0, 5).map((color, index) => <div className="flex items-center gap-3" key={color.hex}><span className="h-8 w-8 rounded-md border border-black/10" style={{ backgroundColor: color.hex }} /><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><span className="truncate text-xs font-semibold">{color.name}</span><span className="font-mono text-[10px] text-muted-foreground">{color.hex}</span></div><div className="mt-1.5 h-1 rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${Math.max(8, color.share)}%`, backgroundColor: color.hex }} /></div></div><span className="font-mono text-[10px] text-muted-foreground">{color.share}%</span></div>)}</div><button data-testid="button-copy-overview-tokens" onClick={() => copyText(analysis.colors.map((color) => `${color.name}: ${color.hex}`).join('\n'), 'Color tokens')} className="mt-5 flex items-center gap-2 text-xs font-semibold text-primary hover:underline"><Copy size={13} /> Copy color tokens</button></section><section className="rounded-md border border-border bg-sidebar p-5 text-white"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-accent">Recommendation</p><p className="mt-3 text-sm leading-6 text-white/75">Start with the <span className="font-semibold text-white">{analysis.colors[0]?.hex}</span> field as your structural base, then use the highest-chroma token as the interaction signal.</p><button data-testid="button-open-recreate" onClick={() => { setView('recreate'); notify('Build sequence opened.'); }} className="mt-5 flex items-center gap-2 text-xs font-semibold text-accent hover:underline">Open recreate plan <ArrowDownToLine size={13} /></button></section></div></div></>;
}

function SectionHeading({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  return <div><div className="flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[.17em] text-primary">{eyebrow}</p>{action && <button data-testid={`button-${action.toLowerCase().replaceAll(' ', '-')}`} onClick={onAction} className="text-xs font-semibold text-muted-foreground hover:text-foreground">{action} →</button>}</div><h2 className="mt-2 font-sans text-xl font-bold tracking-[-.03em]">{title}</h2></div>;
}

function ImageWorkspace({ analysis, selected, selectRegion }: { analysis: Analysis; selected?: Region; selectRegion: (id: string) => void }) {
  return <section className="overflow-hidden rounded-md border border-border bg-card"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="font-mono text-[10px] uppercase tracking-[.17em] text-primary">Visual workspace</p><h2 className="mt-1 font-sans text-xl font-bold tracking-[-.03em]">Reference map</h2></div><span className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> {analysis.regions.length} regions inferred</span></div><div className="bg-[#e8e5dc] p-4 md:p-7"><div className="relative mx-auto aspect-[16/10] max-h-[560px] overflow-hidden rounded-sm bg-[#c8c6bf] shadow-lg"><img data-testid="img-analysis-preview" src={analysis.dataUrl} alt={`Analyzed reference ${analysis.fileName}`} className="h-full w-full object-contain" />{analysis.regions.map((region) => <button key={region.id} data-testid={`marker-${region.id}`} onClick={() => selectRegion(region.id)} aria-label={`Inspect ${region.label}`} className={`absolute border transition-all ${selected?.id === region.id ? 'border-accent bg-accent/20 shadow-[0_0_0_2px_hsl(var(--accent))]' : 'border-primary/60 bg-primary/5 hover:bg-primary/15'}`} style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.w}%`, height: `${region.h}%` }}><span className={`absolute left-1 top-1 rounded-sm px-1.5 py-1 font-mono text-[9px] uppercase tracking-[.08em] ${selected?.id === region.id ? 'bg-accent text-sidebar' : 'bg-sidebar/80 text-white'}`}>{region.label}</span></button>)}</div></div><div className="grid gap-0 border-t border-border md:grid-cols-[1fr_260px]"><div className="p-5"><p className="font-mono text-[10px] uppercase tracking-[.17em] text-muted-foreground">Inspector</p><div className="mt-3 flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ backgroundColor: selected?.color }} /><span className="text-sm font-semibold">{selected?.label ?? 'Select a region'}</span><span className="ml-auto font-mono text-[10px] text-primary">{selected?.confidence}% confidence</span></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Heuristic bounds are generated from image dimensions and sampled color fields. Use them as a starting point, not a DOM claim.</p></div>{selected && <div className="border-t border-border bg-muted/35 p-5 md:border-l md:border-t-0"><p className="font-mono text-[10px] uppercase tracking-[.17em] text-muted-foreground">Properties</p><div className="mt-3 space-y-3">{selected.properties.map((property) => <div key={property.label}><p className="text-[10px] text-muted-foreground">{property.label}</p><p className="mt-0.5 font-mono text-xs">{property.value}</p></div>)}</div></div>}</div></section>;
}

function Colors({ analysis, copyText, download, cssVariables }: { analysis: Analysis; copyText: (value: string, label: string) => void; download: (content: string, filename: string, type: string) => void; cssVariables: string }) {
  return <div className="space-y-5"><div className="grid gap-5 lg:grid-cols-[1fr_1fr]"><section className="rounded-md border border-border bg-card p-5 md:p-6"><SectionHeading eyebrow="Palette extraction" title={`${analysis.colors.length} usable color tokens`} /><div className="mt-6 space-y-4">{analysis.colors.map((color) => <div key={color.hex} className="group flex items-center gap-4"><span className="h-14 w-14 shrink-0 rounded-md border border-black/10 shadow-sm" style={{ backgroundColor: color.hex }} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{color.name}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{color.rgb} RGB</p></div><span className="font-mono text-xs text-muted-foreground">{color.share}% field</span></div><div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${Math.max(color.share, 4)}%`, backgroundColor: color.hex }} /></div></div><button data-testid={`button-copy-color-${color.hex.slice(1)}`} onClick={() => copyText(color.hex, `${color.name} ${color.hex}`)} className="rounded p-2 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground group-hover:opacity-100"><Copy size={14} /></button></div>)}</div><div className="mt-6 flex gap-2 border-t border-border pt-5"><button data-testid="button-copy-css-variables" onClick={() => copyText(cssVariables, 'CSS variables')} className="flex items-center gap-2 rounded-md bg-sidebar px-3 py-2 text-xs font-semibold text-white"><Copy size={13} /> Copy CSS variables</button><button data-testid="button-download-css" onClick={() => download(cssVariables, 'colorforge-tokens.css', 'text/css')} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold"><ArrowDownToLine size={13} /> Download</button></div></section><section className="rounded-md border border-border bg-sidebar p-5 text-white md:p-6"><SectionHeading eyebrow="Readout" title="What the color field says" /><div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/10 bg-white/10"><div className="bg-white/[.04] p-4"><p className="font-mono text-[10px] uppercase text-white/45">Luminance</p><p className="mt-2 text-3xl font-bold tracking-[-.05em]">{Math.round(analysis.luminance * 100)}%</p><p className="mt-1 text-xs text-white/45">Perceived light</p></div><div className="bg-white/[.04] p-4"><p className="font-mono text-[10px] uppercase text-white/45">Contrast</p><p className="mt-2 text-3xl font-bold tracking-[-.05em]">{analysis.contrast}:1</p><p className="mt-1 text-xs text-white/45">Approx. range</p></div></div><div className="mt-6 border-l-2 border-accent pl-4 text-sm leading-6 text-white/70">{analysis.luminance < .5 ? 'A low-light field gives the interface weight. Reserve the brightest token for focused actions and active states.' : 'A light field makes whitespace a primary structural tool. Use dark tokens sparingly for hierarchy and readable anchors.'}</div></section></div><section className="rounded-md border border-border bg-card p-5"><SectionHeading eyebrow="Contrast pairings" title="Good starting points for type" /><div className="mt-5 grid gap-3 sm:grid-cols-3">{analysis.colors.slice(0, 3).map((color, index) => <div key={color.hex} className="overflow-hidden rounded-md border border-border"><div className="p-5" style={{ backgroundColor: color.hex, color: analysis.luminance > .5 ? '#0F172A' : '#F8FAFC' }}><p className="text-2xl font-bold tracking-[-.04em]">Aa</p><p className="mt-3 text-xs font-semibold">{color.name} on surface</p></div><div className="flex justify-between px-3 py-2 font-mono text-[10px] text-muted-foreground"><span>{color.hex}</span><span>{index === 0 ? 'Anchor' : 'Candidate'}</span></div></div>)}</div></section></div>;
}

function Typography({ analysis }: { analysis: Analysis }) {
  const dark = analysis.luminance < .5;
  return <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]"><section className="rounded-md border border-border bg-card p-6"><SectionHeading eyebrow="Type direction" title="Make hierarchy do the work" /><p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">Pixel analysis cannot identify the original font file, but density and contrast give us a useful starting direction: a confident grotesk for display and a quiet sans for utility.</p><div className="mt-8 border-y border-border py-7"><p className="font-mono text-[10px] uppercase tracking-[.17em] text-primary">Suggested display scale</p><div className="mt-5 space-y-5"><div><p className="font-sans text-5xl font-bold leading-none tracking-[-.07em]">Signal, not decoration.</p><p className="mt-2 font-mono text-[10px] text-muted-foreground">48 / 48 · 700 · −0.07em</p></div><div><p className="text-2xl font-semibold tracking-[-.04em]">A useful level of emphasis.</p><p className="mt-2 font-mono text-[10px] text-muted-foreground">24 / 29 · 600 · −0.04em</p></div><div><p className="max-w-lg text-sm leading-6 text-muted-foreground">Supporting copy should move quickly and carry enough contrast to be scanned beside a visual workspace.</p><p className="mt-2 font-mono text-[10px] text-muted-foreground">14 / 24 · 400 · 0em</p></div></div></div><div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-md bg-sidebar p-4 text-white"><p className="font-mono text-[10px] uppercase text-white/45">Display</p><p className="mt-4 font-sans text-xl font-bold">Syne / Cabinet Grotesk</p><p className="mt-2 text-xs text-white/55">Use for decisive headings.</p></div><div className="rounded-md border border-border bg-muted/40 p-4"><p className="font-mono text-[10px] uppercase text-muted-foreground">Utility</p><p className="mt-4 font-mono text-xl">DM Mono / 11px</p><p className="mt-2 text-xs text-muted-foreground">Use for measurements and tokens.</p></div></div></section><section className="rounded-md border border-border bg-card p-6"><SectionHeading eyebrow="Type diagnostics" title="The useful constraints" /><div className="mt-7 space-y-5">{[['Contrast posture', dark ? 'Light-on-dark' : 'Dark-on-light'], ['Reading width', '56–68 characters'], ['Utility tracking', '+0.08em labels'], ['Recommended weight', '600 / 700']].map(([label, value]) => <div key={label} className="flex items-center justify-between border-b border-border pb-4"><span className="text-xs text-muted-foreground">{label}</span><span className="font-mono text-xs font-medium">{value}</span></div>)}</div><div className="mt-7 rounded-md bg-accent/15 p-4 text-sm leading-6"><p className="font-semibold">Implementation note</p><p className="mt-1 text-muted-foreground">Keep interface labels mono and compact. This gives the visual report a sense of instrumentation without turning the product into a developer console.</p></div></section></div>;
}

function LayoutReport({ analysis, selected, selectRegion }: { analysis: Analysis; selected?: Region; selectRegion: (id: string) => void }) {
  return <div className="grid gap-5 lg:grid-cols-[1fr_.8fr]"><section className="rounded-md border border-border bg-card p-5 md:p-6"><SectionHeading eyebrow="Spatial rhythm" title="A map of the surface" /><div className="mt-6 grid grid-cols-3 gap-2 rounded-md bg-muted/60 p-3">{analysis.regions.map((region) => <button key={region.id} data-testid={`layout-region-${region.id}`} onClick={() => selectRegion(region.id)} className={`min-h-24 rounded border p-3 text-left transition-colors ${selected?.id === region.id ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/50'}`}><span className="font-mono text-[9px] uppercase text-primary">{region.id.replace('region-', '0')}</span><p className="mt-3 text-xs font-semibold">{region.label}</p><p className="mt-1 text-[10px] text-muted-foreground">{region.w}% width</p></button>)}</div><div className="mt-6 grid gap-3 sm:grid-cols-3"><Metric label="Structure" value={analysis.width / analysis.height > 1.15 ? 'Wide' : 'Compact'} note="Canvas posture" /><Metric label="Grid hint" value={analysis.width / analysis.height > 1.15 ? '3 columns' : '2 columns'} note="Heuristic grouping" accent /><Metric label="Spacing" value="24 / 32" note="Suggested rhythm" /></div></section><section className="rounded-md border border-border bg-sidebar p-6 text-white"><SectionHeading eyebrow="Reconstruction order" title="Build from big to small" /><ol className="mt-7 space-y-5">{['Establish the canvas and primary content rail.', 'Place focal content before utility details.', 'Use color fields to separate interaction layers.', 'Tune the responsive collapse at the narrow edge.'].map((item, index) => <li key={item} className="flex gap-3 text-sm leading-5 text-white/70"><span className="font-mono text-accent">0{index + 1}</span><span>{item}</span></li>)}</ol></section></div>;
}

function Components({ analysis }: { analysis: Analysis }) {
  const components = analysis.regions.map((region, index) => ({ ...region, pattern: ['Navigation shell', 'Hero / focal module', 'Content card', 'Utility panel', 'Action group', 'Footer group'][index] ?? 'Content block', states: ['default', index % 2 ? 'active' : 'hover', 'responsive'] }));
  return <div className="space-y-5"><section className="rounded-md border border-border bg-card p-5 md:p-6"><SectionHeading eyebrow="Pattern inventory" title="Components implied by the image" /><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">These are not DOM detections. They are implementation hypotheses, anchored to the inferred regions and color fields in the reference.</p><div className="mt-6 overflow-x-auto"><table className="w-full min-w-[620px] border-collapse text-left"><thead><tr className="border-b border-border font-mono text-[10px] uppercase tracking-[.13em] text-muted-foreground"><th className="pb-3 pr-4 font-normal">Pattern</th><th className="pb-3 pr-4 font-normal">Role</th><th className="pb-3 pr-4 font-normal">Signal</th><th className="pb-3 font-normal">States</th></tr></thead><tbody>{components.map((component) => <tr key={component.id} className="border-b border-border/70"><td className="py-4 pr-4 text-sm font-semibold">{component.pattern}</td><td className="py-4 pr-4 text-xs text-muted-foreground">{component.role}</td><td className="py-4 pr-4"><span className="inline-flex items-center gap-2 font-mono text-xs"><span className="h-3 w-3 rounded-sm" style={{ backgroundColor: component.color }} />{component.color}</span></td><td className="py-4"><div className="flex gap-1.5">{component.states.map((state) => <span key={state} className="rounded bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">{state}</span>)}</div></td></tr>)}</tbody></table></div></section><div className="grid gap-5 md:grid-cols-3">{['Use real component boundaries', 'Name tokens by purpose', 'Test the quiet states'].map((title, index) => <div key={title} className="rounded-md border border-border bg-card p-5"><div className="mb-5 flex h-8 w-8 items-center justify-center rounded bg-accent text-sidebar font-mono text-xs">0{index + 1}</div><p className="text-sm font-semibold">{title}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{['Keep the inferred regions modular so the recreation remains easy to adjust.', 'A sampled hex is a clue; turn it into a semantic name before shipping.', 'The space between components is part of the reference too.'][index]}</p></div>)}</div></div>;
}

function Responsive({ analysis }: { analysis: Analysis }) {
  const wide = analysis.width / analysis.height > 1.15;
  return <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><section className="rounded-md border border-border bg-card p-5 md:p-6"><SectionHeading eyebrow="Breakpoint notes" title="What should change first" /><div className="mt-7 space-y-3">{[['Desktop', '≥ 1024px', wide ? 'Preserve the multi-column field and let the focal area lead.' : 'Keep the compact reading rail centered.', 'bg-primary'], ['Tablet', '768–1023px', 'Collapse secondary utility content below the focal region.', 'bg-accent'], ['Mobile', '< 768px', 'Stack regions, keep one clear action, and retain the color order.', 'bg-sidebar']].map(([name, width, note, tone]) => <div key={name} className="flex gap-4 rounded-md border border-border p-4"><span className={`mt-1 h-3 w-3 shrink-0 rounded-sm ${tone}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-semibold">{name}</p><span className="font-mono text-[10px] text-muted-foreground">{width}</span></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{note}</p></div></div>)}</div></section><section className="rounded-md border border-border bg-card p-5 md:p-6"><SectionHeading eyebrow="Mobile simulation" title="Keep the signal intact" /><div className="mx-auto mt-7 max-w-[260px] rounded-[22px] border-[7px] border-sidebar bg-muted p-2 shadow-lg"><div className="overflow-hidden rounded-[14px] bg-card"><div className="flex h-7 items-center justify-center border-b border-border"><span className="h-1 w-9 rounded-full bg-sidebar/20" /></div><div className="p-3"><div className="h-2 w-12 rounded bg-primary/80" /><div className="mt-3 h-20 rounded bg-sidebar/10" /><div className="mt-3 space-y-2"><div className="h-2 w-full rounded bg-sidebar/10" /><div className="h-2 w-4/5 rounded bg-sidebar/10" /><div className="h-7 w-1/2 rounded bg-accent/80" /></div></div></div></div><p className="mt-5 text-center text-xs leading-5 text-muted-foreground">Prioritize the focal region, then reintroduce supporting context as the viewport grows.</p></section></div>;
}

function Recreate({ analysis, copyText, cssVariables, tailwindConfig }: { analysis: Analysis; copyText: (value: string, label: string) => void; cssVariables: string; tailwindConfig: string }) {
  const snippet = `const forgeTokens = {\n  canvas: '${analysis.colors[0]?.hex}',\n  signal: '${analysis.colors[2]?.hex ?? analysis.colors[0]?.hex}',\n  luminance: ${analysis.luminance},\n};`;
  const steps = [{ number: '01', title: 'Set the surface', text: `Start with the ${analysis.width} × ${analysis.height} canvas and ${analysis.colors[0]?.hex} as the dominant field.` }, { number: '02', title: 'Build the spatial skeleton', text: `Lay out ${analysis.regions.length} inferred regions. Get the focal zone right before adding detail.` }, { number: '03', title: 'Wire the color signal', text: 'Promote sampled colors into semantic tokens. Use the high-chroma token for action and focus.' }, { number: '04', title: 'Tune the edge case', text: 'Use the responsive notes to collapse secondary regions without losing the visual hierarchy.' }];
  return <div className="grid gap-5 lg:grid-cols-[1fr_.8fr]"><section className="rounded-md border border-border bg-card p-5 md:p-6"><SectionHeading eyebrow="Suggested build sequence" title="From reference to interface" /><div className="mt-7 space-y-0">{steps.map((step, index) => <div key={step.number} className="relative flex gap-4 pb-7 last:pb-0"><div className="relative flex w-8 shrink-0 justify-center"><span className="z-10 flex h-8 w-8 items-center justify-center rounded-full bg-sidebar font-mono text-[10px] text-accent">{step.number}</span>{index < steps.length - 1 && <span className="absolute top-8 h-full w-px bg-border" />}</div><div><p className="text-sm font-semibold">{step.title}</p><p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">{step.text}</p></div></div>)}</div></section><section className="space-y-5"><CodeBlock title="Starter tokens" code={snippet} onCopy={() => copyText(snippet, 'Starter tokens')} /><CodeBlock title="CSS variables" code={cssVariables} onCopy={() => copyText(cssVariables, 'CSS variables')} /><CodeBlock title="Tailwind extension" code={tailwindConfig} onCopy={() => copyText(tailwindConfig, 'Tailwind config')} /></section></div>;
}

function CodeBlock({ title, code, onCopy }: { title: string; code: string; onCopy: () => void }) {
  return <section className="overflow-hidden rounded-md border border-sidebar bg-sidebar text-white"><div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-white/55">{title}</p><button data-testid={`button-copy-${title.toLowerCase().replaceAll(' ', '-')}`} onClick={onCopy} className="flex items-center gap-1.5 text-[11px] text-accent hover:underline"><Copy size={12} /> Copy</button></div><pre className="max-h-44 overflow-auto p-4 font-mono text-[11px] leading-5 text-white/75">{code}</pre></section>;
}

export default App;
