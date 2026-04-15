
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Dimensions, Alert, Pressable, ScrollView, AppState } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useTheme, Text, TextInput, IconButton, Surface, Button } from 'react-native-paper';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system/legacy';
import { WebView } from 'react-native-webview';
import { useAuth } from '@/context/AuthContext';
import { APPWRITE_CONFIG, dataService, storage } from '@/lib/appwrite';

type SpeechChunk = { id: number; text: string; start: number };
type ReaderLanguage = 'en' | 'hi';

const cleanPdfToken = (value: string) =>
  value
    .replace(/\\n/g, ' ')
    .replace(/\\r/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\\\/g, '\\')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\s+/g, ' ')
    .trim();

const parsePdfLikeText = (content: string) => {
  const extracted: string[] = [];
  const tjRegex = /\(([^()]*)\)\s*Tj/g;
  const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
  let match: RegExpExecArray | null = null;
  while ((match = tjRegex.exec(content)) !== null) {
    const token = cleanPdfToken(match[1]);
    if (token) extracted.push(token);
  }
  while ((match = tjArrayRegex.exec(content)) !== null) {
    const block = match[1];
    const inner = /\(([^()]*)\)/g;
    let part: RegExpExecArray | null = null;
    while ((part = inner.exec(block)) !== null) {
      const token = cleanPdfToken(part[1]);
      if (token) extracted.push(token);
    }
  }
  return extracted.join(' ').replace(/\s+/g, ' ').trim();
};

const hasDevanagari = (value: string) => /[\u0900-\u097F]/.test(value);

const detectContentLanguage = (value: string, titleText: string): ReaderLanguage => {
  const source = `${titleText || ''} ${value || ''}`;
  return hasDevanagari(source) ? 'hi' : 'en';
};

const fallbackPdfText = (title: string, language: ReaderLanguage) => {
  if (language === 'hi') {
    return `${title || 'दस्तावेज़'}। इस PDF से पढ़ने योग्य टेक्स्ट नहीं निकला। कृपया प्ले, पॉज़ और रिज़्यूम कंट्रोल से ऑडियो निर्देश सुनें या PDF ब्राउज़र में खोलें।`;
  }
  return `${title || 'Document'}. Readable chapter text was not extracted from this PDF. Use play, pause, and resume controls for guidance audio or open the PDF in browser.`;
};

const isUsefulExtract = (value: string) => {
  const words = value.split(/\s+/).filter(Boolean).length;
  const meaningfulChars = value.replace(/[^A-Za-z\u0900-\u097F]/g, '').length;
  return words >= 24 && meaningfulChars >= 80;
};

const MAX_PDF_EXTRACT_BYTES = 2 * 1024 * 1024;
const MAX_PDF_PDFJS_BYTES = 10 * 1024 * 1024;

const decodeBufferToString = (buffer: ArrayBuffer) => {
  if (typeof TextDecoder === 'undefined') return '';
  const encodings = ['utf-8', 'latin1'];
  for (const encoding of encodings) {
    try {
      return new TextDecoder(encoding).decode(buffer);
    } catch {
      continue;
    }
  }
  try {
    return new TextDecoder().decode(buffer);
  } catch {
    return '';
  }
};

const mergeChunks = (chunks: Uint8Array[], total: number) => {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out.buffer;
};

const readPdfBytesLimited = async (response: Response, signal: AbortSignal) => {
  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : 0;
  if (contentLength && contentLength > MAX_PDF_EXTRACT_BYTES && !response.body) {
    throw new Error(`PDF is too large for text extraction (${Math.ceil(contentLength / (1024 * 1024))}MB)`);
  }

  if (response.body && typeof (response.body as any).getReader === 'function') {
    const reader = (response.body as any).getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    try {
      while (true) {
        if (signal.aborted) throw new Error('Request aborted');
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        const part = value as Uint8Array;
        if (total + part.length >= MAX_PDF_EXTRACT_BYTES) {
          const remaining = MAX_PDF_EXTRACT_BYTES - total;
          if (remaining > 0) chunks.push(part.slice(0, remaining));
          total = MAX_PDF_EXTRACT_BYTES;
          truncated = true;
          break;
        }
        chunks.push(part);
        total += part.length;
      }
    } finally {
      try {
        await reader.cancel();
      } catch {}
    }
    return { buffer: mergeChunks(chunks, total), truncated };
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_PDF_EXTRACT_BYTES) {
    const sliced = buffer.slice(0, MAX_PDF_EXTRACT_BYTES);
    return { buffer: sliced, truncated: true };
  }
  return { buffer, truncated: false };
};

const safeFileKey = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);

const parseAppwriteFileIdFromUrl = (url: string) => {
  const match = url.match(/\/files\/([^/?]+)\/view/i) || url.match(/\/files\/([^/?]+)\/download/i);
  return match?.[1] || null;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  const len = bytes.length;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  for (let i = 0; i < len; i += 3) {
    const a = bytes[i];
    const b = i + 1 < len ? bytes[i + 1] : 0;
    const c = i + 2 < len ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    base64 += chars[(triple >> 18) & 63];
    base64 += chars[(triple >> 12) & 63];
    base64 += i + 1 < len ? chars[(triple >> 6) & 63] : '=';
    base64 += i + 2 < len ? chars[triple & 63] : '=';
  }
  return base64;
};

const downloadPdfToCache = async (url: string, titleText: string) => {
  const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!cacheDir) throw new Error('No writable cache directory available');
  const fileName = `pdf_extract_${safeFileKey(titleText || 'document')}_${Date.now()}.pdf`;
  const localUri = `${cacheDir}${fileName}`;
  const result = await FileSystem.downloadAsync(url, localUri);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Unable to download PDF (${result.status})`);
  }
  const info = await FileSystem.getInfoAsync(result.uri);
  const size = info.exists && typeof (info as any).size === 'number' ? (info as any).size : 0;
  return { localUri: result.uri, size };
};

const readFileAsBase64 = async (localUri: string) => {
  return FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
};

const PDFJS_EXTRACTOR_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script type="module">
      (function () {
        function post(payload) {
          try {
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          } catch (e) {}
        }
        function debug(payload) {
          post({ type: 'debug', payload: payload });
        }
        function safeParse(value) {
          try { return JSON.parse(value); } catch (e) { return null; }
        }
        window.addEventListener('error', function (e) {
          try {
            debug({ kind: 'window_error', message: String(e && e.message ? e.message : ''), filename: e && e.filename, lineno: e && e.lineno, colno: e && e.colno });
          } catch {}
        });
        window.addEventListener('unhandledrejection', function (e) {
          try {
            var reason = e && e.reason ? e.reason : null;
            debug({ kind: 'unhandledrejection', message: String(reason && reason.message ? reason.message : reason) });
          } catch {}
        });
        async function tryImportPdfJs(entryUrl, workerUrl) {
          try {
            debug({ kind: 'pdfjs_import_start', entryUrl: entryUrl });
            const mod = await import(entryUrl);
            const candidate = (mod && (mod.pdfjsLib || mod.default || mod)) || null;
            if (!candidate || typeof candidate.getDocument !== 'function') {
              debug({ kind: 'pdfjs_import_invalid', entryUrl: entryUrl, keys: mod ? Object.keys(mod) : [] });
              return false;
            }
            window.pdfjsLib = candidate;
            if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions && workerUrl) {
              window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
            }
            debug({ kind: 'pdfjs_import_ok', entryUrl: entryUrl, workerUrl: workerUrl || null });
            return true;
          } catch (e) {
            debug({ kind: 'pdfjs_import_fail', entryUrl: entryUrl, message: String(e && e.message ? e.message : e) });
            return false;
          }
        }
        async function ensurePdfJs() {
          if (window.pdfjsLib) return true;
          const sources = [
            {
              entry: 'https://unpkg.com/pdfjs-dist@4.10.38/legacy/build/pdf.mjs',
              worker: 'https://unpkg.com/pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs',
            },
            {
              entry: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.mjs',
              worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs',
            },
            {
              entry: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs',
              worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs',
            },
          ];
          for (const s of sources) {
            const ok = await tryImportPdfJs(s.entry, s.worker);
            if (ok) return true;
          }
          return false;
        }
        function base64ToBytes(base64) {
          var binary = atob(base64);
          var len = binary.length;
          var bytes = new Uint8Array(len);
          for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
          return bytes;
        }
        async function extractText(requestId, payload) {
          var ok = await ensurePdfJs();
          if (!ok) {
            post({ type: 'result', requestId: requestId, ok: false, errorType: 'pdfjs_load_failed', message: 'Failed to load PDF.js' });
            return;
          }
          try {
            var bytes = null;
            if (payload && payload.kind === 'base64') {
              debug({ kind: 'pdf_source_base64', approxChars: payload.base64 ? payload.base64.length : 0 });
              bytes = base64ToBytes(payload.base64 || '');
            } else {
              var url = payload && payload.url ? payload.url : '';
              debug({ kind: 'pdf_fetch_start', url: url });
              var res = await fetch(url);
              if (!res.ok) {
                debug({ kind: 'pdf_fetch_http', url: url, status: res.status });
                post({ type: 'result', requestId: requestId, ok: false, errorType: 'http', message: 'Unable to load PDF (' + res.status + ')' });
                return;
              }
              var buf = await res.arrayBuffer();
              debug({ kind: 'pdf_fetch_ok', url: url, bytes: buf && buf.byteLength ? buf.byteLength : 0 });
              bytes = new Uint8Array(buf);
            }
            var loadingTask = window.pdfjsLib.getDocument({ data: bytes });
            var doc = await loadingTask.promise;
            var numPages = doc.numPages || 0;
            var full = '';
            var emptyPages = 0;
            for (var i = 1; i <= numPages; i++) {
              var page = await doc.getPage(i);
              var content = await page.getTextContent();
              var strings = [];
              if (content && content.items) {
                for (var j = 0; j < content.items.length; j++) {
                  var it = content.items[j];
                  if (it && typeof it.str === 'string' && it.str.trim()) strings.push(it.str);
                }
              }
              var pageText = strings.join(' ').replace(/\\s+/g, ' ').trim();
              if (!pageText) emptyPages += 1;
              if (pageText) full += pageText + '\\n';
            }
            var normalized = full.replace(/\\s+/g, ' ').trim();
            var scannedCandidate = numPages > 0 && normalized.length < 80 && emptyPages / Math.max(1, numPages) >= 0.8;
            debug({ kind: 'pdf_extract_done', numPages: numPages, textLength: normalized.length, emptyPages: emptyPages, scannedCandidate: scannedCandidate });
            post({ type: 'result', requestId: requestId, ok: true, text: normalized, numPages: numPages, scannedCandidate: scannedCandidate });
          } catch (e) {
            var name = e && e.name ? String(e.name) : '';
            var message = e && e.message ? String(e.message) : 'Unknown error';
            if (name === 'PasswordException') {
              post({ type: 'result', requestId: requestId, ok: false, errorType: 'encrypted', message: message });
              return;
            }
            post({ type: 'result', requestId: requestId, ok: false, errorType: 'exception', message: message });
          }
        }
        function onMessage(evt) {
          var data = safeParse(evt && evt.data ? evt.data : '');
          if (!data || !data.type) return;
          if (data.type === 'extract') {
            debug({ kind: 'extract_request', requestId: data.requestId, kind: data.kind || 'url', url: data.url, ua: navigator && navigator.userAgent ? navigator.userAgent : '' });
            extractText(data.requestId, { kind: data.kind || 'url', url: data.url, base64: data.base64 });
          }
        }
        document.addEventListener('message', onMessage);
        window.addEventListener('message', onMessage);
        post({ type: 'ready', ok: true });
      })();
    </script>
  </body>
</html>`;

const PDFJS_VIEWER_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; background: #ffffff; }
      #root { position: relative; width: 100vw; height: 100vh; overflow: hidden; }
      #canvas { position: absolute; left: 0; top: 0; }
      #textLayer { position: absolute; left: 0; top: 0; pointer-events: auto; }
      .t { position: absolute; transform-origin: 0% 0%; white-space: pre; color: transparent; user-select: none; -webkit-user-select: none; }
      .sel { background: rgba(33, 150, 243, 0.25); }
    </style>
  </head>
  <body>
    <div id="root">
      <canvas id="canvas"></canvas>
      <div id="textLayer"></div>
    </div>
    <script type="module">
      (function () {
        function post(payload) {
          try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload)); } catch (e) {}
        }
        function debug(payload) { post({ type: 'debug', payload: payload }); }
        function safeParse(value) { try { return JSON.parse(value); } catch (e) { return null; } }
        function base64ToBytes(base64) {
          var binary = atob(base64);
          var len = binary.length;
          var bytes = new Uint8Array(len);
          for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
          return bytes;
        }
        async function tryImportPdfJs(entryUrl, workerUrl) {
          try {
            debug({ kind: 'viewer_pdfjs_import_start', entryUrl: entryUrl });
            const mod = await import(entryUrl);
            const candidate = (mod && (mod.pdfjsLib || mod.default || mod)) || null;
            if (!candidate || typeof candidate.getDocument !== 'function') {
              debug({ kind: 'viewer_pdfjs_import_invalid', entryUrl: entryUrl });
              return false;
            }
            window.pdfjsLib = candidate;
            if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions && workerUrl) {
              window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
            }
            debug({ kind: 'viewer_pdfjs_import_ok', entryUrl: entryUrl });
            return true;
          } catch (e) {
            debug({ kind: 'viewer_pdfjs_import_fail', entryUrl: entryUrl, message: String(e && e.message ? e.message : e) });
            return false;
          }
        }
        async function ensurePdfJs() {
          if (window.pdfjsLib) return true;
          const sources = [
            { entry: 'https://unpkg.com/pdfjs-dist@4.10.38/legacy/build/pdf.mjs', worker: 'https://unpkg.com/pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs' },
            { entry: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.mjs', worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.mjs' },
            { entry: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs', worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs' },
          ];
          for (const s of sources) {
            const ok = await tryImportPdfJs(s.entry, s.worker);
            if (ok) return true;
          }
          return false;
        }

        var pdfDoc = null;
        var pdfBytes = null;
        var currentPage = 1;
        var lastSelected = null;
        var scale = 1.2;

        async function load(base64) {
          var ok = await ensurePdfJs();
          if (!ok) throw new Error('PDF.js load failed');
          pdfBytes = base64ToBytes(base64);
          var task = window.pdfjsLib.getDocument({ data: pdfBytes });
          pdfDoc = await task.promise;
          debug({ kind: 'viewer_doc_loaded', numPages: pdfDoc.numPages || 0 });
        }

        function clearTextLayer() {
          var layer = document.getElementById('textLayer');
          while (layer.firstChild) layer.removeChild(layer.firstChild);
          lastSelected = null;
        }

        async function render(pageNumber) {
          if (!pdfDoc) return;
          currentPage = pageNumber;
          var page = await pdfDoc.getPage(pageNumber);
          var viewport = page.getViewport({ scale: scale });
          var canvas = document.getElementById('canvas');
          var ctx = canvas.getContext('2d');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = Math.floor(viewport.width) + 'px';
          canvas.style.height = Math.floor(viewport.height) + 'px';
          var layer = document.getElementById('textLayer');
          layer.style.width = Math.floor(viewport.width) + 'px';
          layer.style.height = Math.floor(viewport.height) + 'px';
          clearTextLayer();
          await page.render({ canvasContext: ctx, viewport: viewport }).promise;
          var content = await page.getTextContent();
          var parts = [];
          var starts = [];
          var cursor = 0;
          for (var i = 0; i < content.items.length; i++) {
            var it = content.items[i];
            if (!it || typeof it.str !== 'string') continue;
            var s = it.str.replace(/\\s+/g, ' ').trim();
            if (!s) continue;
            starts.push(cursor);
            parts.push(s);
            cursor += s.length + 1;
          }
          for (var k = 0; k < content.items.length; k++) {
            var item = content.items[k];
            if (!item || typeof item.str !== 'string') continue;
            var str = item.str.replace(/\\s+/g, ' ').trim();
            if (!str) continue;
            var tx = window.pdfjsLib.Util.transform(viewport.transform, item.transform);
            var x = tx[4];
            var y = tx[5];
            var fontHeight = Math.hypot(tx[2], tx[3]);
            var span = document.createElement('span');
            span.className = 't';
            span.textContent = str;
            span.dataset.start = String(starts.shift() || 0);
            span.style.left = x + 'px';
            span.style.top = (y - fontHeight) + 'px';
            span.style.fontSize = fontHeight + 'px';
            span.style.pointerEvents = 'auto';
            span.addEventListener('click', function (e) {
              e.preventDefault();
              e.stopPropagation();
              if (lastSelected) lastSelected.classList.remove('sel');
              lastSelected = span;
              span.classList.add('sel');
              var start = Number(span.dataset.start || '0') || 0;
              var phrase = span.textContent || '';
              post({ type: 'select', page: currentPage, start: start, phrase: phrase });
            });
            layer.appendChild(span);
          }
          post({ type: 'rendered', page: currentPage, numPages: pdfDoc.numPages || 0, width: viewport.width, height: viewport.height });
        }

        async function onMessage(evt) {
          var data = safeParse(evt && evt.data ? evt.data : '');
          if (!data || !data.type) return;
          if (data.type === 'load') {
            try {
              await load(data.base64 || '');
              if (data.page) await render(Number(data.page) || 1);
              post({ type: 'viewer_loaded', ok: true, numPages: pdfDoc ? pdfDoc.numPages : 0 });
            } catch (e) {
              post({ type: 'viewer_loaded', ok: false, message: String(e && e.message ? e.message : e) });
            }
          }
          if (data.type === 'render') {
            await render(Number(data.page) || 1);
          }
        }
        document.addEventListener('message', onMessage);
        window.addEventListener('message', onMessage);
        post({ type: 'viewer_ready', ok: true });
      })();
    </script>
  </body>
</html>`;

const extractReadableText = async (sourceUrl: string, fallbackTitle: string, signal: AbortSignal) => {
  const response = await fetch(sourceUrl, { signal });
  if (!response.ok) {
    throw new Error(`Unable to load PDF text source (${response.status})`);
  }
  const { buffer, truncated } = await readPdfBytesLimited(response, signal);
  const decoded = decodeBufferToString(buffer);
  const titleLanguage = detectContentLanguage('', fallbackTitle);
  if (!decoded) {
    return {
      text: fallbackPdfText(fallbackTitle, titleLanguage),
      mode: 'fallback' as const,
      language: titleLanguage,
      extractionIssue: truncated ? 'PDF too large. Used partial bytes and text decoding failed' : 'PDF text decoding failed',
    };
  }
  const parsed = parsePdfLikeText(decoded);
  const detectedLanguage = detectContentLanguage(parsed, fallbackTitle);
  if (isUsefulExtract(parsed)) {
    return {
      text: parsed,
      mode: 'pdf' as const,
      language: detectedLanguage,
      extractionIssue: truncated ? 'Large PDF detected. Text extracted from first chunk only' : null,
    };
  }
  return {
    text: fallbackPdfText(fallbackTitle, detectedLanguage),
    mode: 'fallback' as const,
    language: detectedLanguage,
    extractionIssue: truncated
      ? 'Large PDF detected. Partial text sample was not sufficient for chapter extraction'
      : 'Readable chapter text was not extracted from this PDF',
  };
};

const toChunks = (rawText: string): SpeechChunk[] => {
  const normalized = rawText.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const sentenceRegex = /[^.!?]+[.!?]?/g;
  const chunks: SpeechChunk[] = [];
  let id = 1;
  let sentenceMatch: RegExpExecArray | null;
  while ((sentenceMatch = sentenceRegex.exec(normalized)) !== null) {
    const sentenceRaw = sentenceMatch[0] || '';
    const sentence = sentenceRaw.trim();
    if (!sentence) continue;
    const sentenceStart = sentenceMatch.index;
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length <= 10) {
      chunks.push({ id, text: sentence, start: sentenceStart });
      id += 1;
      continue;
    }
    let searchFrom = 0;
    for (let i = 0; i < words.length; i += 8) {
      const part = words.slice(i, i + 8).join(' ');
      const localIndex = sentence.indexOf(part, searchFrom);
      const start = localIndex >= 0 ? sentenceStart + localIndex : sentenceStart;
      if (localIndex >= 0) searchFrom = localIndex + part.length;
      chunks.push({ id, text: part, start });
      id += 1;
    }
  }
  return chunks;
};

export default function PDFViewerScreen() {
  const { url, title, materialId } = useLocalSearchParams<{ url: string; title: string; materialId: string }>();
  const normalizedUrl = typeof url === 'string' ? url.trim() : '';
  const theme = useTheme();
  const { user } = useAuth();
  const isExpoGo = Constants.appOwnership === 'expo';
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [inputPage, setInputPage] = useState('1');
  const pdfRef = useRef<any>(null);
  const chunkScrollRef = useRef<ScrollView | null>(null);
  const chunkYRef = useRef<Record<number, number>>({});
  const speechSessionRef = useRef(0);
  const speechRequestRef = useRef(0);
  const speechStartWatchRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [PdfComponent, setPdfComponent] = useState<any>(null);
  const [pdfSourceUri, setPdfSourceUri] = useState<string>('');
  const [pdfSourceType, setPdfSourceType] = useState<'remote' | 'local'>('remote');
  const [isRecoveringPdf, setIsRecoveringPdf] = useState(false);
  const [chunks, setChunks] = useState<SpeechChunk[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [extractionIssue, setExtractionIssue] = useState<string | null>(null);
  const [textMode, setTextMode] = useState<'pdf' | 'fallback' | null>(null);
  const [contentLanguage, setContentLanguage] = useState<ReaderLanguage>('en');
  const [extractedText, setExtractedText] = useState<string>('');
  const [reloadTextKey, setReloadTextKey] = useState(0);
  const [speechIssue, setSpeechIssue] = useState<string | null>(null);
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const [speechReady, setSpeechReady] = useState(false);
  const [speechSettings, setSpeechSettings] = useState<{ language?: string; voice?: string }>({ language: 'en-US' });
  const [readerMode, setReaderMode] = useState(false);
  const readerScrollRef = useRef<ScrollView | null>(null);
  const readerChunkYRef = useRef<Record<number, number>>({});
  const [interactiveReader, setInteractiveReader] = useState(false);
  const [interactivePdfBase64, setInteractivePdfBase64] = useState<string | null>(null);
  const pdfJsViewerRef = useRef<WebView | null>(null);
  const pdfJsViewerReadyRef = useRef(false);
  const pdfJsWebViewRef = useRef<WebView | null>(null);
  const pdfJsReadyRef = useRef(false);
  const pdfJsReadyWaitersRef = useRef<(() => void)[]>([]);
  const pdfJsPendingRef = useRef<{
    requestId: number;
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    timeout: any;
  } | null>(null);
  const pdfJsRequestIdRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();

    if (isExpoGo) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const loadedModule = await import('react-native-pdf');
        if (controller.signal.aborted) return;
        setPdfComponent(() => loadedModule.default || loadedModule);
      } catch (e: any) {
        if (controller.signal.aborted) return;
        setPdfLoadError(e?.message || 'Failed to load native PDF module');
        setLoading(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [isExpoGo]);

  useEffect(() => {
    if (user && materialId) {
      dataService.getProgress(user.id, materialId).then(({ data }) => {
        if (data && data.progress > 0) {
          setCurrentPage(data.progress);
          setInputPage(String(data.progress));
        }
      });
    }
  }, [user, materialId]);

  const extractWithPdfJs = useCallback((payload: { kind: 'url'; url: string } | { kind: 'base64'; base64: string }) => {
    return new Promise<{ ok: boolean; text?: string; numPages?: number; scannedCandidate?: boolean; errorType?: string; message?: string }>((resolve, reject) => {
      if (!pdfJsReadyRef.current || !pdfJsWebViewRef.current) {
        reject(new Error('PDF.js extractor is not ready'));
        return;
      }
      if (pdfJsPendingRef.current) {
        clearTimeout(pdfJsPendingRef.current.timeout);
        pdfJsPendingRef.current.reject(new Error('Cancelled'));
      }
      const requestId = pdfJsRequestIdRef.current + 1;
      pdfJsRequestIdRef.current = requestId;
      const timeout = setTimeout(() => {
        if (pdfJsPendingRef.current?.requestId === requestId) {
          pdfJsPendingRef.current = null;
          reject(new Error('PDF text extraction timed out'));
        }
      }, 25000);
      pdfJsPendingRef.current = { requestId, resolve, reject, timeout };
      if (payload.kind === 'base64') {
        pdfJsWebViewRef.current.postMessage(JSON.stringify({ type: 'extract', kind: 'base64', requestId, base64: payload.base64 }));
      } else {
        pdfJsWebViewRef.current.postMessage(JSON.stringify({ type: 'extract', kind: 'url', requestId, url: payload.url }));
      }
    });
  }, []);

  const waitForPdfJsBridgeReady = useCallback((signal: AbortSignal) => {
    return new Promise<void>((resolve, reject) => {
      if (pdfJsReadyRef.current && pdfJsWebViewRef.current) {
        resolve();
        return;
      }
      const timeout = setTimeout(() => {
        reject(new Error('PDF.js extractor did not initialize'));
      }, 2500);

      const done = () => {
        clearTimeout(timeout);
        resolve();
      };

      pdfJsReadyWaitersRef.current.push(done);

      const onAbort = () => {
        clearTimeout(timeout);
        reject(new Error('Request aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }, []);

  useEffect(() => {
    if (!normalizedUrl) {
      setChunks([]);
      setTextMode(null);
      return;
    }
    if (__DEV__) {
      console.log('[PDFVoice] extract_start', { url: normalizedUrl, title, reloadTextKey });
    }
    speechSessionRef.current += 1;
    Speech.stop();
    setIsPlaying(false);
    const controller = new AbortController();
    setTextLoading(true);
    setTextError(null);
    setExtractionIssue(null);
    setInteractivePdfBase64(null);
    (async () => {
      try {
        const titleText = title || 'Document';
        const titleLang = detectContentLanguage('', titleText);
        setContentLanguage(titleLang);

        let extracted:
          | { text: string; mode: 'pdf' | 'fallback'; language: ReaderLanguage; extractionIssue: string | null }
          | null = null;

        try {
          await waitForPdfJsBridgeReady(controller.signal);
          if (__DEV__) console.log('[PDFVoice] pdfjs_bridge_ready');
          const fileId = parseAppwriteFileIdFromUrl(normalizedUrl);
          let base64: string | null = null;

          if (fileId) {
            if (__DEV__) console.log('[PDFVoice] appwrite_getFileView_start', { fileId });
            const buffer = await storage.getFileView(APPWRITE_CONFIG.BUCKETS.MATERIALS, fileId);
            if (controller.signal.aborted) return;
            const size = buffer.byteLength || 0;
            if (__DEV__) console.log('[PDFVoice] appwrite_getFileView_ok', { fileId, size });
            if (size > MAX_PDF_PDFJS_BYTES) {
              throw new Error(`PDF too large for extraction (${Math.ceil(size / (1024 * 1024))}MB)`);
            }
            base64 = arrayBufferToBase64(buffer);
          } else {
            if (__DEV__) console.log('[PDFVoice] pdf_native_download_start');
            const { localUri, size } = await downloadPdfToCache(normalizedUrl, titleText);
            if (controller.signal.aborted) return;
            if (__DEV__) console.log('[PDFVoice] pdf_native_download_ok', { size, localUri });
            if (size > MAX_PDF_PDFJS_BYTES) {
              try {
                await FileSystem.deleteAsync(localUri, { idempotent: true } as any);
              } catch {}
              throw new Error(`PDF too large for extraction (${Math.ceil(size / (1024 * 1024))}MB)`);
            }
            base64 = await readFileAsBase64(localUri);
            if (controller.signal.aborted) return;
            try {
              await FileSystem.deleteAsync(localUri, { idempotent: true } as any);
            } catch {}
          }

          if (!base64) throw new Error('Unable to prepare PDF bytes for extraction');
          setInteractivePdfBase64(base64);
          const pdfjs = await extractWithPdfJs({ kind: 'base64', base64 });
          if (controller.signal.aborted) return;
          if (__DEV__) console.log('[PDFVoice] pdfjs_result', { ok: pdfjs.ok, errorType: pdfjs.errorType, numPages: pdfjs.numPages, textLen: typeof pdfjs.text === 'string' ? pdfjs.text.length : null });
          if (typeof pdfjs.numPages === 'number' && pdfjs.numPages > 0) {
            setTotalPages(pdfjs.numPages);
          }
          if (pdfjs.ok && typeof pdfjs.text === 'string' && isUsefulExtract(pdfjs.text)) {
            const detected = detectContentLanguage(pdfjs.text, titleText);
            extracted = { text: pdfjs.text, mode: 'pdf', language: detected, extractionIssue: null };
          } else if (pdfjs.ok && typeof pdfjs.text === 'string') {
            const detected = detectContentLanguage(pdfjs.text, titleText);
            extracted = {
              text: fallbackPdfText(titleText, detected),
              mode: 'fallback',
              language: detected,
              extractionIssue: pdfjs.scannedCandidate ? 'This looks like a scanned PDF. OCR is not supported yet' : 'Readable chapter text was not extracted from this PDF',
            };
          } else {
            extracted = {
              text: fallbackPdfText(titleText, titleLang),
              mode: 'fallback',
              language: titleLang,
              extractionIssue:
                pdfjs.errorType === 'encrypted'
                  ? 'This PDF is encrypted and cannot be read without a password'
                  : pdfjs.message || 'Text extraction failed',
            };
          }
        } catch (e: any) {
          if (__DEV__) console.log('[PDFVoice] pdfjs_failed_fallback_to_heuristic', { message: e?.message || String(e) });
          const fallback = await extractReadableText(normalizedUrl, titleText, controller.signal);
          if (controller.signal.aborted) return;
          extracted = {
            text: fallback.text,
            mode: fallback.mode,
            language: fallback.language || titleLang,
            extractionIssue: fallback.extractionIssue || null,
          };
        }

        if (!extracted) throw new Error('Text extraction failed');
        if (__DEV__) console.log('[PDFVoice] extract_done', { mode: extracted.mode, lang: extracted.language, issue: extracted.extractionIssue, textLen: extracted.text.length });
        setContentLanguage(extracted.language);
        setExtractionIssue(extracted.extractionIssue);
        setExtractedText(extracted.text.replace(/\s+/g, ' ').trim());
        setReaderMode(extracted.mode === 'pdf');
        const parsedChunks = toChunks(extracted.text);
        if (!parsedChunks.length) {
          setChunks([]);
          setCurrentIndex(0);
          setTextMode(extracted.mode);
          setTextError('No readable text found for voice playback');
        } else {
          setChunks(parsedChunks);
          setCurrentIndex(0);
          setTextMode(extracted.mode);
          setTextError(null);
        }
      } catch (e: any) {
        if (controller.signal.aborted) return;
        const fallbackLang = detectContentLanguage('', title || 'Document');
        const fallbackChunks = toChunks(fallbackPdfText(title || 'Document', fallbackLang));
        setChunks(fallbackChunks);
        setCurrentIndex(0);
        setContentLanguage(fallbackLang);
        setTextMode('fallback');
        setExtractionIssue('PDF text extraction failed');
        setTextError(e?.message || 'Text extraction failed');
      } finally {
        if (!controller.signal.aborted) {
          setTextLoading(false);
        }
      }
    })();
    return () => {
      controller.abort();
    };
  }, [normalizedUrl, title, reloadTextKey, extractWithPdfJs, waitForPdfJsBridgeReady]);

  useEffect(() => {
    setPdfSourceUri(normalizedUrl);
    setPdfSourceType('remote');
    setIsRecoveringPdf(false);
  }, [normalizedUrl]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        if (cancelled) return;
        if (!voices || voices.length === 0) {
          setSpeechReady(false);
          setSpeechIssue('No text-to-speech voice found on this device');
          return;
        }
        const preferredPrefix = contentLanguage === 'hi' ? 'hi' : 'en';
        const preferred =
          voices.find((v: any) => typeof v?.language === 'string' && v.language.toLowerCase().startsWith(preferredPrefix)) ||
          voices[0];
        const resolvedLanguage = preferred?.language || (contentLanguage === 'hi' ? 'hi-IN' : 'en-US');
        setSpeechSettings({ language: resolvedLanguage, voice: preferred?.identifier });
        setSpeechReady(true);
        setSpeechIssue(null);
        if (contentLanguage === 'hi' && !resolvedLanguage.toLowerCase().startsWith('hi')) {
          setSpeechNotice('Hindi voice not found on this device. Audio uses available fallback voice.');
        } else {
          setSpeechNotice(null);
        }
      } catch (e: any) {
        if (cancelled) return;
        setSpeechReady(true);
        setSpeechIssue(e?.message || 'Unable to verify available voices');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contentLanguage]);

  const stopSpeech = useCallback(() => {
    speechRequestRef.current += 1;
    speechSessionRef.current += 1;
    Speech.stop();
    if (speechStartWatchRef.current) {
      clearTimeout(speechStartWatchRef.current);
      speechStartWatchRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const speakFromIndex = useCallback(async (startIndex: number) => {
    if (!chunks.length) return;
    if (!speechReady) {
      setIsPlaying(false);
      setSpeechIssue('Text-to-speech is not ready on this device');
      Alert.alert('Voice Playback', 'Text-to-speech is not ready. Please check TTS engine and media volume.');
      return;
    }
    setSpeechIssue(null);
    const safeIndex = Math.max(0, Math.min(startIndex, chunks.length - 1));
    const requestId = speechRequestRef.current + 1;
    speechRequestRef.current = requestId;
    try {
      await Speech.stop();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (speechRequestRef.current !== requestId) return;
    if (speechStartWatchRef.current) {
      clearTimeout(speechStartWatchRef.current);
      speechStartWatchRef.current = null;
    }
    const sessionId = speechSessionRef.current + 1;
    speechSessionRef.current = sessionId;
    setIsPlaying(false);
    const speakNext = (index: number) => {
      if (speechSessionRef.current !== sessionId) return;
      if (index >= chunks.length) {
        setIsPlaying(false);
        return;
      }
      setCurrentIndex(index);
      let started = false;
      speechStartWatchRef.current = setTimeout(() => {
        if (speechSessionRef.current !== sessionId || started) return;
        setIsPlaying(false);
        setSpeechIssue('No audio output detected. Check emulator media volume and device TTS engine.');
      }, 2600);
      Speech.speak(chunks[index].text, {
        language: speechSettings.language || 'en-US',
        voice: speechSettings.voice,
        volume: 1,
        rate: 0.95,
        pitch: 1,
        onStart: () => {
          if (speechSessionRef.current !== sessionId) return;
          started = true;
          if (speechStartWatchRef.current) {
            clearTimeout(speechStartWatchRef.current);
            speechStartWatchRef.current = null;
          }
          setIsPlaying(true);
        },
        onDone: () => {
          if (speechSessionRef.current !== sessionId) return;
          if (speechStartWatchRef.current) {
            clearTimeout(speechStartWatchRef.current);
            speechStartWatchRef.current = null;
          }
          speakNext(index + 1);
        },
        onStopped: () => {
          if (speechSessionRef.current !== sessionId) return;
          if (speechStartWatchRef.current) {
            clearTimeout(speechStartWatchRef.current);
            speechStartWatchRef.current = null;
          }
          setIsPlaying(false);
        },
        onError: () => {
          if (speechSessionRef.current !== sessionId) return;
          if (speechStartWatchRef.current) {
            clearTimeout(speechStartWatchRef.current);
            speechStartWatchRef.current = null;
          }
          setSpeechIssue('Speech failed to start. Check device TTS engine configuration.');
          setIsPlaying(false);
        },
      });
    };
    speakNext(safeIndex);
  }, [chunks, speechReady, speechSettings.language, speechSettings.voice]);

  useEffect(() => {
    return () => {
      speechSessionRef.current += 1;
      Speech.stop();
      if (speechStartWatchRef.current) {
        clearTimeout(speechStartWatchRef.current);
        speechStartWatchRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        stopSpeech();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [stopSpeech]);

  useEffect(() => {
    if (!chunks.length) return;
    const y = chunkYRef.current[currentIndex];
    if (typeof y === 'number') {
      chunkScrollRef.current?.scrollTo({ y: Math.max(0, y - 72), animated: true });
    }
  }, [currentIndex, chunks.length]);

  useEffect(() => {
    if (!readerMode) return;
    if (!chunks.length) return;
    const y = readerChunkYRef.current[currentIndex];
    if (typeof y === 'number') {
      readerScrollRef.current?.scrollTo({ y: Math.max(0, y - 96), animated: true });
    }
  }, [currentIndex, chunks.length, readerMode]);

  const saveProgress = async (page: number) => {
    if (user && materialId) {
      await dataService.updateProgress(user.id, materialId, 'reading', page);
    }
  };

  const handlePageChange = (page: number, total: number) => {
    setCurrentPage(page);
    setTotalPages(total);
    setInputPage(String(page));
    saveProgress(page);
  };

  const goToPage = () => {
    const p = parseInt(inputPage);
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      if (interactiveReader && pdfJsViewerReadyRef.current) {
        setCurrentPage(p);
        pdfJsViewerRef.current?.postMessage(JSON.stringify({ type: 'render', page: p }));
      } else {
        pdfRef.current?.setPage(p);
      }
    } else {
      setInputPage(String(currentPage));
    }
  };

  const handleTapChunk = (index: number) => {
    setCurrentIndex(index);
    void speakFromIndex(index);
  };

  const startFromCharIndex = useCallback(
    (charIndex: number) => {
      if (!chunks.length) return;
      let idx = 0;
      for (let i = 0; i < chunks.length; i += 1) {
        if (chunks[i].start <= charIndex) idx = i;
        else break;
      }
      void speakFromIndex(idx);
    },
    [chunks, speakFromIndex]
  );

  const handlePdfSelection = useCallback(
    (phrase: string) => {
      const source = extractedText || '';
      const needle = (phrase || '').trim().replace(/\s+/g, ' ');
      if (!needle) return;
      const index = source.indexOf(needle);
      if (index >= 0) {
        startFromCharIndex(index);
        return;
      }
      const firstWord = needle.split(/\s+/).filter(Boolean)[0] || '';
      if (!firstWord) return;
      const fallbackIndex = source.indexOf(firstWord);
      if (fallbackIndex >= 0) {
        startFromCharIndex(fallbackIndex);
      }
    },
    [extractedText, startFromCharIndex]
  );

  const handlePlay = () => {
    if (!chunks.length) return;
    const start = currentIndex >= chunks.length ? 0 : currentIndex;
    void speakFromIndex(start);
  };

  const handlePause = () => {
    stopSpeech();
  };

  const handleResume = () => {
    if (!chunks.length) return;
    void speakFromIndex(currentIndex);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ 
        title: title || 'Document',
        headerStyle: { backgroundColor: theme.colors.primary },
        headerTintColor: '#fff',
      }} />

      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          {isRecoveringPdf ? (
            <>
              <Text style={{ marginTop: 12, color: theme.colors.onSurface, textAlign: 'center', paddingHorizontal: 24 }}>
                Remote PDF failed. Retrying with secure local download...
              </Text>
              <Button mode="text" onPress={() => Linking.openURL(normalizedUrl)} style={{ marginTop: 8 }}>
                Open In Browser
              </Button>
            </>
          ) : null}
        </View>
      )}

      {!normalizedUrl ? (
        <View style={[styles.loader, { zIndex: 0 }]}>
            <Text style={{ color: theme.colors.error }}>Error: No PDF URL provided</Text>
        </View>
      ) : isExpoGo ? (
        <View style={[styles.loader, { zIndex: 0, paddingHorizontal: 24 }]}>
          <Text style={{ textAlign: 'center', color: theme.colors.onSurface, marginBottom: 16 }}>
            PDF viewing needs a development build. Open this file in your browser for now.
          </Text>
          <Button mode="contained" onPress={() => Linking.openURL(normalizedUrl)}>
            Open PDF
          </Button>
        </View>
      ) : pdfLoadError ? (
        <View style={[styles.loader, { zIndex: 0, paddingHorizontal: 24 }]}>
          <Text style={{ textAlign: 'center', color: theme.colors.error, marginBottom: 16 }}>
            Failed to open PDF: {pdfLoadError}
          </Text>
          <Button mode="outlined" onPress={() => Linking.openURL(normalizedUrl)}>
            Open PDF
          </Button>
        </View>
      ) : readerMode && chunks.length > 0 ? (
        <ScrollView ref={readerScrollRef} style={styles.pdf} contentContainerStyle={{ padding: 16 }}>
          {chunks.map((chunk, index) => {
            const active = currentIndex === index;
            const wordRegex = /\S+/g;
            const words: { word: string; start: number }[] = [];
            let match: RegExpExecArray | null;
            while ((match = wordRegex.exec(chunk.text)) !== null) {
              words.push({ word: match[0], start: chunk.start + match.index });
            }
            return (
              <Pressable
                key={chunk.id}
                onLayout={(event) => {
                  readerChunkYRef.current[index] = event.nativeEvent.layout.y;
                }}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  marginBottom: 8,
                  backgroundColor: active ? theme.colors.primaryContainer : 'transparent',
                }}
              >
                <Text style={{ color: active ? theme.colors.onPrimaryContainer : theme.colors.onSurface, lineHeight: 22 }}>
                  {words.map((w, wi) => (
                    <Text
                      key={`${chunk.id}_${wi}`}
                      onPress={() => startFromCharIndex(w.start)}
                      style={{
                        backgroundColor: active ? 'transparent' : 'transparent',
                        textDecorationLine: 'none',
                      }}
                    >
                      {w.word}{' '}
                    </Text>
                  ))}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : interactiveReader && interactivePdfBase64 ? (
        <WebView
          ref={(ref) => {
            pdfJsViewerRef.current = ref;
          }}
          source={{ html: PDFJS_VIEWER_HTML }}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data?.type === 'viewer_ready') {
                pdfJsViewerReadyRef.current = true;
                pdfJsViewerRef.current?.postMessage(
                  JSON.stringify({ type: 'load', base64: interactivePdfBase64, page: currentPage })
                );
                return;
              }
              if (data?.type === 'select') {
                handlePdfSelection(data?.phrase || '');
                return;
              }
              if (data?.type === 'rendered') {
                if (typeof data?.numPages === 'number' && data.numPages > 0) {
                  setTotalPages(data.numPages);
                }
                if (typeof data?.page === 'number' && data.page > 0) {
                  setCurrentPage(data.page);
                  setInputPage(String(data.page));
                }
                return;
              }
              if (data?.type === 'debug' && __DEV__) {
                console.log('[PDFJS_VIEWER]', data.payload);
              }
            } catch {}
          }}
          style={styles.pdf}
          javaScriptEnabled
          originWhitelist={['*']}
        />
      ) : PdfComponent ? (
        <PdfComponent
          ref={pdfRef}
          source={{ uri: pdfSourceUri || normalizedUrl, cache: true }}
          onLoadComplete={(numberOfPages: number) => {
            setTotalPages(numberOfPages);
            setLoading(false);
            setPdfLoadError(null);
            setIsRecoveringPdf(false);
            if (currentPage > 1) {
              pdfRef.current?.setPage(currentPage);
            }
          }}
          onPageChanged={(page: number, numberOfPages: number) => {
            handlePageChange(page, numberOfPages);
          }}
          onError={(error: any) => {
            console.log('PDF Error:', error);
            const message = typeof error === 'string' ? error : error?.message || String(error);
            if (pdfSourceType === 'remote' && normalizedUrl.startsWith('http') && !isRecoveringPdf) {
              setPdfLoadError(null);
              setIsRecoveringPdf(true);
              setLoading(true);
              (async () => {
                try {
                  const base = materialId || title || 'document';
                  const safe = base.replace(/[^a-zA-Z0-9_-]/g, '_');
                  const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
                  if (!cacheDir) {
                    throw new Error('No writable cache directory available');
                  }
                  const localUri = `${cacheDir}pdf_${safe}.pdf`;
                  await FileSystem.downloadAsync(normalizedUrl, localUri);
                  setPdfSourceUri(localUri);
                  setPdfSourceType('local');
                  setLoading(true);
                } catch (downloadError: any) {
                  const downloadMessage = downloadError?.message || 'Unknown download error';
                  const mergedMessage = `${message}. Fallback download failed: ${downloadMessage}`;
                  setLoading(false);
                  setPdfLoadError(mergedMessage);
                  Alert.alert('Error', `Failed to load PDF: ${mergedMessage}`);
                } finally {
                  setIsRecoveringPdf(false);
                }
              })();
              return;
            }
            setLoading(false);
            setPdfLoadError(message);
            Alert.alert('Error', `Failed to load PDF: ${message}`);
          }}
          onPressLink={(uri: string) => {
            console.log(`Link pressed: ${uri}`);
          }}
          style={styles.pdf}
          trustAllCerts={false}
          enablePaging={true}
          horizontal={true}
          spacing={0}
          fitPolicy={0}
          scale={1}
          minScale={1}
          maxScale={3}
        />
      ) : (
        <View style={[styles.loader, { zIndex: 0 }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}

      {/* Bottom Controls Overlay */}
      {(PdfComponent || (interactiveReader && interactivePdfBase64)) && !isExpoGo ? (
      <View style={styles.controlsOverlay}>
        <Surface style={styles.controls} elevation={4}>
          <IconButton 
            icon="chevron-left" 
            size={24}
            onPress={() => {
              const prev = currentPage - 1;
              if (prev >= 1) {
                if (interactiveReader && pdfJsViewerReadyRef.current) {
                  setCurrentPage(prev);
                  setInputPage(String(prev));
                  pdfJsViewerRef.current?.postMessage(JSON.stringify({ type: 'render', page: prev }));
                } else {
                  pdfRef.current?.setPage(prev);
                }
              }
            }}
            disabled={currentPage <= 1}
          />
          
          <View style={styles.pageInputContainer}>
            <TextInput
              value={inputPage}
              onChangeText={setInputPage}
              onEndEditing={goToPage}
              keyboardType="numeric"
              style={styles.pageInput}
              dense
              mode="outlined"
              contentStyle={{ textAlign: 'center' }}
            />
            <Text style={{ marginLeft: 8, color: '#333' }}>/ {totalPages}</Text>
          </View>

          <IconButton 
            icon="chevron-right" 
            size={24}
            onPress={() => {
              const next = currentPage + 1;
              if (next <= totalPages) {
                if (interactiveReader && pdfJsViewerReadyRef.current) {
                  setCurrentPage(next);
                  setInputPage(String(next));
                  pdfJsViewerRef.current?.postMessage(JSON.stringify({ type: 'render', page: next }));
                } else {
                  pdfRef.current?.setPage(next);
                }
              }
            }}
            disabled={currentPage >= totalPages}
          />
        </Surface>
      </View>
      ) : null}

      {!isExpoGo ? (
        <View style={styles.readerOverlay}>
          <Surface style={[styles.readerPanel, { backgroundColor: theme.colors.surface }]} elevation={4}>
            <View style={styles.readerHeader}>
              <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>Voice Reader</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {textMode === 'pdf' ? `Source: PDF text (${contentLanguage.toUpperCase()})` : `Source: fallback text (${contentLanguage.toUpperCase()})`}
              </Text>
            </View>
            <View style={styles.playbackRow}>
              <Button mode="contained" onPress={handlePlay} disabled={isPlaying || textLoading || chunks.length === 0}>
                Play
              </Button>
              <Button mode="outlined" onPress={handlePause} disabled={!isPlaying}>
                Pause
              </Button>
              <Button mode="outlined" onPress={handleResume} disabled={isPlaying || chunks.length === 0}>
                Resume
              </Button>
              <Button mode="text" onPress={() => setReloadTextKey((v) => v + 1)} disabled={textLoading}>
                Reload
              </Button>
              <Button
                mode={readerMode ? 'contained' : 'outlined'}
                onPress={() => setReaderMode((v) => !v)}
                disabled={textLoading || chunks.length === 0}
              >
                Reader
              </Button>
              <Button
                mode={interactiveReader ? 'contained' : 'outlined'}
                onPress={() => setInteractiveReader((v) => !v)}
                disabled={!interactivePdfBase64}
              >
                PDF Tap
              </Button>
            </View>
            {textLoading ? (
              <View style={styles.readerLoader}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
              </View>
            ) : (
              <ScrollView ref={chunkScrollRef} style={styles.chunkScroll} contentContainerStyle={styles.chunkContent}>
                {!speechReady ? (
                  <Text style={{ color: theme.colors.error, marginBottom: 10 }}>
                    Text-to-speech is initializing. If no audio, raise emulator media volume.
                  </Text>
                ) : null}
                {speechNotice ? (
                  <Text style={{ color: theme.colors.primary, marginBottom: 10 }}>{speechNotice}</Text>
                ) : null}
                {speechIssue ? (
                  <Text style={{ color: theme.colors.error, marginBottom: 10 }}>{speechIssue}</Text>
                ) : null}
                {extractionIssue ? (
                  <Text style={{ color: theme.colors.error, marginBottom: 10 }}>{extractionIssue}</Text>
                ) : null}
                {textError ? (
                  <Text style={{ color: theme.colors.error, marginBottom: 10 }}>{textError}</Text>
                ) : null}
                {chunks.map((chunk, index) => {
                  const active = currentIndex === index;
                  return (
                    <Pressable
                      key={chunk.id}
                      onPress={() => handleTapChunk(index)}
                      onLayout={(event) => {
                        chunkYRef.current[index] = event.nativeEvent.layout.y;
                      }}
                      style={[
                        styles.chunkItem,
                        { backgroundColor: active ? theme.colors.primaryContainer : 'transparent' },
                      ]}
                    >
                      <Text style={{ color: active ? theme.colors.onPrimaryContainer : theme.colors.onSurface }}>
                        {chunk.text}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </Surface>
        </View>
      ) : null}
      {!isExpoGo ? (
        <WebView
          ref={(ref) => {
            pdfJsWebViewRef.current = ref;
          }}
          source={{ html: PDFJS_EXTRACTOR_HTML }}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data?.type === 'debug' && __DEV__) {
                console.log('[PDFJS]', data.payload);
              }
              if (data?.type === 'ready') {
                pdfJsReadyRef.current = !!data.ok;
                const waiters = pdfJsReadyWaitersRef.current;
                pdfJsReadyWaitersRef.current = [];
                for (const notify of waiters) notify();
                return;
              }
              if (data?.type === 'result') {
                const pending = pdfJsPendingRef.current;
                if (!pending || pending.requestId !== data.requestId) return;
                clearTimeout(pending.timeout);
                pdfJsPendingRef.current = null;
                pending.resolve(data);
              }
            } catch {}
          }}
          onError={(event) => {
            if (__DEV__) console.log('[PDFJS] webview_error', event.nativeEvent);
          }}
          onHttpError={(event) => {
            if (__DEV__) console.log('[PDFJS] webview_http_error', event.nativeEvent);
          }}
          style={styles.hiddenWebView}
          javaScriptEnabled
          originWhitelist={['*']}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pdf: {
    flex: 1,
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    backgroundColor: 'white',
  },
  controlsOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 3,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 4,
    borderRadius: 28,
    backgroundColor: 'white',
    width: '80%',
    maxWidth: 400,
  },
  pageInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pageInput: {
    width: 60,
    height: 40,
    backgroundColor: 'white',
    fontSize: 16,
  },
  readerOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 84,
    zIndex: 2,
  },
  readerPanel: {
    borderRadius: 16,
    padding: 12,
    minHeight: 170,
    maxHeight: 300,
  },
  readerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  playbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  readerLoader: {
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chunkScroll: {
    maxHeight: 180,
  },
  chunkContent: {
    paddingBottom: 10,
  },
  chunkItem: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  hiddenWebView: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    left: -10,
    top: -10,
  },
});
