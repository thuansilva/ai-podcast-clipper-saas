import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Slider } from "~/components/ui/slider";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

describe("Slider (Radix real)", () => {
  it("nomeia cada ponto, expõe aria-valuetext e anda 1 passo com as setas", () => {
    const onValueChange = vi.fn();
    render(
      <Slider
        value={[10, 40]}
        min={0}
        max={100}
        step={1}
        minStepsBetweenThumbs={1}
        onValueChange={onValueChange}
        thumbLabels={["Início do corte 1", "Fim do corte 1"]}
        thumbValueText={(v) => `00:${String(v).padStart(2, "0")}`}
      />,
    );
    const start = screen.getByRole("slider", { name: "Início do corte 1" });
    const end = screen.getByRole("slider", { name: "Fim do corte 1" });
    expect(start).toHaveAttribute("aria-valuetext", "00:10");
    expect(end).toHaveAttribute("aria-valuetext", "00:40");
    expect(start).toHaveAttribute("aria-valuenow", "10");

    start.focus();
    fireEvent.keyDown(start, { key: "ArrowRight" });
    expect(onValueChange).toHaveBeenLastCalledWith([11, 40]);
    end.focus();
    fireEvent.keyDown(end, { key: "ArrowLeft" });
    expect(onValueChange).toHaveBeenLastCalledWith([10, 39]);
  });
});
