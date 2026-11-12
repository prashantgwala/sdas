import type { Metadata } from "next";
import { DocumentLibrary } from "@/components/documents/document-library";

export const metadata: Metadata = { title: "My documents" };

export default function CitizenDocumentsPage() {
  return <DocumentLibrary />;
}
