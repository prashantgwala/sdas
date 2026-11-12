import fs from 'node:fs';
import { Types } from 'mongoose';
import { Document, OcrResult } from '../models/file';
import { SystemSetting } from '../models/platform';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error';
import { readStoredFile } from './storage.service';

const pdfParse = require('pdf-parse') as (
  buffer: Buffer,
) => Promise<{ text?: string; numpages?: number; info?: unknown }>;

interface ExtractionResult {
  text: string;
  confidence: number;
  engine: string;
}

function extractFields(text: string) {
  const referenceNumber =
    /(?:ref(?:erence)?\.?\s*(?:no\.?|number)?|file\s*no\.?|letter\s*no\.?|पत्र\s*संख्या|संदर्भ)[\s:#-]*([A-Z0-9][A-Z0-9/-]{3,})/i.exec(
      text,
    )?.[1] ?? '';
  const date =
    /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/.exec(text)?.[1] ?? '';
  const name =
    /(?:name|नाम)\s*[:\-]\s*([A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F .]{1,60})/i.exec(text)?.[1]?.trim() ??
    '';
  const address =
    /(?:address|पता)\s*[:\-]\s*([^\n]{5,200})/i.exec(text)?.[1]?.trim() ?? '';

  return { name, referenceNumber, date, address };
}

async function externalOcrEnabled(): Promise<boolean> {
  if (!env.OPENAI_API_KEY) return false;
  const setting = await SystemSetting.findOne({ key: 'ocr.externalEnabled' }).lean();
  return Boolean(setting?.value);
}

async function runOpenAiVision(buffer: Buffer, mimeType: string): Promise<ExtractionResult | null> {
  if (!(await externalOcrEnabled())) return null;
  try {
    const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Extract all readable text from the document image. Respond as JSON with keys text, name, referenceNumber, date, address, confidence (0 to 1). Do not guess unreadable values.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract the document text and key fields.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, 'External OCR request failed');
      return null;
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as {
      text?: string;
      confidence?: number;
      name?: string;
      referenceNumber?: string;
      date?: string;
      address?: string;
    };
    const text = typeof parsed.text === 'string' ? parsed.text : '';
    if (!text.trim()) return null;
    const fields = extractFields(text);
    return {
      text,
      confidence:
        typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.6,
      engine: 'openai-vision',
    };
  } catch (error) {
    logger.warn({ err: error }, 'External OCR request error');
    return null;
  }
}

async function extract(documentId: string): Promise<{
  result: ExtractionResult;
  fields: ReturnType<typeof extractFields>;
}> {
  const document = await Document.findById(documentId).lean();
  if (!document) throw new AppError(404, 'Document not found', 'NOT_FOUND');

  const buffer = await readStoredFile(document.storagePath);

  if (document.mimeType === 'application/pdf') {
    try {
      const parsed = await pdfParse(buffer);
      const text = (parsed.text ?? '').replace(/\u0000/g, '').trim();
      const confidence = text.length === 0 ? 0 : Math.min(0.92, 0.55 + text.length / 20_000);
      return { result: { text, confidence, engine: 'pdf-text' }, fields: extractFields(text) };
    } catch (error) {
      logger.warn({ err: error, documentId }, 'PDF text extraction failed');
    }
  }

  const vision = await runOpenAiVision(buffer, document.mimeType);
  if (vision) {
    return { result: vision, fields: extractFields(vision.text) };
  }

  throw new AppError(
    422,
    'No OCR engine is configured for this file type. Configure the OCR integration or enter the extracted text manually.',
    'OCR_ENGINE_UNAVAILABLE',
  );
}

export async function processDocumentOcr(documentId: string): Promise<Record<string, unknown>> {
  const document = await Document.findById(documentId);
  if (!document) throw new AppError(404, 'Document not found', 'NOT_FOUND');

  document.ocrStatus = 'PROCESSING';
  await document.save();

  await OcrResult.findOneAndUpdate(
    { document: document._id },
    { $set: { status: 'PENDING', error: undefined } },
    { upsert: true },
  );

  try {
    const { result, fields } = await extract(documentId);

    await OcrResult.findOneAndUpdate(
      { document: document._id },
      {
        $set: {
          extractedText: result.text.slice(0, 100_000),
          fields,
          confidence: result.confidence,
          engine: result.engine,
          status: 'COMPLETED',
          processedAt: new Date(),
          error: undefined,
        },
      },
      { upsert: true, new: true },
    );

    document.ocrStatus = 'COMPLETED';
    await document.save();
  } catch (error) {
    document.ocrStatus = 'FAILED';
    await document.save();
    await OcrResult.findOneAndUpdate(
      { document: document._id },
      {
        $set: {
          status: 'FAILED',
          processedAt: new Date(),
          error: error instanceof Error ? error.message.slice(0, 1000) : 'OCR failed',
        },
      },
      { upsert: true },
    );
    throw error;
  }

  return (await OcrResult.findOne({ document: document._id }).lean()) as Record<string, unknown>;
}

export async function getOcrResult(documentId: string) {
  return OcrResult.findOne({ document: documentId }).lean();
}

export async function verifyOcr(
  documentId: string,
  input: {
    extractedText?: string;
    fields?: { name?: string; referenceNumber?: string; date?: string; address?: string };
    verifiedBy: string;
  },
) {
  const result = await OcrResult.findOne({ document: documentId });
  if (!result) throw new AppError(404, 'OCR result not found', 'NOT_FOUND');

  if (input.extractedText !== undefined) result.extractedText = input.extractedText.slice(0, 100_000);
  if (input.fields) {
    const current = result.fields ?? { name: '', referenceNumber: '', date: '', address: '' };
    result.fields = {
      name: input.fields.name ?? current.name,
      referenceNumber: input.fields.referenceNumber ?? current.referenceNumber,
      date: input.fields.date ?? current.date,
      address: input.fields.address ?? current.address,
    };
  }
  result.status = 'VERIFIED';
  result.verifiedBy = new Types.ObjectId(input.verifiedBy);
  result.verifiedAt = new Date();
  result.corrections = input.fields ?? result.corrections;
  await result.save();

  await Document.updateOne({ _id: documentId }, { $set: { ocrStatus: 'VERIFIED' } });
  return result.toObject();
}

export function isPdfReadable(path: string): boolean {
  return fs.existsSync(path);
}
