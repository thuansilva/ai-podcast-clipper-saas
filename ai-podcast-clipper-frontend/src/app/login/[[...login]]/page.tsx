import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <SignIn path="/login" routing="path" signUpUrl="/signup" />
    </div>
  );
}
