import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Desenvolvimento via rede local (ex.: celular em http://192.168.0.104:3000):
  // o Next bloqueia assets/endpoints de dev de origens fora de localhost +
  // hostname de inicialização. Sem esta entrada o HMR/recursos `/_next/*`
  // vindos pelo IP são rejeitados ("Blocked cross-origin request").
  // Se o IP do PC mudar (DHCP), atualize aqui. Não afeta `npm start`.
  allowedDevOrigins: ["192.168.0.104"],
};

export default nextConfig;
