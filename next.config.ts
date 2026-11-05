import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El PDF del recibo (servidor) lee el logo desde public/; incluirlo en todas las funciones que envían recibos
  outputFileTracingIncludes: {
    '/api/admin/recibos-digitales/**': ['./public/logos/iamec_pdf.png'],
    '/api/admin/condominios/cobrar': ['./public/logos/iamec_pdf.png'],
    '/api/admin/factura-digital/emitir': ['./public/logos/iamec_pdf.png'],
  },
};

export default nextConfig;
