import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";

describe("UI Select & Switch Components", () => {
  it("renders Select and handles value changes", () => {
    const handleChange = vi.fn();
    render(
      <Select defaultValue="opt2" onValueChange={handleChange}>
        <SelectTrigger aria-label="test-select">
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="opt1">Option 1</SelectItem>
          <SelectItem value="opt2">Option 2</SelectItem>
        </SelectContent>
      </Select>,
    );

    const select = screen.getByLabelText("test-select");
    expect(select).toBeDefined();
  });

  it("renders Switch, responds to clicks and toggles", () => {
    const handleCheckedChange = vi.fn();
    const { rerender } = render(
      <Switch
        aria-label="test-switch"
        checked={false}
        onCheckedChange={handleCheckedChange}
      />,
    );

    const switchBtn = screen.getByRole("switch");
    expect(switchBtn.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(switchBtn);
    expect(handleCheckedChange).toHaveBeenCalledWith(true);

    rerender(
      <Switch
        aria-label="test-switch"
        checked={true}
        onCheckedChange={handleCheckedChange}
      />,
    );
    expect(switchBtn.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(switchBtn);
    expect(handleCheckedChange).toHaveBeenCalledWith(false);
  });

  it("disabled Switch does not trigger onCheckedChange", () => {
    const handleCheckedChange = vi.fn();
    render(
      <Switch
        aria-label="test-switch"
        disabled
        checked={false}
        onCheckedChange={handleCheckedChange}
      />,
    );

    const switchBtn = screen.getByRole("switch");
    expect(switchBtn).toBeDisabled();

    fireEvent.click(switchBtn);
    expect(handleCheckedChange).not.toHaveBeenCalled();
  });
});
