import { slideFilenames } from "../export/filenames";

export function namedBlobs(blobs: Blob[]): { name: string; blob: Blob }[] {
  const names = slideFilenames(blobs.length);
  return blobs.map((blob, i) => ({ name: names[i], blob }));
}

export function downloadNamedBlobs(items: { name: string; blob: Blob }[]): void {
  for (const { name, blob } of items) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}
