// src/hooks/useStorage.js
//
// A reusable hook that provides functions for uploading files to Supabase Storage.
// It handles image compression (to keep files small), the actual upload, and
// returns the public URL so images can be displayed in the app.
//
// Usage inside any component:
//   const { uploadAvatar, uploadPostImage } = useStorage();
//   const url = await uploadAvatar(file, user.id);
//
// Both upload functions:
//   1. Compress the image using the browser's canvas API (no extra libraries needed)
//   2. Upload the compressed file to the correct Supabase Storage bucket
//   3. Return a permanent public HTTPS URL for the uploaded file

import { supabase } from '../lib/supabase';

// ── Image Compression ─────────────────────────────────────────────────────────
//
// How it works:
//   1. Turn the File into a temporary URL and load it into a hidden <img> element
//   2. Calculate the new width/height so the image fits inside maxWidth × maxHeight
//      while keeping the original proportions (e.g. a wide photo stays wide)
//   3. Draw it onto an off-screen <canvas> at the new size
//   4. Export the canvas as a JPEG Blob at the given quality level (0–1)
//
// Why canvas and not a library?
//   The browser already has all of this built in — no extra npm package needed.
//   The resulting Blob is a regular file that Supabase can accept directly.
//
// Parameters:
//   file      — the original File object from <input type="file">
//   maxWidth  — maximum pixel width of the output image
//   maxHeight — maximum pixel height of the output image
//   quality   — JPEG quality 0.0–1.0  (default 0.8 = 80% quality, good balance)
//
// Returns:
//   Promise<Blob> — a compressed image ready to upload
async function compressImage(file, maxWidth, maxHeight, quality = 0.8) {
  return new Promise((resolve) => {
    // createObjectURL gives us a temporary URL we can feed to <img src>
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      // Free the temporary URL now that the browser has loaded the image pixels
      URL.revokeObjectURL(objectUrl);

      // ── Scale down while keeping aspect ratio ────────────────────────────
      // Example: a 3000×2000 photo with maxWidth=800, maxHeight=800
      //   ratio = min(800/3000, 800/2000) = min(0.267, 0.4) = 0.267
      //   new size: 800×533  (landscape proportions preserved)
      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }

      // ── Draw onto an off-screen canvas at the new dimensions ─────────────
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      // drawImage stretches or shrinks the source image to fill the canvas
      ctx.drawImage(img, 0, 0, width, height);

      // ── Export as JPEG Blob ───────────────────────────────────────────────
      // toBlob is asynchronous — it calls the callback when the Blob is ready
      canvas.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        quality,
      );
    };

    // Kick off the load
    img.src = objectUrl;
  });
}

// ── The Hook ──────────────────────────────────────────────────────────────────
// Call useStorage() at the top of any component that needs to upload files.
// It returns the three upload/URL functions below.
export function useStorage() {

  // ── uploadAvatar(file, userId) ────────────────────────────────────────────
  //
  // Compresses a profile photo to max 800×800 px and uploads it to the
  // "avatars" Supabase Storage bucket under the path:
  //   avatars/<userId>/avatar.jpg
  //
  // Using the same fixed path for every user means each upload automatically
  // overwrites the old avatar — no orphaned files pile up in Storage.
  //
  // Parameters:
  //   file   — File object from <input type="file">
  //   userId — the logged-in user's Supabase UUID (user.id)
  //
  // Returns: the full HTTPS public URL of the uploaded avatar (string)
  // Throws:  an error object if the upload fails — callers should try/catch
  const uploadAvatar = async (file, userId) => {
    // Step 1: Shrink the image so we're not uploading a 10MB phone photo
    const compressed = await compressImage(file, 800, 800, 0.8);

    // Step 2: Upload to Supabase Storage
    //   upsert: true — if a file already exists at this path, overwrite it.
    //   This is what makes the "replace old avatar" behavior work.
    const path = `${userId}/avatar.jpg`;

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, compressed, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    // If Supabase returned an error, throw it so the calling code can show
    // a user-friendly error message
    if (error) throw error;

    // Step 3: Build and return the public URL
    // getPublicUrl is synchronous — it just constructs the URL from the
    // bucket name and path, no network request needed
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl;
  };

  // ── uploadPostImage(file, userId) ─────────────────────────────────────────
  //
  // Compresses a post photo to max 1200×1200 px and uploads it to the
  // "posts" Supabase Storage bucket under the path:
  //   posts/<userId>/<timestamp>-<filename>
  //
  // The timestamp in the path ensures each post gets its own unique file —
  // unlike avatars, we don't want to overwrite old post images.
  //
  // Parameters:
  //   file   — File object from <input type="file">
  //   userId — the logged-in user's Supabase UUID (user.id)
  //
  // Returns: the full HTTPS public URL of the uploaded image (string)
  // Throws:  an error object if the upload fails — callers should try/catch
  const uploadPostImage = async (file, userId) => {
    // Step 1: Shrink the image (larger max than avatar since feed images
    // can be wider/taller)
    const compressed = await compressImage(file, 1200, 1200, 0.8);

    // Step 2: Build a unique file path using the current timestamp
    // Replace any weird characters in the filename with underscores
    const timestamp = Date.now();
    const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path      = `${userId}/${timestamp}-${safeName}`;

    const { error } = await supabase.storage
      .from('posts')
      .upload(path, compressed, {
        contentType: 'image/jpeg',
        // upsert: false — never overwrite; if the same timestamp somehow
        // collides, we'd rather get an error than silently replace a post image
        upsert: false,
      });

    if (error) throw error;

    const { data } = supabase.storage.from('posts').getPublicUrl(path);
    return data.publicUrl;
  };

  // ── getPublicUrl(bucket, path) ────────────────────────────────────────────
  //
  // A utility for building the public URL of any file already in Storage
  // when you only have the bucket name and file path (not the full URL).
  //
  // Example:
  //   getPublicUrl('avatars', 'abc-123/avatar.jpg')
  //   → 'https://jsxzy...supabase.co/storage/v1/object/public/avatars/abc-123/avatar.jpg'
  const getPublicUrl = (bucket, path) => {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  };

  return { uploadAvatar, uploadPostImage, getPublicUrl };
}
