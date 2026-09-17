"use client";

import { Settings } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { type FontKey, fontOptions } from "~/lib/fonts/registry";
import type { ContentLayout, NavbarStyle, SidebarCollapsible, SidebarVariant } from "~/lib/preferences/layout";
import { THEME_PRESET_OPTIONS, type ThemeMode, type ThemePreset } from "~/lib/preferences/theme";
import { usePreferencesStore } from "~/stores/preferences/preferences-provider";

export function LayoutControls() {
  const { values, resolvedThemeMode, setPreference, resetPreferences } = usePreferencesStore(
    useShallow((state) => ({
      values: state.values,
      resolvedThemeMode: state.resolvedThemeMode,
      setPreference: state.setPreference,
      resetPreferences: state.resetPreferences,
    })),
  );

  const {
    theme_mode: themeMode,
    theme_preset: themePreset,
    content_layout: contentLayout,
    navbar_style: navbarStyle,
    sidebar_variant: variant,
    sidebar_collapsible: collapsible,
    font,
  } = values;

  const onThemePresetChange = (preset: ThemePreset) => {
    setPreference("theme_preset", preset);
  };

  const onThemeModeChange = (mode: ThemeMode | "") => {
    if (!mode) return;
    setPreference("theme_mode", mode);
  };

  const onContentLayoutChange = (layout: ContentLayout | "") => {
    if (!layout) return;
    setPreference("content_layout", layout);
  };

  const onNavbarStyleChange = (style: NavbarStyle | "") => {
    if (!style) return;
    setPreference("navbar_style", style);
  };

  const onSidebarStyleChange = (value: SidebarVariant | "") => {
    if (!value) return;
    setPreference("sidebar_variant", value);
  };

  const onSidebarCollapseModeChange = (value: SidebarCollapsible | "") => {
    if (!value) return;
    setPreference("sidebar_collapsible", value);
  };

  const onFontChange = (value: FontKey | "") => {
    if (!value) return;
    setPreference("font", value);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" className="bg-[var(--superficie)] text-[var(--marfim)] border-[var(--linha)] hover:bg-[var(--linha)] hover:text-[var(--ouro)] transition-colors">
          <Settings />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="bg-[var(--superficie)] border-[var(--linha)] shadow-xl rounded-xl">
        <div className="flex flex-col gap-5">
          <div className="space-y-1.5">
            <h4 className="font-medium text-sm leading-none text-[var(--marfim)]">Preferences</h4>
            <p className="text-xs text-[var(--fumaca)]">Customize your dashboard layout preferences.</p>
          </div>
          <div className="space-y-4 **:data-[slot=toggle-group]:w-full **:data-[slot=toggle-group-item]:flex-1 **:data-[slot=toggle-group-item]:text-xs">
            <div className="space-y-1">
              <Label className="font-medium text-xs text-[var(--marfim)]">Theme Preset</Label>
              <Select value={themePreset} onValueChange={onThemePresetChange}>
                <SelectTrigger size="sm" className="w-full text-xs bg-[var(--tinta)] border-[var(--linha)] text-[var(--marfim)] focus:ring-[var(--ouro)]">
                  <SelectValue placeholder="Preset" />
                </SelectTrigger>
                <SelectContent className="bg-[var(--superficie)] border-[var(--linha)] text-[var(--marfim)]">
                  <SelectGroup>
                    {THEME_PRESET_OPTIONS.map((preset) => (
                      <SelectItem key={preset.value} className="text-xs focus:bg-[var(--linha)] focus:text-[var(--ouro)] cursor-pointer" value={preset.value}>
                        <span
                          className="size-2.5 rounded-full"
                          style={{
                            backgroundColor: resolvedThemeMode === "dark" ? preset.primary.dark : preset.primary.light,
                          }}
                        />
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="font-medium text-xs text-[var(--marfim)]">Fonts</Label>
              <Select value={font} onValueChange={onFontChange}>
                <SelectTrigger size="sm" className="w-full text-xs bg-[var(--tinta)] border-[var(--linha)] text-[var(--marfim)] focus:ring-[var(--ouro)]">
                  <SelectValue placeholder="Select font" />
                </SelectTrigger>
                <SelectContent className="bg-[var(--superficie)] border-[var(--linha)] text-[var(--marfim)]">
                  <SelectGroup>
                    {fontOptions.map((font) => (
                      <SelectItem key={font.key} className="text-xs focus:bg-[var(--linha)] focus:text-[var(--ouro)] cursor-pointer" value={font.key}>
                        {font.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="font-medium text-xs text-[var(--marfim)]">Theme Mode</Label>
              <ToggleGroup
                size="sm"
                spacing={0}
                variant="outline"
                type="single"
                value={themeMode}
                onValueChange={onThemeModeChange}
                className="border border-[var(--linha)] rounded-md overflow-hidden bg-[var(--tinta)]"
              >
                <ToggleGroupItem value="light" aria-label="Toggle light" className="border-r border-[var(--linha)] rounded-none text-[var(--fumaca)] data-[state=on]:bg-[var(--superficie)] data-[state=on]:text-[var(--ouro)] hover:bg-[var(--superficie)] hover:text-[var(--marfim)]">
                  Light
                </ToggleGroupItem>
                <ToggleGroupItem value="dark" aria-label="Toggle dark" className="border-r border-[var(--linha)] rounded-none text-[var(--fumaca)] data-[state=on]:bg-[var(--superficie)] data-[state=on]:text-[var(--ouro)] hover:bg-[var(--superficie)] hover:text-[var(--marfim)]">
                  Dark
                </ToggleGroupItem>
                <ToggleGroupItem value="system" aria-label="Toggle system" className="rounded-none text-[var(--fumaca)] data-[state=on]:bg-[var(--superficie)] data-[state=on]:text-[var(--ouro)] hover:bg-[var(--superficie)] hover:text-[var(--marfim)]">
                  System
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-1">
              <Label className="font-medium text-xs text-[var(--marfim)]">Page Layout</Label>
              <ToggleGroup
                size="sm"
                spacing={0}
                variant="outline"
                type="single"
                value={contentLayout}
                onValueChange={onContentLayoutChange}
                className="border border-[var(--linha)] rounded-md overflow-hidden bg-[var(--tinta)]"
              >
                <ToggleGroupItem value="centered" aria-label="Toggle centered" className="border-r border-[var(--linha)] rounded-none text-[var(--fumaca)] data-[state=on]:bg-[var(--superficie)] data-[state=on]:text-[var(--ouro)] hover:bg-[var(--superficie)] hover:text-[var(--marfim)]">
                  Centered
                </ToggleGroupItem>
                <ToggleGroupItem value="full-width" aria-label="Toggle full-width" className="rounded-none text-[var(--fumaca)] data-[state=on]:bg-[var(--superficie)] data-[state=on]:text-[var(--ouro)] hover:bg-[var(--superficie)] hover:text-[var(--marfim)]">
                  Full Width
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-1">
              <Label className="font-medium text-xs text-[var(--marfim)]">Navbar Behavior</Label>
              <ToggleGroup
                size="sm"
                spacing={0}
                variant="outline"
                type="single"
                value={navbarStyle}
                onValueChange={onNavbarStyleChange}
                className="border border-[var(--linha)] rounded-md overflow-hidden bg-[var(--tinta)]"
              >
                <ToggleGroupItem value="sticky" aria-label="Toggle sticky" className="border-r border-[var(--linha)] rounded-none text-[var(--fumaca)] data-[state=on]:bg-[var(--superficie)] data-[state=on]:text-[var(--ouro)] hover:bg-[var(--superficie)] hover:text-[var(--marfim)]">
                  Sticky
                </ToggleGroupItem>
                <ToggleGroupItem value="scroll" aria-label="Toggle scroll" className="rounded-none text-[var(--fumaca)] data-[state=on]:bg-[var(--superficie)] data-[state=on]:text-[var(--ouro)] hover:bg-[var(--superficie)] hover:text-[var(--marfim)]">
                  Scroll
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-1">
              <Label className="font-medium text-xs text-[var(--marfim)]">Sidebar Style</Label>
              <ToggleGroup
                size="sm"
                spacing={0}
                variant="outline"
                type="single"
                value={variant}
                onValueChange={onSidebarStyleChange}
                className="border border-[var(--linha)] rounded-md overflow-hidden bg-[var(--tinta)]"
              >
                <ToggleGroupItem value="inset" aria-label="Toggle inset" className="border-r border-[var(--linha)] rounded-none text-[var(--fumaca)] data-[state=on]:bg-[var(--superficie)] data-[state=on]:text-[var(--ouro)] hover:bg-[var(--superficie)] hover:text-[var(--marfim)]">
                  Inset
                </ToggleGroupItem>
                <ToggleGroupItem value="sidebar" aria-label="Toggle sidebar" className="border-r border-[var(--linha)] rounded-none text-[var(--fumaca)] data-[state=on]:bg-[var(--superficie)] data-[state=on]:text-[var(--ouro)] hover:bg-[var(--superficie)] hover:text-[var(--marfim)]">
                  Sidebar
                </ToggleGroupItem>
                <ToggleGroupItem value="floating" aria-label="Toggle floating" className="rounded-none text-[var(--fumaca)] data-[state=on]:bg-[var(--superficie)] data-[state=on]:text-[var(--ouro)] hover:bg-[var(--superficie)] hover:text-[var(--marfim)]">
                  Floating
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-1">
              <Label className="font-medium text-xs text-[var(--marfim)]">Sidebar Collapse Mode</Label>
              <ToggleGroup
                size="sm"
                spacing={0}
                variant="outline"
                type="single"
                value={collapsible}
                onValueChange={onSidebarCollapseModeChange}
                className="border border-[var(--linha)] rounded-md overflow-hidden bg-[var(--tinta)]"
              >
                <ToggleGroupItem value="icon" aria-label="Toggle icon" className="border-r border-[var(--linha)] rounded-none text-[var(--fumaca)] data-[state=on]:bg-[var(--superficie)] data-[state=on]:text-[var(--ouro)] hover:bg-[var(--superficie)] hover:text-[var(--marfim)]">
                  Icon
                </ToggleGroupItem>
                <ToggleGroupItem value="offcanvas" aria-label="Toggle offcanvas" className="rounded-none text-[var(--fumaca)] data-[state=on]:bg-[var(--superficie)] data-[state=on]:text-[var(--ouro)] hover:bg-[var(--superficie)] hover:text-[var(--marfim)]">
                  OffCanvas
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <Button type="button" size="sm" variant="outline" className="w-full text-xs bg-[var(--superficie)] text-[var(--marfim)] border-[var(--linha)] hover:bg-[var(--linha)] hover:text-[var(--ouro)] transition-colors" onClick={resetPreferences}>
              Restore Defaults
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
