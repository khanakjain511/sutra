import { Text, View } from 'react-native';

import { formatSchedule } from './subjects';
import { IconDisc } from './ui';

function percent(value) {
  return value === null ? '—' : `${value}%`;
}

function Metric({ label, value, hint, icon }) {
  return (
    <View className="min-w-0 flex-1 gap-3 rounded-[23px] bg-white p-3">
      <IconDisc name={icon} />
      <View className="flex-1 gap-1">
        <Text className="min-h-10 text-sm leading-5 font-medium text-muted">
          {label}
        </Text>
        <Text className="text-[27px] leading-tight font-semibold tracking-tight text-ink tabular-nums">
          {value}
        </Text>
        <Text className="text-xs leading-4 text-muted">{hint}</Text>
      </View>
    </View>
  );
}

export function OverallMetrics({ summary }) {
  return (
    <View className="flex-row items-stretch gap-2.5">
      <Metric
        label="Overall attendance"
        value={percent(summary.percentage)}
        hint="All subjects"
        icon="stats-chart-outline"
      />
      <Metric
        label="Attendance ratio"
        value={`${summary.present} / ${summary.total}`}
        hint="Present / scheduled classes"
        icon="pie-chart-outline"
      />
    </View>
  );
}

export function SubjectSummaryCard({ subject, summary }) {
  return (
    <View className="gap-2 rounded-[22px] bg-white p-3.5">
      <Text numberOfLines={2} className="text-[17px] font-semibold text-ink">
        {subject.name}
      </Text>
      <Text className="text-sm text-muted">
        {formatSchedule(subject.weekdays)}
      </Text>
      <View className="flex-row flex-wrap gap-x-5 gap-y-2">
        <Text className="text-sm font-semibold text-accent">
          Attendance {percent(summary.percentage)}
        </Text>
        <Text className="text-sm font-semibold text-ink">
          {summary.present} / {summary.total} present
        </Text>
      </View>
    </View>
  );
}

export function TodayCard({ name, scheduled, checkedIn }) {
  const status = !name
    ? 'Choose subject'
    : checkedIn
      ? 'Present'
      : !scheduled
        ? 'No class'
        : 'Pending';
  return (
    <View className="flex-row items-center gap-3 rounded-[23px] bg-white p-3">
      <IconDisc name="checkmark-circle-outline" />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-xs font-medium text-muted">Today</Text>
        <Text numberOfLines={2} className="text-base font-semibold text-ink">
          {name ?? 'Daily attendance'}
        </Text>
      </View>
      <Text
        className={
          checkedIn
            ? 'rounded-full bg-lilac px-2.5 py-1.5 text-xs font-semibold text-accent'
            : 'rounded-full bg-apricot px-2.5 py-1.5 text-xs font-semibold text-orange'
        }
      >
        {status}
      </Text>
    </View>
  );
}
