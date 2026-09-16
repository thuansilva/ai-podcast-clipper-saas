import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { VideosToolbar } from "~/components/dashboard/videos-toolbar";

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();
let mockPathname = "/dashboard/videos";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => mockPathname,
}));

describe("VideosToolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSearchParams = new URLSearchParams();
    mockPathname = "/dashboard/videos";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders search input and sort select with default values", () => {
    render(<VideosToolbar />);

    const input = screen.getByLabelText("Buscar por nome") as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe("");

    const sortTrigger = screen.getByLabelText("Ordenar vídeos");
    expect(sortTrigger).toBeDefined();
  });

  it("initializes search input from search query param", () => {
    mockSearchParams = new URLSearchParams("search=podcast");
    render(<VideosToolbar />);

    const input = screen.getByLabelText("Buscar por nome") as HTMLInputElement;
    expect(input.value).toBe("podcast");
  });

  it("debounces search input typing before pushing to router", () => {
    render(<VideosToolbar />);

    const input = screen.getByLabelText("Buscar por nome");
    fireEvent.change(input, { target: { value: "corte" } });

    // Should not push immediately
    expect(mockPush).not.toHaveBeenCalled();

    // Fast-forward debounce timer (300ms)
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockPush).toHaveBeenCalledWith("/dashboard/videos?search=corte");
  });

  it("removes search param when input is cleared", () => {
    mockSearchParams = new URLSearchParams("search=corte&sort=desc");
    render(<VideosToolbar />);

    const input = screen.getByLabelText("Buscar por nome");
    fireEvent.change(input, { target: { value: "" } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockPush).toHaveBeenCalledWith("/dashboard/videos?sort=desc");
  });

  it("resets page parameter when search changes", () => {
    mockSearchParams = new URLSearchParams("page=3&sort=asc");
    render(<VideosToolbar />);

    const input = screen.getByLabelText("Buscar por nome");
    fireEvent.change(input, { target: { value: "entrevista" } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockPush).toHaveBeenCalledWith("/dashboard/videos?sort=asc&search=entrevista");
  });
});
