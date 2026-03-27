
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Dimensions, Alert, Pressable, ScrollView, AppState } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useTheme, Text, TextInput, IconButton, Surface, Button } from 'react-native-paper';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '@/context/AuthContext';
import { dataService } from '@/lib/appwrite';

type SpeechChunk = { id: number; text: string };
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

const extractReadableText = async (sourceUrl: string, fallbackTitle: string, signal: AbortSignal) => {
  const response = await fetch(sourceUrl, { signal });
  if (!response.ok) {
    throw new Error(`Unable to load PDF text source (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  const decoded = decodeBufferToString(buffer);
  const titleLanguage = detectContentLanguage('', fallbackTitle);
  if (!decoded) {
    return {
      text: fallbackPdfText(fallbackTitle, titleLanguage),
      mode: 'fallback' as const,
      language: titleLanguage,
      extractionIssue: 'PDF text decoding failed',
    };
  }
  const parsed = parsePdfLikeText(decoded);
  const detectedLanguage = detectContentLanguage(parsed, fallbackTitle);
  if (isUsefulExtract(parsed)) {
    return { text: parsed, mode: 'pdf' as const, language: detectedLanguage, extractionIssue: null };
  }
  return {
    text: fallbackPdfText(fallbackTitle, detectedLanguage),
    mode: 'fallback' as const,
    language: detectedLanguage,
    extractionIssue: 'Readable chapter text was not extracted from this PDF',
  };
};

const toChunks = (rawText: string): SpeechChunk[] => {
  const normalized = rawText.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const sentences = normalized.match(/[^.!?]+[.!?]?/g) || [];
  const chunks: SpeechChunk[] = [];
  let id = 1;
  for (const sentenceRaw of sentences) {
    const sentence = sentenceRaw.trim();
    if (!sentence) continue;
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length <= 10) {
      chunks.push({ id, text: sentence });
      id += 1;
      continue;
    }
    for (let i = 0; i < words.length; i += 8) {
      const part = words.slice(i, i + 8).join(' ');
      chunks.push({ id, text: part });
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
  const [reloadTextKey, setReloadTextKey] = useState(0);
  const [speechIssue, setSpeechIssue] = useState<string | null>(null);
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const [speechReady, setSpeechReady] = useState(false);
  const [speechSettings, setSpeechSettings] = useState<{ language?: string; voice?: string }>({ language: 'en-US' });

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

  useEffect(() => {
    if (!normalizedUrl) {
      setChunks([]);
      setTextMode(null);
      return;
    }
    speechSessionRef.current += 1;
    Speech.stop();
    setIsPlaying(false);
    const controller = new AbortController();
    setTextLoading(true);
    setTextError(null);
    setExtractionIssue(null);
    (async () => {
      try {
        const extracted = await extractReadableText(normalizedUrl, title || 'Document', controller.signal);
        if (controller.signal.aborted) return;
        setContentLanguage(extracted.language || detectContentLanguage('', title || 'Document'));
        setExtractionIssue(extracted.extractionIssue || null);
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
  }, [normalizedUrl, title, reloadTextKey]);

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
      pdfRef.current?.setPage(p);
    } else {
      setInputPage(String(currentPage));
    }
  };

  const handleTapChunk = (index: number) => {
    setCurrentIndex(index);
    void speakFromIndex(index);
  };

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
      {PdfComponent && !isExpoGo ? (
      <View style={styles.controlsOverlay}>
        <Surface style={styles.controls} elevation={4}>
          <IconButton 
            icon="chevron-left" 
            size={24}
            onPress={() => {
              const prev = currentPage - 1;
              if (prev >= 1) pdfRef.current?.setPage(prev);
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
              if (next <= totalPages) pdfRef.current?.setPage(next);
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
});
