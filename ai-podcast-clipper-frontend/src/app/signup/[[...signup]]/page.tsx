import { SignUp } from "@clerk/nextjs";
import { AuthSplitLayout } from "~/components/auth/auth-split-layout";
import { studioClerkAppearance } from "~/lib/clerk-appearance";

export default function SignUpPage() {
  return (
    <AuthSplitLayout
      title="Create your Studio account"
      subtitle="Get started with 10 free minutes. Upload and generate your first viral clips in minutes."
    >
      <SignUp
        path="/signup"
        routing="path"
        signInUrl="/login"
        fallbackRedirectUrl="/dashboard"
        appearance={studioClerkAppearance}
      />
    </AuthSplitLayout>
  );
}
