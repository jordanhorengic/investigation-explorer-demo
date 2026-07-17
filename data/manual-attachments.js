/**
 * Optional overlay for files uploaded manually in Celonis PIG Explorer
 * (_File objects are not available via the PQL perspective export API).
 *
 * Add entries copied from Person_File / Vorgang_File detail panels:
 *
 * window.MANUAL_ATTACHMENTS = [
 *   {
 *     entityId: 'bbbb-0145-0000-0000-bbbbbbbbbbbb',
 *     attachment: {
 *       fileName: 'uploaded_photo.jpg',
 *       mimeType: 'image/jpeg',
 *       tag: 'Evidence photo',
 *       url: 'https://...',
 *       uploadedAt: '2026-07-01',
 *     },
 *   },
 * ];
 */
window.MANUAL_ATTACHMENTS = window.MANUAL_ATTACHMENTS || [];
