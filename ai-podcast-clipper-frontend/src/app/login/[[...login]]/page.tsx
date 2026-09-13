import { SignIn } from "@clerk/nextjs";
import { AuthSplitLayout } from "~/components/auth/auth-split-layout";
import { studioClerkAppearance } from "~/lib/clerk-appearance";

export default function LoginPage() {
  return (
    <AuthSplitLayout
      title="Bem-vindo de volta ao estúdio"
      subtitle="Entre na sua conta para continuar gerenciando e exportando seus cortes virais."
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
