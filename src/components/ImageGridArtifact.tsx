interface ImageGridArtifactProps {
  content: string;
}

interface ImageItem {
  src: string;
  label: string;
}

export function ImageGridArtifact({ content }: ImageGridArtifactProps) {
  const parsedImages = parseImages(content);
  if (!parsedImages.ok) {
    return (
      <div className="artifact-parse-failure">
        <strong>Artifact could not render.</strong>
        <p>{parsedImages.message}</p>
        <pre>{content}</pre>
      </div>
    );
  }

  const images = parsedImages.images;
  return (
    <div className="image-grid">
      {images.map((image) => (
        <figure key={image.src}>
          <img src={image.src} alt={image.label} />
          <figcaption>{image.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function parseImages(content: string): { ok: true; images: ImageItem[] } | { ok: false; message: string } {
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed) || !parsed.every(isImageItem)) {
      return { ok: false, message: "Image grid content must be a JSON array of image items." };
    }
    return { ok: true, images: parsed as ImageItem[] };
  } catch {
    return { ok: false, message: "Image grid content is not valid JSON." };
  }
}

function isImageItem(value: unknown): value is ImageItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Partial<ImageItem>;
  return typeof item.src === "string" && typeof item.label === "string";
}
