import type { Metadata } from "next";
import AdminApp from "./admin-app";

export const metadata: Metadata = {
  title: "FIFA 토토 · 관리자",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminApp />;
}
