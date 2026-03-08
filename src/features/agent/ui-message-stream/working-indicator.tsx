import { memo, useEffect, useRef, useState } from 'react';

const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const PHRASES = [
  'Contemplating the void...',
  'Reticulating splines...',
  'Summoning tokens...',
  'Herding electrons...',
  'Untangling the spaghetti...',
  'Consulting ancient docs...',
  'Negotiating with entropy...',
  'Warming up the neurons...',
  'Definitely not panicking...',
  'Having an existential moment...',
  'Reading between the lines...',
  'Squashing imaginary bugs...',
  'Making the compiler happy...',
  'Counting tokens instead of sheep...',
  'Solving P=NP on the side...',
  'Pretending this is easy...',
  'Staring into the context window...',
  'Recursively thinking about thinking...',
  'Vibing with the weights...',
  'Doing math. A lot of math.',
  'Asking the rubber duck...',
  'Compiling thoughts...',
  'Refactoring reality...',
  'Checking Stack Overflow...',
  'Deploying to imagination...',
  'Buffering brilliance...',
  'Aligning the bits...',
  'Pondering semicolons...',
  'Feeding the hamsters...',
  'Calibrating the flux capacitor...',
];

const BRAILLE_INTERVAL_MS = 80;
const PHRASE_VISIBLE_MS = 3_500;
const LETTER_STAGGER_MS = 10;
const LETTER_ANIM_MS = 220;

/** Pick a random index that differs from `exclude`. */
function pickRandom(exclude: number, count: number): number {
  if (count <= 1) return 0;
  let next: number;
  do {
    next = Math.floor(Math.random() * count);
  } while (next === exclude);
  return next;
}

type Phase = 'entering' | 'idle' | 'exiting';

export const WorkingIndicator = memo(function WorkingIndicator() {
  const [brailleIdx, setBrailleIdx] = useState(0);
  const [phraseIdx, setPhraseIdx] = useState(() =>
    Math.floor(Math.random() * PHRASES.length),
  );
  const [phase, setPhase] = useState<Phase>('entering');
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Braille spinner tick
  useEffect(() => {
    const id = setInterval(() => {
      setBrailleIdx((i) => (i + 1) % BRAILLE_FRAMES.length);
    }, BRAILLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Phase state machine: entering → idle → exiting → (swap phrase) → entering …
  useEffect(() => {
    const len = PHRASES[phraseIdx].length;
    const waveDuration = len * LETTER_STAGGER_MS + LETTER_ANIM_MS;

    if (phase === 'entering') {
      timeoutRef.current = setTimeout(() => setPhase('idle'), waveDuration);
    } else if (phase === 'idle') {
      timeoutRef.current = setTimeout(
        () => setPhase('exiting'),
        PHRASE_VISIBLE_MS,
      );
    } else {
      // exiting → swap phrase → entering
      timeoutRef.current = setTimeout(() => {
        setPhraseIdx((prev) => pickRandom(prev, PHRASES.length));
        setPhase('entering');
      }, waveDuration);
    }

    return () => clearTimeout(timeoutRef.current);
  }, [phase, phraseIdx]);

  const phrase = PHRASES[phraseIdx];

  return (
    <span className="flex items-center gap-1.5">
      <span className="font-mono text-xs text-sky-400 select-none" aria-hidden>
        {BRAILLE_FRAMES[brailleIdx]}
      </span>
      <span
        className="inline-flex overflow-hidden text-xs text-neutral-400"
        aria-label={phrase}
      >
        {phrase.split('').map((char, i) => (
          <span
            key={`${phraseIdx}-${i}`}
            className={`inline-block ${
              phase === 'exiting'
                ? 'animate-letter-exit'
                : phase === 'entering'
                  ? 'animate-letter-enter'
                  : ''
            }`}
            style={
              phase !== 'idle'
                ? { animationDelay: `${i * LETTER_STAGGER_MS}ms` }
                : undefined
            }
            aria-hidden
          >
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
      </span>
    </span>
  );
});
