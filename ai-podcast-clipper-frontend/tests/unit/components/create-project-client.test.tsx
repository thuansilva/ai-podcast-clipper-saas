import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateProjectClient } from "~/components/dashboard/create-project-client";
import { importYouTubeVideo } from "~/actions/youtube";
import { toast } from "sonner";
import type { ProcessingOption } from "~/application/services/processing-options.service";

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("~/actions/youtube", () => ({
  importYouTubeVideo: vi.fn(),
}));

vi.mock("~/components/ui/slider", () => ({
  Slider: ({ value, onValueChange }: any) => (
    <div data-testid="mock-slider" onClick={() => onValueChange([1, 4])}>
      {value?.join("-")}
    </div>
  ),
}));

const mockOptions: Record<string, ProcessingOption[]> = {
  GENRE: [
    {
      id: "1",
      type: "GENRE",
      value: "humor",
      label: "Humor",
      order: 1,
      isActive: true,
      isDefault: false,
    },
    {
      id: "2",
      type: "GENRE",
      value: "podcast",
      label: "Podcast",
      order: 2,
      isActive: true,
      isDefault: true,
    },
  ],
  ASPECT_RATIO: [
    {
      id: "5",
      type: "ASPECT_RATIO",
      value: "9:16",
      label: "Vertical (9:16)",
      order: 1,
      isActive: true,
      isDefault: true,
    },
    {
      id: "6",
      type: "ASPECT_RATIO",
      value: "16:9",
      label: "Horizontal (16:9)",
      order: 2,
      isActive: true,
      isDefault: false,
    },
  ],
  CLIP_MODEL: [
    {
      id: "7",
      type: "CLIP_MODEL",
      value: "auto",
      label: "Padrão",
      order: 1,
      isActive: true,
      isDefault: true,
    },
    {
      id: "8",
      type: "CLIP_MODEL",
      value: "face_focus",
      label: "Foco no Rosto",
      order: 2,
      isActive: true,
      isDefault: false,
    },
  ],
};

describe("CreateProjectClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders the initial URL import input", () => {
    render(<CreateProjectClient userCredits={10} options={mockOptions} />);

    expect(screen.getByText("Criar Novo Projeto")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("https://youtube.com/watch?v=..."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Fazer upload de arquivo local"),
    ).toBeInTheDocument();
  });

  it("fetches video metadata and displays dynamic options", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: "Podcast Incrível",
        durationSeconds: 600,
        thumbnailUrl: "https://img.youtube.com/vi/test/hqdefault.jpg",
      }),
    });

    render(<CreateProjectClient userCredits={10} options={mockOptions} />);

    const input = screen.getByPlaceholderText(
      "https://youtube.com/watch?v=...",
    );
    fireEvent.change(input, {
      target: { value: "https://youtube.com/watch?v=12345" },
    });

    await waitFor(() => {
      expect(screen.getByText("Podcast Incrível")).toBeInTheDocument();
    });

    // Verify dynamic options rendered
    expect(screen.getByText("Configurações do Corte")).toBeInTheDocument();
    expect(screen.getByText("Gênero do Conteúdo")).toBeInTheDocument();
    expect(screen.getByText("Modelo do Clipe (Modo de IA)")).toBeInTheDocument();
    expect(screen.getByText("Proporção (Aspect Ratio)")).toBeInTheDocument();
    expect(screen.getByText("Auto Zoom")).toBeInTheDocument();
    expect(screen.getByText("Auto Zoom")).toBeInTheDocument();

    // Verify Sem Legenda card is present
    expect(screen.getByText("Sem Legenda")).toBeInTheDocument();
  });

  it("selects default options based on isDefault", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: "Podcast Incrível",
        durationSeconds: 600,
        thumbnailUrl: "https://img.youtube.com/vi/test/hqdefault.jpg",
      }),
    });

    render(<CreateProjectClient userCredits={10} options={mockOptions} />);

    fireEvent.change(
      screen.getByPlaceholderText("https://youtube.com/watch?v=..."),
      {
        target: { value: "https://youtube.com/watch?v=12345" },
      },
    );

    await waitFor(() => {
      expect(screen.getByText("Podcast Incrível")).toBeInTheDocument();
    });

    const genreSelect = screen.getByLabelText(
      "Gênero do Conteúdo",
    ) as HTMLSelectElement;
    expect(genreSelect.value).toBe("podcast"); // id: 2 isDefault

    const clipModelSelect = screen.getByLabelText(
      "Modelo do Clipe (Modo de IA)",
    ) as HTMLSelectElement;
    expect(clipModelSelect.value).toBe("auto"); // id: 7 isDefault

    const aspectSelect = screen.getByLabelText(
      "Proporção",
    ) as HTMLSelectElement;
    expect(aspectSelect.value).toBe("9:16");


    const autoZoomSwitch = screen.getByLabelText(
      "Auto Zoom",
    ) as HTMLButtonElement;
    expect(autoZoomSwitch.getAttribute("aria-checked")).toBe("true");
  });

  it("submits video with dynamic options and 'Sem Legenda' preset NONE", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: "Podcast Incrível",
        durationSeconds: 600,
        thumbnailUrl: "https://img.youtube.com/vi/test/hqdefault.jpg",
      }),
    });

    vi.mocked(importYouTubeVideo).mockResolvedValueOnce({
      success: true,
      uploadedFileId: "file-xyz",
    });

    render(<CreateProjectClient userCredits={10} options={mockOptions} />);

    fireEvent.change(
      screen.getByPlaceholderText("https://youtube.com/watch?v=..."),
      {
        target: { value: "https://youtube.com/watch?v=12345" },
      },
    );

    await waitFor(() => {
      expect(screen.getByText("Podcast Incrível")).toBeInTheDocument();
    });

    // Change genre to humor
    fireEvent.change(screen.getByLabelText("Gênero do Conteúdo"), {
      target: { value: "humor" },
    });

    // Click "Sem Legenda" card
    fireEvent.click(screen.getByText("Sem Legenda"));

    // Toggle auto zoom
    fireEvent.click(screen.getByLabelText("Auto Zoom"));

    // Submit
    fireEvent.click(screen.getByText("Confirmar e Processar"));

    await waitFor(() => {
      expect(importYouTubeVideo).toHaveBeenCalledWith({
        url: "https://youtube.com/watch?v=12345",
        preset: "NONE",
        sliceStartTime: 0,
        sliceEndTime: 300,
        mode: "auto",
        genre: "humor",
        clipModel: "auto",
        aspectRatio: "9:16",
        autoZoom: false,
      });
    });

    expect(toast.success).toHaveBeenCalledWith(
      "Vídeo enviado para processamento!",
    );
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("blocks submission if user credits are insufficient", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: "Podcast Incrível",
        durationSeconds: 600,
        thumbnailUrl: "https://img.youtube.com/vi/test/hqdefault.jpg",
      }),
    });

    // user has only 2 credits, default slice 0..5 costs 5 credits
    render(<CreateProjectClient userCredits={2} options={mockOptions} />);

    fireEvent.change(
      screen.getByPlaceholderText("https://youtube.com/watch?v=..."),
      {
        target: { value: "https://youtube.com/watch?v=12345" },
      },
    );

    await waitFor(() => {
      expect(screen.getByText("Podcast Incrível")).toBeInTheDocument();
    });

    const submitBtn = screen.getByText("Confirmar e Processar");
    expect(submitBtn).toBeDisabled();

    fireEvent.click(submitBtn);
    expect(importYouTubeVideo).not.toHaveBeenCalled();
  });
});
