import { CustomSignUpForm } from "~/components/auth/custom-sign-up-form";
import { AuthSplitLayout } from "~/components/auth/auth-split-layout";

export default function SignUpPage() {
  return (
    <AuthSplitLayout
      title="Crie sua conta no Studio"
      subtitle="Comece com 10 minutos gratuitos. Envie seu episódio e gere seus primeiros clipes virais em minutos."
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--linha)] bg-[var(--superficie)] p-6 sm:p-8 shadow-[0_0_40px_rgba(0,0,0,0.8)]">
        <CustomSignUpForm />
      </div>
    </AuthSplitLayout>
  );
}
