import { Router, Response } from 'express';
import multer from 'multer';
import { db } from '../db.js';
import { storage } from '../storage.js';
import { requireAuth, AuthenticatedRequest } from '../auth.js';

export const documentsRouter = Router();

// Configure Multer in-memory storage (up to 10MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMime = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowedMime.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Only PDF, JPEG, PNG, and WebP invoices are permitted.'));
    }
  },
});

documentsRouter.use(requireAuth);

// GET /api/v1/documents
documentsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const docs = await db.getDocuments(userId);
    return res.json({ documents: docs });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve documents.' });
  }
});

// POST /api/v1/documents/upload
documentsRouter.post('/upload', upload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Please select a valid invoice file to upload.' });
    }

    const warrantyId = req.body.warranty_id || null;

    // Verify warranty belongs to this user if provided
    if (warrantyId) {
      const w = await db.getWarrantyById(warrantyId, userId);
      if (!w) {
        return res.status(400).json({ error: 'Specified warranty does not exist or belong to your account.' });
      }
    }

    // Upload to AntiDeploy private bucket or local secure vault
    const { objectKey, isS3 } = await storage.uploadInvoice(
      userId,
      file.originalname,
      file.mimetype,
      file.buffer
    );

    // Save metadata in database
    const docRecord = await db.createDocument(userId, {
      original_filename: file.originalname,
      object_key: objectKey,
      mime_type: file.mimetype,
      file_size: file.size,
      warranty_id: warrantyId,
      // If local storage, also store in bytea/blob for safety
      file_data: isS3 ? null : file.buffer,
    });

    return res.status(201).json({
      document: docRecord,
      message: 'Invoice uploaded and encrypted securely.',
    });
  } catch (err: any) {
    console.error('[Documents] Upload error:', err);
    return res.status(500).json({ error: err.message || 'Failed to upload document.' });
  }
});

// GET /api/v1/documents/:id
documentsRouter.get('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const doc = await db.getDocumentById(id, userId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    return res.json({ document: doc });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch document metadata.' });
  }
});

// POST /api/v1/documents/:id/download-url
// Issues an authorized, short-lived signed URL (15 minutes) or authorized proxy route
documentsRouter.post('/:id/download-url', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const doc = await db.getDocumentById(id, userId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found or unauthorized.' });
    }

    if (storage.isS3) {
      const { url, isSignedS3 } = await storage.getDownloadUrl(doc.object_key, 900); // 15 mins
      return res.json({
        url,
        is_signed_s3: isSignedS3,
        expires_in_seconds: 900,
        filename: doc.original_filename,
      });
    }

    // Local stream route
    return res.json({
      url: `/api/v1/documents/${id}/download`,
      is_signed_s3: false,
      expires_in_seconds: 900,
      filename: doc.original_filename,
    });
  } catch (err: any) {
    console.error('[Documents] Download URL generation error:', err);
    return res.status(500).json({ error: 'Failed to generate download URL.' });
  }
});

// GET /api/v1/documents/:id/download
// Authorized streaming endpoint for downloading files securely
documentsRouter.get('/:id/download', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const doc = await db.getDocumentById(id, userId, true);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found or unauthorized.' });
    }

    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.original_filename)}"`);

    // If local buffer exists in DB
    if (doc.file_data) {
      return res.send(doc.file_data);
    }

    // Try local file stream
    const stream = await storage.getLocalFileStream(doc.object_key);
    if (stream) {
      return stream.pipe(res);
    }

    return res.status(404).json({ error: 'File data unavailable.' });
  } catch (err: any) {
    console.error('[Documents] Stream error:', err);
    return res.status(500).json({ error: 'Failed to stream document.' });
  }
});

// PATCH /api/v1/documents/:id/link
documentsRouter.patch('/:id/link', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { warranty_id } = req.body;

    if (warranty_id) {
      const w = await db.getWarrantyById(warranty_id, userId);
      if (!w) {
        return res.status(400).json({ error: 'Warranty not found or unauthorized.' });
      }
    }

    const linked = await db.linkDocumentToWarranty(id, warranty_id || null, userId);
    if (!linked) {
      return res.status(404).json({ error: 'Document not found or could not be updated.' });
    }

    return res.json({ success: true, message: 'Document linked successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update document link.' });
  }
});

// DELETE /api/v1/documents/:id
documentsRouter.delete('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const doc = await db.deleteDocument(id, userId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    // Delete underlying object from storage
    await storage.deleteInvoice(doc.object_key);

    return res.json({ success: true, message: 'Document deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete document.' });
  }
});
