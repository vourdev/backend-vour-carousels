export function slideFilename(index: number): string {
  return `slide_${String(index).padStart(2, "0")}.jpg`;
}

export function slideFilenames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => slideFilename(i + 1));
}
