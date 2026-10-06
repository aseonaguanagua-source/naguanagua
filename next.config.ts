import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El PDF del recibo (servidor) lee el logo desde public/; incluirlo en las funciones que envían recibos
  outputFileTracingIncludes: {
    '/api/admin/recibos-digitales/**': ['./public/logos/iamec_pdf.png'],
  },
};

export default nextConfig;
