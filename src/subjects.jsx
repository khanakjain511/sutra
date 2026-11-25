import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { defaultWeekdays } from './attendance';
import { Button, Status } from './ui';

const days = [
  [1, 'Mon', 'Monday'],
  [2, 'Tue', 'Tuesday'],
  [3, 'Wed', 'Wednesday'],
  [4, 'Thu', 'Thursday'],
  [5, 'Fri', 'Friday'],
  [6, 'Sat', 'Saturday'],
  [0, 'Sun', 'Sunday'],
];

export function formatSchedule(weekdays) {
  return days
    .filter(([day]) => weekdays.includes(day))
    .map(([, short]) => short)
    .join(' · ');
}

function Option({ label, accessibleLabel, selected, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibleLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={
        selected
          ? 'min-h-11 max-w-full justify-center rounded-full border-2 border-accent bg-lilac px-3 py-2 focus:border-violet active:bg-white'
          : 'min-h-11 max-w-full justify-center rounded-full border-2 border-line bg-white px-3 py-2 focus:border-violet active:bg-lilac'
      }
    >
      <Text
        className={
          selected
            ? 'text-sm font-semibold text-accent'
            : 'text-sm font-medium text-ink'
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SubjectOptions({ subjects, selected, onSelect }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {subjects.map((subject) => (
        <Option
          key={subject.id}
          label={subject.name}
          selected={subject.id === selected}
          onPress={() => onSelect(subject.id)}
        />
      ))}
    </View>
  );
}

export function Subjects({ subjects, selected, onSelect, onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [weekdays, setWeekdays] = useState([...defaultWeekdays]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);

  async function save() {
    if (!name.trim() || !weekdays.length || pending.current) return;
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      await onAdd(name, weekdays);
      setOpen(false);
      setName('');
      setWeekdays([...defaultWeekdays]);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'The subject could not be saved.',
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <View className="gap-3">
      {subjects.length ? (
        <SubjectOptions
          subjects={subjects}
          selected={selected}
          onSelect={onSelect}
        />
      ) : (
        <Text className="text-[15px] leading-5 text-muted">
          Add a subject and its class days to track it separately.
        </Text>
      )}
      {open ? (
        <View className="gap-3 rounded-[22px] bg-white p-3.5">
          <Text className="text-sm font-semibold text-ink">Subject name</Text>
          <TextInput
            accessibilityLabel="Subject name"
            placeholder="e.g. Mathematics"
            placeholderTextColor="#696b77"
            maxLength={48}
            editable={!saving}
            returnKeyType="done"
            value={name}
            onChangeText={setName}
            onSubmitEditing={() => {
              void save();
            }}
            className="min-h-12 rounded-2xl border border-line bg-well px-4 py-3 text-base text-ink focus:border-violet"
          />
          <Text className="text-sm font-semibold text-ink">Class days</Text>
          <View className="flex-row flex-wrap gap-2">
            {days.map(([day, short, label]) => (
              <Option
                key={day}
                label={short}
                accessibleLabel={label}
                selected={weekdays.includes(day)}
                onPress={() => {
                  if (saving) return;
                  setWeekdays((previous) =>
                    previous.includes(day)
                      ? previous.filter((item) => item !== day)
                      : [...previous, day],
                  );
                }}
              />
            ))}
          </View>
          {error ? <Status error text={error} /> : null}
          <View className="flex-row flex-wrap gap-2">
            <Button
              icon="checkmark-outline"
              disabled={saving || !name.trim() || !weekdays.length}
              onPress={() => {
                void save();
              }}
            >
              Save subject
            </Button>
            <Button
              subtle
              disabled={saving}
              onPress={() => {
                setOpen(false);
                setError('');
              }}
            >
              Cancel subject setup
            </Button>
          </View>
        </View>
      ) : (
        <View className="self-start">
          <Button subtle icon="add-outline" onPress={() => setOpen(true)}>
            Add subject
          </Button>
        </View>
      )}
    </View>
  );
}
