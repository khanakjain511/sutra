import assert from 'node:assert/strict';
import test from 'node:test';

import {
  attendanceHistory,
  attendanceSummary,
  createSubject,
  currentDay,
  isDay,
  isScheduledDay,
  markToday,
  markSubject,
  overallSummary,
  readSubjects,
  subjectSummary,
  readLog,
} from '../src/attendance.js';

test('uses the India calendar across midnight UTC offsets', () => {
  assert.equal(currentDay(new Date('2026-11-23T18:29:59Z')), '2026-11-23');
  assert.equal(currentDay(new Date('2026-11-23T18:30:00Z')), '2026-11-24');
  assert.equal(isDay('2026-02-29'), false);
  assert.equal(isDay('2028-02-29'), true);
});

test('starts at enrollment and excludes an unconfirmed current day', () => {
  assert.deepEqual(attendanceSummary('2026-11-23', [], '2026-11-23'), {
    present: 0,
    total: 0,
    percentage: null,
    checkedIn: false,
  });
  assert.deepEqual(
    attendanceSummary('2026-11-23', ['2026-11-23'], '2026-11-24'),
    {
      present: 1,
      total: 1,
      percentage: 100,
      checkedIn: false,
    },
  );
});

test('counts missed weekdays and ignores weekends, duplicates and out-of-range entries', () => {
  const entries = [
    '2026-11-22',
    '2026-11-23',
    '2026-11-23',
    '2026-11-28',
    '2026-11-30',
    '2026-12-01',
  ];
  assert.deepEqual(attendanceSummary('2026-11-23', entries, '2026-11-30'), {
    present: 2,
    total: 6,
    percentage: 33,
    checkedIn: true,
  });
  assert.equal(isScheduledDay('2026-11-28'), false);
});

test('rejects expired and off-schedule confirmations and keeps writes idempotent', () => {
  const log = ['2026-11-23'];
  assert.equal(markToday(log, '2026-11-23', '2026-11-23', '2026-11-23'), log);
  assert.deepEqual(markToday(log, '2026-11-23', '2026-11-24', '2026-11-24'), [
    '2026-11-23',
    '2026-11-24',
  ]);
  assert.throws(() => markToday(log, '2026-11-23', '2026-11-23', '2026-11-24'));
  assert.throws(() => markToday(log, '2026-11-23', '2026-11-28', '2026-11-28'));
  assert.throws(() => markToday(log, '2026-11-24', '2026-11-23', '2026-11-23'));
});

test('deduplicates persisted dates and fails closed on malformed history', () => {
  assert.deepEqual(readLog(null), []);
  assert.deepEqual(readLog('["2026-11-24","2026-11-23","2026-11-24"]'), [
    '2026-11-23',
    '2026-11-24',
  ]);
  assert.throws(() => readLog('["2026-02-30"]'));
  assert.throws(() => readLog('{"present":1}'));
});

test('tracks separate subjects on the same date and computes a weighted overall rate', () => {
  const start = '2026-11-23';
  const monday = '2026-11-30';
  const math = createSubject([], 'Mathematics', [1, 3, 3], start);
  const history = createSubject([math], 'History', [1, 6], '2026-11-26');
  const checkedMath = markSubject(math, start, monday, monday);
  assert.equal(markSubject(checkedMath, start, monday, monday), checkedMath);
  assert.deepEqual(subjectSummary(checkedMath, start, monday), {
    present: 1,
    total: 3,
    percentage: 33,
    checkedIn: true,
  });
  assert.deepEqual(subjectSummary(history, start, monday), {
    present: 0,
    total: 1,
    percentage: 0,
    checkedIn: false,
  });
  assert.deepEqual(overallSummary([checkedMath, history], start, monday), {
    present: 1,
    total: 4,
    percentage: 25,
  });
  const checkedHistory = markSubject(history, start, monday, monday);
  assert.deepEqual(
    overallSummary([checkedMath, checkedHistory], start, monday),
    {
      present: 2,
      total: 5,
      percentage: 40,
    },
  );
});

test('validates subject inputs and persisted schedules', () => {
  const math = createSubject([], '  Math  Basics ', [1, 5, 1], '2026-11-23');
  assert.equal(math.name, 'Math Basics');
  assert.deepEqual(readSubjects(JSON.stringify([math])), [math]);
  assert.throws(
    () => createSubject([math], 'math basics', [1], '2026-11-23'),
    /already exists/,
  );
  assert.throws(
    () => createSubject([], 'History', [], '2026-11-23'),
    /class day/,
  );
  assert.throws(() =>
    readSubjects(JSON.stringify([{ ...math, weekdays: [7] }])),
  );
  assert.throws(() =>
    markSubject(math, '2026-11-23', '2026-11-24', '2026-11-24'),
  );
  assert.equal(subjectSummary(math, '2026-11-26', '2026-11-27').total, 0);
});

test('shows confirmed and missed classes in the selected month from each subject’s start', () => {
  const enrolled = '2026-11-23';
  const today = '2026-12-02';
  const math = createSubject([], 'Mathematics', [1, 3], '2026-11-16');
  const physics = createSubject([math], 'Physics', [1, 2, 3], '2026-11-30');
  const markedMath = markSubject(math, enrolled, '2026-11-23', '2026-11-23');
  const markedPhysics = markSubject(physics, enrolled, today, today);
  const subjects = [markedMath, markedPhysics];
  const rows = (month) =>
    attendanceHistory(subjects, enrolled, today, month).map(
      ({ day, name, present }) => [day, name, present],
    );

  assert.deepEqual(rows('2026-11'), [
    ['2026-11-30', 'Mathematics', false],
    ['2026-11-30', 'Physics', false],
    ['2026-11-25', 'Mathematics', false],
    ['2026-11-23', 'Mathematics', true],
  ]);
  assert.deepEqual(rows('2026-12'), [
    ['2026-12-02', 'Physics', true],
    ['2026-12-01', 'Physics', false],
  ]);
  assert.deepEqual(rows('2026-13'), []);
  assert.deepEqual(rows('2027-01'), []);
  assert.deepEqual(attendanceHistory(subjects, null, today, '2026-12'), []);
});
