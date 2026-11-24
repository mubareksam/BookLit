export interface PageScanAnalysis {
  detectedPage: number | null;
  estimatedWordsOnPage: number;
  confidence: number;
  extractedSnippet: string;
  lightingQuality: 'good' | 'dim' | 'angled_or_glare';
  engineUsed: 'tesseract_browser' | 'optical_density_local' | 'server_fallback';
  progressPercentDetected?: number | null;
  frameSignature: string;
  livenessValid: boolean;
  rejectionReason?: string;
}

/**
 * Computes an 8x8 perceptual luminance signature + text-line liveness check
 * to reject blank/covered-lens captures and detect duplicate start/end page scans.
 */
async function analyzeLiveCameraFrame(imageDataUrl: string): Promise<{
  estimatedWords: number;
  lightingQuality: 'good' | 'dim' | 'angled_or_glare';
  contrastConfidence: number;
  frameSignature: string;
  livenessValid: boolean;
  rejectionReason?: string;
}> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const w = 320;
      const h = Math.max(240, Math.round((img.height / Math.max(1, img.width)) * w));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({
          estimatedWords: 0,
          lightingQuality: 'dim',
          contrastConfidence: 0,
          frameSignature: '',
          livenessValid: false,
          rejectionReason: 'Unable to read camera frame.',
        });
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const totalPixels = w * h;

      let lumSum = 0;
      let lumSqSum = 0;
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        lumSum += lum;
        lumSqSum += lum * lum;
      }
      const meanLum = lumSum / totalPixels;
      const stdLum = Math.sqrt(Math.max(0, lumSqSum / totalPixels - meanLum * meanLum));

      // Compute 8x8 block average hash (64-bit hex signature)
      const grid = 8;
      const cellW = Math.floor(w / grid);
      const cellH = Math.floor(h / grid);
      const blockMeans: number[] = [];
      for (let gy = 0; gy < grid; gy++) {
        for (let gx = 0; gx < grid; gx++) {
          let sum = 0;
          let count = 0;
          for (let y = gy * cellH; y < (gy + 1) * cellH; y += 2) {
            for (let x = gx * cellW; x < (gx + 1) * cellW; x += 2) {
              const idx = (y * w + x) * 4;
              sum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
              count++;
            }
          }
          blockMeans.push(count > 0 ? sum / count : meanLum);
        }
      }
      const bits = blockMeans.map((v) => (v >= meanLum ? '1' : '0')).join('');
      let hexSig = '';
      for (let i = 0; i < 64; i += 4) {
        hexSig += parseInt(bits.slice(i, i + 4), 2).toString(16);
      }

      // Reject covered lens or uniform flat wall
      if (meanLum < 18 || stdLum < 11) {
        resolve({
          estimatedWords: 0,
          lightingQuality: 'dim',
          contrastConfidence: 0.15,
          frameSignature: hexSig,
          livenessValid: false,
          rejectionReason:
            'Frame is too dark or blank. Point your camera at a lit book or e-reader page.',
        });
        return;
      }

      // Row-projection text line count
      const inkThreshold = meanLum > 110 ? meanLum - Math.max(20, stdLum * 0.8) : meanLum + 22;
      let detectedLines = 0;
      let inLine = false;
      for (let y = 12; y < h - 12; y++) {
        let darkInRow = 0;
        for (let x = 20; x < w - 20; x++) {
          const idx = (y * w + x) * 4;
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          const isInk = meanLum > 110 ? lum < inkThreshold : lum > inkThreshold;
          if (isInk) darkInRow++;
        }
        const ratio = darkInRow / (w - 40);
        if (!inLine && ratio > 0.055 && ratio < 0.72) {
          inLine = true;
          detectedLines++;
        } else if (inLine && ratio < 0.03) {
          inLine = false;
        }
      }

      if (detectedLines < 3) {
        resolve({
          estimatedWords: 0,
          lightingQuality: 'angled_or_glare',
          contrastConfidence: 0.25,
          frameSignature: hexSig,
          livenessValid: false,
          rejectionReason:
            'No readable text lines detected in frame. Hold steady over the printed page.',
        });
        return;
      }

      const clampedLines = Math.max(6, Math.min(42, detectedLines));
      const estimatedWords = Math.round(clampedLines * 9.8);

      let lightingQuality: 'good' | 'dim' | 'angled_or_glare' = 'good';
      let contrastConfidence = 0.86;
      if (meanLum < 95 || stdLum < 22) {
        lightingQuality = 'dim';
        contrastConfidence = 0.68;
      } else if (stdLum < 30) {
        lightingQuality = 'angled_or_glare';
        contrastConfidence = 0.75;
      }

      resolve({
        estimatedWords,
        lightingQuality,
        contrastConfidence,
        frameSignature: hexSig,
        livenessValid: true,
      });
    };
    img.onerror = () =>
      resolve({
        estimatedWords: 0,
        lightingQuality: 'dim',
        contrastConfidence: 0,
        frameSignature: '',
        livenessValid: false,
        rejectionReason: 'Camera frame capture failed.',
      });
    img.src = imageDataUrl;
  });
}

/**
 * Computes Hamming distance between two 16-hex-char (64-bit) perceptual frame hashes.
 */
export function computeSignatureDistance(sigA?: string | null, sigB?: string | null): number {
  if (!sigA || !sigB || sigA.length !== 16 || sigB.length !== 16) return 64;
  let dist = 0;
  for (let i = 0; i < 16; i++) {
    const xor = parseInt(sigA[i], 16) ^ parseInt(sigB[i], 16);
    dist += xor.toString(2).replace(/0/g, '').length;
  }
  return dist;
}

function parsePageAndProgressFromText(text: string): {
  pageNumber: number | null;
  progressPercent: number | null;
  wordCount: number;
} {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-zA-Z0-9]/.test(w));

  let pageNumber: number | null = null;
  const explicitPageMatch = text.match(/page\s+(\d{1,4})/i);
  if (explicitPageMatch) {
    pageNumber = parseInt(explicitPageMatch[1], 10);
  } else {
    const numberMatches = [...text.matchAll(/\b(\d{1,4})\b/g)].map((m) => parseInt(m[1], 10));
    const plausible = numberMatches.filter((n) => n >= 1 && n <= 2500);
    if (plausible.length > 0) pageNumber = plausible[0];
  }

  let progressPercent: number | null = null;
  const pctMatch = text.match(/(\d{1,3})\s*%/);
  if (pctMatch) {
    const val = parseInt(pctMatch[1], 10);
    if (val >= 0 && val <= 100) progressPercent = val;
  }

  return {
    pageNumber,
    progressPercent,
    wordCount: words.length,
  };
}

/**
 * Analyzes a live camera frame via liveness validation + Tesseract.js OCR + server fallback.
 */
export async function analyzePageCapture(
  imageDataUrl: string,
  hintPage?: number
): Promise<PageScanAnalysis> {
  const optical = await analyzeLiveCameraFrame(imageDataUrl);

  if (!optical.livenessValid) {
    return {
      detectedPage: null,
      estimatedWordsOnPage: 0,
      confidence: optical.contrastConfidence,
      extractedSnippet: '',
      lightingQuality: optical.lightingQuality,
      engineUsed: 'optical_density_local',
      frameSignature: optical.frameSignature,
      livenessValid: false,
      rejectionReason: optical.rejectionReason,
    };
  }

  try {
    const tesseractPromise = (async () => {
      const Tesseract = await import('tesseract.js');
      return await Tesseract.recognize(imageDataUrl, 'eng');
    })();

    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5500));
    const ocrResult = await Promise.race([tesseractPromise, timeoutPromise]);

    if (ocrResult && ocrResult.data && ocrResult.data.text.trim().length > 15) {
      const parsed = parsePageAndProgressFromText(ocrResult.data.text);
      const rawConf = (ocrResult.data.confidence || 75) / 100;
      const blendedWords =
        parsed.wordCount >= 35
          ? Math.round(parsed.wordCount * 0.75 + optical.estimatedWords * 0.25)
          : optical.estimatedWords;

      return {
        detectedPage: parsed.pageNumber ?? hintPage ?? null,
        estimatedWordsOnPage: Math.max(60, Math.min(550, blendedWords)),
        confidence: Math.round(Math.max(0.45, Math.min(0.98, rawConf)) * 100) / 100,
        extractedSnippet: ocrResult.data.text.replace(/\s+/g, ' ').trim().slice(0, 180),
        lightingQuality: optical.lightingQuality,
        engineUsed: 'tesseract_browser',
        progressPercentDetected: parsed.progressPercent,
        frameSignature: optical.frameSignature,
        livenessValid: true,
      };
    }
  } catch {
    // Fallback to server / optical density
  }

  try {
    const res = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        estimatedOpticalWords: optical.estimatedWords,
        lightingQuality: optical.lightingQuality,
        hintPage: hintPage ?? null,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        detectedPage: data.detectedPage ?? hintPage ?? null,
        estimatedWordsOnPage: data.estimatedWordsOnPage ?? optical.estimatedWords,
        confidence: data.confidence ?? optical.contrastConfidence,
        extractedSnippet: data.extractedSnippet ?? 'Live page geometry verified.',
        lightingQuality: optical.lightingQuality,
        engineUsed: 'server_fallback',
        progressPercentDetected: null,
        frameSignature: optical.frameSignature,
        livenessValid: true,
      };
    }
  } catch {
    // Offline local optical result
  }

  return {
    detectedPage: hintPage ?? null,
    estimatedWordsOnPage: optical.estimatedWords,
    confidence: optical.contrastConfidence,
    extractedSnippet: 'Offline live page density captured.',
    lightingQuality: optical.lightingQuality,
    engineUsed: 'optical_density_local',
    progressPercentDetected: null,
    frameSignature: optical.frameSignature,
    livenessValid: true,
  };
}
