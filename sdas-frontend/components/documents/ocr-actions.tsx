"use client";

import { ScanText, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api";
import { titleCase } from "@/lib/utils";

interface OcrResultData {
  _id?: string;
  extractedText?: string;
  fields?: {
    name?: string;
    referenceNumber?: string;
    date?: string;
    address?: string;
  };
  confidence?: number;
  engine?: string;
  status?: string;
  error?: string;
  verifiedAt?: string | null;
  processedAt?: string | null;
}

function statusVariant(status?: string): "success" | "danger" | "warning" | "neutral" {
  if (status === "VERIFIED" || status === "COMPLETED") return "success";
  if (status === "FAILED") return "danger";
  if (status === "PENDING" || status === "PROCESSING") return "warning";
  return "neutral";
}

export function OcrActions({
  documentId,
  documentName,
  ocrStatus,
  onUpdated,
}: {
  documentId: string;
  documentName: string;
  ocrStatus?: string | null;
  onUpdated?: () => void;
}) {
  const { permissions } = useAuth();
  const canProcess = permissions.includes("ocr.process");
  const canVerify = permissions.includes("ocr.verify");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<OcrResultData | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [text, setText] = useState("");
  const [fields, setFields] = useState({ name: "", referenceNumber: "", date: "", address: "" });

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!canProcess && !canVerify) return null;

  async function loadResult() {
    setLoading(true);
    setError("");
    try {
      const data = await api.get<OcrResultData>(`/documents/${documentId}/ocr`);
      setResult(data);
      setText(data.extractedText ?? "");
      setFields({
        name: data.fields?.name ?? "",
        referenceNumber: data.fields?.referenceNumber ?? "",
        date: data.fields?.date ?? "",
        address: data.fields?.address ?? "",
      });
    } catch (cause) {
      setResult(null);
      const message = errorMessage(cause);
      if (!message.toLowerCase().includes("not available") && !message.toLowerCase().includes("not found")) {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  function openPanel() {
    setOpen(true);
    setNotice("");
    setError("");
    setResult(null);
    void loadResult();
  }

  async function runOcr() {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const data = await api.post<OcrResultData>(`/documents/${documentId}/ocr`);
      setResult(data);
      setText(data.extractedText ?? "");
      setFields({
        name: data.fields?.name ?? "",
        referenceNumber: data.fields?.referenceNumber ?? "",
        date: data.fields?.date ?? "",
        address: data.fields?.address ?? "",
      });
      setNotice("OCR completed. Review the extracted text and correct any errors before verifying.");
      onUpdated?.();
    } catch (cause) {
      setError(errorMessage(cause));
      onUpdated?.();
    } finally {
      setWorking(false);
    }
  }

  async function verify() {
    if (!result) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const data = await api.patch<OcrResultData>(`/documents/${documentId}/ocr`, {
        extractedText: text,
        fields,
      });
      setResult(data);
      setNotice("OCR result verified and saved.");
      onUpdated?.();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline"
        title={`OCR for ${documentName}`}
      >
        <ScanText className="size-3.5" aria-hidden />
        {ocrStatus === "VERIFIED" ? "Verified" : ocrStatus ? titleCase(ocrStatus) : "OCR"}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`OCR result for ${documentName}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-xl sm:rounded-2xl sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-primary">Document OCR</p>
                <h2 className="mt-1 truncate text-[16px] font-semibold text-foreground">{documentName}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close OCR panel"
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(result?.status ?? ocrStatus ?? undefined)}>
                {titleCase(result?.status ?? ocrStatus ?? "NOT PROCESSED")}
              </Badge>
              {result?.engine ? (
                <span className="text-[10.5px] text-muted-foreground">Engine: {result.engine}</span>
              ) : null}
              {typeof result?.confidence === "number" ? (
                <span className="text-[10.5px] text-muted-foreground">
                  Confidence: {Math.round(result.confidence * 100)}%
                </span>
              ) : null}
            </div>

            {error ? (
              <div className="mt-3">
                <Alert variant="error">{error}</Alert>
              </div>
            ) : null}
            {notice ? (
              <div className="mt-3">
                <Alert variant="success">{notice}</Alert>
              </div>
            ) : null}
            {result?.error ? (
              <div className="mt-3">
                <Alert variant="warning">{result.error}</Alert>
              </div>
            ) : null}

            {loading ? (
              <p className="mt-4 text-[12px] text-muted-foreground">Loading OCR result…</p>
            ) : result ? (
              <div className="mt-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`ocr-name-${documentId}`}>Name</Label>
                    <Input
                      id={`ocr-name-${documentId}`}
                      value={fields.name}
                      onChange={(event) => setFields((current) => ({ ...current, name: event.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`ocr-ref-${documentId}`}>Reference number</Label>
                    <Input
                      id={`ocr-ref-${documentId}`}
                      value={fields.referenceNumber}
                      onChange={(event) =>
                        setFields((current) => ({ ...current, referenceNumber: event.target.value }))
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`ocr-date-${documentId}`}>Date</Label>
                    <Input
                      id={`ocr-date-${documentId}`}
                      value={fields.date}
                      onChange={(event) => setFields((current) => ({ ...current, date: event.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`ocr-address-${documentId}`}>Address</Label>
                    <Input
                      id={`ocr-address-${documentId}`}
                      value={fields.address}
                      onChange={(event) => setFields((current) => ({ ...current, address: event.target.value }))}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor={`ocr-text-${documentId}`}>Extracted text</Label>
                  <Textarea
                    id={`ocr-text-${documentId}`}
                    rows={8}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    className="mt-1 font-mono text-[11.5px]"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {canProcess ? (
                    <Button variant="secondary" size="sm" onClick={() => void runOcr()} disabled={working}>
                      <ScanText className="size-3.5" aria-hidden />
                      {working ? "Processing…" : "Run OCR again"}
                    </Button>
                  ) : null}
                  {canVerify && result.status !== "VERIFIED" ? (
                    <Button variant="success" size="sm" onClick={() => void verify()} disabled={working}>
                      <ShieldCheck className="size-3.5" aria-hidden />
                      {working ? "Saving…" : "Verify result"}
                    </Button>
                  ) : result.status === "VERIFIED" ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
                      <ShieldCheck className="size-3.5" aria-hidden />
                      Verified by staff
                    </span>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-border bg-surface-muted/40 px-4 py-6 text-center">
                <p className="text-[12.5px] font-semibold text-foreground">No OCR result yet</p>
                <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-relaxed text-muted-foreground">
                  Run OCR to extract text and key fields. PDFs with selectable text are processed locally; images
                  require the configured OCR integration.
                </p>
                {canProcess ? (
                  <Button size="sm" className="mt-3" onClick={() => void runOcr()} disabled={working}>
                    <ScanText className="size-3.5" aria-hidden />
                    {working ? "Processing…" : "Run OCR"}
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
