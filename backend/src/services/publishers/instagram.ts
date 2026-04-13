import axios from 'axios';

const GRAPH_URL = 'https://graph.facebook.com/v19.0';

// Instagram requires media to be at a public URL.
// We'll serve it temporarily from our backend.
function getPublicMediaUrl(mediaId: number, baseUrl: string): string {
  return `${baseUrl}/api/media/${mediaId}/file/watermarked`;
}

export async function publishToInstagram(
  igAccountId: string,
  accessToken: string,
  caption: string,
  mediaFiles: Array<{ id: number; watermarkedPath: string | null; originalPath: string; mediaType: string }>,
  baseUrl: string = 'http://localhost:3001',
): Promise<string> {

  if (mediaFiles.length === 0) {
    throw new Error('Instagram requires at least one image or video');
  }

  const images = mediaFiles.filter(m => m.mediaType === 'image');
  const videos = mediaFiles.filter(m => m.mediaType === 'video');

  if (mediaFiles.length === 1) {
    const file = mediaFiles[0];
    const mediaUrl = getPublicMediaUrl(file.id, baseUrl);

    if (file.mediaType === 'video') {
      // Video (Reel)
      const { data: container } = await axios.post(`${GRAPH_URL}/${igAccountId}/media`, {
        video_url: mediaUrl,
        caption,
        media_type: 'REELS',
        access_token: accessToken,
      });

      // Wait for processing
      await waitForIgProcessing(container.id, accessToken);

      const { data: published } = await axios.post(`${GRAPH_URL}/${igAccountId}/media_publish`, {
        creation_id: container.id,
        access_token: accessToken,
      });
      return published.id;
    }

    // Single image
    const { data: container } = await axios.post(`${GRAPH_URL}/${igAccountId}/media`, {
      image_url: mediaUrl,
      caption,
      access_token: accessToken,
    });

    const { data: published } = await axios.post(`${GRAPH_URL}/${igAccountId}/media_publish`, {
      creation_id: container.id,
      access_token: accessToken,
    });
    return published.id;
  }

  // Carousel (multiple images/videos)
  const childIds: string[] = [];
  for (const file of mediaFiles) {
    const mediaUrl = getPublicMediaUrl(file.id, baseUrl);
    const params: any = {
      is_carousel_item: true,
      access_token: accessToken,
    };

    if (file.mediaType === 'video') {
      params.video_url = mediaUrl;
      params.media_type = 'VIDEO';
    } else {
      params.image_url = mediaUrl;
    }

    const { data: child } = await axios.post(`${GRAPH_URL}/${igAccountId}/media`, params);

    if (file.mediaType === 'video') {
      await waitForIgProcessing(child.id, accessToken);
    }

    childIds.push(child.id);
  }

  // Create carousel container
  const { data: carousel } = await axios.post(`${GRAPH_URL}/${igAccountId}/media`, {
    media_type: 'CAROUSEL',
    caption,
    children: childIds.join(','),
    access_token: accessToken,
  });

  const { data: published } = await axios.post(`${GRAPH_URL}/${igAccountId}/media_publish`, {
    creation_id: carousel.id,
    access_token: accessToken,
  });
  return published.id;
}

async function waitForIgProcessing(containerId: string, accessToken: string, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await axios.get(`${GRAPH_URL}/${containerId}`, {
      params: { fields: 'status_code', access_token: accessToken },
    });

    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR') throw new Error('Instagram processing failed');

    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Instagram processing timed out');
}
