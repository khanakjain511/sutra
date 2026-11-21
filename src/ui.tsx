import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Glyph({
  name,
  tone = 'accent',
  size = 20,
}: {
  name: IconName;
  tone?: 'accent' | 'ink' | 'white' | 'muted' | 'light';
  size?: number;
}) {
  const colors = {
    accent: '#544dc3',
    ink: '#121216',
    white: '#ffffff',
    muted: '#565864',
    light: '#b9b9c4',
  };
  return (
    <Ionicons
      name={name}
      size={size}
      color={colors[tone]}
      accessible={false}
      aria-hidden
    />
  );
}

export function IconDisc({ name }: { name: IconName }) {
  return (
    <View className="size-10 shrink-0 items-center justify-center rounded-full bg-lilac">
      <Glyph name={name} size={18} />
    </View>
  );
}

export function Section({
  children,
  title,
  action,
}: {
  children: ReactNode;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <View className="gap-4 rounded-[30px] bg-panel p-4 sm:p-5">
      {title ? (
        <View className="min-h-8 flex-row items-center justify-between gap-3">
          <Text
            accessibilityRole="header"
            className="flex-1 text-[22px] leading-snug font-semibold tracking-tight text-ink"
          >
            {title}
          </Text>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Button({
  children,
  onPress,
  icon,
  disabled,
  subtle = false,
}: {
  children: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  subtle?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={children}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={
        subtle
          ? 'min-h-12 max-w-full flex-row items-center justify-center gap-2 rounded-full border-2 border-transparent bg-lilac px-4 py-2 focus:border-violet active:bg-white disabled:opacity-55'
          : 'min-h-12 max-w-full flex-row items-center justify-center gap-2 rounded-full border-2 border-transparent bg-ink px-4 py-2 focus:border-violet active:bg-control disabled:opacity-50'
      }
    >
      {icon ? (
        <Glyph name={icon} tone={subtle ? 'accent' : 'white'} size={18} />
      ) : null}
      <Text
        className={
          subtle
            ? 'shrink text-center text-sm font-semibold text-accent'
            : 'shrink text-center text-sm font-semibold text-white'
        }
      >
        {children}
      </Text>
    </Pressable>
  );
}

export function Status({
  text,
  error = false,
}: {
  text: string;
  error?: boolean;
}) {
  return (
    <View className="rounded-2xl bg-white p-3">
      <Text
        accessibilityLiveRegion="polite"
        className={error ? 'text-sm text-error' : 'text-sm text-muted'}
      >
        {text}
      </Text>
    </View>
  );
}

export function Loading({ text }: { text: string }) {
  return (
    <View className="flex-row items-center gap-3 py-3">
      <ActivityIndicator color="#544dc3" />
      <Text accessibilityLiveRegion="polite" className="text-sm text-muted">
        {text}
      </Text>
    </View>
  );
}
