export interface TileLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed: boolean;
}

export interface NoteMetadata {
  id: string;
  title: string;
  fileName: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
  preview: string;
  tileColor?: string;
  tileLayout?: TileLayout;
}

export interface Note extends Omit<NoteMetadata, "preview"> {
  content: string;
}

export interface SaveNoteRequest {
  title: string;
  content: string;
  category: string;
  tileColor?: string;
  tileLayout?: TileLayout;
}

export interface ExternalFile {
  id: string;
  title: string;
  filePath: string;
}
