import { redirect } from "next/navigation";

// El diseño nuevo tiene UNA pantalla de auth servida en /login y /signup.
// /auth es una ruta heredada: redirige a /login.
export default function AuthPage() {
  redirect("/login");
}
