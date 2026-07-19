/* ============================================================================
   Tarjeta de X/Twitter · convención `src/app/twitter-image.tsx`.

   X cae a `og:image` cuando no hay `twitter:image`, así que esto es cortesía,
   no rescate — y sale barato: MISMA imagen, mismas medidas (1200×630 entra en
   summary_large_image sin recorte raro). Se reexporta la ruta de OG en vez de
   duplicar el diseño: dos archivos con la misma tarjeta derivarían al primer
   retoque.
   ============================================================================ */
export { default, alt, size, contentType, runtime } from "./opengraph-image";
