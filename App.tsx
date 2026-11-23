import './global.css';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import {
  AppState,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import { attendanceFace } from './src/attendance-face';
import {
  OverallMetrics,
  SubjectSummaryCard,
  TodayCard,
} from './src/attendance-cards';
import {
  createSubject,
  currentDay,
  defaultWeekdays,
  isScheduledDay,
  markSubject,
  overallSummary,
  readLog,
  readSubjects,
  subjectSummary,
  type Subject,
} from './src/attendance';
import { FaceCheckIn } from './src/face-check-in';
import { History } from './src/history';
import { SubjectOptions, Subjects } from './src/subjects';
import { TabBar, tabs, useTabs } from './src/tabs';
import { Button, Glyph, Loading, Section, Status } from './src/ui';

const SafeView = withUniwind(SafeAreaView);
const Gradient = withUniwind(LinearGradient);
const subjectsKey = 'attendance.subjects.v1';
const legacyLogKey = 'attendance.confirmed-days.v1';
const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

function Attendance() {
  const { tab, select } = useTabs();
  const [today, setToday] = useState(currentDay);
  const [enrolledOn, setEnrolledOn] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selection, setSelection] = useState<string | null>(null);
  const [load, setLoad] = useState<'loading' | 'ready' | 'error'>('loading');
  const [revision, setRevision] = useState(0);
  const latestSubjects = useRef<Subject[]>([]);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const revealCheckIn = useCallback(() => {
    requestAnimationFrame(() =>
      scroll.current?.scrollToEnd({ animated: true }),
    );
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(subjectsKey),
      attendanceFace?.getEnrollment() ?? Promise.resolve(null),
    ])
      .then(async ([raw, enrollment]) => {
        let entries = readSubjects(raw);
        if (raw === null && enrollment) {
          const oldLog = readLog(await AsyncStorage.getItem(legacyLogKey));
          if (oldLog.length) {
            const general = createSubject(
              [],
              'General attendance',
              defaultWeekdays,
              enrollment,
            );
            entries = [{ ...general, log: oldLog }];
            await AsyncStorage.setItem(subjectsKey, JSON.stringify(entries));
          }
        }
        if (!active) return;
        latestSubjects.current = entries;
        setSubjects(entries);
        setEnrolledOn(enrollment);
        setLoad('ready');
      })
      .catch(() => {
        if (active) setLoad('error');
      });
    return () => {
      active = false;
    };
  }, [revision]);

  useEffect(() => {
    const refresh = () => setToday(currentDay());
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const timer = setInterval(refresh, 30000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, []);

  const overall = overallSummary(subjects, enrolledOn, today);
  const selected =
    subjects.find((subject) => subject.id === selection) ?? subjects[0];
  const subject = selected ? subjectSummary(selected, enrolledOn, today) : null;
  const scheduled =
    !!selected &&
    today >= selected.startsOn &&
    isScheduledDay(today, selected.weekdays);
  const checkedIn = subject?.checkedIn ?? false;

  function writeSubjects(change: (current: Subject[]) => Subject[]) {
    const operation = writes.current
      .catch(() => undefined)
      .then(async () => {
        const next = change(latestSubjects.current);
        if (next === latestSubjects.current) return;
        try {
          await AsyncStorage.setItem(subjectsKey, JSON.stringify(next));
        } catch {
          throw new Error('Could not save attendance data. Try again.');
        }
        latestSubjects.current = next;
        setSubjects(next);
      });
    writes.current = operation;
    return operation;
  }

  async function addSubject(name: string, schedule: number[]) {
    const startsOn = currentDay();
    await writeSubjects((current) => [
      ...current,
      createSubject(current, name, schedule, startsOn),
    ]);
    setSelection(latestSubjects.current.at(-1)?.id ?? null);
    setToday(startsOn);
  }

  async function recordConfirmation(day: string, enrollment: boolean) {
    if (enrollment) {
      setEnrolledOn(day);
      return;
    }
    if (!enrolledOn || !selected)
      throw new Error('No subject selected for attendance');
    const subjectId = selected.id;
    const checkInDay = currentDay();
    await writeSubjects((current) =>
      current.map((item) =>
        item.id === subjectId
          ? markSubject(item, enrolledOn, day, checkInDay)
          : item,
      ),
    );
    setToday(checkInDay);
  }

  const tabTitle =
    tabs.find((item) => item.id === tab)?.title ?? 'Your attendance';
  const todayCard = (
    <TodayCard
      name={selected?.name}
      scheduled={scheduled}
      checkedIn={checkedIn}
    />
  );
  let page;

  if (load === 'loading') {
    page = (
      <Section>
        <Loading text="Loading attendance…" />
      </Section>
    );
  } else if (load === 'error') {
    page = (
      <Section>
        <Status error text="Attendance could not be loaded." />
        <Button
          subtle
          onPress={() => {
            setLoad('loading');
            setRevision((value) => value + 1);
          }}
        >
          Try again
        </Button>
      </Section>
    );
  } else if (tab === 'overview') {
    page = (
      <Section
        title="Overview"
        action={
          <View className="shrink flex-row items-center gap-1.5 rounded-full bg-white px-2.5 py-2.5">
            <Glyph name="calendar-outline" size={14} />
            <Text className="shrink text-xs font-medium text-ink">
              {dateFormatter.format(new Date())}
            </Text>
          </View>
        }
      >
        {todayCard}
        <OverallMetrics summary={overall} />
        <Text className="text-xs leading-4 text-muted">
          Today’s classes enter the totals after check-in or at midnight.
        </Text>
        <Button
          icon={selected ? 'scan-outline' : 'book-outline'}
          onPress={() => select(selected ? 'check-in' : 'subjects')}
        >
          {selected ? 'Go to check-in' : 'Set up subjects'}
        </Button>
      </Section>
    );
  } else if (tab === 'subjects') {
    page = (
      <Section title="Subject setup">
        <Subjects
          subjects={subjects}
          selected={selected?.id ?? null}
          onSelect={setSelection}
          onAdd={addSubject}
        />
        {selected && subject ? (
          <>
            <SubjectSummaryCard subject={selected} summary={subject} />
            <Button icon="scan-outline" onPress={() => select('check-in')}>
              Check in for this subject
            </Button>
          </>
        ) : null}
      </Section>
    );
  } else if (tab === 'check-in') {
    page = (
      <Section title="Today’s class">
        {subjects.length ? (
          <SubjectOptions
            subjects={subjects}
            selected={selected?.id ?? null}
            onSelect={setSelection}
          />
        ) : (
          <Button subtle icon="book-outline" onPress={() => select('subjects')}>
            Add subjects
          </Button>
        )}
        {todayCard}
        <FaceCheckIn
          key={selected ? `subject:${selected.id}` : 'no-subject'}
          enrolled={!!enrolledOn}
          checkedIn={checkedIn}
          scheduled={scheduled}
          subjectName={selected?.name}
          onConfirmed={recordConfirmation}
          onReveal={revealCheckIn}
        />
      </Section>
    );
  } else {
    page = (
      <History subjects={subjects} enrolledOn={enrolledOn} today={today} />
    );
  }

  return (
    <View className="flex-1 bg-shell">
      <StatusBar style="light" />
      <Gradient
        colors={['#141417', '#1a1a24', '#25233e']}
        locations={[0, 0.52, 1]}
        className="absolute inset-0"
      />
      <SafeView className="flex-1" edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView
          key={tab}
          ref={scroll}
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="mx-auto w-full max-w-[590px] gap-4 px-3.5 pt-3 pb-5 sm:px-6">
            <View className="gap-5 px-1.5 pt-0.5 pb-1.5">
              <View className="flex-row items-center justify-between">
                <View
                  className="size-12 items-center justify-center rounded-full bg-control"
                  aria-hidden
                >
                  <Glyph name="grid" tone="white" />
                </View>
                <View className="flex-row gap-2.5">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Go to face check-in"
                    onPress={() =>
                      tab === 'check-in' ? revealCheckIn() : select('check-in')
                    }
                    className="size-12 items-center justify-center rounded-full border-2 border-transparent bg-control focus:border-violet active:bg-violet"
                  >
                    <Glyph name="scan-outline" tone="white" />
                  </Pressable>
                  <View
                    className="size-12 items-center justify-center rounded-full bg-white"
                    aria-hidden
                  >
                    <Glyph name="person-circle-outline" />
                  </View>
                </View>
              </View>
              <View className="gap-1">
                <Text className="text-[15px] leading-5 text-quiet">
                  Daily check-in
                </Text>
                <Text
                  accessibilityRole="header"
                  className="text-[34px] leading-tight font-semibold tracking-tight text-white"
                >
                  {tabTitle}
                </Text>
              </View>
            </View>
            <View
              role={Platform.OS === 'web' ? 'tabpanel' : undefined}
              aria-labelledby={`attendance-tab-${tab}`}
            >
              {page}
            </View>
          </View>
        </ScrollView>
        <TabBar current={tab} onSelect={select} />
      </SafeView>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Attendance />
    </SafeAreaProvider>
  );
}
