import axios from 'axios';
import { createReadStream } from 'fs';
import FormData from 'form-data';

const GRAPH_URL = 'https://graph.facebook.com/v19.0';

export async function publishToFacebook(
  pageId: string,
  accessToken: string,
  caption: string,
  mediaFiles: Array<{ watermarkedPath: string | null; originalPath: string; mediaType: string; mimeType: string }>,
): Promise<string> {

  if (mediaFiles.length === 0) {
    // Text-only post
    const { data } = await axios.post(`${GRAPH_URL}/${pageId}/feed`, {
      message: caption,
      access_token: accessToken,
    });
    return data.id;
  }

  const images = mediaFiles.filter(m => m.mediaType === 'image');
  const videos = mediaFiles.filter(m => m.mediaType === 'video');

  if (videos.length > 0) {
    // Video post (use first video)
    const video = videos[0];
    const filePath = video.watermarkedPath || video.originalPath;
    const form = new FormData();
    form.append('source', createReadStream(filePath));
    form.append('description', caption);
    form.append('access_token', accessToken);

    const { data } = await axios.post(`${GRAPH_URL}/${pageId}/videos`, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    return data.id;
  }

  if (images.length === 1) {
    // Single image
    const img = images[0];
    const filePath = img.watermarkedPath || img.originalPath;
    const form = new FormData();
    form.append('source', createReadStream(filePath));
    form.append('message', caption);
    form.append('access_token', accessToken);

    const { data } = await axios.post(`${GRAPH_URL}/${pageId}/photos`, form, {
      headers: form.getHeaders(),
    });
    return data.id;
  }

  // Multiple images - upload unpublished, then create post
  const photoIds: string[] = [];
  for (const img of images) {
    const filePath = img.watermarkedPath || img.originalPath;
    const form = new FormData();
    form.append('source', createReadStream(filePath));
    form.append('published', 'false');
    form.append('access_token', accessToken);

    const { data } = await axios.post(`${GRAPH_URL}/${pageId}/photos`, form, {
      headers: form.getHeaders(),
    });
    photoIds.push(data.id);
  }

  const attachments: Record<string, { media_fbid: string }> = {};
  photoIds.forEach((id, i) => {
    attachments[`attached_media[${i}]`] = { media_fbid: id };
  });

  const postParams: any = {
    message: caption,
    access_token: accessToken,
  };
  photoIds.forEach((id, i) => {
    postParams[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
  });

  const { data } = await axios.post(`${GRAPH_URL}/${pageId}/feed`, postParams);
  return data.id;
}
