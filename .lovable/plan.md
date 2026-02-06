
## Add Multiple Product Images with Gallery View

### Overview
Add the ability to upload and manage 2-3 images per product from the Product Dashboard, with a full-screen image viewer when clicking on product images.

### Current State
- Products have a single `image_url` column storing one image
- Product images are uploaded to the `product-images` storage bucket
- The dashboard shows a single thumbnail in the "Image" column

### Solution

#### 1. Database Changes
Create a new `product_images` table to store multiple images per product:

```text
product_images
+---------------+--------+------------------------------------------+
| Column        | Type   | Description                              |
+---------------+--------+------------------------------------------+
| id            | uuid   | Primary key                              |
| product_id    | uuid   | Foreign key to products table            |
| image_url     | text   | URL of the uploaded image                |
| display_order | int    | Order of image (1, 2, or 3)              |
| created_at    | date   | Timestamp                                |
| organization_id | uuid | Foreign key to organizations            |
+---------------+--------+------------------------------------------+
```

RLS Policies:
- SELECT: Users can view images for their organization
- INSERT/UPDATE/DELETE: Users can manage images for their organization

#### 2. New Components

**ProductImageGallery Component**
- Displays a row of 1-3 thumbnail images
- Shows "Add Image" button if fewer than 3 images
- Clickable thumbnails to open full-size viewer

**ProductImageViewer Dialog**
- Full-screen modal to view product images
- Image carousel with navigation (prev/next)
- Close button to dismiss

**ProductImageUploader Dialog**
- Upload new images (max 3 per product)
- Shows existing images with delete option
- Drag-and-drop or click to upload

#### 3. ProductDashboard Updates

**Image Column Enhancement**
- Replace single Avatar with gallery component
- Show primary image as main thumbnail
- Small "+" icon to add more images
- Click opens image viewer dialog

**New State Variables**
```typescript
const [imageViewerOpen, setImageViewerOpen] = useState(false);
const [imageUploaderOpen, setImageUploaderOpen] = useState(false);
const [selectedProductImages, setSelectedProductImages] = useState<{
  productId: string;
  productName: string;
  images: Array<{ id: string; url: string; order: number }>;
}>({ productId: '', productName: '', images: [] });
```

#### 4. User Flow

**Adding Images:**
1. User clicks "+" or empty image area in product row
2. Image uploader dialog opens
3. User can upload up to 3 images (5MB each)
4. Images are uploaded to `product-images` bucket
5. Records are created in `product_images` table

**Viewing Images:**
1. User clicks on any product image thumbnail
2. Full-screen image viewer opens
3. User can navigate between images if multiple exist
4. Click outside or X button closes viewer

### UI Mockup

```text
Product Dashboard Table - Image Column
+----------------------------------+
| [img1] [img2] [+]               |  <- 2 images + add button
+----------------------------------+
| [img]                           |  <- 1 image (click to add more)
+----------------------------------+
| [   +   ]                       |  <- No images, upload prompt
+----------------------------------+

Image Viewer Dialog (Full Screen)
+------------------------------------------+
|                                    [X]   |
|                                          |
|       +------------------------+         |
|   [<] |                        | [>]     |
|       |      FULL IMAGE        |         |
|       |                        |         |
|       +------------------------+         |
|                                          |
|            [ 1 ] [ 2 ] [ 3 ]             |  <- Dot indicators
+------------------------------------------+
```

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/ProductImageGallery.tsx` | Create | Thumbnail gallery component |
| `src/components/ProductImageViewer.tsx` | Create | Full-screen viewer dialog |
| `src/components/ProductImageUploader.tsx` | Create | Upload/manage images dialog |
| `src/pages/ProductDashboard.tsx` | Modify | Integrate gallery, viewer, uploader |
| Migration | Create | Add product_images table with RLS |

### Technical Considerations

- **Image Limit**: Enforce max 3 images per product in both UI and database
- **Storage**: Reuse existing `product-images` bucket
- **Performance**: Lazy load images, use optimized thumbnails
- **Migration**: Existing `image_url` from products table will be migrated to first image in new table
- **Backward Compatibility**: Keep `image_url` field on products synced with primary image
