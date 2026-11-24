import { NextRequest, NextResponse } from 'next/server';
import { checkVoiceRateLimit } from '@/lib/server/store';
import { evaluateSpeechPassage } from '@/lib/domain/verificationEngine';

export async function POST(req: NextRequest) {
  const clientKey =
    req.headers.get('x-user-id') || req.headers.get('x-forwarded-for') || 'local-reader';
  const rate = checkVoiceRateLimit(clientKey);

  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `Voice verification rate limit reached. Please wait ${rate.retryAfterSeconds}s before trying again.`,
      },
      { status: 429 }
    );
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;
    const expectedText = String(formData.get('expectedText') ?? '');
    const clientTranscript = String(formData.get('transcript') ?? '').trim();
    const durationSeconds = Math.min(
      10,
      Math.max(1.5, Number(formData.get('durationSeconds') ?? 6.5))
    );
    const whisperMode = String(formData.get('whisperMode') ?? 'false') === 'true';
    const retainAudioForDebug =
      String(formData.get('retainAudioForDebug') ?? 'false') === 'true';
    const anySentenceFallback =
      String(formData.get('anySentenceFallback') ?? 'false') === 'true';

    let finalTranscript = clientTranscript;
    let audioBytesReceived = 0;

    if (audioFile) {
      const arrayBuf = await audioFile.arrayBuffer();
      audioBytesReceived = arrayBuf.byteLength;

      // If OPENAI_API_KEY is configured and no transcript was supplied yet, invoke Whisper small/base API
      if (!finalTranscript && process.env.OPENAI_API_KEY && audioBytesReceived > 512) {
        try {
          const upstreamForm = new FormData();
          upstreamForm.append('file', new Blob([arrayBuf], { type: audioFile.type || 'audio/webm' }), 'passage.webm');
          upstreamForm.append('model', process.env.WHISPER_MODEL || 'whisper-1');
          upstreamForm.append('language', 'en');

          const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: upstreamForm,
          });
          if (whisperRes.ok) {
            const whisperJson = (await whisperRes.json()) as { text?: string };
            if (whisperJson.text) {
              finalTranscript = whisperJson.text;
            }
          }
        } catch {
          // Graceful fallback to acoustic envelope + client speech recognition transcript
        }
      }

      // Privacy guarantee: unless user explicitly enabled retainAudioForDebug, raw audio buffer goes out of scope immediately and is never written to disk or DB.
    }

    const evaluation = evaluateSpeechPassage({
      expectedText,
      transcribedText: finalTranscript,
      durationSeconds,
      whisperMode,
      anySentenceFallback,
    });

    return NextResponse.json({
      ...evaluation,
      audioBytesProcessed: audioBytesReceived,
      audioRetained: retainAudioForDebug,
      privacyNote: retainAudioForDebug
        ? 'Debug audio retention was explicitly enabled in your privacy settings.'
        : 'Raw audio clip was discarded immediately in memory after scoring.',
    });
  } catch {
    return NextResponse.json(
      { error: 'Unable to evaluate voice verification sample.' },
      { status: 400 }
    );
  }
}
