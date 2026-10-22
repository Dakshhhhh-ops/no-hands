import { computeGraphLayout } from './graphLayout.ts';
import type { Project } from '../types/schema.ts';

const xml = (value: unknown): string => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const mermaidQuote = (value: unknown): string => JSON.stringify(String(value).replaceAll('"', "'"));

export function makeArchitectureMermaid(project: Project): string {
  const lines = ['flowchart LR'];
  for (const component of project.components) lines.push(`  ${component.id}[${mermaidQuote(`${component.name}<br/>${component.type}`)}]`);
  for (const edge of project.relationships) lines.push(`  ${edge.from} -->|${mermaidQuote(edge.label)}| ${edge.to}`);
  return `${lines.join('\n')}\n`;
}

export function makeArchitectureSvg(project: Project): string {
  const nodeWidth = 188;
  const nodeHeight = 76;
  const layout = computeGraphLayout(project.components, project.relationships, {
    direction: 'LR', nodeWidth, nodeHeight, rankSeparation: 86, nodeSeparation: 42, marginX: 38, marginY: 42,
  });
  const nodes = new Map(layout.components.map((component) => [component.id, component]));
  const edges = project.relationships.map((edge) => {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) return '';
    const x1 = from.x + nodeWidth;
    const y1 = from.y + nodeHeight / 2;
    const x2 = to.x;
    const y2 = to.y + nodeHeight / 2;
    const midpoint = (x1 + x2) / 2;
    return `<g class="edge"><path d="M ${x1} ${y1} C ${midpoint} ${y1}, ${midpoint} ${y2}, ${x2} ${y2}" marker-end="url(#arrow)"/><text x="${midpoint}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle">${xml(edge.label)}</text></g>`;
  }).join('\n');
  const components = layout.components.map((component) => {
    const fill = component.type === 'SERVICE' ? '#153039' : '#151e2d';
    const stroke = component.type === 'SERVICE' ? '#5de5e8' : '#48576b';
    return `<g class="node"><rect x="${component.x}" y="${component.y}" width="${nodeWidth}" height="${nodeHeight}" rx="12" fill="${fill}" stroke="${stroke}"/><text class="kind" x="${component.x + 14}" y="${component.y + 21}">${xml(component.type)}</text><text class="name" x="${component.x + 14}" y="${component.y + 44}">${xml(component.name)}</text><text class="sub" x="${component.x + 14}" y="${component.y + 63}">${xml(component.sub || '')}</text></g>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="${xml(project.name)} architecture diagram, model version ${project.version}"><defs><marker id="arrow" markerWidth="9" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#8ba0b8"/></marker><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#293548"/></pattern></defs><style>text{font-family:Inter,Arial,sans-serif;fill:#e7edf5}.edge path{fill:none;stroke:#8293aa;stroke-width:1.8}.edge text{font-size:11px;fill:#b3c4d7}.node .kind{font-size:9px;letter-spacing:1px;fill:#62dbe1}.node .name{font-size:14px;font-weight:700}.node .sub{font-size:10px;fill:#9eacc0}</style><rect width="100%" height="100%" fill="#0b111a"/><rect width="100%" height="100%" fill="url(#grid)"/>${edges}${components}</svg>`;
}

export async function renderArchitecturePng(project: Project): Promise<Uint8Array> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('PNG export requires a browser canvas.');
  const svg = makeArchitectureSvg(project);
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('The architecture SVG could not be rendered to PNG.'));
      image.src = svgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
    context.drawImage(image, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG encoding failed.')), 'image/png'));
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
