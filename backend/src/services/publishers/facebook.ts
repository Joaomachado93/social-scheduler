import axios from 'axios';
import type { PublisherMedia } from './instagram.js';

const GRAPH_URL = 'https://graph.facebook.com/v19.0';

export async function publishToFacebook(
  pageId: string,
  accessToken: string,
  caption: string,
  mediaFiles: PublisherMedia[],
): Promise<string> {

  if (mediaFiles.length === 0) {
    const { data } = await axios.post(`${GRAPH_URL}/${pageId}/feed`, {
      message: caption,
      access_token: accessToken,
    });
    return data.id;
  }

  const images = mediaFiles.filter(m => m.mediaType === 'image');
  const videos = mediaFiles.filter(m => m.mediaType === 'video');

  if (videos.length > 0) {
    const video = videos[0];
    const { data } = await axios.post(`${GRAPH_URL}/${pageId}/videos`, {
      file_url: video.publicUrl,
      description: caption,
      access_token: accessToken,
    });
    return data.id;
  }

  if (images.length === 1) {
    const img = images[0];
    const { data } = await axios.post(`${GRAPH_URL}/${pageId}/photos`, {
      url: img.publicUrl,
      message: caption,
      access_token: accessToken,
    });
    return data.id;
  }

  // Multiple images: upload unpublished, then create combined post
  const photoIds: string[] = [];
  for (const img of images) {
    const { data } = await axios.post(`${GRAPH_URL}/${pageId}/photos`, {
      url: img.publicUrl,
      published: false,
      access_token: accessToken,
    });
    photoIds.push(data.id);
  }

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
