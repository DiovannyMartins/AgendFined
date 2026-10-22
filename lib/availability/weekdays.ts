// value is the DB weekday (Sunday=1 .. Saturday=7); only the name is shown.
export const WEEKDAYS: { value: number; name: string }[] = [
  { value: 1, name: "Domingo" },
  { value: 2, name: "Segunda" },
  { value: 3, name: "Terça" },
  { value: 4, name: "Quarta" },
  { value: 5, name: "Quinta" },
  { value: 6, name: "Sexta" },
  { value: 7, name: "Sábado" },
];

export function weekdayName(weekday: number): string {
  return WEEKDAYS.find((d) => d.value === weekday)?.name ?? String(weekday);
}
