import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ProjectBatchPoller } from "~/components/dashboard/project-batch-poller";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a) } }));

describe("ProjectBatchPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockClear();
    toastSuccess.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("faz router.refresh a cada 5s enquanto há lote ativo", () => {
    render(<ProjectBatchPoller activeCount={2} />);
    expect(refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(5000));
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(10000));
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("não faz polling nem toast sem lote ativo", () => {
    render(<ProjectBatchPoller activeCount={0} />);
    act(() => vi.advanceTimersByTime(30000));
    expect(refresh).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("ao transitar de ativo para nenhum: para o polling, toast e anuncia no live region", () => {
    const { rerender } = render(<ProjectBatchPoller activeCount={1} />);
    const region = screen.getByTestId("clips-generation-live-region");
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toContain("Gerando 1 corte");

    rerender(<ProjectBatchPoller activeCount={0} />);
    expect(toastSuccess).toHaveBeenCalledWith("Novos cortes prontos!");
    expect(region.textContent).toContain("Geração concluída");

    refresh.mockClear();
    act(() => vi.advanceTimersByTime(20000));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("limpa o intervalo ao desmontar", () => {
    const { unmount } = render(<ProjectBatchPoller activeCount={1} />);
    unmount();
    act(() => vi.advanceTimersByTime(20000));
    expect(refresh).not.toHaveBeenCalled();
  });
});
