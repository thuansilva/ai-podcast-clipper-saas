import { CustomSignInForm } from "~/components/auth/custom-sign-in-form";
import { AuthSplitLayout } from "~/components/auth/auth-split-layout";

export default function LoginPage() {
  return (
    <AuthSplitLayout
      title="Bem-vindo de volta ao Studio"
      subtitle="Acesse sua conta para continuar criando, personalizando e exportando seus cortes virais."
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--linha)] bg-[var(--superficie)] p-6 sm:p-8 shadow-[0_0_40px_rgba(0,0,0,0.8)]">
        <CustomSignInForm />
      </div>
    </AuthSplitLayout>
  );
}
