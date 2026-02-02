// src/lib/keyboard-bindings/types.ts

import type { RefObject } from 'react';

// Letter keys
type LetterKey =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'h'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'
  | 'p'
  | 'q'
  | 'r'
  | 's'
  | 't'
  | 'u'
  | 'v'
  | 'w'
  | 'x'
  | 'y'
  | 'z';

// Number keys
type NumberKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

// Special keys
type SpecialKey =
  | 'enter'
  | 'escape'
  | 'tab'
  | 'space'
  | 'backspace'
  | 'delete'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | '['
  | ']'
  | '\\'
  | '/'
  | '.'
  | ','
  | '?'
  | 'f1'
  | 'f2'
  | 'f3'
  | 'f4'
  | 'f5'
  | 'f6'
  | 'f7'
  | 'f8'
  | 'f9'
  | 'f10'
  | 'f11'
  | 'f12';

// Base key (letter, number, or special)
type BaseKey = LetterKey | NumberKey | SpecialKey;

// Binding key combinations (order enforced: cmd > ctrl > alt > shift > base)
export type BindingKey =
  | BaseKey
  | `shift+${BaseKey}`
  | `alt+${BaseKey}`
  | `alt+shift+${BaseKey}`
  | `ctrl+${BaseKey}`
  | `ctrl+shift+${BaseKey}`
  | `ctrl+alt+${BaseKey}`
  | `ctrl+alt+shift+${BaseKey}`
  | `cmd+${BaseKey}`
  | `cmd+shift+${BaseKey}`
  | `cmd+alt+${BaseKey}`
  | `cmd+alt+shift+${BaseKey}`
  | `cmd+ctrl+${BaseKey}`
  | `cmd+ctrl+shift+${BaseKey}`
  | `cmd+ctrl+alt+${BaseKey}`
  | `cmd+ctrl+alt+shift+${BaseKey}`;

// Handler returns true if event was handled (stops propagation)
export type BindingHandler = (event: KeyboardEvent) => boolean | void;

// Binding config object with options
export interface BindingConfig {
  handler: BindingHandler;
  /** If true, skip this binding when focus is on an input/textarea */
  ignoreIfInput?: boolean;
}

// Binding value can be a handler function or a config object
export type BindingValue = BindingHandler | BindingConfig;

// Record of bindings
export type Bindings = Partial<Record<BindingKey, BindingValue>>;

// Internal context registration
export interface BindingContext {
  id: string;
  bindings: RefObject<Bindings>;
}
