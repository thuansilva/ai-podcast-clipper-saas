import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { DashboardClient } from "~/components/dashboard-client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn().mockReturnValue("/dashboard"),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("~/actions/generation", () => ({
  getClipPlayUrl: vi.fn().mockResolvedValue({ success: true, url: "https://example.com" }),
  deleteClip: vi.fn().mockResolvedValue({ success: true }),
  updateClip: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("~/components/import-video-tabs", () => ({
  ImportVideoTabs: () => <div data-testid="import-tabs">Import Tabs</div>,
}));

describe("Dashboard Reactive Polling", () => {
  const refreshMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(useRouter).mockReturnValue({
      refresh: refreshMock,
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("deve disparar router.refresh() a cada 4 segundos quando houver arquivo queued ou processing", () => {
    const files = [
      {
        id: "f-1",
        s3Key: "uploads/1.mp4",
        filename: "video.mp4",
        status: "processing",
        clipsCount: 0,
        createdAt: new Date(),
      },
    ];

    render(
      <DashboardClient
        uploadedFiles={files}
        clips={[]}
        userCredits={10}
      />,
    );

    expect(refreshMock).not.toHaveBeenCalled();

    // Avança 4 segundos
    vi.advanceTimersByTime(4000);
    expect(refreshMock).toHaveBeenCalledTimes(1);

    // Avança mais 4 segundos (total 8s)
    vi.advanceTimersByTime(4000);
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });

  it("deve cessar o polling e exibir toast.success quando todos os arquivos forem concluídos", () => {
    const processingFiles = [
      {
        id: "f-1",
        s3Key: "uploads/1.mp4",
        filename: "video.mp4",
        status: "queued",
        clipsCount: 0,
        createdAt: new Date(),
      },
    ];

    const { rerender } = render(
      <DashboardClient
        uploadedFiles={processingFiles}
        clips={[]}
        userCredits={10}
      />,
    );

    // Polling ativo
    vi.advanceTimersByTime(4000);
    expect(refreshMock).toHaveBeenCalledTimes(1);

    // Re-renderiza com arquivo processado
    const processedFiles = [
      {
        id: "f-1",
        s3Key: "uploads/1.mp4",
        filename: "video.mp4",
        status: "processed",
        clipsCount: 3,
        createdAt: new Date(),
      },
    ];

    rerender(
      <DashboardClient
        uploadedFiles={processedFiles}
        clips={[]}
        userCredits={10}
      />,
    );

    // Polling deve parar e exibir toast
    expect(toast.success).toHaveBeenCalledWith("Seus clipes estão prontos!");

    // Avançar mais 8 segundos não deve mais disparar refreshMock
    const callsBefore = refreshMock.mock.calls.length;
    vi.advanceTimersByTime(8000);
    expect(refreshMock).toHaveBeenCalledTimes(callsBefore);
  });
});
