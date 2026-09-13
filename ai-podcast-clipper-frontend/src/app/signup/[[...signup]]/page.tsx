import { SignUp } from "@clerk/nextjs";
import { AuthSplitLayout } from "~/components/auth/auth-split-layout";
import { studioClerkAppearance } from "~/lib/clerk-appearance";

export default function SignUpPage() {
  return (
    <AuthSplitLayout
      title="Crie sua conta no estúdio"
      subtitle="Comece com 10 créditos gratuitos para processar e extrair seus primeiros cortes virais."
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
