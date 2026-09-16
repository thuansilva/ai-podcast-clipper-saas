import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Select } from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";

describe("UI Select & Switch Components", () => {
  it("renders Select and handles value changes", () => {
    const handleChange = vi.fn();
    render(
      <Select
        aria-label="test-select"
        onChange={handleChange}
        defaultValue="opt2"
      >
        <option value="opt1">Option 1</option>
        <option value="opt2">Option 2</option>
      </Select>,
    );

    const select = screen.getByLabelText("test-select") as HTMLSelectElement;
    expect(select.value).toBe("opt2");

    fireEvent.change(select, { target: { value: "opt1" } });
    expect(handleChange).toHaveBeenCalled();
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
