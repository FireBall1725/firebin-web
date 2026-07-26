// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Shared mapping from a part (category + name) to a default component symbol and
// tint colour, used by the parts views, the part form, and the symbol picker.

// [regex over "category + name", symbol filename, colour key].
export const CAT_STYLES: [RegExp, string, string][] = [
  [/resistor/, 'resistor', 'res'],
  [/potentiometer|trimpot|rheostat/, 'potentiometer', 'res'],
  [/thermistor|\bntc\b|\bptc\b|varistor/, 'thermistor', 'res'],
  [/capacitor|\bcap\b/, 'capacitor', 'cap'],
  [/inductor|choke|ferrite/, 'inductor', 'cap'],
  [/transformer/, 'transformer', 'cap'],
  [/crystal|oscillator|resonator/, 'crystal', 'cap'],
  [/antenna/, 'antenna', 'cap'],
  [/\bleds?\b/, 'led', 'reg'],
  [/photodiode/, 'photodiode', 'reg'],
  [/zener/, 'zener', 'reg'],
  [/schottky/, 'schottky', 'reg'],
  [/bridge/, 'bridge', 'reg'],
  [/diode|rectifier/, 'diode', 'reg'],
  [/mosfet/, 'mosfet-n', 'reg'],
  [/triac/, 'triac', 'reg'],
  [/thyristor|\bscrs?\b/, 'scr', 'reg'],
  [/transistor|\bbjt\b/, 'transistor-npn', 'reg'],
  [/regulator|\bldo\b|\bpmic\b/, 'regulator', 'reg'],
  [/op-?amp|amplifier/, 'opamp', 'reg'],
  [/opto/, 'optocoupler', 'reg'],
  [/batter(y|ies)/, 'battery', 'reg'],
  [/solar/, 'solar-cell', 'reg'],
  [/logic|\bgate\b|\bnand\b|\bnor\b|inverter/, 'logic-gate', 'mod'],
  [/\bic\b|integrated circuit/, 'ic', 'mod'],
  [/module|esp32|esp8266|\bmcu\b|microcontroller|processor|\bfpga\b/, 'mcu', 'mod'],
  [/relay/, 'relay', 'con'],
  [/pin header|\bheaders?\b/, 'header', 'con'],
  [/pushbutton|push[- ]?button|tactile/, 'pushbutton', 'con'],
  [/connector|jack|socket|\busb\b|receptacle|terminal/, 'connector', 'con'],
  [/switch|button/, 'switch', 'con'],
  [/fuse/, 'fuse', 'con'],
  [/motor/, 'motor', 'mod'],
  [/speaker/, 'speaker', 'mod'],
  [/buzzer|piezo/, 'buzzer', 'mod'],
  [/microphone|\bmic\b/, 'microphone', 'mod'],
  [/lamp|bulb/, 'lamp', 'mod'],
]

export const symbolSrc = (key: string) => `/symbols/${key}.svg`

// Curated starter categories offered in the part form's category picker. These are
// SUGGESTIONS only — no rows are seeded up front, so the category rail stays empty on
// a fresh install; a real category row is created (get-or-create) the first time a
// part is assigned to one. Every name is chosen to hit a CAT_STYLES regex above so the
// component symbol resolves automatically. Ordered by family for a readable dropdown.
// Skips schematic-only symbols (ground, test-point) that aren't inventoried parts.
export const CATEGORY_SUGGESTIONS: string[] = [
  // Passives
  'Resistors', 'Potentiometers', 'Thermistors', 'Capacitors', 'Inductors',
  'Ferrite Beads', 'Transformers', 'Crystals', 'Oscillators',
  // Semiconductors
  'Diodes', 'Schottky Diodes', 'Zener Diodes', 'LEDs', 'Photodiodes',
  'Bridge Rectifiers', 'Transistors', 'MOSFETs', 'SCRs', 'Triacs',
  // ICs
  'Integrated Circuits', 'Microcontrollers', 'Op-Amps', 'Voltage Regulators',
  'Logic Gates', 'Optocouplers',
  // Electromechanical
  'Connectors', 'Headers', 'Switches', 'Pushbuttons', 'Relays', 'Fuses',
  // Transducers and power
  'Batteries', 'Motors', 'Speakers', 'Buzzers', 'Microphones', 'Lamps',
  'Solar Cells', 'Antennas',
]

// The picker tints each cell by its manifest category so the grid is colour-coded.
export const CATEGORY_COLOR: Record<string, string> = {
  Passives: 'var(--cat-cap)',
  Semiconductors: 'var(--cat-reg)',
  ICs: 'var(--cat-mod)',
  Electromechanical: 'var(--cat-con)',
  Transducers: 'var(--cat-res)',
  'Power & misc': 'var(--cat-def)',
}

// Every symbol's category, so a part's tint is the SAME colour as its symbol in
// the picker (aligned everywhere), not a separate part-type bucket.
export const KEY_CATEGORY: Record<string, string> = {
  resistor: 'Passives', potentiometer: 'Passives', capacitor: 'Passives', 'cap-pol': 'Passives',
  'cap-var': 'Passives', inductor: 'Passives', ferrite: 'Passives', transformer: 'Passives',
  crystal: 'Passives', oscillator: 'Passives', thermistor: 'Passives',
  diode: 'Semiconductors', zener: 'Semiconductors', schottky: 'Semiconductors', led: 'Semiconductors',
  photodiode: 'Semiconductors', bridge: 'Semiconductors', 'transistor-npn': 'Semiconductors',
  'transistor-pnp': 'Semiconductors', 'mosfet-n': 'Semiconductors', 'mosfet-p': 'Semiconductors',
  scr: 'Semiconductors', triac: 'Semiconductors',
  ic: 'ICs', mcu: 'ICs', opamp: 'ICs', regulator: 'ICs', 'logic-gate': 'ICs', optocoupler: 'ICs',
  switch: 'Electromechanical', pushbutton: 'Electromechanical', 'switch-spdt': 'Electromechanical',
  relay: 'Electromechanical', connector: 'Electromechanical', header: 'Electromechanical', fuse: 'Electromechanical',
  motor: 'Transducers', speaker: 'Transducers', buzzer: 'Transducers', antenna: 'Transducers',
  lamp: 'Transducers', microphone: 'Transducers',
  battery: 'Power & misc', ground: 'Power & misc', 'test-point': 'Power & misc', 'solar-cell': 'Power & misc',
}

export const symbolColor = (key: string): string => CATEGORY_COLOR[KEY_CATEGORY[key]] ?? 'var(--cat-def)'

// A part with no chosen symbol falls back to one from the bundled set, matched by
// its category/name, tinted by its symbol's category colour (matches the picker).
export function catStyle(catName: string | undefined, partName: string): { key: string; color: string } {
  const s = `${catName ?? ''} ${partName}`.toLowerCase()
  for (const [re, key] of CAT_STYLES) if (re.test(s)) return { key, color: symbolColor(key) }
  return { key: 'ic', color: symbolColor('ic') }
}
