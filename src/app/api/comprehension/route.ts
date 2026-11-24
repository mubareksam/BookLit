import { NextRequest, NextResponse } from 'next/server';

/**
 * Generates a strictly passage-grounded factual micro-check question from a verified excerpt.
 * Never invents facts outside the provided text.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { excerpt?: string; bookTitle?: string };
    const excerpt = (body.excerpt ?? '').trim();

    if (excerpt.length < 30) {
      return NextResponse.json(
        { error: 'Passage excerpt too short to construct a grounded checkpoint.' },
        { status: 400 }
      );
    }

    // Extract substantive words directly from the excerpt so nothing outside the text is ever asserted
    const sentences = excerpt
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20);
    const targetSentence = sentences[0] || excerpt;

    const words = targetSentence.split(/\s+/);
    const keyWordIdx = words.findIndex(
      (w, idx) => idx >= 2 && w.replace(/[^a-zA-Z]/g, '').length >= 6
    );
    const chosenIdx = keyWordIdx !== -1 ? keyWordIdx : Math.floor(words.length / 2);
    const cleanTarget = words[chosenIdx].replace(/[^a-zA-Z0-9-]/g, '');

    const blanked = words
      .map((w, idx) => (idx === chosenIdx ? '________' : w))
      .join(' ');

    const distractors = ['chronology', 'ornament', 'velocity', 'speculation'].filter(
      (d) => d.toLowerCase() !== cleanTarget.toLowerCase()
    );

    const options = [cleanTarget, distractors[0], distractors[1]];

    return NextResponse.json({
      question: {
        prompt: `Complete the exact phrase from the passage you just read: "${blanked}"`,
        options,
        correctIndex: 0,
        explanation: `Grounded directly in your passage excerpt: "${targetSentence}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Comprehension generation failed' }, { status: 400 });
  }
}
