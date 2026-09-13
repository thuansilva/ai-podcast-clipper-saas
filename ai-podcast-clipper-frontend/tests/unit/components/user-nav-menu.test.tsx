import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UserNavMenu } from "~/components/user-nav-menu";
import NavHeader from "~/components/nav-header";

const mockPush = vi.fn();
const mockSignOut = vi.fn();
let mockUser: any = null;
let mockIsLoaded = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    user: mockUser,
    isLoaded: mockIsLoaded,
    isSignedIn: !!mockUser,
  }),
  useClerk: () => ({
    signOut: mockSignOut,
  }),
}));

describe("UserNavMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    mockIsLoaded = true;
    mockUser = {
      id: "user_123",
      fullName: "Carlos Eduardo",
      primaryEmailAddress: {
        emailAddress: "carlos@example.com",
      },
      imageUrl: "",
    };
  });

  it("deve renderizar fallback com as iniciais do usuário em maiúsculas quando não houver imagem", () => {
    mockUser = {
      id: "user_123",
      fullName: "Carlos Eduardo",
      primaryEmailAddress: { emailAddress: "carlos@example.com" },
      imageUrl: "",
    };

    render(<UserNavMenu />);

    // Fallback com iniciais "CE"
    const fallback = screen.getByText("CE");
    expect(fallback).toBeInTheDocument();
  });

  it("deve calcular iniciais padrão 'US' quando o usuário não tiver nome nem email", () => {
    mockUser = {
      id: "user_456",
      fullName: null,
      primaryEmailAddress: null,
      imageUrl: "",
    };

    render(<UserNavMenu />);

    expect(screen.getByText("US")).toBeInTheDocument();
  });

  it("deve renderizar a imagem do avatar quando o usuário tiver imageUrl", async () => {
    const originalNaturalWidth = Object.getOwnPropertyDescriptor(
      window.HTMLImageElement.prototype,
      "naturalWidth",
    );
    const originalComplete = Object.getOwnPropertyDescriptor(
      window.HTMLImageElement.prototype,
      "complete",
    );

    Object.defineProperty(window.HTMLImageElement.prototype, "naturalWidth", {
      get: () => 100,
      configurable: true,
    });
    Object.defineProperty(window.HTMLImageElement.prototype, "complete", {
      get: () => true,
      configurable: true,
    });

    try {
      mockUser = {
        id: "user_123",
        fullName: "Carlos Silva",
        primaryEmailAddress: { emailAddress: "carlos@example.com" },
        imageUrl: "https://example.com/avatar.jpg",
      };

      render(<UserNavMenu />);

      await waitFor(() => {
        const img = screen.getByRole("img");
        expect(img).toHaveAttribute("src", "https://example.com/avatar.jpg");
        expect(img).toHaveAttribute("alt", "Carlos Silva");
      });
    } finally {
      if (originalNaturalWidth) {
        Object.defineProperty(
          window.HTMLImageElement.prototype,
          "naturalWidth",
          originalNaturalWidth,
        );
      } else {
        delete (window.HTMLImageElement.prototype as any).naturalWidth;
      }
      if (originalComplete) {
        Object.defineProperty(
          window.HTMLImageElement.prototype,
          "complete",
          originalComplete,
        );
      } else {
        delete (window.HTMLImageElement.prototype as any).complete;
      }
    }
  });

  it("deve exibir esqueleto pulsante enquanto os dados do usuário estiverem carregando", () => {
    mockIsLoaded = false;
    mockUser = null;

    const { container } = render(<UserNavMenu />);

    const skeleton = container.querySelector(".animate-pulse");
    expect(skeleton).toBeInTheDocument();
  });

  it("deve retornar null se isLoaded for true mas não houver usuário", () => {
    mockIsLoaded = true;
    mockUser = null;

    const { container } = render(<UserNavMenu />);

    expect(container.firstChild).toBeNull();
  });

  const openMenu = (trigger: HTMLElement) => {
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  };

  it("deve abrir o menu dropdown ao clicar no trigger e exibir nome e email do usuário", async () => {
    mockUser = {
      id: "user_123",
      fullName: "Carlos Eduardo",
      primaryEmailAddress: {
        emailAddress: "carlos@example.com",
      },
      imageUrl: "",
    };

    render(<UserNavMenu />);

    const trigger = screen.getByRole("button", { name: /menu do usuário/i });
    openMenu(trigger);

    await waitFor(() => {
      expect(screen.getByText("Carlos Eduardo")).toBeInTheDocument();
      expect(screen.getByText("carlos@example.com")).toBeInTheDocument();
    });
  });

  it("deve exibir 'Usuário Studio' caso o usuário não possua fullName", async () => {
    mockUser = {
      id: "user_123",
      fullName: null,
      primaryEmailAddress: {
        emailAddress: "semnome@example.com",
      },
      imageUrl: "",
    };

    render(<UserNavMenu />);

    const trigger = screen.getByRole("button", { name: /menu do usuário/i });
    openMenu(trigger);

    await waitFor(() => {
      expect(screen.getByText("Usuário Studio")).toBeInTheDocument();
      expect(screen.getByText("semnome@example.com")).toBeInTheDocument();
    });
  });

  it("deve exibir item de navegação para /dashboard/billing com 'Faturamento & Créditos'", async () => {
    render(<UserNavMenu />);

    const trigger = screen.getByRole("button", { name: /menu do usuário/i });
    openMenu(trigger);

    await waitFor(() => {
      const billingLink = screen.getByRole("menuitem", {
        name: /faturamento & créditos/i,
      });
      expect(billingLink).toBeInTheDocument();
      expect(billingLink.closest("a")).toHaveAttribute(
        "href",
        "/dashboard/billing",
      );
    });
  });

  it("deve chamar signOut e redirecionar para a home ao clicar em 'Sair da conta'", async () => {
    mockSignOut.mockImplementation((callback?: () => void) => {
      if (callback) callback();
      return Promise.resolve();
    });

    render(<UserNavMenu />);

    const trigger = screen.getByRole("button", { name: /menu do usuário/i });
    openMenu(trigger);

    const logoutItem = await screen.findByRole("menuitem", {
      name: /sair da conta/i,
    });
    fireEvent.click(logoutItem);

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/");
  });
});

describe("NavHeader integration with UserNavMenu", () => {
  it("deve renderizar UserNavMenu no NavHeader", () => {
    mockIsLoaded = true;
    mockUser = {
      id: "user_123",
      fullName: "Carlos Eduardo",
      primaryEmailAddress: { emailAddress: "carlos@example.com" },
      imageUrl: "",
    };

    render(<NavHeader credits={10} email="carlos@example.com" />);

    expect(
      screen.getByRole("button", { name: /menu do usuário/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/10\s*créditos/i)).toBeInTheDocument();
  });
});
