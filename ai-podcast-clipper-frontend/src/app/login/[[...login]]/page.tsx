import { SignIn } from "@clerk/nextjs";
import { AuthSplitLayout } from "~/components/auth/auth-split-layout";
import { studioClerkAppearance } from "~/lib/clerk-appearance";

export default function LoginPage() {
  return (
    <AuthSplitLayout
      title="Welcome back to the Studio"
      subtitle="Sign in to continue creating, customizing, and exporting your viral podcast clips."
    >
      <SignIn
        path="/login"
        routing="path"
        signUpUrl="/signup"
        fallbackRedirectUrl="/dashboard"
        appearance={studioClerkAppearance}
      />
    </AuthSplitLayout>
  );
}
