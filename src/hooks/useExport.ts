import { useCallback, useRef, useState, useEffect } from 'react';
import type { Project } from '../types/schema.ts';
import { sound } from '../utils/sound.js';
import { createVerifiedExportZip, createVerifiedDevOpsZip } from '../data/export.js';
import { renderArchitecturePng, makeArchitectureSvg, makeArchitectureMermaid } from '../data/diagramExport.js';

interface ExportBundle {
  data: Uint8Array;
  files: string[];
}

interface UseExportReturn {
  exportOpen: boolean;
  setExportOpen: (_open: boolean) => void;
  exportMenuRef: React.RefObject<HTMLDivElement | null>;
  exportAll: () => Promise<void>;
  exportDevOps: () => Promise<void>;
  exportDiagram: (_format: 'svg' | 'png' | 'mermaid') => Promise<void>;
}

export function useExport(project: Project | null): UseExportReturn {
  const [exportOpen, setExportOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    function onPointer(e: MouseEvent) {
      if (!exportMenuRef.current?.contains(e.target as Node)) setExportOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setExportOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [exportOpen]);

  const downloadBundle = useCallback(async (
    factory: (_model: Project) => ExportBundle | Promise<ExportBundle>,
    suffix: string,
    label: string
  ) => {
    if (!project) {
      alert('Load a project before exporting.');
      return;
    }
    sound.export();
    setExportOpen(false);
    try {
      const { data, files } = await factory(project);
      const url = URL.createObjectURL(new Blob([data], { type: 'application/zip' }));
      const anchor = document.createElement('a');
      const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      anchor.href = url;
      anchor.download = `${slug}${suffix}-v${project.version}.zip`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      alert(`${label} downloaded (${files.length} files).`);
    } catch (error) {
      alert(`Export failed: ${error instanceof Error ? error.message : 'could not create the ZIP.'}`);
    }
  }, [project]);

  const exportAll = useCallback(async () => {
    await downloadBundle(
      async (model) => {
        const png = await renderArchitecturePng(model);
        return createVerifiedExportZip(model, undefined, png);
      },
      '',
      'Engineering artifacts'
    );
  }, [downloadBundle]);

  const exportDevOps = useCallback(async () => {
    await downloadBundle(createVerifiedDevOpsZip, '-devops', 'DevOps bundle');
  }, [downloadBundle]);

  const exportDiagram = useCallback(async (format: 'svg' | 'png' | 'mermaid') => {
    if (!project) return alert('Load a project before exporting its diagram.');
    try {
      sound.export();
      setExportOpen(false);
      const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const extension = format === 'mermaid' ? 'mmd' : format;
      const content = format === 'svg' ? makeArchitectureSvg(project)
        : format === 'mermaid' ? makeArchitectureMermaid(project)
          : await renderArchitecturePng(project);
      const blob = new Blob([content], {
        type: format === 'svg' ? 'image/svg+xml' : format === 'png' ? 'image/png' : 'text/plain'
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${slug}-architecture-v${project.version}.${extension}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      alert(`${format === 'mermaid' ? 'Mermaid' : format.toUpperCase()} diagram downloaded.`);
    } catch (error) {
      alert(`Diagram export failed: ${error instanceof Error ? error.message : 'could not render the diagram.'}`);
    }
  }, [project]);

  return {
    exportOpen,
    setExportOpen,
    exportMenuRef,
    exportAll,
    exportDevOps,
    exportDiagram,
  };
}