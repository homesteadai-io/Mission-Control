interface ImageGridArtifactProps {
  content: string;
}

interface ImageItem {
  src: string;
  label: string;
}

export function ImageGridArtifact({ content }: ImageGridArtifactProps) {
  const images = JSON.parse(content) as ImageItem[];

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
