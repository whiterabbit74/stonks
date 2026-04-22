export type EntryCapitalModeOption = {
  value: string;
  label: string;
  shortLabel: string;
  description: string;
  hint: string;
  multiplier: number;
  reservePct: number;
};

export const DEFAULT_ENTRY_CAPITAL_MODE = 'standard_safe';

export const ENTRY_CAPITAL_MODE_OPTIONS: EntryCapitalModeOption[] = [
  {
    value: 'standard_safe',
    label: 'Стандартный',
    shortLabel: '100% с запасом 2.2%',
    description: 'Базовый режим. Покупка на 100% базового капитала, но с запасом 2.2% под правило Webull для market buy.',
    hint: 'Подходит как дефолт: уменьшает риск Insufficient Buying Power в последнюю минуту.',
    multiplier: 1,
    reservePct: 0.022,
  },
  {
    value: 'cash_100',
    label: '100% без коррекции',
    shortLabel: '100% без запаса',
    description: 'Покупка ровно на 100% базового капитала без дополнительного резерва.',
    hint: 'Агрессивнее стандартного режима. Может снова упереться в правило Webull +2% для market buy.',
    multiplier: 1,
    reservePct: 0,
  },
  {
    value: 'margin_125',
    label: 'Маржа 125%',
    shortLabel: '125% базового капитала',
    description: 'Покупка на 125% базового капитала. Полезно, если на аккаунте доступна маржа.',
    hint: 'Если фактический buying power ниже, сервер всё равно ограничит размер заявки сверху.',
    multiplier: 1.25,
    reservePct: 0,
  },
  {
    value: 'margin_150',
    label: 'Маржа 150%',
    shortLabel: '150% базового капитала',
    description: 'Покупка на 150% базового капитала для более активного использования маржи.',
    hint: 'Требует достаточный buying power на стороне брокера.',
    multiplier: 1.5,
    reservePct: 0,
  },
  {
    value: 'margin_175',
    label: 'Маржа 175%',
    shortLabel: '175% базового капитала',
    description: 'Покупка на 175% базового капитала.',
    hint: 'Подходит только для сценариев, где маржа действительно доступна и ожидаема.',
    multiplier: 1.75,
    reservePct: 0,
  },
  {
    value: 'margin_200',
    label: 'Маржа 200%',
    shortLabel: '200% базового капитала',
    description: 'Покупка на 200% базового капитала. Максимально агрессивный режим из предустановленных.',
    hint: 'Если реальный buying power меньше, размер всё равно будет зажат сверху брокерским лимитом.',
    multiplier: 2,
    reservePct: 0,
  },
];

export function getEntryCapitalModeOption(value: string | null | undefined): EntryCapitalModeOption {
  return ENTRY_CAPITAL_MODE_OPTIONS.find((item) => item.value === value) ?? ENTRY_CAPITAL_MODE_OPTIONS[0];
}
