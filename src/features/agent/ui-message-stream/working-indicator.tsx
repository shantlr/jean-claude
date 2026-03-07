import { memo, useEffect, useState } from 'react';

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
];

// Shuffle phrases once per session so the order is different each time
function shuffleOnce(arr: string[]): string[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const SHUFFLED_PHRASES = shuffleOnce(PHRASES);

const BRAILLE_INTERVAL_MS = 80;
const PHRASE_INTERVAL_MS = 3_500;

export const WorkingIndicator = memo(function WorkingIndicator() {
  const [brailleIndex, setBrailleIndex] = useState(0);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  // Braille spinner tick
  useEffect(() => {
    const id = setInterval(() => {
      setBrailleIndex((i) => (i + 1) % BRAILLE_FRAMES.length);
    }, BRAILLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Phrase rotation with a brief fade-out/in
  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setPhraseIndex((i) => (i + 1) % SHUFFLED_PHRASES.length);
        setVisible(true);
      }, 300);
    }, PHRASE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="flex items-center gap-1.5">
      <span className="font-mono text-xs text-sky-400 select-none" aria-hidden>
        {BRAILLE_FRAMES[brailleIndex]}
      </span>
      <span
        className="text-xs text-neutral-400 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {SHUFFLED_PHRASES[phraseIndex]}
      </span>
    </span>
  );
});
