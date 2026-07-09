import {
  ActionIcon,
  useMantineColorScheme,
  type MantineColorScheme,
} from "@mantine/core";
import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";

/**
 * Cycles the colour scheme light -> dark -> auto (system) -> light. Mantine
 * persists the choice to localStorage via its default colour-scheme manager, so
 * it survives reloads; the icon reflects the current *preference* (not the
 * resolved scheme), which is what a cycle control should show.
 */
const NEXT: Record<MantineColorScheme, MantineColorScheme> = {
  light: "dark",
  dark: "auto",
  auto: "light",
};

const MODE: Record<MantineColorScheme, { icon: typeof IconSun; label: string }> = {
  light: { icon: IconSun, label: "Light theme — click for dark" },
  dark: { icon: IconMoon, label: "Dark theme — click for system" },
  auto: { icon: IconDeviceDesktop, label: "System theme — click for light" },
};

export function ThemeToggle() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const { icon: Icon, label } = MODE[colorScheme];
  return (
    <ActionIcon
      variant="default"
      size="lg"
      aria-label={label}
      title={label}
      onClick={() => setColorScheme(NEXT[colorScheme])}
    >
      <Icon size={16} />
    </ActionIcon>
  );
}
