-- Bulk WhatsApp videos can be made Small (480p) / Medium (720p) by the WhatsApp server before
-- sending, so the upload itself may be up to 50 MB, and iPhone .mov videos are accepted too.
UPDATE storage.buckets
SET file_size_limit = 52428800,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'application/pdf']
WHERE id = 'bulk-whatsapp-media';
