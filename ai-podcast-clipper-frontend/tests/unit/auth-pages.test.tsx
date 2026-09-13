import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginPage from "~/app/login/[[...login]]/page";
import SignUpPage from "~/app/signup/[[...signup]]/page";
import { studioClerkAppearance } from "~/lib/clerk-appearance";
import { SignIn, SignUp } from "@clerk/nextjs";

vi.mock("@clerk/nextjs", () => ({
  SignIn: vi.fn((props) => (
    <div
      data-testid="clerk-signin"
      data-path={props.path}
      data-signup={props.signUpUrl}
      data-fallback={props.fallbackRedirectUrl}
    >
      Mock SignIn Component
    </div>
  )),
  SignUp: vi.fn((props) => (
    <div
      data-testid="clerk-signup"
      data-path={props.path}
      data-signin={props.signInUrl}
      data-fallback={props.fallbackRedirectUrl}
    >
      Mock SignUp Component
    </div>
  )),
}));

describe("Auth Pages", () => {
  it("renders LoginPage within AuthSplitLayout with Clerk SignIn", () => {
    render(<LoginPage />);
    expect(screen.getByTestId("clerk-signin")).toBeInTheDocument();
    expect(screen.getAllByText("Podcast Clipper")[0]).toBeInTheDocument();
    expect(screen.getByText("Welcome back to the Studio")).toBeInTheDocument();
    expect(screen.getByText(/Sign in to continue creating/i)).toBeInTheDocument();

    expect(SignIn).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/login",
        routing: "path",
        signUpUrl: "/signup",
        fallbackRedirectUrl: "/dashboard",
        appearance: studioClerkAppearance,
      }),
      undefined
    );
  });

  it("renders SignUpPage within AuthSplitLayout with Clerk SignUp", () => {
    render(<SignUpPage />);
    expect(screen.getByTestId("clerk-signup")).toBeInTheDocument();
    expect(screen.getAllByText("Podcast Clipper")[0]).toBeInTheDocument();
    expect(screen.getByText("Create your Studio account")).toBeInTheDocument();
    expect(screen.getByText(/Get started with 10 free minutes/i)).toBeInTheDocument();

    expect(SignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/signup",
        routing: "path",
        signInUrl: "/login",
        fallbackRedirectUrl: "/dashboard",
        appearance: studioClerkAppearance,
      }),
      undefined
    );
  });
});
