export type LetterKey =
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

export type NumberKey =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9';

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

export type BaseKey = LetterKey | NumberKey | SpecialKey;

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
