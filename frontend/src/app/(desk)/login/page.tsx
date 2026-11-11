import { LoginForm } from "@/features/desk/login-form";
import { loadPublicSupport } from "@/features/landing/load-public-support";

export default async function LoginPage() {
  const support = await loadPublicSupport();
  return <LoginForm initialSupport={support} />;
}
