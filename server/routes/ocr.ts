import { Router, Response } from 'express';
import multer from 'multer';
import { requireAuth, AuthenticatedRequest } from '../auth.js';
import { processInvoiceOcr } from '../ocr.js';
import { storage } from '../storage.js';
import { db } from '../db.js';

export const ocrRouter = Router();

// In-memory multer upload for OCR processing (10MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/tiff',
      'image/bmp',
    ];
    if (allowed.includes(file.mimetype) || /\.(pdf|jpe?g|png|webp)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed formats: PDF, JPEG, PNG, WebP.'));
    }
  },
});

/**
 * POST /api/v1/ocr/process
 * Accepts an invoice file, extracts text via Tesseract OCR or PDF parsing,
 * attempts to identify key warranty fields as suggestions, and optionally saves
 * document to AntiDeploy private object storage.
 */
ocrRouter.post(
  '/process',
  requireAuth,
  upload.single('invoice'),
  async (req: AuthenticatedRequest, res: Response) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Please select an invoice file (PDF, JPEG, or PNG).' });
    }

    const userId = req.user!.id;
    const saveToStorage = req.query.save === 'true' || req.body.save === 'true';

    try {
      console.log(`[OCR] Processing file "${file.originalname}" (${(file.size / 1024).toFixed(1)} KB) for user ${userId}...`);

      // 1. Run OCR and smart field parsing
      const ocrResult = await processInvoiceOcr(file.buffer, file.mimetype, file.originalname);

      if (!ocrResult.success) {
        return res.status(422).json({
          success: false,
          error: ocrResult.error || 'Failed to read printed text from invoice.',
        });
      }

      let storedDocId: string | undefined;
      let storedFilename: string | undefined;

      // 2. If requested, persist file to AntiDeploy private S3 storage
      if (saveToStorage) {
        const { objectKey, isS3 } = await storage.uploadInvoice(
          userId,
          file.originalname,
          file.mimetype,
          file.buffer
        );

        const docRecord = await db.createDocument(userId, {
          original_filename: file.originalname,
          object_key: objectKey,
          mime_type: file.mimetype,
          file_size: file.size,
          warranty_id: null,
          file_data: isS3 ? null : file.buffer,
        });

        storedDocId = docRecord.id;
        storedFilename = docRecord.original_filename;
      }

      return res.json({
        success: true,
        message: 'Invoice parsed successfully. Review suggested fields before saving.',
        suggestions: ocrResult.suggestions,
        document_id: storedDocId,
        filename: storedFilename || file.originalname,
        file_size: file.size,
        mime_type: file.mimetype,
      });
    } catch (err: any) {
      console.error('[OCR] Error during extraction:', err);
      return res.status(500).json({
        success: false,
        error: err.message || 'An unexpected error occurred during OCR processing.',
      });
    }
  }
);
