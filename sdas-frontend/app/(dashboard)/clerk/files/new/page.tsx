import type { Metadata } from "next";
import { FileRegisterForm } from "@/components/files/file-register-form";

export const metadata: Metadata = { title: "Register a file" };

export default function ClerkNewFilePage() {
  return <FileRegisterForm backHref="/clerk/files" />;
}
