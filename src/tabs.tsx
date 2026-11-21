import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, Text, View } from 'react-native';

import { Glyph, type IconName } from './ui';

export const tabs = [
  {
    id: 'overview',
    label: 'Overview',
    title: 'Your attendance',
    icon: 'grid-outline',
    activeIcon: 'grid',
  },
  {
    id: 'subjects',
    label: 'Subjects',
    title: 'Your subjects',
    icon: 'book-outline',
    activeIcon: 'book',
  },
  {
    id: 'check-in',
    label: 'Check-in',
    title: 'Check in',
    icon: 'scan-outline',
    activeIcon: 'scan',
  },
  {
    id: 'history',
    label: 'History',
    title: 'Attendance history',
    icon: 'time-outline',
    activeIcon: 'time',
  },
] as const satisfies readonly {
  id: string;
  label: string;
  title: string;
  icon: IconName;
  activeIcon: IconName;
}[];

export type Tab = (typeof tabs)[number]['id'];

function browserTab(): Tab {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'overview';
  const hash = window.location.hash.slice(1);
  return tabs.find((item) => item.id === hash)?.id ?? 'overview';
}

export function useTabs() {
  const [tab, setTab] = useState(browserTab);
  const active = useRef(tab);
  const history = useRef<Tab[]>([]);

  const show = useCallback((next: Tab) => {
    active.current = next;
    setTab(next);
  }, []);

  const select = useCallback(
    (next: Tab) => {
      if (next === active.current) return;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.pushState(null, '', `#${next}`);
      } else {
        history.current = [
          ...history.current.filter((item) => item !== next),
          active.current,
        ];
      }
      show(next);
    },
    [show],
  );

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const restore = () => show(browserTab());
      window.addEventListener('popstate', restore);
      window.addEventListener('hashchange', restore);
      return () => {
        window.removeEventListener('popstate', restore);
        window.removeEventListener('hashchange', restore);
      };
    }
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        const previous = history.current.pop();
        if (!previous && active.current === 'overview') return false;
        show(previous ?? 'overview');
        return true;
      },
    );
    return () => subscription.remove();
  }, [show]);

  return { tab, select };
}

export function TabBar({
  current,
  onSelect,
}: {
  current: Tab;
  onSelect: (tab: Tab) => void;
}) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    function move(event: KeyboardEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const index = tabs.findIndex(
        ({ id }) => target.id === `attendance-tab-${id}`,
      );
      if (index < 0) return;
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft')
        next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      const destination = tabs[next];
      if (!destination) return;
      event.preventDefault();
      onSelect(destination.id);
      document.getElementById(`attendance-tab-${destination.id}`)?.focus();
    }
    document.addEventListener('keydown', move);
    return () => document.removeEventListener('keydown', move);
  }, [onSelect]);

  return (
    <View className="mx-auto w-full max-w-[590px] px-3.5 pt-1 pb-1.5 sm:px-6">
      <View
        accessibilityRole="tablist"
        accessibilityLabel="Attendance navigation"
        className="min-h-16 flex-row items-stretch gap-1 rounded-[25px] border border-white/10 bg-shell p-1.5"
      >
        {tabs.map(({ id, label, icon, activeIcon }) => {
          const selected = id === current;
          return (
            <Pressable
              key={id}
              nativeID={`attendance-tab-${id}`}
              accessibilityRole="tab"
              accessibilityLabel={label}
              aria-selected={selected}
              tabIndex={Platform.OS === 'web' ? (selected ? 0 : -1) : undefined}
              onPress={() => onSelect(id)}
              className={
                selected
                  ? 'min-h-12 min-w-0 flex-1 items-center justify-center gap-1 rounded-[19px] border-2 border-transparent bg-lilac px-1 py-1.5 focus:border-violet'
                  : 'min-h-12 min-w-0 flex-1 items-center justify-center gap-1 rounded-[19px] border-2 border-transparent px-1 py-1.5 focus:border-violet active:bg-control'
              }
            >
              <Glyph
                name={selected ? activeIcon : icon}
                tone={selected ? 'accent' : 'light'}
                size={19}
              />
              <Text
                className={
                  selected
                    ? 'text-center text-[11px] font-semibold text-accent'
                    : 'text-center text-[11px] font-medium text-quiet'
                }
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
