import Providers from "@/app/providers";

export default function AuthLayout({ children }: React.PropsWithChildren) {
  return <Providers>{children}</Providers>;
}