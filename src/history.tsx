import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { attendanceHistory, type Subject } from './attendance';
import { Glyph, IconDisc, Section } from './ui';

const monthLabel = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const dayLabel = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

function shiftMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

function MonthButton({
  previous,
  disabled,
  onPress,
}: {
  previous?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={previous ? 'Previous month' : 'Next month'}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="size-11 items-center justify-center rounded-full border-2 border-transparent bg-lilac focus:border-violet active:bg-white disabled:opacity-50"
    >
      <Glyph
        name={previous ? 'chevron-back-outline' : 'chevron-forward-outline'}
        size={18}
      />
    </Pressable>
  );
}

export function History({
  subjects,
  enrolledOn,
  today,
}: {
  subjects: Subject[];
  enrolledOn: string | null;
  today: string;
}) {
  const [chosenMonth, setMonth] = useState<string | null>(null);
  const currentMonth = today.slice(0, 7);
  const firstMonth = enrolledOn?.slice(0, 7) ?? currentMonth;
  const month =
    chosenMonth && chosenMonth >= firstMonth && chosenMonth <= currentMonth
      ? chosenMonth
      : currentMonth;
  const records = attendanceHistory(subjects, enrolledOn, today, month);
  const present = records.filter((entry) => entry.present).length;

  return (
    <Section title="Class records">
      <View className="flex-row items-center justify-between gap-3 rounded-[22px] bg-white p-3">
        <MonthButton
          previous
          disabled={month <= firstMonth}
          onPress={() => setMonth(shiftMonth(month, -1))}
        />
        <Text
          accessibilityLiveRegion="polite"
          className="min-w-0 flex-1 text-center text-base font-semibold text-ink"
        >
          {monthLabel.format(new Date(`${month}-01T00:00:00Z`))}
        </Text>
        <MonthButton
          disabled={month >= currentMonth}
          onPress={() => setMonth(shiftMonth(month, 1))}
        />
      </View>
      {records.length ? (
        <>
          <Text className="text-sm font-medium text-muted">
            {present} present · {records.length - present} missed
          </Text>
          <View className="gap-2.5">
            {records.map((entry) => (
              <View
                key={`${entry.day}:${entry.subjectId}`}
                className="flex-row items-center gap-3 rounded-[20px] bg-white p-3"
              >
                <IconDisc
                  name={entry.present ? 'checkmark-outline' : 'time-outline'}
                />
                <View className="min-w-0 flex-1 gap-1">
                  <Text
                    numberOfLines={2}
                    className="text-[15px] font-semibold text-ink"
                  >
                    {entry.name}
                  </Text>
                  <Text className="text-xs text-muted">
                    {dayLabel.format(new Date(`${entry.day}T00:00:00Z`))}
                  </Text>
                </View>
                <Text
                  className={
                    entry.present
                      ? 'rounded-full bg-lilac px-2.5 py-1.5 text-xs font-semibold text-accent'
                      : 'rounded-full bg-apricot px-2.5 py-1.5 text-xs font-semibold text-orange'
                  }
                >
                  {entry.present ? 'Present' : 'Missed'}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <View className="flex-row items-center gap-3 rounded-[22px] bg-white p-3.5">
          <IconDisc name="time-outline" />
          <Text className="min-w-0 flex-1 text-[15px] leading-5 text-muted">
            {enrolledOn
              ? 'No completed classes this month yet.'
              : 'Class records appear after you set up face verification and start tracking subjects.'}
          </Text>
        </View>
      )}
    </Section>
  );
}
