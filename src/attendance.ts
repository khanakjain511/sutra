const dayLength = 86_400_000;
const dateKey = /^\d{4}-\d{2}-\d{2}$/;
const localDayFormatter = new Intl.DateTimeFormat('en-IN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Asia/Kolkata',
});

export const defaultWeekdays = [1, 2, 3, 4, 5] as const;

export type Subject = {
  id: string;
  name: string;
  weekdays: number[];
  startsOn: string;
  log: string[];
};

export function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !dateKey.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function currentDay(date = new Date()) {
  const parts = localDayFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function utcDate(day: string) {
  return new Date(`${day}T00:00:00Z`);
}

export function isScheduledDay(
  day: string,
  schedule: readonly number[] = defaultWeekdays,
) {
  return isDay(day) && schedule.includes(utcDate(day).getUTCDay());
}

function calendarDays(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(isDay))
    throw new Error('Invalid attendance history');
  return [...new Set(value)].sort();
}

export function readLog(raw: string | null) {
  return raw === null ? [] : calendarDays(JSON.parse(raw));
}

function weekdays(values: unknown) {
  if (
    !Array.isArray(values) ||
    !values.length ||
    values.some(
      (day: unknown) =>
        typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6,
    )
  )
    throw new Error('Select at least one class day.');
  return [...new Set<number>(values)].sort((a, b) => a - b);
}

function subjectName(value: string) {
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!name || name.length > 48 || /\p{C}/u.test(name)) {
    throw new Error('Enter a subject name up to 48 characters.');
  }
  return name;
}

function subjectId(name: string) {
  return name.toLocaleLowerCase('en-IN');
}

export function readSubjects(raw: string | null): Subject[] {
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('Invalid subject list');
  const ids = new Set<string>();
  return data.map((value: unknown) => {
    if (
      !value ||
      typeof value !== 'object' ||
      !('name' in value) ||
      typeof value.name !== 'string' ||
      !('id' in value) ||
      typeof value.id !== 'string' ||
      !('startsOn' in value) ||
      !isDay(value.startsOn) ||
      !('weekdays' in value) ||
      !('log' in value)
    )
      throw new Error('Invalid saved subject');
    const name = subjectName(value.name);
    const id = subjectId(name);
    if (id !== value.id || ids.has(id))
      throw new Error('Invalid subject identity');
    ids.add(id);
    return {
      name,
      id,
      startsOn: value.startsOn,
      weekdays: weekdays(value.weekdays),
      log: calendarDays(value.log),
    };
  });
}

export function createSubject(
  subjects: Subject[],
  label: string,
  schedule: readonly number[],
  startsOn: string,
): Subject {
  const name = subjectName(label);
  const id = subjectId(name);
  if (subjects.some((item) => item.id === id))
    throw new Error('A subject with this name already exists.');
  if (!isDay(startsOn)) throw new Error('Could not determine today’s date.');
  return { id, name, weekdays: weekdays(schedule), startsOn, log: [] };
}

function countScheduled(
  start: string,
  today: string,
  schedule: readonly number[],
) {
  const first = utcDate(start);
  const days = (utcDate(today).getTime() - first.getTime()) / dayLength;
  const fullWeeks = Math.floor(days / 7);
  let total = fullWeeks * schedule.length;
  const firstWeekday = first.getUTCDay();
  for (let index = 0; index < days % 7; index++) {
    if (schedule.includes((firstWeekday + index) % 7)) total++;
  }
  return total;
}

export function attendanceSummary(
  enrolledOn: string | null,
  log: string[],
  today: string,
  schedule: readonly number[] = defaultWeekdays,
) {
  if (!isDay(enrolledOn) || !isDay(today) || enrolledOn > today) {
    return { present: 0, total: 0, percentage: null, checkedIn: false };
  }
  const entries = new Set(
    log.filter(
      (day) =>
        day >= enrolledOn && day <= today && isScheduledDay(day, schedule),
    ),
  );
  const checkedIn = entries.has(today);
  const total = countScheduled(enrolledOn, today, schedule) + Number(checkedIn);
  return {
    present: entries.size,
    total,
    percentage: total ? Math.round((entries.size / total) * 100) : null,
    checkedIn,
  };
}

export function subjectSummary(
  subject: Subject,
  enrolledOn: string | null,
  today: string,
) {
  const start = enrolledOn
    ? subject.startsOn > enrolledOn
      ? subject.startsOn
      : enrolledOn
    : null;
  return attendanceSummary(start, subject.log, today, subject.weekdays);
}

export function overallSummary(
  subjects: Subject[],
  enrolledOn: string | null,
  today: string,
) {
  let present = 0;
  let total = 0;
  for (const subject of subjects) {
    const summary = subjectSummary(subject, enrolledOn, today);
    present += summary.present;
    total += summary.total;
  }
  return {
    present,
    total,
    percentage: total ? Math.round((present / total) * 100) : null,
  };
}

export function markToday(
  log: string[],
  enrolledOn: string,
  scannedDay: string,
  today: string,
  schedule: readonly number[] = defaultWeekdays,
) {
  if (
    scannedDay !== today ||
    !isDay(enrolledOn) ||
    today < enrolledOn ||
    !isScheduledDay(today, schedule)
  ) {
    throw new Error('Attendance scan is no longer valid');
  }
  return log.includes(today) ? log : [...log, today].sort();
}

export function markSubject(
  subject: Subject,
  enrolledOn: string,
  scannedDay: string,
  today: string,
) {
  const start = subject.startsOn > enrolledOn ? subject.startsOn : enrolledOn;
  const log = markToday(
    subject.log,
    start,
    scannedDay,
    today,
    subject.weekdays,
  );
  return log === subject.log ? subject : { ...subject, log };
}

export type HistoryEntry = {
  subjectId: string;
  name: string;
  day: string;
  present: boolean;
};

export function attendanceHistory(
  subjects: Subject[],
  enrolledOn: string | null,
  today: string,
  month: string,
): HistoryEntry[] {
  const first = `${month}-01`;
  if (!isDay(first) || !isDay(enrolledOn) || !isDay(today) || first > today)
    return [];
  const date = utcDate(first);
  const entries: HistoryEntry[] = [];
  const logs = subjects.map(
    (subject) => [subject, new Set(subject.log)] as const,
  );
  for (
    ;
    date.toISOString().startsWith(month);
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const day = date.toISOString().slice(0, 10);
    if (day > today) break;
    if (day < enrolledOn) continue;
    for (const [subject, log] of logs) {
      if (
        day < subject.startsOn ||
        !subject.weekdays.includes(date.getUTCDay())
      )
        continue;
      const present = log.has(day);
      if (day === today && !present) continue;
      entries.push({ subjectId: subject.id, name: subject.name, day, present });
    }
  }
  return entries.sort(
    (a, b) => b.day.localeCompare(a.day) || a.name.localeCompare(b.name),
  );
}
