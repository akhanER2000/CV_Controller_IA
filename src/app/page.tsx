import { redirect } from "next/navigation";

// El paquete de diseño no define una landing pública: la puerta de entrada es
// la pantalla de auth (/login · /signup). La raíz redirige a /login.
export default function Home() {
  redirect("/login");
}
